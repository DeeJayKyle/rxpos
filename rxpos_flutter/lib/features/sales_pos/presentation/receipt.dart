import 'dart:typed_data';

import 'package:flutter/material.dart';
import '../../../core/presentation/app_dialog.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/entities/sale.dart';
import '../../../core/entities/settings.dart';
import '../../../core/network/cloud_api.dart';
import '../../../core/rules/money.dart';
import '../../extras/domain/extras.dart';

// step 22: what an insurer is billed on a sale, and what the client still owes (shown on the receipt even after a
// refund, as before; src/pages/Sales.jsx billed / unpaid)
double _billed(Sale s) {
  final v = ((s.raw['insurance'] as Map?)?['share'] as num?)?.toDouble() ?? 0;
  return v > 0 ? v : 0;
}

double _unpaid(Sale s) => s.total - s.paid - _billed(s);

String _insuredLine(Sale s) {
  final i = s.raw['insurance'] as Map;
  return '${i['insurer']} (${i['scheme']}, member ${i['memberNo']})';
}

/// The receipt as plain text (WhatsApp, SMS), like src/pages/Sales.jsx receiptText.
String receiptText(Sale s, PharmacySettings st) {
  String fmt(num n) => formatMoney(n, currency: st.currency, decimals: st.decimalPlaces);
  final when = s.date.replaceFirst('T', ' ').split('.').first;
  final paid = s.paid;
  return [
    '*${st.name.isEmpty ? 'Pharmacy' : st.name}*',
    if (st.address.isNotEmpty) st.address,
    if (st.phone.isNotEmpty) 'Tel: ${st.phone}',
    'Receipt ${s.number} · ${when.length > 16 ? when.substring(0, 16) : when}',
    if (s.customerName.isNotEmpty && s.customerName != 'Walk-in Customer') 'Customer: ${s.customerName}',
    '--------------------------------',
    for (final i in s.items) '${formatQty(i.qty)} × ${i.name} — ${fmt(i.qty * i.price)}',
    '--------------------------------',
    if (s.discount > 0) 'Subtotal: ${fmt(s.subtotal)}',
    if (s.discount > 0) 'Discount: -${fmt(s.discount)}',
    if (s.tax > 0) 'Tax: ${fmt(s.tax)}',
    '*TOTAL: ${fmt(s.total)}*',
    'Paid (${s.payment}): ${fmt(paid)}',
    if (s.raw['insurance'] is Map) '${_insuredLine(s)}: ${fmt(_billed(s))}',
    if (_unpaid(s) > 0.005) 'Balance: ${fmt(_unpaid(s))}',
    '',
    '${st.raw['receiptFooter'] ?? ''}'.isEmpty ? 'Thank you. Get well soon!' : '${st.raw['receiptFooter']}',
  ].join('\n');
}

/// An 80 mm roll receipt as a PDF (printed on any Windows printer or Android print service, or shared).
Future<Uint8List> receiptPdf(Sale s, PharmacySettings st) async {
  String fmt(num n) => formatMoney(n, currency: st.currency, decimals: st.decimalPlaces);
  final proforma = s.raw['proforma'] == true || s.number.startsWith('PF');
  final tin = '${st.raw['tin'] ?? ''}';
  final doc = pw.Document();
  pw.Widget row(String a, String b, {bool bold = false}) => pw.Row(
    children: [
      pw.Expanded(
        child: pw.Text(a, style: pw.TextStyle(fontWeight: bold ? pw.FontWeight.bold : null)),
      ),
      pw.Text(b, style: pw.TextStyle(fontWeight: bold ? pw.FontWeight.bold : null)),
    ],
  );
  doc.addPage(
    pw.Page(
      pageFormat: PdfPageFormat.roll80,
      build: (_) => pw.Column(
        crossAxisAlignment: pw.CrossAxisAlignment.stretch,
        children: [
          pw.Text(
            st.name,
            textAlign: pw.TextAlign.center,
            style: pw.TextStyle(fontSize: 14, fontWeight: pw.FontWeight.bold),
          ),
          if (st.address.isNotEmpty) pw.Text(st.address, textAlign: pw.TextAlign.center),
          if (st.phone.isNotEmpty) pw.Text('Tel: ${st.phone}', textAlign: pw.TextAlign.center),
          if (tin.isNotEmpty) pw.Text('TIN: $tin', textAlign: pw.TextAlign.center),
          if (proforma) pw.Text('PROFORMA INVOICE', textAlign: pw.TextAlign.center, style: pw.TextStyle(fontWeight: pw.FontWeight.bold)),
          pw.SizedBox(height: 6),
          pw.Text('${proforma ? 'Proforma' : 'Receipt'} ${s.number}'),
          pw.Text(s.date.replaceFirst('T', ' ').split('.').first),
          pw.Text('${proforma ? 'Prepared by' : 'Served by'} ${s.cashier.isEmpty ? '${s.raw['createdBy'] ?? ''}' : s.cashier}'),
          if (s.customerName.isNotEmpty && s.customerName != 'Walk-in Customer') pw.Text('Customer: ${s.customerName}'),
          pw.Divider(),
          for (final i in s.items) ...[
            pw.Text(i.name),
            row(
              i.pack != null
                  ? '  ${formatQty(i.pack!.count)} × ${i.pack!.name} (${formatQty(i.pack!.size)}) @ ${fmt(i.pack!.price)}'
                  : '  ${formatQty(i.qty)} @ ${fmt(i.price)}',
              fmt(i.price * i.qty),
            ),
            if (i.alloc.length == 1 && i.alloc.first.batch.isNotEmpty || i.alloc.isNotEmpty && i.alloc.first.expiry.isNotEmpty)
              pw.Text('  ${[if (i.alloc.length == 1 && i.alloc.first.batch.isNotEmpty) 'B/N ${i.alloc.first.batch}', if (i.alloc.first.expiry.isNotEmpty) 'Exp ${i.alloc.first.expiry}'].join(' · ')}', style: const pw.TextStyle(fontSize: 8)),
            if (i.directions != null)
              pw.Text('  ${[i.directions!['dose'], i.directions!['freq'], if ('${i.directions!['days'] ?? ''}'.isNotEmpty) 'for ${i.directions!['days']} days'].where((x) => x != null && '$x'.isNotEmpty).join(' ')}${(i.directions!['notes'] as List?)?.isNotEmpty == true ? ' · ${(i.directions!['notes'] as List).join(', ')}' : ''}', style: const pw.TextStyle(fontSize: 8)),
          ],
          pw.Divider(),
          row('Subtotal', fmt(s.subtotal)),
          if (s.discount > 0) row('Discount', '−${fmt(s.discount)}'),
          if (s.tax > 0) row('Tax', fmt(s.tax)),
          row('Total', fmt(s.total), bold: true),
          if (!proforma) row('Paid (${s.payment})', fmt(s.paid)),
          if (!proforma && s.tendered > s.paid) row('Change', fmt(s.tendered - s.paid)),
          if (!proforma && s.raw['insurance'] is Map) row(_insuredLine(s), fmt(_billed(s))),
          if (!proforma && _unpaid(s) > 0.005) row('Balance on credit', fmt(_unpaid(s)), bold: true),
          if (s.raw['momo'] case final Map m)
            pw.Text(
              'Mobile Money ${m['txid'] ?? m['ref'] ?? ''} (${m['confirmed'] == true ? 'confirmed by ${m['provider'] == 'airtel' ? 'Airtel' : 'MTN'}' : 'recorded by staff'})',
            ),
          pw.SizedBox(height: 8),
          if (s.status == 'refunded') pw.Text('REFUNDED', textAlign: pw.TextAlign.center, style: pw.TextStyle(fontWeight: pw.FontWeight.bold)),
          pw.BarcodeWidget(barcode: pw.Barcode.code128(), data: s.number, height: 34, drawText: false),
          pw.SizedBox(height: 4),
          pw.Text(proforma ? 'Prices valid for 7 days.' : '${st.raw['receiptFooter'] ?? ''}'.isEmpty ? 'Thank you' : '${st.raw['receiptFooter']}', textAlign: pw.TextAlign.center),
        ],
      ),
    ),
  );
  return doc.save();
}

/// After a sale: the receipt, with Print, PDF and WhatsApp / SMS to the client's phone. Prints by itself when the
/// pharmacy has "Print the receipt automatically" on (like the React till).
Future<void> showReceipt(BuildContext context, Map<String, Object?> record, PharmacySettings st, {String phone = '', bool autoPrint = false}) {
  final s = Sale.fromRecord(record);
  if (autoPrint) Printing.layoutPdf(onLayout: (_) => receiptPdf(s, st), name: s.number).ignore();
  return showAppDialog<void>(
    context: context,
    builder: (c) => _ReceiptDialog(s: s, st: st, phone: phone),
  );
}

class _ReceiptDialog extends ConsumerStatefulWidget {
  const _ReceiptDialog({required this.s, required this.st, required this.phone});
  final Sale s;
  final PharmacySettings st;
  final String phone;
  @override
  ConsumerState<_ReceiptDialog> createState() => _ReceiptDialogState();
}

class _ReceiptDialogState extends ConsumerState<_ReceiptDialog> {
  late final _phone = TextEditingController(text: widget.phone);
  bool _sms = false;
  String _sent = '';

  @override
  void initState() {
    super.initState();
    ref.read(cloudApiProvider).config().then((c) {
      if (mounted) setState(() => _sms = c['sms'] == true);
    }, onError: (_) {});
  }

  @override
  Widget build(BuildContext context) {
    final s = widget.s, st = widget.st;
    String fmt(num n) => formatMoney(n, currency: st.currency, decimals: st.decimalPlaces);
    final wa = normalizePhone(_phone.text);
    final text = receiptText(s, st);
    return AlertDialog(
      title: Row(children: [
        Icon(Icons.check_circle, color: Colors.green.shade600),
        const SizedBox(width: 10),
        const Flexible(child: Text('Sale complete')),
      ]),
      content: SizedBox(
        width: 380,
        child: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Receipt ${s.number}', style: const TextStyle(fontWeight: FontWeight.w700)),
              const Divider(),
              for (final i in s.items)
                Row(
                  children: [
                    Expanded(child: Text('${i.name}  ×${i.pack != null ? '${formatQty(i.pack!.count)} ${i.pack!.name}' : formatQty(i.qty)}')),
                    Text(fmt(i.price * i.qty)),
                  ],
                ),
              const Divider(),
              Row(
                children: [
                  const Expanded(
                    child: Text('Total', style: TextStyle(fontWeight: FontWeight.w800)),
                  ),
                  Text(fmt(s.total), style: const TextStyle(fontWeight: FontWeight.w800)),
                ],
              ),
              if (s.tendered > s.paid) Text('Change ${fmt(s.tendered - s.paid)}', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
              if (s.raw['insurance'] is Map) Text('Billed to ${_insuredLine(s)}: ${fmt(_billed(s))}'),
              if (_unpaid(s) > 0.005) Text('Balance on credit ${fmt(_unpaid(s))}'),
              const SizedBox(height: 12),
              const Text('Send the receipt to the customer', style: TextStyle(fontSize: 12)),
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      key: const Key('receipt-phone'),
                      controller: _phone,
                      keyboardType: TextInputType.phone,
                      decoration: const InputDecoration(hintText: 'Customer phone e.g. 0772 123 456', isDense: true),
                      onChanged: (_) => setState(() {}),
                    ),
                  ),
                  IconButton(
                    tooltip: 'WhatsApp',
                    icon: const Icon(Icons.chat_outlined),
                    onPressed: wa.length < 12
                        ? null
                        : () {
                            launchUrl(Uri.parse(whatsappLink(wa, text)), mode: LaunchMode.externalApplication);
                            setState(() => _sent = 'wa');
                          },
                  ),
                  IconButton(
                    tooltip: _sms ? 'SMS' : 'SMS is not set up yet (Settings → Online & Mobile Money)',
                    icon: const Icon(Icons.sms_outlined),
                    onPressed: !_sms || wa.length < 12
                        ? null
                        : () async {
                            try {
                              await ref.read(cloudApiProvider).sendSms([wa], text);
                              if (mounted) setState(() => _sent = 'sms');
                            } catch (e) {
                              if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e'.replaceFirst('Exception: ', ''))));
                            }
                          },
                  ),
                ],
              ),
              if (_sent.isNotEmpty)
                Row(children: [
                  Icon(Icons.check_circle, size: 18, color: Colors.green.shade700),
                  const SizedBox(width: 6),
                  Flexible(child: Text(_sent == 'sms' ? 'Sent by SMS' : 'Opened WhatsApp with the receipt', style: TextStyle(color: Colors.green.shade700))),
                ]),
            ],
          ),
        ),
      ),
      actions: [
        TextButton.icon(
          onPressed: () async => Printing.layoutPdf(onLayout: (_) => receiptPdf(s, st)),
          icon: const Icon(Icons.print),
          label: const Text('Print'),
        ),
        TextButton.icon(
          onPressed: () async => Printing.sharePdf(bytes: await receiptPdf(s, st), filename: '${s.number}.pdf'),
          icon: const Icon(Icons.picture_as_pdf),
          label: const Text('PDF'),
        ),
        FilledButton(onPressed: () => Navigator.pop(context), child: const Text('New sale')),
      ],
    );
  }
}

/// A full-page (A4) invoice for a sale: for insurers, companies and anyone who needs more than a till slip
/// (src/pages/Sales.jsx SaleInvoice).
Future<Uint8List> invoicePdf(Sale s, PharmacySettings st, {String customerPhone = '', String customerAddress = ''}) async {
  String fmt(num n) => formatMoney(n, currency: st.currency, decimals: st.decimalPlaces);
  final due = _unpaid(s);
  final momo = s.raw['momo'] is Map ? (s.raw['momo'] as Map) : null;
  final tin = '${st.raw['tin'] ?? ''}', footer = '${st.raw['receiptFooter'] ?? ''}';
  pw.Widget row(String a, String b, {bool bold = false}) => pw.Row(mainAxisAlignment: pw.MainAxisAlignment.spaceBetween, children: [
        pw.Text(a, style: pw.TextStyle(fontWeight: bold ? pw.FontWeight.bold : null)),
        pw.Text(b, style: pw.TextStyle(fontWeight: bold ? pw.FontWeight.bold : null)),
      ]);
  final doc = pw.Document()
    ..addPage(pw.MultiPage(
      pageFormat: PdfPageFormat.a4,
      margin: const pw.EdgeInsets.all(16 * PdfPageFormat.mm),
      build: (_) => [
        pw.Row(crossAxisAlignment: pw.CrossAxisAlignment.start, children: [
          pw.Expanded(child: pw.Column(crossAxisAlignment: pw.CrossAxisAlignment.start, children: [
            pw.Text(st.name, style: pw.TextStyle(fontSize: 16, fontWeight: pw.FontWeight.bold)),
            if (st.address.isNotEmpty) pw.Text(st.address),
            if (st.phone.isNotEmpty) pw.Text('Tel: ${st.phone}'),
            if (tin.isNotEmpty) pw.Text('TIN: $tin'),
          ])),
          pw.Column(crossAxisAlignment: pw.CrossAxisAlignment.end, children: [
            pw.Text('INVOICE', style: pw.TextStyle(fontSize: 20, fontWeight: pw.FontWeight.bold)),
            pw.Text('No. ${s.number}'),
            pw.Text('Date: ${s.date.replaceFirst('T', ' ').split('.').first}'),
            pw.Text('Served by: ${s.cashier}'),
            if (s.status == 'refunded') pw.Text('REFUNDED', style: pw.TextStyle(fontWeight: pw.FontWeight.bold, color: PdfColors.red)),
          ]),
        ]),
        pw.SizedBox(height: 14),
        pw.Text('Bill to', style: const pw.TextStyle(fontSize: 9, color: PdfColors.grey700)),
        pw.Text(s.customerName.isEmpty ? 'Walk-in customer' : s.customerName, style: pw.TextStyle(fontWeight: pw.FontWeight.bold)),
        if (customerPhone.isNotEmpty) pw.Text('Tel: $customerPhone'),
        if (customerAddress.isNotEmpty) pw.Text(customerAddress),
        pw.SizedBox(height: 10),
        pw.TableHelper.fromTextArray(
          headers: ['#', 'Description', 'Batch / expiry', 'Qty', 'Unit price', 'Amount'],
          data: [
            for (var n = 0; n < s.items.length; n++)
              [
                '${n + 1}', s.items[n].name,
                s.items[n].alloc.map((a) => [a.batch, a.expiry].where((x) => x.isNotEmpty).join(' · ')).where((x) => x.isNotEmpty).join(', ').ifBlankDash,
                formatQty(s.items[n].qty), fmt(s.items[n].price), fmt(s.items[n].qty * s.items[n].price),
              ],
          ],
          headerStyle: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 9),
          cellStyle: const pw.TextStyle(fontSize: 9),
          cellAlignments: {3: pw.Alignment.centerRight, 4: pw.Alignment.centerRight, 5: pw.Alignment.centerRight},
        ),
        pw.SizedBox(height: 10),
        pw.Align(
          alignment: pw.Alignment.centerRight,
          child: pw.SizedBox(width: 240, child: pw.Column(children: [
            row('Subtotal', fmt(s.subtotal)),
            if (s.discount > 0) row('Discount', '-${fmt(s.discount)}'),
            if (s.tax > 0) row('Tax', fmt(s.tax)),
            row('Total', fmt(s.total), bold: true),
            row('Paid (${s.payment}${momo?['txid'] != null && '${momo!['txid']}'.isNotEmpty ? ' · ref ${momo['txid']}' : ''})', fmt(s.paid)),
            if (s.raw['insurance'] is Map) row('Billed to ${_insuredLine(s)}', fmt(_billed(s))),
            if (due > 0) row('Balance due', fmt(due), bold: true),
          ])),
        ),
        if (momo != null) pw.Text(momo['confirmed'] == true ? 'Payment confirmed by the mobile network.' : 'Payment recorded by staff (not confirmed by the mobile network).', style: const pw.TextStyle(fontSize: 9)),
        pw.SizedBox(height: 40),
        pw.Row(mainAxisAlignment: pw.MainAxisAlignment.spaceBetween, children: [pw.Text('Received by ____________________'), pw.Text('Signature & stamp ____________________')]),
        if (footer.isNotEmpty) pw.Padding(padding: const pw.EdgeInsets.only(top: 16), child: pw.Center(child: pw.Text(footer, style: const pw.TextStyle(fontSize: 9)))),
      ],
    ));
  return doc.save();
}

extension on String {
  String get ifBlankDash => trim().isEmpty ? '—' : this;
}

import 'dart:typed_data';

import 'package:flutter/material.dart';
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

/// The receipt as plain text (WhatsApp, SMS), like src/pages/Sales.jsx receiptText.
String receiptText(Sale s, PharmacySettings st) {
  String fmt(num n) => formatMoney(n, currency: st.currency, decimals: st.decimalPlaces);
  final b = StringBuffer()
    ..writeln(st.name)
    ..writeln('Receipt ${s.number} · ${s.date.length >= 16 ? s.date.substring(0, 16).replaceFirst('T', ' ') : s.date}');
  for (final i in s.items) {
    final qty = i.pack != null ? '${formatQty(i.pack!.count)} × ${i.pack!.name} (${formatQty(i.pack!.size)})' : formatQty(i.qty);
    b.writeln('${i.name}  $qty  ${fmt(i.price * i.qty)}');
  }
  if (s.discount > 0) b.writeln('Discount −${fmt(s.discount)}');
  if (s.tax > 0) b.writeln('Tax ${fmt(s.tax)}');
  b
    ..writeln('Total ${fmt(s.total)}')
    ..writeln('Paid by ${s.payment}');
  if (s.paid < s.total) b.writeln('Balance on credit ${fmt(s.total - s.paid)}');
  b.writeln('Thank you · ${st.phone}');
  return b.toString().trim();
}

/// An 80 mm roll receipt as a PDF (printed on any Windows printer or Android print service, or shared).
Future<Uint8List> receiptPdf(Sale s, PharmacySettings st) async {
  String fmt(num n) => formatMoney(n, currency: st.currency, decimals: st.decimalPlaces);
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
          if (st.phone.isNotEmpty) pw.Text(st.phone, textAlign: pw.TextAlign.center),
          pw.SizedBox(height: 6),
          pw.Text('Receipt ${s.number}'),
          pw.Text(s.date.replaceFirst('T', ' ').split('.').first),
          pw.Text('Served by ${s.cashier} · ${s.customerName}'),
          pw.Divider(),
          for (final i in s.items) ...[
            pw.Text(i.name),
            row(
              i.pack != null
                  ? '  ${formatQty(i.pack!.count)} × ${i.pack!.name} (${formatQty(i.pack!.size)}) @ ${fmt(i.pack!.price)}'
                  : '  ${formatQty(i.qty)} @ ${fmt(i.price)}',
              fmt(i.price * i.qty),
            ),
          ],
          pw.Divider(),
          row('Subtotal', fmt(s.subtotal)),
          if (s.discount > 0) row('Discount', '−${fmt(s.discount)}'),
          if (s.tax > 0) row('Tax', fmt(s.tax)),
          row('Total', fmt(s.total), bold: true),
          row('Paid (${s.payment})', fmt(s.paid)),
          if (s.tendered > s.total) row('Change', fmt(s.tendered - s.total)),
          if (s.paid < s.total) row('Balance on credit', fmt(s.total - s.paid), bold: true),
          if (s.raw['momo'] case final Map m)
            pw.Text(
              'Mobile Money ${m['txid'] ?? m['ref'] ?? ''} (${m['confirmed'] == true ? 'confirmed by ${m['provider'] == 'airtel' ? 'Airtel' : 'MTN'}' : 'recorded by staff'})',
            ),
          pw.SizedBox(height: 8),
          pw.Text('Thank you', textAlign: pw.TextAlign.center),
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
  return showDialog<void>(
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
      title: const Text('Sale complete ✓'),
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
              if (s.tendered > s.total) Text('Change ${fmt(s.tendered - s.total)}', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
              if (s.paid < s.total) Text('Balance on credit ${fmt(s.total - s.paid)}'),
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
              if (_sent.isNotEmpty) Text(_sent == 'sms' ? '✓ Sent by SMS' : '✓ Opened WhatsApp with the receipt', style: const TextStyle(color: Colors.green)),
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

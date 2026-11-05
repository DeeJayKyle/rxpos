import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/entities/sale.dart';
import '../../../core/entities/settings.dart';
import '../../../core/rules/money.dart';

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
  pw.Widget row(String a, String b, {bool bold = false}) => pw.Row(children: [
        pw.Expanded(child: pw.Text(a, style: pw.TextStyle(fontWeight: bold ? pw.FontWeight.bold : null))),
        pw.Text(b, style: pw.TextStyle(fontWeight: bold ? pw.FontWeight.bold : null)),
      ]);
  doc.addPage(pw.Page(
    pageFormat: PdfPageFormat.roll80,
    build: (_) => pw.Column(crossAxisAlignment: pw.CrossAxisAlignment.stretch, children: [
      pw.Text(st.name, textAlign: pw.TextAlign.center, style: pw.TextStyle(fontSize: 14, fontWeight: pw.FontWeight.bold)),
      if (st.address.isNotEmpty) pw.Text(st.address, textAlign: pw.TextAlign.center),
      if (st.phone.isNotEmpty) pw.Text(st.phone, textAlign: pw.TextAlign.center),
      pw.SizedBox(height: 6),
      pw.Text('Receipt ${s.number}'),
      pw.Text(s.date.replaceFirst('T', ' ').split('.').first),
      pw.Text('Served by ${s.cashier} · ${s.customerName}'),
      pw.Divider(),
      for (final i in s.items) ...[
        pw.Text(i.name),
        row(i.pack != null ? '  ${formatQty(i.pack!.count)} × ${i.pack!.name} (${formatQty(i.pack!.size)}) @ ${fmt(i.pack!.price)}' : '  ${formatQty(i.qty)} @ ${fmt(i.price)}', fmt(i.price * i.qty)),
      ],
      pw.Divider(),
      row('Subtotal', fmt(s.subtotal)),
      if (s.discount > 0) row('Discount', '−${fmt(s.discount)}'),
      if (s.tax > 0) row('Tax', fmt(s.tax)),
      row('Total', fmt(s.total), bold: true),
      row('Paid (${s.payment})', fmt(s.paid)),
      if (s.tendered > s.total) row('Change', fmt(s.tendered - s.total)),
      if (s.paid < s.total) row('Balance on credit', fmt(s.total - s.paid), bold: true),
      if (s.raw['momo'] case final Map m) pw.Text('Mobile Money ${m['txid']} (recorded by staff)'),
      pw.SizedBox(height: 8),
      pw.Text('Thank you', textAlign: pw.TextAlign.center),
    ]),
  ));
  return doc.save();
}

/// After a sale: the receipt, with Print, PDF and WhatsApp.
Future<void> showReceipt(BuildContext context, Map<String, Object?> record, PharmacySettings st) {
  final s = Sale.fromRecord(record);
  String fmt(num n) => formatMoney(n, currency: st.currency, decimals: st.decimalPlaces);
  return showDialog<void>(
    context: context,
    builder: (c) => AlertDialog(
      title: const Text('Sale complete ✓'),
      content: SizedBox(
        width: 380,
        child: SingleChildScrollView(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('Receipt ${s.number}', style: const TextStyle(fontWeight: FontWeight.w700)),
          const Divider(),
          for (final i in s.items)
            Row(children: [
              Expanded(child: Text('${i.name}  ×${i.pack != null ? '${formatQty(i.pack!.count)} ${i.pack!.name}' : formatQty(i.qty)}')),
              Text(fmt(i.price * i.qty)),
            ]),
          const Divider(),
          Row(children: [const Expanded(child: Text('Total', style: TextStyle(fontWeight: FontWeight.w800))), Text(fmt(s.total), style: const TextStyle(fontWeight: FontWeight.w800))]),
          if (s.tendered > s.total) Text('Change ${fmt(s.tendered - s.total)}', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
          if (s.paid < s.total) Text('Balance on credit ${fmt(s.total - s.paid)}'),
        ])),
      ),
      actions: [
        TextButton.icon(onPressed: () async => Printing.layoutPdf(onLayout: (_) => receiptPdf(s, st)), icon: const Icon(Icons.print), label: const Text('Print')),
        TextButton.icon(onPressed: () async => Printing.sharePdf(bytes: await receiptPdf(s, st), filename: '${s.number}.pdf'), icon: const Icon(Icons.picture_as_pdf), label: const Text('PDF')),
        TextButton.icon(
          onPressed: () => launchUrl(Uri.parse('https://wa.me/?text=${Uri.encodeComponent(receiptText(s, st))}'), mode: LaunchMode.externalApplication),
          icon: const Icon(Icons.chat_outlined), label: const Text('WhatsApp'),
        ),
        FilledButton(onPressed: () => Navigator.pop(c), child: const Text('New sale')),
      ],
    ),
  );
}

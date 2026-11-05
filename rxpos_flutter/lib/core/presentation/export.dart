// Exporting what a screen shows, like the React app's CSV and PDF buttons (src/store.jsx toCSV, src/pdf.js pagePdf):
// a CSV file, or an A4 PDF with the pharmacy's name, the title, a subtitle and the table (landscape when wide).
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:path_provider/path_provider.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';

import '../entities/settings.dart';
import 'widgets.dart';

/// Rows as CSV: the first row's keys are the columns, every value quoted (the same text as the React app).
String toCsv(List<Map<String, Object?>> rows) {
  if (rows.isEmpty) return '';
  final cols = rows.first.keys.toList();
  String esc(Object? v) => '"${'${v ?? ''}'.replaceAll('"', '""')}"';
  return [cols.join(','), for (final r in rows) cols.map((c) => esc(r[c])).join(',')].join('\n');
}

/// A table for a PDF: [numeric] columns are right-aligned; [foot] is the totals row.
class PdfTable {
  const PdfTable({required this.head, required this.body, this.numeric = const [], this.foot, this.heading});
  final List<String> head;
  final List<List<String>> body;
  final List<int> numeric;
  final List<String>? foot;
  final String? heading;
}

Future<Uint8List> tablesPdf(PharmacySettings s, {required String title, String subtitle = '', required List<PdfTable> tables, bool? landscape, DateTime? printed}) {
  final wide = landscape ?? tables.any((t) => t.head.length > 7);
  final doc = pw.Document();
  final when = printed ?? DateTime.now();
  final teal = PdfColor.fromInt(0xFF0D9488);
  doc.addPage(pw.MultiPage(
    pageFormat: wide ? PdfPageFormat.a4.landscape : PdfPageFormat.a4,
    margin: const pw.EdgeInsets.all(12 * PdfPageFormat.mm),
    header: (_) => pw.Column(crossAxisAlignment: pw.CrossAxisAlignment.start, children: [
      pw.Row(children: [
        pw.Expanded(child: pw.Text(s.name.isEmpty ? 'RxPOS' : s.name, style: pw.TextStyle(fontSize: 14, fontWeight: pw.FontWeight.bold))),
        pw.Text('Printed ${when.toString().substring(0, 16)}', style: const pw.TextStyle(fontSize: 8, color: PdfColors.grey700)),
      ]),
      pw.Text([s.address, if (s.phone.isNotEmpty) 'Tel: ${s.phone}'].where((x) => x.isNotEmpty).join(' · '), style: const pw.TextStyle(fontSize: 9, color: PdfColors.grey700)),
      pw.SizedBox(height: 6),
    ]),
    footer: (c) => pw.Align(alignment: pw.Alignment.centerRight, child: pw.Text('Page ${c.pageNumber} of ${c.pagesCount}', style: const pw.TextStyle(fontSize: 8, color: PdfColors.grey700))),
    build: (_) => [
      pw.Text(title, style: pw.TextStyle(fontSize: 12, fontWeight: pw.FontWeight.bold)),
      if (subtitle.isNotEmpty) pw.Text(subtitle, style: const pw.TextStyle(fontSize: 9, color: PdfColors.grey700)),
      pw.SizedBox(height: 6),
      for (final t in tables) ...[
        if (t.heading != null) pw.Padding(padding: const pw.EdgeInsets.only(top: 6, bottom: 3), child: pw.Text(t.heading!, style: pw.TextStyle(fontWeight: pw.FontWeight.bold))),
        pw.TableHelper.fromTextArray(
          headers: t.head,
          data: [...t.body, ?t.foot],
          headerStyle: pw.TextStyle(color: PdfColors.white, fontWeight: pw.FontWeight.bold, fontSize: 8),
          headerDecoration: pw.BoxDecoration(color: teal),
          cellStyle: const pw.TextStyle(fontSize: 8),
          cellPadding: const pw.EdgeInsets.all(3),
          border: const pw.TableBorder(horizontalInside: pw.BorderSide(color: PdfColors.grey300, width: .3)),
          cellAlignments: {for (final i in t.numeric) i: pw.Alignment.centerRight},
        ),
      ],
      if (tables.every((t) => t.body.isEmpty)) pw.Text('Nothing to show', style: const pw.TextStyle(color: PdfColors.grey700)),
    ],
  ));
  return doc.save();
}

/// Save a file in this device's Downloads folder (Windows) or the app's downloads folder (Android) and say where.
Future<File> saveDownload(String filename, List<int> bytes) async {
  final dir = await getDownloadsDirectory() ?? await getApplicationDocumentsDirectory();
  final f = File('${dir.path}${Platform.pathSeparator}$filename');
  await f.writeAsBytes(bytes, flush: true);
  return f;
}

/// "CSV" and "PDF" buttons for a screen's table.
class ExportButtons extends StatelessWidget {
  const ExportButtons({super.key, required this.name, required this.settings, this.csv, this.pdf, this.title = '', this.subtitle = ''});
  /// file name without the extension
  final String name;
  final PharmacySettings settings;
  final List<Map<String, Object?>> Function()? csv;
  final List<PdfTable> Function()? pdf;
  final String title, subtitle;

  @override
  Widget build(BuildContext context) => Row(mainAxisSize: MainAxisSize.min, children: [
        if (csv != null)
          OutlinedButton.icon(
            onPressed: () async {
              try {
                final f = await saveDownload('$name.csv', utf8.encode(toCsv(csv!())));
                if (context.mounted) say(context, 'Saved ${f.path}');
              } catch (e) {
                if (context.mounted) say(context, 'Could not save the file: $e', error: true);
              }
            },
            icon: const Icon(Icons.download, size: 18),
            label: const Text('CSV'),
          ),
        if (pdf != null) ...[
          const SizedBox(width: 8),
          OutlinedButton.icon(
            onPressed: () async => Printing.sharePdf(bytes: await tablesPdf(settings, title: title.isEmpty ? name : title, subtitle: subtitle, tables: pdf!()), filename: '$name.pdf'),
            icon: const Icon(Icons.picture_as_pdf_outlined, size: 18),
            label: const Text('PDF'),
          ),
        ],
      ]);
}

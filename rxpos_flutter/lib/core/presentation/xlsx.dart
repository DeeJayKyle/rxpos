// Excel (.xlsx) files from a table: the same rows the CSV export takes (a list of records with the same keys), one
// sheet with a bold header row that stays in view, filters on every column, numbers kept as numbers (so totals and
// sorting work in Excel) and columns sized to their contents. Written as Office Open XML in a zip, with no dependency
// beyond the archive package; read back by the import's reader (import_sheet.dart readXlsx).
import 'dart:convert';
import 'dart:math';
import 'dart:typed_data';

import 'package:archive/archive.dart';

/// The workbook for [rows] (keys of the first rows make the header, in order); [sheet] names its one sheet.
Uint8List toXlsx(List<Map<String, Object?>> rows, {String sheet = 'Sheet1'}) {
  final keys = <String>[];
  for (final r in rows) {
    for (final k in r.keys) {
      if (!keys.contains(k)) keys.add(k);
    }
  }
  String col(int i) {
    var n = i + 1, s = '';
    while (n > 0) {
      final m = (n - 1) % 26;
      s = String.fromCharCode(65 + m) + s;
      n = (n - 1) ~/ 26;
    }
    return s;
  }

  String esc(String v) => v
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll(RegExp(r'[\x00-\x08\x0B\x0C\x0E-\x1F]'), '');
  String cell(String ref, Object? v, {bool head = false}) {
    if (v == null || v == '') return '';
    if (!head && v is num && v.isFinite) return '<c r="$ref" s="2"><v>$v</v></c>';
    if (!head && v is bool) return '<c r="$ref" t="b"><v>${v ? 1 : 0}</v></c>';
    final text = v is List || v is Map ? jsonEncode(v) : '$v';
    // a formula-looking text is kept as text (no formula injection when the file is opened)
    final safe = RegExp(r'^[=+\-@]').hasMatch(text) && !head ? "'$text" : text;
    return '<c r="$ref" t="inlineStr"${head ? ' s="1"' : ''}><is><t xml:space="preserve">${esc(safe)}</t></is></c>';
  }

  final widths = [for (final k in keys) k.length.toDouble()];
  final body = StringBuffer();
  body.write('<row r="1">');
  for (var c = 0; c < keys.length; c++) {
    body.write(cell('${col(c)}1', keys[c], head: true));
  }
  body.write('</row>');
  for (var r = 0; r < rows.length; r++) {
    body.write('<row r="${r + 2}">');
    for (var c = 0; c < keys.length; c++) {
      final v = rows[r][keys[c]];
      widths[c] = max(widths[c], (v is num ? v.toStringAsFixed(v == v.roundToDouble() ? 0 : 2) : '${v ?? ''}').length.toDouble());
      body.write(cell('${col(c)}${r + 2}', v));
    }
    body.write('</row>');
  }
  final last = keys.isEmpty ? 'A1' : '${col(keys.length - 1)}${rows.length + 1}';
  final cols = keys.isEmpty ? '' : '<cols>${[for (var c = 0; c < keys.length; c++) '<col min="${c + 1}" max="${c + 1}" width="${min(60, widths[c] + 3).toStringAsFixed(1)}" customWidth="1"/>'].join()}</cols>';
  final sheetXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
      '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
      '$cols<sheetData>$body</sheetData>${keys.isEmpty ? '' : '<autoFilter ref="A1:$last"/>'}</worksheet>';
  final name = esc(sheet.replaceAll(RegExp(r'[\[\]\*\?/\\:]'), ' ').trim().isEmpty ? 'Sheet1' : sheet.replaceAll(RegExp(r'[\[\]\*\?/\\:]'), ' ').trim());
  final files = <String, String>{
    '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
        '</Types>',
    '_rels/.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
        '</Relationships>',
    'xl/workbook.xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        '<sheets><sheet name="${name.length > 31 ? name.substring(0, 31) : name}" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
        '</Relationships>',
    // styles: 0 normal, 1 bold header on a light fill, 2 numbers with thousands separators
    'xl/styles.xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        '<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.##"/></numFmts>'
        '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>'
        '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>'
        '<fill><patternFill patternType="solid"><fgColor rgb="FFE7F1EA"/><bgColor indexed="64"/></patternFill></fill></fills>'
        '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
        '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
        '<cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
        '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>'
        '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs>'
        '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
        '</styleSheet>',
    'xl/worksheets/sheet1.xml': sheetXml,
  };
  final archive = Archive();
  for (final e in files.entries) {
    final data = utf8.encode(e.value);
    archive.addFile(ArchiveFile(e.key, data.length, data));
  }
  return Uint8List.fromList(ZipEncoder().encode(archive));
}

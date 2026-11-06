// Import medicines from Excel or CSV (src/pages/Import.jsx): read the sheet, find the header row, match columns to
// what RxPOS understands (by the names people commonly use), preview, then add or update medicines with opening stock.
import 'dart:convert';
import 'dart:typed_data';

import 'package:archive/archive.dart';
import 'package:xml/xml.dart';

import '../../../core/data/record_store.dart';
import '../../../core/rules/ids.dart';
import '../../inventory/domain/medicines.dart' show newInternalBarcode;

/// key, label, header pattern, required
final importTargets = <(String, String, RegExp, bool)>[
  ('name', 'Medicine / trade name', RegExp(r'^(name|item|product|medicine|drug|trade ?name|brand|description|item ?name)', caseSensitive: false), true),
  ('generic', 'Generic name', RegExp('generic|inn|active', caseSensitive: false), false),
  ('form', 'Formulation', RegExp('form|dosage|type', caseSensitive: false), false),
  ('category', 'Category', RegExp('categ|class|group', caseSensitive: false), false),
  ('strength', 'Strength', RegExp('strength|dose|mg', caseSensitive: false), false),
  ('barcode', 'Barcode / code', RegExp('bar ?code|sku|code|ean', caseSensitive: false), false),
  ('unit', 'Unit', RegExp('^unit|uom|pack', caseSensitive: false), false),
  ('cost', 'Cost price', RegExp(r'cost|buying|purchase ?price|bp', caseSensitive: false), false),
  ('price', 'Retail price', RegExp(r'retail|selling|sale ?price|^price|sp\b|mrp', caseSensitive: false), false),
  ('wholesale', 'Wholesale price', RegExp('wholesale|trade ?price|ws', caseSensitive: false), false),
  ('reorder', 'Reorder level', RegExp('reorder|min', caseSensitive: false), false),
  ('stock', 'Opening stock (qty)', RegExp('stock|qty|quantity|balance|on ?hand', caseSensitive: false), false),
  ('batch', 'Batch number', RegExp('batch|lot', caseSensitive: false), false),
  ('expiry', 'Expiry date', RegExp('exp', caseSensitive: false), false),
];

/// CSV with quotes, separators and new lines inside quotes; ';' when the first line has more of them than ','.
List<List<Object?>> parseCsv(String text) {
  final first = text.split('\n').first;
  final sep = ';'.allMatches(first).length > ','.allMatches(first).length ? ';' : ',';
  final rows = <List<Object?>>[];
  var row = <Object?>[];
  final cell = StringBuffer();
  var q = false;
  for (var i = 0; i < text.length; i++) {
    final c = text[i];
    if (q) {
      if (c == '"' && i + 1 < text.length && text[i + 1] == '"') {
        cell.write('"');
        i++;
      } else if (c == '"') {
        q = false;
      } else {
        cell.write(c);
      }
    } else if (c == '"') {
      q = true;
    } else if (c == sep || c == '\t') {
      row.add(cell.toString());
      cell.clear();
    } else if (c == '\n' || c == '\r') {
      if (c == '\r' && i + 1 < text.length && text[i + 1] == '\n') i++;
      row.add(cell.toString());
      cell.clear();
      rows.add(row);
      row = [];
    } else {
      cell.write(c);
    }
  }
  if (cell.isNotEmpty || row.isNotEmpty) {
    row.add(cell.toString());
    rows.add(row);
  }
  return rows.where((r) => r.any((x) => '${x ?? ''}'.trim().isNotEmpty)).toList();
}

/// The first sheet of an Excel (.xlsx) workbook as rows of cells (text, numbers; dates as the day).
List<List<Object?>> readXlsx(Uint8List bytes) {
  final zip = ZipDecoder().decodeBytes(bytes);
  String? file(String name) {
    final f = zip.findFile(name);
    return f == null ? null : utf8.decode(f.content);
  }

  final shared = <String>[];
  if (file('xl/sharedStrings.xml') case final s?) {
    for (final si in XmlDocument.parse(s).findAllElements('si')) {
      shared.add(si.findAllElements('t').map((t) => t.innerText).join());
    }
  }
  // the first sheet in the workbook's order
  var sheetPath = 'xl/worksheets/sheet1.xml';
  final wb = file('xl/workbook.xml'), rels = file('xl/_rels/workbook.xml.rels');
  if (wb != null && rels != null) {
    final first = XmlDocument.parse(wb).findAllElements('sheet').firstOrNull;
    final rid = first?.attributes.where((a) => a.name.local == 'id').firstOrNull?.value;
    final target = XmlDocument.parse(rels).findAllElements('Relationship').where((r) => r.getAttribute('Id') == rid).firstOrNull?.getAttribute('Target');
    if (target != null) sheetPath = target.startsWith('/') ? target.substring(1) : 'xl/$target';
  }
  final sheet = file(sheetPath);
  if (sheet == null) throw const FormatException('The workbook has no sheet');
  int col(String ref) {
    var n = 0;
    for (final ch in ref.codeUnits) {
      if (ch < 65 || ch > 90) break;
      n = n * 26 + ch - 64;
    }
    return n - 1;
  }

  final rows = <List<Object?>>[];
  for (final r in XmlDocument.parse(sheet).findAllElements('row')) {
    final row = <Object?>[];
    for (final c in r.findElements('c')) {
      final i = col(c.getAttribute('r') ?? '');
      while (row.length < i) {
        row.add(null);
      }
      final t = c.getAttribute('t'), v = c.findElements('v').firstOrNull?.innerText;
      final Object? value = switch (t) {
        's' => v == null ? null : shared[int.parse(v)],
        'inlineStr' => c.findAllElements('t').map((x) => x.innerText).join(),
        'str' || 'b' => v,
        _ => v == null ? null : num.tryParse(v) ?? v,
      };
      if (i >= 0) {
        row.add(value);
      }
    }
    rows.add(row);
  }
  return rows.where((r) => r.any((x) => x != null && '$x'.trim().isNotEmpty)).toList();
}

double toNumber(Object? v) => v is num ? v.toDouble() : double.tryParse('${v ?? ''}'.replaceAll(RegExp(r'[^\d.-]'), '')) ?? 0;

/// A date as YYYY-MM-DD: ISO, dd/mm/yyyy, mm/yyyy (the month's last day), or an Excel day number.
String toDate(Object? v) {
  if (v == null) return '';
  if (v is num) {
    if (v < 20000 || v > 80000) return '';
    final d = DateTime.utc(1899, 12, 30).add(Duration(days: v.floor()));
    return d.toIso8601String().substring(0, 10);
  }
  final s = '$v'.trim();
  if (RegExp(r'^\d{4}-\d{2}-\d{2}').hasMatch(s)) return s.substring(0, 10);
  String y(String x) => x.length == 2 ? '20$x' : x;
  var m = RegExp(r'^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$').firstMatch(s);
  if (m != null) return '${y(m[3]!)}-${m[2]!.padLeft(2, '0')}-${m[1]!.padLeft(2, '0')}';
  m = RegExp(r'^(\d{1,2})[/.-](\d{2,4})$').firstMatch(s);
  if (m != null) return DateTime.utc(int.parse(y(m[2]!)), int.parse(m[1]!) + 1, 0).toIso8601String().substring(0, 10);
  final d = DateTime.tryParse(s);
  return d == null ? '' : d.toIso8601String().substring(0, 10);
}

/// A sheet ready to import: its header names and the data rows under them.
class Sheet {
  Sheet(this.fileName, this.headers, this.rows);
  final String fileName;
  final List<String> headers;
  final List<List<Object?>> rows;
}

/// The header row is the first row with at least 2 text cells.
Sheet toSheet(String fileName, List<List<Object?>> rows) {
  final h = rows.indexWhere((r) => r.where((c) => c is String && c.trim().isNotEmpty).length >= 2);
  if (h < 0) throw const FormatException('No header row found (a row with the column names)');
  final headers = [for (var i = 0; i < rows[h].length; i++) '${rows[h][i] ?? 'Column ${i + 1}'}'.trim()];
  return Sheet(fileName, headers, rows.sublist(h + 1).where((r) => r.any((c) => c != null && '$c'.trim().isNotEmpty)).toList());
}

/// Columns matched by their header names (each column used once).
Map<String, int> autoMap(List<String> headers) {
  final out = <String, int>{};
  for (final (key, _, re, _) in importTargets) {
    for (var i = 0; i < headers.length; i++) {
      if (re.hasMatch(headers[i]) && !out.values.contains(i)) {
        out[key] = i;
        break;
      }
    }
  }
  return out;
}

Map<String, Object?> sheetRecord(List<Object?> r, Map<String, int> map) => {for (final (k, _, _, _) in importTargets) k: map[k] != null && map[k]! < r.length ? r[map[k]!] : null};

num _n(double v) => v == v.roundToDouble() ? v.toInt() : v;

/// Add or update the medicines in [sheet] ([skipExisting]: only add new ones); stock in the file is opening stock.
Future<({int added, int updated, int skipped, int stocked})> importSheet(RecordStore store, Sheet sheet, Map<String, int> map,
    {required bool skipExisting, required double retailMarkup, required double wholesaleMarkup, required String user, required String branchId}) async {
  final recs = sheet.rows.map((r) => sheetRecord(r, map)).where((r) => '${r['name'] ?? ''}'.trim().isNotEmpty).toList();
  final products = await store.rows('products');
  final formulations = await store.rows('formulations');
  var added = 0, updated = 0, skipped = 0, stocked = 0;
  await store.update((d) async {
    final byCode = {for (final p in products) if ('${p['barcode'] ?? ''}'.isNotEmpty) '${p['barcode']}': p};
    final byName = {for (final p in products) '${p['name']}'.trim().toLowerCase(): p};
    final used = {...byCode.keys};
    final forms = {for (final f in formulations) '${f['name']}'.toLowerCase()};
    String? text(Object? v) => v == null ? null : '$v'.trim();
    for (final r in recs) {
      final name = '${r['name']}'.trim();
      final code = text(r['barcode']) ?? '';
      final existing = (code.isNotEmpty ? byCode[code] : null) ?? byName[name.toLowerCase()];
      if (existing != null && skipExisting) {
        skipped++;
        continue;
      }
      num old(String k) => (existing?[k] as num?) ?? 0;
      final cost = r['cost'] != null ? toNumber(r['cost']) : old('cost').toDouble();
      final price = r['price'] != null && toNumber(r['price']) != 0
          ? toNumber(r['price'])
          : old('price') != 0
              ? old('price').toDouble()
              : (cost * (1 + retailMarkup / 100)).roundToDouble();
      final wholesale = r['wholesale'] != null && toNumber(r['wholesale']) != 0
          ? toNumber(r['wholesale'])
          : old('wholesale') != 0
              ? old('wholesale').toDouble()
              : (cost * (1 + wholesaleMarkup / 100)).roundToDouble();
      final form = text(r['form'])?.isNotEmpty == true ? text(r['form'])! : '${existing?['form'] ?? 'Others'}';
      if (form.isNotEmpty && forms.add(form.toLowerCase())) {
        d.put('formulations', {'id': 'form-${form.toLowerCase().replaceAll(RegExp(r'\W+'), '-')}', 'name': form});
      }
      final p = d.put('products', {
        ...?existing,
        if (existing == null) 'id': uid(),
        if (existing == null) 'reorder': 0,
        'name': name, 'form': form, 'cost': _n(cost), 'price': _n(price), 'wholesale': _n(wholesale),
        'generic': text(r['generic']) ?? existing?['generic'] ?? '',
        'category': text(r['category']) ?? existing?['category'] ?? '',
        'strength': text(r['strength']) ?? existing?['strength'] ?? '',
        'unit': text(r['unit']) ?? existing?['unit'] ?? 'Piece',
        'reorder': r['reorder'] != null ? _n(toNumber(r['reorder'])) : existing?['reorder'] ?? 0,
        'barcode': code.isNotEmpty ? code : '${existing?['barcode'] ?? ''}'.isNotEmpty ? existing!['barcode'] : newInternalBarcode(used),
      });
      used.add('${p['barcode']}');
      byCode['${p['barcode']}'] = p;
      byName[name.toLowerCase()] = p;
      existing != null ? updated++ : added++;
      final qty = toNumber(r['stock']);
      if (qty > 0) {
        final b = await d.addBatch(productId: '${p['id']}', batch: text(r['batch'])?.isNotEmpty == true ? text(r['batch'])! : 'IMPORT', expiry: toDate(r['expiry']), cost: cost);
        d.move(productId: '${p['id']}', qty: qty, type: 'Opening stock (import)', ref: sheet.fileName, user: user, batchId: '${b['id']}', branchId: branchId);
        stocked++;
      }
    }
    d.audit(user, 'Medicines imported', '${sheet.fileName}: $added added, $updated updated, $skipped skipped, $stocked with stock', branchId);
  });
  return (added: added, updated: updated, skipped: skipped, stocked: stocked);
}

/// The template people fill in.
const importTemplate = 'Name,Generic,Formulation,Category,Barcode,Unit,Cost,Retail price,Wholesale price,Reorder level,Stock,Batch,Expiry\n'
    'Paracetamol 500mg,Paracetamol,Tablets,Analgesic,,Tablet,30,100,50,200,1000,PCM2401,2027-06-30\n';

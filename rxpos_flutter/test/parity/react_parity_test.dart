// Do the Flutter rules give the same answers as the React app's? tool/parity/react_cases.mjs runs the React rules
// (src/*.js) on fixed, fictional cases and saves their answers:
//   react_expected.json       the React app now (after the migration): every answer must match, except the
//                             deliberate differences listed below
//   react_v170_expected.json  the React app as released in v1.7.0 (before the migration): compared for the report
//                             only, since React itself changed after it
// The report of every difference goes to build/parity_report.txt.
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:rxpos/core/entities/people.dart';
import 'package:rxpos/core/entities/product.dart';
import 'package:rxpos/core/entities/settings.dart';
import 'package:rxpos/core/rules/dates.dart';
import 'package:rxpos/core/rules/fefo.dart';
import 'package:rxpos/core/rules/money.dart';
import 'package:rxpos/core/rules/packs.dart';
import 'package:rxpos/core/rules/permissions.dart';
import 'package:rxpos/core/rules/search.dart';
import 'package:rxpos/features/drug_info/domain/drug_label.dart';
import 'package:rxpos/features/extras/domain/extras.dart';
import 'package:rxpos/features/people/domain/reminders.dart';
import 'package:rxpos/features/prescriptions/domain/prescriptions.dart';
import 'package:rxpos/features/stock/domain/stock_form.dart' show showDate, parseTypedDate;
import 'package:rxpos/features/stock/presentation/invoice_scan.dart';
import 'package:rxpos/features/storage/domain/weather.dart';

/// Differences on purpose (the owner's decisions), by rule: a sale beyond the stock is refused instead of booked.
const deliberate = {'allocate-beyond-stock'};

/// Answers where Flutter knowingly differs from React because React's answer is a slip, by the start of the case:
const accepted = {
  'dayOf("garbage"': 'React turns a non-date into "NaN-NaN-NaN"; Flutter gives "" (no day)',
  'normDate(46000': 'React reads a bare number as 1 January 1970; Flutter leaves it blank for the person to type',
  'canRecordRefill({"status":"Cancelled"': 'Flutter also refuses a refill on a cancelled or completed prescription',
};

Map<String, Object?> _m(Object? x) => (x as Map).cast<String, Object?>();
double _d(Object? x) => (x as num?)?.toDouble() ?? 0;
BatchStock _batch(Object? b) {
  final m = _m(b);
  return BatchStock(id: '${m['id']}', qty: _d(m['qty']), batch: '${m['batch'] ?? ''}', expiry: '${m['expiry'] ?? ''}');
}

/// The Flutter rule for a React rule name, on the same arguments; null for a rule Flutter doesn't have.
Object? flutter(String fn, List args) => switch (fn) {
      'round' => round(_d(args[0]), (args[1] as num).toInt()),
      'lineTotal' => lineTotal(price: _d(_m(args[0])['price']), qty: _d(_m(args[0])['qty']), discount: _d(_m(args[0])['discount']), decimals: (args[1] as num).toInt()),
      'cartSubtotal' => cartSubtotal([for (final l in args[0] as List) (price: _d(_m(l)['price']), qty: _d(_m(l)['qty']), discount: _d(_m(l)['discount']))], (args[1] as num).toInt()),
      'taxOf' => taxOf(_d(args[0]), _d(args[1]), inclusive: args[2] == true, decimals: (args[3] as num).toInt()),
      'unitPrice' => unitPrice(_d(args[0]), _d(args[1]), (args[2] as num).toInt()),
      'formatQty' => formatQty(args[0] as num?, '${args[1]}'),
      'formatMoney' => formatMoney(_d(args[0]), currency: '${args[1]}', decimals: (args[2] as num).toInt()),
      'allocate' => [
          for (final a in allocate([for (final b in args[0] as List) _batch(b)], _d(args[1]), allowExpired: args[2] == true))
            {'batchId': a.batchId, 'qty': a.qty, 'batch': a.batch, 'expiry': a.expiry},
        ],
      'removalSplit' => [
          for (final a in removalSplit([for (final b in args[0] as List) _batch(b)], '${args[1]}', _d(args[2]))) {'batchId': a.batchId, 'qty': a.qty, 'batch': a.batch},
        ],
      'packsOf' => [for (final k in packsOf(Product.fromRecord(_m(args[0])))) k.name],
      'mainPack' => mainPack(Product.fromRecord(_m(args[0])))?.name,
      'packPrice' => packPrice(Pack.fromJson(_m(args[0])), _d(args[1]), wholesale: args[2] == true),
      'receiveInPacks' => receiveInPacks(PharmacySettings.fromRecord(_m(args[0]))),
      'sellInPacks' => sellInPacks(PharmacySettings.fromRecord(_m(args[0])), wholesale: args[1] == true),
      'fold' => fold('${args[0]}'),
      'searchProducts' => () {
          final list = [for (final p in args[0] as List) Product.fromRecord(_m(p))];
          return [for (final p in searchProducts(list, '${args[1]}', stockOf: (p) => _d(p.raw['stock']))) p.id];
        }(),
      'dayOf' => dayOf(args[0] as String?),
      'monthOf' => monthOf(args[0] as String?),
      'formatDate' => showDate('${args[0]}', '${args[1]}'),
      'parseDate' => parseTypedDate('${args[0]}', '${args[1]}', monthYear: args[2] == true),
      'refillsLeft' => refillsLeft(_m(args[0])),
      'canRecordRefill' => canRecordRefill(_m(args[0])),
      'reminderActive' => reminderActive(_m(args[0])),
      'normDate' => normDate(args[0]),
      'genericKey' => genericKey(args[0] as String?),
      'lookupKeys' => lookupKeys(args[0] as String?, args[1] as String?),
      'storageAdvice' => [
          for (final (tone, text) in storageAdvice(_m(args[0]), storageLimits(PharmacySettings.fromRecord(_m(args[1]))))) [tone, text],
        ],
      'permissionsOf' => (permissionsOf([for (final r in args[0] as List) Role.fromRecord(_m(r))], '${args[1]}').toList()..sort()),
      _ => throw UnsupportedError('no Flutter rule mapped for $fn'),
    };

/// The same answer, allowing float noise; React's null ("not a date") and Flutter's '' mean the same for typed dates.
bool same(Object? a, Object? b, String fn) {
  if (fn == 'parseDate' && (a == null || a == '') && (b == null || b == '')) return true;
  if (a is num && b is num) return (a - b).abs() < 1e-9;
  if (a is List && b is List) return a.length == b.length && [for (var i = 0; i < a.length; i++) same(a[i], b[i], fn)].every((x) => x);
  if (a is Map && b is Map) return a.keys.toSet().containsAll(b.keys) && b.keys.toSet().containsAll(a.keys) && a.keys.every((k) => same(a[k], b[k], fn));
  return a == b;
}

/// Compare one file of React answers; returns the differences as report lines.
List<String> compare(String file) {
  final cases = (jsonDecode(File(file).readAsStringSync()) as List).cast<Map<String, Object?>>();
  final out = <String>[];
  for (final c in cases) {
    final fn = '${c['fn']}', args = c['args'] as List;
    Object? mine;
    String? myError;
    try {
      mine = flutter(fn, args);
    } catch (e) {
      myError = '$e';
    }
    final label = '$fn${jsonEncode(args).replaceAll(RegExp(r'^\[|\]$'), '(').substring(0, jsonEncode(args).length.clamp(0, 140))})';
    if (c['absent'] == true) {
      out.add('ABSENT IN REACT  $label  → Flutter: ${myError ?? jsonEncode(mine)}');
    } else if (c.containsKey('error')) {
      if (myError == null) out.add('DIFF  $label  React refuses: ${c['error']}  |  Flutter: ${jsonEncode(mine)}');
    } else if (myError != null) {
      final beyond = fn == 'allocate';
      out.add('${beyond ? 'DELIBERATE allocate-beyond-stock' : 'DIFF'}  $label  React: ${jsonEncode(c['out'])}  |  Flutter refuses: $myError');
    } else if (!same(c['out'], mine, fn)) {
      final why = accepted.entries.where((e) => label.startsWith(e.key)).firstOrNull?.value;
      out.add('${why != null ? 'ACCEPTED ($why)' : 'DIFF'}  $label  React: ${jsonEncode(c['out'])}  |  Flutter: ${jsonEncode(mine)}');
    }
  }
  return out;
}

void main() {
  final dir = File.fromUri(Platform.script).parent.path.contains('parity') ? File.fromUri(Platform.script).parent.path : 'test/parity';
  final report = StringBuffer();

  test('the Flutter rules answer as the React app does now (after the migration)', () {
    final diffs = compare('$dir/react_expected.json');
    report.writeln('== React now (after the migration) vs Flutter: ${diffs.where((d) => d.startsWith('DIFF')).length} differences');
    diffs.forEach(report.writeln);
    final real = diffs.where((d) => d.startsWith('DIFF')).toList();
    expect(real, isEmpty, reason: real.join('\n'));
  });

  test('report: React v1.7.0 (before the migration) vs Flutter', () {
    final diffs = compare('$dir/react_v170_expected.json');
    report.writeln('\n== React v1.7.0 (before the migration) vs Flutter: ${diffs.where((d) => d.startsWith('DIFF')).length} differences, '
        '${diffs.where((d) => d.startsWith('ABSENT')).length} answers from rules v1.7.0 did not have');
    diffs.forEach(report.writeln);
  });

  tearDownAll(() {
    Directory('build').createSync(recursive: true);
    File('build/parity_report.txt').writeAsStringSync(report.toString());
  });
}

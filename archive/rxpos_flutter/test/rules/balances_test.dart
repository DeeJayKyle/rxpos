// The entries each record makes (core/rules/balances.dart) are exactly the React app's (src/balances.js), on the
// shared cases (../tests/balance-cases.json, made by tests/unit-balances.mjs --write). Faster sync, stage 4.
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:rxpos/core/rules/balances.dart';

void main() {
  final cases = ((jsonDecode(File('../tests/balance-cases.json').readAsStringSync()) as Map)['cases'] as List).cast<Map>();

  test('the shared cases are there', () => expect(cases.length, greaterThan(100)));

  test('every record makes the same entries as in the React app', () {
    for (final c in cases) {
      final got = entriesOf(c['t'] as String, (c['rec'] as Map).cast<String, Object?>()).map((e) => e.toJson()).toList();
      final want = (c['entries'] as List).cast<Map>().map((e) => {...e, 'amount': (e['amount'] as num).toDouble()}).toList();
      expect(jsonEncode(got), jsonEncode(want), reason: '${c['t']} ${(c['rec'] as Map)['id']}');
    }
  });

  test('brought forward at W + the entries from W = the whole', () {
    final tables = <String, List<Map<String, Object?>>>{};
    for (final c in cases) {
      (tables[c['t'] as String] ??= []).add((c['rec'] as Map).cast<String, Object?>());
    }
    final all = sumEntries(tables);
    for (final w in ['2024-06-01', '2025-01-15T00:00:00.000Z']) {
      final bf = broughtForward(tables, w), recent = sumEntries(tables, keep: (e) => e.date.compareTo(w) >= 0);
      for (final kind in all.keys) {
        for (final MapEntry(:key, :value) in all[kind]!.entries) {
          expect((bf[kind]![key] ?? 0) + (recent[kind]![key] ?? 0), closeTo(value, 1e-6), reason: '$w $kind $key');
        }
      }
    }
  });
}

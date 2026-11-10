// Step 22: insurance co-pay split and balances (core/rules/insurance.dart), against the cases shared with the React app
// (../tests/insurance-cases.json).
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:rxpos/core/rules/insurance.dart';

void main() {
  final cases = jsonDecode(File('../tests/insurance-cases.json').readAsStringSync()) as Map<String, Object?>;
  for (final c in (cases['copay'] as List).cast<Map<String, Object?>>()) {
    test('split: ${c['name']}', () {
      final got = copayOf((c['scheme'] as Map).cast<String, Object?>(), c['total'] as num, decimals: c['decimals'] as int);
      final e = c['expect'] as Map;
      expect((got.copay, got.insurer), ((e['copay'] as num).toDouble(), (e['insurer'] as num).toDouble()));
    });
  }
  final b = cases['balances'] as Map<String, Object?>;
  final sales = (b['sales'] as List).map((x) => (x as Map).cast<String, Object?>()).toList();
  final payments = (b['payments'] as List).map((x) => (x as Map).cast<String, Object?>()).toList();
  final e = b['expect'] as Map;
  (e['insurer'] as Map).forEach((id, v) => test('insurer $id owes $v', () => expect(insurerBalance(sales, payments, '$id'), (v as num).toDouble())));
  (e['clientOwes'] as Map).forEach((id, v) => test('client owes on $id: $v', () => expect(clientOwes(sales.firstWhere((s) => s['id'] == id)), (v as num).toDouble())));
  test('scheme choices: archived insurers left out', () {
    final ch = schemeChoices([
      {'id': 'i1', 'schemes': [{'id': 'gold'}, {'id': 'silver'}]},
      {'id': 'i2', 'archived': true, 'schemes': [{'id': 'x'}]},
    ]);
    expect(ch.map((x) => x.key), ['i1|gold', 'i1|silver']);
  });
}

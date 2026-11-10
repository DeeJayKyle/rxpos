// Payroll & HR rules (features/payroll/domain/payroll.dart), against the cases shared with the React app
// (../tests/payroll-cases.json, run there by tests/unit-payroll.mjs).
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:rxpos/features/payroll/domain/payroll.dart';

void main() {
  final c = jsonDecode(File('../tests/payroll-cases.json').readAsStringSync()) as Map<String, Object?>;
  for (final p in (c['paye'] as List).cast<List>()) {
    test('PAYE on ${p[0]} = ${p[1]}', () => expect(payeUganda((p[0] as num).toDouble()), (p[1] as num).toDouble()));
  }
  for (final x in (c['lines'] as List).cast<Map>()) {
    test('${x['name']}', () {
      List<Map<String, Object?>> rows(Object? v) => [for (final r in v as List) (r as Map).cast<String, Object?>()];
      final l = payLine(Employee.fromRecord((x['employee'] as Map).cast<String, Object?>()), '${x['month']}', attendance: rows(x['attendance']),
          advances: rows(x['advances']), workingDays: x['workingDays'] as int, deductAbsence: x['deductAbsence'] == true).toJson();
      (x['expect'] as Map).forEach((k, v) => expect(v is num ? (l[k] as num).toDouble() : l[k], v is num ? v.toDouble() : v, reason: '$k'));
    });
  }
}

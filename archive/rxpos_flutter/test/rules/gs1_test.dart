// Step 21: GS1 pack codes (core/rules/gs1.dart), against the cases shared with the React app (../tests/gs1-cases.json).
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:rxpos/core/rules/gs1.dart';

void main() {
  final cases = jsonDecode(File('../tests/gs1-cases.json').readAsStringSync()) as Map<String, Object?>;
  for (final c in (cases['parse'] as List).cast<Map<String, Object?>>()) {
    test('read: ${c['name']}', () {
      final got = parseGs1('${c['in']}${c['append']}');
      expect(got?.toJson(), c['expect'] == null ? isNull : (c['expect'] as Map).cast<String, String>());
    });
  }
  for (final c in (cases['sameGtin'] as List).cast<Map<String, Object?>>()) {
    test('same product number: ${c['a']} / ${c['b']}', () => expect(sameGtin('${c['a']}', '${c['b']}'), c['expect']));
  }
  test('check digits and dates', () {
    expect((gtinValid('4006381333931'), gtinValid('09506000134352'), gtinValid('4006381333932')), (true, true, false));
    expect((gs1Date('280200'), gs1Date('271300')), ('2028-02-29', ''));
  });
}

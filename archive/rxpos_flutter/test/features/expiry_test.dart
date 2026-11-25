// Expiry dates read whatever their format (stock_form.dart parseExpiry), against the cases shared with the React app
// (../tests/expiry-cases.json).
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:rxpos/features/stock/domain/stock_form.dart';

void main() {
  final cases = (jsonDecode(File('../tests/expiry-cases.json').readAsStringSync()) as Map)['cases'] as List;
  for (final c in cases.cast<Map>()) {
    test('"${c['in']}" (${c['fmt']}) → ${c['expect']}', () => expect(parseExpiry('${c['in']}', '${c['fmt']}'), c['expect']));
  }
}

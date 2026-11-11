// The history window's keep rule (core/rules/history_window.dart) keeps exactly the records the React app's
// (src/historywindow.js) does, on the shared cases (../tests/window-cases.json, made by tests/unit-historywindow.mjs
// --write). Faster sync, stage 4: the cloud sends a windowed device what this rule keeps, and the device drops the rest.
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:rxpos/core/rules/history_window.dart';

void main() {
  final file = jsonDecode(File('../tests/window-cases.json').readAsStringSync()) as Map;
  final windows = (file['windows'] as List).cast<String>();
  final cases = (file['cases'] as List).cast<Map>();

  test('the shared cases are there, kept and dropped', () {
    expect(cases.length, greaterThan(100));
    expect(cases.any((c) => (c['keeps'] as List).contains(false)), isTrue);
  });

  test('every record is kept or dropped as in the React app', () {
    for (final c in cases) {
      final rec = (c['rec'] as Map).cast<String, Object?>();
      expect([for (final w in windows) keeps(c['t'] as String, rec, w)], c['keeps'], reason: '${c['t']} ${rec['id']}');
    }
  });

  test('no window, or a table kept whole: everything is kept', () {
    expect(keeps('sales', {'id': 's', 'total': 5, 'paid': 5, 'date': '2020-01-01'}, ''), isTrue);
    expect(keeps('products', {'id': 'p', 'updatedAt': '2020-01-01'}, '2026-01-01'), isTrue);
  });

  test('the window start: the first day of the month that many months back, as in the React app', () {
    final now = DateTime.utc(2026, 11, 11, 9);
    expect(windowStart(12, now), '2025-11-01');
    expect(windowStart(1, now), '2026-10-01');
    expect(windowStart(11, DateTime.utc(2026, 1, 31)), '2025-02-01');
    expect(windowStart(0, now), '');
    expect(windowStart(null, now), '');
  });
}

// Engage rules (src/engage.jsx): quiet hours, once a day per alert, the outside readings, the idle screen's slides.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:rxpos/core/entities/product.dart';
import 'package:rxpos/core/entities/settings.dart';
import 'package:rxpos/features/alerts/domain/alerts.dart';
import 'package:rxpos/features/engage/domain/engage.dart';

void main() {
  test('quiet hours: 21:00 to 07:00 by default, or the pharmacy\'s own', () {
    final s = PharmacySettings.fromRecord({});
    expect([for (final h in [6, 7, 12, 20, 21, 23]) quietNow(s, DateTime(2026, 11, 5, h))], [true, false, false, false, true, true]);
    final day = PharmacySettings.fromRecord({'quietFrom': 13, 'quietTo': 14});
    expect([quietNow(day, DateTime(2026, 1, 1, 13)), quietNow(day, DateTime(2026, 1, 1, 14))], [true, false]);
  });

  test('alerts announced once a day, again when they grow; at the till only urgent ones', () {
    const a = Alert(key: 'low', tone: 'warn', icon: Icons.abc, text: '2 low', to: '/reorder', n: 2);
    const b = Alert(key: 'expired', tone: 'danger', icon: Icons.abc, text: '1 expired', to: '/expiry');
    final seen = announcedToday({'day': '2026-11-05', 'keys': {'low': 2}}, '2026-11-05');
    expect(freshAlerts([a, b], seen.keys, selling: false).map((x) => x.key), ['expired']);
    expect(freshAlerts([const Alert(key: 'low', tone: 'warn', icon: Icons.abc, text: '3 low', to: '/reorder', n: 3)], seen.keys, selling: false), hasLength(1));
    expect(announcedToday({'day': '2026-11-04', 'keys': {'low': 2}}, '2026-11-05').keys, isEmpty, reason: 'a new day');
    expect(freshAlerts([a, b], {}, selling: true).map((x) => x.key), ['expired']);
  });

  test('outside readings: rounded like React, once each', () {
    final w = {
      'current': {'time': '2026-11-05T12:10'},
      'hourly': {'time': ['2026-11-05T06:00', '2026-11-05T12:00'], 'temperature_2m': [18.26, 27.04], 'relative_humidity_2m': [79.6, 55.2]},
    };
    final r = weatherReadings(w, {'wx-b2-2026-11-05T06'}, branch: 'b2', placeName: 'Mbarara');
    expect(r.single, {
      'id': 'wx-b2-2026-11-05T12', 'at': '2026-11-05T12:00:00', 'place': 'Outside', 'temp': 27.0, 'humidity': 55, 'by': 'Automatic (weather)', 'note': 'Mbarara', 'auto': true,
      'branchId': 'b2',
    });
  });

  test('the idle screen mixes medicines and a tip after every third; pictures from the form', () {
    Product p(String id) => Product(id: id, name: 'Med $id', price: 100);
    final ins = (
      shortExpiry: [for (final i in ['a', 'b']) (kind: 'expiry', p: p(i), note: '', staff: '')],
      slow: <({String kind, Product p, String note, String staff})>[],
      highValue: [for (final i in ['a', 'c', 'd']) (kind: 'value', p: p(i), note: '', staff: '')],
      highMargin: [(kind: 'margin', p: p('e'), note: '', staff: '')],
    );
    final s = slidesFor(ins, DateTime(2026, 11, 5));
    expect([for (final x in s) x.isTip ? 'tip' : x.item!.p.id], ['a', 'e', 'b', 'tip', 'c', 'd'], reason: 'first of each list, then the second of each…');
    expect(slidesFor((shortExpiry: const [], slow: const [], highValue: const [], highMargin: const []), DateTime(2026, 11, 5)).every((x) => x.isTip), isTrue);
    expect(medicineArt('Syrup', 'Zinco'), Icons.local_drink_outlined);
    expect(medicineArt('', 'Amoxil Capsules'), Icons.medication_outlined);
    expect(tipArt('Sleep under an insecticide-treated mosquito net'), Icons.bug_report_outlined);
  });
}

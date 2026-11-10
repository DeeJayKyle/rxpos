// Packs (tests/unit-packs.mjs), prices, dates (tests/unit-dates.mjs), ids and permissions.
import 'package:flutter_test/flutter_test.dart';
import 'package:rxpos/core/entities/people.dart';
import 'package:rxpos/core/entities/product.dart';
import 'package:rxpos/core/entities/settings.dart';
import 'package:rxpos/core/rules/dates.dart';
import 'package:rxpos/core/rules/ids.dart';
import 'package:rxpos/core/rules/packs.dart';
import 'package:rxpos/core/rules/permissions.dart';
import 'package:rxpos/core/rules/pricing.dart';

void main() {
  group('packs', () {
    final p = Product.fromRecord({'id': 'p', 'packs': [
      {'name': 'Strip', 'size': 10, 'price': 1200}, {'name': 'Box', 'size': 100, 'price': 11000, 'wholesale': 9000},
      {'name': '', 'size': 5}, {'name': 'Single', 'size': 1},
    ]});
    test('the main pack is the largest one', () => expect(mainPack(p)!.name, 'Box'));
    test('no packs: none', () => expect(mainPack(const Product(id: 'x')), isNull));
    test('defaults: receive in packs, retail sells units, wholesale sells packs', () {
      const s = PharmacySettings();
      expect(receiveInPacks(s), isTrue);
      expect(sellInPacks(s, wholesale: false), isFalse);
      expect(sellInPacks(s, wholesale: true), isTrue);
    });
    test('settings change them', () {
      expect(receiveInPacks(const PharmacySettings(receiveUnit: 'unit')), isFalse);
      expect(sellInPacks(const PharmacySettings(sellUnitRetail: 'pack'), wholesale: false), isTrue);
      expect(sellInPacks(const PharmacySettings(sellUnitWholesale: 'unit'), wholesale: true), isFalse);
    });
    test('a pack\'s own price wins, else unit price × size', () {
      expect(packPrice(p.packs[1], 120, wholesale: false), 11000);
      expect(packPrice(p.packs[1], 95, wholesale: true), 9000);
      expect(packPrice(p.packs[0], 95, wholesale: true), 950);
    });
  });
  test('markup prices round to the unit or up to the price step', () {
    expect(markupPrice(1000, 50), 1500);
    expect(markupPrice(333, 50), 500);
    expect(markupPrice(1010, 50, 100), 1600);
    expect(markupPrice(0, 50), 0);
  });
  group('dates', () {
    final now = DateTime(2026, 11, 5, 10);
    test('local date strings', () {
      expect(localDate(DateTime(2026, 3, 5, 10)), '2026-03-05');
      expect(dayOf('2026-10-15'), '2026-10-15');
      expect(dayOf(''), '');
      expect(dayOf(null), '');
      expect(monthOf('2026-10-15'), '2026-10');
    });
    test('days until and since', () {
      expect(daysUntil('2026-11-05', now: now), 0);
      expect(daysUntil('2026-11-06', now: now), 1);
      expect(daysUntil('2026-11-01', now: now), -4);
      expect(daysUntil('2099-01-01'), greaterThan(0));
      expect(daysSince('2000-01-01'), greaterThan(0));
    });
  });
  test('ids and document numbers', () {
    expect(uid(), matches(RegExp(r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')));
    expect(uid(), isNot(uid()));
    expect(docNumber('R', now: DateTime.utc(2026, 11, 5)), matches(RegExp(r'^R[0-9A-Z]{7}$')));
  });
  group('permissions', () {
    test('step 20: a role\'s discount limit; none set = no limit; admins never limited', () {
      final roles = [Role.fromRecord({'id': 'cashier', 'permissions': ['pos.sell'], 'maxDiscount': 10}), Role.fromRecord({'id': 'stock', 'permissions': <String>[], 'maxDiscount': ''})];
      expect(maxDiscountOf(roles, 'cashier'), 10);
      expect(maxDiscountOf(roles, 'stock'), isNull);
      expect(maxDiscountOf(roles, 'pharmacist'), isNull);
      expect(maxDiscountOf([Role.fromRecord({'id': 'admin', 'maxDiscount': 1})], 'admin'), isNull);
    });
    test('the administrator can do everything', () => expect(permissionsOf(const [], 'admin'), allPermissions.toSet()));
    test('the manager everything but settings and reset', () {
      final m = permissionsOf(const [], 'manager');
      expect(m.contains('settings.manage') || m.contains('data.reset'), isFalse);
      expect(m.contains('reports'), isTrue);
    });
    test('a cashier sells but does not change prices', () {
      final c = permissionsOf(const [], 'cashier');
      expect(c.contains('pos.sell'), isTrue);
      expect(c.contains('pos.price_edit'), isFalse);
    });
    test('the pharmacy\'s own role records override and extend the defaults', () {
      final own = [const Role(id: 'cashier', permissions: ['pos.sell', 'pos.discount']), const Role(id: 'night', name: 'Night shift', permissions: ['pos.sell'])];
      expect(permissionsOf(own, 'cashier'), {'pos.sell', 'pos.discount'});
      expect(permissionsOf(own, 'night'), {'pos.sell'});
      expect(permissionsOf(own, 'nobody'), isEmpty);
    });
    test('features are on unless switched off', () {
      final f = featureSet({'wholesale': false});
      expect(f['wholesale'], isFalse);
      expect(f['catalog'], isTrue);
    });
  });
}

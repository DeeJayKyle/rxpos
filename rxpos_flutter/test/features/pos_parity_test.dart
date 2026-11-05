// POS parity with the React till: expired stock with a reason, directions labels, Mobile Money requests, the Recent
// and category filters.
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:rxpos/core/data/record_store.dart';
import 'package:rxpos/core/database/app_database.dart';
import 'package:rxpos/core/entities/batch.dart';
import 'package:rxpos/core/entities/movement.dart';
import 'package:rxpos/core/entities/product.dart';
import 'package:rxpos/core/entities/settings.dart';
import 'package:rxpos/core/network/cloud_api.dart';
import 'package:rxpos/core/rules/stock.dart';
import 'package:rxpos/features/sales_pos/domain/cart.dart';
import 'package:rxpos/features/sales_pos/presentation/pos_dialogs.dart';
import 'package:rxpos/features/sales_pos/presentation/pos_screen.dart';

import '../sync/fake_cloud.dart';

void main() {
  const s = PharmacySettings(name: 'Sample Pharmacy', phone: '0700 000 000');
  final drop = Product.fromRecord({'id': 'p1', 'name': 'Eyedrop 10ml', 'unit': 'Bottle', 'price': 3000, 'cost': 2000, 'category': 'Eye care'});
  const cash = PaymentMethod(id: 'cash', name: 'Cash', type: 'cash');

  group('expired stock', () {
    test('only expired stock left: refused without a reason, allowed and marked with one', () {
      expect(() => addToCart([], drop, stock: 4, sellable: 0, wholesale: false, settings: s), throwsA(isA<OnlyExpiredLeft>()));
      final l = addToCart([], drop, stock: 4, sellable: 0, wholesale: false, settings: s, expiredReason: 'Patient accepts, no alternative').single;
      expect((l.allowExpired, l.expiredReason), (true, 'Patient accepts, no alternative'));
      // once allowed, the line can take more without asking again
      expect(addToCart([l], drop, stock: 4, sellable: 0, wholesale: false, settings: s).single.qty, 2);
    });
    test('good stock first: the reason is asked only once the good stock is all in the sale', () {
      final c = addToCart([], drop, stock: 3, sellable: 1, wholesale: false, settings: s);
      expect(c.single.allowExpired, isFalse);
      expect(() => addToCart(c, drop, stock: 3, sellable: 1, wholesale: false, settings: s), throwsA(isA<OnlyExpiredLeft>()));
    });

    test('the sale takes the expired batch, is marked, and the reason goes to the audit log', () async {
      final db = AppDatabase(NativeDatabase.memory());
      addTearDown(db.close);
      final store = RecordStore(db);
      final stock = StockView(
        products: [drop],
        index: StockIndex.of(const [Movement(id: 'm', productId: 'p1', qty: 2, batchId: 'old')]),
        batches: const [Batch(id: 'old', productId: 'p1', batch: 'X1', expiry: '2026-01-31')],
      );
      final cart = addToCart([], drop, stock: 2, sellable: 0, wholesale: false, settings: s, expiredReason: 'Doctor\'s request');
      final sale = await completeSale(
        store,
        cart: cart,
        c: const Checkout(method: cash),
        settings: s,
        stock: stock,
        wholesale: false,
        cashier: 'Tia',
        now: DateTime(2026, 11, 5),
      );
      expect(sale['expiredOverride'], true);
      expect((((sale['items'] as List).single as Map)['alloc'] as List).single, containsPair('batchId', 'old'));
      final audit = await store.rows('audit');
      expect(audit.single['action'], 'Expired stock sold');
      expect(audit.single['details'], '${sale['number']}: Eyedrop 10ml (Doctor\'s request)');
    });
  });

  group('directions label', () {
    test('the label reads like the React one and is kept on the sale item', () async {
      const l = CartLine(id: 'p1', name: 'Amoxil 250mg', price: 500, cost: 300, qty: 15, max: 99);
      final dir = {
        'dose': '1 capsule',
        'freq': '3 times a day',
        'days': '5',
        'notes': ['Complete the full course'],
        'patient': 'Grace',
      };
      expect(labelLines(l, dir, s, today: DateTime(2026, 11, 5)), [
        'Sample Pharmacy · 0700 000 000',
        'Amoxil 250mg × 15',
        '1 capsule 3 times a day for 5 days',
        'Complete the full course',
        'Grace · 05/11/2026',
      ]);
      expect((await labelPdf(labelLines(l, dir, s))).length, greaterThan(500));
      final db = AppDatabase(NativeDatabase.memory());
      addTearDown(db.close);
      final stock = StockView(
        products: [drop],
        index: StockIndex.of(const [Movement(id: 'm', productId: 'p1', qty: 20)]),
        batches: const [],
      );
      final sale = await completeSale(
        RecordStore(db),
        cart: [const CartLine(id: 'p1', name: 'X', price: 1, cost: 1, qty: 1, max: 20).copyWith(directions: dir)],
        c: const Checkout(method: cash),
        settings: s,
        stock: stock,
        wholesale: false,
        cashier: 'Tia',
      );
      expect(((sale['items'] as List).single as Map)['directions'], dir);
    });
    test('directions and the expired mark survive a held sale (JSON round trip)', () {
      final l = const CartLine(
        id: 'a',
        name: 'A',
        price: 1,
        cost: 1,
        qty: 1,
        max: 1,
        allowExpired: true,
        expiredReason: 'r',
      ).copyWith(directions: {'dose': '5 ml'});
      final back = CartLine.fromJson(l.toJson());
      expect(back.directions, {'dose': '5 ml'});
      expect((back.allowExpired, back.expiredReason), (true, 'r'));
    });
  });

  group('Mobile Money request to the phone', () {
    late FakeCloud cloud;
    late CloudApi api;
    setUp(() {
      cloud = FakeCloud();
      api = CloudApi(cloud.dio(), 'https://cloud.test');
      cloud.api['pay/request'] = (b) => (200, {'ref': 'R-1'});
    });

    test('approved on the phone: the confirmed payment', () async {
      var polls = 0;
      cloud.api['pay/status'] = (q) => (200, ++polls < 3 ? {'status': 'PENDING'} : {'status': 'SUCCESSFUL', 'txid': 'TX9'});
      final m = await requestMomo(api, provider: 'mtn', phone: '256772123456', amount: 6000, pharmacy: 'Sample Pharmacy', every: Duration.zero);
      expect(m, {'provider': 'mtn', 'phone': '256772123456', 'ref': 'R-1', 'txid': 'TX9'});
      final req = cloud.calls.first;
      expect((req.$1, req.$2['amount'], req.$2['note'], '${req.$2['reference']}'.startsWith('PP')), ('pay/request', 6000.0, 'Sample Pharmacy payment', true));
      expect(cloud.calls.last.$2, {'provider': 'mtn', 'ref': 'R-1'});
    });
    test('declined: the reason; no answer: give up after the tries', () async {
      cloud.api['pay/status'] = (_) => (200, {'status': 'FAILED', 'reason': 'Not enough balance'});
      await expectLater(
        requestMomo(api, provider: 'airtel', phone: '256752000000', amount: 1, pharmacy: 'P', every: Duration.zero),
        throwsA(predicate((e) => '$e'.contains('declined or the payment failed: Not enough balance'))),
      );
      cloud.api['pay/status'] = (_) => (200, {'status': 'PENDING'});
      await expectLater(
        requestMomo(api, provider: 'mtn', phone: '256772000000', amount: 1, pharmacy: 'P', every: Duration.zero, tries: 3),
        throwsA(predicate((e) => '$e'.contains('No answer from the customer’s phone'))),
      );
      expect(cloud.calls.where((c) => c.$1 == 'pay/status').length, 4);
    });
    test('the network is guessed from the number, like the React app', () {
      expect(
        [guessNetwork('256772123456'), guessNetwork('0752123456'), guessNetwork('256701000000'), guessNetwork('0200123456')],
        ['mtn', 'airtel', 'airtel', 'airtel'],
      );
    });
    test('a confirmed payment is recorded as confirmed; a typed one as manual', () async {
      final db = AppDatabase(NativeDatabase.memory());
      addTearDown(db.close);
      final stock = StockView(
        products: [drop],
        index: StockIndex.of(const [Movement(id: 'm', productId: 'p1', qty: 20)]),
        batches: const [],
      );
      const momo = PaymentMethod(id: 'momo', name: 'Mobile Money', type: 'momo');
      const line = CartLine(id: 'p1', name: 'X', price: 1000, cost: 1, qty: 1, max: 20);
      final a = await completeSale(
        RecordStore(db),
        cart: [line],
        c: const Checkout(method: momo, momo: {'provider': 'mtn', 'phone': '256772123456', 'ref': 'R-1', 'txid': 'TX9'}),
        settings: s,
        stock: stock,
        wholesale: false,
        cashier: 'Tia',
      );
      expect(a['momo'], {'provider': 'mtn', 'phone': '256772123456', 'ref': 'R-1', 'txid': 'TX9', 'confirmed': true});
      final b = await completeSale(
        RecordStore(db),
        cart: [line],
        c: const Checkout(method: momo, momo: {'provider': 'mtn', 'phone': '', 'txid': 'ABC', 'manual': true}),
        settings: s,
        stock: stock,
        wholesale: false,
        cashier: 'Tia',
      );
      expect(b['momo'], {'provider': 'mtn', 'phone': '', 'txid': 'ABC', 'manual': true});
    });
    test('SMS and the config go to the cloud', () async {
      cloud.api['config'] = (_) => (200, {'mtn': true, 'sms': true});
      cloud.api['sms'] = (_) => (200, {'ok': true});
      expect((await api.config())['sms'], true);
      await api.sendSms(['256772123456'], 'Receipt');
      expect(cloud.calls.last.$1, 'sms');
      expect(cloud.calls.last.$2, {
        'to': ['256772123456'],
        'message': 'Receipt',
      });
    });
  });

  group('filters', () {
    test('Recent: the last 40 distinct medicines sold at this branch, newest first', () {
      final sales = [
        {
          'id': 's1',
          'date': '2026-11-01T10:00:00Z',
          'branchId': 'main',
          'items': [
            {'id': 'a'},
            {'id': 'b'},
          ],
        },
        {
          'id': 's2',
          'date': '2026-11-03T10:00:00Z',
          'branchId': 'main',
          'items': [
            {'id': 'c'},
            {'id': 'a'},
          ],
        },
        {
          'id': 's3',
          'date': '2026-11-04T10:00:00Z',
          'branchId': 'br-2',
          'items': [
            {'id': 'z'},
          ],
        },
      ];
      expect(recentIds(sales, 'main'), ['c', 'a', 'b']);
      final many = [
        for (var i = 0; i < 60; i++)
          {
            'id': 's$i',
            'date': '2026-11-01T10:00:${i.toString().padLeft(2, '0')}Z',
            'branchId': 'main',
            'items': [
              {'id': 'p$i'},
            ],
          },
      ];
      expect(recentIds(many, 'main'), hasLength(40));
    });
    test('categories: distinct, at most 14', () {
      final ps = [
        for (var i = 0; i < 20; i++) Product.fromRecord({'id': '$i', 'name': 'M$i', 'category': 'C${i % 16}'}),
      ];
      expect(categoriesOf([...ps, drop]), hasLength(14));
      expect(categoriesOf([drop, drop]), ['Eye care']);
    });
  });
}

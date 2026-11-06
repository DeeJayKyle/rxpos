// Reorder parity: supplier prices, suggestions (cheapest / last / chosen supplier), dead stock, purchase orders.
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:rxpos/core/data/record_store.dart';
import 'package:rxpos/core/database/app_database.dart';
import 'package:rxpos/core/entities/product.dart';
import 'package:rxpos/core/entities/sale.dart';
import 'package:rxpos/features/purchases/domain/reorder.dart';

void main() {
  final now = DateTime.utc(2026, 11, 5, 12);
  final purchases = [
    {'id': 'u1', 'date': '2026-09-01', 'supplierId': 's1', 'supplierName': 'Alpha', 'items': [{'productId': 'a', 'cost': 120}, {'productId': 'b', 'cost': 40}]},
    {'id': 'u2', 'date': '2026-10-01', 'supplierId': 's2', 'supplierName': 'Beta', 'items': [{'productId': 'a', 'cost': 100}]},
    {'id': 'u3', 'date': '2026-10-20', 'supplierId': 's1', 'supplierName': 'Alpha', 'items': [{'productId': 'a', 'cost': 110}]},
  ];

  test('supplier prices: each supplier\'s latest, cheapest first; the last purchase', () {
    final p = supplierPrices(purchases);
    expect(p['a']!.map((x) => (x.supplierName, x.cost)), [('Beta', 100.0), ('Alpha', 110.0)]);
    expect(lastBuys(purchases)['a']!.supplierName, 'Alpha');
  });

  test('suggestions: forecast from sales; low with no sales; cheapest, last or a chosen supplier', () {
    final a = Product.fromRecord({'id': 'a', 'name': 'Amoxa', 'cost': 90, 'reorder': 5});
    final b = Product.fromRecord({'id': 'b', 'name': 'Brufa', 'cost': 40, 'reorder': 10});
    final c = Product.fromRecord({'id': 'c', 'name': 'Cefo', 'cost': 10, 'reorder': 2});
    final stock = {'a': 20.0, 'b': 4.0, 'c': 50.0};
    final sales = [
      Sale.fromRecord({'id': 's', 'date': '2026-11-01T10:00:00Z', 'branchId': 'main', 'items': [{'id': 'a', 'qty': 60}]}),
      Sale.fromRecord({'id': 'r', 'date': '2026-11-01T10:00:00Z', 'branchId': 'main', 'status': 'refunded', 'items': [{'id': 'c', 'qty': 600}]}),
      Sale.fromRecord({'id': 'o', 'date': '2026-11-01T10:00:00Z', 'branchId': 'br2', 'items': [{'id': 'c', 'qty': 600}]}),
    ];
    final v = salesVelocity(sales, days: 30, now: now);
    expect(v.sold, {'a': 60.0});
    final prices = supplierPrices(purchases), last = lastBuys(purchases);
    var r = reorderSuggestions([a, b, c], (id) => stock[id]!, v.sold, window: 30, lead: 7, cover: 30, prices: prices, last: last);
    expect(r.map((x) => (x.p.id, x.qty, x.buy?.supplierName)), [('a', 54.0, 'Beta'), ('b', 16.0, 'Alpha')], reason: '2/day × 37 = 74 − 20; Brufa: 2×10 − 4');
    expect(r.first.cost, 5400);
    r = reorderSuggestions([a], (id) => stock[id]!, v.sold, window: 30, lead: 7, cover: 30, prices: prices, last: last, fromCheapest: false);
    expect(r.single.buy?.supplierName, 'Alpha', reason: 'the last supplier');
    r = reorderSuggestions([a], (id) => stock[id]!, v.sold, window: 30, lead: 7, cover: 30, prices: prices, last: last, chosen: {'a': 's1'});
    expect(r.single.buy?.cost, 110);
  });

  test('dead stock: in stock and not sold for the days, most value first; never sold counts', () {
    final a = Product.fromRecord({'id': 'a', 'name': 'A', 'cost': 10}), b = Product.fromRecord({'id': 'b', 'name': 'B', 'cost': 100}), c = Product.fromRecord({'id': 'c', 'name': 'C', 'cost': 1});
    final dead = deadStock([a, b, c], (id) => id == 'c' ? 0 : 5, {'a': '2026-10-30T10:00:00Z', 'b': '2026-06-01T10:00:00Z'}, deadDays: 90, now: now);
    expect(dead.map((x) => x.p.id), ['b']);
    expect(deadStock([a], (_) => 5, const {}, deadDays: 90, now: now).single.last, '');
  });

  test('purchase orders: one per supplier, audited; the WhatsApp text', () async {
    final db = AppDatabase(NativeDatabase.memory());
    addTearDown(db.close);
    final store = RecordStore(db);
    final a = Product.fromRecord({'id': 'a', 'name': 'Amoxa', 'cost': 90}), b = Product.fromRecord({'id': 'b', 'name': 'Brufa', 'cost': 40});
    const alpha = (supplierId: 's1', supplierName: 'Alpha', cost: 100.0, date: '');
    final n = await createPurchaseOrders(store, [Suggestion(a, 1, 1, 1, 10, alpha, const []), Suggestion(b, 1, 1, 1, 4, null, const [])],
        supplierNames: {'s1': 'Alpha'}, user: 'Tia');
    expect(n, 2);
    final pos = await store.rows('purchaseOrders');
    final first = pos.firstWhere((p) => p['supplierId'] == 's1');
    expect((first['status'], first['supplierName']), ('Draft', 'Alpha'));
    expect(first['items'], [{'productId': 'a', 'name': 'Amoxa', 'qty': 10.0, 'cost': 100.0}]);
    expect(pos.firstWhere((p) => p['supplierId'] == '')['supplierName'], 'Any supplier');
    expect(poText(first, 'Sample Pharmacy'), 'Purchase order ${first['number']} from Sample Pharmacy\n• Amoxa × 10\nPlease confirm availability and prices. Thank you.');
    expect((await store.rows('audit')).single['details'], '2 order(s), 2 lines');
  });

  group('order quantity methods', () {
    final f = Product.fromRecord({'id': 'f', 'name': 'Fastol', 'cost': 100});
    final v = Product.fromRecord({'id': 'v', 'name': 'Varix', 'cost': 100});
    final sl = Product.fromRecord({'id': 's', 'name': 'Slowa', 'cost': 100, 'reorder': 5});
    final stock = {'f': 20.0, 'v': 50.0, 's': 4.0};
    // the last 30 days: Fastol 4 every day; Varix 10 every other day; Slowa 3 on three days
    final sales = [
      for (var i = 0; i < 30; i++) ...[
        Sale.fromRecord({'id': 'f$i', 'date': now.subtract(Duration(days: i)).toIso8601String(), 'branchId': 'main', 'items': [{'id': 'f', 'qty': 4}]}),
        if (i.isEven) Sale.fromRecord({'id': 'v$i', 'date': now.subtract(Duration(days: i)).toIso8601String(), 'branchId': 'main', 'items': [{'id': 'v', 'qty': 10}]}),
        if (i % 10 == 0) Sale.fromRecord({'id': 's$i', 'date': now.subtract(Duration(days: i)).toIso8601String(), 'branchId': 'main', 'items': [{'id': 's', 'qty': 3}]}),
      ],
    ];
    final demand = dailyDemand(sales, days: 30, now: now);
    Map<String, double> run(OrderMethod m) => {
          for (final r in orderSuggestions([f, v, sl], (id) => stock[id]!, demand, method: m, window: 30, lead: 7, cover: 14, prices: const {}, last: const {}))
            r.p.id: r.qty,
        };

    test('daily sales per medicine, oldest first', () {
      expect((demand['f']!.length, demand['f']!.every((x) => x == 4), demand['v']!.where((x) => x == 10).length, demand['s']!.where((x) => x > 0).length), (30, true, 15, 3));
    });

    test('reorder point + safety stock: the steady seller needs no safety stock, the irregular one does', () {
      // Fastol: point 4×7 = 28 ≥ 20, up to 4×21 = 84 → 64. Varix: mean 5, sd 5.09, safety ⌈1.65×5.09×√7⌉ = 23, point 58 ≥ 50, up to 128 → 78.
      // Slowa: mean 0.3, safety 4, point ⌈2.1 + 4⌉ = 7 ≥ 4, up to 11 → 7
      expect(run(OrderMethod.safety), {'f': 64.0, 'v': 78.0, 's': 7.0});
    });

    test('smart mix: safety stock for the daily sellers, Min / Max for the occasional one', () {
      // Slowa sold on 3 of 30 days: min 5 (its reorder level), max 10 → 6
      expect(run(OrderMethod.smart), {'f': 64.0, 'v': 78.0, 's': 6.0});
    });

    test('Min / Max, EOQ and order-up-to', () {
      expect(run(OrderMethod.minMax)['s'], 6);
      // EOQ for Fastol: √(2 × 1460 × 20000 ÷ 25) = 1528.4 → 1529
      expect(run(OrderMethod.eoq)['f'], 1529);
      // order-up-to tops up every seller, even Slowa: ⌈0.3 × 21 + 4⌉ = 11 − 4 = 7
      expect(run(OrderMethod.upTo), {'f': 64.0, 'v': 78.0, 's': 7.0});
    });

    test('days of cover gives the same answers as the current app\'s rule', () {
      final old = reorderSuggestions([f, v, sl], (id) => stock[id]!, salesVelocity(sales, days: 30, now: now).sold, window: 30, lead: 7, cover: 14, prices: const {}, last: const {});
      expect(run(OrderMethod.cover), {for (final r in old) r.p.id: r.qty});
    });
  });
}

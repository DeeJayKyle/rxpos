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
}

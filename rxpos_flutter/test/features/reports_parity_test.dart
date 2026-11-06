// Reports parity: the tabs' figures (Sales, by product, ABC, profit and the price check, stock valuation, income
// statement), the weekly summary, the dashboard's month and day keys and what to promote today.
import 'package:flutter_test/flutter_test.dart';
import 'package:rxpos/core/entities/batch.dart';
import 'package:rxpos/core/entities/movement.dart';
import 'package:rxpos/core/entities/product.dart';
import 'package:rxpos/core/entities/sale.dart';
import 'package:rxpos/core/entities/settings.dart';
import 'package:rxpos/core/presentation/charts.dart';
import 'package:rxpos/core/rules/fefo.dart';
import 'package:rxpos/core/rules/stock.dart';
import 'package:rxpos/features/dashboard/domain/figures.dart';
import 'package:rxpos/features/dashboard/domain/insights.dart';
import 'package:rxpos/features/reports/domain/report_tabs.dart';
import 'package:rxpos/features/reports/domain/weekly.dart';

Sale sale(String id, String date, List<(String, double, double, double)> items, {double discount = 0, double tax = 0, String status = 'completed', String pay = 'Cash', String cashier = 'Tia'}) {
  final sub = items.fold<double>(0, (a, i) => a + i.$2 * i.$3);
  return Sale.fromRecord({'id': id, 'number': id, 'date': date, 'status': status, 'payment': pay, 'cashier': cashier, 'branchId': 'main', 'subtotal': sub, 'discount': discount, 'tax': tax,
    'total': sub - discount + tax, 'paid': sub - discount + tax, 'items': [for (final i in items) {'id': i.$1, 'name': i.$1.toUpperCase(), 'qty': i.$2, 'price': i.$3, 'cost': i.$4}]});
}

void main() {
  final a = Product.fromRecord({'id': 'a', 'name': 'A', 'price': 100, 'cost': 60, 'form': 'Tablets', 'category': 'Pain'});
  final b = Product.fromRecord({'id': 'b', 'name': 'B', 'price': 50, 'cost': 48, 'form': 'Syrups'});
  final c = Product.fromRecord({'id': 'c', 'name': 'C', 'price': 10, 'cost': 9, 'form': 'Syrups', 'rx': true});
  final byId = {'a': a, 'b': b, 'c': c};
  final sales = [
    sale('s1', '2026-11-02T10:00:00Z', [('a', 10, 100, 60), ('b', 2, 50, 48)], discount: 110, tax: 0, pay: 'Mobile Money'),
    sale('s2', '2026-11-03T10:00:00Z', [('a', 1, 100, 60)], tax: 18),
    sale('s3', '2026-11-03T11:00:00Z', [('a', 5, 100, 60)], status: 'refunded'),
    sale('old', '2026-10-01T10:00:00Z', [('b', 1, 50, 48)]),
  ];
  final per = Period(from: '2026-11-01', to: '2026-11-05', sales: sales, purchases: const [{'date': '2026-11-02', 'supplierName': 'Alpha', 'total': 500, 'paid': 200}],
      expenses: const [{'date': '2026-11-04', 'amount': 300, 'categoryId': 'rent'}], movements: const [Movement(id: 'w', productId: 'b', qty: -2, type: 'Expired write-off', date: '2026-11-04')]);

  test('the period: sales, refunds, tax, cost of goods, expenses, write-offs, every day', () {
    expect((per.sales.length, per.refunds.length, per.revenue, per.tax, per.cogs, per.expenseTotal, per.writeOffs(byId)), (2, 1, 1090.0, 18.0, 756.0, 300.0, 96.0));
    expect(per.daily().map((x) => x.$2), [0.0, 990.0, 118.0, 0.0, 0.0]);
    expect(sumBy(per.sales, (s) => s.payment, (s) => s.total), [('Mobile Money', 990.0), ('Cash', 118.0)]);
  });

  test('sales by product and profit with the discount shared out; the price check against the target margin', () {
    expect(salesByProduct(per.sales).first, (product: 'A', qty: 11.0, revenue: 1100.0, cost: 660.0, profit: 440.0));
    final rows = profitRows(per.sales, byId);
    final ra = rows.firstWhere((r) => r.key == 'a');
    expect(ra.revenue, closeTo(1000, .001), reason: 'A: 1000 − 110 × 1000/1100 + 100');
    expect(profitRows(per.sales, byId, byCategory: true).map((r) => r.name).toSet(), {'Pain', 'Syrups'});
    final check = priceCheck([a, b, c], (_) => 5, 20);
    expect(check.map((r) => r.p.id), ['b', 'c']);
    expect(priceForMargin(48, 20), 60);
  });

  test('consumption ABC: classes by where each item starts; running out; not sold', () {
    final r = consumption(per.sales, byId, (id) => id == 'a' ? 20 : 5, from: '2026-11-01', to: '2026-11-05');
    expect(r.rows.map((x) => (x.id, x.cls)), [('a', 'A'), ('b', 'B')]);
    expect(r.rows.first.daysLeft, closeTo(20 / (11 / 5), .001));
    expect(r.idle.single.p.id, 'c');
  });

  test('stock valuation and by formulation', () {
    final view = StockView(products: [a, b], index: StockIndex.of(const [Movement(id: 'm', productId: 'a', qty: 10, batchId: 'x'), Movement(id: 'n', productId: 'b', qty: 4, batchId: 'y')]),
        batches: const [Batch(id: 'x', productId: 'a', batch: 'X', expiry: '2030-01-01'), Batch(id: 'y', productId: 'b', batch: 'Y', expiry: '2020-01-01')]);
    final v = stockValuation([a, b], view, now: DateTime(2026, 11, 5));
    expect((v.cost, v.retail, v.expired, v.items), (600.0, 1000.0, 192.0, 2));
  });

  test('the weekly summary against the week before', () {
    final w = weeklyStats([
      sale('x', '2026-11-03T10:00:00Z', [('a', 20, 100, 60)]), sale('y', '2026-10-27T10:00:00Z', [('a', 5, 100, 60), ('b', 40, 50, 48)]),
    ], weekStart(DateTime(2026, 11, 5)));
    expect((w.start, w.end, w.total, w.prevTotal, w.count, w.best.$1), ('2026-11-02', '2026-11-08', 2000.0, 2500.0, 1, 'Tue'));
    expect(w.risers.single.growth, 300);
    expect(w.fallers.single.name, 'B');
    expect(weekStart(DateTime(2026, 11, 8)), DateTime(2026, 11, 2), reason: 'Sunday belongs to the week that started on Monday');
  });

  test('day and month keys; axis maximum and short numbers', () {
    expect(lastDays(3, now: DateTime(2026, 3, 1)), ['2026-02-27', '2026-02-28', '2026-03-01']);
    expect(lastMonths(3, now: DateTime(2026, 1, 15)), ['2025-11', '2025-12', '2026-01']);
    expect([niceMax(0), niceMax(7), niceMax(230), niceMax(26000)], [1, 10, 250, 50000]);
    expect([compact(1500), compact(2500000), compact(12)], ['1.5k', '2.5M', '12']);
  });

  test('promote today: never prescription-only; short expiry and margin first; the share text', () {
    final d = Product.fromRecord({'id': 'd', 'name': 'Dfever', 'price': 100, 'cost': 50});
    List<BatchStock> batches(String id) => [BatchStock(id: '$id-1', batch: '1', expiry: id == 'd' ? '2026-12-01' : '2030-01-01', qty: 5)];
    final i = insights([a, c, d], (_) => 5, batches, const [], const PharmacySettings(), now: DateTime(2026, 11, 5));
    expect(i.shortExpiry.single.p.id, 'd');
    expect(i.highMargin.map((x) => x.p.id), ['d', 'a']);
    expect(promoteToday(i).map((x) => x.p.id), ['d', 'a']);
    expect(shareText(a, const PharmacySettings(name: 'Sample Pharmacy', phone: '0700')), '💊 *A* is available at Sample Pharmacy for UGX 100. Call or WhatsApp 0700. Ask our pharmacist for advice. Get well soon!');
  });
}

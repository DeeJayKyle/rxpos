// Shifts and cash-up, stock take, reorder levels, supplier returns.
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:rxpos/core/data/record_store.dart';
import 'package:rxpos/core/database/app_database.dart';
import 'package:rxpos/core/entities/movement.dart';
import 'package:rxpos/core/entities/product.dart';
import 'package:rxpos/core/entities/sale.dart';
import 'package:rxpos/core/entities/settings.dart';
import 'package:rxpos/core/entities/shift.dart';
import 'package:rxpos/core/rules/fefo.dart';
import 'package:rxpos/core/rules/stock.dart';
import 'package:rxpos/features/purchases/domain/reorder.dart';
import 'package:rxpos/features/returns/domain/supplier_return.dart';
import 'package:rxpos/features/shifts/domain/shifts.dart';
import 'package:rxpos/features/stock_count/domain/stock_count.dart';

Sale s(String id, String date, double total, {String payment = 'Cash', String cashier = 'Tia', String status = 'completed', double? paid, Map<String, Object?> extra = const {}, double qty = 1, String item = 'p1'}) =>
    Sale.fromRecord({'id': id, 'date': date, 'total': total, 'paid': paid ?? total, 'payment': payment, 'cashier': cashier, 'status': status, 'branchId': 'main',
      'items': [{'id': item, 'name': item, 'price': total, 'qty': qty}], ...extra});

void main() {
  late AppDatabase db;
  late RecordStore store;
  setUp(() {
    db = AppDatabase(NativeDatabase.memory());
    store = RecordStore(db);
  });
  tearDown(() => db.close());
  Future<double> stock(String p) async => StockIndex.of((await store.rows('movements')).map(Movement.fromRecord)).ofProduct(mainBranch, p);

  group('shifts', () {
    const open = Shift(id: 'sh', userId: 'u', user: 'Tia', openedAt: '2026-11-05T06:00:00Z', float: 20000);
    final sales = [
      s('a', '2026-11-05T07:00:00Z', 5000),
      s('b', '2026-11-05T08:00:00Z', 3000, payment: 'Mobile Money'),
      s('c', '2026-11-05T09:00:00Z', 4000, payment: 'Credit', paid: 1000),
      s('d', '2026-11-05T09:30:00Z', 2000, status: 'refunded', extra: {'refundedBy': 'Tia', 'refundedAt': '2026-11-05T10:00:00Z'}),
      s('e', '2026-11-05T09:00:00Z', 9999, cashier: 'Someone else'),
      s('f', '2026-11-05T05:00:00Z', 7777),
    ];
    test('expected cash = float + my cash sales − my cash refunds during the shift', () {
      final x = shiftSummary(open, sales, now: '2026-11-05T12:00:00Z');
      expect((x.count, x.total, x.expectedCash, x.credit, x.refunds), (3, 12000.0, 23000.0, 3000.0, 1));
      expect(x.byMethod, {'Cash': 5000.0, 'Mobile Money': 3000.0, 'Credit': 1000.0});
    });
    test('closing counts the notes and records the difference', () async {
      final rec = await closeShift(store, open, sales.where((x) => x.id != 'd'), counts: {'20000': 1, '1000': 4, 'coins': 500});
      expect((rec['counted'], rec['variance']), (24500.0, -500.0));
      expect((await store.rows('audit')).single['action'], 'Shift closed');
    });
  });

  test('stock take: system quantity kept when counted, a batch found on the shelf, an uncounted medicine set to 0, summary', () async {
    final a = Product.fromRecord({'id': 'a', 'name': 'Amoxa', 'cost': 100}), b = Product.fromRecord({'id': 'b', 'name': 'Brufa', 'cost': 50});
    final batches = {'a': [const BatchStock(id: 'a1', batch: 'A1', qty: 10), const BatchStock(id: 'a2', batch: 'A2', qty: 5)], 'b': [const BatchStock(id: 'b1', batch: 'B1', qty: 7)]};
    expect(() => startCount(store, name: 'x', scope: CountScope.shelf, label: 'Shelf Z', productIds: const [], user: 'Tia'), throwsA(isA<CountProblem>()));
    final count = await startCount(store, name: 'Shelf 1', scope: CountScope.all, label: 'All medicines in stock', productIds: ['a', 'b'], user: 'Tia');
    // A1 counted 8 (system 10 then); A2 left blank (not counted: keeps its 5); a batch found on the shelf
    await saveCount(store, count: count, product: a, batches: batches['a']!, item: null, typed: {'a1': '8'},
        extra: [foundBatch(batch: 'NEW', expiry: '2030-01-01', qty: 3, cost: 100)], by: 'Tia');
    // a sale of 2 from A1 while counting: the system quantity stays what it was when counted
    var item = CountItem.fromRecord((await store.get('countItems', countItemId(count['id'] as String, 'a')))!);
    await saveCount(store, count: count, product: a, batches: [const BatchStock(id: 'a1', batch: 'A1', qty: 8), batches['a']![1]], item: item, typed: {'a1': '8'}, by: 'Tia');
    item = CountItem.fromRecord((await store.get('countItems', countItemId(count['id'] as String, 'a')))!);
    expect(item.lines.map((l) => (l.batch, l.sys, l.qty, l.skipped, l.found)), [('A1', 10.0, 8.0, false, false), ('A2', 5.0, 5.0, true, false), ('NEW', 0.0, 3.0, false, true)]);
    final byId = {'a': a, 'b': b};
    final sum = summarise(2, [item], byId);
    expect((sum.counted, sum.short, sum.over, sum.shortValue, sum.overValue), (1, 0, 1, 200.0, 300.0), reason: 'net +1 unit, +100: extra overall');
    final diffs = differences([item], byId);
    expect(diffs.map((r) => (r.l.batch, r.l.diff)), [('A1', -2.0), ('NEW', 3.0)]);
    final zero = zeroable([a, b], [item], (id) => batches[id]!);
    expect(zero.single.b.batch, 'B1');
    final posted = await postCount(store, count: count, diffs: diffs, sum: sum, zero: zero, settings: const PharmacySettings(), user: 'Tia');
    expect((posted.zeroed, posted.net), (1, 100.0 - 350.0));
    expect(await stock('a'), 1, reason: '−2 and +3 new batch');
    expect(await stock('b'), -7, reason: 'set to 0 from 7');
    final saved = (await store.get('stockCounts', count['id'] as String))!;
    expect((saved['status'], (saved['summary'] as Map)['zeroed']), ('posted', 1));
    expect((await store.rows('batches')).single['batch'], 'NEW');
    expect((await store.rows('audit')).map((x) => x['action']), ['Stock count started', 'Stock count posted']);
  });

  test('stock take scopes and scan & count', () async {
    final ps = [
      Product.fromRecord({'id': 'a', 'name': 'Amoxa', 'form': 'Capsules', 'cost': 100, 'shelf': 'B'}),
      Product.fromRecord({'id': 'b', 'name': 'Brufa', 'form': 'Tablets', 'cost': 50, 'shelf': 'A'}),
      Product.fromRecord({'id': 'c', 'name': 'Cefo', 'form': 'Tablets', 'cost': 900}),
    ];
    final bs = {'a': [const BatchStock(id: 'a1', batch: 'A1', expiry: '2026-12-01', qty: 4)], 'b': [const BatchStock(id: 'b1', batch: 'B1', qty: 2)], 'c': [const BatchStock(id: 'c1', batch: 'C1', qty: 1)]};
    List<BatchStock> of(String id) => bs[id]!;
    final now = DateTime(2026, 11, 5);
    expect(countScope(CountScope.all, ps, of).list.map((p) => p.id), ['b', 'a', 'c'], reason: 'shelf order, no shelf last');
    expect(countScope(CountScope.shelf, ps, of, shelf: 'B').list.single.id, 'a');
    expect(countScope(CountScope.form, ps, of, form: 'Tablets').list.map((p) => p.id), ['b', 'c']);
    expect(countScope(CountScope.expiring, ps, of, now: now).list.single.id, 'a');
    final top = countScope(CountScope.value, ps, of, size: 1);
    expect((top.list.single.id, top.label), ('c', 'Top 1 by value'));
    expect(countScope(CountScope.empty, ps, of).list, isEmpty);
    final count = await startCount(store, name: 'Spot', scope: CountScope.empty, label: 'Scan as you go', productIds: const [], user: 'Tia');
    await addToCount(store, count, 'a');
    expect(((await store.get('stockCounts', count['id'] as String))!['productIds'] as List), ['a']);
    expect(await tallyOne(store, count: count, p: ps[0], batches: of('a'), item: null, by: 'Tia'), 'Amoxa: 1 counted (batch A1)');
    final it = CountItem.fromRecord((await store.get('countItems', countItemId(count['id'] as String, 'a')))!);
    expect(await tallyOne(store, count: count, p: ps[0], batches: of('a'), item: it, by: 'Tia'), 'Amoxa: 2 counted (batch A1)');
    await clearCount(store, count, 'a');
    expect(await store.rows('countItems'), isEmpty);
  });

  test('reorder levels follow what sold: average a day × (lead + safety days)', () {
    final now = DateTime(2026, 11, 5);
    final sales = [s('1', '2026-11-01T10:00:00', 0, qty: 30), s('2', '2026-11-03T10:00:00', 0, qty: 30), s('3', '2026-09-01T10:00:00', 0, qty: 999)];
    final out = computeReorderLevels(sales, [const Product(id: 'p1', name: 'Amoxa', reorder: 5), const Product(id: 'p2', name: 'Idle')], now: now);
    expect(out.single.level, 28, reason: '60 sold in 30 days = 2 a day × 14 days');
    expect(suggestedOrder(const Product(id: 'x', reorder: 10), 4), 16);
  });

  test('a supplier return takes stock out of its batch, as a credit note', () async {
    final rec = await returnToSupplier(store, supplierId: 's1', supplierName: 'Sample Wholesalers', settle: 'credit', by: 'Tia', date: '2026-11-05',
        lines: [const ReturnLine(productId: 'p1', name: 'Amoxa', batch: BatchStock(id: 'b1', batch: 'B1', qty: 6, expiry: '2026-10-01'), qty: 4, credit: 300)]);
    expect((rec['total'], rec['settle']), (1200.0, 'credit'));
    expect(await stock('p1'), -4);
    expect(() => returnToSupplier(store, supplierId: 's1', supplierName: 'x', settle: 'credit', by: 'T', date: 'd',
        lines: [const ReturnLine(productId: 'p1', name: 'Amoxa', batch: BatchStock(id: 'b1', batch: 'B1', qty: 2), qty: 4, credit: 1)]), throwsA(isA<ReturnProblem>()));
  });
}

// Shifts and cash-up, stock take, reorder levels, supplier returns.
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:rxpos/core/data/record_store.dart';
import 'package:rxpos/core/database/app_database.dart';
import 'package:rxpos/core/entities/movement.dart';
import 'package:rxpos/core/entities/product.dart';
import 'package:rxpos/core/entities/sale.dart';
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

  test('stock take: differences per batch, a batch found on the shelf, an uncounted medicine set to 0', () async {
    const a = Product(id: 'a', name: 'Amoxa', cost: 100), b = Product(id: 'b', name: 'Brufa', cost: 50);
    final batches = {'a': [const BatchStock(id: 'a1', batch: 'A1', qty: 10), const BatchStock(id: 'a2', batch: 'A2', qty: 5)], 'b': [const BatchStock(id: 'b1', batch: 'B1', qty: 7)]};
    final count = await startCount(store, name: 'Shelf 1', productIds: ['a', 'b'], user: 'Tia');
    final r = countDifferences({'a': a, 'b': b}, {'a': [const CountLine(batchId: 'a1', batch: 'A1', qty: 8), const CountLine(batchId: 'a2', batch: 'A2', qty: 5), const CountLine(batch: 'NEW', expiry: '2030-01-01', qty: 3)]},
        ['a', 'b'], (id) => batches[id]!);
    expect(r.diffs.map((x) => (x.batch, x.diff)), [('A1', -2.0), ('NEW', 3.0)]);
    expect(r.uncounted.single.batch, 'B1');
    await postCount(store, count: count, diffs: r.diffs, zero: r.uncounted, user: 'Tia');
    expect(await stock('a'), 1, reason: '−2 and +3 new batch');
    expect(await stock('b'), -7, reason: 'set to 0 from 7');
    expect((await store.get('stockCounts', count['id'] as String))!['status'], 'posted');
    expect((await store.rows('batches')).single['batch'], 'NEW');
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

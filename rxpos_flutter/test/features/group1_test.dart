// Dashboard figures, refunds, stock adjustments, client and supplier balances.
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:rxpos/core/data/record_store.dart';
import 'package:rxpos/core/database/app_database.dart';
import 'package:rxpos/core/entities/movement.dart';
import 'package:rxpos/core/entities/product.dart';
import 'package:rxpos/core/entities/purchase.dart';
import 'package:rxpos/core/entities/sale.dart';
import 'package:rxpos/core/entities/settings.dart';
import 'package:rxpos/core/rules/fefo.dart';
import 'package:rxpos/core/rules/stock.dart';
import 'package:rxpos/features/dashboard/domain/figures.dart';
import 'package:rxpos/features/inventory/domain/adjust.dart';
import 'package:rxpos/features/people/domain/balances.dart';
import 'package:rxpos/features/sales_history/domain/refund.dart';

Sale sale(String id, String date, double total, {double tax = 0, double cost = 0, String status = 'completed', double paid = -1, String customer = 'walk-in', String branch = 'main'}) =>
    Sale.fromRecord({'id': id, 'number': 'R-$id', 'date': date, 'total': total, 'tax': tax, 'status': status, 'paid': paid < 0 ? total : paid,
      'customerId': customer, 'branchId': branch, 'items': [{'id': 'p1', 'name': 'Amoxa', 'price': total, 'cost': cost, 'qty': 1, 'alloc': [{'batchId': 'b1', 'qty': 1}]}]});

void main() {
  late AppDatabase db;
  late RecordStore store;
  setUp(() {
    db = AppDatabase(NativeDatabase.memory());
    store = RecordStore(db);
  });
  tearDown(() => db.close());

  group('dashboard figures', () {
    final now = DateTime(2026, 11, 5, 12);
    final f = Figures.of([
      sale('a', '2026-11-05T08:00:00', 1000, cost: 600),
      sale('b', '2026-11-05T09:00:00', 1180, tax: 180, cost: 500),
      sale('c', '2026-11-05T10:00:00', 999, status: 'refunded'),
      sale('d', '2026-11-04T10:00:00', 500, cost: 200),
      sale('e', '2026-11-05T10:00:00', 700, branch: 'kampala'),
    ], [{'date': '2026-11-05', 'amount': 300}], now: now);
    test('today: sales, gross profit (less tax and cost), expenses, transactions; refunds and other branches left out', () {
      final t = f.day('2026-11-05');
      expect((t.count, t.total, t.grossProfit, t.expenses), (2, 2180.0, 900.0, 300.0));
    });
    test('month and top sellers', () {
      expect(f.month('2026-11').total, 2680);
      expect(f.top.single.name, 'Amoxa');
      expect(deltaPercent(2180, 500), closeTo(336, 1));
      expect(deltaPercent(1, 0), isNull);
    });
  });

  test('a refund puts every unit back in its batch, marks the sale and writes the audit line', () async {
    final s = sale('s1', '2026-11-05T08:00:00', 1500);
    await store.update((d) => d.put('sales', s.toRecord()));
    await refundSale(store, Sale.fromRecord((await store.get('sales', 's1'))!), user: 'Tia', settings: const PharmacySettings());
    final saved = (await store.get('sales', 's1'))!;
    expect((saved['status'], saved['refundedBy']), ('refunded', 'Tia'));
    final mv = (await store.rows('movements')).single;
    expect((mv['qty'], mv['batchId'], mv['type'], mv['ref']), (1, 'b1', 'Refund', 'R-s1'));
    expect((await store.rows('audit')).single['action'], 'Refund');
    expect(() => refundSale(store, Sale.fromRecord(saved), user: 'Tia', settings: const PharmacySettings()), throwsA(isA<RefundProblem>()));
  });

  group('stock adjustments', () {
    const p = Product(id: 'p1', name: 'Amoxa', cost: 300);
    const batches = [BatchStock(id: 'a', batch: 'A', qty: 5, expiry: '2027-01-01'), BatchStock(id: 'b', batch: 'B', qty: 10, expiry: '2028-01-01')];
    Future<double> stock() async => StockIndex.of((await store.rows('movements')).map(Movement.fromRecord)).ofProduct(mainBranch, 'p1');

    test('a count sets the batch to what was counted', () async {
      expect(await adjustStock(store, product: p, batches: batches, mode: AdjustMode.count, batchId: 'a', counted: 3, reason: 'stock take', user: 'T'), -2);
      final m = (await store.rows('movements')).single;
      expect((m['type'], m['batchId'], m['note']), ('Stock count', 'a', 'stock take'));
    });
    test('a removal larger than the batch takes the rest from the next one', () async {
      await adjustStock(store, product: p, batches: batches, mode: AdjustMode.remove, batchId: 'a', qty: 8, reason: 'damaged', user: 'T');
      expect((await store.rows('movements')).map((m) => (m['batchId'], m['qty'])).toSet(), {('a', -5), ('b', -3)});
      expect(await stock(), -8);
      expect(() => adjustStock(store, product: p, batches: batches, mode: AdjustMode.remove, batchId: 'a', qty: 99, reason: 'x', user: 'T'), throwsA(isA<AdjustProblem>()));
    });
    test('adding into a new batch creates it; a reason is required', () async {
      await adjustStock(store, product: p, batches: batches, mode: AdjustMode.add, batchId: 'new', qty: 4, newBatch: 'N1', newExpiry: '2030-01-01', reason: 'found', user: 'T');
      expect((await store.rows('batches')).single['batch'], 'N1');
      expect(() => adjustStock(store, product: p, batches: batches, mode: AdjustMode.add, batchId: 'a', qty: 1, reason: ' ', user: 'T'), throwsA(isA<AdjustProblem>()));
    });
  });

  group('balances', () {
    test('a client owes their unpaid credit sales less what they paid', () async {
      final sales = [sale('c1', '2026-11-01', 10000, paid: 4000, customer: 'grace'), sale('c2', '2026-11-02', 500, customer: 'grace'), sale('c3', '2026-11-02', 900, paid: 0, customer: 'grace', status: 'refunded')];
      await recordPayment(store, kind: 'customer', partyId: 'grace', amount: 2500, date: '2026-11-04', by: 'Tia');
      expect(customerBalance('grace', sales, await store.rows('payments')), 3500);
      expect(() => recordPayment(store, kind: 'customer', partyId: 'grace', amount: 0, date: 'x', by: 'T'), throwsArgumentError);
    });
    test('the pharmacy owes a supplier its unpaid deliveries less payments and credit notes', () {
      final purchases = [Purchase.fromRecord({'id': 'p', 'supplierId': 's1', 'total': 50000, 'paid': 20000})];
      expect(supplierBalance('s1', purchases, [{'kind': 'supplier', 'partyId': 's1', 'amount': 10000}], [{'supplierId': 's1', 'settle': 'credit', 'total': 5000}]), 15000);
    });
  });
}

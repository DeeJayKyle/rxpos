// Sales History parity with the React app: correcting a past sale (stock moved from / back to the right batches, the
// change history and the audit), sales lines, CSV, the A4 invoice and the receipt text.
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:rxpos/core/data/record_store.dart';
import 'package:rxpos/core/database/app_database.dart';
import 'package:rxpos/core/entities/batch.dart';
import 'package:rxpos/core/entities/movement.dart';
import 'package:rxpos/core/entities/product.dart';
import 'package:rxpos/core/entities/sale.dart';
import 'package:rxpos/core/entities/settings.dart';
import 'package:rxpos/core/presentation/export.dart';
import 'package:rxpos/core/rules/stock.dart';
import 'package:rxpos/features/sales_history/domain/sale_edit.dart';
import 'package:rxpos/features/sales_history/presentation/sales_screen.dart' show ageText;
import 'package:rxpos/features/sales_pos/presentation/receipt.dart';

void main() {
  const st = PharmacySettings(name: 'Sample Pharmacy', phone: '0700 000 000');
  final a = Product.fromRecord({'id': 'a', 'name': 'Calmex 500mg', 'price': 500, 'cost': 300});
  final b = Product.fromRecord({'id': 'b', 'name': 'Zinco Syrup', 'price': 6000, 'cost': 4000});
  late AppDatabase db;
  late RecordStore store;
  setUp(() {
    db = AppDatabase(NativeDatabase.memory());
    store = RecordStore(db);
  });
  tearDown(() => db.close());

  Sale sale0() => Sale.fromRecord({
        'id': 's1', 'number': 'RX1', 'date': '2026-11-01T09:00:00.000Z', 'branchId': 'main', 'payment': 'Cash', 'cashier': 'Tia', 'customerName': 'Walk-in Customer',
        'subtotal': 3500, 'discount': 0, 'tax': 0, 'total': 3500, 'paid': 3500, 'tendered': 4000, 'status': 'completed',
        'items': [
          {'id': 'a', 'name': 'Calmex 500mg', 'price': 500, 'cost': 300, 'qty': 7, 'alloc': [{'batchId': 'a1', 'qty': 5, 'batch': 'A1', 'expiry': '2027-01-31'}, {'batchId': 'a2', 'qty': 2, 'batch': 'A2', 'expiry': '2028-01-31'}]},
        ],
      });
  StockView view() => StockView(
        products: [a, b],
        index: StockIndex.of(const [
          Movement(id: 'm1', productId: 'a', qty: 10, batchId: 'a1'), Movement(id: 'm2', productId: 'a', qty: 10, batchId: 'a2'),
          Movement(id: 'm3', productId: 'b', qty: 3, batchId: 'b1'),
        ]),
        batches: const [
          Batch(id: 'a1', productId: 'a', batch: 'A1', expiry: '2027-01-31'), Batch(id: 'a2', productId: 'a', batch: 'A2', expiry: '2028-01-31'),
          Batch(id: 'b1', productId: 'b', batch: 'B1', expiry: '2027-06-30'),
        ],
      );
  List<EditLine> linesOf(Sale s) => [for (final i in s.items) EditLine(id: i.id, name: i.name, price: i.price, qty: i.qty, cost: i.cost, original: i)];

  test('fewer units go back to the batches they came from, last first; a new line is taken first-expiry-first-out', () async {
    final s = sale0();
    final rec = await editSale(store, s,
        lines: [linesOf(s).single.copyWith(qty: 4), const EditLine(id: 'b', name: 'Zinco Syrup', price: 6000, qty: 1, cost: 4000)],
        customerId: 'walk-in', customerName: 'Walk-in Customer', payment: 'Cash', methodType: 'cash', discount: 0, reason: 'wrong quantity entered',
        user: 'Admin', role: 'admin', stock: view(), settings: st, now: DateTime(2026, 11, 5));
    final moves = (await store.rows('movements')).map(Movement.fromRecord).toList();
    expect(moves.map((m) => (m.productId, m.batchId, m.qty, m.type)).toSet(), {('a', 'a2', 2.0, 'Sale edit'), ('a', 'a1', 1.0, 'Sale edit'), ('b', 'b1', -1.0, 'Sale edit')});
    final items = (rec['items'] as List).cast<Map>();
    expect(items.first['alloc'], [{'batchId': 'a1', 'qty': 4, 'batch': 'A1', 'expiry': '2027-01-31'}]);
    expect(items.last['alloc'], [{'batchId': 'b1', 'qty': 1, 'batch': 'B1', 'expiry': '2027-06-30'}]);
    expect((rec['total'], rec['editedBy'], rec['tendered']), (8000.0, 'Admin', 8000.0));
    final edit = (rec['edits'] as List).single as Map;
    expect((edit['reason'], (edit['before'] as Map)['total'], (edit['after'] as Map)['items']), ('wrong quantity entered', 3500.0, '4× Calmex 500mg @ 500, 1× Zinco Syrup @ 6000'));
    final audit = (await store.rows('audit')).single;
    expect((audit['action'], audit['details']), ('Sale edited', 'RX1: UGX 3,500 → UGX 8,000 (wrong quantity entered)'));
    final h = editHistory(Sale.fromRecord(rec));
    expect((h.single.by, h.single.changed('total'), h.single.changed('payment')), ('Admin', true, false));
  });

  test('a removed line goes back to stock entirely; credit keeps what was paid; checks before saving', () async {
    final s = sale0();
    await expectLater(editSale(store, s, lines: linesOf(s), customerId: 'c1', customerName: 'Grace', payment: 'Credit', methodType: 'credit', discount: 0,
        reason: ' ', user: 'A', stock: view(), settings: st), throwsA(isA<SaleEditProblem>()));
    await expectLater(editSale(store, s, lines: [linesOf(s).single.copyWith(qty: 0)], customerId: 'walk-in', customerName: 'W', payment: 'Cash', methodType: 'cash',
        discount: 0, reason: 'x', user: 'A', stock: view(), settings: st), throwsA(isA<SaleEditProblem>()));
    await expectLater(editSale(store, s, lines: [const EditLine(id: 'b', name: 'Zinco Syrup', price: 6000, qty: 9)], customerId: 'walk-in', customerName: 'W', payment: 'Cash',
        methodType: 'cash', discount: 0, reason: 'x', user: 'A', stock: view(), settings: st), throwsA(predicate((e) => '$e' == 'Only 3 more Zinco Syrup in stock')));
    expect(await store.rows('movements'), isEmpty, reason: 'nothing saved when refused');
    final rec = await editSale(store, s, lines: [const EditLine(id: 'b', name: 'Zinco Syrup', price: 6000, qty: 1)], customerId: 'c1', customerName: 'Grace',
        payment: 'Credit', methodType: 'credit', discount: 1000, paid: 2000, reason: 'client changed their mind', user: 'A', stock: view(), settings: st);
    final back = (await store.rows('movements')).where((m) => m['productId'] == 'a').map((m) => (m['batchId'], m['qty'])).toSet();
    expect(back, {('a1', 5), ('a2', 2)});
    expect((rec['total'], rec['paid'], rec['customerName'], rec['discount']), (5000.0, 2000.0, 'Grace', 1000.0));
  });

  test('a sale copied from another system is corrected as a record only', () async {
    final s = Sale.fromRecord({...sale0().toRecord(), 'imported': 'OldPOS'});
    final rec = await editSale(store, s, lines: [linesOf(s).single.copyWith(qty: 2, price: 450)], customerId: 'walk-in', customerName: 'Walk-in Customer',
        payment: 'Cash', methodType: 'cash', discount: 0, reason: 'typo', user: 'A', stock: view(), settings: st);
    expect(await store.rows('movements'), isEmpty);
    expect(((rec['edits'] as List).single as Map)['recordOnly'], true);
  });

  test('sales lines: each line with its share of the discount, cost and profit; refunds left out', () {
    final s = [
      Sale.fromRecord({'id': 's1', 'number': 'R1', 'date': '2026-11-01', 'discount': 100, 'customerName': '', 'items': [
        {'id': 'a', 'name': 'Calmex', 'qty': 2, 'price': 500, 'cost': 300}, {'id': 'b', 'name': 'Zinco', 'qty': 1, 'price': 1000, 'cost': 1100}]}),
      Sale.fromRecord({'id': 's2', 'number': 'R2', 'date': '2026-11-01', 'status': 'refunded', 'items': [{'id': 'a', 'name': 'Calmex', 'qty': 9, 'price': 500}]}),
    ];
    final l = saleLines(s, {'a': 'Calmexol'});
    expect(l.map((x) => (x.name, x.generic, x.customer, x.amount, x.profit)), [('Calmex', 'Calmexol', 'Walk-in', 950.0, 350.0), ('Zinco', '', 'Walk-in', 950.0, -150.0)]);
  });

  test('CSV like the React app; A4 invoice and table PDFs are made', () async {
    expect(toCsv([{'a': 'x', 'b': 'say "hi"'}, {'a': 1, 'b': null}]), 'a,b\n"x","say ""hi"""\n"1",""');
    expect(toCsv(const []), '');
    expect((await invoicePdf(sale0(), st, customerPhone: '0772')).length, greaterThan(1000));
    expect((await tablesPdf(st, title: 'Sales', tables: const [PdfTable(head: ['A', 'B'], body: [['1', '2']], foot: ['T', '3'])])).length, greaterThan(800));
  });

  test('the receipt text for WhatsApp / SMS is the React one', () {
    expect(receiptText(sale0(), st), '*Sample Pharmacy*\nTel: 0700 000 000\nReceipt RX1 · 2026-11-01 09:00\n--------------------------------\n'
        '7 × Calmex 500mg — UGX 3,500\n--------------------------------\n*TOTAL: UGX 3,500*\nPaid (Cash): UGX 3,500\n\nThank you. Get well soon!');
  });

  test('how long ago a draft was started', () {
    final now = DateTime.utc(2026, 11, 5, 12);
    expect([ageText('2026-11-05T11:59:40Z', now: now), ageText('2026-11-05T11:48:00Z', now: now), ageText('2026-11-05T09:00:00Z', now: now), ageText('2026-11-01T12:00:00Z', now: now)],
        ['just now', '12 min ago', '3 h ago', '4 days ago']);
  });
}

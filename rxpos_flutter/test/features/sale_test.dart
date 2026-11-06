// Ringing up and completing a sale: the till's rules (src/pages/POS.jsx) and the records it writes.
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:rxpos/core/data/record_store.dart';
import 'package:rxpos/core/database/app_database.dart';
import 'package:rxpos/core/entities/batch.dart';
import 'package:rxpos/core/entities/movement.dart';
import 'package:rxpos/core/entities/product.dart';
import 'package:rxpos/core/entities/settings.dart';
import 'package:rxpos/core/rules/stock.dart';
import 'package:rxpos/features/sales_pos/domain/cart.dart';

void main() {
  const s = PharmacySettings();
  final para = Product.fromRecord({'id': 'p1', 'name': 'Paramol 500mg', 'unit': 'Tablet', 'price': 60, 'wholesale': 45, 'cost': 30,
    'packs': [{'name': 'Strip', 'size': 10, 'price': 550}, {'name': 'Box', 'size': 100, 'price': 5000, 'wholesale': 4200}]});
  const cash = PaymentMethod(id: 'cash', name: 'Cash', type: 'cash');

  group('adding to the sale', () {
    test('retail sells single units, at the retail price', () {
      final c = addToCart([], para, stock: 150, wholesale: false, settings: s);
      expect((c.single.qty, c.single.price, c.single.pack), (1.0, 60.0, null));
    });
    test('wholesale sells a whole box at the box\'s wholesale price', () {
      final l = addToCart([], para, stock: 150, wholesale: true, settings: s).single;
      expect((l.pack?.name, l.qty, l.pack?.price), ('Box', 100.0, 4200.0));
      expect(l.total, 4200);
    });
    test('wholesale falls back to units when there is not a whole box', () {
      expect(addToCart([], para, stock: 50, wholesale: true, settings: s).single.pack, isNull);
    });
    test('adding again adds one more unit or pack; never beyond stock', () {
      var c = addToCart([], para, stock: 2, wholesale: false, settings: s);
      c = addToCart(c, para, stock: 2, wholesale: false, settings: s);
      expect(c.single.qty, 2);
      expect(() => addToCart(c, para, stock: 2, wholesale: false, settings: s), throwsA(isA<CartProblem>()));
    });
    test('out of stock cannot be added', () => expect(() => addToCart([], para, stock: 0, wholesale: false, settings: s), throwsA(isA<CartProblem>())));
    test('switching a line to strips and back', () {
      final l = addToCart([], para, stock: 150, wholesale: false, settings: s).single;
      final strip = choosePack(l, para, para.packs[0], wholesale: false);
      expect((strip.qty, strip.pack?.price, strip.total), (10.0, 550.0, 550.0));
      expect(setCount(strip, 3).qty, 30);
      expect(() => setCount(strip, 16), throwsA(isA<CartProblem>()));
      expect(choosePack(strip, para, null, wholesale: false).price, 60);
    });
  });

  group('totals', () {
    final cart = [const CartLine(id: 'a', name: 'A', price: 2000 / 3, cost: 0, qty: 3, max: 9), const CartLine(id: 'b', name: 'B', price: 1000, cost: 0, qty: 2, max: 9)];
    test('per-line rounding, discount capped at the subtotal, tax after discount', () {
      final t = totalsOf(cart, discount: 500, settings: const PharmacySettings(taxRate: 18));
      expect((t.subtotal, t.discount, t.tax, t.total), (4000.0, 500.0, 630.0, 4130.0));
      expect(totalsOf(cart, discount: 99999, settings: s).total, 0);
    });
  });

  group('checks before completing', () {
    const line = CartLine(id: 'p1', name: 'P', price: 100, cost: 50, qty: 1, max: 5);
    final t = totalsOf([line], discount: 0, settings: s);
    void ok(List<CartLine> c, Checkout k, [PharmacySettings st = s]) => checkCheckout(c, k, totalsOf(c, discount: 0, settings: st), settings: st);
    test('credit needs a registered client', () => expect(() => ok([line], const Checkout(method: PaymentMethod(id: 'credit', name: 'Credit', type: 'credit'))), throwsA(isA<CartProblem>())));
    test('cash tendered cannot be short', () => expect(() => ok([line], const Checkout(method: cash, tendered: 50)), throwsA(isA<CartProblem>())));
    test('a prescription-only medicine needs the prescription checked', () {
      const rx = CartLine(id: 'p2', name: 'Amoxyl', price: 100, cost: 50, qty: 1, max: 5, rx: true);
      expect(() => ok([rx], const Checkout(method: cash)), throwsA(isA<CartProblem>()));
      ok([rx], const Checkout(method: cash, rxChecked: true));
    });
    test('a controlled drug needs the register entry', () {
      const cd = CartLine(id: 'p3', name: 'Morphine', price: 100, cost: 50, qty: 1, max: 5, controlled: true);
      expect(() => ok([cd], const Checkout(method: cash)), throwsA(isA<CartProblem>()));
      ok([cd], const Checkout(method: cash, controlled: ControlledEntry(patient: 'Grace', prescriber: 'Dr Okello')));
    });
    test('Mobile Money needs the transaction ID', () => expect(() => ok([line], const Checkout(method: PaymentMethod(id: 'momo', name: 'Mobile Money', type: 'momo'))), throwsA(isA<CartProblem>())));
    test('the pharmacy can require a client', () => expect(() => ok([line], const Checkout(method: cash), const PharmacySettings(clientCapture: 'required')), throwsA(isA<CartProblem>())));
    test('an ordinary cash sale passes', () => checkCheckout([line], const Checkout(method: cash), t, settings: s));
  });

  group('completing a sale', () {
    late AppDatabase db;
    late RecordStore store;
    setUp(() {
      db = AppDatabase(NativeDatabase.memory());
      store = RecordStore(db);
    });
    tearDown(() => db.close());

    StockView view(List<Movement> moves) => StockView(products: [para], index: StockIndex.of(moves), batches: const [
          Batch(id: 'b-early', productId: 'p1', batch: 'E1', expiry: '2027-03-31'),
          Batch(id: 'b-late', productId: 'p1', batch: 'L1', expiry: '2029-06-30'),
        ]);

    test('the sale, first-expiry-first-out stock movements and the discount audit line are saved together', () async {
      final stock = view(const [
        Movement(id: 'm1', productId: 'p1', qty: 8, batchId: 'b-early'),
        Movement(id: 'm2', productId: 'p1', qty: 100, batchId: 'b-late'),
      ]);
      final cart = [choosePack(addToCart([], para, stock: 108, wholesale: false, settings: s).single, para, para.packs[0], wholesale: false)];
      final sale = await completeSale(store, cart: cart, c: const Checkout(method: cash, tendered: 1000, discount: 50), settings: s,
          stock: stock, wholesale: false, cashier: 'Tia', now: DateTime(2026, 11, 5));
      expect(sale['total'], 500);
      expect(sale['tendered'], 1000);
      expect(sale['bankId'], 'cash-drawer');
      final item = (sale['items'] as List).single as Map;
      expect(item['pack'], {'name': 'Strip', 'size': 10, 'count': 1, 'price': 550});
      expect((item['alloc'] as List).map((a) => ((a as Map)['batchId'], a['qty'])), [('b-early', 8), ('b-late', 2)]);
      final moves = (await store.rows('movements')).map(Movement.fromRecord).toList();
      expect(moves.map((m) => (m.batchId, m.qty)).toSet(), {('b-early', -8.0), ('b-late', -2.0)});
      expect(moves.every((m) => m.ref == sale['number'] && m.type == 'Sale'), isTrue);
      expect((await store.rows('audit')).single['action'], 'Discount given');
      expect((await db.select(db.outbox).get()).map((o) => o.txn).toSet(), hasLength(1));
    });

    test('a credit sale records what was paid now', () async {
      final cart = addToCart([], para, stock: 100, wholesale: false, settings: s);
      final sale = await completeSale(store, cart: [setCount(cart.single, 10)],
          c: const Checkout(method: PaymentMethod(id: 'credit', name: 'Credit', type: 'credit'), tendered: 200, customerId: 'c1', customerName: 'Grace'),
          settings: s, stock: view(const [Movement(id: 'm', productId: 'p1', qty: 100, batchId: 'b-late')]), wholesale: false, cashier: 'Tia');
      expect((sale['total'], sale['paid'], sale['customerName']), (600, 200, 'Grace'));
    });

    test('stock sold elsewhere since the line was added: the sale is refused with the medicine, nothing is saved', () async {
      final cart = [setCount(addToCart([], para, stock: 10, wholesale: false, settings: s).single, 8)];
      // another device's sale arrived by sync: only 5 left here now
      final now = view(const [Movement(id: 'm', productId: 'p1', qty: 10, batchId: 'b-late'), Movement(id: 'm2', productId: 'p1', qty: -5, batchId: 'b-late')]);
      await expectLater(
        completeSale(store, cart: cart, c: const Checkout(method: cash), settings: s, stock: now, wholesale: false, cashier: 'Tia'),
        throwsA(isA<CartProblem>().having((e) => e.message, 'message', 'Only 5 Paramol 500mg in stock here: lower the quantity or remove it.')),
      );
      expect(await store.rows('sales'), isEmpty);
      expect((await store.rows('movements')).where((m) => m['type'] == 'Sale'), isEmpty);
    });

    test('a refused sale saves nothing', () async {
      await expectLater(completeSale(store, cart: const [], c: const Checkout(method: cash), settings: s, stock: view(const []), wholesale: false, cashier: 'Tia'), throwsA(isA<CartProblem>()));
      expect(await store.rows('sales'), isEmpty);
    });
  });
}

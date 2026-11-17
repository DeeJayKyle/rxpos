// Kits at the Flutter till (1.10, as the React app's src/kits.js and src/pages/POS.jsx): how many can be made, cost and
// price from the medicines, a swap for one sale, the warning to tick, and a kit sale saved exactly as the React app
// saves it (one line with its components and their batches, one Sale movement per batch, the audit lines).
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:rxpos/core/data/record_store.dart';
import 'package:rxpos/core/database/app_database.dart';
import 'package:rxpos/core/entities/batch.dart';
import 'package:rxpos/core/entities/movement.dart';
import 'package:rxpos/core/entities/product.dart';
import 'package:rxpos/core/entities/settings.dart';
import 'package:rxpos/core/rules/fefo.dart';
import 'package:rxpos/core/rules/kits.dart';
import 'package:rxpos/core/rules/stock.dart';
import 'package:rxpos/core/entities/sale.dart';
import 'package:rxpos/features/sales_history/domain/sale_edit.dart';
import 'package:rxpos/features/sales_pos/domain/cart.dart';

void main() {
  const s = PharmacySettings();
  const cash = PaymentMethod(id: 'cash', name: 'Cash', type: 'cash');
  final meds = [
    Product.fromRecord({'id': 'hiv', 'name': 'HIV Test Strip', 'price': 5000, 'cost': 3000}),
    Product.fromRecord({'id': 'lan', 'name': 'Blood Lancets', 'price': 200, 'cost': 100}),
    Product.fromRecord({'id': 'lan2', 'name': 'Safety Lancets', 'price': 250, 'cost': 150}),
  ];
  final kit = <String, Object?>{'id': 'k1', 'name': 'HIV Test Kit', 'barcode': '2000001', 'kit': {
    'icon': 'test-tube', 'color': '#be185d', 'warning': 'Pre-test counselling first.', 'ack': true,
    'items': [{'productId': 'hiv', 'qty': 1}, {'productId': 'lan', 'qty': 2}, {'service': true, 'name': 'Testing fee', 'price': 2000, 'cost': 0}],
  }};
  final byId = {for (final p in meds) p.id: (name: p.name, cost: p.cost, price: p.price, wholesale: p.wholesale, rx: p.rx, controlled: p.controlled, expiry: '')};
  final have = {'hiv': 20.0, 'lan': 7.0, 'lan2': 10.0};
  KitView now([Map<String, String> swaps = const {}]) => kitView(kit, byId, (id) => have[id] ?? 0, swaps: swaps);

  test('can make, cost, price, what runs short and the receipt contents', () {
    final v = now();
    expect(v.canMake, 3, reason: '7 lancets, 2 per kit');
    expect((v.cost, v.price), (3200.0, 7400.0));
    expect(kitShortText(v), 'Blood Lancets running low (7 left)');
    expect(v.contents, '1 × HIV Test Strip · 2 × Blood Lancets · Testing fee');
  });

  test('a kit line: more kits up to what the stock makes, then a swap is offered for the short part', () {
    var cart = addKitToCart([], now(), wholesale: false);
    cart = addKitToCart(cart, now(), wholesale: false);
    cart = addKitToCart(cart, now(), wholesale: false);
    expect(cart.single.qty, 3);
    expect(() => addKitToCart(cart, now(), wholesale: false), throwsA(isA<KitShort>().having((e) => e.component?.productId, 'part', 'lan')));
    // a plain line of lancets takes from what the kits can use
    final mixed = [CartLine(id: 'lan', name: 'Blood Lancets', price: 200, cost: 100, qty: 3, max: 7), ...addKitToCart([], now(), wholesale: false)];
    expect(kitMost(now(), mixed), 2);
  });

  test('a swap for this sale uses the substitute and says so', () {
    final cart = swapKitPartIn(addKitToCart([], now(), wholesale: false), kit, 'lan', 'lan2', now: now, wholesale: false, names: {'lan': 'Blood Lancets'});
    final c = cart.single.kit!.components.firstWhere((x) => x['productId'] == 'lan2');
    expect((c['swappedFrom'], c['swappedFromName']), ('lan', 'Blood Lancets'));
    expect(cart.single.max, 5, reason: '10 safety lancets, 2 per kit');
    // and back
    expect(swapKitPartIn(cart, kit, 'lan', 'lan', now: now, wholesale: false).single.kit!.swaps, isEmpty);
  });

  test('a held kit line keeps its kit (the same fields as the React app)', () {
    final l = addKitToCart([], now(), wholesale: false).single.copyWith(acked: true);
    final back = CartLine.fromJson(l.toJson());
    expect((back.kit!.components.length, back.kit!.ack, back.acked), (2, true, true));
    expect(l.toJson()['kit'], containsPair('components', isA<List>()));
  });

  group('selling a kit', () {
    late AppDatabase db;
    late RecordStore store;
    setUp(() {
      db = AppDatabase(NativeDatabase.memory());
      store = RecordStore(db);
    });
    tearDown(() => db.close());

    final stock = StockView(products: meds, index: StockIndex.of(const [
      Movement(id: 'm1', productId: 'hiv', qty: 20, batchId: 'bh'),
      Movement(id: 'm2', productId: 'lan', qty: 3, batchId: 'bl1'),
      Movement(id: 'm3', productId: 'lan', qty: 4, batchId: 'bl2'),
    ]), batches: const [
      Batch(id: 'bh', productId: 'hiv', batch: 'H1', expiry: '2028-01-31'),
      Batch(id: 'bl1', productId: 'lan', batch: 'L1', expiry: '2027-01-31'),
      Batch(id: 'bl2', productId: 'lan', batch: 'L2', expiry: '2029-01-31'),
    ]);

    test('the warning must be ticked before charging', () {
      final cart = addKitToCart([], now(), wholesale: false);
      expect(() => checkCheckout(cart, const Checkout(method: cash), totalsOf(cart, discount: 0, settings: s), settings: s), throwsA(isA<CartProblem>()));
    });

    test('one sale line for the kit; each medicine leaves stock from its own batches (FEFO), as the React app saves it', () async {
      var cart = addKitToCart([], now(), wholesale: false);
      cart = [addKitToCart(cart, now(), wholesale: false).single.copyWith(acked: true)]; // 2 kits
      final sale = await completeSale(store, cart: cart, c: const Checkout(method: cash), settings: s, stock: stock, wholesale: false, cashier: 'Tia',
          now: DateTime(2026, 11, 17));
      final item = (sale['items'] as List).single as Map;
      expect((item['id'], item['qty'], item['price'], (item['alloc'] as List).length), ('k1', 2, 7400, 0));
      final comps = ((item['kit'] as Map)['components'] as List).cast<Map>();
      expect([for (final c in comps) (c['id'], c['per'], c['qty'])], [('hiv', 1, 2), ('lan', 2, 4)]);
      expect([for (final a in comps[1]['alloc'] as List) ((a as Map)['batchId'], a['qty'])], [('bl1', 3), ('bl2', 1)]);
      expect(((item['kit'] as Map)['acked'], (item['kit'] as Map)['warning']), (true, 'Pre-test counselling first.'));
      final moves = (await store.rows('movements')).map(Movement.fromRecord).toList();
      expect({for (final m in moves) (m.productId, m.batchId, m.qty)}, {('hiv', 'bh', -2.0), ('lan', 'bl1', -3.0), ('lan', 'bl2', -1.0)});
      expect(moves.any((m) => m.productId == 'k1'), isFalse, reason: 'a kit has no stock of its own');
      expect((await store.rows('audit')).map((a) => a['action']), contains('Kit warning given'));
      expect(kitContents(item.cast<String, Object?>()), 'Contains 1 × HIV Test Strip, 2 × Blood Lancets, Testing fee');
      expect(unitsUsed(item.cast<String, Object?>()), [('hiv', 2.0), ('lan', 4.0)]);
    });

    test('editing a kit sale (as the React app): its count stays, its price may change, its contents are kept; removed, its medicines go back', () async {
      final plain = CartLine(id: 'hiv', name: 'HIV Test Strip', price: 5000, cost: 3000, qty: 1, max: 19);
      final sale = Sale.fromRecord(await completeSale(store, cart: [plain, addKitToCart([], now(), wholesale: false).single.copyWith(acked: true)],
          c: const Checkout(method: cash), settings: s, stock: stock, wholesale: false, cashier: 'Tia', now: DateTime(2026, 11, 17)));
      final p = sale.items.firstWhere((x) => x.id == 'hiv'), k = sale.items.firstWhere((x) => x.id == 'k1');
      expect((await store.rows('movements')).length, 3, reason: 'hiv for the line, hiv and lancets for the kit');
      // a new price for the kit, and an attempt to make it 3 kits: the count stays 1, no stock moves
      final edited = await editSale(store, sale, lines: [
        EditLine(id: p.id, name: p.name, price: p.price, qty: 1, cost: p.cost, original: p),
        EditLine(id: k.id, name: k.name, price: 7000, qty: 3, cost: k.cost, original: k),
      ], customerId: 'walk-in', customerName: 'Walk-in Customer', payment: 'Cash', methodType: 'cash', discount: 0, reason: 'agreed price', user: 'Tia', stock: stock, settings: s);
      final item = (edited['items'] as List).cast<Map>().firstWhere((x) => x['id'] == 'k1');
      expect((item['qty'], item['price'], edited['total']), (1, 7000, 12000.0));
      expect(((item['kit'] as Map)['components'] as List).length, 2, reason: 'the kit keeps what it held');
      expect((await store.rows('movements')).length, 3);
      // the kit taken off the sale: each of its medicines goes back to the batch it came from
      await editSale(store, Sale.fromRecord((await store.get('sales', sale.id))!), lines: [EditLine(id: p.id, name: p.name, price: p.price, qty: 1, cost: p.cost, original: p)],
          customerId: 'walk-in', customerName: 'Walk-in Customer', payment: 'Cash', methodType: 'cash', discount: 0, reason: 'kit not taken', user: 'Tia', stock: stock, settings: s);
      final back = (await store.rows('movements')).map(Movement.fromRecord).where((m) => m.type == 'Sale edit').toList();
      expect({for (final m in back) (m.productId, m.batchId, m.qty)}, {('hiv', 'bh', 1.0), ('lan', 'bl1', 2.0)});
    });

    test('a kit and a plain line together can not take more than the stock', () async {
      final cart = [CartLine(id: 'lan', name: 'Blood Lancets', price: 200, cost: 100, qty: 6, max: 7), addKitToCart([], now(), wholesale: false).single.copyWith(acked: true)];
      expect(() => completeSale(store, cart: cart, c: const Checkout(method: cash), settings: s, stock: stock, wholesale: false, cashier: 'Tia'), throwsA(isA<CartProblem>()));
      expect(sellable(stock.batchesOf('lan')), 7);
    });
  });

  test('templates find the pharmacy\'s own medicines by name, in stock first', () {
    final m = matchTemplate(kitTemplates.first.items, [
      (id: 'hiv', name: 'HIV Test Strip', generic: '', inStock: true),
      (id: 'lan', name: 'Blood Lancets', generic: '', inStock: false),
      (id: 'lan2', name: 'Safety Lancets 28G', generic: '', inStock: true),
    ]);
    expect([for (final x in m) x.productId], ['hiv', 'lan2', '', '']);
    expect(m[2].looking, 'alcohol swab');
  });
}

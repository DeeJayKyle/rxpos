// Receiving a delivery (Add Stock): checks, packs, batches, costs and prices, new medicines.
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:rxpos/core/data/record_store.dart';
import 'package:rxpos/core/database/app_database.dart';
import 'package:rxpos/core/entities/movement.dart';
import 'package:rxpos/core/entities/product.dart';
import 'package:rxpos/core/entities/settings.dart';
import 'package:rxpos/core/rules/stock.dart';
import 'package:rxpos/features/stock/domain/delivery.dart';

void main() {
  late AppDatabase db;
  late RecordStore store;
  setUp(() {
    db = AppDatabase(NativeDatabase.memory());
    store = RecordStore(db);
  });
  tearDown(() => db.close());
  const s = PharmacySettings();
  final now = DateTime(2026, 11, 5);
  final products = {'p1': Product.fromRecord({'id': 'p1', 'name': 'Paramol', 'price': 60, 'cost': 30, 'reorder': 0})};

  test('two boxes of 100: 200 tablets in stock, cost per tablet, batch, audit, one transaction', () async {
    final rec = await receiveDelivery(store, lines: const [DeliveryLine(productId: 'p1', qty: 2, recvPack: 'Box', recvSize: 100, unitCost: 3200, price: 70, batch: 'PM2', expiry: '2030-12-31')],
        products: products, settings: s, receivedBy: 'Tia', supplierId: 's1', supplierName: 'Sample Wholesalers', invoice: 'INV-9', now: now);
    expect(rec['total'], 6400);
    final item = (rec['items'] as List).single as Map;
    expect((item['qty'], item['cost'], (item['pack'] as Map)['count']), (200, 32, 2));
    final moves = (await store.rows('movements')).map(Movement.fromRecord).toList();
    expect(StockIndex.of(moves).ofProduct(mainBranch, 'p1'), 200);
    expect(moves.single.ref, 'INV-9');
    final batch = (await store.rows('batches')).single;
    expect((batch['batch'], batch['expiry'], batch['cost'], item['batchId']), ('PM2', '2030-12-31', 32, batch['id']));
    final p = (await store.get('products', 'p1'))!;
    expect((p['cost'], p['price']), (32, 70));
    expect((await store.rows('audit')).map((a) => a['action']).toSet(), {'Price changed', 'Stock received'});
    expect((await db.select(db.outbox).get()).map((o) => o.txn).toSet(), hasLength(1));
  });

  test('a new medicine is added to the list with its price, a barcode and the delivery', () async {
    await receiveDelivery(store, lines: const [DeliveryLine(newName: '  Zinco   Syrup ', qty: 10, unitCost: 4000, price: 6000, batch: 'Z1', expiry: '2029-01-31')],
        products: products, settings: s, receivedBy: 'Tia', now: now);
    final p = (await store.rows('products')).single;
    expect((p['name'], p['price'], p['cost']), ('Zinco Syrup', 6000, 4000));
    expect(p['barcode'], matches(RegExp(r'^20\d{10}$')));
    expect((await store.rows('movements')).single['productId'], p['id']);
  });

  test('checks: quantity, expiry, past expiry, a name already in the list', () async {
    Future<void> bad(List<DeliveryLine> l) => expectLater(receiveDelivery(store, lines: l, products: products, settings: s, receivedBy: 'T', now: now), throwsA(isA<DeliveryProblem>()));
    await bad(const []);
    await bad(const [DeliveryLine(productId: 'p1', qty: 0, expiry: '2030-01-01')]);
    await bad(const [DeliveryLine(productId: 'p1', qty: 1)]);
    await bad(const [DeliveryLine(productId: 'p1', qty: 1, expiry: '2020-01-01')]);
    await bad(const [DeliveryLine(newName: 'paramol', qty: 1, price: 50, expiry: '2030-01-01')]);
    await bad(const [DeliveryLine(newName: 'New one', qty: 1, expiry: '2030-01-01')]);
    expect(await store.rows('movements'), isEmpty);
  });

  test('the same batch received again is reused', () async {
    for (var i = 0; i < 2; i++) {
      await receiveDelivery(store, lines: const [DeliveryLine(productId: 'p1', qty: 5, unitCost: 30, batch: 'X', expiry: '2030-01-01')], products: products, settings: s, receivedBy: 'T', now: now);
    }
    expect(await store.rows('batches'), hasLength(1));
    expect(await store.rows('movements'), hasLength(2));
  });
}

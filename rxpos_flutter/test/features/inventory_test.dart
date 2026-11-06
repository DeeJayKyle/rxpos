// Inventory parity: medicine saves, records that need a look, packs, quick edit, inventory editor, write-off, stock card.
import 'dart:math';

import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:rxpos/core/data/record_store.dart';
import 'package:rxpos/core/database/app_database.dart';
import 'package:rxpos/core/entities/movement.dart';
import 'package:rxpos/core/entities/product.dart';
import 'package:rxpos/core/entities/settings.dart';
import 'package:rxpos/core/rules/fefo.dart';
import 'package:rxpos/features/inventory/domain/medicines.dart';

void main() {
  const st = PharmacySettings(retailMarkup: 50, wholesaleMarkup: 25, priceRound: 50);
  late AppDatabase db;
  late RecordStore store;
  setUp(() {
    db = AppDatabase(NativeDatabase.memory());
    store = RecordStore(db);
  });
  tearDown(() => db.close());

  test('internal barcodes: 20 + 10 digits, never one in use', () {
    final code = newInternalBarcode({}, Random(1));
    expect(RegExp(r'^20\d{10}$').hasMatch(code), isTrue);
    expect(newInternalBarcode({code}, Random(1)), isNot(code));
  });

  test('records that need a look', () {
    final a = Product.fromRecord({'id': 'a', 'name': ' Calmex ', 'price': 100, 'cost': 200, 'barcode': '1'});
    final b = Product.fromRecord({'id': 'b', 'name': 'Zinco', 'form': 'Syrups', 'unit': 'Bottle', 'price': 300, 'cost': 100, 'barcode': '1'});
    final dup = duplicateBarcodes([a, b]);
    expect(recordIssues(a, dup), ['Retail below cost', 'No formulation', 'No selling unit', 'Barcode used twice', 'Spaces around the name']);
    expect(recordIssues(b, dup), ['Barcode used twice']);
  });

  test('saving: markup prices rounded up to the step, generated barcode, opening stock batch; duplicates refused; price change audited', () async {
    final rec = await saveMedicine(store, {'name': 'Ferrozin', 'cost': 130, 'openingStock': 20, 'openingBatch': 'F1', 'openingExpiry': '2030-01-31'},
        all: const [], settings: st, user: 'Tia');
    expect((rec['price'], rec['wholesale']), (200, 200));
    final batch = (await store.rows('batches')).single;
    expect((batch['batch'], batch['expiry']), ('F1', '2030-01-31'));
    expect((await store.rows('movements')).single['qty'], 20);
    final p = Product.fromRecord(rec);
    await expectLater(saveMedicine(store, {'name': 'ferrozin', 'cost': 1}, all: [p], settings: st, user: 'Tia'), throwsA(isA<MedicineProblem>()));
    await saveMedicine(store, {...rec, 'price': 250}, before: p, all: [p], settings: st, user: 'Tia');
    expect((await store.rows('audit')).map((a) => a['action']), ['Medicine added', 'Price changed']);
  });

  test('packs: named and more than one unit; names must differ', () async {
    final p = Product.fromRecord({'id': 'a', 'name': 'Calmex', 'unit': 'Tablet'});
    await expectLater(savePacks(store, p, const [(name: 'Strip', size: '10', price: ''), (name: 'strip', size: '20', price: '')], user: 'T'), throwsA(isA<MedicineProblem>()));
    final packs = await savePacks(store, p, const [(name: 'Strip', size: '10', price: '550'), (name: 'Box', size: '1', price: ''), (name: '', size: '5', price: '')], user: 'T');
    expect(packs, [{'name': 'Strip', 'size': 10, 'price': 550.0}]);
    expect((await store.rows('audit')).single['details'], 'Calmex: Strip = 10 Tablet');
  });

  test('quick edit and missing barcodes', () async {
    final a = Product.fromRecord({'id': 'a', 'name': 'Calmex', 'price': 100}), b = Product.fromRecord({'id': 'b', 'name': 'Zinco', 'barcode': '7'});
    await quickEdit(store, {'a': a, 'b': b}, {'a': {'price': '120', 'shelf': ' A2 '}, 'b': {'reorder': '5'}}, settings: st, user: 'T');
    final rows = {for (final r in await store.rows('products')) r['id']: r};
    expect((rows['a']!['price'], rows['a']!['shelf'], rows['b']!['reorder']), (120.0, 'A2', 5.0));
    expect((await store.rows('audit')).single['details'], 'Calmex: UGX 100 → UGX 120');
    expect(await fillBarcodes(store, [a, b]), 1);
  });

  test('inventory editor: batch number / expiry and quantity with a reason; write-off; stock card balance', () async {
    final p = Product.fromRecord({'id': 'a', 'name': 'Calmex', 'price': 100, 'cost': 60});
    await store.update((d) {
      d.put('batches', {'id': 'b1', 'productId': 'a', 'batch': 'C1', 'expiry': '2029-01-31'});
      d.move(productId: 'a', qty: 10, type: 'Opening stock', batchId: 'b1');
    });
    const b = BatchStock(id: 'b1', productId: 'a', batch: 'C1', expiry: '2029-01-31', qty: 10);
    await expectLater(inventoryEdit(store, p, const {}, [const BatchEdit(b, batch: 'C1', expiry: '2029-01-31', qty: 8)], reason: '', settings: st, user: 'T'),
        throwsA(isA<MedicineProblem>()));
    await inventoryEdit(store, p, const {'price': '120'}, [const BatchEdit(b, batch: 'C1X', expiry: '2029-02-28', qty: 8)], reason: 'damaged', settings: st, user: 'T');
    expect((await store.rows('batches')).single['batch'], 'C1X');
    await writeOffBatch(store, p, const BatchStock(id: 'b1', productId: 'a', batch: 'C1X', qty: 8), settings: st, user: 'T');
    final moves = (await store.rows('movements')).map(Movement.fromRecord);
    expect(stockCard(moves, 'a', 'main').map((x) => (x.$1.type, x.$2)), [('Opening stock', 10.0), ('Inventory edit', 8.0), ('Expired write-off', 0.0)]);
    expect((await store.rows('audit')).map((a) => a['action']), ['Price changed', 'Inventory edited', 'Expired write-off']);
  });
}

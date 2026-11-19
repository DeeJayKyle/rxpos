// 1.14.1, speed: a sale changes stock, not medicines, so the till keeps its medicine list (the pharmacy's medicines
// merged with the 9,710-medicine catalogue and sorted) and its lookups instead of building them again after every sale.
// They are built again when a medicine changes.
import 'package:drift/native.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:rxpos/core/data/pharmacy_providers.dart';
import 'package:rxpos/core/data/record_store.dart';
import 'package:rxpos/core/database/app_database.dart';
import 'package:rxpos/core/entities/product.dart';

void main() {
  test('a sale keeps the medicine list; a changed medicine rebuilds it', () async {
    final db = AppDatabase(NativeDatabase.memory());
    final c = ProviderContainer(overrides: [
      appDatabaseProvider.overrideWithValue(db),
      catalogProvider.overrideWith((ref) async => const <Product>[]),
    ]);
    addTearDown(() async {
      c.dispose();
      await db.close();
    });
    final store = c.read(recordStoreProvider);
    await store.update((d) {
      d.put('products', {'id': 'p1', 'name': 'Calmex 500mg', 'price': 500, 'cost': 300});
      d.put('batches', {'id': 'b1', 'productId': 'p1', 'batch': 'B1', 'expiry': '2030-01-31', 'cost': 300});
      d.put('movements', {'id': 'm1', 'productId': 'p1', 'batchId': 'b1', 'qty': 10, 'branchId': 'main', 'type': 'Opening stock', 'date': '2026-11-01'});
    });
    c.listen(pharmacyProvider, (_, _) {});
    Future<PharmacyData> until(bool Function(PharmacyData d) ok) async {
      for (var i = 0; i < 200; i++) {
        final d = await c.read(pharmacyProvider.future);
        if (ok(d)) return d;
        await Future<void>.delayed(const Duration(milliseconds: 10));
      }
      fail('the pharmacy data did not update');
    }

    final before = await until((d) => d.stockOf('p1') == 10);
    // a sale: one movement out
    await store.update((d) => d.put('movements', {'id': 'm2', 'productId': 'p1', 'batchId': 'b1', 'qty': -3, 'branchId': 'main', 'type': 'Sale', 'date': '2026-11-02'}));
    final after = await until((d) => d.stockOf('p1') == 7);
    expect(identical(after.products, before.products), isTrue, reason: 'the same medicine list, not decoded, merged and sorted again');
    expect(identical(after.byId, before.byId), isTrue, reason: 'the same lookup by id');
    expect(after.stock.batchesOf('p1').single.qty, 7, reason: 'the batch shows the sale');
    // a medicine changes: the list is built again and shows it
    await store.update((d) => d.put('products', {'id': 'p1', 'name': 'Calmex 500mg Tablets', 'price': 550, 'cost': 300}));
    final renamed = await until((d) => d.byId['p1']?.name == 'Calmex 500mg Tablets');
    expect(identical(renamed.products, before.products), isFalse);
    expect(renamed.byId['p1']!.price, 550);
    expect(renamed.stockOf('p1'), 7, reason: 'stock is unchanged by the rename');
  });
}

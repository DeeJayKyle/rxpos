// The store saves each action atomically with its outbox entries (the React store.update() / storage commit contract).
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:rxpos/core/data/record_store.dart';
import 'package:rxpos/core/database/app_database.dart';

void main() {
  late AppDatabase db;
  late RecordStore store;
  var tick = 0;
  setUp(() {
    db = AppDatabase(NativeDatabase.memory());
    store = RecordStore(db, clock: () => '2026-11-05T10:00:0${tick++ % 10}.000Z');
  });
  tearDown(() => db.close());

  Future<int> count(String t) async => (await store.rows(t)).length;

  test('a sale, its stock movements and an audit line are saved together, with one outbox txn', () async {
    final saleId = await store.update((d) {
      final s = d.put('sales', {'number': 'R1', 'total': 1000, 'items': []});
      d.move(productId: 'p1', qty: -2, type: 'Sale', ref: 'R1', user: 'Tia', batchId: 'b1');
      d.audit('Tia', 'Discount given', 'R1: 100');
      return s['id'] as String;
    });
    expect(await count('sales'), 1);
    expect(await count('movements'), 1);
    expect(await count('audit'), 1);
    final sale = await store.get('sales', saleId);
    expect(sale!['updatedAt'], startsWith('2026-11-05T10:00:0'));
    final ops = await db.select(db.outbox).get();
    expect(ops, hasLength(3));
    expect(ops.map((o) => o.txn).toSet(), hasLength(1), reason: 'one action reaches the cloud in one request');
    expect(ops.map((o) => o.op).toSet(), hasLength(3), reason: 'each change has its own op id, so a resend is applied once');
    final mv = (await store.rows('movements')).single;
    expect(mv['qty'], -2);
    expect(mv['batchId'], 'b1');
    expect(mv['branchId'], 'main');
  });

  test('if anything fails, nothing is saved (the till keeps the basket)', () async {
    await expectLater(store.update((d) {
      d.put('sales', {'number': 'R2'});
      d.move(productId: 'p1', qty: -1, type: 'Sale');
      throw StateError('printer exploded');
    }), throwsStateError);
    expect(await count('sales'), 0);
    expect(await count('movements'), 0);
    expect(await db.select(db.outbox).get(), isEmpty);
  });

  test('stock movements and the audit log are never changed or deleted', () async {
    final m = await store.update((d) => d.move(productId: 'p1', qty: 5, type: 'Purchase'));
    await expectLater(store.update((d) => d.put('movements', {...m, 'qty': 50})), throwsA(isA<StoreRefused>()));
    await expectLater(store.update((d) => d.del('movements', m['id'] as String)), throwsA(isA<StoreRefused>()));
    expect((await store.rows('movements')).single['qty'], 5);
  });

  test('a deletion keeps a tombstone and sends a delete', () async {
    await store.update((d) => d.put('customers', {'id': 'c1', 'name': 'Grace'}));
    await store.update((d) => d.del('customers', 'c1'));
    expect(await store.get('customers', 'c1'), isNull);
    expect((await db.select(db.tombstones).get()).single.id, 'c1');
    expect((await db.select(db.outbox).get()).last.deleted, isTrue);
  });

  test('addBatch reuses a batch with the same number and expiry', () async {
    await store.update((d) async {
      final a = await d.addBatch(productId: 'p1', batch: ' PM2 ', expiry: '2030-12-31', cost: 32);
      final b = await d.addBatch(productId: 'p1', batch: 'PM2', expiry: '2030-12-31', cost: 32);
      expect(b['id'], a['id']);
    });
    await store.update((d) async {
      final c = await d.addBatch(productId: 'p1', batch: 'PM2', expiry: '2030-12-31');
      expect(c['batch'], 'PM2');
    });
    expect(await count('batches'), 1);
  });

  test('settings are saved and sent', () async {
    await store.update((d) => d.saveSettings({'name': 'Sample Pharmacy', 'taxRate': 18}));
    final s = await store.settings();
    expect(s.name, 'Sample Pharmacy');
    expect(s.taxRate, 18);
    expect(s.methods.first.name, 'Cash', reason: 'default payment methods when the pharmacy has none');
    expect((await db.select(db.outbox).get()).single.t, 'settings');
  });

  test('an action that changes nothing writes nothing', () async {
    await store.update((d) {});
    expect(await db.select(db.outbox).get(), isEmpty);
  });
}

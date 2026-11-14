// Speed: a watched record type re-reads only when that type changes (core/database/app_database.dart
// createTableVersions), so a synced sale no longer makes every screen re-read its medicines, customers and batches;
// the stock figures are worked out again only when stock movements change. Fictional records.
import 'dart:async';

import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:rxpos/core/data/record_store.dart';
import 'package:rxpos/core/database/app_database.dart';

void main() {
  late AppDatabase db;
  late RecordStore store;
  setUp(() {
    db = AppDatabase(NativeDatabase.memory());
    store = RecordStore(db);
  });
  tearDown(() => db.close());

  Future<void> settle() => Future<void>.delayed(const Duration(milliseconds: 60));

  test('customers re-read only when a customer changes, not when a sale is saved', () async {
    final seen = <int>[];
    final sub = store.watch('customers').listen((rows) => seen.add(rows.length));
    await settle();
    final before = seen.length;
    await store.update((d) => d.put('sales', {'id': 's1', 'total': 5000, 'items': <Object?>[]}));
    await store.update((d) => d.put('sales', {'id': 's2', 'total': 7000, 'items': <Object?>[]}));
    await settle();
    expect(seen.length, before, reason: 'two sales saved: the customers list was not read again');
    await store.update((d) => d.put('customers', {'id': 'c1', 'name': 'Test Client'}));
    await settle();
    expect(seen.length, before + 1);
    expect(seen.last, greaterThanOrEqualTo(1));
    await store.update((d) => d.put('customers', {'id': 'c1', 'name': 'Test Client Renamed'}));
    await settle();
    expect(seen.length, before + 2, reason: 'an edit to a customer (same count) is still seen');
    await store.update((d) => d.del('customers', 'c1'));
    await settle();
    expect(seen.length, before + 3, reason: 'a deletion is seen');
    await sub.cancel();
  });

  test('stock is worked out again only when movements change', () async {
    final seen = <double>[];
    final sub = store.watchStock().listen((s) => seen.add(s.ofBatch('main', 'b1')));
    await settle();
    final before = seen.length;
    await store.update((d) => d.put('customers', {'id': 'c2', 'name': 'Another Client'}));
    await settle();
    expect(seen.length, before, reason: 'a customer saved: stock not recounted');
    await store.update((d) => d.put('movements', {'id': 'm1', 'productId': 'p1', 'batchId': 'b1', 'qty': 12, 'branchId': 'main', 'date': '2026-11-01'}));
    await settle();
    expect(seen.length, before + 1);
    expect(seen.last, 12);
    await sub.cancel();
  });

  test('long lists decode the same off the main isolate', () async {
    final json = [for (var i = 0; i < 2000; i++) '{"id":"r$i","n":$i}'];
    final rows = await decodeAll(json);
    expect(rows, hasLength(2000));
    expect(rows[1999], {'id': 'r1999', 'n': 1999});
  });
}

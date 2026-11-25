// Schema upgrades are tested on real databases of each older version (drift_schemas/, Drift's schema verifier), so an
// app update never loses a pharmacy's records on a device.
import 'package:drift/drift.dart';
import 'package:drift_dev/api/migrations_native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:rxpos/core/database/app_database.dart';

import 'generated/schema.dart';
import 'generated/schema_v1.dart' as v1;

void main() {
  late SchemaVerifier verifier;
  setUpAll(() => verifier = SchemaVerifier(GeneratedHelper()));

  test('version 1 upgrades to version 2 with exactly the expected schema', () async {
    final schema = await verifier.schemaAt(1);
    final db = AppDatabase(schema.newConnection());
    await verifier.migrateAndValidate(db, 2);
    await db.close();
  });

  test('a version 1 device keeps every record, outbox entry and setting through the upgrade', () async {
    final schema = await verifier.schemaAt(1);
    final old = v1.DatabaseAtV1(schema.newConnection());
    await old.into(old.records).insert(v1.RecordsCompanion.insert(t: 'products', id: 'p1', json: '{"id":"p1","name":"Amoxyl","barcode":"6001001"}'));
    await old.into(old.records).insert(v1.RecordsCompanion.insert(t: 'sales', id: 's1', json: '{"id":"s1","total":5000}'));
    await old.into(old.outbox).insert(v1.OutboxCompanion.insert(op: 'op-1', txn: 'tx', t: 'sales', id: 's1', at: '2026-11-05T10:00:00Z'));
    await old.into(old.kv).insert(v1.KvCompanion.insert(k: 'settings', v: '{"name":"Sample Pharmacy"}'));
    await old.close();

    final db = AppDatabase(schema.newConnection());
    expect((await db.select(db.records).get()).where((r) => r.t == 'products' || r.t == 'sales').map((r) => r.id).toSet(), {'p1', 's1'});
    expect((await db.select(db.outbox).get()).single.op, 'op-1', reason: 'unsent changes survive the update');
    expect((await db.select(db.kv).get()).single.v, contains('Sample Pharmacy'));
    await db.close();
  });

  test('the till\'s lookups use the new indexes', () async {
    final db = AppDatabase(DatabaseConnection(await verifier.startAt(2)));
    Future<String> plan(String sql) async =>
        (await db.customSelect('EXPLAIN QUERY PLAN $sql').get()).map((r) => r.read<String>('detail')).join(' | ');
    expect(await plan("SELECT json FROM records WHERE t = 'products' AND json_extract(json, '\$.barcode') = '6001001'"), contains('products_by_barcode'));
    expect(await plan("SELECT json FROM records WHERE t = 'movements' AND json_extract(json, '\$.productId') = 'p1'"), contains('movements_by_product'));
    expect(await plan("SELECT json FROM records WHERE t = 'batches' AND json_extract(json, '\$.productId') = 'p1'"), contains('batches_by_product'));
    await db.close();
  });
}

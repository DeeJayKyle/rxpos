import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:rxpos/core/database/app_database.dart';

void main() {
  late AppDatabase db;
  setUp(() => db = AppDatabase(NativeDatabase.memory()));
  tearDown(() => db.close());

  test('a record and its outbox entry are written together, or not at all', () async {
    await db.transaction(() async {
      await db.into(db.records).insert(RecordsCompanion.insert(t: 'sales', id: 's1', json: '{"id":"s1","total":5000}'));
      await db.into(db.outbox).insert(OutboxCompanion.insert(op: 'op-1', txn: 'tx-1', t: 'sales', id: 's1', at: '2026-11-05T10:00:00Z'));
    });
    expect((await db.select(db.records).get()).where((r) => r.t == 'sales'), hasLength(1));
    expect(await db.select(db.outbox).get(), hasLength(1));

    await expectLater(db.transaction(() async {
      await db.into(db.records).insert(RecordsCompanion.insert(t: 'sales', id: 's2', json: '{}'));
      await db.into(db.outbox).insert(OutboxCompanion.insert(op: 'op-1', txn: 'tx-2', t: 'sales', id: 's2', at: 'x')); // same op: refused
    }), throwsA(anything));
    expect((await db.select(db.records).get()).where((r) => r.t == 'sales').map((r) => r.id), ['s1'], reason: 'the failed sale left nothing behind');
  });

  test('records are keyed by table and id', () async {
    await db.into(db.records).insert(RecordsCompanion.insert(t: 'products', id: 'p1', json: '{"name":"A"}'));
    await db.into(db.records).insertOnConflictUpdate(RecordsCompanion.insert(t: 'products', id: 'p1', json: '{"name":"B"}'));
    await db.into(db.records).insert(RecordsCompanion.insert(t: 'customers', id: 'p1', json: '{}'));
    final rows = await (db.select(db.records)..where((r) => r.t.equals('products'))).get();
    expect(rows.single.json, '{"name":"B"}');
  });
}

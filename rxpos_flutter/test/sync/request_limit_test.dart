import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:rxpos/core/database/app_database.dart';
import 'package:rxpos/core/network/api_failure.dart';
import 'package:rxpos/core/sync/sync_config.dart';
import 'package:rxpos/core/sync/sync_engine.dart';

import 'fake_cloud.dart';

void main() {
  test('request limit preserves an incomplete full download for a later resume', () async {
    final cloud = FakeCloud(pageSize: 1);
    cloud.add('products', 'p1', {'name': 'First'}, '2026-11-01T00:00:00.000Z');
    cloud.add('products', 'p2', {'name': 'Second'}, '2026-11-01T00:01:00.000Z');
    final db = AppDatabase(NativeDatabase.memory());
    final sync = SyncEngine(dio: cloud.dio(), db: db, cloudUrl: 'https://rxposug.com', maxRequests: 1);

    await expectLater(sync.run(), throwsA(isA<ApiFailure>().having((f) => f.kind, 'kind', ApiFailureKind.server)));
    final partial = await SyncConfig.load(db);
    expect(partial.cursor, 1);
    expect(partial.fullInProgress, isTrue);
    expect(partial.needsFullPull, isTrue, reason: 'a capped download must not be marked complete');

    await sync.run();
    final completed = await SyncConfig.load(db);
    expect(completed.fullInProgress, isFalse);
    expect(completed.needsFullPull, isFalse);
    expect((await db.select(db.records).get()).map((r) => r.id).toSet(), {'p1', 'p2'});
    await db.close();
  });
}

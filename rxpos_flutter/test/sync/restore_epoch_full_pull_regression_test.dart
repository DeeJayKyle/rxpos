// Regression for PR #12: after a cloud epoch changes, the next successful run
// must make a full request. Incremental pulls deliberately exclude records
// whose origin is this device, so they cannot reconstruct a restored backup.
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:rxpos/core/data/record_store.dart';
import 'package:rxpos/core/database/app_database.dart';
import 'package:rxpos/core/sync/sync_config.dart';
import 'package:rxpos/core/sync/sync_engine.dart';

import 'fake_cloud.dart';

class _Device {
  _Device(FakeCloud cloud) : db = AppDatabase(NativeDatabase.memory()) {
    store = RecordStore(db, clock: () => '2026-11-05T10:00:00.000Z');
    sync = SyncEngine(
      dio: cloud.dio(),
      db: db,
      cloudUrl: 'https://rxposug.com',
    );
  }

  final AppDatabase db;
  late final RecordStore store;
  late final SyncEngine sync;

  Future<void> close() => db.close();
}

void main() {
  test('an epoch change performs a full pull including this device origin',
      () async {
    final cloud = FakeCloud();
    final device = _Device(cloud);
    addTearDown(device.close);

    await device.sync.run();
    final beforeRestore = await SyncConfig.load(device.db);

    // A normal incremental pull excludes this record because it originated
    // from this device. It is returned only when the client sends all: true.
    cloud.add(
      'products',
      'p-restored-own-record',
      {'name': 'Recovered product'},
      '2026-11-05T10:00:00.000Z',
      origin: beforeRestore.deviceId,
    );
    cloud.epoch = 'epoch-2';

    await device.sync.run();

    expect(cloud.requests.last['all'], isTrue);
    expect(
      (await device.store.rows('products')).map((row) => row['id']).toSet(),
      contains('p-restored-own-record'),
    );
  });
}

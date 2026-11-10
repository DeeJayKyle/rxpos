// The first download and keeping up: paging, resuming after a dropped connection, merge rules, cloud restores.
import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:rxpos/core/data/record_store.dart';
import 'package:rxpos/core/database/app_database.dart';
import 'package:rxpos/core/network/api_failure.dart';
import 'package:rxpos/core/sync/sync_engine.dart';
import 'package:rxpos/core/sync/sync_config.dart';

import 'fake_cloud.dart';

void main() {
  late AppDatabase db;
  late RecordStore store;
  late FakeCloud cloud;
  late SyncEngine down;
  setUp(() {
    db = AppDatabase(NativeDatabase.memory());
    store = RecordStore(db, clock: () => '2026-11-05T09:00:00.000Z');
    cloud = FakeCloud();
    down = SyncEngine(dio: cloud.dio(), db: db, cloudUrl: 'https://rxposug.com');
  });
  tearDown(() => db.close());

  void seed(int n) {
    for (var i = 1; i <= n; i++) {
      cloud.add('products', 'p$i', {'name': 'Medicine $i', 'price': 100 * i}, '2026-11-01T08:00:00.000Z');
    }
  }

  test('the first download brings the whole pharmacy, page by page, with progress', () async {
    seed(1050);
    cloud.add('sales', 's1', {'number': 'R1', 'total': 500}, '2026-11-02T08:00:00.000Z');
    final seen = <int>[];
    final r = await down.run(onProgress: (p) => seen.add(p.received));
    expect(r.received, 1051);
    expect(r.full, isTrue);
    expect(seen, [400, 800, 1051]);
    expect((await store.rows('products')).length, 1050);
    expect((await store.get('sales', 's1'))!['total'], 500);
    final cfg = await SyncConfig.load(db);
    expect(cfg.cursor, 1051);
    expect(cfg.lastSync, isNotNull);
    expect(cfg.needsFullPull, isFalse);
    expect(cloud.requests.first['all'], isTrue, reason: 'the first time, everything is asked for');
    expect(cloud.requests.first['v'], 2);
  });

  test('it talks to the cloud server directly, not through the website', () async {
    final urls = <String>[];
    final dio = cloud.dio()..interceptors.insert(0, InterceptorsWrapper(onRequest: (o, h) { urls.add(o.uri.toString()); h.next(o); }));
    await SyncEngine(dio: dio, db: db, cloudUrl: 'https://rxposug.com/').run();
    expect(urls.first, 'https://api.rxposug.com/api/sync');
    expect(urls.every((u) => u.startsWith('https://api.rxposug.com/api/')), isTrue);
  });

  test('step 7: once in sync, the device asks for its till number once and keeps it', () async {
    cloud.api['till'] = (b) => (200, {'till': 7});
    await down.run();
    expect((await SyncConfig.load(db)).till, 7);
    expect(cloud.calls.where((c) => c.$1 == 'till').single.$2['deviceId'], (await SyncConfig.load(db)).deviceId);
    await down.run();
    expect(cloud.calls.where((c) => c.$1 == 'till'), hasLength(1), reason: 'not asked again');
  });

  test('step 7: a cloud without till numbers changes nothing (old-style numbers, asked again next time)', () async {
    final r = await down.run(); // the fake cloud answers 404 for /api/till
    expect(r.complete, isTrue);
    expect((await SyncConfig.load(db)).till, isNull);
  });

  test('a dropped connection keeps what arrived; the next run resumes without gaps or doubles', () async {
    seed(1000);
    cloud.failOnRequest = 2;
    await expectLater(down.run(), throwsA(isA<ApiFailure>().having((f) => f.kind, 'kind', ApiFailureKind.offline)));
    expect((await store.rows('products')).length, 400, reason: 'page 1 was saved with its position');
    expect((await SyncConfig.load(db)).cursor, 400);
    final r = await down.run();
    expect((await store.rows('products')).length, 1000);
    expect(r.received, 600, reason: 'only what was missing');
    expect(cloud.requests.last['since'], 800);
    expect(cloud.requests.skip(2).every((q) => q['all'] == true), isTrue, reason: 'the resumed first download still asks for everything');
    expect((await SyncConfig.load(db)).needsFullPull, isFalse);
  });

  test('keeping up: later runs ask only for what is new, and not for this device\'s own records', () async {
    seed(3);
    await down.run();
    final me = (await SyncConfig.load(db)).deviceId;
    cloud.add('sales', 's-mine', {'total': 1}, '2026-11-05T08:00:00.000Z', origin: me);
    cloud.add('sales', 's-other', {'total': 2}, '2026-11-05T08:00:01.000Z');
    final r = await down.run();
    expect(r.received, 1);
    expect(r.full, isFalse);
    expect(cloud.requests.last.containsKey('all'), isFalse);
    expect(await store.get('sales', 's-other'), isNotNull);
  });

  group('merging by last writer', () {
    test('a newer local edit is kept; an older one is replaced', () async {
      await store.update((d) => d.put('products', {'id': 'p1', 'name': 'Local name', 'price': 999}));
      cloud.add('products', 'p1', {'name': 'Older cloud name'}, '2026-11-04T00:00:00.000Z');
      cloud.add('products', 'p2', {'name': 'Cloud p2'}, '2026-11-04T00:00:00.000Z');
      await down.run();
      expect((await store.get('products', 'p1'))!['name'], 'Local name');
      cloud.add('products', 'p1', {'name': 'Newer cloud name'}, '2026-11-05T10:00:00.000Z');
      await down.run();
      final p1 = (await store.get('products', 'p1'))!;
      expect(p1['name'], 'Newer cloud name');
      expect(p1['updatedAt'], '2026-11-05T10:00:00.000Z');
    });

    test('a record deleted on this device is not brought back by an older copy', () async {
      await store.update((d) => d.put('customers', {'id': 'c1', 'name': 'Grace'}));
      await store.update((d) => d.del('customers', 'c1'));
      cloud.add('customers', 'c1', {'name': 'Grace'}, '2026-11-04T00:00:00.000Z');
      await down.run();
      expect(await store.get('customers', 'c1'), isNull);
    });

    test('a delete from the cloud removes the local copy', () async {
      cloud.add('customers', 'c2', {'name': 'Henry'}, '2026-11-01T00:00:00.000Z');
      await down.run();
      cloud.delete('customers', 'c2', '2026-11-05T00:00:00.000Z');
      await down.run();
      expect(await store.get('customers', 'c2'), isNull);
    });

    test('settings: the newer copy wins, but the pharmacy\'s details always come from the cloud', () async {
      await store.update((d) => d.saveSettings({'name': 'Typed here', 'autoPrint': true, 'currency': 'KES'}));
      cloud.add('settings', 'settings', {'name': 'Sample Pharmacy', 'currency': 'UGX', 'autoPrint': false}, '2026-11-01T00:00:00.000Z');
      cloud.refuse.add('settings|settings'); // the pharmacy's details are the Owner console's, not this device's
      await down.run();
      final s = await store.settings();
      expect(s.name, 'Sample Pharmacy', reason: 'pharmacy details belong to the Owner console');
      expect(s.currency, 'UGX');
      expect(s.autoPrint, isTrue, reason: 'other settings: the newer local copy is kept');
    });

    test('a table this app version does not know yet is skipped, not an error', () async {
      cloud.add('futureTable', 'x1', {'a': 1}, '2026-11-01T00:00:00.000Z');
      seed(1);
      await down.run();
      expect(await store.get('futureTable', 'x1'), isNull);
      expect(await store.get('products', 'p1'), isNotNull);
    });
  });

  test('a cloud restored from a backup: everything is downloaded again and merged', () async {
    seed(5);
    await down.run();
    cloud.epoch = 'epoch-2';
    final r = await down.run();
    expect(cloud.requests.last['since'], 0);
    expect(r.received, 5);
    expect((await store.rows('products')).length, 5, reason: 'merged, nothing doubled');
    expect((await SyncConfig.load(db)).epoch, 'epoch-2');
  });

  test('"Download everything again" asks for everything once', () async {
    seed(2);
    await down.run();
    await SyncConfig.requestFullPull(db);
    await down.run();
    expect(cloud.requests.last['all'], isTrue);
    expect(cloud.requests.last['since'], 0);
  });

  test('an unexpected reply changes nothing and is reported', () async {
    seed(2);
    cloud.garbageOnRequest = 1;
    await expectLater(down.run(), throwsA(isA<ApiFailure>().having((f) => f.kind, 'kind', ApiFailureKind.server)));
    expect(await store.rows('products'), isEmpty);
    expect((await SyncConfig.load(db)).cursor, 0);
  });

  test('records keep everything the cloud sent', () async {
    cloud.add('sales', 's9', {'number': 'R9', 'items': [{'id': 'p1', 'qty': 2, 'newField': 'x'}], 'extra': {'a': 1}}, '2026-11-01T00:00:00.000Z');
    await down.run();
    final row = await (db.select(db.records)..where((r) => r.id.equals('s9'))).getSingle();
    final j = jsonDecode(row.json) as Map;
    expect(j['extra'], {'a': 1});
    expect(((j['items'] as List).first as Map)['newField'], 'x');
  });

  test('the indexed lookups find downloaded records', () async {
    cloud.add('products', 'p7', {'name': 'Zinco', 'barcode': '7010002'}, '2026-11-01T00:00:00.000Z');
    cloud.add('movements', 'm1', {'productId': 'p7', 'qty': 20}, '2026-11-01T00:00:00.000Z');
    cloud.add('batches', 'b1', {'productId': 'p7', 'batch': 'Z1'}, '2026-11-01T00:00:00.000Z');
    await down.run();
    expect((await store.productByBarcode('7010002'))!['id'], 'p7');
    expect((await store.movementsOf('p7')).single['qty'], 20);
    expect((await store.batchesOf('p7')).single['batch'], 'Z1');
    expect(await store.productByBarcode('nope'), isNull);
  });

  test('stopped at the request limit: not recorded as done; the next run finishes the download', () async {
    seed(1050);
    final capped = SyncEngine(dio: cloud.dio(), db: db, cloudUrl: 'https://rxposug.com', maxRequests: 2);
    final r = await capped.run();
    expect(r.complete, isFalse, reason: 'two pages of three');
    expect(r.received, 800);
    var cfg = await SyncConfig.load(db);
    expect(cfg.lastSync, isNull, reason: 'a cut-off sync must not look finished');
    expect(cfg.fullInProgress, isTrue, reason: 'the first download is still under way');
    expect(cfg.needsFullPull, isTrue);
    expect(cfg.cursor, 800, reason: 'what arrived is kept');

    final rest = await down.run();
    expect(rest.complete, isTrue);
    expect((await store.rows('products')).length, 1050, reason: 'no gaps');
    cfg = await SyncConfig.load(db);
    expect((cfg.lastSync != null, cfg.fullInProgress, cfg.needsFullPull, cfg.cursor), (true, false, false, 1050));
  });

  test('stopped at the request limit while sending: what is left waits in the outbox, nothing is lost', () async {
    for (var i = 0; i < 900; i++) {
      await store.update((d) => d.put('sales', {'id': 'sx$i', 'number': 'R-X$i', 'total': 100}));
    }
    final capped = SyncEngine(dio: cloud.dio(), db: db, cloudUrl: 'https://rxposug.com', maxRequests: 1);
    final r = await capped.run();
    expect((r.complete, r.sent), (false, 400));
    expect((await db.select(db.outbox).get()).length, 500);
    expect((await SyncConfig.load(db)).lastSync, isNull);
    final rest = await down.run();
    expect((rest.complete, rest.sent), (true, 500));
    expect(await db.select(db.outbox).get(), isEmpty);
    expect(cloud.current.keys.where((k) => k.startsWith('sales|')).length, 900);
  });
}

// Sending this device's changes: whole actions together, applied once, refused ones kept for review, and two devices
// selling the same medicine offline both counting.
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:rxpos/core/data/record_store.dart';
import 'package:rxpos/core/database/app_database.dart';
import 'package:rxpos/core/entities/movement.dart';
import 'package:rxpos/core/network/api_failure.dart';
import 'package:rxpos/core/rules/stock.dart';
import 'package:rxpos/core/sync/sync_config.dart';
import 'package:rxpos/core/sync/sync_engine.dart';

import 'fake_cloud.dart';

class Device {
  Device(FakeCloud cloud, String name, {int maxRequests = 100000}) : db = AppDatabase(NativeDatabase.memory()) {
    var n = 0;
    store = RecordStore(db, clock: () => '2026-11-05T10:${(n++).toString().padLeft(2, '0')}:00.000Z-$name'.substring(0, 24));
    sync = SyncEngine(dio: cloud.dio(), db: db, cloudUrl: 'https://rxposug.com', maxRequests: maxRequests);
  }
  final AppDatabase db;
  late final RecordStore store;
  late final SyncEngine sync;

  Future<void> sell(String productId, double qty, String batchId) => store.update((d) {
        final s = d.put('sales', {'number': 'R-${DateTime.now().microsecondsSinceEpoch}', 'total': qty * 500});
        d.move(productId: productId, qty: -qty, type: 'Sale', ref: s['number'] as String, batchId: batchId);
      });

  Future<double> stock(String productId) async =>
      StockIndex.of((await store.rows('movements')).map(Movement.fromRecord)).ofProduct(mainBranch, productId);

  Future<int> waiting() async => (await db.select(db.outbox).get()).length;
}

void main() {
  late FakeCloud cloud;
  setUp(() => cloud = FakeCloud());

  test('a sale and its stock movements reach the cloud together, then leave the outbox', () async {
    final a = Device(cloud, 'A');
    await a.sell('p1', 2, 'b1');
    expect(await a.waiting(), 2);
    final r = await a.sync.run();
    expect(r.sent, 2);
    expect(await a.waiting(), 0);
    final first = cloud.requests.first['changes'] as List;
    expect(first.map((c) => (c as Map)['t']).toSet(), {'sales', 'movements'});
    expect(cloud.current.keys.where((k) => k.startsWith('movements|')), hasLength(1));
    await a.db.close();
  });

  test('one action is never split across requests', () async {
    cloud = FakeCloud();
    final a = Device(cloud, 'A');
    // 3 actions of 150 changes each: 150 + 150 fit one request of 400, the third goes in the next
    for (var k = 0; k < 3; k++) {
      await a.store.update((d) {
        for (var i = 0; i < 150; i++) {
          d.move(productId: 'p$k', qty: 1, type: 'Purchase');
        }
      });
    }
    await a.sync.run();
    final sizes = [for (final q in cloud.requests) (q['changes'] as List).length];
    expect(sizes.take(2), [300, 150]);
    await a.db.close();
  });

  test('a lost reply: the resend is applied once, nothing doubled', () async {
    final a = Device(cloud, 'A');
    await a.sell('p1', 3, 'b1');
    cloud.loseReplyOnRequest = 1;
    await expectLater(a.sync.run(), throwsA(isA<ApiFailure>()));
    expect(await a.waiting(), 2, reason: 'no valid reply: the changes stay waiting');
    await a.sync.run();
    expect(cloud.dupes, 2, reason: 'the cloud recognised both changes from their op ids');
    expect(cloud.current.keys.where((k) => k.startsWith('movements|')), hasLength(1));
    expect(await a.waiting(), 0);
    await a.db.close();
  });

  test('a cloud backup restore keeps local changes until they are safely resent', () async {
    final a = Device(cloud, 'A');
    await a.sync.run(); // remember epoch-1 before the local work
    await a.sell('p1', 2, 'b1');
    expect(await a.waiting(), 2);

    cloud.epoch = 'epoch-2'; // the next reply says the cloud was restored
    await a.sync.run();

    // The restore run must not discard operations based on the stale-epoch reply. The next sync resends
    // them; op ids make that safe if the cloud applied the first request before reporting the restore.
    expect(await a.waiting(), 2);
    await a.sync.run();
    expect(await a.waiting(), 0);
    expect(cloud.current.keys.where((k) => k.startsWith('movements|')), hasLength(1));
    expect(cloud.dupes, greaterThanOrEqualTo(2));
    await a.db.close();
  });

  test('refused changes are kept for review, never dropped; the rest go through', () async {
    final a = Device(cloud, 'A');
    await a.store.update((d) => d.put('products', {'id': 'p-secret', 'name': 'Price change', 'price': 1}));
    await a.store.update((d) => d.put('customers', {'id': 'c1', 'name': 'Grace'}));
    cloud.refuse.add('products|p-secret');
    final r = await a.sync.run();
    expect(r.refused, 1);
    expect(await a.waiting(), 0);
    final rejected = await a.db.select(a.db.rejectedOps).get();
    expect(rejected.single.id, 'p-secret');
    expect(rejected.single.reason, contains('Refused'));
    expect(cloud.current['customers|c1'], isNotNull);
    await a.db.close();
  });

  test('two devices selling the same medicine offline: both sales count everywhere', () async {
    final a = Device(cloud, 'A'), b = Device(cloud, 'B');
    cloud.add('products', 'p1', {'name': 'Amoxyl'}, '2026-11-01T00:00:00.000Z');
    cloud.add('movements', 'm0', {'productId': 'p1', 'qty': 100, 'batchId': 'b1', 'branchId': 'main', 'type': 'Opening stock'}, '2026-11-01T00:00:00.000Z');
    await a.sync.run();
    await b.sync.run();
    expect(await a.stock('p1'), 100);
    // both offline: each sells
    await a.sell('p1', 5, 'b1');
    await b.sell('p1', 7, 'b1');
    expect(await a.stock('p1'), 95);
    expect(await b.stock('p1'), 93);
    // back online, in any order
    await b.sync.run();
    await a.sync.run();
    await b.sync.run();
    expect(await a.stock('p1'), 88);
    expect(await b.stock('p1'), 88);
    expect((await a.store.rows('sales')).length, 2);
    await a.db.close();
    await b.db.close();
  });

  test('an expired sign-in is reported as "sign in again" and nothing is lost', () async {
    final a = Device(cloud, 'A');
    await a.sell('p1', 1, 'b1');
    cloud.expiredOnRequest = 1;
    await expectLater(a.sync.run(), throwsA(isA<ApiFailure>().having((f) => f.kind, 'kind', ApiFailureKind.signInAgain)));
    expect(await a.waiting(), 2);
    await a.db.close();
  });

  test('a deleted record is sent as a delete', () async {
    final a = Device(cloud, 'A');
    await a.store.update((d) => d.put('customers', {'id': 'c9', 'name': 'Temp'}));
    await a.sync.run();
    await a.store.update((d) => d.del('customers', 'c9'));
    await a.sync.run();
    expect(cloud.current['customers|c9']!.deleted, isTrue);
    await a.db.close();
  });

  test('a request limit preserves an incomplete full download for a later resume', () async {
    cloud = FakeCloud(pageSize: 1);
    cloud.add('products', 'p1', {'name': 'First'}, '2026-11-01T00:00:00.000Z');
    cloud.add('products', 'p2', {'name': 'Second'}, '2026-11-01T00:01:00.000Z');
    final a = Device(cloud, 'A', maxRequests: 1);

    await expectLater(a.sync.run(), throwsA(isA<ApiFailure>().having((f) => f.kind, 'kind', ApiFailureKind.server)));
    final partial = await SyncConfig.load(a.db);
    expect(partial.cursor, 1);
    expect(partial.fullInProgress, isTrue);
    expect(partial.needsFullPull, isTrue, reason: 'a capped download must not be marked complete');

    await a.sync.run();
    final completed = await SyncConfig.load(a.db);
    expect(completed.fullInProgress, isFalse);
    expect(completed.needsFullPull, isFalse);
    expect((await a.store.rows('products')).map((r) => r['id']).toSet(), {'p1', 'p2'});
    await a.db.close();
  });

  test('groupOutbox: whole actions per request, an oversized action split', () {
    OutboxRow e(int seq, String txn) => OutboxRow(seq: seq, op: 'op$seq', txn: txn, t: 'movements', id: 'm$seq', deleted: false, at: 'x');
    final entries = [for (var i = 0; i < 3; i++) e(i, 'a'), for (var i = 3; i < 8; i++) e(i, 'b'), for (var i = 8; i < 10; i++) e(i, 'c')];
    expect(groupOutbox(entries, 5).map((g) => g.length), [3, 5, 2]);
    expect(groupOutbox([for (var i = 0; i < 12; i++) e(i, 'big')], 5).map((g) => g.length), [5, 5, 2]);
  });
}

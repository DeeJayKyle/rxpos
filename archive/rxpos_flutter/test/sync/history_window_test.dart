// Faster sync, stage 4 in the Flutter apps (docs/SYNC-HISTORY-WINDOW.md): a device keeping recent history shows the
// same stock and balances as one holding everything, asks the cloud for its window, and drops older history locally.
import 'dart:convert';
import 'dart:io';

import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:rxpos/core/data/record_store.dart';
import 'package:rxpos/core/database/app_database.dart';
import 'package:rxpos/core/entities/movement.dart';
import 'package:rxpos/core/rules/balances.dart';
import 'package:rxpos/core/rules/history_window.dart';
import 'package:rxpos/core/rules/stock.dart';
import 'package:rxpos/core/sync/sync_config.dart';
import 'package:rxpos/core/sync/sync_engine.dart';

import 'fake_cloud.dart';

/// What the cloud's POST /api/balances answers for these records at [w] (worker/window.js balancesAt)
Map<String, Object?> cloudBalances(Map<String, List<Map<String, Object?>>> tables, String w) {
  final bf = broughtForward(tables, w);
  final stock = <String, Map<String, Object?>>{};
  for (final r in tables['movements'] ?? const <Map<String, Object?>>[]) {
    for (final e in entriesOf('movements', r)) {
      if (e.date.compareTo(w) >= 0) continue;
      final x = stock.putIfAbsent(
        '${e.key}|${e.product}',
        () => {'branch': e.branch, 'batch': e.key.substring(e.branch!.length + 1), 'product': e.product, 'qty': 0.0},
      );
      x['qty'] = (x['qty']! as double) + e.amount;
    }
  }
  return {
    'W': w,
    'asOf': 1,
    'stock': stock.values.toList(),
    for (final k in ['customer', 'supplier', 'insurer', 'account', 'loan']) k: bf[k],
  };
}

void main() {
  late AppDatabase db;
  late RecordStore store;
  setUp(() {
    db = AppDatabase(NativeDatabase.memory());
    store = RecordStore(db, clock: () => '2026-11-05T09:00:00.000Z');
  });
  tearDown(() => db.close());

  final cases = ((jsonDecode(File('../tests/balance-cases.json').readAsStringSync()) as Map)['cases'] as List).cast<Map>();
  final tables = <String, List<Map<String, Object?>>>{};
  for (final c in cases) {
    (tables[c['t'] as String] ??= []).add((c['rec'] as Map).cast<String, Object?>());
  }

  Future<void> putAll(Map<String, List<Map<String, Object?>>> t) => store.update((d) {
    for (final MapEntry(key: name, value: rows) in t.entries) {
      for (final r in rows) {
        d.put(name, r);
      }
    }
  });

  for (final w in ['2024-06-01', '2025-01-15']) {
    for (final pruned in [true, false]) {
      test(
        'with window $w the figures equal those of the whole pharmacy (${pruned ? 'older history removed' : 'older records still on the device'})',
        () async {
          final held = {for (final MapEntry(:key, :value) in tables.entries) key: pruned ? value.where((r) => keeps(key, r, w)).toList() : value};
          if (pruned) expect(held.values.fold(0, (a, l) => a + l.length), lessThan(cases.length), reason: 'some history is dropped');
          await putAll(held);
          final sync = (await SyncConfig.load(db)).copyWith(window: w, balances: cloudBalances(tables, w));
          await sync.save(db);
          // stock, added up by SQLite: the movements from w + the brought-forward stock
          final full = StockIndex.of(tables['movements']!.map(Movement.fromRecord));
          final got = await store.stock();
          for (final r in tables['movements']!) {
            final br = '${r['branchId'] ?? ''}'.isEmpty ? 'main' : '${r['branchId']}', p = '${r['productId']}';
            expect(got.ofProduct(br, p), closeTo(full.ofProduct(br, p), 1e-6), reason: '$br $p');
          }
          // money: the cloud's brought-forward + the entries from w of what the device holds
          final win = await store.balanceWindow();
          expect(win, isNotNull);
          final whole = sumEntries(tables);
          for (final kind in ['customer', 'supplier', 'insurer', 'account', 'loan']) {
            final mine = win!.all(kind, {for (final t in entryTables) t: held[t] ?? const []});
            for (final MapEntry(:key, :value) in whole[kind]!.entries) {
              expect(mine[key] ?? 0, closeTo(value, 1e-6), reason: '$kind $key');
            }
          }
        },
      );
    }
  }

  test('figures for another window are not used (plain sums until the right ones arrive)', () async {
    await putAll(tables);
    await (await SyncConfig.load(db)).copyWith(window: '2025-01-15', balances: cloudBalances(tables, '2024-06-01')).save(db);
    expect(await store.balanceWindow(), isNull);
    final full = StockIndex.of(tables['movements']!.map(Movement.fromRecord));
    final r = tables['movements']!.first;
    expect((await store.stock()).everywhere('${r['productId']}'), full.everywhere('${r['productId']}'));
  });

  group('the sync engine', () {
    late FakeCloud cloud;
    late SyncEngine engine;
    final w12 = windowStart(12), w1 = windowStart(1);
    setUp(() {
      cloud = FakeCloud();
      engine = SyncEngine(dio: cloud.dio(), db: db, cloudUrl: 'https://rxposug.com');
      cloud.add('products', 'p1', {'name': 'Panadol'}, '2026-11-01T08:00:00.000Z');
      cloud.add('movements', 'm1', {'productId': 'p1', 'qty': 40, 'date': '${w12}T10:00:00.000Z'}, '2026-11-01T08:00:00.000Z');
    });

    test('a device keeping 12 months asks for its window and the brought-forward figures', () async {
      cloud.api['balances'] = (b) => (
        200,
        {
          'W': b['window'],
          'asOf': 9,
          'stock': [
            {'branch': 'main', 'batch': 'lb-p1', 'product': 'p1', 'qty': 60},
          ],
          'customer': {'c1': 5000},
        },
      );
      await (await SyncConfig.load(db)).copyWith(historyMonths: 12).save(db);
      final r = await engine.run();
      expect(r.complete, isTrue);
      expect(cloud.requests.first['window'], w12, reason: 'the full download leaves out older history');
      expect(cloud.calls.where((c) => c.$1 == 'snapshot').single.$2['window'], w12, reason: 'the ready-made chunks too');
      expect(cloud.calls.where((c) => c.$1 == 'balances').single.$2, {'window': w12});
      final cfg = await SyncConfig.load(db);
      expect((cfg.window, cfg.windowBalances?['asOf']), (w12, 9));
      expect((await store.stock()).everywhere('p1'), 100, reason: '60 brought forward + 40 since');
      expect((await store.balanceWindow())!.one('customer', 'c1', const {}), 5000);
      await engine.run(); // nothing old changed: the figures are not asked for again
      expect(cloud.calls.where((c) => c.$1 == 'balances').length, 1);
      expect(cloud.requests.last['window'], isNull, reason: 'only a full download carries the window');
    });

    test('a cloud or hub without brought-forward figures: the device keeps everything', () async {
      await (await SyncConfig.load(db)).copyWith(historyMonths: 12).save(db);
      await engine.run(); // /api/balances answers 404 here
      final cfg = await SyncConfig.load(db);
      expect((cfg.window, cfg.historyMonths, cfg.balances, cfg.needsFullPull), ('', 0, null, true), reason: 'downloaded again in full next time');
      cloud.requests.clear();
      await engine.run();
      expect((cloud.requests.first['all'], cloud.requests.first['window']), (true, null));
      expect((await SyncConfig.load(db)).needsFullPull, isFalse);
    });

    test('a shorter window removes older history from this device only, keeping open items and unsent changes', () async {
      cloud.api['balances'] = (b) => (200, {'W': b['window'], 'asOf': 1, 'stock': const [], 'customer': const {}});
      await engine.run(); // everything, no window
      final old = '${DateTime.utc(DateTime.now().year - 2, 3, 1).toIso8601String().substring(0, 10)}T09:00:00.000Z';
      await store.update((d) {
        d.put('sales', {'id': 'old-paid', 'total': 500, 'paid': 500, 'date': old});
        d.put('sales', {'id': 'old-owed', 'total': 500, 'paid': 100, 'customerId': 'c1', 'date': old});
        d.put('sales', {'id': 'recent', 'total': 500, 'paid': 500, 'date': '${w1}T09:00:00.000Z'});
        d.put('movements', {'id': 'old-move', 'productId': 'p1', 'qty': 3, 'date': old});
        d.put('customers', {'id': 'c1', 'name': 'Old client', 'createdAt': old});
      });
      await engine.run(); // sent: the outbox is empty again
      await store.update((d) => d.put('sales', {'id': 'old-edited', 'total': 500, 'paid': 500, 'date': old, 'note': 'not sent yet'}));
      cloud.failOnRequest = cloud.requests.length + 1; // the edit stays in the outbox
      await (await SyncConfig.load(db)).copyWith(historyMonths: 1).save(db);
      await expectLater(engine.run(), throwsA(anything));
      expect(await store.get('sales', 'old-paid'), isNull, reason: 'old and settled: removed from this device');
      expect(await store.get('movements', 'old-move'), isNull);
      expect(await store.get('sales', 'old-owed'), isNotNull, reason: 'still owed: kept whatever its age');
      expect(await store.get('sales', 'recent'), isNotNull);
      expect(await store.get('customers', 'c1'), isNotNull, reason: 'clients are kept whole');
      expect(await store.get('sales', 'old-edited'), isNotNull, reason: 'its change has not gone to the cloud yet');
      expect(cloud.current.containsKey('sales|old-paid'), isTrue, reason: 'never removed in the cloud');
      expect((await SyncConfig.load(db)).window, w1);
      cloud.failOnRequest = null;
      await engine.run();
      expect(cloud.current['sales|old-edited']!.rec!['note'], 'not sent yet');
      expect(cloud.calls.where((c) => c.$1 == 'balances').last.$2, {'window': w1});
    });

    test('a longer window (or everything) downloads the pharmacy again with it', () async {
      cloud.api['balances'] = (b) => (200, {'W': b['window'], 'asOf': 1, 'stock': const [], 'customer': const {}});
      await (await SyncConfig.load(db)).copyWith(historyMonths: 1).save(db);
      await engine.run();
      expect((await SyncConfig.load(db)).window, w1);
      await (await SyncConfig.load(db)).copyWith(historyMonths: 12).save(db);
      cloud.requests.clear();
      await engine.run();
      expect((cloud.requests.first['all'], cloud.requests.first['window']), (true, w12));
      await (await SyncConfig.load(db)).copyWith(historyMonths: 0).save(db);
      cloud.requests.clear();
      await engine.run();
      expect((cloud.requests.first['all'], cloud.requests.first['window']), (true, null));
      expect((await SyncConfig.load(db)).windowBalances, isNull);
    });

    test('off by default for now: a device keeps everything unless the owner chooses', () async {
      expect(windowByDefault, isFalse);
      await engine.run();
      expect(cloud.requests.first['window'], isNull);
      expect((await SyncConfig.load(db)).window, '');
    });
  });
}

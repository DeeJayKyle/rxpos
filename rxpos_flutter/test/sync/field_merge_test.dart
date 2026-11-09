// Step 14: field-by-field merge, against the cases shared with the React app and the cloud
// (../tests/field-merge-cases.json, also run by tests/unit-fieldmerge.mjs), then through the store and a download.
import 'dart:convert';
import 'dart:io';

import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:rxpos/core/data/record_store.dart';
import 'package:rxpos/core/database/app_database.dart';
import 'package:rxpos/core/sync/field_merge.dart';
import 'package:rxpos/core/sync/merge.dart';
import 'package:rxpos/core/sync/remote_change.dart';

Map<String, Object?>? _m(Object? v) => (v as Map?)?.cast<String, Object?>();

void main() {
  final cases = jsonDecode(File('../tests/field-merge-cases.json').readAsStringSync()) as Map<String, Object?>;

  group('the shared cases', () {
    for (final c in (cases['merge'] as List).cast<Map<String, Object?>>()) {
      test('merge: ${c['name']}', () {
        final got = mergeFields(_m(c['a']), c['aAt'] as String?, _m(c['b']), c['bAt'] as String?);
        expect(sameRecord(got, _m(c['expect'])!), isTrue, reason: jsonEncode(got));
      });
    }
    for (final c in (cases['stamp'] as List).cast<Map<String, Object?>>()) {
      test('save: ${c['name']}', () {
        final got = stampFields(_m(c['prev']), _m(c['next'])!, c['now'] as String);
        expect(sameRecord(got, _m(c['expect'])!), isTrue, reason: jsonEncode(got));
      });
    }
  });

  group('through the store', () {
    late AppDatabase db;
    var clock = '2026-11-09T09:00:00.000Z';
    setUp(() => db = AppDatabase(NativeDatabase.memory()));
    tearDown(() => db.close());

    test('a price changed here and a reorder level changed on another device both survive', () async {
      final store = RecordStore(db, clock: () => clock);
      await store.update((d) => d.put('products', {'id': 'p1', 'name': 'Amox', 'price': 1000, 'reorder': 10}));
      clock = '2026-11-09T10:00:00.000Z';
      final p = (await store.get('products', 'p1'))!;
      await store.update((d) => d.put('products', {...p, 'price': 1200}));
      final mine = (await store.get('products', 'p1'))!;
      expect(mine['_f'], {'name': '2026-11-09T09:00:00.000Z', 'reorder': '2026-11-09T09:00:00.000Z'}, reason: 'only the price changed now');
      // the other device saved its reorder level at 11:00 from the 09:00 copy
      final theirs = stampFields({'id': 'p1', 'name': 'Amox', 'price': 1000, 'reorder': 10, 'updatedAt': '2026-11-09T09:00:00.000Z'},
          {'id': 'p1', 'name': 'Amox', 'price': 1000, 'reorder': 25}, '2026-11-09T11:00:00.000Z');
      await db.transaction(() => applyRemote(db, [RemoteChange(t: 'products', id: 'p1', rec: theirs, at: '2026-11-09T11:00:00.000Z')]));
      final merged = (await store.get('products', 'p1'))!;
      expect((merged['price'], merged['reorder'], merged['updatedAt']), (1200, 25, '2026-11-09T11:00:00.000Z'));
    });

    test('other tables are unchanged: last writer wins for the whole record', () async {
      final store = RecordStore(db, clock: () => '2026-11-09T12:00:00.000Z');
      await store.update((d) => d.put('events', {'id': 'e1', 'title': 'Stock take', 'note': 'shelf A'}));
      expect((await store.get('events', 'e1'))!.containsKey('_f'), isFalse);
      await db.transaction(() => applyRemote(db, [const RemoteChange(t: 'events', id: 'e1', rec: {'id': 'e1', 'title': 'Stock take moved'}, at: '2026-11-09T13:00:00.000Z')]));
      expect((await store.get('events', 'e1'))!.containsKey('note'), isFalse);
    });
  });
}

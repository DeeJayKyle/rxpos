// Changes from the cloud: one malformed item is skipped, never stops the sync (2026-11 audit).
import 'package:flutter_test/flutter_test.dart';
import 'package:rxpos/core/sync/remote_change.dart';

void main() {
  test('a usable change is read; ids are kept as text', () {
    final c = RemoteChange.tryParse({'t': 'products', 'id': 7, 'at': '2026-11-09T11:00:00.000Z', 'rec': {'id': 7, 'name': 'Calmex'}})!;
    expect((c.t, c.id, c.at, c.rec?['name'], c.deleted), ('products', '7', '2026-11-09T11:00:00.000Z', 'Calmex', false));
    expect(RemoteChange.tryParse({'t': 'sales', 'id': 's1', 'deleted': true})!.deleted, isTrue);
  });

  test('no table, no id or not a map: skipped (null), and fromJson says why', () {
    for (final bad in <Object?>[null, 'x', 3, <Object?>[], {'id': 'a'}, {'t': '', 'id': 'a'}, {'t': 'products'}, {'t': 'products', 'id': ''}, {'t': 5, 'id': 'a'}]) {
      expect(RemoteChange.tryParse(bad), isNull, reason: '$bad');
    }
    expect(() => RemoteChange.fromJson({'id': 'a'}), throwsFormatException);
  });

  test('odd fields are tolerated: a non-text time, a record that is not a map', () {
    final c = RemoteChange.tryParse({'t': 'products', 'id': 'a', 'at': 12, 'rec': 'oops'})!;
    expect((c.at, c.rec), ('', null));
  });

  test('a sync reply keeps the good changes and skips the malformed ones', () {
    final r = SyncReply.parse({
      'changes': [
        {'t': 'products', 'id': 'a', 'rec': {'id': 'a'}},
        'garbage',
        {'id': 'no-table'},
        {'t': 'customers', 'id': 'c1', 'rec': {'id': 'c1'}},
      ],
      'cursor': 42,
      'refusedKeys': ['products|x', null],
      'dupes': 'two',
    })!;
    expect([for (final c in r.changes) '${c.t}|${c.id}'], ['products|a', 'customers|c1']);
    expect((r.cursor, r.dupes), (42, 0));
    expect(r.refusedKeys, ['products|x']);
    expect(r.staleKeys, isEmpty);
    expect(SyncReply.parse({'changes': 'nope', 'cursor': 1}), isNull, reason: 'not a reply at all: nothing is applied');
  });
}

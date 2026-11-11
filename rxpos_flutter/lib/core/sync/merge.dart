// Applying what the cloud sends, with the React app's rules (src/store.jsx mergeRemote):
// - edited records: last writer wins by change time; a local copy at least as new is kept;
// - a record this device deleted (its tombstone at least as new) is not brought back;
// - a delete from the cloud removes the local copy;
// - settings: the newer copy wins, but the pharmacy's details (name, currency, tax…) belong to the Owner console, so
//   the cloud's always win, even over newer local settings.
import 'dart:convert';

import 'package:drift/drift.dart';

import '../data/record_store.dart';
import '../database/app_database.dart';
import 'field_merge.dart';
import 'remote_change.dart';

/// Pharmacy fields the cloud always decides (src/pharmacy-settings.js PHARMACY_FIELDS).
const pharmacyFields = [
  'name', 'phone', 'address', 'license', 'tin', 'currency', 'decimals', 'taxRate', 'retailMarkup', 'wholesaleMarkup',
  'minMargin', 'priceRound', 'nonCashBankId',
];

/// Apply [changes] to the device database. Run inside a transaction together with saving the cursor.
///
/// Faster sync, stage 1 (docs/SYNC-SPEED-PLAN.md): the page's local copies and tombstones are read with one query per
/// table (500 ids at a time) instead of one or two per record, and the writes go to the database as one batch, in
/// the same order. The rules are the same as before.
Future<int> applyRemote(AppDatabase db, List<RemoteChange> changes) async {
  // what this device holds for the records in this page, by table and id (kept up to date as the page is applied)
  final locals = <String, Map<String, RecordRow?>>{};
  final tombs = <String, Map<String, String>>{};
  final ids = <String, Set<String>>{};
  for (final ch in changes) {
    if (ch.t != 'settings' && syncedTables.contains(ch.t)) (ids[ch.t] ??= <String>{}).add(ch.id);
  }
  for (final MapEntry(key: t, value: set) in ids.entries) {
    final list = set.toList();
    final have = locals[t] = <String, RecordRow?>{};
    final gone = tombs[t] = <String, String>{};
    for (var i = 0; i < list.length; i += 500) {
      final part = list.sublist(i, i + 500 > list.length ? list.length : i + 500);
      for (final r in await (db.select(db.records)..where((r) => r.t.equals(t) & r.id.isIn(part))).get()) {
        have[r.id] = r;
      }
      for (final x in await (db.select(db.tombstones)..where((x) => x.t.equals(t) & x.id.isIn(part))).get()) {
        gone[x.id] = x.at;
      }
    }
  }
  final writes = <void Function(Batch)>[];
  void put(String t, String id, Map<String, Object?> rec, String? at) {
    final json = jsonEncode(rec);
    writes.add(
      (b) => b.insert(
        db.records,
        RecordsCompanion.insert(t: t, id: id, json: json, updatedAt: Value(at)),
        mode: InsertMode.insertOrReplace,
      ),
    );
    locals[t]![id] = RecordRow(t: t, id: id, json: json, updatedAt: at);
  }

  var applied = 0;
  for (final ch in changes) {
    if (ch.t == 'settings') {
      if (await _settings(db, ch)) applied++;
      continue;
    }
    if (!syncedTables.contains(ch.t)) continue; // a table this app version does not know yet
    final local = locals[ch.t]![ch.id];
    // step 14: a medicine, client, supplier or batch held here merges field by field (the newer value of each wins)
    if (local != null && !ch.deleted && ch.rec != null && fieldTables.contains(ch.t)) {
      final mine = (jsonDecode(local.json) as Map).cast<String, Object?>();
      final merged = mergeFields(mine, local.updatedAt ?? (mine['updatedAt'] as String?), {
        ...ch.rec!,
        'id': ch.id,
      }, ch.at);
      if (!sameRecord(merged, mine)) {
        put(ch.t, ch.id, merged, merged['updatedAt'] as String?);
        applied++;
      }
      continue;
    }
    if (local != null && (local.updatedAt ?? '').compareTo(ch.at) >= 0) continue;
    if (local == null && !ch.deleted) {
      final tomb = tombs[ch.t]![ch.id];
      if (tomb != null && tomb.compareTo(ch.at) >= 0) continue;
    }
    if (ch.deleted) {
      if (local != null) {
        final t = ch.t, id = ch.id;
        writes.add((b) => b.deleteWhere(db.records, (r) => r.t.equals(t) & r.id.equals(id)));
        locals[ch.t]![ch.id] = null;
        applied++;
      }
      continue;
    }
    put(ch.t, ch.id, {...?ch.rec, 'id': ch.rec?['id'] ?? ch.id, 'updatedAt': ch.at}, ch.at);
    applied++;
  }
  if (writes.isNotEmpty) {
    await db.batch((b) {
      for (final w in writes) {
        w(b);
      }
    });
  }
  return applied;
}

Future<bool> _settings(AppDatabase db, RemoteChange ch) async {
  final row = await (db.select(db.kv)..where((x) => x.k.equals(settingsKey))).getSingleOrNull();
  final local = row == null ? <String, Object?>{} : (jsonDecode(row.v) as Map).cast<String, Object?>();
  final localAt = (local['updatedAt'] as String?) ?? '';
  Map<String, Object?>? next;
  if (localAt.isEmpty || ch.at.compareTo(localAt) > 0) {
    next = {...local, ...?ch.rec, 'updatedAt': ch.at};
  } else if (ch.rec case final rec?) {
    for (final k in pharmacyFields) {
      if (rec.containsKey(k) && jsonEncode(rec[k]) != jsonEncode(local[k])) (next ??= {...local})[k] = rec[k];
    }
  }
  if (next == null) return false;
  await db.into(db.kv).insertOnConflictUpdate(KvCompanion.insert(k: settingsKey, v: jsonEncode(next)));
  return true;
}

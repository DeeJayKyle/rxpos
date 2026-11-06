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
import 'remote_change.dart';

/// Pharmacy fields the cloud always decides (src/pharmacy-settings.js PHARMACY_FIELDS).
const pharmacyFields = [
  'name', 'phone', 'address', 'license', 'tin', 'currency', 'decimals', 'taxRate', 'retailMarkup', 'wholesaleMarkup',
  'minMargin', 'priceRound', 'nonCashBankId',
];

/// Apply [changes] to the device database. Run inside a transaction together with saving the cursor.
Future<int> applyRemote(AppDatabase db, List<RemoteChange> changes) async {
  var applied = 0;
  for (final ch in changes) {
    if (ch.t == 'settings') {
      if (await _settings(db, ch)) applied++;
      continue;
    }
    if (!syncedTables.contains(ch.t)) continue; // a table this app version does not know yet
    final local = await (db.select(db.records)..where((r) => r.t.equals(ch.t) & r.id.equals(ch.id))).getSingleOrNull();
    if (local != null && (local.updatedAt ?? '').compareTo(ch.at) >= 0) continue;
    if (local == null && !ch.deleted) {
      final tomb = await (db.select(db.tombstones)..where((x) => x.t.equals(ch.t) & x.id.equals(ch.id))).getSingleOrNull();
      if (tomb != null && tomb.at.compareTo(ch.at) >= 0) continue;
    }
    if (ch.deleted) {
      if (local != null) {
        await (db.delete(db.records)..where((r) => r.t.equals(ch.t) & r.id.equals(ch.id))).go();
        applied++;
      }
      continue;
    }
    final rec = {...?ch.rec, 'id': ch.rec?['id'] ?? ch.id, 'updatedAt': ch.at};
    await db.into(db.records).insertOnConflictUpdate(
        RecordsCompanion.insert(t: ch.t, id: ch.id, json: jsonEncode(rec), updatedAt: Value(ch.at)));
    applied++;
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

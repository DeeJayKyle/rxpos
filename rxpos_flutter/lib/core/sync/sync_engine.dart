// Sync protocol 2 with the RxPOS cloud (same protocol and cloud as the React app, src/sync.js; docs/ARCHITECTURE.md §3).
// Each request carries one group of this device's waiting changes and brings back what changed elsewhere:
// - waiting changes come from the durable outbox, written in the same transaction as each change; one action (a sale
//   and its stock movements) is never split across requests; each change carries an op id the cloud remembers, so a
//   request repeated after a lost reply is applied once;
// - after a valid reply, in ONE transaction: refused changes move aside for review (never dropped), accepted ones leave
//   the outbox, the pulled records are merged, and the new position is saved; so a crash at any point means a resend
//   (deduplicated) or a re-download (idempotent), never a loss;
// - a full download starts from the beginning once and, if interrupted, resumes from where it stopped.
import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:drift/drift.dart';

import '../database/app_database.dart';
import '../network/api_failure.dart';
import '../rules/ids.dart';
import 'merge.dart';
import 'remote_change.dart';
import 'sync_config.dart';

/// The React app talks to the cloud server directly rather than through the website (src/sync.js apiBase).
const ownSites = ['https://rxposug.com', 'https://www.rxposug.com'];
const liveCloud = 'https://api.rxposug.com';
const pushBatch = 400;

String syncBase(String cloudUrl) {
  final u = cloudUrl.replaceFirst(RegExp(r'/+$'), '');
  return ownSites.contains(u) ? liveCloud : u;
}

/// Outbox entries in request-sized groups, never splitting one action (txn) unless it alone is too big
/// (src/sync.js groupOutbox).
List<List<OutboxRow>> groupOutbox(List<OutboxRow> entries, [int max = pushBatch]) {
  final out = <List<OutboxRow>>[];
  var cur = <OutboxRow>[];
  for (var i = 0; i < entries.length;) {
    var j = i;
    while (j < entries.length && entries[j].txn == entries[i].txn) {
      j++;
    }
    final g = entries.sublist(i, j);
    if (cur.isNotEmpty && cur.length + g.length > max) {
      out.add(cur);
      cur = [];
    }
    if (g.length > max) {
      for (var k = 0; k < g.length; k += max) {
        out.add(g.sublist(k, k + max > g.length ? g.length : k + max));
      }
    } else {
      cur.addAll(g);
    }
    i = j;
  }
  if (cur.isNotEmpty) out.add(cur);
  return out;
}

class SyncProgress {
  const SyncProgress({required this.sent, required this.toSend, required this.received, required this.first});
  final int sent, toSend, received;
  /// the very first download on this device
  final bool first;

  String get label => sent < toSend
      ? 'Sending $sent of $toSend changes'
      : '${first ? 'Downloading the pharmacy' : 'Downloading'}… $received records';
}

class SyncResult {
  const SyncResult({required this.sent, required this.refused, required this.received, required this.applied, required this.full, this.complete = true, this.requeued = 0});
  final int sent, refused, received, applied;
  /// After a cloud restore: how many records were queued to go up again.
  final int requeued;
  final bool full;
  /// false when the run stopped at its request limit with more to send or to fetch: the next run carries on.
  final bool complete;
}

class SyncEngine {
  SyncEngine({required this.dio, required this.db, required this.cloudUrl, this.maxRequests = 100000});

  final Dio dio;
  final AppDatabase db;
  final String cloudUrl;
  final int maxRequests;

  /// Send everything waiting and download everything new. Throws [ApiFailure] (offline, sign in again, refused,
  /// cloud problem); everything confirmed before the failure stays done, and the next run continues from there.
  Future<SyncResult> run({void Function(SyncProgress)? onProgress}) async {
    var cfg = await SyncConfig.load(db);
    final full = cfg.needsFullPull;
    final first = cfg.lastSync == null;
    if (full && !cfg.fullInProgress) {
      cfg = cfg.copyWith(cursor: 0, fullInProgress: true);
      await cfg.save(db);
    }
    final batches = groupOutbox(await (db.select(db.outbox)..orderBy([(o) => OrderingTerm(expression: o.seq)])).get());
    final toSend = batches.fold(0, (a, b) => a + b.length);
    var cursor = cfg.cursor;
    var epoch = cfg.epoch;
    var i = 0, sent = 0, refused = 0, received = 0, applied = 0, requests = 0;
    var complete = false;
    while (requests++ < maxRequests) {
      final batch = i < batches.length ? batches[i] : const <OutboxRow>[];
      final reply = await _post({
        'deviceId': cfg.deviceId, 'since': cursor, 'changes': await _toChanges(batch), 'v': 2, if (full) 'all': true,
      });
      i++;
      final restored = reply.epoch != null && epoch != null && reply.epoch != epoch;
      final refusedKeys = reply.refusedKeys.toSet();
      await db.transaction(() async {
        if (batch.isNotEmpty) {
          for (final e in batch) {
            if (refusedKeys.contains('${e.t}|${e.id}')) {
              await db.into(db.rejectedOps).insert(RejectedOpsCompanion.insert(op: e.op, t: e.t, id: e.id, at: e.at,
                  reason: const Value('Refused by the cloud: no permission for this change, or it is too large.')));
              refused++;
            }
            await (db.delete(db.outbox)..where((o) => o.seq.equals(e.seq))).go();
          }
          sent += batch.length;
        }
        if (restored) {
          // the cloud was restored from a backup: download everything again from the start and merge
          epoch = reply.epoch;
          cursor = 0;
        } else {
          epoch = reply.epoch ?? epoch;
          applied += await applyRemote(db, reply.changes);
          received += reply.changes.length;
          cursor = reply.cursor;
        }
        // a restore also means: once the download is done, send everything this device holds again (see below)
        cfg = cfg.copyWith(cursor: cursor, epoch: epoch, resendAfterRestore: restored ? true : null);
        await cfg.save(db);
      });
      onProgress?.call(SyncProgress(sent: sent, toSend: toSend, received: received, first: first));
      if (restored) continue;
      if (i >= batches.length && !reply.more) {
        complete = true;
        break;
      }
    }
    // Stopped at the request limit with more to send or fetch: what arrived and the cursor are saved (after every
    // batch above), but the run is not finished, so it must not be recorded as done: no lastSync, and a full download
    // stays in progress so the next run resumes it instead of starting a normal sync from a half-downloaded pharmacy.
    if (!complete) return SyncResult(sent: sent, refused: refused, received: received, applied: applied, full: full, complete: false);
    cfg = cfg.copyWith(lastSync: DateTime.now().toUtc().toIso8601String(), lastError: '', fullPull: full ? fullPullVersion : null, fullInProgress: false);
    if (cfg.resendAfterRestore) {
      // The cloud was restored from an older backup. Changes saved after that backup were acknowledged and left the
      // outbox, so the restored cloud lost them and nothing would send them again. Now that this device has merged
      // everything the cloud still has, queue every record, deletion and the settings once more, in one transaction
      // with clearing the flag. Each goes with its own updatedAt, so the cloud keeps whichever copy is newer
      // (last writer wins), and add-only rows are never changed: resending what the cloud already has does nothing.
      final queued = await _resendEverything(cfg);
      return SyncResult(sent: sent, refused: refused, received: received, applied: applied, full: full, complete: queued == 0, requeued: queued);
    }
    await cfg.save(db);
    return SyncResult(sent: sent, refused: refused, received: received, applied: applied, full: full);
  }

  /// Everything this device holds, into the outbox (one action per record), and [cfg] saved with the flag cleared.
  Future<int> _resendEverything(SyncConfig cfg) => db.transaction(() async {
        var n = 0;
        Future<void> queue(String t, String id, String at, {bool deleted = false}) async {
          await db.into(db.outbox).insert(OutboxCompanion.insert(op: uid(), txn: uid(), t: t, id: id, at: at, deleted: Value(deleted)));
          n++;
        }

        final now = DateTime.now().toUtc().toIso8601String();
        final live = <String>{};
        for (final r in await db.select(db.records).get()) {
          live.add('${r.t}|${r.id}');
          if ((jsonDecode(r.json) as Map)['_base'] == true) continue; // an untouched built-in catalogue row
          await queue(r.t, r.id, r.updatedAt ?? now);
        }
        for (final x in await db.select(db.tombstones).get()) {
          // a record deleted and later made again keeps its old tombstone: the record is what this device has now
          if (live.contains('${x.t}|${x.id}')) continue;
          await queue(x.t, x.id, x.at, deleted: true);
        }
        if (await (db.select(db.kv)..where((x) => x.k.equals('settings'))).getSingleOrNull() != null) await queue('settings', 'settings', now);
        await cfg.copyWith(resendAfterRestore: false).save(db);
        return n;
      });

  /// The changes to send for a group of outbox entries: one per record, its current version, with the latest op id
  /// (src/sync.js toChanges).
  Future<List<Map<String, Object?>>> _toChanges(List<OutboxRow> entries) async {
    final latest = <String, OutboxRow>{};
    for (final e in entries) {
      latest['${e.t}|${e.id}'] = e;
    }
    final out = <Map<String, Object?>>[];
    for (final e in latest.values) {
      if (e.deleted) {
        out.add({'t': e.t, 'id': e.id, 'deleted': true, 'at': e.at, 'op': e.op});
      } else if (e.t == 'settings') {
        final row = await (db.select(db.kv)..where((x) => x.k.equals('settings'))).getSingleOrNull();
        if (row == null) continue;
        final rec = (jsonDecode(row.v) as Map).cast<String, Object?>();
        out.add({'t': 'settings', 'id': 'settings', 'rec': rec, 'at': rec['updatedAt'] ?? e.at, 'op': e.op});
      } else {
        final r = await (db.select(db.records)..where((x) => x.t.equals(e.t) & x.id.equals(e.id))).getSingleOrNull();
        if (r == null) continue; // removed since: its delete is a later entry
        final rec = (jsonDecode(r.json) as Map).cast<String, Object?>()..remove('_base');
        out.add({'t': e.t, 'id': e.id, 'rec': rec, 'at': rec['updatedAt'] ?? e.at, 'op': e.op});
      }
    }
    return out;
  }

  Future<SyncReply> _post(Map<String, Object?> body) async {
    final Response<Object?> res;
    try {
      res = await dio.post<Object?>('${syncBase(cloudUrl)}/api/sync', data: body, options: Options(extra: {'retry': true}));
    } on DioException catch (e) {
      final f = e.error;
      throw f is ApiFailure ? f : const ApiFailure(ApiFailureKind.offline, 'No connection to the RxPOS cloud.');
    }
    return SyncReply.parse(res.data) ??
        (throw const ApiFailure(ApiFailureKind.server, 'The cloud sent an unexpected reply; trying again shortly.'));
  }
}

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
  const SyncProgress({required this.sent, required this.toSend, required this.received, required this.first, this.history = false});
  final int sent, toSend, received;
  /// the very first download on this device
  final bool first;
  /// Faster sync, stage 2: the core is in (the app can be used); older records are still coming.
  final bool history;

  String get label => sent < toSend
      ? 'Sending $sent of $toSend changes'
      : '${history ? 'Downloading older records' : first ? 'Downloading the pharmacy' : 'Downloading'}… $received records';
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

/// Records per page asked for (stage 1 of the faster sync; worker/index.js MAX_PAGE).
const pullLimit = 10000;

/// Stage 2: a full download's core has every sale from the last days (today's cash-up, returns); src/sync.js CORE_DAYS.
const coreDays = 3;

/// Stage 3: ready-made chunks downloaded side by side (src/sync.js CHUNKS_AT_ONCE).
const chunksAtOnce = 3;

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
    // Faster sync, stage 2: a full download comes in phases: the core (medicines, stock, clients, staff, debts; the app
    // can be used once it is in), then the history (older cash sales, audit log, messages…), then what changed since
    // the core ended. A cloud without phases sends everything at once (src/sync.js, the same steps).
    if (full && !cfg.fullInProgress) {
      cfg = cfg.copyWith(cursor: 0, fullInProgress: true, phase: 'core', coreCursor: 0,
          cutoff: '${DateTime.now().toUtc().subtract(const Duration(days: coreDays)).toIso8601String().substring(0, 10)}T00:00:00.000Z'); // whole days (stage 3 chunks)
      await cfg.save(db);
    }
    var phase = full ? cfg.phase : null; // a download begun by an older version carries on without phases
    final batches = groupOutbox(await (db.select(db.outbox)..orderBy([(o) => OrderingTerm(expression: o.seq)])).get());
    final toSend = batches.fold(0, (a, b) => a + b.length);
    var cursor = cfg.cursor;
    var epoch = cfg.epoch;
    var i = 0, sent = 0, refused = 0, received = 0, applied = 0, requests = 0;
    var complete = false;
    // Faster sync, stage 1 (docs/SYNC-SPEED-PLAN.md): bigger pages (a cloud before it sends 2,500), and while one page
    // is being saved the next one is already on its way. The cursor is still saved with each page's records.
    Future<SyncReply> ask(int since, List<OutboxRow> batch) async => _post({
          'deviceId': cfg.deviceId, 'since': since, 'changes': await _toChanges(batch), 'v': 2, 'limit': pullLimit, if (full) 'all': true,
          if (phase == 'core' || phase == 'history') ...{'phase': phase, 'cutoff': cfg.cutoff},
        });
    Future<SyncReply>? ahead;
    final chunked = <String>{}; // phases whose ready-made chunks were tried
    try {
      while (requests++ < maxRequests) {
        // stage 3: at the start of a phase of a full download, take the cloud's ready-made chunks (several at once),
        // then page from the last one as before. Each chunk is saved with its position, so a cut-off run resumes.
        if (full && ahead == null && i >= batches.length && (phase == 'core' || phase == 'history') && chunked.add(phase!)) {
          final list = await _snapshotList({'deviceId': cfg.deviceId, 'phase': phase, 'cutoff': cfg.cutoff});
          if (list != null && (epoch == null || list.epoch == epoch)) {
            epoch = list.epoch ?? epoch;
            final todo = [for (final ch in list.chunks) if (ch.$2 > cursor) ch];
            Future<List<RemoteChange>> get((int, int) ch) =>
                _snapshotChunk({'deviceId': cfg.deviceId, 'phase': phase, 'cutoff': cfg.cutoff, 'from': ch.$1, 'to': ch.$2});
            final inFlight = [for (final ch in todo.take(chunksAtOnce)) get(ch)..ignore()];
            for (var k = 0; k < todo.length; k++) {
              final changes = await inFlight[k];
              if (k + chunksAtOnce < todo.length) inFlight.add(get(todo[k + chunksAtOnce])..ignore());
              cursor = todo[k].$2;
              await db.transaction(() async {
                applied += await applyRemote(db, changes);
                cfg = cfg.copyWith(cursor: cursor, epoch: epoch);
                await cfg.save(db);
              });
              received += changes.length;
              onProgress?.call(SyncProgress(sent: sent, toSend: toSend, received: received, first: first, history: phase == 'history'));
            }
          }
        }
        final batch = i < batches.length ? batches[i] : const <OutboxRow>[];
        final reply = await (ahead ?? ask(cursor, batch));
        ahead = null;
        i++;
        // only downloading, and more to come: ask for the next page now, so it travels while this one is saved
        if (i >= batches.length && reply.more && reply.epoch == epoch && requests < maxRequests) {
          ahead = ask(reply.cursor, const []);
        }
        final restored = reply.epoch != null && epoch != null && reply.epoch != epoch;
        // a cloud without phases ignored the phase and sent everything in order: carry on as one plain download
        final plain = !restored && (phase == 'core' || phase == 'history') && reply.phase != phase;
        if (plain) phase = null;
        final refusedKeys = reply.refusedKeys.toSet();
        var moved = false;
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
            if (phase != null) phase = 'core';
          } else {
            epoch = reply.epoch ?? epoch;
            applied += await applyRemote(db, reply.changes);
            received += reply.changes.length;
            cursor = reply.cursor;
          }
          // a restore also means: once the download is done, send everything this device holds again (see below)
          cfg = cfg.copyWith(cursor: cursor, epoch: epoch, resendAfterRestore: restored ? true : null,
              phase: phase, clearPhase: phase == null, coreCursor: restored ? 0 : null);
          // the core is in: the history next, from the start; then what changed since the core ended
          if (!restored && i >= batches.length && !reply.more && (phase == 'core' || phase == 'history')) {
            moved = true;
            if (phase == 'core') {
              phase = 'history';
              cfg = cfg.copyWith(phase: phase, coreCursor: cursor, cursor: 0);
              cursor = 0;
            } else {
              phase = 'tail';
              cursor = cfg.coreCursor;
              cfg = cfg.copyWith(phase: phase, cursor: cursor);
            }
          }
          await cfg.save(db);
        });
        onProgress?.call(SyncProgress(sent: sent, toSend: toSend, received: received, first: first, history: phase == 'history' || phase == 'tail'));
        if (restored) continue;
        if (i >= batches.length && !reply.more) {
          if (moved) continue; // on to the next phase
          complete = true;
          break;
        }
      }
    } finally {
      ahead?.ignore(); // stopped early (an error, or the request limit): the page asked for ahead is not used
    }
    // Stopped at the request limit with more to send or fetch: what arrived and the cursor are saved (after every
    // batch above), but the run is not finished, so it must not be recorded as done: no lastSync, and a full download
    // stays in progress so the next run resumes it instead of starting a normal sync from a half-downloaded pharmacy.
    if (!complete) return SyncResult(sent: sent, refused: refused, received: received, applied: applied, full: full, complete: false);
    cfg = cfg.copyWith(lastSync: DateTime.now().toUtc().toIso8601String(), lastError: '', fullPull: full ? fullPullVersion : null, fullInProgress: false, clearPhase: true);
    // step 7: once in sync, a device without a till number asks for one (document numbers, core/rules/doc_numbers.dart).
    // A cloud or hub without /api/till, or no answer: old-style numbers for now, asked again after the next sync.
    if (cfg.till == null) {
      try {
        final r = await dio.post<Object?>('${syncBase(cloudUrl)}/api/till', data: {'deviceId': cfg.deviceId});
        final n = r.data is Map ? (r.data as Map)['till'] : null;
        if (n is num && n > 0) cfg = cfg.copyWith(till: n.toInt());
      } catch (_) {/* not this time */}
    }
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

  /// Stage 3: the ready-made chunks of a full download's phase (from, to), or null when the cloud has none (a hub,
  /// an older cloud, or any problem): the download then pages as before (src/sync.js snapshotList).
  Future<({String? epoch, List<(int, int)> chunks})?> _snapshotList(Map<String, Object?> body) async {
    try {
      final res = await dio.post<Object?>('${syncBase(cloudUrl)}/api/snapshot', data: body);
      final d = res.data;
      if (d is! Map || d['chunks'] is! List) return null;
      return (
        epoch: d['epoch']?.toString(),
        chunks: [for (final c in d['chunks'] as List) if (c is Map && c['from'] is num && c['to'] is num) ((c['from'] as num).toInt(), (c['to'] as num).toInt())],
      );
    } catch (_) {
      return null;
    }
  }

  /// One chunk's records (sent compressed; the HTTP client undoes it).
  Future<List<RemoteChange>> _snapshotChunk(Map<String, Object?> body) async {
    final Response<Object?> res;
    try {
      res = await dio.post<Object?>('${syncBase(cloudUrl)}/api/snapshot/chunk', data: body, options: Options(extra: {'retry': true}));
    } on DioException catch (e) {
      final f = e.error;
      throw f is ApiFailure ? f : const ApiFailure(ApiFailureKind.offline, 'No connection to the RxPOS cloud.');
    }
    final d = res.data;
    if (d is! Map || d['changes'] is! List) throw const ApiFailure(ApiFailureKind.server, 'The cloud sent an unexpected reply; trying again shortly.');
    return [for (final x in d['changes'] as List) if (x is Map) RemoteChange.fromJson(x.cast<String, Object?>())];
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

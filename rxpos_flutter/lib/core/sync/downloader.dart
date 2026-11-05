// Downloading the pharmacy from the cloud (the pull half of sync protocol 2; sending local changes is step 3).
// Page by page by the cloud's sequence number. Each page's records and the new position are saved in ONE
// transaction, so an interrupted download resumes exactly where it stopped, with nothing missing or doubled.
import 'package:dio/dio.dart';

import '../database/app_database.dart';
import '../network/api_failure.dart';
import 'merge.dart';
import 'remote_change.dart';
import 'sync_config.dart';

/// The React app talks to the cloud server directly rather than through the website (src/sync.js apiBase).
const ownSites = ['https://rxposug.com', 'https://www.rxposug.com'];
const liveCloud = 'https://api.rxposug.com';

String syncBase(String cloudUrl) {
  final u = cloudUrl.replaceFirst(RegExp(r'/+$'), '');
  return ownSites.contains(u) ? liveCloud : u;
}

class DownloadProgress {
  const DownloadProgress({required this.records, required this.pages, required this.first});
  /// records received so far in this run
  final int records;
  final int pages;
  /// the very first download on this device
  final bool first;

  String get label => '${first ? 'Downloading the pharmacy' : 'Downloading'}… $records records';
}

class DownloadResult {
  const DownloadResult({required this.records, required this.applied, required this.full});
  final int records;
  final int applied;
  final bool full;
}

class Downloader {
  Downloader({required this.dio, required this.db, required this.cloudUrl, this.maxPages = 100000});

  final Dio dio;
  final AppDatabase db;
  final String cloudUrl;
  final int maxPages;

  /// Download everything the cloud has after this device's position (everything, the first time or when a full
  /// download is due) and merge it. Throws [ApiFailure] (offline, sign in again, cloud problem); what was saved before
  /// the failure stays, and the next run continues from there.
  Future<DownloadResult> run({void Function(DownloadProgress)? onProgress}) async {
    var cfg = await SyncConfig.load(db);
    final full = cfg.needsFullPull;
    final first = cfg.lastSync == null;
    // a full download starts from the beginning once; if it is interrupted, the next run resumes it
    if (full && !cfg.fullInProgress) {
      cfg = cfg.copyWith(cursor: 0, fullInProgress: true);
      await cfg.save(db);
    }
    var cursor = cfg.cursor;
    var epoch = cfg.epoch;
    var records = 0, applied = 0, pages = 0;
    while (pages < maxPages) {
      final reply = await _post({'deviceId': cfg.deviceId, 'since': cursor, 'changes': const [], 'v': 2, if (full) 'all': true});
      pages++;
      // the cloud was restored from a backup: download everything again from the start and merge
      if (reply.epoch != null && epoch != null && reply.epoch != epoch) {
        epoch = reply.epoch;
        cursor = 0;
        cfg = cfg.copyWith(cursor: 0, epoch: epoch);
        await cfg.save(db);
        continue;
      }
      epoch = reply.epoch ?? epoch;
      await db.transaction(() async {
        applied += await applyRemote(db, reply.changes);
        cfg = cfg.copyWith(cursor: reply.cursor, epoch: epoch);
        await cfg.save(db);
      });
      cursor = reply.cursor;
      records += reply.changes.length;
      onProgress?.call(DownloadProgress(records: records, pages: pages, first: first));
      if (!reply.more) break;
    }
    cfg = cfg.copyWith(lastSync: DateTime.now().toUtc().toIso8601String(), lastError: '', fullPull: full ? fullPullVersion : null, fullInProgress: false);
    await cfg.save(db);
    return DownloadResult(records: records, applied: applied, full: full);
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

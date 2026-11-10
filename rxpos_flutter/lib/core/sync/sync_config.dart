import 'dart:convert';


import '../database/app_database.dart';
import '../rules/ids.dart';

/// Raised when every installed app must download the whole pharmacy again once and merge it (same number as
/// src/sync.js FULL_PULL, so a device that already did it in the React app's history is treated the same way).
const fullPullVersion = 1;

const _key = 'sync';

/// Where this device is in the conversation with the cloud, kept in the device database (kv "sync").
class SyncConfig {
  const SyncConfig({required this.deviceId, this.cursor = 0, this.epoch, this.fullPull = 0, this.fullInProgress = false, this.lastSync, this.lastError = '', this.resendAfterRestore = false, this.till});

  /// This device's id: the cloud does not send a device the records it wrote itself (unless a full download).
  final String deviceId;
  /// The cloud's sequence number this device has everything up to.
  final int cursor;
  /// Changes when the cloud is restored from a backup: everything is then downloaded again and merged.
  final String? epoch;
  final int fullPull;
  /// A full download started and was interrupted: the next run resumes it from [cursor] instead of starting again,
  /// so a large pharmacy's first download finishes even on a connection that keeps dropping.
  final bool fullInProgress;
  final String? lastSync;
  final String lastError;
  /// The cloud was restored from an older backup: once everything is downloaded again, this device sends everything
  /// it holds once more, so changes made after that backup (by any device that reached this one) are not lost.
  final bool resendAfterRestore;
  /// Step 7: this device's till number in its pharmacy (from the cloud's /api/till), for document numbers such as
  /// R-NTD-03-000412 (core/rules/doc_numbers.dart). Empty until the cloud has given one.
  final int? till;

  bool get needsFullPull => fullPull < fullPullVersion;

  SyncConfig copyWith({int? cursor, String? epoch, int? fullPull, bool? fullInProgress, String? lastSync, String? lastError, bool? resendAfterRestore, int? till}) => SyncConfig(
      deviceId: deviceId, cursor: cursor ?? this.cursor, epoch: epoch ?? this.epoch, fullPull: fullPull ?? this.fullPull,
      fullInProgress: fullInProgress ?? this.fullInProgress, lastSync: lastSync ?? this.lastSync, lastError: lastError ?? this.lastError,
      resendAfterRestore: resendAfterRestore ?? this.resendAfterRestore, till: till ?? this.till);

  Map<String, Object?> toJson() => {'deviceId': deviceId, 'cursor': cursor, 'epoch': epoch, 'fullPull': fullPull,
    'fullInProgress': fullInProgress, 'lastSync': lastSync, 'lastError': lastError, 'resendAfterRestore': resendAfterRestore, 'till': till};

  factory SyncConfig.fromJson(Map<String, Object?> j) => SyncConfig(
      deviceId: j['deviceId'] as String, cursor: (j['cursor'] as num?)?.toInt() ?? 0, epoch: j['epoch'] as String?,
      fullPull: (j['fullPull'] as num?)?.toInt() ?? 0, fullInProgress: j['fullInProgress'] == true, lastSync: j['lastSync'] as String?, lastError: (j['lastError'] as String?) ?? '',
      resendAfterRestore: j['resendAfterRestore'] == true, till: (j['till'] as num?)?.toInt());

  /// This device's sync state (made, with a new device id, the first time).
  static Future<SyncConfig> load(AppDatabase db) async {
    final row = await (db.select(db.kv)..where((x) => x.k.equals(_key))).getSingleOrNull();
    if (row != null) return SyncConfig.fromJson((jsonDecode(row.v) as Map).cast<String, Object?>());
    final fresh = SyncConfig(deviceId: 'dev-${uid()}');
    await fresh.save(db);
    return fresh;
  }

  Future<void> save(AppDatabase db) => db.into(db.kv).insertOnConflictUpdate(KvCompanion.insert(k: _key, v: jsonEncode(toJson())));

  /// "Download everything again": the next sync downloads the whole pharmacy and merges it.
  static Future<void> requestFullPull(AppDatabase db) async => (await load(db)).copyWith(fullPull: 0, fullInProgress: false).save(db);
}


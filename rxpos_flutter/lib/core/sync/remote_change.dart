/// One change as the cloud sends it (src/contracts.d.ts Change).
class RemoteChange {
  const RemoteChange({required this.t, required this.id, required this.at, this.rec, this.deleted = false});

  factory RemoteChange.fromJson(Map<String, Object?> j) => RemoteChange(
        t: j['t'] as String,
        id: '${j['id']}',
        at: (j['at'] as String?) ?? '',
        rec: (j['rec'] as Map?)?.cast<String, Object?>(),
        deleted: j['deleted'] == true,
      );

  final String t;
  final String id;
  final String at;
  final Map<String, Object?>? rec;
  final bool deleted;
}

/// The cloud's reply to POST /api/sync (src/contracts.d.ts SyncResponse).
class SyncReply {
  const SyncReply({required this.changes, required this.cursor, required this.more, this.epoch, this.refusedKeys = const [], this.dupes = 0, this.tenant, this.phase});

  final List<RemoteChange> changes;
  final int cursor;
  final bool more;
  final String? epoch;
  final List<String> refusedKeys;
  final int dupes;
  final String? tenant;
  /// Faster sync, stage 2: the phase the cloud sent ('core' or 'history'); null from a cloud without phases.
  final String? phase;

  /// Null when the reply is not a valid sync reply (then nothing is applied and the sync is tried again).
  static SyncReply? parse(Object? body) {
    if (body is! Map) return null;
    final changes = body['changes'], cursor = body['cursor'];
    final c = cursor is num ? cursor : num.tryParse('$cursor');
    if (changes is! List || c == null || !c.isFinite) return null;
    return SyncReply(
      changes: [for (final x in changes) if (x is Map) RemoteChange.fromJson(x.cast<String, Object?>())],
      cursor: c.toInt(),
      more: body['more'] == true,
      epoch: body['epoch']?.toString(),
      refusedKeys: [for (final k in (body['refusedKeys'] as List?) ?? const []) '$k'],
      dupes: (body['dupes'] as num?)?.toInt() ?? 0,
      tenant: body['tenant']?.toString(),
      phase: body['phase'] is String ? body['phase'] as String : null,
    );
  }
}

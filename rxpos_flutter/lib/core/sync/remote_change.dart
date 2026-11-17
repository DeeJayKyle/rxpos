/// One change as the cloud sends it (src/contracts.d.ts Change).
class RemoteChange {
  const RemoteChange({required this.t, required this.id, required this.at, this.rec, this.deleted = false});

  /// Throws [FormatException] when the change has no table name or id; [tryParse] skips such a change instead.
  factory RemoteChange.fromJson(Map<String, Object?> j) {
    final c = tryParse(j);
    if (c == null) throw FormatException('Not a sync change', j);
    return c;
  }

  /// Null when [j] is not a usable change (no table name or id), so one malformed item never stops a sync.
  static RemoteChange? tryParse(Object? j) {
    if (j is! Map) return null;
    final t = j['t'], id = j['id'], at = j['at'], rec = j['rec'];
    if (t is! String || t.isEmpty || id == null || '$id'.isEmpty) return null;
    return RemoteChange(
      t: t,
      id: '$id',
      at: at is String ? at : '',
      rec: rec is Map ? rec.cast<String, Object?>() : null,
      deleted: j['deleted'] == true,
    );
  }

  final String t;
  final String id;
  final String at;
  final Map<String, Object?>? rec;
  final bool deleted;
}

/// The cloud's reply to POST /api/sync (src/contracts.d.ts SyncResponse).
class SyncReply {
  const SyncReply({required this.changes, required this.cursor, required this.more, this.epoch, this.refusedKeys = const [], this.dupes = 0, this.tenant, this.phase, this.staleKeys = const [], this.view});

  final List<RemoteChange> changes;
  final int cursor;
  final bool more;
  final String? epoch;
  final List<String> refusedKeys;
  final int dupes;
  final String? tenant;
  /// Faster sync, stage 2: the phase the cloud sent ('core' or 'history'); null from a cloud without phases.
  final String? phase;
  /// 2026-11 audit: changes the cloud kept its newer copy over (its copy comes in [changes]), and the role view.
  final List<String> staleKeys;
  final String? view;

  /// Null when the reply is not a valid sync reply (then nothing is applied and the sync is tried again).
  static SyncReply? parse(Object? body) {
    if (body is! Map) return null;
    final changes = body['changes'], cursor = body['cursor'];
    final c = cursor is num ? cursor : num.tryParse('$cursor');
    if (changes is! List || c == null || !c.isFinite) return null;
    return SyncReply(
      changes: [for (final x in changes) if (RemoteChange.tryParse(x) case final rc?) rc],
      cursor: c.toInt(),
      more: body['more'] == true,
      epoch: body['epoch']?.toString(),
      refusedKeys: _keys(body['refusedKeys']),
      dupes: switch (body['dupes']) { final num d when d.isFinite => d.toInt(), _ => 0 },
      tenant: body['tenant']?.toString(),
      phase: body['phase'] is String ? body['phase'] as String : null,
      staleKeys: _keys(body['staleKeys']),
      view: body['view'] is String ? body['view'] as String : null,
    );
  }

  static List<String> _keys(Object? v) => [if (v is List) for (final k in v) if (k != null) '$k'];
}

// Field-by-field merge for master data (workplan step 14): the same rules as src/fieldmerge.js, checked against the
// same cases (tests/field-merge-cases.json). Each medicine, client, supplier or batch carries `_f`, the time each field
// last changed (only fields older than the record's updatedAt, and removals), and merges keep the newer value of each
// field, so a price changed on one device and a reorder level changed on another both survive. A field that is
// absent with no time is unknown to whoever wrote the record and never erases a value. Ties keep the existing copy.
import 'dart:convert';

/// Tables merged field by field.
const fieldTables = {'products', 'customers', 'suppliers', 'batches'};
const _meta = {'id', 'updatedAt', '_f'};

Map<String, Object?> _times(Map<String, Object?>? r) => ((r?['_f'] as Map?) ?? const {}).cast<String, Object?>();
Iterable<String> _keys(Map<String, Object?>? r) => (r ?? const {}).keys.where((k) => !_meta.contains(k));

/// When field [k] of [r] last changed ('' = unknown).
String fieldTime(Map<String, Object?>? r, String? at, String k) {
  final own = _times(r)[k];
  if (own is String && own.isNotEmpty) return own;
  return r != null && r.containsKey(k) ? (at ?? (r['updatedAt'] as String?) ?? '') : '';
}

Object? _canon(Object? v) => v is Map
    ? {for (final k in (v.keys.map((e) => '$e').toList()..sort())) k: _canon(v[k])}
    : v is List
        ? [for (final x in v) _canon(x)]
        : v;

/// The same value (maps compared whatever the order of their keys).
bool sameValue(Object? a, Object? b) => identical(a, b) || jsonEncode(_canon(a)) == jsonEncode(_canon(b));

/// The same record, whatever the order of its keys.
bool sameRecord(Map<String, Object?> a, Map<String, Object?> b) => sameValue(a, b);

String _max(Iterable<String> ts) => ts.fold('', (m, t) => t.compareTo(m) > 0 ? t : m);

Map<String, Object?> _compact(Map<String, Object?> rec, Map<String, String> times, String updatedAt) => {
      for (final e in times.entries)
        if (e.value.isNotEmpty && (!rec.containsKey(e.key) || e.value.compareTo(updatedAt) < 0)) e.key: e.value,
    };

/// Merge two copies of a record: [a] the existing one (at [aAt]), [b] the incoming one (at [bAt]).
Map<String, Object?> mergeFields(Map<String, Object?>? a, String? aAt, Map<String, Object?>? b, String? bAt) {
  final out = <String, Object?>{if ((b?['id'] ?? a?['id']) != null) 'id': b?['id'] ?? a?['id']};
  final times = <String, String>{};
  for (final k in {..._keys(a), ..._keys(b), ..._times(a).keys, ..._times(b).keys}) {
    final ta = fieldTime(a, aAt, k), tb = fieldTime(b, bAt, k);
    final src = tb.compareTo(ta) > 0 ? b : a;
    if (src != null && src.containsKey(k)) out[k] = src[k];
    times[k] = tb.compareTo(ta) > 0 ? tb : ta;
  }
  final updatedAt = _max([aAt ?? (a?['updatedAt'] as String?) ?? '', bAt ?? (b?['updatedAt'] as String?) ?? '', ...times.values]);
  out['updatedAt'] = updatedAt;
  final f = _compact(out, times, updatedAt);
  if (f.isNotEmpty) out['_f'] = f;
  return out;
}

/// A device saving [next] over its own earlier copy [prev] at [now]: changed fields get [now], the others keep their
/// times, a removed field keeps its removal time.
Map<String, Object?> stampFields(Map<String, Object?>? prev, Map<String, Object?> next, String now) {
  final out = {...next, 'updatedAt': now}..remove('_f');
  if (prev == null) return out;
  final prevAt = (prev['updatedAt'] as String?) ?? '';
  final times = <String, String>{};
  for (final k in {..._keys(prev), ..._keys(next), ..._times(prev).keys}) {
    final had = prev.containsKey(k), has = next.containsKey(k);
    times[k] = had != has || (has && !sameValue(prev[k], next[k])) ? now : fieldTime(prev, prevAt, k);
  }
  final f = _compact(out, times, now);
  if (f.isNotEmpty) out['_f'] = f;
  return out;
}

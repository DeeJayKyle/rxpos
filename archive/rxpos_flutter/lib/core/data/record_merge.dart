/// Writes a typed entity back over the record it was read from, keeping every field the entity does not know
/// (added by the React app or a newer RxPOS), so syncing a record through this app never loses data.
///
/// - fields the entity knows replace the old ones; a known field that is now null is removed;
/// - maps merge field by field;
/// - lists of the same length merge item by item (a sale's lines keep their unknown fields); otherwise the new list
///   replaces the old one (lines were added or removed);
/// - an empty default ('' / 0 / false / [] / {}) is not added to a record that never had that field, so records stay
///   as lean as the React app writes them.
Map<String, Object?> mergeRecord(Map<String, Object?> raw, Map<String, Object?> typed) {
  final out = Map<String, Object?>.of(raw);
  typed.forEach((k, v) {
    if (v == null) {
      out.remove(k);
    } else if (!raw.containsKey(k) && _emptyDefault(v)) {
      return;
    } else {
      out[k] = _merge(raw[k], v);
    }
  });
  return out;
}

Object? _merge(Object? old, Object? now) {
  if (old is Map && now is Map) return mergeRecord(Map<String, Object?>.from(old), Map<String, Object?>.from(now));
  if (old is List && now is List && old.length == now.length) {
    return [for (var i = 0; i < now.length; i++) _merge(old[i], now[i])];
  }
  return now;
}

bool _emptyDefault(Object? v) =>
    v == '' || v == 0 || v == false || (v is List && v.isEmpty) || (v is Map && v.isEmpty);

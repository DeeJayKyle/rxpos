// What this person has already seen on this device (src/seen.js): a menu count or a notification highlights only
// while it is new. Opening the page marks its count read (its folded group closes again); opening the bell marks its
// notifications read. Anything new (a higher count, another alert) highlights again.
import 'dart:convert';

const navSeenKey = 'nav-seen', bellSeenKey = 'bell-seen';

Map<String, Object?> seenOf(String? raw) {
  try {
    return raw == null || raw.isEmpty ? {} : (jsonDecode(raw) as Map).cast<String, Object?>();
  } catch (_) {
    return {};
  }
}

/// A menu count still to read: higher than the count last seen.
int unreadCount(int count, Object? seen) => count > ((seen as num?)?.toInt() ?? 0) ? count : 0;

/// The seen counts after this moment: counts that fell are lowered (so the next rise shows), [read] marked as seen;
/// null when nothing changes.
Map<String, Object?>? nextSeen(Map<String, Object?> seen, Map<String, int> counts, {String? read}) {
  final next = {...seen};
  for (final e in seen.entries) {
    final now = counts[e.key] ?? 0;
    if (now < ((e.value as num?)?.toInt() ?? 0)) next[e.key] = now;
  }
  if (read != null) next[read] = counts[read] ?? 0;
  return jsonEncode(next) == jsonEncode(seen) ? null : next;
}

/// An alert still to read: its key with this exact text not seen before.
bool alertUnread(String key, String text, Map<String, Object?> seen) => seen[key] != text;

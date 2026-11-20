// What this person has already seen on this device (the owner's request, 2026-11-20): a menu count or a notification
// highlights only while it is new. Opening the page marks its count read (its folded group closes again); opening
// the bell marks its notifications read. Anything new (a higher count, another alert) highlights again.
const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || '{}') || {}; } catch { return {}; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage blocked: highlights stay */ } };

export const NAV_SEEN = 'rxpos-nav-seen', BELL_SEEN = 'rxpos-bell-seen';
export const seenMap = (k) => read(k);

/** A menu count still to read: higher than the count last seen (a count that fell is never new) */
export const unreadCount = (count, seen) => (Number(count) > Number(seen || 0) ? Number(count) : 0);

/** Counts seen now (the page is open): returns the new map, saved */
export function markCounts(k, map, counts) {
  const next = { ...map };
  for (const [key, n] of Object.entries(counts)) next[key] = Number(n) || 0;
  write(k, next);
  return next;
}

/** Counts that fell below what was seen: lowered, so the next rise shows again (returns the map, saved if changed) */
export function settleCounts(k, map, counts) {
  let changed = false;
  const next = { ...map };
  for (const [key, seen] of Object.entries(map)) if ((Number(counts[key]) || 0) < seen) { next[key] = Number(counts[key]) || 0; changed = true; }
  if (changed) write(k, next);
  return changed ? next : map;
}

/** An alert still to read: its key with this exact text not seen before (a changed text, e.g. a higher count, is new) */
export const alertUnread = (a, map) => map[a.key] !== a.text;
/** Every alert shown now is read (returns the map, saved): keeps only alerts that still exist */
export function markAlerts(k, alerts) {
  const next = Object.fromEntries(alerts.map((a) => [a.key, a.text]));
  write(k, next);
  return next;
}

// Field-by-field merge for master data (review 2.5, workplan step 14).
//
// Before, the later save of a medicine, client, supplier or batch replaced the whole record, so when one device changed
// the price and another the reorder level, one change was lost. Now each record carries `_f`, the time each field
// last changed, and every merge (the cloud's sync, a device downloading) keeps the newer value of EACH field.
//
// To keep records small, `_f` lists only fields whose time is older than the record's `updatedAt`:
//   - a field that is present and not in `_f` changed at `updatedAt`;
//   - a field that is absent and not in `_f` is unknown to whoever wrote the record (an older app, or one that does
//     not have that field), so it never erases a value someone else set;
//   - a field removed on purpose is absent with its time in `_f`.
// Ties keep the existing copy (the cloud's stored record, a device's own copy), like record-level last writer wins.
// The same rules in Dart: rxpos_flutter/lib/core/sync/field_merge.dart; both are checked against
// tests/field-merge-cases.json.

/** Tables merged field by field */
export const FIELD_TABLES = new Set(['products', 'customers', 'suppliers', 'batches']);
const META = new Set(['id', 'updatedAt', '_f']);

const keysOf = (r) => Object.keys(r || {}).filter((k) => !META.has(k));
/** When this record's field k last changed ('' = unknown) */
export function fieldTime(r, at, k) {
  const own = r?._f?.[k];
  if (own) return own;
  return r && Object.prototype.hasOwnProperty.call(r, k) ? at || r.updatedAt || '' : '';
}
const sameValue = (a, b) => a === b || JSON.stringify(a) === JSON.stringify(b);

/** Rebuild `_f` for a record: only fields older than its `updatedAt`, and removals */
function compact(rec, times, updatedAt) {
  const f = {};
  for (const [k, t] of Object.entries(times)) {
    if (!t) continue;
    const present = Object.prototype.hasOwnProperty.call(rec, k);
    if (!present || t < updatedAt) f[k] = t;
  }
  return f;
}

/**
 * Merge two copies of a record. a: the existing copy (stored in the cloud, or this device's), aAt its time;
 * b: the incoming one, bAt its time. Returns the merged record, with `updatedAt` = the newest field time and `_f`.
 */
export function mergeFields(a, aAt, b, bAt) {
  const out = { id: b?.id ?? a?.id };
  const times = {};
  for (const k of new Set([...keysOf(a), ...keysOf(b), ...Object.keys(a?._f || {}), ...Object.keys(b?._f || {})])) {
    const ta = fieldTime(a, aAt, k), tb = fieldTime(b, bAt, k);
    const src = tb > ta ? b : a;
    if (Object.prototype.hasOwnProperty.call(src || {}, k)) out[k] = src[k];
    times[k] = tb > ta ? tb : ta;
  }
  const updatedAt = [aAt || a?.updatedAt || '', bAt || b?.updatedAt || '', ...Object.values(times)].reduce((m, t) => (t > m ? t : m), '');
  out.updatedAt = updatedAt;
  const f = compact(out, times, updatedAt);
  if (Object.keys(f).length) out._f = f;
  if (out.id === undefined) delete out.id;
  return out;
}

/**
 * A device saving `next` over `prev` (its own earlier copy) at time `now`: the fields that changed get `now`, the
 * others keep their times, a removed field keeps its removal time. Returns the record to store, with `_f`.
 */
export function stampFields(prev, next, now) {
  if (!prev) { const out = { ...next, updatedAt: now }; delete out._f; return out; }
  const times = {};
  const prevAt = prev.updatedAt || '';
  for (const k of new Set([...keysOf(prev), ...keysOf(next), ...Object.keys(prev._f || {})])) {
    const had = Object.prototype.hasOwnProperty.call(prev, k), has = Object.prototype.hasOwnProperty.call(next, k);
    if (had !== has || (has && !sameValue(prev[k], next[k]))) times[k] = now;
    else times[k] = fieldTime(prev, prevAt, k);
  }
  const out = { ...next, updatedAt: now };
  delete out._f;
  const f = compact(out, times, now);
  if (Object.keys(f).length) out._f = f;
  return out;
}

/** Field times can't be later than the record's own (the cloud clamps a device clock that runs ahead) */
export function clampFields(rec, at) {
  if (!rec?._f) return rec;
  const f = {};
  for (const [k, t] of Object.entries(rec._f)) f[k] = t > at ? at : t;
  return { ...rec, _f: f };
}

const canon = (v) => (Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v);
/** The same record, whatever the order of its keys */
export const sameRecord = (a, b) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));

// Faster sync, stage 4 (docs/SYNC-HISTORY-WINDOW.md): brought-forward figures for a device keeping recent history.
//
// POST /api/balances { window: W } → { W, asOf, stock: [{ branch, batch, product, qty }], customer: { id: amount },
// supplier, insurer, account, loan }: every balance entry dated before W (src/balances.js entriesOf, the same rules
// the apps use), added up from all of the pharmacy's records up to sequence number asOf. The device adds the entries
// dated from W of the records it holds, so each balance is exactly the whole-history figure. Kept in R2 per pharmacy,
// epoch, W and asOf (many devices, one computation); a hub computes it each time.
import { ENTRY_TABLES, entriesOf } from '../src/balances.js';

const PAGE = 5000;
const KINDS = ['customer', 'supplier', 'insurer', 'account', 'loan'];

/** A window start the cloud accepts: a date, as the apps send it (YYYY-MM-DD or an ISO time) */
export const validWindow = (w) => typeof w === 'string' && /^\d{4}-\d{2}-\d{2}(T[\d:.]+Z)?$/.test(w) ? w : null;

/** One record's entries dated before W, summed per balance, compactly: [kind, key, amount] (stock: ['stock', key, amount,
 * branch, product]). Empty when it adds nothing before W. */
function before(t, rec, W) {
  const m = new Map();
  for (const e of entriesOf(t, rec)) {
    if (!(String(e.date) < W)) continue;
    const k = e.kind === 'stock' ? `stock|${e.key}|${e.product}` : `${e.kind}|${e.key}`;
    const x = m.get(k);
    if (x) x[2] += e.amount; else m.set(k, e.kind === 'stock' ? ['stock', e.key, e.amount, e.branch, e.product] : [e.kind, e.key, e.amount]);
  }
  return [...m.values()].filter((x) => Math.abs(x[2]) > 1e-9);
}

/**
 * Kept per pharmacy, restore epoch and W (R2, `windows/<tenant>/<epoch>/<W>.v2.json`): each record's share of the
 * brought-forward figures and the sequence number read up to. A request reads only the records changed since (every
 * insert, edit, deletion or reset gives a record a new sequence number): it takes away a changed record's old share,
 * adds its new one, and drops a deleted record. So the figures stay exactly the sum over all records, without reading
 * the whole pharmacy each time. A restore changes the epoch, so it starts afresh. A hub (no R2) adds up from the start.
 */
export async function balancesAt(env, tenant, W, { epochOf }) {
  const db = env.DB;
  const asOf = Number((await db.prepare('SELECT MAX(seq) m FROM records WHERE tenant = ?1').bind(tenant).first())?.m || 0);
  const key = `windows/${tenant}/${await epochOf(db)}/${W.replace(/[^0-9TZ.:-]/g, '')}.v2.json`;
  let kept = null;
  if (env.APPS) {
    try { const o = await env.APPS.get(key); if (o) kept = JSON.parse(await o.text()); } catch { kept = null; }
  }
  if (!kept || kept.W !== W || !(kept.asOf <= asOf) || typeof kept.shares !== 'object') kept = { W, asOf: 0, shares: {} };
  const shares = kept.shares;
  const tables = ENTRY_TABLES.map((t) => `'${t}'`).join(', ');
  let after = kept.asOf, changed = false;
  for (;;) {
    if (after >= asOf) break;
    // deleted rows too: a record deleted since takes its share with it
    const { results } = await db.prepare(`SELECT t, id, rec, deleted, seq FROM records WHERE tenant = ?1 AND seq > ?2 AND seq <= ?3 AND t IN (${tables}) ORDER BY seq LIMIT ${PAGE}`)
      .bind(tenant, after, asOf).all();
    for (const row of results || []) {
      const k = row.t + '|' + row.id;
      let rec = null;
      if (!row.deleted && row.rec != null) { try { rec = JSON.parse(row.rec); } catch { rec = null; } }
      const share = rec ? before(row.t, rec, W) : [];
      if (share.length) shares[k] = share; else delete shares[k];
      changed = true;
    }
    if (!results || results.length < PAGE) break;
    after = results[results.length - 1].seq;
  }
  // the figures: the sum of every record's share
  const stock = new Map(), sums = Object.fromEntries(KINDS.map((k) => [k, new Map()]));
  for (const list of Object.values(shares)) {
    for (const [kind, k, amount, branch, product] of list) {
      if (kind === 'stock') {
        const sk = k + '|' + product, x = stock.get(sk);
        if (x) x.qty += amount; else stock.set(sk, { branch, batch: k.slice(branch.length + 1), product, qty: amount });
      } else if (sums[kind]) sums[kind].set(k, (sums[kind].get(k) || 0) + amount);
    }
  }
  if (env.APPS && (changed || kept.asOf !== asOf)) {
    await env.APPS.put(key, JSON.stringify({ W, asOf, shares }), { httpMetadata: { contentType: 'application/json' } }).catch(() => {});
  }
  return { W, asOf, stock: [...stock.values()].filter((x) => Math.abs(x.qty) > 1e-9), ...Object.fromEntries(KINDS.map((k) => [k, Object.fromEntries([...sums[k]].filter(([, v]) => Math.abs(v) > 1e-9))])) };
}

/** Nightly: remove kept figures of older restore epochs, of the old one-file-per-sequence-number format, and any not
 * used for 40 days (a device that still needs one gets it rebuilt). */
export async function pruneWindows(env, epochOf) {
  if (!env.APPS) return 0;
  const epoch = String(await epochOf(env.DB));
  const old = Date.now() - 40 * 864e5;
  let cursor, removed = 0;
  do {
    const page = await env.APPS.list({ prefix: 'windows/', cursor, limit: 1000 });
    const gone = page.objects.filter((o) => {
      const [, , ep, file] = o.key.split('/');
      return ep !== epoch || !String(file || '').endsWith('.v2.json') || (o.uploaded && new Date(o.uploaded).getTime() < old);
    }).map((o) => o.key);
    if (gone.length) { await env.APPS.delete(gone); removed += gone.length; }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return removed;
}

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

export async function balancesAt(env, tenant, W, { epochOf }) {
  const db = env.DB;
  const asOf = Number((await db.prepare('SELECT MAX(seq) m FROM records WHERE tenant = ?1').bind(tenant).first())?.m || 0);
  const key = `windows/${tenant}/${await epochOf(db)}/${W.replace(/[^0-9TZ.:-]/g, '')}-${asOf}.json`;
  if (env.APPS) {
    const kept = await env.APPS.get(key);
    if (kept) return JSON.parse(await kept.text());
  }
  const stock = new Map(), sums = Object.fromEntries(KINDS.map((k) => [k, new Map()]));
  const tables = ENTRY_TABLES.map((t) => `'${t}'`).join(', ');
  let after = 0;
  for (;;) {
    const { results } = await db.prepare(`SELECT t, rec, seq FROM records WHERE tenant = ?1 AND deleted = 0 AND seq > ?2 AND seq <= ?3 AND t IN (${tables}) ORDER BY seq LIMIT ${PAGE}`)
      .bind(tenant, after, asOf).all();
    for (const row of results || []) {
      let rec;
      try { rec = JSON.parse(row.rec); } catch { continue; }
      for (const e of entriesOf(row.t, rec)) {
        if (!(String(e.date) < W)) continue;
        if (e.kind === 'stock') {
          const k = e.key + '|' + e.product;
          const x = stock.get(k);
          if (x) x.qty += e.amount; else stock.set(k, { branch: e.branch, batch: e.key.slice(e.branch.length + 1), product: e.product, qty: e.amount });
        } else sums[e.kind].set(e.key, (sums[e.kind].get(e.key) || 0) + e.amount);
      }
    }
    if (!results || results.length < PAGE) break;
    after = results[results.length - 1].seq;
  }
  const out = { W, asOf, stock: [...stock.values()].filter((x) => Math.abs(x.qty) > 1e-9), ...Object.fromEntries(KINDS.map((k) => [k, Object.fromEntries(sums[k])])) };
  if (env.APPS) await env.APPS.put(key, JSON.stringify(out), { httpMetadata: { contentType: 'application/json' } }).catch(() => {});
  return out;
}

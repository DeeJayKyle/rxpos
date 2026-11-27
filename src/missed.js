// "Asked for, we had none" (27 Nov 2026, from the SmarterPOS review). Reorder only sees what sold; a customer turned
// away because a medicine was out of stock (or never stocked) leaves no trace. The till notes it in one tap
// (`missedSales`, synced like every table), and Reorder shows that lost demand beside the sales figures. A person adds
// each note; nothing is ordered from it automatically.
import { uid } from './ids.js';

const now = () => new Date().toISOString();

/** A missed-sale note: a medicine we have (productId) or a name typed for one we don't stock */
export function missedNote({ productId = null, name = '', qty = 1, user = '', branchId = 'main', reason = 'out' }) {
  const n = String(name || '').trim().slice(0, 120);
  if (!productId && !n) throw new Error('Type what the customer asked for');
  return { id: uid(), productId: productId || null, name: n, qty: Math.max(1, Number(qty) || 1), user: String(user || ''), branchId, reason, date: now() };
}

const keyOf = (m) => m.productId || 'name:' + m.name.trim().toLowerCase();

/**
 * Lost demand per medicine since `since` (ISO) at a branch (null: every branch):
 * Map key → { productId, name, times, qty, last }, key being the productId or `name:<typed name>`.
 */
export function lostDemand(notes, { since = '', branchId = null } = {}) {
  const out = new Map();
  for (const m of notes || []) {
    if (!m || m.deleted || String(m.date || '') < since) continue;
    if (branchId && (m.branchId || 'main') !== branchId) continue;
    const k = keyOf(m);
    const cur = out.get(k) || { productId: m.productId || null, name: m.name || '', times: 0, qty: 0, last: '' };
    cur.times += 1;
    cur.qty += Number(m.qty) || 1;
    if (String(m.date) > cur.last) cur.last = String(m.date);
    out.set(k, cur);
  }
  return out;
}

/** Asked-for medicines we don't stock at all (typed names), most asked first */
export function unstockedAsks(notes, opts) {
  return [...lostDemand(notes, opts).values()].filter((x) => !x.productId).sort((a, b) => b.times - a.times || b.qty - a.qty);
}

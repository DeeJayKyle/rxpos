// Sold more than was there (27 Nov 2026, from the SmarterPOS review): two devices that sell offline can each sell the
// last packs of the same batch. Each device saw stock, so each sale went through; once both sync, the batch's balance
// is below zero. Stock is the sum of movements (src/stockindex.js), so nothing is lost or overwritten, but a negative
// batch hides a real shortage and the next sale can't pick it by FEFO. This finds those batches so a manager can count
// them; it only reads, it never changes stock.
const MAIN = 'main';
const keyOf = (mv) => (mv.batchId || 'lb-' + mv.productId);

/**
 * Batches at a branch whose balance is below zero now and that went below zero through a sale on or after `since`
 * (an ISO date; older ones are left to the stock count). `balance(key)` gives today's balance of a batch key
 * (`batchId`, or `lb-<productId>` for stock without a batch), from the store's running balances. Returns, most short
 * first: [{ productId, batchId, balance, at, sales: [{ ref, user, date, qty }] }], `sales` being the sale that took it
 * below zero, the sale just before it on that batch, and any sold after while it stayed below zero (at most 6).
 */
export function oversold(movements, { branchId = MAIN, since = '', balance } = {}) {
  const mine = (movements || []).filter((m) => (m.branchId || MAIN) === branchId);
  const negative = new Set();
  for (const m of mine) { const k = keyOf(m); if (!negative.has(k) && (balance ? balance(k) : 0) < -1e-9) negative.add(k); }
  if (!negative.size) return [];
  const byKey = new Map();
  for (const m of mine) { const k = keyOf(m); if (negative.has(k)) { if (!byKey.has(k)) byKey.set(k, []); byKey.get(k).push(m); } }
  const out = [];
  for (const [k, list] of byKey) {
    list.sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
    // walk back from today's balance: the last movement before which the batch was still at or above zero
    let bal = balance(k), cross = -1;
    for (let i = list.length - 1; i >= 0; i--) {
      const before = bal - (Number(list[i].qty) || 0);
      if (before >= -1e-9) { cross = i; break; }
      bal = before;
    }
    if (cross < 0) continue; // below zero since before this device's records: the count will show it
    const m = list[cross];
    if (m.type !== 'Sale' || String(m.date || '') < since) continue;
    const sales = list.filter((x, i) => x.type === 'Sale' && i >= cross);
    const prev = list.slice(0, cross).reverse().find((x) => x.type === 'Sale');
    out.push({
      productId: m.productId, batchId: m.batchId || null, balance: balance(k), at: m.date,
      sales: [...(prev ? [prev] : []), ...sales].slice(0, 6).map((x) => ({ ref: x.ref || '', user: x.user || '', date: x.date || '', qty: -(Number(x.qty) || 0) })),
    });
  }
  return out.sort((a, b) => a.balance - b.balance);
}

/** One line for a person: "sold by Jane (S-12) and Tom (S-40)" */
export function soldByText(sales) {
  const parts = sales.map((s) => `${s.user || 'someone'}${s.ref ? ` (${s.ref})` : ''}`);
  return parts.length <= 1 ? parts.join('') : parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1];
}

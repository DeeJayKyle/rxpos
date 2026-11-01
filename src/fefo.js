// First-expiry-first-out stock allocation (pure, unit-tested — review Phase 1.6/1.8).
import { daysUntil } from './dates.js';

/**
 * Split `qty` across batches (already sorted by expiry) and return [{batchId, qty, batch, expiry}].
 * Expired batches are skipped unless allowExpired. Stock not yet recorded is booked against the next SELLABLE
 * batch — never an expired or arbitrary one; if none is sellable it is booked untracked (batchId null).
 */
export function allocate(batches, qty, { allowExpired = false } = {}) {
  const out = [];
  let left = qty;
  const ok = (b) => allowExpired || !b.expiry || daysUntil(b.expiry) >= 0;
  for (const b of batches) {
    if (left <= 0) break;
    if (b.qty <= 0 || !ok(b)) continue;
    const take = Math.min(b.qty, left);
    out.push({ batchId: b.id, qty: take, batch: b.batch, expiry: b.expiry });
    left -= take;
  }
  if (left > 0) {
    const b = batches.find(ok);
    out.push({ batchId: b?.id || null, qty: left, batch: b?.batch || '', expiry: b?.expiry || '' });
  }
  return out;
}

/**
 * Stock to REMOVE from a medicine (adjustment "Remove"), starting with the chosen batch: never more than a batch holds, so
 * no batch goes negative while others still hold stock. What the chosen batch doesn't have comes from the medicine's
 * other batches, earliest expiry first. Returns [{batchId, qty}] (qty > 0, to take out; batchId null for stock recorded
 * without a batch). Throws when the medicine doesn't have that much stock in total.
 */
export function removalSplit(batches, chosenId, qty) {
  const want = Number(qty) || 0;
  const stocked = batches.filter((b) => b.qty > 0);
  const total = stocked.reduce((a, b) => a + b.qty, 0);
  if (want > total + 1e-9) throw new Error(`Only ${Math.round(total * 100) / 100} in stock: you can't remove ${want}.`);
  const order = [...stocked.filter((b) => b.id === chosenId), ...stocked.filter((b) => b.id !== chosenId)];
  const out = [];
  let left = want;
  for (const b of order) {
    if (left <= 0) break;
    const take = Math.min(b.qty, left);
    out.push({ batchId: b.legacy || String(b.id).startsWith('lb-') ? null : b.id, qty: take, batch: b.batch });
    left -= take;
  }
  return out;
}

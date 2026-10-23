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

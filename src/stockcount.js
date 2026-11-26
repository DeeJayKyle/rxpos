// Stock checks shared by counting, editing and receiving (stock audit, 26 Nov 2026). Pure: no React, unit-tested in
// tests/unit-stock-audit.mjs.
//
// Stock is the sum of movements, and stock is counted in the medicine's smallest unit (a tablet), while people on the
// shelf count and receive boxes and strips. Three things went wrong with that, and are worked out here:
//  1. A count posted later booked (counted − what the device showed when it was counted). A sale made on another till
//     BEFORE the count but synced AFTER it was then taken off twice, and two counts of the same medicine both booked
//     their difference (stock corrected twice). countDiff works the difference out from the ledger as it is when the
//     count is posted.
//  2. A count typed in boxes (3) instead of tablets (300) set the stock to 3. packSlip notices a figure that is the
//     system quantity in packs and offers the units.
//  3. Scan & count added ONE tablet for each box scanned. scanStep is the units one scan counts.
import { mainPack, packsOf } from './packs.js';

/** Movements that SET stock to what someone counted (not real stock coming or going) */
export const CORRECTIONS = new Set(['Stock count', 'Inventory edit']);

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
/** The ledger key of a batch, as src/stockindex.js keys it (stock from before batches: 'lb-' + product) */
export const lotKey = (branchId, productId, batchId) => (branchId || 'main') + '|' + (batchId || 'lb-' + productId);

/**
 * Real stock changes (sales, deliveries, refunds, transfers…) on one batch dated after `at`: what happened on the shelf
 * after it was counted. Counts and inventory edits are left out: they are corrections, not stock coming or going.
 */
export function movedAfter(movements, { branchId, productId, batchId }, at) {
  const key = lotKey(branchId, productId, batchId);
  let sum = 0;
  for (const m of movements || []) {
    if (String(m.date || '') <= at || CORRECTIONS.has(m.type)) continue;
    if (lotKey(m.branchId, m.productId, m.batchId) === key) sum += num(m.qty);
  }
  return sum;
}

/**
 * The stock change a counted batch books when the count is posted.
 * line: { qty (counted), sys (system qty when counted), at (when counted; older counts have none) }
 * current: the batch's stock now · after: movedAfter(…) for it.
 * Counted at `at`, the shelf now holds counted + what really moved since, so the change is that minus the stock now.
 * Lines counted before this fix carry no time and keep the old rule (counted − system then).
 */
export function countDiff(line, { current = 0, after = 0 } = {}) {
  const counted = num(line?.qty);
  if (!line?.at) return counted - num(line?.sys);
  return Math.round((counted + num(after) - num(current)) * 1e6) / 1e6;
}

/** "3 Boxes + 20 Tablets" for a quantity in stock units (the medicine's largest pack), '' when it has no pack or less */
export function packText(p, qty) {
  const k = mainPack(p), q = num(qty);
  if (!k || Math.abs(q) < Number(k.size)) return '';
  const size = Number(k.size), whole = Math.trunc(q / size), rest = Math.round((q - whole * size) * 100) / 100;
  const unit = String(p?.unit || 'unit').toLowerCase();
  const plural = (n, w) => (Math.abs(n) === 1 ? w : /(x|s|ch|sh)$/i.test(w) ? w + 'es' : w + 's');
  return `${whole} ${plural(whole, k.name)}${rest ? ` + ${rest} ${plural(rest, unit)}` : ''}`;
}

/**
 * A count (or "actual quantity") that looks typed in packs instead of stock units: the medicine has 300 tablets in
 * boxes of 100 and 3 was typed. → { pack, units } (the figure in units it probably means) or null.
 * Only when the system has at least one whole pack and the figure × a pack size is close to the system quantity.
 */
export function packSlip(p, counted, sys) {
  const c = num(counted), s = num(sys);
  if (!(c > 0) || !(s > 0)) return null;
  let best = null;
  for (const k of packsOf(p)) {
    const size = Number(k.size), units = c * size;
    if (s < size || c * 2 > s) continue; // less than a pack in stock, or the figure is already near the units
    const off = Math.abs(units - s);
    if (off <= Math.max(size, s * 0.25) && (!best || off < best.off)) best = { pack: k, units, off };
  }
  return best ? { pack: best.pack, units: best.units } : null;
}

/** Units one scan counts in Scan & count: the medicine's largest pack (the barcode is on the box), else one unit */
export const scanStep = (p) => Number(mainPack(p)?.size) || 1;

/**
 * A delivery line's pack after its quantity (in stock units) was edited: the pack count follows, and a quantity that is
 * no longer whole packs keeps no pack (so the delivery doesn't show "5 Boxes" for 450 tablets).
 */
export function repack(item, qty) {
  const k = item?.pack;
  if (!k || !(Number(k.size) > 1)) return item;
  const { pack: _drop, ...rest } = item;
  const n = num(qty) / Number(k.size);
  return Number.isInteger(n) && n > 0 ? { ...item, pack: { ...k, count: n } } : rest;
}

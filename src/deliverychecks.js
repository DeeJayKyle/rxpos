// What Add Stock shows before a delivery is received (the owner's request, 2026-11-22): a summary of the delivery and
// the things worth a second look, so mistakes are caught before stock and money change. Nothing here refuses a delivery:
// the person reads the list and receives, or goes back to fix it. Pure, so both apps give the same list
// (rxpos_flutter/lib/features/stock/domain/delivery_checks.dart is the same rules; tests/unit-delivery-checks.mjs).
import { oldDeliveryDays } from './invoicedates.js';

const PRICE_JUMP = 10; // a retail price this many times the unit cost is checked
export const COST_JUMP = 2; // a unit cost at least twice, or at most half, the medicine's last cost
export const BIG_QTY = 5; // a quantity at least 5 times the most received of that medicine before…
export const BIG_QTY_MIN = 20; // …and at least this many units (small numbers are not worth asking about)
export const SHORT_EXPIRY_DAYS = 180; // expiring within about 6 months of the delivery

/** An invoice number as compared: case, spaces and punctuation don't count ("INV-0042" = "inv 0042") */
export const invoiceKey = (v) => String(v ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** An earlier delivery from the same supplier with the same invoice number, or null */
export function sameInvoice(purchases, supplierId, invoice) {
  const k = invoiceKey(invoice);
  if (!k || !supplierId) return null;
  return (purchases || []).find((p) => p && p.supplierId === supplierId && invoiceKey(p.invoice) === k) || null;
}

/** The most of a medicine received in one earlier delivery (units), 0 when never */
export function mostReceived(purchases, productId) {
  let most = 0;
  for (const p of purchases || []) for (const i of p?.items || []) if (i && i.productId === productId) most = Math.max(most, Number(i.qty) || 0);
  return most;
}

const days = (from, to) => Math.round((Date.parse(to) - Date.parse(from)) / 864e5);
const plainDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));

/**
 * The review before "Receive stock".
 * d: { lines: [{ productId (null for a new medicine), name, qty (units), cost (per unit), price, expiry }],
 *      products: Map id → { cost, price }, purchases, supplierId, supplierName, invoice, date, today,
 *      total, invoiceTotal, scanned, dateRead }
 * show: { money(n) → text, date(iso) → text }
 * → { summary: [text], warnings: [text] }
 */
export function deliveryReview(d, show) {
  const lines = d.lines || [];
  const product = (id) => (id ? d.products.get(id) : undefined);
  const warnings = [];
  // 1. the date (a wrong one files the delivery away from today's)
  const old = oldDeliveryDays(d.date, d.today);
  if (old) warnings.push(`Dated ${show.date(d.date)}, ${old} days ago${d.dateRead ? ' (the date read from the invoice)' : ''}: Purchase history and reports will list it on that day, not today.`);
  // 2. the same invoice received before (stock would go in twice)
  const twice = sameInvoice(d.purchases, d.supplierId, d.invoice);
  if (twice) warnings.push(`Invoice ${String(d.invoice).trim()} from ${d.supplierName || 'this supplier'} was already received${twice.date ? ' on ' + show.date(twice.date) : ''}${twice.number ? ` (${twice.number})` : ''}. Receiving it again adds the stock twice.`);
  // 3. the invoice's own total against the lines
  const inv = Number(d.invoiceTotal) || 0;
  if (inv > 0 && Math.abs(inv - (Number(d.total) || 0)) >= 1) warnings.push(`The invoice total is ${show.money(inv)} but the lines add up to ${show.money(Number(d.total) || 0)}, ${show.money(Math.abs(inv - (Number(d.total) || 0)))} ${inv > d.total ? 'short' : 'over'}: a line may be missing or a figure mistyped.`);
  for (const l of lines) {
    const p = product(l.productId);
    const cost = Number(l.cost) || 0, qty = Number(l.qty) || 0, price = Number(l.price) || 0;
    // 4. a cost far from the last one (a box price typed for one unit, or the other way round)
    const last = Number(p?.cost) || 0;
    if (p && cost > 0 && last > 0 && (cost >= last * COST_JUMP || cost * COST_JUMP <= last)) {
      warnings.push(`${l.name}: cost ${show.money(cost)} a unit, last time ${show.money(last)} (${cost > last ? (cost / last).toFixed(1) + ' times more' : (last / cost).toFixed(1) + ' times less'}). Is it the price of a whole pack, or the quantity in packs?`);
    }
    // 5. a quantity far above what is usually received
    const most = l.productId ? mostReceived(d.purchases, l.productId) : 0;
    if (most > 0 && qty >= BIG_QTY_MIN && qty >= most * BIG_QTY) warnings.push(`${l.name}: ${qty} units, ${Math.floor(qty / most)} times the most received before (${most}). Is the quantity right?`);
    // 6. short-dated stock
    if (plainDate(l.expiry) && plainDate(d.today)) {
      const left = days(d.today, l.expiry);
      if (left >= 0 && left < SHORT_EXPIRY_DAYS) warnings.push(`${l.name}: expires on ${show.date(l.expiry)}, in ${left} days: short-dated.`);
    }
    // 7. selling below cost
    if (price > 0 && cost > 0 && price < cost) warnings.push(`${l.name}: the retail price ${show.money(price)} is below the cost ${show.money(cost)}.`);
    // 8. (stock audit, 26 Nov 2026) a retail price many times the cost of one unit: a pack's price typed as the price of
    // one tablet (the retail price is always per stock unit; a pack's own price is set in Selling units)
    else if (price > 0 && cost > 0 && price >= cost * PRICE_JUMP && (!p || Number(p.price) !== price)) warnings.push(`${l.name}: the retail price ${show.money(price)} is ${Math.round(price / cost)} times the cost of one unit (${show.money(cost)}). The retail price is for ONE unit: is it the price of a whole pack?`);
  }
  const fresh = new Set(lines.filter((l) => !l.productId).map((l) => String(l.name).trim().toLowerCase())).size;
  const priced = lines.filter((l) => { const p = product(l.productId); return p && Number(l.price) > 0 && Number(l.price) !== Number(p.price); }).length;
  const units = lines.reduce((a, l) => a + (Number(l.qty) || 0), 0);
  const summary = [
    `${d.supplierName || 'No supplier'} · ${d.invoice ? 'invoice ' + String(d.invoice).trim() : 'no invoice number'} · dated ${show.date(d.date)}`,
    `${lines.length} line${lines.length === 1 ? '' : 's'}, ${units} unit${units === 1 ? '' : 's'}, total ${show.money(Number(d.total) || 0)}`,
    ...(fresh || priced ? [[fresh ? `${fresh} new medicine${fresh === 1 ? '' : 's'}` : '', priced ? `${priced} retail price${priced === 1 ? '' : 's'} changed` : ''].filter(Boolean).join(' · ')] : []),
  ];
  return { summary, warnings };
}

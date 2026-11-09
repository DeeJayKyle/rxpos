// Sale checks on the cloud (review 1.2, workplan step 3).
//
// A device computes a sale's figures; until now the cloud stored them as sent. `saleFindings()` re-checks a sale
// pushed by a staff device and returns what an owner should look at. Nothing is refused: a pharmacy must never be
// stopped from serving a patient because of a cloud check, so a finding is recorded next to the sale (the `anomalies`
// table, written in the same transaction) and shown to whoever may read the audit log.
//
// Pure: the caller passes the stored products the sale refers to and `can(perm)` for the person who pushed it.
import { lineTotal } from '../src/money.js';
import { packPrice } from '../src/packs.js';
import { overLimit } from '../src/credit.js';

const num = (v) => Number(v) || 0;
const money = (n) => Math.round(num(n)).toLocaleString('en-US');

/** Price a line should have had: the medicine's retail or wholesale price, per unit (a pack line per its pack's own price) */
function expectedUnitPrice(p, item, wholesale) {
  const unit = wholesale ? num(p.wholesale) || num(p.price) : num(p.price);
  if (!item.pack?.name) return unit;
  const k = (p.packs || []).find((x) => x && x.name === item.pack.name && num(x.size) > 1);
  if (!k) return unit;
  return packPrice(k, unit, wholesale) / num(k.size);
}

/**
 * sale: the record pushed · products: Map(id → stored product, including built-in catalog entries) ·
 * can(perm) → boolean | Promise<boolean> · ctx.credit: { limit, owed } for a client with a credit limit (step 8; owed is
 * what they owed before this sale, as on the Debtors page).  Returns [{ kind, detail, amount }] (amount ≥ 0).
 */
export async function saleFindings(sale, products, can, ctx = {}) {
  const out = [];
  if (!sale || sale.status === 'refunded') return out; // a refund changes no money (step 2 makes sure of that)
  const items = Array.isArray(sale.items) ? sale.items : [];
  // one currency unit of slack per line, and one for the tax and total: per-line rounding and pack-split prices
  // (a box of 3 at 2,000 → 666.67 each) may differ by that much between the two apps; anything more is not rounding
  const slack = items.length + 1;
  const linesSum = items.reduce((a, i) => a + lineTotal({ price: i.price, qty: i.qty, discount: i.discount }, 2), 0);
  const subtotal = num(sale.subtotal), discount = num(sale.discount), tax = num(sale.tax), total = num(sale.total), paid = num(sale.paid);

  const bad = items.filter((i) => !(num(i.qty) > 0) || num(i.price) < 0);
  if (bad.length || discount < 0 || tax < 0 || total < 0 || paid < 0)
    out.push({ kind: 'invalid', detail: `Negative amount or a quantity of zero or less${bad.length ? ` (${bad.map((i) => i.name || i.id).join(', ')})` : ''}`, amount: Math.abs(total) });
  if (Math.abs(linesSum - subtotal) > slack)
    out.push({ kind: 'totals', detail: `The lines add up to ${money(linesSum)} but the sale says ${money(subtotal)}`, amount: Math.abs(linesSum - subtotal) });
  if (Math.abs(subtotal - discount + tax - total) > 1)
    out.push({ kind: 'totals', detail: `${money(subtotal)} − discount ${money(discount)} + tax ${money(tax)} is ${money(subtotal - discount + tax)}, but the total says ${money(total)}`, amount: Math.abs(subtotal - discount + tax - total) });
  if (paid > total + 1)
    out.push({ kind: 'paid', detail: `Paid ${money(paid)} is more than the total ${money(total)}`, amount: paid - total });

  // step 8: over the client's credit limit, by a role without Finance (the apps ask for a reason; an older app does not)
  if (ctx.credit) {
    const over = overLimit({ limit: ctx.credit.limit, owed: ctx.credit.owed, total, tendered: paid });
    if (over && !(await can('finance'))) {
      const why = sale.creditOver?.reason ? `Reason given: ${String(sale.creditOver.reason).slice(0, 200)}` : 'No reason given';
      out.push({ kind: 'credit', detail: `${sale.customerName || 'The client'} owed ${money(over.owed)}; this sale put ${money(over.adds)} on credit, over the limit of ${money(over.limit)}. ${why}`, amount: Math.round(over.owed + over.adds - over.limit) });
    }
  }
  // a proforma's discount and prices were set by whoever made the quotation (proformas permission)
  if (!sale.proformaId) {
    if (discount > 0 && !(await can('pos.discount')))
      out.push({ kind: 'discount', detail: `Discount of ${money(discount)} given by a role without "Give discounts"`, amount: discount });
    if (!(await can('pos.price_edit'))) {
      const wholesale = sale.type === 'wholesale';
      const cheap = [];
      let lost = 0;
      for (const i of items) {
        const p = products.get(String(i.id));
        // compare only with the medicine as it was when the sale was made: a price raised later is not a finding
        if (!p || (p.updatedAt && sale.date && p.updatedAt > sale.date)) continue;
        const want = expectedUnitPrice(p, i, wholesale);
        const gap = (want - num(i.price)) * num(i.qty);
        if (want > 0 && gap > 1) { cheap.push(`${i.name || i.id} at ${money(num(i.price) * (i.pack?.size || 1))} instead of ${money(want * (i.pack?.size || 1))}`); lost += gap; }
      }
      if (cheap.length) out.push({ kind: 'price', detail: `Sold below the medicine's price by a role without "Change prices": ${cheap.join('; ')}`, amount: Math.round(lost) });
    }
  }
  return out;
}

/** A short stable hash, so a finding's id follows the sale's money: a re-send keeps "checked"; a real edit is new */
export function fingerprint(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36);
}

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
import { isKit, kitExpectedPrice, unitsUsed } from '../src/kits.js';

const num = (v) => Number(v) || 0;
const money = (n) => Math.round(num(n)).toLocaleString('en-US');

/** Price a line should have had: the medicine's retail or wholesale price, per unit (a pack line per its pack's own price) */
function expectedUnitPrice(p, item, wholesale, products) {
  // a kit (1.10.0): its fixed price, else the sum of its components' prices (src/kits.js); 0 = not checked
  if (isKit(p)) return products ? kitExpectedPrice(p, products, wholesale) : 0;
  const unit = wholesale ? num(p.wholesale) || num(p.price) : num(p.price);
  if (!item.pack?.name) return unit;
  const k = (p.packs || []).find((x) => x && x.name === item.pack.name && num(x.size) > 1);
  if (!k) return unit;
  return packPrice(k, unit, wholesale) / num(k.size);
}

/**
 * sale: the record pushed · products: Map(id → stored product, including built-in catalog entries) ·
 * can(perm) → boolean | Promise<boolean> · ctx.credit: { limit, owed } for a client with a credit limit (step 8; owed is
 * what they owed before this sale, as on the Debtors page) · ctx.maxDiscount: the pushing role's discount ceiling in %
 * (step 20; null = no limit).  Returns [{ kind, detail, amount }] (amount ≥ 0).
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
  // VAT per item (src/tax.js): the categories' VAT adds up to the sale's, each at its own rate (exempt and zero-rated
  // carry none), so a receipt can't show one VAT and charge another
  if (Array.isArray(sale.taxBreakdown) && sale.taxBreakdown.length) {
    const rows = sale.taxBreakdown, std = num(sale.taxRate);
    const sumTax = rows.reduce((a, r) => a + num(r.tax), 0);
    const off = rows.filter((r) => Math.abs(num(r.tax) - (r.category === 'standard' ? (num(r.net) * std) / 100 : 0)) > slack || (r.category === 'standard' && num(r.rate) !== std));
    if (Math.abs(sumTax - tax) > 1 || off.length)
      out.push({ kind: 'totals', detail: `The VAT by category (${rows.map((r) => `${r.category} ${money(r.tax)}`).join(', ')}) does not match the sale's VAT ${money(tax)} at ${std}%`, amount: Math.abs(sumTax - tax) + off.reduce((a, r) => a + num(r.tax), 0) });
  }
  if (paid > total + 1)
    out.push({ kind: 'paid', detail: `Paid ${money(paid)} is more than the total ${money(total)}`, amount: paid - total });
  // step 22: an insured sale: the insurer's share and what the patient paid can't come to more than the sale
  if (sale.insurance) {
    const share = num(sale.insurance.share);
    if (share < 0 || paid + share > total + 1)
      out.push({ kind: 'insurance', detail: `${sale.insurance.insurer || 'The insurer'} is billed ${money(share)} and the patient paid ${money(paid)}: more than the total ${money(total)}`, amount: Math.abs(paid + share - total) });
  }

  // step 8: over the client's credit limit, by a role without Finance (the apps ask for a reason; an older app does not)
  if (ctx.credit) {
    const over = overLimit({ limit: ctx.credit.limit, owed: ctx.credit.owed, total: total - Math.max(0, num(sale.insurance?.share)), tendered: paid });
    if (over && !(await can('finance'))) {
      const why = sale.creditOver?.reason ? `Reason given: ${String(sale.creditOver.reason).slice(0, 200)}` : 'No reason given';
      out.push({ kind: 'credit', detail: `${sale.customerName || 'The client'} owed ${money(over.owed)}; this sale put ${money(over.adds)} on credit, over the limit of ${money(over.limit)}. ${why}`, amount: Math.round(over.owed + over.adds - over.limit) });
    }
  }
  // A proforma's discount and prices were set by whoever made the quotation (proformas permission), so a sale of one
  // is not re-checked for them, but only when it really is that quotation (2026-11 audit: any proformaId, even a made-up
  // one, used to switch these checks off). ctx.proforma: the stored or pushed proforma, null when the cloud has none,
  // undefined when the caller did not look.
  const pf = sale.proformaId ? proformaVerdict(sale, ctx.proforma) : null;
  if (pf?.finding) out.push(pf.finding);
  if (!pf?.trusted) {
    // what the lines were sold below the medicine's list price (a price changed at the till), per line
    const wholesale = sale.type === 'wholesale';
    const cheap = [];
    let lost = 0;
    for (const i of items) {
      const p = products.get(String(i.id));
      // compare only with the medicine as it was when the sale was made: a price raised later is not a finding
      if (!p || (p.updatedAt && sale.date && p.updatedAt > sale.date)) continue;
      const want = expectedUnitPrice(p, i, wholesale, products);
      const gap = (want - num(i.price)) * num(i.qty);
      if (want > 0 && gap > 1) { cheap.push(`${i.name || i.id} at ${money(num(i.price) * (i.pack?.size || 1))} instead of ${money(want * (i.pack?.size || 1))}`); lost += gap; }
    }
    // step 20: above the role's discount ceiling (Users & roles); the till refuses it, an older app may not. Prices
    // lowered at the till count towards the ceiling too (2026-11 audit: "Change prices" went round it with no limit).
    const max = ctx.maxDiscount;
    const given = discount + lost, gross = subtotal + lost;
    if (max != null && given > 0 && gross > 0 && (given / gross) * 100 > max + 1e-9)
      out.push({ kind: 'discount-limit', detail: `Discount of ${money(given)} (${Math.round((given / gross) * 1000) / 10}% of the sale${lost > 1 ? `, of which ${money(lost)} by prices below the list price` : ''}) is above this role's limit of ${max}%`, amount: Math.round(given - (gross * max) / 100) });
    if (discount > 0 && !(await can('pos.discount')))
      out.push({ kind: 'discount', detail: `Discount of ${money(discount)} given by a role without "Give discounts"`, amount: discount });
    if (cheap.length && !(await can('pos.price_edit'))) out.push({ kind: 'price', detail: `Sold below the medicine's price by a role without "Change prices": ${cheap.join('; ')}`, amount: Math.round(lost) });
  }
  return out;
}

const lineKey = (items) => (Array.isArray(items) ? items : []).map((i) => [String(i?.id ?? ''), num(i?.qty), Math.round(num(i?.price) * 100)]).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] - b[1]));
/**
 * Is this sale the quotation it names? → { trusted, finding? }. Trusted when the proforma exists, was not already sold
 * as another receipt, and the sale has its lines at its prices with no more discount than it gave.
 */
export function proformaVerdict(sale, pf) {
  if (pf === undefined) return { trusted: false };
  const name = `proforma ${pf?.number || sale.proformaId}`;
  const flag = (why) => ({ trusted: false, finding: { kind: 'proforma', detail: `Sold as ${name}, but ${why}; its discount and prices were checked as an ordinary sale`, amount: num(sale.discount) } });
  if (!pf) return flag('the cloud has no such proforma');
  if (pf.status === 'Converted' && pf.saleNumber && sale.number && pf.saleNumber !== sale.number) return flag(`that proforma was already sold as ${pf.saleNumber}`);
  if (JSON.stringify(lineKey(sale.items)) !== JSON.stringify(lineKey(pf.items))) return flag('the lines or prices differ from the proforma');
  if (num(sale.discount) > num(pf.discount) + 1) return flag(`the discount ${money(sale.discount)} is more than the proforma's ${money(pf.discount)}`);
  return { trusted: true };
}

/**
 * 2026-11 audit: the stock a sale or a refund moved, against the sale. moves: the "Sale"/"Refund" movements of one
 * push that name this sale (ref = its receipt number). sale: the sale, from this push or the cloud; null if neither has
 * it. → [{ kind, detail, amount }]. A till sends a sale and its stock in one push (src/sync.js groupOutbox keeps them
 * together), so anything else is worth a look; nothing is refused (an older till may still be catching up).
 */
export function stockFindings(ref, moves, sale) {
  const out = [];
  const units = (list) => { const m = new Map(); for (const x of list) m.set(String(x.productId ?? x.id ?? ''), (m.get(String(x.productId ?? x.id ?? '')) || 0) + Math.abs(num(x.qty))); return m; };
  if (!sale) return [{ kind: 'stock', detail: `Stock was ${moves.some((x) => x.type === 'Refund') ? 'returned' : 'taken'} for receipt ${ref}, which the cloud doesn't have`, amount: 0 }];
  // a kit line's stock is its components' (src/kits.js unitsUsed)
  const sold = units((Array.isArray(sale.items) ? sale.items : []).flatMap(unitsUsed).map(([id, qty]) => ({ id, qty })));
  const refund = moves.filter((x) => x.type === 'Refund');
  if (refund.length && sale.status !== 'refunded') out.push({ kind: 'stock', detail: `Stock was returned for ${ref}, but that sale is not refunded`, amount: 0 });
  for (const [type, list] of [['Sale', moves.filter((x) => x.type === 'Sale')], ['Refund', refund]]) {
    for (const [pid, q] of units(list)) {
      const max = sold.get(pid) || 0;
      if (q > max + 1e-6) out.push({ kind: 'stock', detail: `${type === 'Sale' ? 'Taken out of' : 'Put back into'} stock for ${ref}: ${Math.round(q * 100) / 100} of ${pid}, but the sale has ${Math.round(max * 100) / 100}`, amount: 0 });
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

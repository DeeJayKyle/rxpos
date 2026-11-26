// VAT per item (Uganda, Nov 2026 audit): one rate on the whole sale over-charged VAT on medicines, most of which are
// exempt, while sundries (cosmetics, supplements, devices…) carry the standard rate. Each medicine now has a tax
// category; each sale line is taxed by its own category and the sale keeps a breakdown by category.
//
// The categories follow URA EFRIS's tax categories, so fiscal receipts can map them one to one later:
//   standard  → EFRIS "01" Standard (the pharmacy's VAT rate, 18% in Uganda)
//   zero      → EFRIS "02" Zero-rated (0%, but still a taxable supply)
//   exempt    → EFRIS "03" Exempt (no VAT, not a taxable supply)
// A pharmacy that is not VAT-registered keeps its VAT rate at 0: nothing is charged, the categories are still kept.
//
// Money rules as in src/money.js: each line rounds to the currency's precision, and the receipt discount is shared
// over the lines in proportion to their value (to the unit, any remainder on the largest line) before tax.
import { round, lineTotal } from './money.js';

export const TAX_CATEGORIES = [
  { id: 'standard', label: 'Standard rate', short: 'S', efris: '01' },
  { id: 'zero', label: 'Zero-rated (0%)', short: 'Z', efris: '02' },
  { id: 'exempt', label: 'Exempt', short: 'E', efris: '03' },
];
const BY_ID = Object.fromEntries(TAX_CATEGORIES.map((c) => [c.id, c]));
export const isTaxCategory = (id) => Object.hasOwn(BY_ID, id);
export const taxCategory = (id) => BY_ID[id] || null;

/** The VAT rate (%) a category carries, given the pharmacy's standard rate */
export const rateOf = (category, standardRate) => (category === 'standard' ? Number(standardRate) || 0 : 0);

/**
 * A medicine's tax category: its own, else the pharmacy's default for medicines not yet classified. Before per-item
 * VAT every line was charged the one rate, so the default is "standard" until the pharmacy chooses otherwise: no
 * sale's total changes until someone classifies the medicines or changes the default.
 */
export const categoryOf = (product, settings = {}) =>
  isTaxCategory(product?.taxCategory) ? product.taxCategory : isTaxCategory(settings.defaultTaxCategory) ? settings.defaultTaxCategory : 'standard';

/** Category labels for a select, with the rate a standard-rate item would pay */
export const categoryOptions = (standardRate) => TAX_CATEGORIES.map((c) => ({ value: c.id, label: c.id === 'standard' ? `${c.label} (${Number(standardRate) || 0}%)` : c.label }));

/** The receipt discount shared over the line nets in proportion, to the unit; the remainder goes on the largest line */
export function shareDiscount(nets, discount, decimals = 0) {
  const total = nets.reduce((a, n) => a + n, 0);
  const d = Math.max(0, Math.min(Number(discount) || 0, total));
  if (!d || !total) return nets.map(() => 0);
  const shares = nets.map((n) => round((d * n) / total, decimals));
  const rest = round(d - shares.reduce((a, s) => a + s, 0), decimals);
  if (rest) {
    let big = 0;
    for (let k = 1; k < nets.length; k++) if (nets[k] > nets[big]) big = k;
    shares[big] = round(shares[big] + rest, decimals);
  }
  return shares;
}

/**
 * VAT for a sale, line by line. [lines] are cart or sale lines ({ price, qty, discount?, taxCategory }), [discount]
 * the receipt discount, [standardRate] the pharmacy's VAT rate. Returns:
 *   lines: each line's taxCategory, taxable value after its share of the discount (taxable) and VAT (tax)
 *   tax: the sale's VAT, the sum of the lines' (so a receipt and its lines always agree)
 *   breakdown: one row per category present, in the order of TAX_CATEGORIES: { category, efris, rate, net, tax }
 * VAT is added to the price (as RxPOS always has): total = subtotal − discount + tax.
 */
export function saleTax(lines, { discount = 0, standardRate = 0, decimals = 0 } = {}) {
  const list = lines || [];
  const nets = list.map((l) => lineTotal(l, decimals));
  const shares = shareDiscount(nets, discount, decimals);
  const out = list.map((l, k) => {
    const category = isTaxCategory(l.taxCategory) ? l.taxCategory : 'standard';
    const taxable = round(nets[k] - shares[k], decimals);
    const rate = rateOf(category, standardRate);
    return { taxCategory: category, taxable, tax: rate ? round((taxable * rate) / 100, decimals) : 0 };
  });
  const rows = new Map();
  for (const l of out) {
    const r = rows.get(l.taxCategory) || { category: l.taxCategory, efris: BY_ID[l.taxCategory].efris, rate: rateOf(l.taxCategory, standardRate), net: 0, tax: 0 };
    r.net = round(r.net + l.taxable, decimals); r.tax = round(r.tax + l.tax, decimals);
    rows.set(l.taxCategory, r);
  }
  const breakdown = TAX_CATEGORIES.filter((c) => rows.has(c.id)).map((c) => rows.get(c.id));
  return { lines: out, tax: round(breakdown.reduce((a, r) => a + r.tax, 0), decimals), breakdown };
}

/**
 * A sale's VAT by category for receipts and reports. Sales made before per-item VAT have no breakdown: their VAT
 * shows as one "not classified" row (category null) so old figures are never re-labelled after the fact.
 */
export function breakdownOf(sale) {
  if (Array.isArray(sale?.taxBreakdown) && sale.taxBreakdown.length) return sale.taxBreakdown;
  const net = (Number(sale?.subtotal ?? sale?.total) || 0) - (Number(sale?.discount) || 0);
  return [{ category: null, efris: '', rate: null, net, tax: Number(sale?.tax) || 0 }];
}

/** Adds up breakdowns across sales (sign −1 for refunds): one row per category, older sales last */
export function sumBreakdowns(entries) {
  const rows = new Map();
  for (const [sale, sign = 1] of entries) for (const r of breakdownOf(sale)) {
    const key = r.category ?? '';
    const t = rows.get(key) || { category: r.category, efris: r.efris, rate: r.rate, net: 0, tax: 0 };
    t.net += sign * (Number(r.net) || 0); t.tax += sign * (Number(r.tax) || 0);
    rows.set(key, t);
  }
  return [...TAX_CATEGORIES.map((c) => rows.get(c.id)).filter(Boolean), ...(rows.has('') ? [rows.get('')] : [])];
}

/** One row's words: "VAT 18% (standard)", "Zero-rated", "Exempt", "Not classified (before per-item VAT)" */
export const breakdownLabel = (r) => (r.category === 'standard' ? `VAT ${r.rate}% (standard)` : r.category ? BY_ID[r.category].label.replace(/ \(0%\)$/, '') : 'Not classified (before per-item VAT)');

/** A receipt shows VAT by category once the sale was made with per-item VAT by a VAT-registered pharmacy */
export const showsVat = (sale) => Array.isArray(sale?.taxBreakdown) && sale.taxBreakdown.length > 0 && Number(sale.taxRate) > 0;
/** The letter printed beside a receipt line (S, Z, E), keyed to the VAT summary under the total */
export const lineMark = (sale, item) => (showsVat(sale) && isTaxCategory(item?.taxCategory) ? BY_ID[item.taxCategory].short : '');
/** The receipt's VAT lines: [label, amount] per category, then the total VAT; older sales keep their one "Tax" line */
export function receiptVatRows(sale, fmt) {
  if (!showsVat(sale)) return Number(sale?.tax) > 0 ? [['Tax', fmt(sale.tax)]] : [];
  return [
    ...sale.taxBreakdown.map((r) => [`${BY_ID[r.category]?.short || ''} ${breakdownLabel(r)} on ${fmt(r.net)}`.trim(), fmt(r.tax)]),
    ['Total VAT', fmt(sale.tax)],
  ];
}

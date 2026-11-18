// Money math for RxPOS (review Phase 1.5).
//
// Amounts are whole currency units. Ugandan shillings have no minor unit in day-to-day use, so the pharmacy's
// `decimals` setting (default 0) sets the displayed and stored precision. Every arithmetic step rounds ONCE and
// explicitly, so a figure and its reversal (a refund) match to the unit and a pack-split price (e.g. a box of three
// priced at 2,000 → 666.67 each) can never leave a floating-point tail like 1999.9999 on a stored total.
//
// Rounding rule: half away from zero, applied per line and once per tax. Math.round alone rounds -2.5 to -2, so the
// sign is taken off first and put back: a refund (a negative amount) rounds exactly like the sale it reverses.

export const round = (n, decimals = 0) => {
  const f = 10 ** (Number(decimals) || 0);
  const v = Number(n) || 0;
  const r = Math.round((Math.abs(v) + Number.EPSILON) * f) / f;
  return v < 0 && r ? -r : r;
};

/** A sale line's net after its (amount) discount, rounded to the currency's precision. Never negative. */
export function lineTotal({ price, qty, discount = 0 }, decimals = 0) {
  const gross = (Number(price) || 0) * (Number(qty) || 0);
  return round(Math.max(0, gross - (Number(discount) || 0)), decimals);
}

/** Sum of the cart's line nets, each rounded per line (the documented per-line rule). */
export function cartSubtotal(lines, decimals = 0) {
  return (lines || []).reduce((a, l) => a + lineTotal(l, decimals), 0);
}

/** Tax on a net amount, rounded once. inclusive = the net already contains the tax (extract it); else add it on. */
export function taxOf(net, ratePercent, { inclusive = false, decimals = 0 } = {}) {
  const r = (Number(ratePercent) || 0) / 100;
  if (!r) return 0;
  const amt = Number(net) || 0;
  return round(inclusive ? (amt * r) / (1 + r) : amt * r, decimals);
}

/** Price per sub-unit when a pack is split (a box of `perPack`), rounded to the currency's precision. */
export function unitPrice(packPrice, perPack, decimals = 0) {
  const n = Number(perPack) || 1;
  return round((Number(packPrice) || 0) / (n || 1), decimals);
}

/** A quantity for display: whole units as they are, part units (a split pack, a measured liquid) to at most 2
 * decimals with trailing zeros dropped, so 7.833333333 shows as 7.83. Display only: stored quantities keep their
 * full precision. With a unit, it is appended (singular for exactly 1). */
// Number formatters are slow to create (each toLocaleString with options builds one): one per locale and decimals,
// made once and reused. The text is exactly what toLocaleString gives.
const formatters = new Map();
const formatterFor = (locale, opts) => {
  const k = locale + '|' + JSON.stringify(opts);
  let f = formatters.get(k);
  if (!f) { f = new Intl.NumberFormat(locale, opts); formatters.set(k, f); }
  return f;
};
const QTY = { maximumFractionDigits: 2, useGrouping: false };

export function formatQty(n, unit = '') {
  const v = Number(n);
  if (!isFinite(v)) return '—';
  const txt = formatterFor('en-US', QTY).format(Math.abs(v - Math.round(v)) < 1e-9 ? Math.round(v) : round(v, 2));
  if (!unit) return txt;
  return `${txt} ${Math.abs(v) === 1 ? singular(unit) : unit}`;
}

// 'Boxes' → 'Box', 'Glasses' → 'Glass', 'tablets' → 'tablet', 'Bottles' → 'Bottle'.
const singular = (unit) => (/(x|z|ch|sh|ss)es$/i.test(unit) ? unit.slice(0, -2) : unit.replace(/s$/i, ''));

/** Format for display in the PHARMACY'S locale and currency, not the device's (review Phase 1.5). */
export function formatMoney(n, { currency = '', decimals = 0, locale } = {}) {
  const grouped = formatterFor(locale || 'en-UG', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(Number(n) || 0);
  return `${currency} ${grouped}`.trim();
}

/** A long amount said short for a figure card (UI batch 3, B6): UGX 1.2M, UGX 350K, UGX 2.5B. Below 100,000 the
 * amount is shown in full (formatMoney). The full amount stays in the card's tooltip and for screen readers. */
export function shortMoney(n, { currency = '', decimals = 0, locale } = {}) {
  const v = Number(n) || 0, a = Math.abs(v);
  if (a < 100000) return formatMoney(v, { currency, decimals, locale });
  const [d, s] = a >= 1e9 ? [1e9, 'B'] : a >= 1e6 ? [1e6, 'M'] : [1e3, 'K'];
  const x = a / d;
  // one decimal while it says something (1.2M), none once the number is long (350K, 12M)
  const txt = (x >= 100 ? Math.round(x) : Math.round(x * 10) / 10).toString().replace(/\.0$/, '');
  return `${currency} ${v < 0 ? '−' : ''}${txt}${s}`.trim();
}

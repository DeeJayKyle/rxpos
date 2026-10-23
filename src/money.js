// Money math for RxPOS (review Phase 1.5).
//
// Amounts are whole currency units. Ugandan shillings have no minor unit in day-to-day use, so the pharmacy's
// `decimals` setting (default 0) sets the displayed and stored precision. Every arithmetic step rounds ONCE and
// explicitly, so a figure and its reversal (a refund) match to the unit and a pack-split price (e.g. a box of three
// priced at 2,000 → 666.67 each) can never leave a floating-point tail like 1999.9999 on a stored total.
//
// Rounding rule: half away from zero (Math.round on a non-negative amount), applied per line and once per tax.

export const round = (n, decimals = 0) => {
  const f = 10 ** (Number(decimals) || 0);
  return Math.round(((Number(n) || 0) + Number.EPSILON) * f) / f;
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

/** Format for display in the PHARMACY'S locale and currency, not the device's (review Phase 1.5). */
export function formatMoney(n, { currency = '', decimals = 0, locale } = {}) {
  const grouped = (Number(n) || 0).toLocaleString(locale || 'en-UG', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return `${currency} ${grouped}`.trim();
}

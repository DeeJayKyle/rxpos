// Insurance (workplan step 22). An insurer (e.g. an HMO) has schemes; each scheme says what the patient pays at the
// till (the co-pay: a percentage of the sale, a fixed amount, whichever is more) and may cap what the insurer covers
// per sale (anything above the cap is the patient's too). The sale keeps the split in `insurance.share` (what the
// insurer owes) and `paid` (what the patient paid now). The insurer's share is owed like credit: it is not the client's
// debt and is not money in the drawer until the insurer pays. Same rules in Dart:
// rxpos_flutter/lib/core/rules/insurance.dart; both are checked against tests/insurance-cases.json.

const num = (v) => Number(v) || 0;

/**
 * Split a sale between the patient and the insurer. scheme: { copayPct, copayFixed, limit } · total: the sale total
 * (after discount and tax) · decimals: the pharmacy's money decimals. Returns { copay, insurer }.
 */
export function copayOf(scheme, total, decimals = 0) {
  const f = 10 ** (num(decimals) > 0 ? num(decimals) : 0);
  const r = (x) => Math.round(x * f) / f;
  const t = Math.max(0, r(num(total)));
  const pct = Math.min(100, Math.max(0, num(scheme?.copayPct)));
  let copay = Math.max(num(scheme?.copayFixed), r((t * pct) / 100));
  copay = Math.min(t, Math.max(0, r(copay)));
  let insurer = r(t - copay);
  const limit = num(scheme?.limit);
  if (limit > 0 && insurer > limit) { insurer = r(limit); copay = r(t - insurer); }
  return { copay, insurer };
}

/** What the insurer owes on this sale (0 for an uninsured or refunded sale) */
export const insurerShare = (s) => (s && s.status !== 'refunded' && s.insurance ? Math.max(0, num(s.insurance.share)) : 0);

/** What the client still owes on this sale: the total less what they paid and less the insurer's share */
export const clientOwes = (s) => (s && s.status !== 'refunded' ? num(s.total) - num(s.paid ?? s.total) - insurerShare(s) : 0);

/** What an insurer owes: its share of the sales not refunded, less its payments (payments of kind 'insurer') */
export function insurerBalance(sales, payments, insurerId, sums = null) {
  if (sums) return sums.insurer.get(insurerId) || 0; // stage 4: a device keeping recent history (balances.js windowSums)
  const owed = (sales || []).filter((s) => s.insurance?.insurerId === insurerId).reduce((a, s) => a + insurerShare(s), 0);
  const paid = (payments || []).filter((p) => p.kind === 'insurer' && p.partyId === insurerId).reduce((a, p) => a + num(p.amount), 0);
  return owed - paid;
}

/** The schemes of all insurers as choices for the till: [{ key, insurer, scheme }] */
export const schemeChoices = (insurers) => (insurers || []).filter((i) => !i.archived).flatMap((i) => (i.schemes || []).map((s) => ({ key: `${i.id}|${s.id}`, insurer: i, scheme: s })));

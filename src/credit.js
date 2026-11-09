// Credit limits (review 2.2, workplan step 8). Same rule as rxpos_flutter/lib/features/sales_pos/domain/cart.dart
// overLimit: a credit sale may not take a client over their limit without a reason. What they owe is the Debtors
// page's figure (store.jsx customerBalance): unpaid credit sales, not refunded, less their payments.

/** { limit, owed, adds } when (owed + what this sale puts on credit) is over the limit; null otherwise or no limit */
export function overLimit({ limit, owed, total, tendered }) {
  const lim = Number(limit) || 0;
  if (!(lim > 0)) return null;
  const t = Number(total) || 0;
  const paidNow = Math.max(0, Math.min(Number(tendered) || 0, t));
  const adds = t - paidNow;
  if (!(adds > 0.5)) return null; // paid in full now: this sale adds nothing to what they owe
  const o = Number(owed) || 0;
  return o + adds > lim + 0.5 ? { limit: lim, owed: o, adds } : null;
}

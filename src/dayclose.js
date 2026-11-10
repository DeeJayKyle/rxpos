// Closing a day (workplan step 18). An admin or manager closes a day for a branch; after that its money and stock
// records can't be changed or deleted from any device (the cloud refuses it). Owner's choices:
//   - something NEW dated in a closed day (a till that sold offline and reconnects later) is kept and flagged in
//     "Sales to check" as recorded after the day was closed, so no real sale is lost;
//   - refunding a sale from a closed day is allowed (customers bring things back) and flagged;
//   - reopening a day needs an administrator and a reason, and is audited.
// A close also keeps a frozen copy of the day's totals, so the closed figures stay on record whatever happens later.
// Used by the React app, the cloud (worker/index.js) and, in Dart, rxpos_flutter/lib/core/rules/day_close.dart.

/** Records a closed day protects. A stock movement that belongs to a document (a sale, a delivery…) follows it. */
export const LOCKED_TABLES = new Set(['sales', 'expenses', 'payments', 'bankTx', 'purchases', 'supplierReturns', 'movements']);
/** Movements with their own document: flagged through that document, not one by one */
export const DOCUMENT_MOVES = new Set(['Sale', 'Sale edit', 'Refund', 'Purchase', 'Purchase edit', 'Supplier return', 'Transfer in', 'Transfer out']);

const MAIN = 'main';
export const closeId = (branchId, day) => `${branchId || MAIN}:${day}`;

/** The set of closed `${branch}:${day}` keys from the dayCloses records (a reopened day is open again) */
export const closedSet = (closes) => new Set((closes || []).filter((c) => c && c.day && !c.open).map((c) => closeId(c.branchId, c.day)));

/**
 * The day a record belongs to: its `date` (an ISO time or a plain YYYY-MM-DD). dayOf turns a time into a local day
 * (the device's own on a device, Uganda time in the cloud). Null when the record has no date.
 */
export function recordDay(rec, dayOf) {
  const d = rec?.date;
  if (!d) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(String(d)) ? String(d) : dayOf(d);
}

/** Is this record in a closed day? */
export const inClosedDay = (rec, closed, dayOf) => {
  const day = recordDay(rec, dayOf);
  return !!day && closed.has(closeId(rec.branchId, day));
};

/** The day's totals at closing, kept on the close record: sales, by payment method, refunds, expenses */
export function daySnapshot(db, branchId, day, dayOf) {
  const at = (r) => (r.branchId || MAIN) === (branchId || MAIN) && recordDay(r, dayOf) === day;
  const sales = (db.sales || []).filter(at);
  const done = sales.filter((s) => s.status !== 'refunded');
  const byPayment = {};
  for (const s of done) byPayment[s.payment || 'Other'] = (byPayment[s.payment || 'Other'] || 0) + (Number(s.total) || 0);
  return {
    sales: done.length,
    total: done.reduce((a, s) => a + (Number(s.total) || 0), 0),
    byPayment,
    refunded: sales.length - done.length,
    expenses: (db.expenses || []).filter(at).reduce((a, e) => a + (Number(e.amount) || 0), 0),
  };
}

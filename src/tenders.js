// How a sale was paid (Nov 2026 audit item 5: split tender). Used by the React app and the cloud (worker/).
//
// A sale paid one way keeps `payment` (the method's name) and `paid` (what was taken now; the rest is on credit or
// billed to an insurer), as before. A sale paid several ways (part cash, part card, part on credit…) has
// `payment: 'Split'` and `payments`: [{ method, type, amount, bankId }], one per tender. `type` is the method's type
// from Settings → Payment methods (cash, momo, credit, other); a `credit` part is what the client still owes, so it
// takes no money and has no account. `paid` is the sum of the other parts, so every older reader of `paid` stays right.
// A cash part keeps only what stayed in the drawer: the change is already taken off (`tendered` keeps what was given).
//
// A return of part of a sale (src/returns.js) is a sale record with negative amounts and `returnOf`: the same helpers
// give its tenders as negative amounts (money going back).

export const SPLIT = 'Split';
const num = (v) => Number(v) || 0;
const CREDIT_NAME = /^credit$/i;
const CASH_NAME = /^cash$/i;

export const isSplit = (s) => Array.isArray(s?.payments) && s.payments.length > 0;
/** A return of part of a sale (src/returns.js) */
export const isReturn = (s) => !!s?.returnOf;

/**
 * The money taken, per tender: [{ method, type, amount, bankId }]. Credit parts are left out (owed, not paid).
 * A one-method sale: its `paid` under its method. A credit sale's "paid now" is taken in cash at the till.
 */
export function tendersOf(s) {
  if (!s) return [];
  if (isSplit(s)) {
    return s.payments.filter((p) => p && p.type !== 'credit' && num(p.amount))
      .map((p) => ({ method: String(p.method || 'Other'), type: p.type || (CASH_NAME.test(p.method) ? 'cash' : 'other'), amount: num(p.amount), bankId: p.bankId ?? s.bankId }));
  }
  const paid = num(s.paid ?? s.total);
  if (!paid) return [];
  const method = String(s.payment || 'Cash');
  const credit = CREDIT_NAME.test(method);
  return [{ method: credit ? 'Cash' : method, type: credit || CASH_NAME.test(method) ? 'cash' : 'other', amount: paid, bankId: s.bankId }];
}

/** Cash taken into the drawer by this sale (negative for a return paid back in cash) */
export const cashOf = (s) => tendersOf(s).filter((t) => t.type === 'cash').reduce((a, t) => a + t.amount, 0);

/** The money taken per method: { method: amount } */
export function byMethod(sales) {
  const m = {};
  for (const s of sales || []) for (const t of tendersOf(s)) m[t.method] = (m[t.method] || 0) + t.amount;
  return m;
}

/**
 * The sale's TOTAL shared out by method, for reports ("how were sales paid"): a one-method sale is all under its
 * method, as before; a split sale under each part (credit included), and the insurer's share under its name.
 */
export function totalByMethod(s) {
  if (!isSplit(s)) return [[s?.payment || 'Cash', num(s?.total)]];
  const out = new Map();
  for (const p of s.payments) out.set(String(p.method || 'Other'), (out.get(String(p.method || 'Other')) || 0) + num(p.amount));
  const rest = num(s.total) - s.payments.reduce((a, p) => a + num(p.amount), 0);
  if (Math.abs(rest) > 0.005) { const k = s.insurance?.insurer || 'Insurance'; out.set(k, (out.get(k) || 0) + rest); }
  return [...out];
}

/** "Cash + Card" for a split sale, else its method */
export const payLabel = (s) => (isSplit(s) ? [...new Set(s.payments.map((p) => p.method))].join(' + ') : s?.payment || '');

/** Does this sale use this method (filters: a split sale is found under each of its methods)? */
export const paidWith = (s, method) => (isSplit(s) ? s.payments.some((p) => p.method === method) : s?.payment === method);

/**
 * The tenders of a split payment at the till, checked. parts: [{ method, type, amount, bankId? }] as typed (amount may
 * be '' or a string). due: what the client pays now (after the insurer's share). decimals: money decimals.
 * → { ok, error?, payments, paid, tendered, change, credit }. Only cash can be over-paid (the change comes from it);
 * every other part is taken exactly. A credit part needs a registered client (the caller checks that). fmt: money text.
 */
export function settleSplit(parts, due, decimals = 0, fmt = String) {
  const f = 10 ** Math.max(0, num(decimals));
  const r = (x) => Math.round(num(x) * f) / f;
  const list = (parts || []).map((p) => ({ ...p, amount: r(p.amount) })).filter((p) => p.amount !== 0);
  const fail = (error) => ({ ok: false, error, payments: [], paid: 0, tendered: 0, change: 0, credit: 0 });
  if (list.some((p) => p.amount < 0)) return fail('A part of the payment is less than 0');
  if (list.length < 2) return fail('Enter at least two parts, or choose one payment method');
  const given = r(list.reduce((a, p) => a + p.amount, 0));
  const cashGiven = r(list.filter((p) => p.type === 'cash').reduce((a, p) => a + p.amount, 0));
  const target = r(due);
  if (given < target - 0.5 / f) return fail(`${fmt(r(target - given))} still to pay`);
  const change = r(given - target);
  if (change > 0 && change > cashGiven + 1e-9) return fail('Only cash can be more than what is due (the change comes from it)');
  // the change comes off the cash parts, last cash part first
  let left = change;
  const payments = list.slice().reverse().map((p) => {
    if (p.type !== 'cash' || !(left > 0)) return p;
    const off = Math.min(left, p.amount); left = r(left - off);
    return { ...p, amount: r(p.amount - off) };
  }).reverse().filter((p) => p.amount > 0)
    .map((p) => ({ method: p.method, type: p.type || 'other', amount: p.amount, ...(p.type === 'credit' || p.bankId == null ? {} : { bankId: p.bankId }), ...(p.ref ? { ref: String(p.ref).slice(0, 60) } : {}) }));
  const credit = r(payments.filter((p) => p.type === 'credit').reduce((a, p) => a + p.amount, 0));
  const paid = r(target - credit);
  return { ok: true, payments, paid, tendered: r(paid + change), change, credit };
}

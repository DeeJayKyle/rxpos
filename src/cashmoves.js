// Cash in the till drawer (Nov 2026 audit item 7). What a drawer should hold at cash-up was the float plus cash sales
// less cash refunds; cash that came in or went out for anything else made an honest drawer look over or short. Now:
//
//   expected = float + cash taken on sales (each sale's cash part, src/tenders.js) − cash given back (refunds and
//              returns) + debts paid in cash + cash paid in − cash paid out (expenses, suppliers, loans paid from
//              "Cash at hand", and the till's own pay-outs)
//
// A pay-in or pay-out at the till is a `cashMoves` record: { id, date (ISO time), branchId, shiftId, user, kind: 'in' |
// 'out', amount (> 0), reason, note }. It moves the "Cash at hand" account (src/balances.js), like the rest.
import { cashOf } from './tenders.js';

export const CASH_ACCOUNT = 'cash-drawer'; // finance.js CASH
export const PAY_IN_REASONS = ['Float top-up', 'Change brought in', 'Owner put cash in', 'Other'];
export const PAY_OUT_REASONS = ['Petty expense', 'Supplier paid in cash', 'Cash taken to the bank or safe', 'Staff advance', 'Other'];

const num = (v) => Number(v) || 0;
const MAIN = 'main';
const isDay = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d || ''));

/**
 * The cash flows of one person's shift. shift: { user, branchId, openedAt, closedAt?, float } · dayOf: ISO time →
 * local day (records dated by day only, like payments and expenses, count on the shift's days).
 * → { float, sales, refunds, returns, debts, paidIn, paidOut, spent, expected }
 */
export function shiftCash(db, shift, end, dayOf) {
  const branch = shift.branchId || MAIN;
  const at = (r) => (r.branchId || MAIN) === branch;
  const inTime = (d) => d >= shift.openedAt && d <= end;
  const from = dayOf(shift.openedAt), to = dayOf(end);
  const when = (d) => (isDay(d) ? d >= from && d <= to : inTime(String(d || '')));
  const sales = (db.sales || []).filter((s) => at(s) && s.cashier === shift.user && inTime(s.date));
  // every sale's cash came in, even one refunded since: the refund gives it back (before, a sale made and refunded
  // in the same shift was taken off twice)
  const taken = sales.filter((s) => !s.returnOf).reduce((a, s) => a + cashOf(s), 0);
  const returns = -sales.filter((s) => s.returnOf).reduce((a, s) => a + cashOf(s), 0);
  const refunds = (db.sales || []).filter((s) => at(s) && s.status === 'refunded' && s.refundedBy === shift.user && inTime(String(s.refundedAt || ''))).reduce((a, s) => a + cashOf(s), 0);
  const cashAcct = (r) => (r.bankId || CASH_ACCOUNT) === CASH_ACCOUNT;
  let debts = 0, spent = 0;
  for (const p of db.payments || []) {
    if (!cashAcct(p) || p.by !== shift.user || !when(p.date) || (p.branchId && !at(p))) continue;
    if (p.kind === 'customer' || p.kind === 'insurer') debts += num(p.amount); else spent += num(p.amount);
  }
  for (const e of db.expenses || []) if (cashAcct(e) && e.recordedBy === shift.user && when(e.date) && (!e.branchId || at(e))) spent += num(e.amount);
  let paidIn = 0, paidOut = 0;
  for (const m of db.cashMoves || []) {
    if (!(m.shiftId ? m.shiftId === shift.id : m.user === shift.user && at(m) && inTime(String(m.date || '')))) continue;
    if (m.kind === 'out') paidOut += num(m.amount); else paidIn += num(m.amount);
  }
  const float = num(shift.float);
  return { float, sales: taken, refunds, returns, debts, paidIn, paidOut, spent, expected: float + taken - refunds - returns + debts + paidIn - paidOut - spent };
}

/** A day's cash flows at a branch (Close the day): the same parts, for everyone, without the floats */
export function dayCash(db, branchId, day, dayOf) {
  const branch = branchId || MAIN;
  const at = (r) => (r.branchId || MAIN) === branch;
  const on = (d) => (isDay(d) ? d === day : !!d && dayOf(d) === day);
  const sales = (db.sales || []).filter((s) => at(s) && on(s.date));
  // a sale refunded since still took its cash on its day; the refund gives it back on the refund's day
  const taken = sales.filter((s) => !s.returnOf).reduce((a, s) => a + cashOf(s), 0);
  const returns = -sales.filter((s) => s.returnOf).reduce((a, s) => a + cashOf(s), 0);
  const refunds = (db.sales || []).filter((s) => at(s) && s.status === 'refunded' && on(s.refundedAt || s.date)).reduce((a, s) => a + cashOf(s), 0);
  const cashAcct = (r) => (r.bankId || CASH_ACCOUNT) === CASH_ACCOUNT;
  let debts = 0, spent = 0;
  for (const p of db.payments || []) {
    if (!cashAcct(p) || !on(p.date) || (p.branchId && !at(p))) continue;
    if (p.kind === 'customer' || p.kind === 'insurer') debts += num(p.amount); else spent += num(p.amount);
  }
  for (const e of db.expenses || []) if (cashAcct(e) && on(e.date) && (!e.branchId || at(e))) spent += num(e.amount);
  let paidIn = 0, paidOut = 0;
  for (const m of db.cashMoves || []) if (at(m) && on(m.date)) { if (m.kind === 'out') paidOut += num(m.amount); else paidIn += num(m.amount); }
  return { sales: taken, refunds, returns, debts, paidIn, paidOut, spent, net: taken - refunds - returns + debts + paidIn - paidOut - spent };
}

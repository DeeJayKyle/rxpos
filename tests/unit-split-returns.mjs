// Split payments, returns of part of a sale and the cash a drawer should hold (Nov 2026 audit items 5, 6 and 7):
// src/tenders.js, src/returns.js, src/cashmoves.js, and how the balances, the ledger, the day close, the cloud's
// write policy, sale checks and report figures read them.   node unit-split-returns.mjs
import { settleSplit, tendersOf, cashOf, byMethod, totalByMethod, payLabel, paidWith } from '../src/tenders.js';
import { planReturn, returnRecord, returnable, returnFindings, fullyReturned } from '../src/returns.js';
import { shiftCash, dayCash } from '../src/cashmoves.js';
import { entriesOf, sumEntries } from '../src/balances.js';
import { ledger } from '../src/finance.js';
import { clientOwes, insurerShare } from '../src/insurance.js';
import { stockParts } from '../src/kits.js';
import { daySnapshot } from '../src/dayclose.js';
import { decide, moneyView } from '../worker/policy.js';
import { saleFindings, stockFindings } from '../worker/anomalies.js';
import { summarise } from '../worker/summary.js';

let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + String(x) : ''}`); };
const dayOf = (iso) => String(iso).slice(0, 10);
const CASH = 'cash-drawer';

// ---------- split payments ----------
{
  const s = settleSplit([{ method: 'Cash', type: 'cash', amount: '5000', bankId: CASH }, { method: 'Card', type: 'other', amount: 3000, bankId: 'bank' }], 7000);
  check('split: cash over-paid gives change from the cash part', s.ok && s.change === 1000 && s.paid === 7000 && s.tendered === 8000 && s.payments[0].amount === 4000 && s.payments[1].amount === 3000, JSON.stringify(s));
  const c = settleSplit([{ method: 'Cash', type: 'cash', amount: 2000 }, { method: 'Credit', type: 'credit', amount: 5000 }], 7000);
  check('split: part cash, part on credit', c.ok && c.paid === 2000 && c.credit === 5000 && c.change === 0 && !('bankId' in c.payments[1]), JSON.stringify(c));
  check('split: short is refused', !settleSplit([{ method: 'Cash', type: 'cash', amount: 1000 }, { method: 'Card', type: 'other', amount: 1000 }], 3000).ok);
  check('split: only cash may be over-paid', !settleSplit([{ method: 'Card', type: 'other', amount: 5000 }, { method: 'Momo', type: 'momo', amount: 1000 }], 3000).ok);
  check('split: one part is not a split', !settleSplit([{ method: 'Cash', type: 'cash', amount: 3000 }, { method: 'Card', type: 'other', amount: 0 }], 3000).ok);
  check('split: a negative part is refused', !settleSplit([{ method: 'Cash', type: 'cash', amount: 4000 }, { method: 'Card', type: 'other', amount: -1000 }], 3000).ok);
}
const split = { id: 's1', number: 'R1', date: '2026-11-26T08:00:00.000Z', branchId: 'main', cashier: 'Ann', customerId: 'c1', customerName: 'Bob',
  items: [
    { id: 'p1', name: 'Amoxicillin', price: 100, cost: 40, qty: 30, pack: { name: 'Strip', size: 10, count: 3, price: 1000 }, alloc: [{ batchId: 'b1', qty: 20 }, { batchId: 'b2', qty: 10 }] },
    { id: 'p2', name: 'Paracetamol', price: 50, cost: 20, qty: 3, alloc: [{ batchId: 'b3', qty: 3 }] },
  ],
  subtotal: 3150, discount: 150, tax: 0, total: 3000, payment: 'Split', paid: 2500, tendered: 3000, bankId: CASH,
  payments: [{ method: 'Cash', type: 'cash', amount: 2000, bankId: CASH }, { method: 'Card', type: 'other', amount: 500, bankId: 'bank' }, { method: 'Credit', type: 'credit', amount: 500 }], status: 'completed' };
check('tenders: credit left out, each with its account', JSON.stringify(tendersOf(split)) === JSON.stringify([{ method: 'Cash', type: 'cash', amount: 2000, bankId: CASH }, { method: 'Card', type: 'other', amount: 500, bankId: 'bank' }]));
check('tenders: cash part', cashOf(split) === 2000);
check('tenders: a one-method sale as before', JSON.stringify(tendersOf({ payment: 'Mobile Money', total: 900, bankId: 'momo' })) === JSON.stringify([{ method: 'Mobile Money', type: 'other', amount: 900, bankId: 'momo' }]));
check('tenders: a credit sale\'s paid-now is cash', cashOf({ payment: 'Credit', total: 900, paid: 300 }) === 300);
check('by method and total by method', byMethod([split]).Cash === 2000 && JSON.stringify(totalByMethod(split)) === JSON.stringify([['Cash', 2000], ['Card', 500], ['Credit', 500]]));
check('label and filter', payLabel(split) === 'Cash + Card + Credit' && paidWith(split, 'Card') && !paidWith(split, 'Mobile Money'));
{
  const e = entriesOf('sales', split);
  const acct = Object.fromEntries(e.filter((x) => x.kind === 'account').map((x) => [x.key, x.amount]));
  const owes = e.find((x) => x.kind === 'customer')?.amount;
  check('balances: each tender into its account, the credit part owed', acct[CASH] === 2000 && acct.bank === 500 && owes === 500, JSON.stringify(e));
  const db = { sales: [split], purchases: [], supplierReturns: [], expenses: [], payments: [], loans: [], bankTx: [], banks: [], expenseCategories: [], customers: [], suppliers: [] };
  const l = ledger(db);
  check('ledger: one line per tender', l.length === 2 && l.find((x) => x.account === 'bank').in === 500);
}

// ---------- returns of part of a sale ----------
{
  check('return: a pack line only in whole packs', !planReturn(split, [], [{ line: 0, qty: 15 }]).ok);
  check('return: not more than is left', !planReturn(split, [], [{ line: 1, qty: 4 }]).ok);
  const p1 = planReturn(split, [], [{ line: 0, qty: 20 }, { line: 1, qty: 1 }]);
  check('return: plan ok, not full', p1.ok && !p1.full, JSON.stringify(p1).slice(0, 200));
  check('return: stock back to the last batch first', JSON.stringify(p1.items[0].alloc) === JSON.stringify([{ batchId: 'b2', qty: -10 }, { batchId: 'b1', qty: -10 }]));
  check('return: debt cancelled first, then money back', p1.unpaid === 500 && p1.back === p1.total - 500, JSON.stringify(p1));
  const r1 = { id: 'x1', number: 'CN1', date: '2026-11-26T10:00:00.000Z', cashier: 'Ann', branchId: 'main', ...returnRecord(split, p1, { reason: 'Customer returned it' }) };
  check('return record: negative, a credit note of R1', r1.returnOf === 's1' && r1.total < 0 && r1.paid < 0 && r1.items.every((i) => i.qty < 0) && r1.items[0].pack.count === -2);
  check('return: the client owes less by the debt cancelled', clientOwes(r1) === -500, clientOwes(r1));
  check('return: stock parts are negative (moves put them back)', stockParts(r1.items[0]).every((a) => a.qty < 0));
  const left = returnable(split, [r1]);
  check('returnable: what is left', left.length === 2 && left[0].left === 10 && left[1].left === 2);
  const p2 = planReturn(split, [r1], [{ line: 0, qty: 10 }, { line: 1, qty: 2 }]);
  const r2 = { id: 'x2', number: 'CN2', date: '2026-11-26T11:00:00.000Z', cashier: 'Ann', branchId: 'main', ...returnRecord(split, p2) };
  check('return: the rest brings the sale back to exactly zero', p2.full && r1.total + r2.total === -3000 && r1.paid + r2.paid === -2500 && cashOf(r1) + cashOf(r2) === -2000 && clientOwes(r1) + clientOwes(r2) === -500,
    `${r1.total + r2.total} ${r1.paid + r2.paid} ${cashOf(r1) + cashOf(r2)}`);
  check('return: stock back, each batch no more than it gave', JSON.stringify(r2.items[0].alloc) === JSON.stringify([{ batchId: 'b1', qty: -10 }]));
  check('fully returned', fullyReturned(split, [r1, r2]) && !fullyReturned(split, [r1]));
  check('return check: a fair return has no finding', returnFindings(r2, split, [r1]).length === 0, JSON.stringify(returnFindings(r2, split, [r1])));
  const over = { ...r2, id: 'x3', items: [{ ...r2.items[1], qty: -3 }] };
  check('return check: more than sold is flagged', returnFindings(over, split, [r1, r2]).some((f) => /returned of R1/.test(f.detail)));
  check('return check: a changed price is flagged', returnFindings({ ...r2, items: [{ ...r2.items[1], price: 999 }] }, split, [r1]).some((f) => /sold at/.test(f.detail)));
  check('return check: no sale', returnFindings(r1, null, []).length === 1);

  // the cloud
  const can = (perms) => async (p) => perms.includes(p);
  check('policy: a seller may not make a return', !(await decide({ t: 'sales', id: 'x1', rec: r1 }, null, 'cashier', can(['pos.sell']))).ok);
  check('policy: "Refund sales" may', (await decide({ t: 'sales', id: 'x1', rec: r1 }, null, 'manager', can(['sales.refund']))).ok);
  check('policy: a split sale\'s parts are in its money view', moneyView(split) !== moneyView({ ...split, payments: [{ ...split.payments[0], amount: 2500 }, split.payments[1]] }));
  check('policy: a one-method sale\'s view is as before', moneyView({ total: 5, payment: 'Cash' }) === JSON.stringify([0, 0, 0, 5, 0, 'Cash', '', '', '', []]));
  check('sale check: a return is checked as a return', (await saleFindings(over, new Map(), async () => true, { returned: { sale: split, others: [r1, r2] } })).some((f) => f.kind === 'return'));
  check('sale check: a fair split sale has no finding', (await saleFindings(split, new Map(), async () => true, {})).length === 0, JSON.stringify(await saleFindings(split, new Map(), async () => true, {})));
  check('sale check: parts that don\'t add up are flagged', (await saleFindings({ ...split, payments: [{ ...split.payments[0], amount: 100 }] }, new Map(), async () => true, {})).some((f) => f.kind === 'paid'));
  check('stock check: a return\'s Refund moves match it', stockFindings('CN1', [{ type: 'Refund', productId: 'p1', qty: 20 }, { type: 'Refund', productId: 'p2', qty: 1 }], r1).length === 0);
  check('stock check: more put back than returned is flagged', stockFindings('CN1', [{ type: 'Refund', productId: 'p2', qty: 3 }], r1).length === 1);

  // reports, the day, the drawer
  const f = summarise({ sales: [split, r1], refunds: [], expenses: [] });
  check('report: a return is a refund, not a sale', f.count === 1 && f.refunds === 1 && f.refundValue === -r1.total && f.total === 3000 + r1.total, JSON.stringify({ c: f.count, r: f.refunds, v: f.refundValue, t: f.total }));
  check('report: paid by, net of the return', f.byPay.find(([k]) => k === 'Cash')[1] === 2000 + r1.payments.find((p) => p.method === 'Cash').amount);
  const insured = { id: 'i1', number: 'R9', items: [{ id: 'p2', name: 'Para', price: 100, qty: 10, alloc: [] }], subtotal: 1000, discount: 0, tax: 0, total: 1000, paid: 200, payment: 'Cash', insurance: { insurerId: 'ins', share: 800 } };
  const ip = planReturn(insured, [], [{ line: 0, qty: 5 }]);
  const ir = returnRecord(insured, ip);
  check('return of an insured sale: half off the insurer, half of the co-pay back', ip.insurer === 400 && ip.back === 100 && insurerShare(ir) === -400 && clientOwes(ir) === 0, JSON.stringify(ip));
  const db = {
    sales: [split, r1, { id: 's2', number: 'R2', date: '2026-11-26T09:00:00.000Z', cashier: 'Ann', branchId: 'main', payment: 'Cash', total: 700, paid: 700, status: 'refunded', refundedBy: 'Ann', refundedAt: '2026-11-26T09:30:00.000Z', items: [] }],
    payments: [{ kind: 'customer', amount: 300, bankId: CASH, by: 'Ann', date: '2026-11-26' }, { kind: 'supplier', amount: 100, bankId: CASH, by: 'Ann', date: '2026-11-26' }, { kind: 'customer', amount: 999, bankId: 'bank', by: 'Ann', date: '2026-11-26' }],
    expenses: [{ amount: 50, bankId: CASH, recordedBy: 'Ann', date: '2026-11-26' }],
    cashMoves: [{ id: 'm1', shiftId: 'sh1', kind: 'in', amount: 1000, date: '2026-11-26T08:30:00.000Z', user: 'Ann', branchId: 'main' }, { id: 'm2', shiftId: 'sh1', kind: 'out', amount: 400, date: '2026-11-26T09:00:00.000Z', user: 'Ann', branchId: 'main' }],
  };
  const c = shiftCash(db, { id: 'sh1', user: 'Ann', branchId: 'main', openedAt: '2026-11-26T07:00:00.000Z', float: 5000 }, '2026-11-26T12:00:00.000Z', dayOf);
  const rCash = -cashOf(r1);
  check('drawer: float + cash sales − refunds − returns + debts + in − out − spent', c.expected === 5000 + 2700 - 700 - rCash + 300 + 1000 - 400 - 150,
    JSON.stringify(c));
  check('drawer: a sale refunded in the same shift is not taken off twice', c.sales === 2700 && c.refunds === 700);
  const d = dayCash(db, 'main', '2026-11-26', dayOf);
  check('day close: the day\'s cash in and out', d.net === c.expected - 5000, JSON.stringify(d));
  const snap = daySnapshot({ ...db }, 'main', '2026-11-26', dayOf);
  check('day close: returns counted apart, cash kept', snap.sales === 1 && snap.returns === 1 && snap.refunded === 1 && snap.cash.net === d.net && snap.byPayment.Card === 500 + r1.payments.find((p) => p.method === 'Card').amount, JSON.stringify(snap));
  const moves = sumEntries({ cashMoves: db.cashMoves });
  check('balances: pay-ins and pay-outs move Cash at hand', moves.account.get(CASH) === 600);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

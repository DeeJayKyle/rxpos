// Cloud reports count a refund on the day it happens, not on its sale's day (worker/summary.js, worker/reports.js,
// worker/dailystock.js), the way Finance and Shifts already do. Fictional pharmacy; Uganda is UTC+3.
import assert from 'node:assert/strict';
import { summarise, summaryText, refundedOn } from '../worker/summary.js';
import { reportSheets } from '../worker/reports.js';
import { dailyStock } from '../worker/dailystock.js';
let passed = 0;
const ok = (name, fn) => { fn(); passed++; console.log('PASS ', name); };
const money = (v) => `UGX ${Math.round(v).toLocaleString('en-US')}`;

// Monday: two sales. Wednesday: the first is refunded.
const item = (qty, price, cost) => ({ name: 'Amoxicillin 500mg', qty, price, cost });
const s1 = { id: 's1', number: 'R1', date: '2026-11-02T08:00:00.000Z', total: 3000, tax: 0, payment: 'Cash', items: [item(10, 300, 100)],
  status: 'refunded', refundedAt: '2026-11-04T09:00:00.000Z', refundedBy: 'Ann Admin' };
const s2 = { id: 's2', number: 'R2', date: '2026-11-02T09:00:00.000Z', total: 1000, tax: 0, payment: 'Mobile Money', items: [item(2, 500, 100)] };

ok('the sale\'s day keeps the sale, even though it was refunded later', () => {
  const f = summarise({ sales: [s1, s2], refunds: [], expenses: [] });
  assert.equal(f.count, 2); assert.equal(f.gross, 4000); assert.equal(f.total, 4000); assert.equal(f.refunds, 0);
  assert.equal(f.profit, 4000 - 1000 - 200);
});
ok('the refund\'s day takes the money, the profit and the medicine back', () => {
  const f = summarise({ sales: [], refunds: [s1], expenses: [{ amount: 500 }] });
  assert.equal(f.count, 0); assert.equal(f.refunds, 1); assert.equal(f.refundValue, 3000); assert.equal(f.total, -3000);
  assert.equal(f.profit, -2000); assert.equal(f.net, -2500);
  assert.deepEqual(f.byPay, [['Cash', -3000]]);
  assert.deepEqual(f.top, []); // nothing sold that day
});
ok('over both days the figures are those of the sale that stayed', () => {
  const f = summarise({ sales: [s1, s2], refunds: [s1], expenses: [] });
  assert.equal(f.total, 1000); assert.equal(f.profit, 800); assert.deepEqual(f.byPay, [['Mobile Money', 1000]]);
  assert.equal(f.credit, 0);
});
ok('a refund kept before refundedAt existed falls on its sale\'s day', () => {
  assert.equal(refundedOn({ date: '2026-11-02T08:00:00.000Z' }), '2026-11-02T08:00:00.000Z');
  assert.equal(refundedOn(s1), '2026-11-04T09:00:00.000Z');
});
ok('the email shows sales made, refunds made and sales after refunds', () => {
  const t = summaryText('Sample Pharmacy', '2026-11-04', summarise({ sales: [s2], refunds: [s1], expenses: [] }), money);
  assert.match(t, /Sales: UGX 1,000 \(1 sale\)/); assert.match(t, /Refunds made today: 1 \(UGX 3,000\)/); assert.match(t, /Sales after refunds: UGX -2,000/);
});
ok('the workbook: a Refunds sheet dated by the refund, by medicine net of refunds', () => {
  const { sheets, figures } = reportSheets({ sales: [s2], refunds: [s1], expenses: [], label: '2026-11-04' });
  const by = Object.fromEntries(sheets.map((s) => [s.name, s.rows]));
  assert.deepEqual(by.Refunds, [{ refundedOn: '2026-11-04 12:00', number: 'R1', soldOn: '2026-11-02 11:00', customer: '', refundedBy: 'Ann Admin', branch: 'Main branch', payment: 'Cash', total: 3000 }]);
  assert.deepEqual(by['Sales by medicine'], [{ medicine: 'Amoxicillin 500mg', quantity: -8, sales: -2000, cost: -800, profit: -1200 }]);
  assert.equal(figures.total, -2000);
  assert.equal(by.Summary.find((r) => r.figure === 'Sales after refunds').value, -2000);
});
ok('the daily stock sheet: the sale on its day, the refund on its day, matching the Refund movement', () => {
  const mv = (date, qty, type) => ({ date, productId: 'p1', batchId: 'b1', qty, type });
  const rows = dailyStock({ movements: [mv('2026-11-01T08:00:00Z', 100, 'Opening stock'), mv(s1.date, -10, 'Sale'), mv(s2.date, -2, 'Sale'), mv(s1.refundedAt, 10, 'Refund')],
    batches: [{ id: 'b1', productId: 'p1', cost: 100, expiry: '2099-01-01' }], products: [{ id: 'p1', cost: 100 }], sales: [s1, s2], expenses: [], from: '2026-11-02', to: '2026-11-04' });
  const by = Object.fromEntries(rows.map((r) => [r.date, r]));
  assert.equal(by['2026-11-02'].sales, 4000); assert.equal(by['2026-11-02'].count, 2); assert.equal(by['2026-11-02'].profit, 4000 - 1200);
  assert.equal(by['2026-11-04'].sales, -3000); assert.equal(by['2026-11-04'].cost, -1000); assert.equal(by['2026-11-04'].profit, -2000);
});
console.log(`\n${passed} passed, 0 failed`);

// Daily stock sheet figures (worker/dailystock.js), fictional pharmacy: each day reconciles (Opening + Purchases −
// Cost of stock sold − Other = Closing), Uganda days, expired stock left out like the app's Inventory value, a sale
// sent late lands on its own day, refunded sales don't count, labels match the pharmacy's sheet ("Thur 22nd Oct").
import assert from 'node:assert/strict';
import { dailyStock, dayLabel, localDay, toCsv } from '../worker/dailystock.js';
let passed = 0;
const ok = (name, fn) => { fn(); passed++; console.log('PASS ', name); };

const products = [{ id: 'p1', cost: 100 }, { id: 'p2', cost: 50 }];
const batches = [{ id: 'b1', productId: 'p1', cost: 100, expiry: '2027-01-01' }, { id: 'b2', productId: 'p2', cost: 0, expiry: '2026-10-24' }];
// times in UTC; Uganda is UTC+3, so 22:30 UTC on the 23rd is already the 24th in Kampala
const mv = (date, productId, batchId, qty, type) => ({ date, productId, batchId, qty, type });
const movements = [
  mv('2026-10-21T08:00:00Z', 'p1', 'b1', 100, 'Opening stock'),
  mv('2026-10-21T08:00:00Z', 'p2', 'b2', 20, 'Opening stock'),
  mv('2026-10-22T09:00:00Z', 'p1', 'b1', -3, 'Sale'),
  mv('2026-10-23T10:00:00Z', 'p1', 'b1', 10, 'Purchase'),
  mv('2026-10-23T22:30:00Z', 'p1', 'b1', -2, 'Sale'), // the 24th in Kampala
  mv('2026-10-24T09:00:00Z', 'p2', 'b2', -5, 'Sale'),
  mv('2026-10-25T09:00:00Z', 'p1', 'b1', -1, 'Adjustment'),
  mv('2026-10-25T10:00:00Z', 'p1', 'b1', 1, 'Refund'),
];
const sales = [
  { date: '2026-10-22T09:00:00Z', total: 600, status: 'completed' },
  { date: '2026-10-23T22:30:00Z', total: 400, status: 'completed' },
  { date: '2026-10-24T09:00:00Z', total: 500, status: 'completed' },
  { date: '2026-10-24T12:00:00Z', total: 999, status: 'refunded' },
];
const expenses = [{ date: '2026-10-24', amount: 20000 }];
const rows = dailyStock({ movements, batches, products, sales, expenses, from: '2026-10-22', to: '2026-10-25' });
const by = Object.fromEntries(rows.map((r) => [r.date, r]));

ok('Uganda days: 22:30 UTC on the 23rd is the 24th', () => assert.equal(localDay('2026-10-23T22:30:00Z'), '2026-10-24'));
ok('labels match the sheet', () => { assert.equal(dayLabel('2026-10-22'), 'Thur 22nd Oct'); assert.equal(dayLabel('2026-10-23'), 'Fri 23rd Oct'); assert.equal(dayLabel('2026-10-21'), 'Wed 21st Oct'); assert.equal(dayLabel('2026-10-11'), 'Sun 11th Oct'); });
ok('opening of the first day = stock before it', () => assert.equal(by['2026-10-22'].opening, 100 * 100 + 20 * 50));
ok('a sale costs its batch value', () => { assert.equal(by['2026-10-22'].cost, 300); assert.equal(by['2026-10-22'].profit, 300); });
ok('purchases at cost', () => assert.equal(by['2026-10-23'].purchases, 1000));
ok('a sale after 21:00 UTC is on the next Kampala day', () => { assert.equal(by['2026-10-23'].sales, 0); assert.equal(by['2026-10-24'].sales, 900); });
ok('refunded sales are not counted', () => assert.equal(by['2026-10-24'].count, 2));
ok('a batch with no cost uses the medicine\'s cost', () => assert.equal(by['2026-10-24'].cost, 2 * 100 + 5 * 50));
ok('expired stock leaves the value (as Inventory value shows it) under Other', () => {
  // b2 expires on the 24th: still counted on the 24th, gone on the 25th
  assert.equal(by['2026-10-24'].closing, (100 - 3 + 10 - 2) * 100 + (20 - 5) * 50);
  assert.equal(by['2026-10-25'].closing, (105 - 1 + 1) * 100);
  assert.equal(by['2026-10-25'].other, 15 * 50 + 100);
});
ok('every day reconciles and links to the next', () => rows.forEach((r, i) => {
  assert.equal(r.opening + r.purchases - r.cost - r.other, r.closing);
  if (i) assert.equal(r.opening, rows[i - 1].closing);
}));
ok('expenses by day', () => assert.equal(by['2026-10-24'].expenses, 20000));
ok('a refund puts stock back and lowers the day\'s cost', () => assert.equal(by['2026-10-25'].cost, -100));
ok('csv for IMPORTDATA', () => { const c = toCsv(rows).split('\n'); assert.match(c[0], /^Date,Day,Sales,Opening stock value,/); assert.equal(c[1].split(',')[1], 'Thur 22nd Oct'); });
ok('an untouched catalog medicine is valued like the app does it', () => {
  const r = dailyStock({ movements: [mv('2026-10-21T08:00:00Z', 'cat-1', null, 10, 'Opening stock')], batches: [], products: [], sales: [], expenses: [], from: '2026-10-22', to: '2026-10-22' });
  assert.ok(r[0].closing > 0);
});
console.log(`\n${passed} passed, 0 failed`);

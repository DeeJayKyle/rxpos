// What Add Stock shows before a delivery is received (src/deliverychecks.js): the summary and the things worth a
// second look. The same cases are in rxpos_flutter/test/features/delivery_checks_test.dart. Fictional data.
import assert from 'node:assert/strict';
import { deliveryReview, invoiceKey, sameInvoice, mostReceived } from '../src/deliverychecks.js';
let passed = 0;
const ok = (name, fn) => { fn(); passed++; console.log('PASS ', name); };
const show = { money: (n) => 'UGX ' + Math.round(n).toLocaleString('en-US'), date: (d) => d };
const products = new Map([['pcm', { cost: 50, price: 100 }], ['amx', { cost: 300, price: 500 }]]);
const purchases = [
  { id: 'g1', number: 'GRN-7', supplierId: 's1', invoice: 'INV-0042', date: '2026-11-10', items: [{ productId: 'pcm', qty: 100 }, { productId: 'amx', qty: 30 }] },
  { id: 'g2', number: 'GRN-8', supplierId: 's2', invoice: '0042', date: '2026-11-12', items: [{ productId: 'pcm', qty: 200 }] },
];
const base = { products, purchases, supplierId: 's1', supplierName: 'Lakeview Medical', invoice: '5667', date: '2026-11-22', today: '2026-11-22', scanned: false,
  lines: [{ productId: 'pcm', name: 'Paracetamol 500mg', qty: 100, cost: 55, price: 100, expiry: '2028-06-30' }], total: 5500, invoiceTotal: '' };

ok('invoice numbers compared without case, spaces or punctuation', () => {
  assert.equal(invoiceKey(' inv 0042 '), invoiceKey('INV-0042'));
  assert.equal(sameInvoice(purchases, 's1', 'inv0042').id, 'g1');
  assert.equal(sameInvoice(purchases, 's1', '0042'), null, 'another supplier\'s 0042');
  assert.equal(sameInvoice(purchases, 's1', ''), null);
  assert.equal(mostReceived(purchases, 'pcm'), 200);
});
ok('a delivery with nothing unusual: the summary only', () => {
  const r = deliveryReview(base, show);
  assert.deepEqual(r.warnings, []);
  assert.deepEqual(r.summary, ['Lakeview Medical · invoice 5667 · dated 2026-11-22', '1 line, 100 units, total UGX 5,500']);
});
ok('each warning', () => {
  const r = deliveryReview({ ...base, date: '2026-11-12', dateRead: true, invoice: 'inv 0042', invoiceTotal: '6000', lines: [
    { productId: 'pcm', name: 'Paracetamol 500mg', qty: 1000, cost: 500, price: 400, expiry: '2027-02-01' },
    { productId: 'amx', name: 'Amoxicillin 500mg', qty: 10, cost: 100, price: 500, expiry: '2028-01-01' },
    { productId: null, name: 'Newmed Syrup', qty: 5, cost: 1000, price: 1500, expiry: '2028-01-01' },
  ], total: 5500 }, show);
  assert.deepEqual(r.warnings, [
    'Dated 2026-11-12, 10 days ago (the date read from the invoice): Purchase history and reports will list it on that day, not today.',
    'Invoice inv 0042 from Lakeview Medical was already received on 2026-11-10 (GRN-7). Receiving it again adds the stock twice.',
    'The invoice total is UGX 6,000 but the lines add up to UGX 5,500, UGX 500 short: a line may be missing or a figure mistyped.',
    'Paracetamol 500mg: cost UGX 500 a unit, last time UGX 50 (10.0 times more). Is it the price of a whole pack, or the quantity in packs?',
    'Paracetamol 500mg: 1000 units, 5 times the most received before (200). Is the quantity right?',
    'Paracetamol 500mg: expires on 2027-02-01, in 71 days: short-dated.',
    'Paracetamol 500mg: the retail price UGX 400 is below the cost UGX 500.',
    'Amoxicillin 500mg: cost UGX 100 a unit, last time UGX 300 (3.0 times less). Is it the price of a whole pack, or the quantity in packs?',
  ]);
  assert.deepEqual(r.summary.slice(2), ['1 new medicine · 1 retail price changed']);
});
ok('limits: just inside them is not asked about', () => {
  const r = deliveryReview({ ...base, date: '2026-11-19', invoiceTotal: '5500.4', lines: [
    { productId: 'pcm', name: 'P', qty: 999, cost: 99, price: 100, expiry: '2027-05-21' }, // cost 1.98×, qty < 5×200, 180 days
    { productId: 'amx', name: 'A', qty: 19, cost: 151, price: 500, expiry: '' }, // 19 units: too few to ask about
  ] }, show);
  assert.deepEqual(r.warnings, []);
});
console.log(`\n${passed} passed, 0 failed`);

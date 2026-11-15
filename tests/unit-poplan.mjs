// Purchase order planning (src/poPlan.js): quantities, pack rounding, wording, grouping by the chosen supplier
import assert from 'node:assert/strict';
import { validQty, roundToPack, supplierRule, planOrders, nextStatus } from '../src/poPlan.js';
let passed = 0;
const ok = (n, fn) => { fn(); passed++; console.log('PASS ', n); };

ok('typed quantities must be whole numbers of at least 1', () => {
  assert.equal(validQty('12'), 12); assert.equal(validQty(' 3 '), 3);
  for (const v of ['0', '-2', '1.5', 'abc', '', null, '99999999']) assert.equal(validQty(v), null, String(v));
});
ok('rounding to packs goes up to whole packs, only for packs of 2 or more', () => {
  assert.equal(roundToPack(25, 10), 30); assert.equal(roundToPack(30, 10), 30); assert.equal(roundToPack(7, 1), 7); assert.equal(roundToPack(7, undefined), 7);
});
ok('the confirmation names the rule actually used', () => {
  assert.match(supplierRule('cheapest', 0), /cheapest/); assert.doesNotMatch(supplierRule('cheapest', 0), /last bought/);
  assert.match(supplierRule('last', 0), /last bought/);
  assert.match(supplierRule('cheapest', 2), /2 you chose by hand/);
});
ok('orders are grouped by the supplier chosen for each line, with estimated totals', () => {
  const sup = [{ id: 's1', name: 'Alpha Supplies' }, { id: 's2', name: 'Beta Pharma' }];
  const plan = planOrders([
    { p: { id: 'a', name: 'Amoxicillin 500mg', cost: 100 }, qty: 10, buy: { supplierId: 's1', cost: 90 } },
    { p: { id: 'b', name: 'Paracetamol 500mg', cost: 20 }, qty: 50, buy: { supplierId: 's2', cost: 18 } },
    { p: { id: 'c', name: 'ORS sachet', cost: 0 }, qty: 5, buy: { supplierId: 's1' } },
    { p: { id: 'd', name: 'Zinc 20mg', cost: 30 }, qty: 4 },
  ], sup);
  assert.equal(plan.length, 3);
  const a = plan.find((o) => o.supplierId === 's1');
  assert.equal(a.supplierName, 'Alpha Supplies'); assert.equal(a.lines.length, 2); assert.equal(a.total, 900); assert.equal(a.unpriced, 1);
  assert.equal(plan.find((o) => o.supplierId === 's2').total, 900);
  const none = plan.find((o) => o.supplierId === '');
  assert.equal(none.supplierName, 'No supplier yet'); assert.equal(none.total, 120);
});
ok('only a Draft can be marked as sent by hand', () => {
  assert.equal(nextStatus('Draft'), 'Sent'); assert.equal(nextStatus('Sent'), null); assert.equal(nextStatus('Received'), null);
});
console.log(`\n${passed} passed, 0 failed`);

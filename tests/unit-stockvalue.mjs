// Inventory value (src/stockvalue.js): physical stock × the medicine's CURRENT cost, so editing a medicine's cost changes
// the value at once, whatever each batch was bought at. A batch's own cost is used only if the medicine has none, and
// expired stock is kept apart.
import assert from 'node:assert/strict';
import { batchValue, stockValue } from '../src/stockvalue.js';
let passed = 0;
const ok = (name, fn) => { fn(); passed++; console.log('PASS ', name); };

const future = '2099-01-01', past = '2000-01-01';
// two batches of the same medicine, bought at different prices (80 and 95)
const batches = { p1: [{ id: 'b1', qty: 10, cost: 80, expiry: future }, { id: 'b2', qty: 5, cost: 95, expiry: future }], p2: [{ id: 'b3', qty: 4, cost: 30, expiry: past }, { id: 'b4', qty: 0, cost: 30, expiry: future }] };
const batchesOf = (id) => batches[id] || [];

ok('stock is valued at the medicine\'s current cost, not each batch\'s purchase cost', () => assert.deepEqual(batchValue({ id: 'p1', cost: 100 }, batchesOf), { value: 15 * 100, expired: 0 }));
ok('changing the medicine\'s cost changes the value straight away', () => {
  const p = { id: 'p1', cost: 100 };
  const before = batchValue(p, batchesOf).value;
  const after = batchValue({ ...p, cost: 120 }, batchesOf).value;
  assert.equal(before, 1500); assert.equal(after, 15 * 120);
});
ok('a medicine with no cost falls back to each batch\'s own cost', () => assert.equal(batchValue({ id: 'p1', cost: 0 }, batchesOf).value, 10 * 80 + 5 * 95));
ok('expired stock is kept apart, at the current cost too', () => assert.deepEqual(batchValue({ id: 'p2', cost: 50 }, batchesOf), { value: 0, expired: 4 * 50 }));
ok('empty batches add nothing', () => assert.equal(batchValue({ id: 'p2', cost: 50 }, batchesOf).value, 0));
ok('a cost stored as text still counts', () => assert.equal(batchValue({ id: 'p1', cost: '100' }, batchesOf).value, 1500));
ok('the inventory total adds every medicine', () => assert.deepEqual(stockValue([{ id: 'p1', cost: 100 }, { id: 'p2', cost: 50 }], batchesOf), { value: 1500, expired: 200 }));
console.log(`\n${passed} passed, 0 failed`);

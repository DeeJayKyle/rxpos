// Stock repair plan (tools/stock-repair.mjs): a batch pushed below zero by an over-removal is brought back to zero from the
// same medicine's other batches (earliest expiry first); each medicine's total stock is unchanged; nothing else is touched.
import assert from 'node:assert/strict';
import { planRepairs } from '../tools/stock-repair.mjs';
let passed = 0;
const ok = (name, fn) => { fn(); passed++; console.log('PASS ', name); };
const products = [{ id: 'p1', name: 'Dynapar', cost: 98 }, { id: 'p2', name: 'Zinc', cost: 10 }];
const batches = [{ id: 'a', productId: 'p1', batch: 'A', expiry: '2027-01-01' }, { id: 'b', productId: 'p1', batch: 'B', expiry: '2027-06-01' }, { id: 'c', productId: 'p1', batch: 'C', expiry: '2027-03-01' }, { id: 'z', productId: 'p2', batch: 'Z', expiry: '2027-01-01' }];
const mv = (batchId, productId, qty, type) => ({ batchId, productId, qty, type, branchId: 'main', date: '2026-11-01T08:00:00Z' });
const movements = [mv('a', 'p1', 391, 'Opening stock'), mv('a', 'p1', -108, 'Sale'), mv('a', 'p1', -500, 'Adjustment'), mv('b', 'p1', 400, 'Opening stock'), mv('c', 'p1', 70, 'Opening stock'), mv('z', 'p2', 5, 'Opening stock')];
const plan = planRepairs({ products, batches, movements }, { now: '2026-11-01T18:00:00Z' });
const total = (pid, extra = []) => [...movements, ...extra].filter((m) => m.productId === pid).reduce((a, m) => a + m.qty, 0);
const lot = (id, extra) => [...movements, ...extra].filter((m) => m.batchId === id).reduce((a, m) => a + m.qty, 0);
ok('the negative batch is brought back to exactly zero', () => assert.equal(lot('a', plan.moves), 0));
ok('the shortfall comes from the other batches, earliest expiry first', () => { assert.equal(lot('c', plan.moves), 0); assert.equal(lot('b', plan.moves), 400 - 147); });
ok("the medicine's total stock is unchanged", () => assert.equal(total('p1', plan.moves), total('p1')));
ok('medicines without a negative batch are not touched', () => assert.ok(plan.moves.every((m) => m.productId === 'p1')));
ok('corrections are adjustments with a clear note and fixed ids (re-running cannot double them)', () => { assert.ok(plan.moves.every((m) => m.type === 'Adjustment' && /Correction \(stock audit\)/.test(m.note) && m.id.startsWith('audit-20261101-'))); assert.equal(new Set(plan.moves.map((m) => m.id)).size, plan.moves.length); });
ok('a second plan after applying has nothing to do', () => assert.equal(planRepairs({ products, batches, movements: [...movements, ...plan.moves] }).moves.length, 0));
ok('a receipt that arrived with no stock movement gets its stock-out recorded from its own batches', () => {
  const sales = [{ id: 's1', number: 'RHOO', date: '2026-11-01T09:00:00Z', status: 'completed', branchId: 'main', items: [{ id: 'p2', name: 'Zinc', qty: 2, alloc: [{ batchId: 'z', qty: 2 }] }] },
    { id: 's2', number: 'ROK', date: '2026-11-01T09:00:00Z', status: 'completed', items: [{ id: 'p2', qty: 1, alloc: [{ batchId: 'z', qty: 1 }] }] },
    { id: 'rx-s3', number: 'RX1', date: '2026-11-01T09:00:00Z', status: 'completed', items: [{ id: 'p2', qty: 1 }] }, // copied from Rxtera: never touched
    { id: 's4', number: 'ROLD', date: '2026-10-01T09:00:00Z', status: 'completed', items: [{ id: 'p2', qty: 1 }] }]; // before stock tracking
  const ms = [...movements, { batchId: 'z', productId: 'p2', qty: -1, type: 'Sale', ref: 'ROK', branchId: 'main', date: '2026-11-01T09:00:00Z' }];
  const p = planRepairs({ products, batches, movements: ms, sales });
  const fix = p.moves.filter((m) => m.ref === 'RHOO');
  assert.equal(p.receipts.length, 1);
  assert.deepEqual(fix.map((m) => [m.type, m.productId, m.batchId, m.qty]), [['Sale', 'p2', 'z', -2]]);
  assert.equal(planRepairs({ products, batches, movements: [...ms, ...p.moves], sales }).receipts.length, 0);
});
console.log(`\n${passed} passed, 0 failed`);

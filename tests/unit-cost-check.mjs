// Cost check (tools/cost-check.mjs, read-only): why each medicine's cost changed, on a small fictional pharmacy
import assert from 'node:assert/strict';
import { costHistory, packRatio } from '../tools/cost-check.mjs';
import { planCostRestore, restoredRecord } from '../tools/cost-restore.mjs';
let passed = 0;
const ok = (n, fn) => { fn(); passed++; console.log('PASS ', n); };
const amox = { id: 'a', name: 'Amoxil caps', cost: 50, packs: [{ name: 'Strip', size: 10 }], updatedAt: '2026-11-05T10:00:00Z' };
const para = { id: 'b', name: 'Panadol tabs', cost: 20, updatedAt: '2026-11-04T09:00:00Z' };
const cetz = { id: 'c', name: 'Cetrizine tabs', cost: 30, updatedAt: '2026-11-06T09:00:00Z' };
const sale = (at, id, cost, origin = 'till-1') => ({ date: at, origin, items: [{ id, qty: 1, cost }] });
const h = costHistory({
  products: [amox, para, cetz],
  sales: [sale('2026-11-01T10:00:00Z', 'a', 40), sale('2026-11-03T10:00:00Z', 'a', 400), sale('2026-11-06T10:00:00Z', 'a', 50),
    sale('2026-11-01T10:00:00Z', 'b', 18), sale('2026-11-05T10:00:00Z', 'b', 20),
    sale('2026-11-01T10:00:00Z', 'c', 25, 'till-1'), sale('2026-11-02T10:00:00Z', 'c', 30, 'till-1'), sale('2026-11-02T11:00:00Z', 'c', 25, 'till-2')],
  purchases: [{ date: '2026-11-02', createdAt: '2026-11-02T09:00:00Z', number: 'GRN-1', items: [{ productId: 'a', cost: 400 }] },
    { date: '2026-11-05', createdAt: '2026-11-05T09:00:00Z', number: 'GRN-2', items: [{ productId: 'a', cost: 50, pack: { name: 'Strip', size: 10, count: 2, cost: 500 } }] }],
  audit: [{ date: '2026-11-04T09:00:00Z', action: 'Cost changed (quick edit)', user: 'Admin', details: '1 medicine: Panadol tabs: cost 18 → 20' }],
});
const of = (name) => h.changes.filter((c) => c.product === name);
ok('a delivery that set the cost is named, with its cost per unit and pack', () => {
  const [late, early] = of('Amoxil caps');
  assert.equal(early.cause, 'delivery received'); assert.match(early.detail, /GRN-1 at 400 per unit/);
  assert.match(late.detail, /GRN-2 at 50 per unit \(received as 2 Strip of 10 at 500\)/);
});
ok('a cost ten times the last (a strip taken as one capsule) is flagged', () => { assert.equal(of('Amoxil caps').find((c) => c.to === 400).packRatio, 10); assert.equal(packRatio(400, 40, [10]), -10); assert.equal(packRatio(40, 45, [10]), 0); });
ok('an edit in the audit log is named', () => assert.equal(of('Panadol tabs')[0].cause, 'edited (audit log)'));
ok('a till still holding the old copy is told apart', () => assert.equal(of('Cetrizine tabs').find((c) => c.to === 25).cause, 'two tills, one with an older copy'));
ok('today\'s cost against the last delivery: equal is not listed', () => assert.equal(h.now.length, 0));
// putting back what one save changed (tools/cost-restore.mjs): the cost just before it, from a sale or a delivery
const at = '2026-11-26T16:01:58';
const saved = (id, name, cost, extra = {}) => ({ id, name, cost, updatedAt: at + '.300Z', ...extra });
const plan = planCostRestore({
  products: [saved('x', 'Aciclovir', 68), saved('y', 'Cannula', 500), saved('z', 'Coartem', 120, { updatedAt: '2026-11-27T08:00:00Z', _f: { cost: '2026-11-27T08:00:00Z' } }), saved('w', 'Diclo', 20, { updatedAt: '2026-11-27T09:00:00Z', _f: { cost: at + '.301Z', price: '2026-11-20T00:00:00Z' } }), saved('v', 'Same', 65)],
  sales: [sale('2026-11-25T10:00:00Z', 'x', 85), sale('2026-11-20T10:00:00Z', 'y', 380), sale('2026-11-25T10:00:00Z', 'z', 100), sale('2026-11-26T10:00:00Z', 'w', 15), sale('2026-11-26T10:00:00Z', 'v', 65), sale('2026-11-26T17:00:00Z', 'x', 68)],
  purchases: [{ createdAt: '2026-11-21T09:00:00Z', number: 'GRN-9', items: [{ productId: 'y', cost: 400 }] }],
}, at);
ok('a restore puts back the cost from just before the save (the later of the last sale and the last delivery)', () => {
  assert.deepEqual(plan.map((x) => [x.name, x.now, x.was]), [['Aciclovir', 68, 85], ['Cannula', 500, 400], ['Diclo', 20, 15]]);
  assert.match(plan[1].from, /GRN-9/);
});
ok('a cost set again since the save, or unchanged by it, is left alone', () => assert.ok(!plan.some((x) => x.name === 'Coartem' || x.name === 'Same')));
ok('the restored record\'s cost is new everywhere; its other fields keep their times', () => {
  const r = restoredRecord({ id: 'w', cost: 20, updatedAt: 'x', _f: { cost: 'a', price: 'b' } }, 15);
  assert.deepEqual(r, { id: 'w', cost: 15, _f: { price: 'b' } });
});
console.log(`\n${passed} passed, 0 failed`);

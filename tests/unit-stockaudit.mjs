// Stock audit (tools/stock-audit.mjs) finds each way stock goes missing, on a small fictional pharmacy.
import assert from 'node:assert/strict';
import { auditTenant } from '../tools/stock-audit.mjs';
let passed = 0;
const ok = (name, fn) => { fn(); passed++; console.log('PASS ', name); };

const products = [{ id: 'p1', name: 'Amox', cost: 100 }, { id: 'p2', name: 'Zinc', cost: 10 }];
const batches = [{ id: 'b1', productId: 'p1', expiry: '2099-01-01' }, { id: 'b2', productId: 'p2', expiry: '2099-01-01' }];
let seq = 0;
const mv = (o) => ({ branchId: 'main', origin: 'devA', seq: ++seq, ...o });
const movements = [
  mv({ productId: 'p1', batchId: 'b1', qty: 100, type: 'Purchase', ref: 'INV1', date: '2026-10-01T08:00:00Z' }),
  mv({ productId: 'p2', batchId: 'b2', qty: 50, type: 'Purchase', ref: 'INV1', date: '2026-10-01T08:00:00Z' }),
  mv({ productId: 'p1', batchId: 'b1', qty: -5, type: 'Sale', ref: 'R1', date: '2026-10-02T09:00:00Z' }), // R1 sold 5 → fine
  // R2 sold 3 but no stock movement at all → stock not taken out
  mv({ productId: 'p1', batchId: 'b1', qty: -2, type: 'Sale', ref: 'R9', date: '2026-10-02T11:00:00Z' }), // a receipt that doesn't exist
  // device B's sale (dated 10:00) reaches the cloud AFTER device A's count (dated 12:00) → the count applied it twice
  mv({ productId: 'p2', batchId: 'b2', qty: -4, type: 'Stock count', note: 'count', date: '2026-10-03T12:00:00Z' }),
  mv({ productId: 'p2', batchId: 'b2', qty: -4, type: 'Sale', ref: 'R3', date: '2026-10-03T10:00:00Z', origin: 'devB' }),
  mv({ productId: 'p2', batchId: 'b2', qty: -60, type: 'Adjustment', note: 'x', date: '2026-10-04T08:00:00Z' }), // drives b2 negative
  mv({ productId: 'p1', batchId: 'gone1', qty: 7, type: 'Purchase', ref: 'INV2', date: '2026-10-04T08:00:00Z' }), // batch deleted later
  mv({ productId: 'p1', batchId: 'b1', qty: 1, type: 'Inventory edit', note: 'fix', date: '2026-10-05T08:00:00Z' }),
  mv({ productId: 'p1', batchId: 'b1', qty: 1, type: 'Inventory edit', note: 'fix', date: '2026-10-05T08:00:30Z' }), // duplicate
];
const sales = [
  { number: 'R1', date: '2026-10-02T09:00:00Z', status: 'completed', items: [{ id: 'p1', qty: 5, cost: 100 }] },
  { number: 'R2', date: '2026-10-02T10:00:00Z', status: 'completed', items: [{ id: 'p1', qty: 3, cost: 90 }] },
  { number: 'R3', date: '2026-10-03T10:00:00Z', status: 'completed', items: [{ id: 'p2', qty: 4, cost: 10 }] },
];
const purchases = [{ number: 'GRN1', invoice: 'INV1', date: '2026-10-01', items: [{ productId: 'p1', qty: 100 }, { productId: 'p2', qty: 50 }] },
  { number: 'GRN3', invoice: 'INV3', date: '2026-10-04', items: [{ productId: 'p2', qty: 20 }] }]; // never added to stock
const a = auditTenant({ products, batches, movements, sales, purchases, dead: { batches: ['gone1'] }, today: '2026-10-06', days: 6 });

ok('a receipt whose stock was never taken out is found', () => { assert.equal(a.sales.missing.n, 1); assert.equal(a.sales.missing.units, 3); assert.equal(a.sales.top[0].receipt, 'R2'); });
ok('stock taken out for a receipt that does not exist is found', () => { assert.equal(a.sales.orphan.n, 1); assert.equal(a.sales.orphan.units, 2); });
ok('a count made on a device missing an earlier sale is found (sale applied twice)', () => { assert.equal(a.stale.affected, 1); assert.equal(a.stale.units, -4); assert.equal(a.stale.value, -40); });
ok('a negative batch is reported, not silently dropped', () => { assert.equal(a.stock.negative.lots, 1); assert.equal(a.stock.negative.units, -18); });
ok('stock on a deleted batch is reported', () => { assert.equal(a.stock.goneBatch.units, 7); assert.equal(a.stock.goneBatch.value, 700); });
ok('a duplicated change is found', () => { assert.equal(a.duplicates.n, 1); assert.equal(a.duplicates.units, 1); });
ok('a purchase line never added to stock is found', () => { assert.equal(a.purchases.missing.n, 1); assert.equal(a.purchases.missing.units, 20); });
ok('every day balances: opening + changes − closing is fully explained', () => {
  for (const r of a.daily) assert.equal(r.opening + r.purchases - r.saleMoves + r.counts + r.writeOff + r.transfers + r.openingStock - r.expiredOrHidden, r.closing);
});
ok('the day the batch went negative shows the hidden stock under expired/hidden', () => assert.ok(a.daily.find((r) => r.day === '2026-10-04').expiredOrHidden !== 0));
ok('receipt cost vs today\'s cost is reported', () => { assert.equal(a.sales.costVsNow.recorded, 5 * 100 + 3 * 90 + 4 * 10); assert.equal(a.sales.costVsNow.atNow, 5 * 100 + 3 * 100 + 4 * 10); });
console.log(`\n${passed} passed, 0 failed`);

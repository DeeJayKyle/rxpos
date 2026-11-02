// Reading an invoice page (worker/invoiceread.js), fictional lines: numbers as written on invoices, two readings
// cross-checked (agreement = confident, disagreement = flagged with the other value), qty × cost = line total.
import assert from 'node:assert/strict';
import { num, clean, reconcile, arithmetic, finish } from '../worker/invoiceread.js';
let passed = 0;
const ok = (name, fn) => { fn(); passed++; console.log('PASS ', name); };
const line = (o) => ({ name: 'Amoxicillin 500mg Capsules 10x10', batch: 'AMX2405', expiry: '2028-06-30', qty: 10, unitCost: 18500, lineTotal: 185000, unclear: false, note: '', ...o });

ok('numbers as written: 18,500 / 18.500 / UGX 1,200,000 / 2.5', () => { assert.equal(num('18,500'), 18500); assert.equal(num('18.500'), 18500); assert.equal(num('UGX 1,200,000'), 1200000); assert.equal(num('2.5'), 2.5); assert.equal(num(''), 0); });
ok('clean keeps only lines with a name and tidies text', () => { const c = clean({ supplier: ' Lakeview  Ltd ', items: [{ name: '' }, { name: 'ORS', qty: '50', unitCost: '450' }] }); assert.equal(c.supplier, 'Lakeview Ltd'); assert.equal(c.items.length, 1); assert.equal(c.items[0].qty, 50); });
ok('two readings that agree: nothing to check', () => { const r = finish({ items: [line()] }, { items: [line()] }); assert.deepEqual(r.items[0].check, []); assert.equal(r.items[0].unclear, false); assert.equal(r.items[0].readings, 2); });
ok('readings disagree on quantity: flagged, the other value kept', () => {
  const r = reconcile({ items: [line({ qty: 30, lineTotal: 555000 })] }, { items: [line({ qty: 24, lineTotal: 444000 })] });
  assert.ok(r.items[0].check.includes('qty')); assert.equal(r.items[0].alt.qty, 24);
});
ok('batch read differently (0 vs O): flagged', () => { const r = reconcile({ items: [line({ batch: 'MTZ0931' })] }, { items: [line({ batch: 'MTZO931' })] }); assert.deepEqual(r.items[0].check, ['batch']); });
ok('a line only one reading saw is flagged', () => { const r = finish({ items: [line(), line({ name: 'ORS Sachets 20.5g', qty: 50, unitCost: 450, lineTotal: 22500 })] }, { items: [line()] }); assert.ok(r.items[1].check.includes('name')); assert.equal(r.items[1].readings, 1); });
ok('qty × cost ≠ line total: flagged', () => { const [l] = arithmetic([line({ qty: 7 })]); assert.ok(l.check.includes('qty') && l.unclear); });
ok('missing unit cost worked out from qty and line total', () => { const [l] = arithmetic([line({ unitCost: 0 })]); assert.equal(l.unitCost, 18500); assert.deepEqual(l.check, []); });
ok('missing quantity worked out from cost and total', () => { const [l] = arithmetic([line({ qty: 0 })]); assert.equal(l.qty, 10); });
ok('a value one reading left empty comes from the other', () => { const r = reconcile({ items: [line({ expiry: '' })] }, { items: [line()] }); assert.equal(r.items[0].expiry, '2028-06-30'); });
ok('the lines add up to the invoice total (or not)', () => { assert.equal(finish({ total: 185000, items: [line()] }, null).totalMatches, true); assert.equal(finish({ total: 999999, items: [line()] }, null).totalMatches, false); });
ok('one reading only: what the model flagged is checked', () => { const r = finish({ items: [line({ unclear: true })] }, null); assert.equal(r.items[0].unclear, true); });
console.log(`\n${passed} passed, 0 failed`);

// The same item under different names (src/medmerge.js): found, never across strengths or forms; merged only after a
// person approves (components/NameCheck.jsx). Fictional medicines.
import assert from 'node:assert/strict';
import { sameItem, mergeGroups, mergedRecord, formOf } from '../src/medmerge.js';
import { searchProducts } from '../src/search.js';
import { matchProduct } from '../src/invoiceMatch.js';
let passed = 0;
const ok = (name, fn) => { fn(); passed++; console.log('PASS ', name); };
const P = [
  { id: 'a1', name: 'Amoxil 500mg Caps', form: 'Capsules', stock: 5 },
  { id: 'a2', name: 'AMOXIL 500 MG CAPSULES', form: 'Capsules', stock: 30, barcode: '600100' },
  { id: 'a3', name: 'Amoxil 250mg Caps', form: 'Capsules' },
  { id: 'a4', name: 'Amoxil 500mg/5ml Syrup', form: 'Syrups' },
  { id: 'p1', name: 'Paracetamol 500mg', form: 'Tablets' },
  { id: 'p2', name: 'Paracetamoll 500mg tabs', form: 'Tablets' },
  { id: 'p3', name: 'Paracetamol 500mg Suppository', form: 'Others' },
];
ok('the same item: capitals, spacing, form words and a spelling slip aside', () => {
  assert.equal(sameItem(P[0], P[1]), true);
  assert.equal(sameItem(P[4], P[5]), true);
});
ok('never across strengths or forms', () => {
  assert.equal(sameItem(P[0], P[2]), false, '500mg vs 250mg');
  assert.equal(sameItem(P[0], P[3]), false, 'capsules vs syrup');
  assert.equal(sameItem(P[4], P[6]), false, 'tablets vs suppository');
  assert.equal(formOf(P[6]), 'suppository');
});
ok('groups, with the one with most stock suggested to keep', () => {
  const g = mergeGroups(P);
  assert.deepEqual(g.map((x) => x.ids.sort().join()), ['a1,a2', 'p1,p2']);
  assert.equal(g[0].keep, 'a2');
});
ok('the kept record takes the other names as aliases, a missing barcode, packs and details', () => {
  const r = mergedRecord({ id: 'k', name: 'Amoxil 500mg Capsules', packs: [{ name: 'Box', size: 100 }] }, [{ id: 'o', name: 'AMOXIL 500 MG CAPS', barcode: '600100', generic: 'Amoxicillin', packs: [{ name: 'Strip', size: 10 }, { name: 'Box', size: 100 }] }]);
  assert.deepEqual([r.aliases, r.barcode, r.generic, r.packs.length], [['AMOXIL 500 MG CAPS'], '600100', 'Amoxicillin', 2]);
});
ok('after a merge the old name is still found by search and on invoices', () => {
  const kept = { id: 'k', name: 'Amoxil 500mg Capsules', aliases: ['Moxiclav-X 500mg'], stock: 1 };
  assert.equal(searchProducts([kept], 'moxiclav')[0]?.id, 'k');
  assert.equal(matchProduct('Moxiclav-X 500mg caps', [kept, { id: 'z', name: 'Zinc 20mg' }])?.id, 'k');
});
ok('thousands of medicines are checked quickly', () => {
  const many = Array.from({ length: 6000 }, (_, i) => ({ id: 'x' + i, name: `Med${i % 2000} ${(i % 40) * 5}mg Tablets`, form: 'Tablets' }));
  const t = performance.now(); mergeGroups(many); assert.ok(performance.now() - t < 3000);
});
console.log(`\n${passed} passed, 0 failed`);

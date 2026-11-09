// Stock balances (workplan step 13, src/stockindex.js): after a change only new movements are added, and the result
// is always exactly what a full count gives.   node unit-stockindex.mjs
import { createStockIndexer, countAll } from '../src/stockindex.js';
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + String(x) : ''}`); };
const eq = (a, b) => ['batch', 'product', 'total'].every((k) => {
  const keys = new Set([...a[k].keys(), ...b[k].keys()]);
  return [...keys].every((x) => Math.abs((a[k].get(x) || 0) - (b[k].get(x) || 0)) < 1e-9);
});
let n = 0;
const mv = (productId, qty, x = {}) => ({ id: 'm' + n++, productId, qty, batchId: 'b-' + productId, branchId: 'main', ...x });

const ix = createStockIndexer({ selfCheck: 1000 });
let list = [mv('p1', 100), mv('p2', 50), mv('p1', 10, { branchId: 'kla' }), mv('p3', 5, { batchId: null })];
let r = ix(list);
check('the first count is a full one', r.how === 'full' && r.total.get('p1') === 110 && r.batch.get('main|lb-p3') === 5 && r.product.get('kla|p1') === 10);
check('asked again for the same list: nothing is counted', ix(list).how === 'same');
list = [mv('p1', -2), mv('p1', -1), ...list]; // a sale here: new movements first (store.jsx put)
r = ix(list);
check('a sale made here adds only its movements', r.how === 'front' && r.total.get('p1') === 107 && eq(r, countAll(list)));
list = [...list, mv('p2', -5), mv('p4', 7, { branchId: '' })]; // pulled from the cloud: added last (mergeRemote)
r = ix(list);
check('changes from the cloud add only theirs', r.how === 'back' && r.product.get('main|p2') === 45 && r.product.get('main|p4') === 7 && eq(r, countAll(list)));
list = list.map((x, i) => (i === 3 ? { ...x } : x)); // the cloud re-sends one already here (same content, new object)
r = ix(list);
check('a re-sent movement replaced in place changes nothing', r.how === 'front' && eq(r, countAll(list)));
list = list.filter((x, i) => i !== 2); // a deletion
r = ix(list);
check('a deletion re-counts everything', r.how === 'full' && eq(r, countAll(list)));
list = [mv('p9', 1), ...list, mv('p9', 2)]; // both ends at once (two changes rendered together)
r = ix(list);
check('new movements at both ends re-count everything', r.how === 'full' && r.total.get('p9') === 3 && eq(r, countAll(list)));
check('an empty list', ix([]).how === 'full' && ix([]).total.size === 0);

// a long run of sales and pulls stays exact, and the self-check runs
let mismatches = 0;
const ix2 = createStockIndexer({ selfCheck: 50, onMismatch: () => mismatches++ });
let l2 = [mv('p1', 1000)];
ix2(l2);
let checked = 0;
for (let i = 0; i < 400; i++) {
  l2 = i % 3 ? [mv('p' + (i % 7), -1), ...l2] : [...l2, mv('p' + (i % 5), 2, { branchId: i % 2 ? 'kla' : 'main' })];
  if (ix2(l2).how === 'checked') checked++;
}
check('400 changes: exactly the full count', eq(ix2(l2), countAll(l2)));
check('…the self-check ran and never disagreed', checked === 8 && mismatches === 0, `${checked} checks, ${mismatches} mismatches`);

// the self-check catches what the shortcut cannot see (a quantity changed in place, which the apps never do)
const ix3 = createStockIndexer({ selfCheck: 1, onMismatch: () => mismatches++ });
let l3 = [mv('p1', 10), mv('p1', 5)];
ix3(l3);
l3[0].qty = 99; // a broken record: the same object, its quantity changed (10 → 99)
l3 = [mv('p1', 1), ...l3];
r = ix3(l3);
check('a broken record is caught and the full count wins', mismatches === 1 && r.total.get('p1') === 105);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

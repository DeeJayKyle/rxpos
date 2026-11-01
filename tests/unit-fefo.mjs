// FEFO stock allocation (review Phase 1.6/1.8), including the fix that leftover stock is never booked against an
// expired or arbitrary batch.
//   node unit-fefo.mjs
import { allocate, removalSplit } from '../src/fefo.js';
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + JSON.stringify(x) : ''}`); };
const PAST = '2020-01-01', SOON = '2030-01-01', LATER = '2031-01-01';

// earliest-expiry first across sorted batches
let out = allocate([{ id: 'a', qty: 5, expiry: SOON, batch: 'A' }, { id: 'b', qty: 5, expiry: LATER, batch: 'B' }], 7);
check('splits earliest-expiry first', out.length === 2 && out[0].batchId === 'a' && out[0].qty === 5 && out[1].batchId === 'b' && out[1].qty === 2, out);

// expired batches are skipped by default
out = allocate([{ id: 'x', qty: 5, expiry: PAST, batch: 'OLD' }, { id: 'y', qty: 5, expiry: LATER, batch: 'NEW' }], 3);
check('skips an expired batch, sells the fresh one', out.length === 1 && out[0].batchId === 'y', out);

// …but can use them when explicitly allowed
out = allocate([{ id: 'x', qty: 5, expiry: PAST, batch: 'OLD' }], 3, { allowExpired: true });
check('uses an expired batch when allowExpired', out.length === 1 && out[0].batchId === 'x', out);

// zero-qty batches are ignored
out = allocate([{ id: 'z', qty: 0, expiry: LATER }, { id: 'y', qty: 4, expiry: LATER, batch: 'NEW' }], 2);
check('skips a zero-quantity batch', out.length === 1 && out[0].batchId === 'y', out);

// THE FIX: leftover (unrecorded stock) is never booked against an expired/arbitrary batch
out = allocate([{ id: 'exp', qty: 5, expiry: PAST, batch: 'OLD' }], 3);
check('1.6 leftover is booked untracked, not against the expired batch', out.length === 1 && out[0].batchId === null && out[0].expiry === '', out);

// leftover goes to the sellable batch when one exists
out = allocate([{ id: 'exp', qty: 2, expiry: PAST }, { id: 'good', qty: 2, expiry: LATER, batch: 'NEW' }], 10);
const booked = out.reduce((a, o) => a + o.qty, 0);
check('1.6 leftover is booked against the sellable batch, totals preserved', booked === 10 && out.every((o) => o.batchId !== 'exp'), out);

// removalSplit: an adjustment "Remove" never pushes a batch below zero while others still hold stock
{
  const bs = [{ id: 'old', batch: 'OLD', qty: 0, expiry: '2026-12-01' }, { id: 'a', batch: 'A', qty: 283, expiry: '2027-01-01' }, { id: 'b', batch: 'B', qty: 470, expiry: '2027-06-01' }];
  const r = removalSplit(bs, 'a', 500);
  check('remove more than the chosen batch: the rest comes from the next batch', JSON.stringify(r.map((x) => [x.batchId, x.qty])) === JSON.stringify([['a', 283], ['b', 217]]), JSON.stringify(r));
  const r2 = removalSplit(bs, 'old', 8);
  check('an empty chosen batch is skipped: stock comes from batches that have it', JSON.stringify(r2.map((x) => [x.batchId, x.qty])) === JSON.stringify([['a', 8]]), JSON.stringify(r2));
  const r3 = removalSplit(bs, 'b', 10);
  check('within the chosen batch: only that batch', JSON.stringify(r3.map((x) => [x.batchId, x.qty])) === JSON.stringify([['b', 10]]), JSON.stringify(r3));
  let err = ''; try { removalSplit(bs, 'a', 754); } catch (e) { err = e.message; }
  check('removing more than the medicine has is refused', /Only 753 in stock/.test(err), err);
  const r4 = removalSplit([{ id: 'lb-p1', legacy: true, qty: 5 }], 'lb-p1', 2);
  check('stock recorded without a batch is removed without one', r4[0].batchId === null && r4[0].qty === 2, JSON.stringify(r4));
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

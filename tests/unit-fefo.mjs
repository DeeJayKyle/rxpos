// FEFO stock allocation (review Phase 1.6/1.8), including the fix that leftover stock is never booked against an
// expired or arbitrary batch.
//   node unit-fefo.mjs
import { allocate } from '../src/fefo.js';
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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

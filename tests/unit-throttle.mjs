// Sign-in slowdown per account (workplan step 6, worker/throttle.js).   node unit-throttle.mjs
import { waitFor, afterFail, waitText, WINDOW_MS } from '../worker/throttle.js';
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + String(x) : ''}`); };

const t0 = 1_800_000_000_000;
let row = null;
check('no wrong passwords: no wait', waitFor(row, t0) === 0);
for (let i = 0; i < 9; i++) row = afterFail(row, t0 + i * 1000);
check('9 wrong passwords: still no wait', row.n === 9 && waitFor(row, t0 + 9000) === 0);
row = afterFail(row, t0 + 10000);
check('the 10th: one try a minute from then', row.n === 10 && waitFor(row, t0 + 10000) === 60000 && waitFor(row, t0 + 40000) === 30000);
check('…and free again after the minute', waitFor(row, t0 + 70001) === 0);
for (let i = 0; i < 10; i++) row = afterFail(row, t0 + 100000 + i * 61000);
check('the 20th: one try every 5 minutes', row.n === 20 && waitFor(row, row.last_at) === 5 * 60000);
check('an hour with no wrong password starts the count again', waitFor(row, row.last_at + WINDOW_MS + 1) === 0 && afterFail(row, row.last_at + WINDOW_MS + 1).n === 1);
check('a bad stored row never blocks', waitFor({ n: 'x', last_at: 'y' }, t0) === 0 && afterFail({ n: 'x', last_at: 'y' }, t0).n === 1);
check('wait text', waitText(1000) === '1 second' && waitText(45000) === '45 seconds' && waitText(60000) === '1 minute' && waitText(290000) === '5 minutes');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

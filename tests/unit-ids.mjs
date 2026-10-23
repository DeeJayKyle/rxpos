// Record ids (review Phase 2.5): collision-resistant and unique.
//   node unit-ids.mjs
import { uid } from '../src/ids.js';
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + x : ''}`); };

const ids = Array.from({ length: 5000 }, () => uid());
check('uid returns a non-empty string', typeof ids[0] === 'string' && ids[0].length >= 8, ids[0]);
check('5000 ids are all unique', new Set(ids).size === 5000, String(new Set(ids).size));
check('uid looks like a UUID where crypto.randomUUID exists', !globalThis.crypto?.randomUUID || /^[0-9a-f-]{36}$/.test(ids[0]), ids[0]);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

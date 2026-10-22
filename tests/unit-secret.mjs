// Unit test: the token signing secret must never "fail open". (worker/secret.js)
import { tokenSecret, MIN_SECRET_BYTES } from '../worker/secret.js';
let pass = 0, fail = 0;
const check = (n, ok) => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}`); };
const throws = (fn) => { try { fn(); return false; } catch { return true; } };

check('throws when no secret is set', throws(() => tokenSecret({})));
check('throws when the secret is too short', throws(() => tokenSecret({ SYNC_KEY: 'short' })));
check('throws on a secret one byte under the minimum', throws(() => tokenSecret({ SYNC_KEY: 'a'.repeat(MIN_SECRET_BYTES - 1) })));
check('accepts a long SYNC_KEY', tokenSecret({ SYNC_KEY: 'a'.repeat(MIN_SECRET_BYTES) }) === 'a'.repeat(MIN_SECRET_BYTES));
check('prefers TOKEN_SECRET over SYNC_KEY', tokenSecret({ TOKEN_SECRET: 'b'.repeat(40), SYNC_KEY: 'a'.repeat(40) }) === 'b'.repeat(40));
check('falls back to SYNC_KEY when TOKEN_SECRET is absent', tokenSecret({ SYNC_KEY: 'c'.repeat(40) }) === 'c'.repeat(40));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

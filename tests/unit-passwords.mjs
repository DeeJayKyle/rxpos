// Cloud password hashing (workplan step 5, worker/passwords.js): rounds from PBKDF2_ITER, a safe fallback, re-hash on
// sign-in, legacy hashes upgraded, constant-time checks.   node unit-passwords.mjs
import nodeCrypto from 'node:crypto';
import { targetIter, verify, hashNew, upgrade, weaker, sameHex, FLOOR } from '../worker/passwords.js';
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + String(x) : ''}`); };

check('no setting → 100,000', targetIter({}) === FLOOR && targetIter(undefined) === FLOOR);
check('a setting is used', targetIter({ PBKDF2_ITER: '600000' }) === 600000);
check('below 100,000 or junk → 100,000', targetIter({ PBKDF2_ITER: '5000' }) === FLOOR && targetIter({ PBKDF2_ITER: 'lots' }) === FLOOR);
check('capped at 2,000,000', targetIter({ PBKDF2_ITER: '99999999' }) === 2_000_000);

const env = { PBKDF2_ITER: '150000' };
const h = await hashNew(env, 'correct horse');
check('a new hash uses the target rounds and a salt', h.algo === 'pbkdf2' && h.iter === 150000 && h.salt.length >= 20 && /^[0-9a-f]{64}$/.test(h.hash));
check('…and matches what Node computes (same PBKDF2 as the devices)', nodeCrypto.pbkdf2Sync('correct horse', Buffer.from(h.salt, 'base64'), 150000, 32, 'sha256').toString('hex') === h.hash);
check('the right password opens it', await verify(h, 'correct horse'));
check('a wrong one does not', !(await verify(h, 'correct hors')));
const legacy = { hash: nodeCrypto.createHash('sha256').update('pharmapos:old-pass-1').digest('hex') };
check('a legacy unsalted hash still opens', await verify(legacy, 'old-pass-1') && !(await verify(legacy, 'old-pass-2')));
check('a record with no hash never opens', !(await verify({}, '')) && !(await verify(null, 'x')));
check('constant-time compare: equal / different / different length', sameHex('ab', 'ab') && !sameHex('ab', 'ac') && !sameHex('ab', 'abc'));

// re-hash on sign-in
const at100k = { algo: 'pbkdf2', salt: h.salt, iter: FLOOR, hash: nodeCrypto.pbkdf2Sync('pw-123456', Buffer.from(h.salt, 'base64'), FLOOR, 32, 'sha256').toString('hex') };
check('100,000 rounds is weaker than a 150,000 target', weaker(at100k, env) && !weaker(at100k, {}));
const up = await upgrade(at100k, 'pw-123456', env);
check('…so a sign-in upgrades it to 150,000', up?.iter === 150000 && (await verify(up, 'pw-123456')));
check('a hash already at the target is left alone', (await upgrade(h, 'correct horse', env)) === null);
const upLegacy = await upgrade(legacy, 'old-pass-1', {});
check('a legacy hash is upgraded even with no setting', upLegacy?.algo === 'pbkdf2' && upLegacy.iter === FLOOR && (await verify(upLegacy, 'old-pass-1')));

// the runtime refuses more than 100,000 rounds (as Cloudflare may): fall back, never lock anyone out
const real = SubtleCrypto.prototype.deriveBits;
SubtleCrypto.prototype.deriveBits = function (alg, ...rest) {
  if (alg?.iterations > FLOOR) return Promise.reject(new Error('iteration counts above 100000 are not supported'));
  return real.call(this, alg, ...rest);
};
const warn = console.warn; console.warn = () => {};
try {
  const fb = await hashNew({ PBKDF2_ITER: '600000' }, 'pw-fallback');
  check('a refused target falls back to 100,000', fb.iter === FLOOR && (await verify(fb, 'pw-fallback')));
  check('…and a 100,000 hash is then not rewritten at every sign-in', (await upgrade(at100k, 'pw-123456', { PBKDF2_ITER: '600000' })) === null);
  const lg = await upgrade(legacy, 'old-pass-1', { PBKDF2_ITER: '600000' });
  check('…but a legacy hash is still upgraded (to 100,000)', lg?.iter === FLOOR && (await verify(lg, 'old-pass-1')));
} finally { SubtleCrypto.prototype.deriveBits = real; console.warn = warn; }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

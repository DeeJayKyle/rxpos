// Device-bound offline sign-in (security review 0.2): a device keeps a local verifier (and optional PIN) only for
// the users who sign in on it, never the synced password hash. Pure logic, no browser.
//   node unit-offline.mjs
// Shim the one browser API offline.js needs (localStorage); crypto.subtle, btoa and atob are Node globals.
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
const { rememberOffline, verifyOffline, hasOffline, forgetOffline, adoptSyncedHash, setPin, hasPin, clearPin, verifyPin } = await import('../src/offline.js');

let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + String(x).slice(0, 120) : ''}`); };

const te = new TextEncoder();
const hex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
const shaLegacy = async (pw) => hex(await crypto.subtle.digest('SHA-256', te.encode('pharmapos:' + pw)));
const pbkdf2 = async (pw, saltB64, iter) => {
  const key = await crypto.subtle.importKey('raw', te.encode(pw), 'PBKDF2', false, ['deriveBits']);
  const salt = Uint8Array.from(atob(saltB64), (c) => c.charCodeAt(0));
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, key, 256));
};

const T = 'tenant-1';

// ----- password verifier -----
await rememberOffline(T, 'u1', 'correct horse');
check('a remembered user can be verified offline', await verifyOffline(T, 'u1', 'correct horse'));
check('a wrong password is rejected', !(await verifyOffline(T, 'u1', 'wrong')));
check('hasOffline is true once remembered', hasOffline(T, 'u1'));
check('an unknown user cannot be verified', !(await verifyOffline(T, 'nope', 'correct horse')));

// a verifier is device-salted, so the stored hash is not the bare synced hash and differs per device/call
await rememberOffline(T, 'u1', 'correct horse');
const raw = JSON.parse(localStorage.getItem('rxpos-offline-v1'));
const bareSalt16 = btoa('0123456789abcdef');
check('the stored verifier is not a bare unsalted hash', raw[`${T}:u1`].pw.hash !== (await shaLegacy('correct horse')));
check('the stored verifier uses a random salt (not a fixed one)', raw[`${T}:u1`].pw.salt !== bareSalt16);

// the verifier for one user never validates another user's password slot
await rememberOffline(T, 'u2', 'second pass');
check('one user’s verifier does not validate another’s password', !(await verifyOffline(T, 'u1', 'second pass')) && (await verifyOffline(T, 'u2', 'second pass')));

// tenant scoping: same user id under a different tenant is a different slot
check('verifiers are scoped per tenant', !(await verifyOffline('tenant-2', 'u1', 'correct horse')));

// forgetting a user removes offline sign-in for them
forgetOffline(T, 'u1');
check('forgetOffline drops the verifier', !hasOffline(T, 'u1'));

// ----- migration: adopt a synced hash a legacy device still holds -----
adoptSyncedHash(T, 'leg', { algo: 'sha256', hash: await shaLegacy('legacy-pass') });
check('an adopted legacy sha256 hash verifies', await verifyOffline(T, 'leg', 'legacy-pass'));
check('a wrong password against a legacy hash is rejected', !(await verifyOffline(T, 'leg2', 'x')));
// after a successful legacy verify it is upgraded to a device-salted verifier
const after = JSON.parse(localStorage.getItem('rxpos-offline-v1'))[`${T}:leg`];
check('a legacy hash is upgraded to a device verifier after use', !!after.pw);

// adopt a legacy pbkdf2 hash too
const salt = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
adoptSyncedHash(T, 'legp', { algo: 'pbkdf2', salt, hash: await pbkdf2('pb-pass', salt, 100000) });
check('an adopted legacy pbkdf2 hash verifies', await verifyOffline(T, 'legp', 'pb-pass'));

// adopting does not overwrite an existing device verifier
await rememberOffline(T, 'u3', 'real-pass');
adoptSyncedHash(T, 'u3', { algo: 'sha256', hash: await shaLegacy('other') });
check('adopt does not clobber an existing verifier', (await verifyOffline(T, 'u3', 'real-pass')) && !(await verifyOffline(T, 'u3', 'other')));

// ----- optional quick PIN -----
await setPin(T, 'u2', '1357');
check('a PIN can be set and verified', (await verifyPin(T, 'u2', '1357')).ok);
check('hasPin reflects a set PIN', hasPin(T, 'u2'));
let r = await verifyPin(T, 'u2', '0000');
check('a wrong PIN fails and counts down', !r.ok && r.left === 4, JSON.stringify(r));
check('a correct PIN resets the remaining tries', (await verifyPin(T, 'u2', '1357')).ok && (await verifyPin(T, 'u2', '0000')).left === 4);
// five wrong tries in a row forgets the PIN (fall back to the full password)
for (let i = 0; i < 4; i++) await verifyPin(T, 'u2', '0000');
r = await verifyPin(T, 'u2', '0000');
check('too many wrong PINs forgets the PIN', !hasPin(T, 'u2'));
check('verifyPin with no PIN returns not-ok', !(await verifyPin(T, 'u2', '1357')).ok);

// PIN validation and removal
let threw = false; try { await setPin(T, 'u2', '12'); } catch { threw = true; }
check('a too-short PIN is refused', threw);
let threw2 = false; try { await setPin(T, 'u2', '12ab'); } catch { threw2 = true; }
check('a non-numeric PIN is refused', threw2);
await setPin(T, 'u2', '246813');
clearPin(T, 'u2');
check('clearPin removes the PIN but keeps the password verifier', !hasPin(T, 'u2') && (await verifyOffline(T, 'u2', 'second pass')));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

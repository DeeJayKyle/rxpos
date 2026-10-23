// Password secrets never leave the server (security review 0.2): a device syncs user records WITHOUT the password
// hash, a user edit that omits the hash does not wipe it, and a genuine password change still takes effect.
//   node v27-secrets.mjs <base> <ownerKey>
const [base, ownerKey] = process.argv.slice(2);
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + String(x).slice(0, 180) : ''}`); };
const owner = (p, body) => fetch(base + '/api/owner' + p, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ownerKey }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());
const api = (p, body, token) => fetch(base + p, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined }).then(async (r) => ({ status: r.status, ...(await r.json().catch(() => ({}))) }));
const now = () => new Date().toISOString();
const push = (token, deviceId, changes) => api('/api/sync', { deviceId, since: 0, changes }, token);

const te = new TextEncoder();
const hex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
// same shape as the client's makePassword(): a salted PBKDF2 hash the server can verify
const makeHash = async (pw) => {
  const saltBytes = crypto.getRandomValues(new Uint8Array(16));
  const salt = Buffer.from(saltBytes).toString('base64');
  const key = await crypto.subtle.importKey('raw', te.encode(pw), 'PBKDF2', false, ['deriveBits']);
  return { algo: 'pbkdf2', salt, iter: 100000, hash: hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: saltBytes, iterations: 100000, hash: 'SHA-256' }, key, 256)) };
};
const SECRETS = ['hash', 'salt', 'algo', 'iter'];
const hasNoSecrets = (rec) => SECRETS.every((f) => rec[f] === undefined);

const t = await owner('/tenants', { name: 'Secret Pharmacy', admin: { name: 'Al Admin', email: 'al@test.rx', password: 'al-pass-1234' } });
const tid = t.tenant.id, slug = t.tenant.slug;
await owner('/tenants/' + tid + '/users', { user: { name: 'Cax Cashier', email: 'cax@test.rx', role: 'cashier', password: 'cax-pass-1234' } });

const login = (email, pw) => api('/api/login', { email, password: pw, tenant: slug });
const alTok = (await login('al@test.rx', 'al-pass-1234')).token;
check('admin can sign in (hash is kept server-side)', !!alTok);
check('a cashier can sign in with the seeded password', !!(await login('cax@test.rx', 'cax-pass-1234')).token);

// 1) a device pull returns user records with NO password secrets
let pull = await push(alTok, 'dev-al', []);
const users = (pull.changes || []).filter((c) => c.t === 'users');
check('the pull actually carried user records', users.length >= 2, JSON.stringify(users.map((u) => u.rec?.email)));
check('0.2 no synced user record carries a password hash', users.every((u) => hasNoSecrets(u.rec)), JSON.stringify(users.map((u) => Object.keys(u.rec))));
const cax = users.find((u) => u.rec?.email === 'cax@test.rx');
check('found the cashier record', !!cax);

// 2) a device edit that omits the hash (a rename) must not wipe the stored password
let r = await push(alTok, 'dev-al', [{ t: 'users', id: cax.id, at: now(), rec: { ...cax.rec, name: 'Cax Renamed' } }]);
check('the rename is applied', r.applied === 1, JSON.stringify({ a: r.applied, ref: r.refused }));
check('0.2 the cashier can still sign in after a hash-less edit', !!(await login('cax@test.rx', 'cax-pass-1234')).token);

// 3) a genuine password change (a push that DOES carry a fresh hash) takes effect
const fresh = await makeHash('cax-new-pass-9999');
r = await push(alTok, 'dev-al', [{ t: 'users', id: cax.id, at: now(), rec: { ...cax.rec, name: 'Cax Renamed', ...fresh } }]);
check('the password change is applied', r.applied === 1);
check('0.2 the cashier signs in with the NEW password', !!(await login('cax@test.rx', 'cax-new-pass-9999')).token);
check('0.2 the OLD password no longer works', !(await login('cax@test.rx', 'cax-pass-1234')).token);

// 4) even after a real password change, the secrets are still stripped on the next pull
pull = await push(alTok, 'dev-al2', []);
const caxAfter = (pull.changes || []).find((c) => c.t === 'users' && c.rec?.email === 'cax@test.rx');
check('0.2 the changed record is still synced without secrets', caxAfter && hasNoSecrets(caxAfter.rec), JSON.stringify(caxAfter?.rec && Object.keys(caxAfter.rec)));

await owner('/tenants/' + tid + '/delete', { confirm: slug });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

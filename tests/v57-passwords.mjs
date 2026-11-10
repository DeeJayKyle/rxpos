// Passwords on a local cloud (workplan step 5). The test cloud runs with PBKDF2_ITER=150000 (tests/run-all.mjs):
// new passwords get 150,000 rounds; a right sign-in upgrades an old 100,000-round hash and a legacy unsalted one;
// a wrong password changes nothing; devices never receive the hashes.   node v57-passwords.mjs <base> <ownerKey>
import nodeCrypto from 'node:crypto';
const [base, ownerKey] = process.argv.slice(2);
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + String(x).slice(0, 180) : ''}`); };
const owner = (p, body) => fetch(base + '/api/owner' + p, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ownerKey }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());
const api = (p, body, token) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, ...(await r.json().catch(() => ({}))) }));

const t = await owner('/tenants', { name: 'Password Pharmacy', admin: { name: 'Pat Admin', email: 'pat@pw.rx', password: 'pat-pass-1234' } });
const tid = t.tenant.id, slug = t.tenant.slug;
const userRec = async (email) => (await owner(`/tenants/${tid}/records?t=users&q=${encodeURIComponent(email)}`)).rows?.[0]?.rec;
const login = (email, password) => api('/api/login', { email, password, tenant: slug });

check('a password set by the owner gets the configured 150,000 rounds', (await userRec('pat@pw.rx'))?.iter === 150000, (await userRec('pat@pw.rx'))?.iter);

// two staff whose hashes predate step 5: one at 100,000 rounds, one legacy unsalted SHA-256
const salt = nodeCrypto.randomBytes(16).toString('base64');
await owner('/tenants/' + tid + '/records', { records: [
  { t: 'users', id: 'u-old', rec: { name: 'Olu Old', email: 'olu@pw.rx', role: 'cashier', algo: 'pbkdf2', salt, iter: 100000, hash: nodeCrypto.pbkdf2Sync('olu-pass-1234', Buffer.from(salt, 'base64'), 100000, 32, 'sha256').toString('hex') } },
  { t: 'users', id: 'u-leg', rec: { name: 'Lee Legacy', email: 'lee@pw.rx', role: 'cashier', hash: nodeCrypto.createHash('sha256').update('pharmapos:lee-pass-1234').digest('hex') } },
] });
const before = await userRec('olu@pw.rx');
let r = await login('olu@pw.rx', 'olu-pass-12345');
check('a wrong password is refused', r.status === 401);
check('…and changes nothing', JSON.stringify(await userRec('olu@pw.rx')) === JSON.stringify(before));
r = await login('olu@pw.rx', 'olu-pass-1234');
check('the 100,000-round password still signs in', r.status === 200 && !!r.token);
const olu = await userRec('olu@pw.rx');
check('…and is upgraded to 150,000 rounds with a new salt', olu?.iter === 150000 && olu.salt !== salt && olu.hash !== before.hash);
check('…which still opens', (await login('olu@pw.rx', 'olu-pass-1234')).status === 200);
r = await login('lee@pw.rx', 'lee-pass-1234');
const lee = await userRec('lee@pw.rx');
check('a legacy unsalted password signs in and becomes PBKDF2 at 150,000', r.status === 200 && lee?.algo === 'pbkdf2' && lee.iter === 150000, JSON.stringify({ s: r.status, a: lee?.algo, i: lee?.iter }));
check('…and the old password still works after the upgrade', (await login('lee@pw.rx', 'lee-pass-1234')).status === 200);
const synced = await api('/api/sync', { v: 2, deviceId: 'dev-pw', since: 0, changes: [] }, r.token);
const users = (synced.changes || []).filter((c) => c.t === 'users');
check('devices still never receive hashes, salts or rounds', users.length >= 3 && users.every((c) => !('hash' in c.rec) && !('salt' in c.rec) && !('iter' in c.rec)));

await owner('/tenants/' + tid + '/delete', { confirm: slug });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

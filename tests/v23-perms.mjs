// Server-side permission enforcement (security review Phase 0/1).
//   0.5 only an admin may create, edit, disable, delete or promote-to an administrator account.
//   node v23-perms.mjs <base> <ownerKey> <outDir>
import { CHROME } from './chrome.mjs';
const [base, ownerKey] = process.argv.slice(2);
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + String(x).slice(0, 180) : ''}`); };
const owner = (p, body) => fetch(base + '/api/owner' + p, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ownerKey }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());
const api = (p, body, token) => fetch(base + p, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined }).then(async (r) => ({ status: r.status, ...(await r.json().catch(() => ({})) ) }));
const now = () => new Date().toISOString();
const push = (token, deviceId, changes) => api('/api/sync', { deviceId, since: 0, changes }, token);

const t = await owner('/tenants', { name: 'Perm Pharmacy', admin: { name: 'Al Admin', email: 'al@test.rx', password: 'al-pass-1234' } });
const tid = t.tenant.id, slug = t.tenant.slug;
// a non-admin role that nonetheless has users.manage, plus a manager and a cashier who use it
await owner('/tenants/' + tid + '/records', { records: [
  { t: 'roles', id: 'manager', rec: { name: 'Manager', permissions: ['users.manage', 'inventory.view', 'pos.sell'] } },
] });
await owner('/tenants/' + tid + '/users', { user: { name: 'Meg Manager', email: 'meg@test.rx', role: 'manager', password: 'meg-pass-1234' } });
await owner('/tenants/' + tid + '/users', { user: { name: 'Cax Cashier', email: 'cax@test.rx', role: 'cashier', password: 'cax-pass-1234' } });

const login = (email, pw) => api('/api/login', { email, password: pw, tenant: slug });
const megTok = (await login('meg@test.rx', 'meg-pass-1234')).token;
const alTok = (await login('al@test.rx', 'al-pass-1234')).token;
check('manager and admin can sign in', !!megTok && !!alTok);

// read the users so we have real ids (admin pulls everything)
const pull = await push(alTok, 'dev-al', []);
const users = (pull.changes || []).filter((c) => c.t === 'users').map((c) => ({ id: c.id, ...c.rec }));
const admin = users.find((u) => u.email === 'al@test.rx');
const meg = users.find((u) => u.email === 'meg@test.rx');
const cax = users.find((u) => u.email === 'cax@test.rx');
check('admin/manager/cashier records exist', !!admin && !!meg && !!cax, JSON.stringify(users.map((u) => u.email)));

// 1) manager tries to DISABLE the admin (keeping role admin) → refused
let r = await push(megTok, 'dev-meg', [{ t: 'users', id: admin.id, at: now(), rec: { ...admin, disabled: true } }]);
check('0.5 manager cannot disable an admin', r.applied === 0 && r.refused === 1, JSON.stringify({ a: r.applied, ref: r.refused }));

// 2) manager tries to DEMOTE the admin to cashier → refused
r = await push(megTok, 'dev-meg', [{ t: 'users', id: admin.id, at: now(), rec: { ...admin, role: 'cashier' } }]);
check('0.5 manager cannot demote an admin', r.applied === 0 && r.refused === 1);

// 3) manager tries to set a NEW password hash on the admin → refused
r = await push(megTok, 'dev-meg', [{ t: 'users', id: admin.id, at: now(), rec: { ...admin, algo: 'pbkdf2', salt: 'AAAA', iter: 100000, hash: 'deadbeef' } }]);
check('0.5 manager cannot re-hash an admin password', r.applied === 0 && r.refused === 1);

// 4) manager tries to PROMOTE self to admin → refused
r = await push(megTok, 'dev-meg', [{ t: 'users', id: meg.id, at: now(), rec: { ...meg, role: 'admin' } }]);
check('0.5 manager cannot promote self to admin', r.applied === 0 && r.refused === 1);

// 5) manager tries to DELETE the admin → refused
r = await push(megTok, 'dev-meg', [{ t: 'users', id: admin.id, at: now(), deleted: true }]);
check('0.5 manager cannot delete an admin', r.applied === 0 && r.refused === 1);

// 6) manager edits a normal cashier (e.g. change their name) → allowed
r = await push(megTok, 'dev-meg', [{ t: 'users', id: cax.id, at: now(), rec: { ...cax, name: 'Cax Renamed' } }]);
check('manager can still edit a non-admin user', r.applied === 1 && r.refused === 0, JSON.stringify({ a: r.applied, ref: r.refused }));

// 7) the admin can edit the admin record (e.g. own name) → allowed
r = await push(alTok, 'dev-al2', [{ t: 'users', id: admin.id, at: now(), rec: { ...admin, name: 'Al Renamed' } }]);
check('an admin can still edit an admin', r.applied === 1 && r.refused === 0, JSON.stringify({ a: r.applied, ref: r.refused }));

// 8) even a pharmacy ADMIN may not mint a new admin (only the RxPOS owner does)
r = await push(alTok, 'dev-al3', [{ t: 'users', id: 'u-newadmin', at: now(), rec: { name: 'Sneaky Admin', email: 'sneak@test.rx', role: 'admin' } }]);
check('0.5 a pharmacy admin cannot create another admin', r.applied === 0 && r.refused === 1, JSON.stringify({ a: r.applied, ref: r.refused }));

// 9) 1.2 a role change takes effect on an already-issued token: demote the manager to cashier (loses users.manage),
// then the manager's EXISTING token may no longer edit another user — the role is read from the record, not the token.
await push(alTok, 'dev-al4', [{ t: 'users', id: meg.id, at: now(), rec: { ...meg, role: 'cashier' } }]);
r = await push(megTok, 'dev-meg2', [{ t: 'users', id: cax.id, at: now(), rec: { ...cax, name: 'Cax Again' } }]);
check('1.2 a demoted user’s existing token loses the old role’s access', r.applied === 0 && r.refused === 1, JSON.stringify({ a: r.applied, ref: r.refused }));

// 10) 1.2 the live WebSocket authenticates with a short-lived ticket, not the long-lived sign-in token in the URL
const lt = await api('/api/live-ticket', {}, alTok);
check('1.2 a signed-in device is issued a live-connection ticket', !!lt.ticket && lt.ticket !== alTok, JSON.stringify(Object.keys(lt)));
const lt0 = await api('/api/live-ticket', {});
check('1.2 a live ticket needs a signed-in device', lt0.status === 401);

await owner('/tenants/' + tid + '/delete', { confirm: slug });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

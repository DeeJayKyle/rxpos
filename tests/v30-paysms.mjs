// Payments and SMS need a permission (review Phase 1.9): the client can no longer have any staff token trigger a
// Mobile Money request or an SMS send. (Amount cap and per-tenant rate limit are also enforced server-side.)
//   node v30-paysms.mjs <base> <ownerKey>
const [base, ownerKey] = process.argv.slice(2);
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + String(x).slice(0, 180) : ''}`); };
const owner = (p, body) => fetch(base + '/api/owner' + p, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ownerKey }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());
const api = (p, body, token) => fetch(base + p, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined }).then(async (r) => ({ status: r.status, ...(await r.json().catch(() => ({}))) }));

const t = await owner('/tenants', { name: 'Pay Pharmacy', admin: { name: 'Al Admin', email: 'al@test.rx', password: 'al-pass-1234' } });
const tid = t.tenant.id, slug = t.tenant.slug;
await owner('/tenants/' + tid + '/records', { records: [{ t: 'roles', id: 'stockonly', rec: { name: 'Stock only', permissions: ['inventory.view'] } }] });
await owner('/tenants/' + tid + '/users', { user: { name: 'Stan Stock', email: 'stan@test.rx', role: 'stockonly', password: 'stan-pass-1234' } });
await owner('/tenants/' + tid + '/users', { user: { name: 'Cax Cashier', email: 'cax@test.rx', role: 'cashier', password: 'cax-pass-1234' } });
const login = (e, pw) => api('/api/login', { email: e, password: pw, tenant: slug });
const alTok = (await login('al@test.rx', 'al-pass-1234')).token;      // admin: everything
const stanTok = (await login('stan@test.rx', 'stan-pass-1234')).token; // inventory.view only
const caxTok = (await login('cax@test.rx', 'cax-pass-1234')).token;    // pos.sell, no reminders
check('all three sign in', !!alTok && !!stanTok && !!caxTok);

// ----- payments need pos.sell -----
let r = await api('/api/pay/request', { provider: 'mtn', amount: 1000, phone: '0770000000' }, stanTok);
check('1.9 a user without pos.sell cannot request a payment', r.status === 403, r.status + ' ' + (r.error || ''));
r = await api('/api/pay/request', { provider: 'mtn', amount: 1000, phone: '0770000000' }, caxTok);
check('1.9 a seller passes the permission gate (provider just not set up here)', r.status !== 403, r.status + ' ' + (r.error || ''));
r = await api('/api/pay/status?provider=mtn&ref=x', null, stanTok);
check('1.9 payment status also needs pos.sell', r.status === 403, r.status);

// ----- SMS needs reminders -----
r = await api('/api/sms', { to: '0770000000', text: 'hi' }, stanTok);
check('1.9 a user without reminders cannot send SMS', r.status === 403, r.status);
r = await api('/api/sms', { to: '0770000000', text: 'hi' }, caxTok);
check('1.9 a cashier (no reminders permission) cannot send SMS either', r.status === 403, r.status);
r = await api('/api/sms', { to: '0770000000', text: 'hi' }, alTok);
check('1.9 an admin passes the SMS gate (send then fails only because SMS is not set up)', r.status !== 403, r.status + ' ' + (r.error || ''));

await owner('/tenants/' + tid + '/delete', { confirm: slug });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

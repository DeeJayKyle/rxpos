// Main-page sign-in (no pharmacy chosen) looks a user up across every tenant. That lookup must stay cheap as the
// records table grows — it is backed by the partial index records_users (worker/index.js ensureSchema). This checks
// the cross-tenant login path still works: an email at several pharmacies is offered the choices once the password is
// right (and nothing is revealed when it is wrong), and a unique email signs straight in — with lots of non-user
// records present so the path is not trivially small.
//   node v48-login-scale.mjs <base> <ownerKey>
const [base, ownerKey] = process.argv.slice(2);
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + String(x).slice(0, 200) : ''}`); };
const owner = (p, body) => fetch(base + '/api/owner' + p, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ownerKey }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());
const login = (body) => fetch(base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, j: await r.json().catch(() => ({})) }));

const SHARED = 'shared@test.rx', PW = 'shared-pass-1234';
// three pharmacies that all have a user with the same email, plus one more where the email is unique
for (const x of (await owner('/tenants')).tenants || []) if (/^Scale Pharmacy [A-D]$/.test(x.name)) await owner('/tenants/' + x.id + '/delete', { confirm: x.slug });
const mk = (letter, email) => owner('/tenants', { name: 'Scale Pharmacy ' + letter, admin: { name: 'Admin ' + letter, email, password: PW } });
const A = await mk('A', SHARED), B = await mk('B', SHARED), C = await mk('C', SHARED), D = await mk('D', 'solo@test.rx');

// bulk non-user records so the table is not just a few rows (the whole point of the index is many non-user rows)
const bulk = [];
for (let i = 0; i < 400; i++) bulk.push({ t: 'products', id: 'bulk' + i, rec: { id: 'bulk' + i, name: 'Filler ' + i, price: 100 + i } });
for (const t of [A, B, C]) await owner('/tenants/' + t.tenant.id + '/records', { records: bulk });

// 1) email at three pharmacies, right password, no tenant → offered exactly those three, nothing leaked before
const good = await login({ email: SHARED, password: PW });
check('an email at several pharmacies is offered the choices', good.status === 200 && Array.isArray(good.j.choose) && good.j.choose.length === 3, JSON.stringify(good.j).slice(0, 160));
check('the choices are the three real pharmacies', (good.j.choose || []).map((c) => c.name).sort().join(',') === 'Scale Pharmacy A,Scale Pharmacy B,Scale Pharmacy C', JSON.stringify((good.j.choose || []).map((c) => c.name)));

// 2) wrong password, no tenant → no pharmacies revealed, no token
const bad = await login({ email: SHARED, password: 'the-wrong-password' });
check('a wrong password reveals no pharmacies', !bad.j.choose && !bad.j.token, JSON.stringify(bad.j).slice(0, 160));
check('…and is reported as wrong (not a timeout/500)', bad.status === 401 || bad.status === 429, String(bad.status));

// 3) unique email, right password, no tenant → straight in with a token
const solo = await login({ email: 'solo@test.rx', password: PW });
check('a unique email signs straight in without choosing', solo.status === 200 && !!solo.j.token && solo.j.slug === D.tenant.slug, JSON.stringify(solo.j).slice(0, 160));

// 4) the whole cross-tenant lookup is well under the server's 15s DB timeout (a full-scan regression would blow this)
const t0 = Date.now();
await login({ email: SHARED, password: PW });
const ms = Date.now() - t0;
check('the cross-tenant lookup is fast (no full-table scan)', ms < 8000, ms + ' ms');

for (const t of [A, B, C, D]) await owner('/tenants/' + t.tenant.id + '/delete', { confirm: t.tenant.slug });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

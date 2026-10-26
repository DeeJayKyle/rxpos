// Sync protocol 2 on the cloud (worker/index.js): op ids are applied once, protocol 1 clients keep working, refused
// changes are reported by key, malformed requests are refused, the cursor is server-issued.
//   node v38-sync-protocol.mjs <base> <ownerKey>
const [base, ownerKey] = process.argv.slice(2);
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + String(x).slice(0, 240) : ''}`); };
const owner = (p, body) => fetch(base + '/api/owner' + p, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ownerKey }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());
const post = (path, token, body) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, j: await r.json().catch(() => ({})) }));

const t = await owner('/tenants', { name: 'Protocol Sample Pharmacy', admin: { name: 'Pat Sample', email: 'pat@test.rx', password: 'pat-pass-12345' } });
const tid = t.tenant.id, slug = t.tenant.slug;
await owner('/tenants/' + tid + '/users', { user: { name: 'Cass Cashier', email: 'cass@test.rx', role: 'cashier', password: 'cass-pass-1234' } });
const admin = (await post('/api/login', null, { email: 'pat@test.rx', password: 'pat-pass-12345', tenant: slug })).j.token;
const cashier = (await post('/api/login', null, { email: 'cass@test.rx', password: 'cass-pass-1234', tenant: slug })).j.token;
check('sign-in tokens issued', !!admin && !!cashier);
const now = (ms = 0) => new Date(Date.now() + ms).toISOString();
const sync = (token, changes, extra = {}) => post('/api/sync', token, { deviceId: 'proto-dev', since: 0, changes, v: 2, ...extra });
const product = async (id) => (await owner(`/tenants/${tid}/records?t=products&q=${id}`)).rows?.[0]?.rec;

// ---- op ids: a repeat is applied once, even if its content differs ----
let r = await sync(admin, [{ t: 'products', id: 'px1', rec: { id: 'px1', name: 'First Version' }, at: now(), op: 'op-px1-1' }]);
check('protocol 2 request is accepted and says so', r.status === 200 && r.j.protocol === 2 && r.j.applied === 1 && r.j.dupes === 0, JSON.stringify({ applied: r.j.applied, dupes: r.j.dupes, protocol: r.j.protocol }));
r = await sync(admin, [{ t: 'products', id: 'px1', rec: { id: 'px1', name: 'Should Not Apply' }, at: now(1000), op: 'op-px1-1' }]);
check('the same op sent again is skipped as a repeat', r.j.dupes === 1 && r.j.applied === 0, JSON.stringify({ applied: r.j.applied, dupes: r.j.dupes }));
check('…and the record keeps the first version', (await product('px1'))?.name === 'First Version', (await product('px1'))?.name);
r = await sync(admin, [{ t: 'products', id: 'px1', rec: { id: 'px1', name: 'Second Edit' }, at: now(2000), op: 'op-px1-2' }]);
check('a new op for the same record is applied (last writer wins)', r.j.applied === 1 && (await product('px1'))?.name === 'Second Edit');

// ---- one request is one transaction: a sale and its movements land together ----
r = await sync(admin, [
  { t: 'sales', id: 'sx1', rec: { id: 'sx1', number: 'RPROTO1', total: 500, items: [] }, at: now(), op: 'op-sx1' },
  { t: 'movements', id: 'mx1', rec: { id: 'mx1', productId: 'px1', qty: -1, type: 'Sale', ref: 'RPROTO1' }, at: now(), op: 'op-mx1' },
]);
check('a sale and its stock movement are applied together', r.j.applied === 2);
r = await sync(admin, [{ t: 'movements', id: 'mx1', rec: { id: 'mx1', productId: 'px1', qty: -99, type: 'Sale', ref: 'RPROTO1' }, at: now(5000), op: 'op-mx1-again' }]);
check('a stock movement can never be overwritten (append-only), even with a new op', r.j.applied === 0 && (await owner(`/tenants/${tid}/records?t=movements&q=RPROTO1`)).rows?.[0]?.rec.qty === -1);

// ---- refused changes are reported by key; the rest of the request still applies ----
r = await sync(cashier, [
  { t: 'users', id: 'u-evil', rec: { id: 'u-evil', name: 'Made Up Admin', role: 'admin' }, at: now(), op: 'op-evil' },
  { t: 'sales', id: 'sx2', rec: { id: 'sx2', number: 'RPROTO2', total: 100, items: [] }, at: now(), op: 'op-sx2' },
]);
check('a cashier cannot create users: refused, and reported by key', r.j.refused === 1 && (r.j.refusedKeys || []).includes('users|u-evil'), JSON.stringify(r.j.refusedKeys));
check('…while their sale in the same request is applied', (await owner(`/tenants/${tid}/records?t=sales&q=RPROTO2`)).total === 1);

// ---- protocol 1 (no op, no v) still works during the rollout ----
r = await post('/api/sync', admin, { deviceId: 'old-dev', since: 0, changes: [{ t: 'products', id: 'px2', rec: { id: 'px2', name: 'From an older app' }, at: now() }] });
check('an older app (protocol 1) can still sync', r.status === 200 && r.j.applied === 1);

// ---- malformed requests, cursors, sign-in ----
r = await post('/api/sync', admin, { deviceId: 'proto-dev', since: 0, changes: 'not a list' });
check('a malformed request is refused with a reason', r.status === 400 && /list/.test(r.j.error || ''), JSON.stringify(r.j));
r = await sync('u.not-a-real-token', []);
check('an expired or forged sign-in gets 401 (the device asks to sign in again)', r.status === 401);
const a = await sync(admin, []), c = await sync(admin, [], { since: a.j.cursor });
check('the cursor is the cloud\'s own sequence: asking after it returns only newer records', Number.isFinite(a.j.cursor) && c.j.changes.length === 0 && c.j.cursor >= a.j.cursor, `${a.j.cursor} → ${c.j.cursor}, ${c.j.changes.length} changes`);

await owner('/tenants/' + tid + '/delete', { confirm: slug });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

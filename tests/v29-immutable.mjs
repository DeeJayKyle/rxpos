// Append-only tables and server-stamped audit (review Phase 1.1): a device cannot rewrite or erase an audit line,
// a stock movement or a controlled-drug entry, and the audit actor/time come from the server, not the client.
//   node v29-immutable.mjs <base> <ownerKey>
const [base, ownerKey] = process.argv.slice(2);
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + String(x).slice(0, 180) : ''}`); };
const owner = (p, body) => fetch(base + '/api/owner' + p, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ownerKey }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());
const api = (p, body, token) => fetch(base + p, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined }).then(async (r) => ({ status: r.status, ...(await r.json().catch(() => ({}))) }));
const now = () => new Date().toISOString();
const later = (ms) => new Date(Date.now() + ms).toISOString();
const push = (token, deviceId, changes) => api('/api/sync', { deviceId, since: 0, changes }, token);
const pullAll = async (token, deviceId) => (await push(token, deviceId, [])).changes || [];

const t = await owner('/tenants', { name: 'Immutable Pharmacy', admin: { name: 'Al Admin', email: 'al@test.rx', password: 'al-pass-1234' } });
const tid = t.tenant.id, slug = t.tenant.slug;
await owner('/tenants/' + tid + '/users', { user: { name: 'Cax Cashier', email: 'cax@test.rx', role: 'cashier', password: 'cax-pass-1234' } });
const caxTok = (await api('/api/login', { email: 'cax@test.rx', password: 'cax-pass-1234', tenant: slug })).token;
check('cashier signs in', !!caxTok);

// ----- movements are append-only -----
let r = await push(caxTok, 'dev-cax', [{ t: 'movements', id: 'm1', at: now(), rec: { id: 'm1', productId: 'p1', qty: 10, type: 'Sale' } }]);
check('a new movement is accepted', r.applied === 1, JSON.stringify({ a: r.applied, ref: r.refused }));
r = await push(caxTok, 'dev-cax', [{ t: 'movements', id: 'm1', at: later(60000), rec: { id: 'm1', productId: 'p1', qty: 999, type: 'Sale' } }]);
check('1.1 overwriting a movement does not change it (no-op)', r.applied === 0, JSON.stringify({ a: r.applied, ref: r.refused }));
r = await push(caxTok, 'dev-cax', [{ t: 'movements', id: 'm1', at: later(120000), deleted: true }]);
check('1.1 deleting a movement is refused', r.applied === 0 && r.refused === 1);
let rows = await pullAll(caxTok, 'dev-other');
let m1 = rows.find((x) => x.t === 'movements' && x.id === 'm1');
check('1.1 the movement keeps its original value and still exists', m1 && !m1.deleted && m1.rec.qty === 10, JSON.stringify(m1));

// ----- audit is append-only and server-stamped -----
r = await push(caxTok, 'dev-cax', [{ t: 'audit', id: 'a1', at: now(), rec: { id: 'a1', user: 'SOMEONE ELSE', date: '2000-01-01T00:00:00.000Z', action: 'Sale', details: 'x' } }]);
check('a new audit line is accepted', r.applied === 1);
rows = await pullAll(caxTok, 'dev-other2');
const a1 = rows.find((x) => x.t === 'audit' && x.id === 'a1');
check('1.1 the audit actor is stamped from the signed-in user, not the client', a1 && a1.rec.user === 'Cax Cashier', JSON.stringify(a1?.rec));
check('1.1 the audit time is the server’s, not the client’s back-dated value', a1 && !a1.rec.date.startsWith('2000'), a1?.rec?.date);
r = await push(caxTok, 'dev-cax', [{ t: 'audit', id: 'a1', at: later(60000), rec: { id: 'a1', action: 'Tampered' } }]);
check('1.1 overwriting an audit line does not change it (no-op)', r.applied === 0);
rows = await pullAll(caxTok, 'dev-other3');
const a1b = rows.find((x) => x.t === 'audit' && x.id === 'a1');
check('1.1 the audit line keeps its original action', a1b && a1b.rec.action === 'Sale', JSON.stringify(a1b?.rec));

// ----- oversized record is rejected -----
const huge = 'x'.repeat(300 * 1024);
r = await push(caxTok, 'dev-cax', [{ t: 'customers', id: 'big', at: now(), rec: { id: 'big', name: huge } }]);
check('1.1 an oversized record is refused', r.applied === 0 && r.refused === 1, JSON.stringify({ a: r.applied, ref: r.refused }));

// a normal (mutable) record is unaffected: customers can still be edited
r = await push(caxTok, 'dev-cax', [{ t: 'customers', id: 'c1', at: now(), rec: { id: 'c1', name: 'Jane' } }]);
r = await push(caxTok, 'dev-cax', [{ t: 'customers', id: 'c1', at: later(60000), rec: { id: 'c1', name: 'Jane Doe' } }]);
check('a mutable record (customer) can still be updated', r.applied === 1, JSON.stringify({ a: r.applied, ref: r.refused }));

// ----- 1.3 a wild/future device clock is clamped to server time -----
r = await push(caxTok, 'dev-cax', [{ t: 'customers', id: 'future', at: '2099-01-01T00:00:00.000Z', rec: { id: 'future', name: 'Future' } }]);
check('a future-dated record is accepted', r.applied === 1);
rows = await pullAll(caxTok, 'dev-clock');
const fut = rows.find((x) => x.t === 'customers' && x.id === 'future');
check('1.3 the stored timestamp is clamped to about now, not the year 2099', fut && new Date(fut.at).getFullYear() <= new Date().getFullYear() + 1, fut?.at);

await owner('/tenants/' + tid + '/delete', { confirm: slug });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

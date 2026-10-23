// Restore bumps the database epoch so devices re-pull (review Phase 1.4). A restore reinserts rows with their old
// sequence numbers, below device cursors; the epoch change is how a device knows to reset its cursor and re-merge.
//   node v31-restore.mjs <base> <ownerKey>
const [base, ownerKey] = process.argv.slice(2);
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + String(x).slice(0, 180) : ''}`); };
const owner = (p, body) => fetch(base + '/api/owner' + p, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ownerKey }, body: body ? JSON.stringify(body) : undefined }).then(async (r) => ({ status: r.status, ...(await r.json().catch(() => ({})) ) }));
const api = (p, body, token) => fetch(base + p, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined }).then(async (r) => ({ status: r.status, ...(await r.json().catch(() => ({})) ) }));
const now = () => new Date().toISOString();
const sync = (token, deviceId, since, changes = []) => api('/api/sync', { deviceId, since, changes }, token);

const t = await owner('/tenants', { name: 'Restore Pharmacy', admin: { name: 'Al Admin', email: 'al@test.rx', password: 'al-pass-1234' } });
const tid = t.tenant.id, slug = t.tenant.slug;
const alTok = (await api('/api/login', { email: 'al@test.rx', password: 'al-pass-1234', tenant: slug })).token;

// push two records so the max sequence is well above 1
let r = await sync(alTok, 'devA', 0, [{ t: 'customers', id: 'c1', at: now(), rec: { id: 'c1', name: 'One' } }]);
r = await sync(alTok, 'devA', r.cursor, [{ t: 'customers', id: 'c2', at: now(), rec: { id: 'c2', name: 'Two' } }]);
const cursor = r.cursor;
const epoch0 = r.epoch;
check('sync returns a database epoch', epoch0 !== undefined, JSON.stringify({ epoch0, cursor }));

// a restore reinserts an old row with a LOW sequence number (as worker/backup.js does)
const restore = await api('/api/owner/restore', { confirm: 'RESTORE', part: 'records', rows: [
  { tenant: tid, k: 'customers|old', t: 'customers', id: 'old', rec: JSON.stringify({ id: 'old', name: 'Restored' }), deleted: 0, at: '2026-01-01T00:00:00.000Z', seq: 1, origin: null },
] }, ownerKey);
check('the restore is accepted', restore.ok === true || restore.restored >= 1, JSON.stringify(restore));

// a device already caught up (since = cursor) does NOT see the restored row by sequence number — this is the bug
r = await sync(alTok, 'devB-caughtup', cursor, []);
const sawByCursor = (r.changes || []).some((c) => c.id === 'old');
check('1.4 the restored row is invisible by sequence number (below the cursor)', !sawByCursor);

// …but the epoch changed, which is the device's signal to reset its cursor and re-pull
check('1.4 the epoch changes after a restore', r.epoch !== undefined && r.epoch !== epoch0, JSON.stringify({ before: epoch0, after: r.epoch }));

// re-pulling from the start (what the client does on an epoch change) returns the restored row
r = await sync(alTok, 'devB-reset', 0, []);
check('1.4 re-pulling from the start returns the restored row', (r.changes || []).some((c) => c.id === 'old'));

await owner('/tenants/' + tid + '/delete', { confirm: slug });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

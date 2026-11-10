// Cloud counters (workplan step 15): devices pushing at the same time while another downloads lose nothing and get
// nothing twice; each pharmacy's record count is cached (a push no longer reads all its rows) and stays right.
//   node v62-counters.mjs <base> <ownerKey>
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
const [base, ownerKey] = process.argv.slice(2);
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + String(x).slice(0, 200) : ''}`); };
const owner = (p, body) => fetch(base + '/api/owner' + p, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ownerKey }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());
const api = (p, body, token) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, ...(await r.json().catch(() => ({}))) }));

const T = await owner('/tenants', { name: 'Counter Pharmacy', admin: { name: 'Cy Admin', email: 'cy@count.rx', password: 'cy-pass-1234' } });
const tid = T.tenant.id, slug = T.tenant.slug;
const tok = (await api('/api/login', { email: 'cy@count.rx', password: 'cy-pass-1234', tenant: slug })).token;
const push = (deviceId, changes, since = 0) => api('/api/sync', { v: 2, deviceId, since, changes }, tok);
const now = () => new Date().toISOString();
const customers = (dev, round, n) => Array.from({ length: n }, (_, i) => ({ op: crypto.randomUUID(), t: 'customers', id: `${dev}-${round}-${i}`, at: now(), rec: { name: `Client ${dev} ${round} ${i}` } }));

// a downloading device C keeps its cursor while A and B push at the same time
const got = new Map(); // id → times received
let cursor = 0;
const pull = async () => {
  for (;;) {
    const r = await push('dev-c', [], cursor);
    for (const c of r.changes || []) if (c.t === 'customers') got.set(c.id, (got.get(c.id) || 0) + 1);
    const seqs = (r.changes || []).length;
    cursor = r.cursor;
    if (!r.more) return seqs;
  }
};
for (let round = 0; round < 10; round++) {
  const [a, b] = await Promise.all([push('dev-a', customers('a', round, 50)), push('dev-b', customers('b', round, 50)), pull()]);
  if (a.applied !== 50 || b.applied !== 50) check(`round ${round}: both pushes applied`, false, JSON.stringify([a.applied, b.applied]));
}
await pull();
const ids = [...got.keys()].filter((id) => /^[ab]-/.test(id));
check('two devices pushing at once while a third downloads: all 1,000 arrive', ids.length === 1000, ids.length);
check('…none twice', [...got.values()].every((n) => n === 1), JSON.stringify([...got.entries()].filter(([, n]) => n > 1).slice(0, 3)));

// the cached count, read straight from the local cloud's database
const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(here, '.state', 'v3', 'd1', 'miniflare-D1DatabaseObject');
const file = fs.readdirSync(dir).filter((f) => f.endsWith('.sqlite') && f !== 'metadata.sqlite').map((f) => path.join(dir, f))[0];
const read = (sql, ...a) => { const db = new DatabaseSync(file, { readOnly: true }); try { return db.prepare(sql).get(...a); } finally { db.close(); } };
const cached = read('SELECT n, at FROM tenant_counts WHERE tenant = ?', tid);
const real = read('SELECT COUNT(*) n FROM records WHERE tenant = ?', tid).n;
check('the pharmacy\'s record count is cached and right', cached?.n === real, JSON.stringify({ cached, real }));
await push('dev-a', customers('a', 99, 5));
const after = read('SELECT n, at FROM tenant_counts WHERE tenant = ?', tid);
check('the next push adds to it without counting again', after.n === real + 5 && after.at === cached.at, JSON.stringify(after));
await push('dev-a', customers('a', 99, 5).map((c) => ({ ...c, op: crypto.randomUUID() }))); // the same 5 clients again: updates, not new
const upd = read('SELECT n FROM tenant_counts WHERE tenant = ?', tid).n;
check('an update counted as new only makes the count high (corrected by the hourly count)', upd >= real + 5, upd);

await owner('/tenants/' + tid + '/delete', { confirm: slug });
check('deleting the pharmacy removes its count', !read('SELECT n FROM tenant_counts WHERE tenant = ?', tid));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

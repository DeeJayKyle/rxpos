// Field-by-field merge in the cloud (workplan step 14): two devices editing different fields of the same medicine both
// keep their change, each device downloads the merged copy, an older app (no field times) never erases a field it does
// not know, and a field clock running ahead is capped.   node v61-field-merge.mjs <base> <ownerKey>
import { stampFields } from '../src/fieldmerge.js';
const [base, ownerKey] = process.argv.slice(2);
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + String(x).slice(0, 220) : ''}`); };
const owner = (p, body) => fetch(base + '/api/owner' + p, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ownerKey }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());
const api = (p, body, token) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, ...(await r.json().catch(() => ({}))) }));
const push = (tok, deviceId, rec, at, since = 0) => api('/api/sync', { v: 2, deviceId, since, changes: rec ? [{ op: crypto.randomUUID(), t: 'products', id: rec.id, rec, at }] : [] }, tok);
const cloud = async () => (await owner(`/tenants/${tid}/records?t=products`)).rows?.find((r) => r.id === 'p1')?.rec;
const ago = (min) => new Date(Date.now() - min * 60000).toISOString();

const T = await owner('/tenants', { name: 'Merge Pharmacy', admin: { name: 'Mia Admin', email: 'mia@merge.rx', password: 'mia-pass-1234' } });
const tid = T.tenant.id, slug = T.tenant.slug;
const tok = (await api('/api/login', { email: 'mia@merge.rx', password: 'mia-pass-1234', tenant: slug })).token;

const v0 = { id: 'p1', name: 'Merge Tabs', price: 1000, reorder: 10, shelf: 'A3' };
const t0 = ago(30), tA = ago(20), tB = ago(10);
await push(tok, 'dev-a', { ...v0, updatedAt: t0 }, t0);
const base0 = { ...v0, updatedAt: t0 };
// device A changes the price, device B (from the same starting copy, later) the reorder level
const a = stampFields(base0, { ...base0, price: 1200 }, tA);
const b = stampFields(base0, { ...base0, reorder: 25 }, tB);
await push(tok, 'dev-a', a, tA);
let r = await push(tok, 'dev-b', b, tB);
let c = await cloud();
check('both edits survive in the cloud (price from A, reorder level from B)', c?.price === 1200 && c?.reorder === 25, JSON.stringify(c));
const pulledB = (r.changes || []).find((x) => x.id === 'p1');
check('device B downloads the merged copy straight away (it differs from what B sent)', pulledB?.rec?.price === 1200 && pulledB.rec.reorder === 25, JSON.stringify(pulledB?.rec));
r = await push(tok, 'dev-a', null, null);
const pulledA = (r.changes || []).find((x) => x.id === 'p1');
check('device A downloads it too', pulledA?.rec?.reorder === 25 && pulledA.rec.price === 1200);

// device B, late, still holding the old price, saves an unrelated field: the newer price stays
const b2 = stampFields(b, { ...b, name: 'Merge Tabs 500mg' }, ago(5));
await push(tok, 'dev-b', b2, ago(5));
c = await cloud();
check('a stale copy changing another field does not bring the old price back', c?.price === 1200 && c?.name === 'Merge Tabs 500mg' && c?.reorder === 25, JSON.stringify(c));

// an older app: whole record, no field times, without a field it does not know
const old = { id: 'p1', name: 'Merge Tabs 500mg', price: 1300, reorder: 25, updatedAt: ago(2) };
await push(tok, 'dev-old', old, ago(2));
c = await cloud();
check('an older app\'s newer price applies…', c?.price === 1300);
check('…and the shelf it does not know is kept', c?.shelf === 'A3', JSON.stringify(c));

// a field time far in the future is capped, so a later normal edit still wins
const future = { ...c, price: 1, _f: { ...(c._f || {}), shelf: '2099-01-01T00:00:00.000Z' }, shelf: 'Z9', updatedAt: ago(1) };
await push(tok, 'dev-clock', future, ago(1));
await push(tok, 'dev-a', stampFields(await cloud(), { ...(await cloud()), shelf: 'B1' }, new Date().toISOString()), new Date().toISOString());
c = await cloud();
check('a field clock running ahead is capped: a later edit still wins', c?.shelf === 'B1', JSON.stringify(c));

// deleting still works for the whole record
await api('/api/sync', { v: 2, deviceId: 'dev-a', since: 0, changes: [{ op: crypto.randomUUID(), t: 'products', id: 'p1', deleted: true, at: new Date(Date.now() + 1000).toISOString() }] }, tok);
check('a delete removes the medicine as before', !(await cloud()));

await owner('/tenants/' + tid + '/delete', { confirm: slug });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

// Daily stock sheet link, end to end on the local cloud (fictional pharmacy): an administrator creates the link,
// the CSV has the day's figures worked out from what the devices sent, a cashier can't see or change the link, a
// wrong key gets nothing, and making a new link stops the old one.
//   node v46-daily-stock.mjs <base> <ownerKey>
import assert from 'node:assert/strict';
const [base, ownerKey] = process.argv.slice(2);
let passed = 0;
const ok = (n) => { passed++; console.log('PASS ', n); };
const req = async (path, { body, token, method } = {}) => { const r = await fetch(/^https?:/.test(path) ? path : base + path, { method: method || (body ? 'POST' : 'GET'), headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined }); const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* csv */ } return { status: r.status, text, json }; };
const owner = (p, body) => req('/api/owner' + p, { body, token: ownerKey });

for (const x of (await owner('/tenants')).json.tenants || []) if (x.name === 'Daily Sheet Sample Pharmacy') await owner('/tenants/' + x.id + '/delete', { confirm: x.slug });
const T = (await owner('/tenants', { name: 'Daily Sheet Sample Pharmacy', admin: { name: 'Dee Admin', email: 'dee@test.rx', password: 'dee-pass-1234' } })).json;
const id = T.tenant.id;
await owner('/tenants/' + id + '/users', { user: { name: 'Cas Cashier', email: 'cas@test.rx', role: 'cashier', password: 'cas-pass-1234' } });
const login = async (email, password) => (await req('/api/login', { body: { email, password, tenant: id } })).json.token;
const admin = await login('dee@test.rx', 'dee-pass-1234'), cashier = await login('cas@test.rx', 'cas-pass-1234');

// a device sends: stock loaded yesterday, today a sale and an expense (dates in Uganda time)
const ug = (dayOffset, h) => { const d = new Date(Date.now() + 3 * 3600e3); d.setUTCDate(d.getUTCDate() + dayOffset); d.setUTCHours(h, 0, 0, 0); return new Date(d.getTime() - 3 * 3600e3).toISOString(); };
const today = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
const at = new Date().toISOString();
const ch = (t, rec) => ({ t, id: rec.id, rec, at, op: crypto.randomUUID() });
const r = await req('/api/sync', { token: admin, body: { deviceId: 'till-1', since: 0, v: 2, changes: [
  ch('products', { id: 'ds-p', name: 'Sample Tabs', cost: 200, price: 500 }),
  ch('batches', { id: 'ds-b', productId: 'ds-p', batch: 'S1', expiry: '2030-01-01', cost: 200 }),
  ch('movements', { id: 'ds-m1', productId: 'ds-p', batchId: 'ds-b', qty: 50, type: 'Opening stock', date: ug(-1, 10), branchId: 'main' }),
  ch('movements', { id: 'ds-m2', productId: 'ds-p', batchId: 'ds-b', qty: -4, type: 'Sale', date: ug(0, 9), branchId: 'main', ref: 'R1' }),
  ch('sales', { id: 'ds-s1', number: 'R1', date: ug(0, 9), total: 2000, status: 'completed', items: [{ id: 'ds-p', qty: 4, cost: 200, price: 500 }] }),
  ch('expenses', { id: 'ds-e1', date: today, amount: 15000, category: 'Transport' }),
] } });
assert.equal(r.json.refused, 0); ok('a device\'s day reaches the cloud');

let x = await req('/api/daily-stock-link', { token: cashier });
assert.equal(x.status, 403); ok('a cashier cannot see the link');
x = await req('/api/daily-stock-link', { token: admin });
assert.equal(x.json.url, null); ok('no link until an administrator creates one');
x = await req('/api/daily-stock-link', { token: admin, body: {} });
const link = x.json.url;
assert.match(link, /^https:\/\/api\.rxposug\.com\/api\/daily-stock\/[a-z0-9-]+\/[A-Za-z0-9_-]{24,}\.csv$/); ok('an administrator creates the link');
const local = link.replace('https://api.rxposug.com', base);
x = await req(local.replace('.csv', '') + '.csv');
assert.equal(x.status, 200);
const lines = x.text.trim().split('\n');
assert.match(lines[0], /^Date,Day,Sales,Opening stock value,Purchases \(stock added at cost\),Closing stock value,Cost of stock sold,Profit,Expenses,Other stock changes,Number of sales$/);
const last = lines.at(-1).split(','), prev = lines.at(-2).split(',');
assert.equal(last[0], today);
assert.deepEqual(last.slice(2), ['2000', '10000', '0', '9200', '800', '1200', '15000', '0', '1']); ok('today: sales, opening, cost of stock sold, profit, expenses, closing');
assert.equal(prev[5], '10000'); assert.equal(prev[9], '-10000'); ok('yesterday: stock loaded shows as Other, closing 10,000');
assert.equal(lines.length - 1, 62); ok('62 days by default');
x = await req(local.replace(/\/[A-Za-z0-9_-]+\.csv$/, '/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA.csv'));
assert.equal(x.status, 404); ok('a wrong key gets nothing');
x = await req('/api/daily-stock-link', { token: admin, body: {} });
assert.notEqual(x.json.url, link);
assert.equal((await req(local)).status, 404); ok('a new link stops the old one');
assert.equal((await req(x.json.url.replace('https://api.rxposug.com', base))).status, 200); ok('…and the new one works');
await owner('/tenants/' + id + '/delete', { confirm: T.tenant.slug });
console.log(`\n${passed} passed, 0 failed`);

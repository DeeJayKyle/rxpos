// Faster sync, stage 4 (docs/SYNC-HISTORY-WINDOW.md) on the cloud: brought-forward figures (worker/window.js) are
// exactly the app's own rules (src/balances.js) for the entries before the window; a full download with a window
// sends what a device keeps (src/historywindow.js: recent records, records with an entry since, open items) and
// leaves the rest in the cloud; /api/history gives the older records of a table for a page, with the role rules of
// sync. Runs on the cloud and the hub.   node v73-window.mjs <base> <ownerKey>
import { broughtForward } from '../src/balances.js';
const [base, ownerKey] = process.argv.slice(2);
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + String(x).slice(0, 240) : ''}`); };
const owner = (p, body) => fetch(base + '/api/owner' + p, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ownerKey }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());
const post = (path, token, body) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, j: await r.json().catch(() => ({})) }));

const t = await owner('/tenants', { name: 'Window Sample Pharmacy', admin: { name: 'Wanda Sample', email: 'wanda@test.rx', password: 'wanda-pass-12345' } });
const tid = t.tenant.id, slug = t.tenant.slug;
await owner('/tenants/' + tid + '/users', { user: { name: 'Cass Cashier', email: 'wcass@test.rx', role: 'cashier', password: 'cass-pass-1234' } });
const W = '2026-01-01';
const recs = [
  { t: 'products', id: 'w-p1', rec: { name: 'Sample Tabs', price: 500 } },
  { t: 'customers', id: 'w-c1', rec: { name: 'Sample Client' } },
  { t: 'suppliers', id: 'w-s1', rec: { name: 'Sample Supplier' } },
  { t: 'movements', id: 'w-m-old', rec: { productId: 'w-p1', batchId: 'w-b1', qty: 100, type: 'Opening stock', date: '2025-02-01T08:00:00.000Z', branchId: 'main' } },
  { t: 'movements', id: 'w-m-old2', rec: { productId: 'w-p1', batchId: 'w-b1', qty: -30, type: 'Sale', date: '2025-06-01T08:00:00.000Z', branchId: 'main' } },
  { t: 'movements', id: 'w-m-new', rec: { productId: 'w-p1', batchId: 'w-b1', qty: -5, type: 'Sale', date: '2026-02-01T08:00:00.000Z', branchId: 'main' } },
  { t: 'sales', id: 'w-s-cash', rec: { number: 'R1', date: '2025-03-01T08:00:00.000Z', total: 1000, paid: 1000, customerId: 'walk-in', items: [], status: 'completed' } },
  { t: 'sales', id: 'w-s-credit', rec: { number: 'R2', date: '2025-04-01T08:00:00.000Z', total: 3000, paid: 1000, customerId: 'w-c1', items: [], status: 'completed' } },
  { t: 'sales', id: 'w-s-refunded', rec: { number: 'R3', date: '2025-05-01T08:00:00.000Z', total: 800, paid: 800, customerId: 'walk-in', items: [], status: 'refunded', refundedAt: '2026-03-01T08:00:00.000Z', bankId: 'momo' } },
  { t: 'sales', id: 'w-s-new', rec: { number: 'R4', date: '2026-04-01T08:00:00.000Z', total: 700, paid: 700, customerId: 'walk-in', items: [], status: 'completed' } },
  { t: 'payments', id: 'w-pay-old', rec: { kind: 'customer', partyId: 'w-c1', amount: 500, date: '2025-08-01T08:00:00.000Z' } },
  { t: 'purchases', id: 'w-pu-old', rec: { supplierId: 'w-s1', total: 5000, paid: 2000, date: '2025-02-10T08:00:00.000Z' } },
  { t: 'expenses', id: 'w-e-old', rec: { amount: 400, date: '2025-07-01T08:00:00.000Z' } },
  { t: 'audit', id: 'w-a-old', rec: { action: 'Sample', date: '2025-07-01T08:00:00.000Z' } },
  { t: 'salaryAdvances', id: 'w-adv', rec: { employeeId: 'e1', amount: 1000, date: '2025-07-01' } },
];
await owner(`/tenants/${tid}/records`, { records: recs });
const login = async (email, password) => (await post('/api/login', null, { email, password, tenant: slug })).j.token;
const admin = await login('wanda@test.rx', 'wanda-pass-12345'), cashier = await login('wcass@test.rx', 'cass-pass-1234');

// brought-forward figures = the app's own rules on the same records
const bf = await post('/api/balances', admin, { window: W });
check('the cloud gives brought-forward figures for a window', bf.status === 200 && bf.j.W === W && Array.isArray(bf.j.stock), bf.status);
const local = broughtForward(Object.fromEntries(['movements', 'sales', 'purchases', 'supplierReturns', 'expenses', 'payments', 'loans', 'bankTx'].map((x) => [x, recs.filter((r) => r.t === x).map((r) => ({ id: r.id, ...r.rec }))])), W);
check('stock brought forward per branch and batch = the movements before the window', bf.j.stock?.length === 1 && bf.j.stock[0].qty === 70 && bf.j.stock[0].batch === 'w-b1' && bf.j.stock[0].product === 'w-p1', JSON.stringify(bf.j.stock));
const same = (kind) => JSON.stringify(Object.fromEntries([...local[kind]].sort())) === JSON.stringify(Object.fromEntries(Object.entries(bf.j[kind] || {}).sort()));
check('what clients owe brought forward = the app\'s rules', same('customer'), JSON.stringify(bf.j.customer));
check('suppliers, insurers, loans brought forward = the app\'s rules', same('supplier') && same('insurer') && same('loan'), JSON.stringify(bf.j.supplier));
check('cash and bank accounts brought forward = the app\'s rules (an old sale refunded since: only its sale)', same('account') && bf.j.account.momo === 800, JSON.stringify(bf.j.account));
check('a window that is not a date is refused', (await post('/api/balances', admin, { window: 'soon' })).status === 400);

// a full download with the window: what a device keeps
const got = new Set();
let since = 0;
for (let n = 0; n < 20; n++) { const r = await post('/api/sync', admin, { deviceId: 'w-dev', since, changes: [], v: 2, all: true, window: W }); r.j.changes.forEach((c) => got.add(c.t + '|' + c.id)); since = r.j.cursor; if (!r.j.more) break; }
check('recent records come', got.has('movements|w-m-new') && got.has('sales|w-s-new'));
check('medicines, clients and suppliers come whatever their age', got.has('products|w-p1') && got.has('customers|w-c1') && got.has('suppliers|w-s1'));
check('open items come whatever their age (unpaid sale and purchase, an advance not yet deducted)', got.has('sales|w-s-credit') && got.has('purchases|w-pu-old') && got.has('salaryAdvances|w-adv'));
check('an old sale refunded since the window comes (its refund counts on the device)', got.has('sales|w-s-refunded'));
check('old paid sales, old movements, old payments, expenses and audit stay in the cloud', !got.has('sales|w-s-cash') && !got.has('movements|w-m-old') && !got.has('payments|w-pay-old') && !got.has('expenses|w-e-old') && !got.has('audit|w-a-old'), [...got].join(' '));

// older history for a page
const h = await post('/api/history', admin, { t: 'sales', from: '2025-01-01', to: W });
check('older sales of a date range come for a page', h.status === 200 && h.j.records.map((r) => r.id).sort().join() === 'w-s-cash,w-s-credit,w-s-refunded', JSON.stringify(h.j.records?.map((r) => r.id)));
const h2 = await post('/api/history', admin, { t: 'sales', from: '2025-04-15', to: '2025-12-31' });
check('…only that range', h2.j.records.map((r) => r.id).join() === 'w-s-refunded', JSON.stringify(h2.j.records?.map((r) => r.id)));
check('a table without older history is refused', (await post('/api/history', admin, { t: 'products', from: '2025-01-01', to: W })).status === 400);
const hr = await post('/api/history', cashier, { t: 'salaryAdvances', from: '2025-01-01', to: W });
check('payroll history stays hidden from a cashier, as in sync', hr.status === 200 && hr.j.records.length === 0);

await owner('/tenants/' + tid + '/delete', { confirm: slug });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

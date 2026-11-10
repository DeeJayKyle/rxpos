// Server write policy end to end (workplan step 2): real sign-ins pushing through /api/sync on a local cloud.
//   node v55-write-policy.mjs <base> <ownerKey>
const [base, ownerKey] = process.argv.slice(2);
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + String(x).slice(0, 180) : ''}`); };
const owner = (p, body) => fetch(base + '/api/owner' + p, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ownerKey }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());
const api = (p, body, token) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, ...(await r.json().catch(() => ({}))) }));
let n = 0;
const at = () => new Date(Date.now() + n++).toISOString();
const push = (token, changes) => api('/api/sync', { v: 2, deviceId: 'dev-' + Math.random().toString(36).slice(2), since: 0, changes: changes.map((c) => ({ op: crypto.randomUUID(), at: at(), ...c })) }, token);
const stored = async (k) => { const r = await push(alTok, []); return (r.changes || []).find((c) => c.t + '|' + c.id === k); };

const t = await owner('/tenants', { name: 'Policy Pharmacy', admin: { name: 'Al Admin', email: 'al@pol.rx', password: 'al-pass-1234' } });
const tid = t.tenant.id, slug = t.tenant.slug;
for (const [name, email, role] of [['Cas Cashier', 'cas@pol.rx', 'cashier'], ['Pam Pharmacist', 'pam@pol.rx', 'pharmacist'], ['Max Manager', 'max@pol.rx', 'manager']])
  await owner('/tenants/' + tid + '/users', { user: { name, email, role, password: email.split('@')[0] + '-pass-1234' } });
const login = async (email) => (await api('/api/login', { email, password: email.split('@')[0] + '-pass-1234', tenant: slug })).token;
const [alTok, casTok, pamTok, maxTok] = await Promise.all(['al@pol.rx', 'cas@pol.rx', 'pam@pol.rx', 'max@pol.rx'].map(login));
check('every role signs in', alTok && casTok && pamTok && maxTok);

// setup by the admin: a medicine with stock
let r = await push(alTok, [
  { t: 'products', id: 'p1', rec: { name: 'Amoxicillin 500mg', price: 1000, cost: 400 } },
  { t: 'movements', id: 'm0', rec: { productId: 'p1', qty: 50, type: 'Opening stock', branchId: 'main' } },
]);
check('the admin sets up a medicine and opening stock', r.applied === 2 && r.refused === 0, JSON.stringify(r.refusedKeys));

// a cashier's sale: the sale and its movement land together
const sale = { id: 's1', number: 'R1', type: 'retail', branchId: 'main', items: [{ id: 'p1', qty: 2, price: 1000 }], subtotal: 2000, discount: 0, tax: 0, total: 2000, paid: 2000, payment: 'Cash', customerId: 'walk-in', status: 'completed' };
r = await push(casTok, [{ t: 'sales', id: 's1', rec: sale }, { t: 'movements', id: 'm1', rec: { productId: 'p1', qty: -2, type: 'Sale', ref: 'R1', branchId: 'main' } }, { t: 'customers', id: 'c1', rec: { name: 'Ann' } }]);
check('a cashier sells (sale + movement + new client)', r.applied === 3 && r.refused === 0, JSON.stringify(r));

// what a cashier can no longer do from a device
r = await push(casTok, [{ t: 'products', id: 'p1', rec: { name: 'Amoxicillin 500mg', price: 1, cost: 400 } }]);
check('a cashier cannot change a price', r.applied === 0 && r.refusedKeys?.includes('products|p1'), JSON.stringify(r.refusedKeys));
check('…and the price is unchanged in the cloud', (await stored('products|p1'))?.rec?.price === 1000);
r = await push(casTok, [{ t: 'sales', id: 's1', rec: { ...sale, items: [{ id: 'p1', qty: 2, price: 1 }], subtotal: 2, total: 2, paid: 2 } }]);
check('a cashier cannot rewrite a past sale', r.applied === 0 && r.refused === 1);
r = await push(casTok, [{ t: 'sales', id: 's1', deleted: true }]);
check('a cashier cannot delete a sale', r.applied === 0 && r.refused === 1);
r = await push(casTok, [{ t: 'expenses', id: 'e1', rec: { amount: 90000, category: 'Fuel' } }, { t: 'bankTx', id: 'b1', rec: { amount: 1 } }]);
check('a cashier cannot add expenses or bank transactions', r.applied === 0 && r.refused === 2);
r = await push(casTok, [{ t: 'movements', id: 'm-x', rec: { productId: 'p1', qty: -10, type: 'Expired write-off', branchId: 'main' } }]);
check('a cashier cannot write stock off', r.applied === 0 && r.refused === 1);
r = await push(casTok, [{ t: 'sales', id: 's1', rec: { ...sale, receiptSent: true } }]);
check('a cashier may re-send the same sale', r.refused === 0, JSON.stringify(r));

// what a pharmacist and a manager can do
r = await push(pamTok, [{ t: 'sales', id: 's1', rec: { ...sale, status: 'refunded', refundedBy: 'Pam', refundedAt: at() } }, { t: 'movements', id: 'm2', rec: { productId: 'p1', qty: 2, type: 'Refund', ref: 'R1', branchId: 'main' } }]);
check('a pharmacist refunds a sale', r.applied === 2 && r.refused === 0, JSON.stringify(r));
r = await push(pamTok, [
  { t: 'sales', id: 's2', rec: { ...sale, id: 's2', number: 'R2' } },
  { t: 'sales', id: 's2', rec: { ...sale, id: 's2', number: 'R2', status: 'refunded' } },
]);
check('a sale made and refunded in one push is judged in order', r.applied === 2 && r.refused === 0, JSON.stringify(r));
r = await push(pamTok, [{ t: 'products', id: 'p1', rec: { name: 'Amoxicillin 500mg', price: 1200, cost: 400 } }]);
check('a pharmacist changes a price', r.applied === 1 && (await stored('products|p1'))?.rec?.price === 1200);
r = await push(maxTok, [{ t: 'sales', id: 's2', deleted: true }]);
check('a manager cannot delete a sale (admins only)', r.applied === 0 && r.refused === 1);
r = await push(maxTok, [{ t: 'expenses', id: 'e2', rec: { amount: 5000, category: 'Water' } }]);
check('a manager adds an expense', r.applied === 1);
r = await push(alTok, [{ t: 'sales', id: 's2', deleted: true }]);
check('an admin deletes a sale', r.applied === 1 && r.refused === 0);

// a custom role keeps working the way it is set up
await push(alTok, [{ t: 'roles', id: 'stockman', rec: { name: 'Stockman', permissions: ['inventory.view', 'stock.adjust'] } }]);
await owner('/tenants/' + tid + '/users', { user: { name: 'Sid Stock', email: 'sid@pol.rx', role: 'stockman', password: 'sid-pass-1234' } });
const sidTok = await login('sid@pol.rx');
r = await push(sidTok, [{ t: 'movements', id: 'm3', rec: { productId: 'p1', qty: -1, type: 'Expired write-off', branchId: 'main' } }, { t: 'sales', id: 's9', rec: { ...sale, id: 's9' } }]);
check('a custom role: its own permission works, a missing one is refused', r.applied === 1 && r.refusedKeys?.join() === 'sales|s9', JSON.stringify(r.refusedKeys));

await owner('/tenants/' + tid + '/delete', { confirm: slug });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

// Credit limits end to end (workplan step 8): the till asks a cashier for a reason before going over a client's limit,
// the sale goes through, the reason is audited and the owner's "Sales to check" says so; the cloud also flags a sale
// from an app that did not ask; Finance roles go on freely. Fictional data only.   node v60-credit-limit.mjs <base> <ownerKey>
import puppeteer from 'puppeteer-core';
import { CHROME } from './chrome.mjs';
const [base, ownerKey] = process.argv.slice(2);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + String(x).slice(0, 200) : ''}`); };
const owner = (p, body) => fetch(base + '/api/owner' + p, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ownerKey }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());
const api = (p, body, token) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, ...(await r.json().catch(() => ({}))) }));
const until = async (p, fn, ms = 20000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await p.evaluate(fn).catch(() => false)) return true; await wait(300); } return false; };
const rows = async (t, q = '') => (await owner(`/tenants/${tid}/records?t=${t}${q ? '&q=' + encodeURIComponent(q) : ''}`)).rows?.map((r) => r.rec) || [];

const T = await owner('/tenants', { name: 'Credit Pharmacy', admin: { name: 'Cora Admin', email: 'cora@cred.rx', password: 'cora-pass-1234' } });
const tid = T.tenant.id, slug = T.tenant.slug;
await owner('/tenants/' + tid, { features: { catalog: false } });
const day = new Date().toISOString();
await owner('/tenants/' + tid + '/records', { records: [
  { t: 'products', id: 'p1', rec: { name: 'Credit Tabs 500mg', form: 'Tablets', unit: 'Tablet', price: 500, cost: 300, reorder: 0 } },
  { t: 'batches', id: 'b1', rec: { productId: 'p1', batch: 'C1', expiry: '2030-01-01', cost: 300 } },
  { t: 'movements', id: 'm1', rec: { productId: 'p1', qty: 100, type: 'Opening stock', batchId: 'b1', branchId: 'main', date: day } },
  // Grace may owe up to 1,000 and already owes 800; Henry may owe 10,000
  { t: 'customers', id: 'c-grace', rec: { name: 'Grace Credit', phone: '0700000001', creditLimit: 1000 } },
  { t: 'customers', id: 'c-henry', rec: { name: 'Henry Credit', phone: '0700000002', creditLimit: 10000 } },
  { t: 'sales', id: 's-old', rec: { number: 'R-OLD', date: day, type: 'retail', branchId: 'main', items: [{ id: 'p1', name: 'Credit Tabs 500mg', qty: 1, price: 800 }], subtotal: 800, discount: 0, tax: 0, total: 800, paid: 0, payment: 'Credit', customerId: 'c-grace', customerName: 'Grace Credit', status: 'completed' } },
] });
await owner('/tenants/' + tid + '/users', { user: { name: 'Cal Cashier', email: 'cal@cred.rx', role: 'cashier', password: 'cal-pass-1234' } });
await owner('/tenants/' + tid + '/users', { user: { name: 'Mo Manager', email: 'mo@cred.rx', role: 'manager', password: 'mo-pass-1234' } });

// the cashier at the till
const b = await puppeteer.launch({ executablePath: CHROME, headless: true });
const p = await (await b.createBrowserContext()).newPage();
await p.setViewport({ width: 1366, height: 900 });
await p.goto(base + '/' + slug, { waitUntil: 'networkidle2' }); await wait(600);
await p.evaluate(() => { for (const id of ['pos', 'dashboard']) localStorage.setItem('rxpos-tip:' + id, '1'); });
await p.type('input[autocomplete=username]', 'cal@cred.rx'); await p.type('input[type=password]', 'cal-pass-1234');
await p.evaluate(() => [...document.querySelectorAll('form button')].find((x) => /^Sign in/.test(x.textContent.trim()))?.click());
await p.waitForSelector('.sidebar', { timeout: 20000 });
await until(p, () => /Synced/.test(document.querySelector('.pill.clock .clock-state')?.innerText || ''), 30000);
const startCreditSale = async (client) => {
  await p.evaluate(() => { location.hash = '#/pos'; }); await wait(900);
  await p.select('.pos-cart select[aria-label="Client"]', client); await wait(200);
  await p.evaluate(() => document.querySelector('.pay-methods .pay-credit')?.click()); await wait(200);
  await p.evaluate(() => { const i = document.querySelector('.search-row input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, 'Credit Tabs'); i.dispatchEvent(new Event('input', { bubbles: true })); }); await wait(300);
  await p.evaluate(() => document.querySelector('.product')?.click()); await wait(300);
  await p.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F9', bubbles: true }))); await wait(700);
};
const dialogText = () => p.evaluate(() => [...document.querySelectorAll('.modal')].map((m) => m.innerText).join(' | '));

await startCreditSale('c-henry');
check('within the limit: no question, the sale completes', /Sale complete/.test(await dialogText()), await dialogText());
await p.keyboard.press('Escape'); await wait(300);

await startCreditSale('c-grace');
check('over the limit: the cashier is asked why, with the figures', /Over the credit limit/.test(await dialogText()) && /owes UGX 800/.test(await dialogText()) && /limit of UGX 1,000/.test(await dialogText()), await dialogText());
await p.evaluate(() => [...document.querySelectorAll('.modal button')].find((x) => /^Cancel/.test(x.textContent.trim()))?.click()); await wait(500);
check('Cancel: no sale, the basket stays', !/Sale complete/.test(await dialogText()) && (await p.evaluate(() => document.querySelectorAll('.cart-line').length)) === 1);
await p.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F9', bubbles: true }))); await wait(700);
await p.type('.modal input', 'Regular client, pays on Friday');
await p.evaluate(() => [...document.querySelectorAll('.modal button')].find((x) => /Sell on credit/.test(x.textContent))?.click());
check('with a reason the sale goes through', await until(p, () => /Sale complete/.test([...document.querySelectorAll('.modal')].map((m) => m.innerText).join(' ')), 8000));
await p.keyboard.press('Escape');
await until(p, () => /^Synced/.test(document.querySelector('.pill.clock .clock-state')?.innerText || ''), 20000);
const graceSale = (await rows('sales', 'pays on Friday'))[0];
check('the sale carries the limit, what was owed and the reason', graceSale?.creditOver?.limit === 1000 && graceSale.creditOver.owed === 800 && graceSale.creditOver.adds === 500 && /Friday/.test(graceSale.creditOver.reason), JSON.stringify(graceSale?.creditOver));
check('the audit log says so', (await rows('audit', 'Credit limit exceeded')).some((a) => /Grace Credit owed UGX 800/.test(a.details) && /Friday/.test(a.details)));
const finding = (await rows('anomalies')).find((a) => a.kind === 'credit');
check('the owner\'s "Sales to check" has it, with the reason', !!finding && /Reason given: Regular client/.test(finding.detail) && finding.amount === 300, JSON.stringify(finding));
await b.close();

// the cloud checks too: an app that did not ask (an older version) is flagged; a Finance role is not
const login = async (email) => (await api('/api/login', { email, password: email.split('@')[0] + '-pass-1234', tenant: slug })).token;
const push = (tok, rec) => api('/api/sync', { v: 2, deviceId: 'dev-' + Math.random().toString(36).slice(2), since: 0, changes: [{ op: crypto.randomUUID(), at: new Date().toISOString(), t: 'sales', id: rec.id, rec }] }, tok);
const over = (id, number) => ({ id, number, date: new Date().toISOString(), type: 'retail', branchId: 'main', items: [{ id: 'p1', name: 'Credit Tabs 500mg', qty: 1, price: 500 }], subtotal: 500, discount: 0, tax: 0, total: 500, paid: 0, payment: 'Credit', customerId: 'c-grace', customerName: 'Grace Credit', status: 'completed', cashier: 'x' });
let r = await push(await login('cal@cred.rx'), over('s-oldapp', 'R-OLDAPP'));
check('a sale from an app that did not ask is kept…', r.applied === 1);
check('…and flagged "No reason given"', (await rows('anomalies')).some((a) => a.saleNumber === 'R-OLDAPP' && a.kind === 'credit' && /No reason given/.test(a.detail)));
r = await push(await login('mo@cred.rx'), over('s-mgr', 'R-MGR'));
check('a Finance role (manager) goes over freely, not flagged', r.applied === 1 && !(await rows('anomalies')).some((a) => a.saleNumber === 'R-MGR'));

await owner('/tenants/' + tid + '/delete', { confirm: slug });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

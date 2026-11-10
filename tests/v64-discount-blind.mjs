// Step 20: a discount ceiling per role (the till refuses more, the cloud flags it) and blind cash-up (the cash is
// counted before anyone sees what the drawer should hold). Fictional data only.   node v64-discount-blind.mjs <base> <ownerKey>
import puppeteer from 'puppeteer-core';
import { CHROME } from './chrome.mjs';
const [base, ownerKey] = process.argv.slice(2);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + String(x).slice(0, 200) : ''}`); };
const owner = (p, body) => fetch(base + '/api/owner' + p, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ownerKey }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());
const api = (p, body, token) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, ...(await r.json().catch(() => ({}))) }));
const until = async (p, fn, ms = 20000, arg) => { const end = Date.now() + ms; while (Date.now() < end) { if (await p.evaluate(fn, arg).catch(() => false)) return true; await wait(300); } return false; };
const push = (tok, changes) => api('/api/sync', { v: 2, deviceId: 'dev-' + Math.random().toString(36).slice(2), since: 0, changes: changes.map((c) => ({ op: crypto.randomUUID(), at: new Date().toISOString(), ...c })) }, tok);

const T = await owner('/tenants', { name: 'Limit Pharmacy', admin: { name: 'Ari Admin', email: 'ari@limit.rx', password: 'ari-pass-1234' } });
const tid = T.tenant.id, slug = T.tenant.slug;
await owner('/tenants/' + tid, { features: { catalog: false } });
await owner('/tenants/' + tid + '/records', { records: [
  { t: 'products', id: 'p1', rec: { name: 'Limit Tabs', price: 1000, cost: 400, reorder: 0 } },
  { t: 'batches', id: 'b1', rec: { productId: 'p1', batch: 'L1', expiry: '2030-01-01', cost: 400 } },
  { t: 'movements', id: 'm1', rec: { productId: 'p1', qty: 100, type: 'Opening stock', batchId: 'b1', branchId: 'main', date: new Date().toISOString() } },
] });
await owner('/tenants/' + tid + '/users', { user: { name: 'Cleo Cashier', email: 'cleo@limit.rx', role: 'cashier', password: 'cleo-pass-1234' } });
const login = async (email) => (await api('/api/login', { email, password: email.split('@')[0] + '-pass-1234', tenant: slug })).token;
const [ari, cleo] = [await login('ari@limit.rx'), await login('cleo@limit.rx')];

// the admin lets cashiers give discounts, up to 10% of a sale
let r = await push(ari, [{ t: 'roles', id: 'cashier', rec: { id: 'cashier', name: 'Cashier', permissions: ['pos.sell', 'pos.discount', 'sales.view', 'shifts', 'customers', 'chat'], maxDiscount: 10 } }]);
check('the admin sets the cashier role\'s discount limit to 10%', r.applied === 1);
const sale = (id, number, discount) => ({ id, number, date: new Date().toISOString(), type: 'retail', branchId: 'main', cashier: 'Cleo Cashier', items: [{ id: 'p1', name: 'Limit Tabs', qty: 2, price: 1000 }], subtotal: 2000, discount, tax: 0, total: 2000 - discount, paid: 2000 - discount, payment: 'Cash', customerId: 'walk-in', status: 'completed' });
r = await push(cleo, [{ t: 'sales', id: 'ok', rec: sale('ok', 'R-OK10', 200) }, { t: 'sales', id: 'big', rec: sale('big', 'R-BIG', 600) }]);
check('both sales are kept (the cloud never refuses a sale for this)', r.applied === 2 && r.refused === 0);
const f = (await owner(`/tenants/${tid}/records?t=anomalies`)).rows?.map((x) => x.rec) || [];
check('a 10% discount is within the limit', !f.some((x) => x.saleNumber === 'R-OK10'));
check('a 30% discount from an app that let it through is flagged', f.some((x) => x.saleNumber === 'R-BIG' && x.kind === 'discount-limit' && /30% of the sale\) is above this role's limit of 10%/.test(x.detail)), JSON.stringify(f.map((x) => [x.saleNumber, x.kind])));

// the browser
const b = await puppeteer.launch({ executablePath: CHROME, headless: true });
const signIn = async (email) => {
  const p = await (await b.createBrowserContext()).newPage();
  await p.setViewport({ width: 1366, height: 900 });
  p.on('dialog', (d) => d.dismiss().catch(() => {}));
  await p.goto(base + '/' + slug, { waitUntil: 'networkidle2' }); await wait(600);
  await p.evaluate(() => { for (const id of ['pos', 'dashboard', 'shifts', 'settings']) localStorage.setItem('rxpos-tip:' + id, '1'); });
  await p.type('input[autocomplete=username]', email); await p.type('input[type=password]', email.split('@')[0] + '-pass-1234');
  await p.evaluate(() => [...document.querySelectorAll('form button')].find((x) => /^Sign in/.test(x.textContent.trim()))?.click());
  await p.waitForSelector('.sidebar', { timeout: 20000 });
  await until(p, () => /Synced/.test(document.querySelector('.pill.clock .clock-state')?.innerText || ''), 30000);
  return p;
};
const go = async (p, h) => { await p.evaluate((x) => { location.hash = x; }, h); await wait(1200); };
const setInput = (p, sel, v) => p.evaluate((s, val) => { const i = document.querySelector(s); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, val); i.dispatchEvent(new Event('input', { bubbles: true })); }, sel, v);

// the admin switches on blind cash-up
const admin = await signIn('ari@limit.rx');
await go(admin, '#/settings');
await admin.evaluate(() => [...document.querySelectorAll('.tab')].find((x) => /Receipts/.test(x.textContent))?.click()); await wait(400);
await admin.evaluate(() => { const l = [...document.querySelectorAll('label.field.check')].find((x) => /Blind cash-up/.test(x.innerText)); l.querySelector('input').click(); }); await wait(200);
await admin.evaluate(() => [...document.querySelectorAll('form button')].find((x) => x.textContent.trim() === 'Save')?.click()); await wait(800);
await until(admin, () => /^Synced/.test(document.querySelector('.pill.clock .clock-state')?.innerText || ''), 20000);

// the cashier at the till: 20% is refused, 10% goes through
const p = await signIn('cleo@limit.rx');
const sell = async (disc) => {
  await go(p, '#/pos');
  await setInput(p, '.search-row input', 'Limit Tabs'); await wait(300);
  await p.evaluate(() => document.querySelector('.product')?.click()); await wait(200);
  await p.evaluate(() => document.querySelector('.product')?.click()); await wait(200); // 2 × 1,000
  await setInput(p, 'input[aria-label=Discount]', String(disc)); await wait(200);
  await p.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F9', bubbles: true })));
  return until(p, () => /Sale complete/.test(document.querySelector('.modal')?.innerText || ''), 4000);
};
check('a 20% discount is refused at the till', !(await sell(400)) && /at most 10% discount/.test(await p.evaluate(() => document.body.innerText)));
await p.evaluate(() => document.querySelectorAll('.toast button').forEach((x) => x.click()));
await setInput(p, 'input[aria-label=Discount]', '200'); await wait(200);
await p.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F9', bubbles: true })));
check('10% goes through', await until(p, () => /Sale complete/.test(document.querySelector('.modal')?.innerText || ''), 6000));
await p.keyboard.press('Escape'); await wait(300);

// blind cash-up: the cashier opens a shift, makes a sale, and counts before seeing the expected cash
await go(p, '#/shifts');
await p.evaluate(() => [...document.querySelectorAll('button')].find((x) => /Start my shift/.test(x.textContent))?.click()); await wait(400);
await setInput(p, '.modal input[type=number]', '10000');
await p.evaluate(() => [...document.querySelectorAll('.modal button')].find((x) => /Start shift/.test(x.textContent))?.click()); await wait(800);
check('blind: the open shift does not show the cash expected', !(await p.evaluate(() => /Cash expected in drawer/.test(document.querySelector('.page')?.innerText || ''))) && /Blind cash-up/.test(await p.evaluate(() => document.querySelector('.page')?.innerText || '')));
await sell(0); await p.keyboard.press('Escape'); await wait(300);
await go(p, '#/shifts');
await p.evaluate(() => [...document.querySelectorAll('button')].find((x) => /Close shift/.test(x.textContent))?.click()); await wait(500);
check('closing: no expected cash before counting', await p.evaluate(() => { const m = document.querySelector('.modal'); return !!m && !/Expected cash/.test(m.innerText) && /Show the difference/.test(m.innerText); }));
await p.evaluate(() => { const l = [...document.querySelectorAll('.modal label.field')].find((x) => /10,000 ×/.test(x.innerText)); const i = l.querySelector('input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, '3'); i.dispatchEvent(new Event('input', { bubbles: true })); });
await p.evaluate(() => [...document.querySelectorAll('.modal button')].find((x) => /Show the difference/.test(x.textContent))?.click()); await wait(300);
const shown = await p.evaluate(() => document.querySelector('.modal').innerText.replace(/\s+/g, ' '));
check('after the count: expected 12,000, counted 30,000, over 18,000', /Expected cash UGX 12,000/.test(shown) && /Counted UGX 30,000/.test(shown) && /Over UGX 18,000/.test(shown), shown.slice(0, 200));
check('…and the count can no longer be changed', await p.evaluate(() => [...document.querySelectorAll('.modal .cash-count input')].every((i) => i.disabled)));
await p.evaluate(() => [...document.querySelectorAll('.modal button')].find((x) => x.textContent.trim() === 'Close shift')?.click()); await wait(800);
await p.evaluate(() => [...document.querySelectorAll('.modal button')].find((x) => /Close anyway/.test(x.textContent))?.click()); await wait(800);
await until(p, () => /^Synced/.test(document.querySelector('.pill.clock .clock-state')?.innerText || ''), 20000);
const shift = (await owner(`/tenants/${tid}/records?t=shifts`)).rows?.map((x) => x.rec).find((s) => s.closedAt);
check('the shift is saved as a blind count with its difference', shift?.blind === true && shift.counted === 30000 && shift.variance === 18000, JSON.stringify(shift && { blind: shift.blind, counted: shift.counted, variance: shift.variance }));
check('…and the audit log says so', (await owner(`/tenants/${tid}/records?t=audit`)).rows?.some((x) => x.rec?.action === 'Shift closed (blind count)'));
await b.close();

await owner('/tenants/' + tid + '/delete', { confirm: slug });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

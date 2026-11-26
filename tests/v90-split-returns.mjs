// Nov 2026 audit items 5–7: one sale paid two ways at the till, part of it returned from Sales History (a credit note,
// stock back to its batch, money back the way it was paid), and cash paid out of the drawer during a shift counted in
// what the drawer should hold. Fictional data only.   node v90-split-returns.mjs <base> <ownerKey>
import puppeteer from 'puppeteer-core';
import { CHROME } from './chrome.mjs';
const [base, ownerKey] = process.argv.slice(2);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + String(x).slice(0, 300) : ''}`); };
const owner = (p, body) => fetch(base + '/api/owner' + p, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ownerKey }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());
const api = (p, body, token) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, ...(await r.json().catch(() => ({}))) }));
const until = async (p, fn, ms = 20000, arg) => { const end = Date.now() + ms; while (Date.now() < end) { if (await p.evaluate(fn, arg).catch(() => false)) return true; await wait(300); } return false; };
const push = (tok, changes) => api('/api/sync', { v: 2, deviceId: 'dev-' + Math.random().toString(36).slice(2), since: 0, changes: changes.map((c) => ({ op: crypto.randomUUID(), at: new Date().toISOString(), ...c })) }, tok);
const recs = async (tid, t) => ((await owner(`/tenants/${tid}/records?t=${t}&offset=0`)).rows || []).map((r) => r.rec);

const T = await owner('/tenants', { name: 'Split Pharmacy', admin: { name: 'Sam Admin', email: 'sam@split.rx', password: 'sam-pass-1234' } });
const tid = T.tenant.id, slug = T.tenant.slug;
await owner('/tenants/' + tid, { features: { catalog: false } });
await owner('/tenants/' + tid + '/records', { records: [
  { t: 'products', id: 'p1', rec: { name: 'Split Tabs', price: 1000, cost: 400, reorder: 0 } },
  { t: 'batches', id: 'b1', rec: { productId: 'p1', batch: 'SPL1', expiry: '2030-01-01', cost: 400 } },
  { t: 'movements', id: 'm1', rec: { productId: 'p1', qty: 50, type: 'Opening stock', batchId: 'b1', branchId: 'main', date: new Date().toISOString() } },
] });
await owner('/tenants/' + tid + '/users', { user: { name: 'Cal Cashier', email: 'cal@split.rx', role: 'cashier', password: 'cal-pass-1234' } });
const login = async (email) => (await api('/api/login', { email, password: email.split('@')[0] + '-pass-1234', tenant: slug })).token;
const cal = await login('cal@split.rx');

// the cloud: a return is a refund, so selling is not enough to make one
const fakeReturn = { id: 'fake', number: 'CN-X', date: new Date().toISOString(), returnOf: 'nope', returnOfNumber: 'R-NOPE', branchId: 'main', cashier: 'Cal Cashier', items: [{ id: 'p1', name: 'Split Tabs', qty: -1, price: 1000, line: 0 }], subtotal: -1000, discount: 0, tax: 0, total: -1000, paid: -1000, payment: 'Cash', status: 'completed' };
let r = await push(cal, [{ t: 'sales', id: 'fake', rec: fakeReturn }]);
check('a cashier (sell only) can\'t push a return', r.refused === 1 && r.applied === 0, JSON.stringify(r));

const b = await puppeteer.launch({ executablePath: CHROME, headless: true });
const p = await (await b.createBrowserContext()).newPage();
await p.setViewport({ width: 1366, height: 900 });
p.on('dialog', (d) => d.dismiss().catch(() => {}));
await p.goto(base + '/' + slug, { waitUntil: 'networkidle2' }); await wait(600);
await p.evaluate(() => { for (const id of ['pos', 'dashboard', 'shifts', 'sales', 'settings']) localStorage.setItem('rxpos-tip:' + id, '1'); });
await p.type('input[autocomplete=username]', 'sam@split.rx'); await p.type('input[type=password]', 'sam-pass-1234');
await p.evaluate(() => [...document.querySelectorAll('form button')].find((x) => /^Sign in/.test(x.textContent.trim()))?.click());
await p.waitForSelector('.sidebar', { timeout: 20000 });
await until(p, () => /Synced/.test(document.querySelector('.pill.clock .clock-state')?.innerText || ''), 30000);
const go = async (h) => { await p.evaluate((x) => { location.hash = x; }, h); await wait(1200); };
const setInput = (sel, v) => p.evaluate((s, val) => { const i = document.querySelector(s); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, val); i.dispatchEvent(new Event('input', { bubbles: true })); }, sel, v);
const click = (sel, re) => p.evaluate((s, src) => { const x = [...document.querySelectorAll(s)].find((e) => new RegExp(src).test(e.textContent)); x?.click(); return !!x; }, sel, re.source);
const synced = () => until(p, () => /^Synced/.test(document.querySelector('.pill.clock .clock-state')?.innerText || ''), 30000);

// a shift with a float of 5,000, and 300 paid out of the drawer
await go('#/shifts');
await click('button', /Start my shift/); await wait(400);
await setInput('.modal input[type=number]', '5000');
await click('.modal button', /Start shift/); await wait(800);
await click('button', /Pay cash out/); await wait(400);
await setInput('.modal input[type=number]', '300');
await p.evaluate(() => { const s = document.querySelector('.modal select'); s.value = 'Petty expense'; s.dispatchEvent(new Event('change', { bubbles: true })); });
await click('.modal button', /^Pay out$/); await wait(800);
check('paying out: the drawer should hold 4,700', /Expected in the drawer\s*UGX 4,700/.test(await p.evaluate(() => document.querySelector('[data-testid=drawer-cash]')?.innerText || '')), await p.evaluate(() => document.querySelector('[data-testid=drawer-cash]')?.innerText || ''));

// 3 × 1,000 at the till: 2,000 in cash and 1,000 by card
await go('#/pos');
await setInput('.search-row input', 'Split Tabs'); await wait(300);
for (let i = 0; i < 3; i++) { await p.evaluate(() => document.querySelector('.product')?.click()); await wait(200); }
check('the till offers Split pay', await click('.pay-row button', /^Split pay$/)); await wait(300);
check('…with two parts to fill', await p.evaluate(() => document.querySelectorAll('[data-testid=split-parts] .split-part').length === 2));
await setInput('input[aria-label="Part 1 amount"]', '2000'); await wait(100);
await p.evaluate(() => { const s = document.querySelector('select[aria-label="Part 2 method"]'); s.value = 'Card'; s.dispatchEvent(new Event('change', { bubbles: true })); });
await setInput('input[aria-label="Part 2 amount"]', '500'); await wait(200);
await p.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F9', bubbles: true }))); await wait(500);
check('short: the sale is not charged', !(await p.evaluate(() => /Sale complete/.test(document.querySelector('.modal')?.innerText || ''))));
await setInput('input[aria-label="Part 2 amount"]', '1000'); await wait(200);
await p.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F9', bubbles: true })));
check('2,000 cash + 1,000 card: the sale is complete', await until(p, () => /Sale complete/.test(document.querySelector('.modal')?.innerText || ''), 8000));
await p.keyboard.press('Escape'); await wait(300);
await synced();
const sale = (await recs(tid, 'sales')).find((s) => s.payment === 'Split');
check('the sale keeps both parts, each in its account', sale && sale.paid === 3000 && sale.payments.length === 2 && sale.payments[0].method === 'Cash' && sale.payments[0].amount === 2000 && sale.payments[1].amount === 1000, JSON.stringify(sale?.payments));

// one of the three comes back
await go('#/sales');
await p.evaluate((n) => [...document.querySelectorAll('tr')].find((tr) => tr.innerText.includes(n))?.querySelector('button')?.click(), sale.number); await wait(600);
check('a split sale can be returned', await click('button', /Refund or return/)); await wait(500);
await setInput('.refund-sheet input[type=number]', '1'); await wait(200);
await p.evaluate(() => { const s = document.querySelector('.refund-sheet select'); s.value = 'Customer returned it'; s.dispatchEvent(new Event('change', { bubbles: true })); }); await wait(200);
const sheet = await p.evaluate(() => document.querySelector('.refund-sheet')?.innerText.replace(/\s+/g, ' ') || '');
check('the sheet: 1,000 back, 667 in cash and 333 by card', /Money back to the customer UGX 1,000/.test(sheet) && /UGX 667 in cash/.test(sheet) && /UGX 333 by Card/.test(sheet), sheet.slice(0, 400));
await p.evaluate(() => document.querySelector('.refund-sheet button[type=submit]').click()); await wait(1200);
await synced();
const all = await recs(tid, 'sales');
const ret = all.find((s) => s.returnOf === sale.id);
check('a credit note of its own; the sale is unchanged', ret && /^CN/.test(ret.number) && ret.total === -1000 && ret.items[0].qty === -1 && all.find((s) => s.id === sale.id).status === 'completed', JSON.stringify(ret && { n: ret.number, t: ret.total }));
const mv = (await recs(tid, 'movements')).filter((m) => m.type === 'Refund');
check('one tablet back into its batch', mv.length === 1 && mv[0].qty === 1 && mv[0].batchId === 'b1' && mv[0].ref === ret?.number, JSON.stringify(mv));
const found = (await recs(tid, 'anomalies')).filter((a) => a.saleNumber === sale.number || a.saleNumber === ret?.number);
check('the cloud\'s checks find nothing wrong', found.length === 0, JSON.stringify(found.map((a) => a.detail)));

// the drawer: 5,000 + 2,000 cash − 667 back − 300 paid out
await go('#/shifts');
check('the drawer should hold 6,033', /Expected in the drawer\s*UGX 6,033/.test(await p.evaluate(() => document.querySelector('[data-testid=drawer-cash]')?.innerText || '')), await p.evaluate(() => document.querySelector('[data-testid=drawer-cash]')?.innerText || ''));
check('the pay-out is kept for the cloud', (await recs(tid, 'cashMoves')).some((m) => m.kind === 'out' && m.amount === 300 && m.reason === 'Petty expense'));
await b.close();

await owner('/tenants/' + tid + '/delete', { confirm: slug });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

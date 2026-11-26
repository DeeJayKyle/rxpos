// Write policy in the app (workplan step 2): what staff do on screen is what the cloud accepts. A cashier's sale syncs
// with nothing refused; a dispenser is not offered the actions the cloud would now refuse (medicine edits, write-offs,
// refunds). Fictional data only.   node v55-staff-ui.mjs <base> <ownerKey>
import puppeteer from 'puppeteer-core';
import { CHROME } from './chrome.mjs';
const [base, ownerKey] = process.argv.slice(2);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + String(x).slice(0, 200) : ''}`); };
const owner = (p, body) => fetch(base + '/api/owner' + p, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ownerKey }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());
const until = async (p, fn, ms = 20000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await p.evaluate(fn).catch(() => false)) return true; await wait(300); } return false; };
const day = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

const t = await owner('/tenants', { name: 'Staff Screens Pharmacy', admin: { name: 'Ada Admin', email: 'ada@staff.rx', password: 'ada-pass-1234' } });
const slug = t.tenant.slug, tid = t.tenant.id;
await owner('/tenants/' + tid, { features: { catalog: false } });
await owner('/tenants/' + tid + '/records', { records: [
  { t: 'products', id: 'p1', rec: { name: 'Sample Tabs 500mg', form: 'Tablets', unit: 'Tablet', price: 500, cost: 300, reorder: 0 } },
  { t: 'batches', id: 'b1', rec: { productId: 'p1', batch: 'S1', expiry: day(300), cost: 300 } },
  { t: 'batches', id: 'b0', rec: { productId: 'p1', batch: 'OLD', expiry: day(-5), cost: 300 } },
  { t: 'movements', id: 'm1', rec: { productId: 'p1', qty: 40, type: 'Opening stock', batchId: 'b1', branchId: 'main', date: new Date().toISOString() } },
  { t: 'movements', id: 'm0', rec: { productId: 'p1', qty: 3, type: 'Opening stock', batchId: 'b0', branchId: 'main', date: new Date().toISOString() } },
  // a big sale for the refund approval (2026-11-18: refunds over UGX 100,000 need a manager unless a manager refunds)
  { t: 'sales', id: 'big1', rec: { number: 'RBIG1', date: new Date().toISOString(), type: 'retail', branchId: 'main', items: [{ id: 'p1', name: 'Sample Tabs 500mg', qty: 300, price: 500, cost: 300, alloc: [] }], subtotal: 150000, discount: 0, tax: 0, total: 150000, payment: 'Cash', paid: 150000, customerId: 'walk-in', customerName: 'Walk-in Customer', cashier: 'Cal Cashier', status: 'completed' } },
] });
await owner('/tenants/' + tid + '/users', { user: { name: 'Cal Cashier', email: 'cal@staff.rx', role: 'cashier', password: 'cal-pass-1234' } });
await owner('/tenants/' + tid + '/users', { user: { name: 'Dee Dispenser', email: 'dee@staff.rx', role: 'dispenser', password: 'dee-pass-1234' } });
await owner('/tenants/' + tid + '/users', { user: { name: 'Mia Manager', email: 'mia@staff.rx', role: 'manager', password: 'mia-pass-1234' } });
await owner('/tenants/' + tid + '/users', { user: { name: 'Pat Pharmacist', email: 'pat@staff.rx', role: 'pharmacist', password: 'pat-pass-1234' } });

const b = await puppeteer.launch({ executablePath: CHROME, headless: true });
const signIn = async (email, pw) => {
  const ctx = await b.createBrowserContext();
  const p = await ctx.newPage();
  await p.setViewport({ width: 1366, height: 860 });
  p.on('dialog', (d) => d.dismiss().catch(() => {}));
  await p.goto(base + '/' + slug, { waitUntil: 'networkidle2' }); await wait(600);
  await p.evaluate(() => { for (const id of ['pos', 'dashboard', 'sales', 'medicines', 'expiry']) localStorage.setItem('rxpos-tip:' + id, '1'); });
  await p.type('input[autocomplete=username]', email); await p.type('input[type=password]', pw);
  await p.evaluate(() => [...document.querySelectorAll('form button')].find((x) => /^Sign in/.test(x.textContent.trim()))?.click());
  await p.waitForSelector('.sidebar', { timeout: 20000 });
  await until(p, () => /Synced/.test(document.querySelector('.pill.clock .clock-state')?.innerText || ''), 30000);
  return p;
};
const go = async (p, hash) => { await p.evaluate((h) => { location.hash = h; }, hash); await wait(1200); };
const pill = (p) => p.evaluate(() => document.querySelector('.pill.clock .clock-state')?.innerText || '');
const buttons = (p) => p.evaluate(() => [...document.querySelectorAll('button')].map((x) => x.textContent.trim()));

// a cashier sells at the till: the sale reaches the cloud, nothing is refused
const cal = await signIn('cal@staff.rx', 'cal-pass-1234');
await go(cal, '#/pos');
await cal.evaluate(() => { const i = document.querySelector('.search-row input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, 'Sample Tabs'); i.dispatchEvent(new Event('input', { bubbles: true })); }); await wait(300);
await cal.evaluate(() => document.querySelector('.product')?.click()); await wait(300);
await cal.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F9', bubbles: true })));
check('the cashier completes a sale', await until(cal, () => /Sale complete/.test(document.querySelector('.modal')?.innerText || ''), 8000));
await cal.keyboard.press('Escape');
const synced = await until(cal, () => /^Synced/.test(document.querySelector('.pill.clock .clock-state')?.innerText || ''), 30000);
check('…and it syncs with nothing refused (not "Needs attention")', synced, await pill(cal));
const cloudSales = (await owner(`/tenants/${tid}/records?t=sales`)).total;
const cloudMoves = (await owner(`/tenants/${tid}/records?t=movements`)).total;
check('the sale and its stock movement are in the cloud (beside the seeded big sale)', cloudSales === 2 && cloudMoves === 3, JSON.stringify({ cloudSales, cloudMoves }));

// a dispenser sees stock but is not offered what the cloud would refuse
const dee = await signIn('dee@staff.rx', 'dee-pass-1234');
// role-based landing (src/landing.js): a dispenser opens on the till; the bottom bar only offers what they may open
await wait(500);
check('a dispenser lands on the till after signing in', await dee.evaluate(() => location.hash === '#/pos'), await dee.evaluate(() => location.hash));
const tabsDee = await dee.evaluate(() => [...document.querySelectorAll('.bottom-nav a')].map((a) => a.innerText.trim()));
check('…and the bottom bar has only their pages', tabsDee.join() === 'Home,Stock,Sell,Sales', tabsDee.join());
await go(dee, '#/medicines');
const med = await buttons(dee);
check('a dispenser sees the medicine list', await dee.evaluate(() => /Sample Tabs/.test(document.querySelector('.page')?.innerText || '')));
check('…without Add / Edit / Selling units (needs medicines.manage)', !med.some((x) => /^Add medicine|^Edit$|^Selling units/.test(x)), med.filter((x) => /Add|Edit|Selling units/.test(x)).join(','));
await go(dee, '#/expiry');
await dee.evaluate(() => [...document.querySelectorAll('.filter-chips button')].find((x) => /^Expired/.test(x.textContent.trim()))?.click()); await wait(500);
check('a dispenser sees the expired batch', await dee.evaluate(() => /OLD/.test(document.querySelector('.page')?.innerText || '')));
check('…without "Write off" (needs stock.adjust)', !(await buttons(dee)).includes('Write off'));
await go(dee, '#/sales');
await dee.evaluate(() => [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === 'View')?.click()); await wait(600);
const saleBtns = await buttons(dee);
check('a dispenser opens the sale', saleBtns.some((x) => /Print|Close/.test(x)), saleBtns.slice(-8).join(','));
check('…without "Refund" (needs sales.refund)', !saleBtns.includes('Refund'));
check('the dispenser device has nothing refused either', /^Synced/.test(await pill(dee)), await pill(dee));

// safer refunds: a pharmacist refunding over UGX 100,000 needs a manager's password; the approver is recorded
const pat = await signIn('pat@staff.rx', 'pat-pass-1234');
await go(pat, '#/sales');
await pat.evaluate(() => { const r = [...document.querySelectorAll('.page table tbody tr')].find((x) => x.innerText.includes('RBIG1')); const td = r.querySelector('td:nth-child(2)'); const bx = td.getBoundingClientRect(); td.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: bx.x + 5, clientY: bx.y + 5 })); }); await wait(300);
await pat.evaluate(() => [...document.querySelectorAll('.ctx-menu button, .ctx-menu [role=menuitem]')].find((x) => /Refund/.test(x.textContent))?.click()); await wait(500);
check('a big refund by a pharmacist asks for a manager', await pat.evaluate(() => /A manager must approve/.test(document.querySelector('.refund-approve')?.innerText || '') && [...document.querySelectorAll('.refund-approve option')].some((o) => o.textContent === 'Mia Manager')));
await pat.select('.refund-sheet select', 'Customer returned it');
await pat.select('.refund-approve select', await pat.evaluate(() => [...document.querySelectorAll('.refund-approve option')].find((o) => o.textContent === 'Mia Manager').value));
const setPw = (v) => pat.evaluate((v) => { const i = document.querySelector('.refund-approve input[type=password]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, v); i.dispatchEvent(new Event('input', { bubbles: true })); }, v);
await setPw('wrong-pass-0000');
await pat.evaluate(() => document.querySelector('.refund-sheet button[type=submit]').click()); await wait(2500);
check('…a wrong password is refused and nothing is refunded', await pat.evaluate(() => /not right for Mia Manager/.test(document.querySelector('.refund-approve')?.innerText || '')) && !/refunded/.test(JSON.stringify(((await owner(`/tenants/${tid}/records?t=sales`)).rows || []).map((r) => r.rec))));
await setPw('mia-pass-1234');
await pat.evaluate(() => document.querySelector('.refund-sheet button[type=submit]').click());
const approved = await (async () => { for (let i = 0; i < 40; i++) { const r = await owner(`/tenants/${tid}/records?t=sales`); const rec = (r.rows || []).find((y) => y.id === 'big1')?.rec; if (rec?.status === 'refunded') return rec; await wait(500); } return null; })();
check('…the manager\'s password approves it; the approver is on the sale', approved?.refundApprovedBy === 'Mia Manager', JSON.stringify(approved && { status: approved.status, by: approved.refundApprovedBy }));

await b.close();
await owner('/tenants/' + tid + '/delete', { confirm: slug });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

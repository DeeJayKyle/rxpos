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
] });
await owner('/tenants/' + tid + '/users', { user: { name: 'Cal Cashier', email: 'cal@staff.rx', role: 'cashier', password: 'cal-pass-1234' } });
await owner('/tenants/' + tid + '/users', { user: { name: 'Dee Dispenser', email: 'dee@staff.rx', role: 'dispenser', password: 'dee-pass-1234' } });

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
check('the sale and its stock movement are in the cloud', cloudSales === 1 && cloudMoves === 3, JSON.stringify({ cloudSales, cloudMoves }));

// a dispenser sees stock but is not offered what the cloud would refuse
const dee = await signIn('dee@staff.rx', 'dee-pass-1234');
await go(dee, '#/medicines');
const med = await buttons(dee);
check('a dispenser sees the medicine list', await dee.evaluate(() => /Sample Tabs/.test(document.querySelector('.page')?.innerText || '')));
check('…without Add / Edit / Packs (needs medicines.manage)', !med.some((x) => /^Add medicine|^Edit$|^Packs/.test(x)), med.filter((x) => /Add|Edit|Packs/.test(x)).join(','));
await go(dee, '#/expiry');
await dee.evaluate(() => [...document.querySelectorAll('.tab')].find((x) => /^Expired/.test(x.textContent.trim()))?.click()); await wait(500);
check('a dispenser sees the expired batch', await dee.evaluate(() => /OLD/.test(document.querySelector('.page')?.innerText || '')));
check('…without "Write off" (needs stock.adjust)', !(await buttons(dee)).includes('Write off'));
await go(dee, '#/sales');
await dee.evaluate(() => [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === 'View')?.click()); await wait(600);
const saleBtns = await buttons(dee);
check('a dispenser opens the sale', saleBtns.some((x) => /Print|Close/.test(x)), saleBtns.slice(-8).join(','));
check('…without "Refund" (needs sales.refund)', !saleBtns.includes('Refund'));
check('the dispenser device has nothing refused either', /^Synced/.test(await pill(dee)), await pill(dee));

await b.close();
await owner('/tenants/' + tid + '/delete', { confirm: slug });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

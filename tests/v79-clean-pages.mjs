// Clean pages (2026-11-15, the owner's choice): Reports in three groups (Sales, Money, Stock) with their views,
// Inventory and Expiry filtered by chips beside the search instead of tabs, held sales / drafts / supplier prices
// behind a button with "‹ back". Windows and phone screenshots of each. Fictional data only.
//   node v79-clean-pages.mjs <base> <ownerKey> <outDir>
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
import { CHROME } from './chrome.mjs';
const [base, ownerKey, out = '.output/v79'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + String(x).slice(0, 300) : ''}`); };
const owner = (p, body) => fetch(base + '/api/owner' + p, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ownerKey }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());
const until = async (p, fn, ms = 20000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await p.evaluate(fn).catch(() => false)) return true; await wait(250); } return false; };

const T = await owner('/tenants', { name: 'Clean Pages Pharmacy', admin: { name: 'Cleo Admin', email: 'cleo@clean.rx', password: 'cleo-pass-1234' } });
const tid = T.tenant.id, slug = T.tenant.slug;
await owner('/tenants/' + tid, { features: { catalog: false } });
const date = new Date().toISOString();
const exp = (days) => { const d = new Date(); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); };
await owner('/tenants/' + tid + '/records', { records: [
  { t: 'products', id: 'p1', rec: { name: 'Amoxil 500mg Caps', generic: 'Amoxicillin', form: 'Capsules', price: 500, cost: 200, reorder: 5 } },
  { t: 'products', id: 'p2', rec: { name: 'Cipro 500', generic: 'Ciprofloxacin', form: 'Tablets', price: 800, cost: 300, reorder: 50 } },
  { t: 'products', id: 'p3', rec: { name: 'Zinc 20mg', generic: 'Zinc', form: 'Tablets', price: 200, cost: 90, reorder: 5 } },
  { t: 'batches', id: 'b1', rec: { productId: 'p1', batch: 'A1', expiry: exp(400), cost: 200, branchId: 'main' } },
  { t: 'batches', id: 'b2', rec: { productId: 'p2', batch: 'C1', expiry: exp(20), cost: 300, branchId: 'main' } },
  { t: 'movements', id: 'm1', rec: { productId: 'p1', qty: 40, type: 'Opening stock', branchId: 'main', batchId: 'b1', date } },
  { t: 'movements', id: 'm2', rec: { productId: 'p2', qty: 10, type: 'Opening stock', branchId: 'main', batchId: 'b2', date } },
  { t: 'sales', id: 's1', rec: { number: 'R1', date, type: 'retail', branchId: 'main', items: [{ id: 'p1', name: 'Amoxil 500mg Caps', qty: 2, price: 500, cost: 200, alloc: [] }], subtotal: 1000, discount: 0, tax: 0, total: 1000, payment: 'Cash', paid: 1000, customerId: 'walk-in', customerName: 'Walk-in Customer', cashier: 'Cleo Admin', status: 'completed' } },
] });
const b = await puppeteer.launch({ executablePath: CHROME, headless: true });
const p = await (await b.createBrowserContext()).newPage();
await p.setViewport({ width: 1440, height: 900 });
const errors = []; p.on('pageerror', (e) => errors.push(e.message));
await p.goto(base + '/' + slug, { waitUntil: 'networkidle2' }); await wait(500);
await p.evaluate(() => { for (const id of ['pos', 'dashboard', 'reports', 'inventory', 'sales', 'purchases']) localStorage.setItem('rxpos-tip:' + id, '1'); });
await p.type('input[autocomplete=username]', 'cleo@clean.rx'); await p.type('input[type=password]', 'cleo-pass-1234');
await p.evaluate(() => [...document.querySelectorAll('form button')].find((x) => /^Sign in/.test(x.textContent.trim()))?.click());
await p.waitForSelector('.sidebar', { timeout: 20000 });
await until(p, () => /Synced/.test(document.querySelector('.pill.clock .clock-state')?.innerText || ''), 30000);
const go = async (h) => { await p.evaluate((x) => { location.hash = x; }, h); await wait(1200); };
const shot = (name) => p.screenshot({ path: path.join(out, name + '.png') });
const views = () => p.evaluate(() => [...document.querySelectorAll('.tabs .tab')].map((t) => t.textContent.trim()));

for (const [w, h, tag] of [[1440, 900, ''], [390, 844, '-phone']]) {
  await p.setViewport({ width: w, height: h, isMobile: !!tag, hasTouch: !!tag, deviceScaleFactor: 1 });
  await go('#/reports');
  if (!tag) {
    check('Reports: three groups instead of nine tabs', JSON.stringify(await p.evaluate(() => [...document.querySelectorAll('.report-groups button')].map((x) => x.textContent))) === '["Sales","Money","Stock"]');
    check('…Sales holds its four views', JSON.stringify(await views()) === JSON.stringify(['Sales Report', 'Sales lines', 'Sales by Product', 'Consumption (ABC)']), JSON.stringify(await views()));
  }
  await shot('reports' + tag);
  await p.evaluate(() => [...document.querySelectorAll('.report-groups button')].find((x) => x.textContent === 'Money').click()); await wait(500);
  if (!tag) check('…Money: purchases, expenses, profit, income statement', JSON.stringify(await views()) === JSON.stringify(['Purchase Report', 'Expenses Report', 'Profit & margins', 'Income Statement']), JSON.stringify(await views()));
  await shot('reports-money' + tag);
  await go('#/inventory');
  if (!tag) {
    check('Inventory: filter chips with counts instead of tabs', await p.evaluate(() => !document.querySelector('.page > .tabs') && /In stock\s*2/.test(document.querySelector('.filter-chips')?.innerText || '')));
    await p.evaluate(() => [...document.querySelectorAll('.filter-chips button')].find((x) => /Out of stock/.test(x.textContent)).click()); await wait(400);
    check('…Out of stock shows Zinc only', await p.evaluate(() => /Zinc/.test(document.querySelector('table').innerText) && !/Amoxil/.test(document.querySelector('table').innerText)));
  }
  await shot('inventory' + tag);
  await go('#/expiry');
  await shot('expiry' + tag);
  await go('#/sales');
  if (!tag) check('Sales history: Held sales is a button, not a tab', await p.evaluate(() => !!document.querySelector('.subview-btn') && !document.querySelector('.page > .tabs')));
  await shot('sales' + tag);
  await p.evaluate(() => document.querySelector('.subview-btn').click()); await wait(500);
  if (!tag) check('…it opens with "‹ All sales" to go back', await p.evaluate(() => /All sales/.test(document.querySelector('.subview-bar')?.innerText || '')));
  await go('#/purchases');
  await shot('purchases' + tag);
  if (!tag) check('Purchase history: Drafts and Supplier prices are buttons', await p.evaluate(() => [...document.querySelectorAll('.subview-btn')].map((x) => x.textContent).join('|') === 'Drafts|Supplier prices'));
  check(`no sideways scrolling${tag || ' (desktop)'}`, await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
}
check('no page errors', !errors.length, errors.join(' | '));
await b.close();
await owner('/tenants/' + tid + '/delete', { confirm: T.tenant.slug });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

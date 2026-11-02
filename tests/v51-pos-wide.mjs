// The till on a wide screen (fictional pharmacy), still two sides: client strip over the medicines (debounced search, loyalty / balance
// badges), quick actions, the sale as a ledger with totals and Charge at the bottom right; everything already on the
// till is still there. Below 1280px the till looks as before.
//   node v51-pos-wide.mjs <base> <ownerKey> <outDir>
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
import { CHROME } from './chrome.mjs';
const [base, ownerKey, out] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + String(x).slice(0, 240) : ''}`); };
const owner = (p, body) => fetch(base + '/api/owner' + p, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ownerKey }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());

for (const x of (await owner('/tenants')).tenants || []) if (x.name === 'Wide Till Sample Pharmacy') await owner('/tenants/' + x.id + '/delete', { confirm: x.slug });
const T = await owner('/tenants', { name: 'Wide Till Sample Pharmacy', admin: { name: 'Wren Admin', email: 'wren@test.rx', password: 'wren-pass-1234' } });
const tid = T.tenant.id;
await owner('/tenants/' + tid, { features: { catalog: false, weather: false, promos: false } });
const day = new Date(Date.now() - 86400000).toISOString();
const sale = (id, cust, total, paid) => ({ t: 'sales', id, rec: { number: id, date: day, type: 'retail', branchId: 'main', items: [], subtotal: total, discount: 0, tax: 0, total, paid, payment: 'Cash', customerId: cust, customerName: cust, cashier: 'Wren Admin', status: 'completed' } });
await owner('/tenants/' + tid + '/records', { records: [
  { t: 'products', id: 'wt-a', rec: { name: 'Calmex 500mg Tabs', generic: 'Calmex', form: 'Tablets', unit: 'Tablet', barcode: '7010001', price: 500, cost: 300, reorder: 0 } },
  { t: 'products', id: 'wt-b', rec: { name: 'Zinco Syrup 100ml', generic: 'Zinco', form: 'Syrups', unit: 'Bottle', barcode: '7010002', price: 6000, cost: 4000, reorder: 0 } },
  { t: 'batches', id: 'wt-ba', rec: { productId: 'wt-a', batch: 'C1', expiry: '2029-01-31', cost: 300, received: day.slice(0, 10) } },
  { t: 'batches', id: 'wt-bb', rec: { productId: 'wt-b', batch: 'Z1', expiry: '2029-01-31', cost: 4000, received: day.slice(0, 10) } },
  { t: 'movements', id: 'wt-ma', rec: { productId: 'wt-a', batchId: 'wt-ba', qty: 100, type: 'Opening stock', date: day, branchId: 'main', user: 'Wren Admin' } },
  { t: 'movements', id: 'wt-mb', rec: { productId: 'wt-b', batchId: 'wt-bb', qty: 20, type: 'Opening stock', date: day, branchId: 'main', user: 'Wren Admin' } },
  { t: 'customers', id: 'wt-c1', rec: { name: 'Grace Sample', phone: '0700111222', allergies: '' } },
  { t: 'customers', id: 'wt-c2', rec: { name: 'Henry Example', phone: '0700333444', allergies: '' } },
  ...[1, 2, 3, 4, 5].map((i) => sale('R-L' + i, 'wt-c1', 1000, 1000)),
  sale('R-C1', 'wt-c2', 8000, 3000),
] });

const b = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
const p = await (await b.createBrowserContext()).newPage(); await p.setViewport({ width: 1440, height: 900 });
await p.goto(base + '/' + T.tenant.slug, { waitUntil: 'networkidle2' });
await p.waitForSelector('input[type=password]');
await p.evaluate(() => { const set = (sel, v) => { const i = document.querySelector(sel); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, v); i.dispatchEvent(new Event('input', { bubbles: true })); }; set('input[autocomplete=username]', 'wren@test.rx'); set('input[type=password]', 'wren-pass-1234'); });
await p.evaluate(() => [...document.querySelectorAll('form button')].find((x) => /^Sign in/.test(x.textContent.trim()))?.click());
await p.waitForSelector('.sidebar', { timeout: 30000 }); await wait(2500);
await p.evaluate(() => { location.hash = '#/pos'; }); await wait(1800);

const cols = await p.evaluate(() => { const r = (s) => document.querySelector(s)?.getBoundingClientRect(); const a = r('.pos-side'), m = r('.pos-products'), c = r('.pos-cart'); return a && m && c ? { two: getComputedStyle(document.querySelector('.pos')).gridTemplateColumns.split(' ').length === 2, sideAbove: a.bottom <= m.top + 1 && Math.abs(a.left - m.left) < 2, cartRight: c.left > m.right } : null; });
check('two sides at 1440px: client & quick actions over the medicines | the sale', cols && cols.two && cols.sideAbove && cols.cartRight, JSON.stringify(cols));
check('nothing already on the till is gone: search, filters, medicines, client box, payment methods, Proforma, Hold, Charge', await p.evaluate(() => !!document.querySelector('.pos-products input') && !!document.querySelector('.chips-row') && document.querySelectorAll('.product').length === 2 && !!document.querySelector('.pos-cart select[aria-label="Client"]') && !!document.querySelector('.pay-methods') && [...document.querySelectorAll('.pos-cart button')].some((x) => /Proforma/.test(x.textContent)) && [...document.querySelectorAll('.pos-cart button')].some((x) => /^Hold/.test(x.textContent.trim())) && [...document.querySelectorAll('.pos-cart button')].some((x) => /^Charge/.test(x.textContent.trim()))));
check('the medicine search still has the cursor (barcode scanners type there)', await p.evaluate(() => document.activeElement === document.querySelector('.pos-products input')));
check('walk-in shows the neutral "standard" badge', await p.evaluate(() => document.querySelector('.cust-badge')?.className.includes('cust-std')));

// client search: Alt+C, debounced
await p.keyboard.down('Alt'); await p.keyboard.press('c'); await p.keyboard.up('Alt'); await wait(100);
check('Alt+C puts the cursor in "Find client"', await p.evaluate(() => document.activeElement?.getAttribute('aria-label') === 'Find client'));
await p.keyboard.type('grace');
const early = await p.evaluate(() => document.querySelectorAll('.pos-client-list button').length);
await wait(350);
const late = await p.evaluate(() => [...document.querySelectorAll('.pos-client-list button')].map((x) => x.innerText.replace(/\s+/g, ' ')));
check('the search waits for typing to pause (150 ms), then lists the client', early === 0 && late.length === 1 && /Grace Sample/.test(late[0]), `${early} → ${late.join(' / ')}`);
await p.keyboard.press('Enter'); await wait(300);
check('Enter picks her: the client box on the sale shows her too', await p.evaluate(() => document.querySelector('.pos-cart select[aria-label="Client"]').value === 'wt-c1'));
check('5 sales: teal "Loyalty member" badge', await p.evaluate(() => { const x = document.querySelector('.cust-badge.cust-loyal'); return !!x && /Loyalty member · 5 visits/.test(x.textContent) && getComputedStyle(x).backgroundColor === 'rgb(240, 253, 250)' && getComputedStyle(x).color === 'rgb(17, 94, 89)'; }));
check('…and the cursor goes back to the medicine search', await p.evaluate(() => document.activeElement === document.querySelector('.pos-products input')));
await p.click('.pos-client-find input'); await p.keyboard.type('0700333'); await wait(350); await p.keyboard.press('Enter'); await wait(300);
check('a phone number finds a client; one owing 5,000 gets the amber "Balance due" badge', await p.evaluate(() => { const x = document.querySelector('.cust-badge.cust-credit'); return !!x && /Balance due.*5,000/.test(x.textContent) && getComputedStyle(x).backgroundColor === 'rgb(255, 251, 235)'; }));

// the sale as a ledger
for (const code of ['7010001', '7010002']) { await p.focus('.pos-products input.search'); await p.keyboard.type(code); await p.keyboard.press('Enter'); await wait(400); }
await p.click('.cart-line:first-child button[aria-label="More"]'); await wait(200);
await p.setViewport({ width: 1280, height: 800 }); await wait(300); await p.screenshot({ path: path.join(out, 'pos-1280-sale.png') }); await p.setViewport({ width: 1440, height: 900 }); await wait(300);
check('+ on a line adds one without opening anything', await p.evaluate(() => document.querySelector('.cart-line input[aria-label="Quantity"]').value === '2' && !document.querySelector('.modal')));
check('ledger rows are striped, names 16px bold, total 24px', await p.evaluate(() => { const ls = document.querySelectorAll('.cart-line'); const n = getComputedStyle(ls[0].querySelector('strong')); return getComputedStyle(ls[1]).backgroundColor !== getComputedStyle(ls[0]).backgroundColor && n.fontSize === '16px' && Number(n.fontWeight) >= 700 && parseFloat(getComputedStyle(document.querySelector('.totals .grand')).fontSize) >= 24; }));
check('Charge shows its key [F9] and sits on top (z-index 50) at the bottom', await p.evaluate(() => { const r = document.querySelector('.pay-row'); return /\[F9\]/.test(r.innerText) && getComputedStyle(r).zIndex === '50' && getComputedStyle(r).position === 'sticky'; }));
// quick actions
await p.keyboard.down('Alt'); await p.keyboard.press('d'); await p.keyboard.up('Alt'); await wait(100);
check('Alt+D / Discount puts the cursor in the discount', await p.evaluate(() => document.activeElement?.getAttribute('aria-label') === 'Discount'));
await p.keyboard.type('500'); await wait(200);
check('a discount shows as "Promos / member discount" in the totals', await p.evaluate(() => /Promos \/ member discount\s*− UGX 500/.test(document.querySelector('.totals').innerText)));
await p.screenshot({ path: path.join(out, 'pos-1440.png') });
await p.evaluate(() => [...document.querySelectorAll('.quick-tile')].find((x) => /Void item/.test(x.textContent)).click()); await wait(300);
check('Void item removes the line at the cursor (Calmex, last touched)', await p.evaluate(() => document.querySelectorAll('.cart-line').length === 1 && /Zinco/.test(document.querySelector('.cart-line').innerText)));
await p.evaluate(() => [...document.querySelectorAll('.quick-tile')].find((x) => /Hold sale/.test(x.textContent)).click()); await wait(800);
check('Hold sale parks it and starts a new one', await p.evaluate(() => !document.querySelector('.cart-line') && document.querySelectorAll('.sale-tab-wrap').length === 1));
await p.keyboard.down('Alt'); await p.keyboard.press('r'); await p.keyboard.up('Alt'); await wait(500);
check('Alt+R / Last receipt shows the last sale again', await p.evaluate(() => /Last receipt/.test(document.querySelector('.modal')?.innerText || '')));
await p.keyboard.press('Escape'); await wait(300);

// narrower screens: as before
await p.setViewport({ width: 1200, height: 900 }); await wait(500);
check('below 1280px the client strip is hidden and the till is as before', await p.evaluate(() => getComputedStyle(document.querySelector('.pos-side')).display === 'none' && getComputedStyle(document.querySelector('.pos')).gridTemplateColumns.split(' ').length === 2));
await p.setViewport({ width: 1280, height: 800 }); await wait(500);
check('at exactly 1280px: two sides, nothing spills sideways', await p.evaluate(() => getComputedStyle(document.querySelector('.pos')).gridTemplateColumns.split(' ').length === 2 && document.documentElement.scrollWidth <= 1280));
await p.screenshot({ path: path.join(out, 'pos-1280.png') });

await b.close();
await owner('/tenants/' + tid + '/delete', { confirm: T.tenant.slug });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

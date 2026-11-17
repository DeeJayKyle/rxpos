// The Premium UI switch (fictional pharmacy): since the two-colour themes (17 Nov 2026) it moves to the dark RxPOS Navy
// Teal and back, the sale untouched; the dashboard keeps its bento grid; F9 charges and F5 never does.
//   node v53-midnight-pro.mjs <base> <ownerKey> <outDir>
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

for (const x of (await owner('/tenants')).tenants || []) if (x.name === 'Midnight Sample Pharmacy') await owner('/tenants/' + x.id + '/delete', { confirm: x.slug });
const T = await owner('/tenants', { name: 'Midnight Sample Pharmacy', admin: { name: 'Mina Admin', email: 'mina@test.rx', password: 'mina-pass-1234' } });
const tid = T.tenant.id;
await owner('/tenants/' + tid, { features: { catalog: false, weather: false, promos: false } });
const day = new Date(Date.now() - 86400000).toISOString();
const sale = (id, cust, total, paid) => ({ t: 'sales', id, rec: { number: id, date: day, type: 'retail', branchId: 'main', items: [], subtotal: total, discount: 0, tax: 0, total, paid, payment: 'Cash', customerId: cust, customerName: cust, cashier: 'Mina Admin', status: 'completed' } });
await owner('/tenants/' + tid + '/records', { records: [
  { t: 'products', id: 'mp-a', rec: { name: 'Calmex 500mg Tabs', generic: 'Calmex', form: 'Tablets', unit: 'Tablet', barcode: '7010001', price: 500, cost: 300, reorder: 0 } },
  { t: 'products', id: 'mp-b', rec: { name: 'Zinco Syrup 100ml', generic: 'Zinco', form: 'Syrups', unit: 'Bottle', barcode: '7010002', price: 6000, cost: 4000, reorder: 0 } },
  { t: 'batches', id: 'mp-ba', rec: { productId: 'mp-a', batch: 'C1', expiry: '2029-01-31', cost: 300, received: day.slice(0, 10) } },
  { t: 'batches', id: 'mp-bb', rec: { productId: 'mp-b', batch: 'Z1', expiry: '2029-01-31', cost: 4000, received: day.slice(0, 10) } },
  { t: 'movements', id: 'mp-ma', rec: { productId: 'mp-a', batchId: 'mp-ba', qty: 100, type: 'Opening stock', date: day, branchId: 'main', user: 'Mina Admin' } },
  { t: 'movements', id: 'mp-mb', rec: { productId: 'mp-b', batchId: 'mp-bb', qty: 20, type: 'Opening stock', date: day, branchId: 'main', user: 'Mina Admin' } },
  ...['Amox', 'Brufen', 'Cetrix', 'Dexa', 'Eno', 'Flagyl', 'Gaviscon', 'Hydro'].flatMap((n, i) => [
    { t: 'products', id: 'mp-x' + i, rec: { name: n + ' Sample ' + (i + 1), generic: n, form: 'Tablets', unit: 'Tablet', barcode: '70200' + (10 + i), price: 1000 + i * 100, cost: 500, reorder: 0 } },
    { t: 'batches', id: 'mp-xb' + i, rec: { productId: 'mp-x' + i, batch: 'X' + i, expiry: '2029-01-31', cost: 500, received: day.slice(0, 10) } },
    { t: 'movements', id: 'mp-xm' + i, rec: { productId: 'mp-x' + i, batchId: 'mp-xb' + i, qty: 50, type: 'Opening stock', date: day, branchId: 'main', user: 'Mina Admin' } }]),
  { t: 'customers', id: 'mp-c1', rec: { name: 'Grace Sample', phone: '0700111222', allergies: '' } },
  { t: 'customers', id: 'mp-c2', rec: { name: 'Henry Example', phone: '0700333444', allergies: '' } },
  ...[1, 2, 3, 4, 5].map((i) => sale('R-L' + i, 'mp-c1', 1000, 1000)),
  sale('R-C1', 'mp-c2', 8000, 3000),
] });

const b = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
const p = await (await b.createBrowserContext()).newPage(); await p.setViewport({ width: 1440, height: 900 });
await p.goto(base + '/' + T.tenant.slug, { waitUntil: 'networkidle2' });
await p.waitForSelector('input[type=password]');
await p.evaluate(() => { const set = (sel, v) => { const i = document.querySelector(sel); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, v); i.dispatchEvent(new Event('input', { bubbles: true })); }; set('input[autocomplete=username]', 'mina@test.rx'); set('input[type=password]', 'mina-pass-1234'); });
await p.evaluate(() => [...document.querySelectorAll('form button')].find((x) => /^Sign in/.test(x.textContent.trim()))?.click());
await p.waitForSelector('.sidebar', { timeout: 30000 }); await wait(2500);
const css = (sel, prop, pseudo = null) => p.evaluate((s, pr, ps) => { const e = document.querySelector(s); return e ? getComputedStyle(e, ps)[pr] : null; }, sel, prop, pseudo);
// another theme first: none of this applies
await p.evaluate(() => { localStorage.setItem('pharmapos-theme', 'light'); }); await p.reload({ waitUntil: 'networkidle2' }); await wait(2000);
check('other themes are untouched (no glass on cards, sidebar as before)', !/blur/.test((await css('.card', 'backdropFilter')) || '') && !/blur/.test((await css('.sidebar', 'backdropFilter')) || ''));
// the premium theme
await p.evaluate(() => { localStorage.setItem('pharmapos-theme', 'navy-teal'); }); await p.reload({ waitUntil: 'networkidle2' }); await wait(2500);
check('Navy Teal is the premium theme: the navy page, teal actions, a navy menu', (await p.evaluate(() => document.documentElement.dataset.palette)) === 'navy-teal' && /rgb\(10, 34, 51\)/.test(await p.evaluate(() => getComputedStyle(document.body).backgroundColor)) && (await p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--primary').trim())) === '#14b8a6');
const bento = await p.evaluate(() => [...document.querySelectorAll('.stats.kpis > .card')].map((c) => Math.round(c.getBoundingClientRect().width)));
check('dashboard figures as a bento grid: today\'s sales is the large tile', bento.length >= 2 && bento[0] > bento[1] * 1.5, bento.join());
check('stock figures are one list in Stock health', !!(await p.$('.health-card .health-rows')));
check('figures in tight mono', /mono|Menlo|Consolas/i.test(await css('.stat strong', 'fontFamily')));
await p.screenshot({ path: path.join(out, 'dashboard.png') });
// the till
await p.evaluate(() => { location.hash = '#/pos'; }); await wait(1800);
await p.focus('.pos-products input.search'); await p.keyboard.type('7010001'); await p.keyboard.press('Enter'); await wait(150);
await wait(800);
await p.screenshot({ path: path.join(out, 'pos.png') });
await p.select('select[aria-label="Till layout"]', 'advanced'); await wait(500);
await p.screenshot({ path: path.join(out, 'pos-advanced.png') });

// the Premium UI switch: back to the usual look and on again, the sale untouched; F9 charges and F5 never does (step 4)
await p.select('select[aria-label="Till layout"]', 'standard'); await wait(400);
const saleNow = () => p.evaluate(() => [...document.querySelectorAll('.cart-line')].map((l) => l.innerText.replace(/\s+/g, ' ')).join(' | ') + ' || ' + document.querySelector('.totals .grand')?.innerText.replace(/\s+/g, ' '));
const before = await saleNow();
check('the top bar has a "Premium UI" switch, on', await p.evaluate(() => document.querySelector('.premium-toggle')?.getAttribute('aria-checked') === 'true'));
await p.click('.premium-toggle'); await wait(500);
check('switching it off goes back to a usual theme and keeps the sale exactly', (await p.evaluate(() => document.documentElement.dataset.palette)) !== 'navy-teal' && (await saleNow()) === before, await saleNow());
check('…with Charge as before ([F9])', /\[F9\]/.test(await p.evaluate(() => document.querySelector('.pos-cart .pay-row .btn.primary').innerText)));
await p.click('.premium-toggle'); await wait(500);
check('on again: Navy Teal, same sale', (await p.evaluate(() => document.documentElement.dataset.palette)) === 'navy-teal' && (await saleNow()) === before);
await p.reload({ waitUntil: 'networkidle2' }); await wait(2500);
check('the switch is remembered after a reload', (await p.evaluate(() => document.documentElement.dataset.palette)) === 'navy-teal' && await p.evaluate(() => localStorage.getItem('rxpos-advanced-ui') === '1'));
check('Charge shows [F9], as on every theme', /\[F9\]/.test(await p.evaluate(() => document.querySelector('.pos-cart .pay-row .btn.primary').innerText)));
const lines = await saleNow();
await p.focus('.pos-products input.search'); await p.keyboard.press('F5'); await wait(1500);
check('F5 does NOT charge the sale (it only syncs): the sale is still open', !/Sale complete/.test(await p.evaluate(() => document.querySelector('.modal')?.innerText || '')) && (await saleNow()) === lines, await saleNow());
await p.focus('.pos-products input.search'); await p.keyboard.press('F9'); await wait(1500);
check('F9 charges it', /Sale complete/.test(await p.evaluate(() => document.querySelector('.modal')?.innerText || '')));
await p.screenshot({ path: path.join(out, 'pos-premium.png') });

await b.close();
await owner('/tenants/' + tid + '/delete', { confirm: T.tenant.slug });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

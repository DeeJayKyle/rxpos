// Receipt header comes from the pharmacy Settings, not a stale single-branch address (user report: receipt showed
// the branch's "KASESE" while Settings said "Namungoona"). Seeds a one-branch pharmacy whose branch address differs
// from the Settings address, makes a sale, opens the receipt, and checks the Settings address is the one shown.
//   node v36-receipt.mjs <base> <ownerKey> <outDir>
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import { CHROME } from './chrome.mjs';
const [base, ownerKey, out] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + String(x).slice(0, 160) : ''}`); };
const owner = (p, body) => fetch(base + '/api/owner' + p, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ownerKey }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());
const setVal = (p, sel, val) => p.evaluate((sel, val) => { const i = document.querySelector(sel); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, val); i.dispatchEvent(new Event('input', { bubbles: true })); }, sel, val);

const SETTINGS_ADDR = 'Namungoona', BRANCH_ADDR = 'KASESE';
const t = await owner('/tenants', { name: 'JBM Receipt Test', address: SETTINGS_ADDR, phone: '0777224809', admin: { name: 'Eliza Aloyo', email: 'eliza@test.rx', password: 'eliza-pass-12' } });
const tid = t.tenant.id, slug = t.tenant.slug;
// give the single "main" branch a DIFFERENT address, and stock one product so it can be sold
await owner('/tenants/' + tid + '/records', { records: [
  { t: 'branches', id: 'main', rec: { id: 'main', name: 'Main', address: BRANCH_ADDR } },
  { t: 'products', id: 'p1', rec: { id: 'p1', name: 'Dynapar tabs', price: 1000, cost: 400, reorder: 0 } },
  { t: 'batches', id: 'b1', rec: { productId: 'p1', batch: '2ay', expiry: '2030-01-30', cost: 400 } },
  { t: 'movements', id: 'm1', rec: { productId: 'p1', qty: 50, type: 'Opening stock', batchId: 'b1', branchId: 'main', date: new Date().toISOString() } },
] });

const b = await puppeteer.launch({ executablePath: CHROME, headless: true });
const p = await (await b.createBrowserContext()).newPage();
await p.setViewport({ width: 1366, height: 860 });
await p.goto(base + '/' + slug, { waitUntil: 'networkidle2' }); await wait(700);
await setVal(p, 'input[autocomplete=username]', 'eliza@test.rx');
await setVal(p, 'input[type=password]', 'eliza-pass-12');
await p.evaluate(() => [...document.querySelectorAll('form button')].find((x) => /^Sign in/.test(x.textContent.trim()))?.click());
await p.waitForSelector('.sidebar', { timeout: 20000 }); await wait(1500);

// make a sale at the POS
await p.goto(base + '/' + slug + '#/pos', { waitUntil: 'networkidle2' }); await wait(1200);
await p.evaluate(() => document.querySelector('.product:not(.disabled)')?.click()); await wait(500);
await p.evaluate(() => [...document.querySelectorAll('.pos-cart .btn.primary, .pos-cart button')].find((x) => /^Charge/.test(x.textContent.trim()))?.click()); await wait(1200);
const dlg = await p.$('.dialog .btn.primary'); if (dlg) { await dlg.click(); await wait(1000); }
await p.keyboard.press('Escape'); await wait(500);

// open the receipt from Sales history and read the header
await p.goto(base + '/' + slug + '#/sales', { waitUntil: 'networkidle2' }); await wait(1000);
const opened = await p.evaluate(() => { const btn = [...document.querySelectorAll('button')].find((x) => /View/.test(x.textContent) && x.querySelector('svg')); btn?.click(); return !!btn; });
check('a sale was made and its receipt opens', opened);
await p.waitForSelector('.receipt', { timeout: 10000 });
const rc = await p.evaluate(() => document.querySelector('.receipt')?.innerText || '');
await p.screenshot({ path: out + '/receipt.png' });
check('the receipt shows the Settings address', rc.includes(SETTINGS_ADDR), rc.replace(/\n/g, ' | ').slice(0, 200));
check('the receipt does NOT show the stale branch address', !rc.includes(BRANCH_ADDR), rc.replace(/\n/g, ' | ').slice(0, 200));
check('the receipt still shows the pharmacy name and phone from Settings', rc.includes('JBM Receipt Test') && rc.includes('0777224809'));

await b.close();
await owner('/tenants/' + tid + '/delete', { confirm: slug });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

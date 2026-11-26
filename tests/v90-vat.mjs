// VAT per item end to end (2026-11 audit): a VAT-registered pharmacy (18%) sells an exempt medicine and a
// standard-rated sundry together. VAT is charged on the sundry only, the sale keeps each line's category and the
// breakdown, the receipt shows VAT by category, Reports shows "VAT by category", and the cloud raises no sale check.
// Fictional data only.   node v90-vat.mjs <base> <ownerKey> <outDir>
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { CHROME } from './chrome.mjs';
const [base, ownerKey, out = '.output/v90'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + String(x).slice(0, 300) : ''}`); };
const owner = (p, body) => fetch(base + '/api/owner' + p, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ownerKey }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());
const until = async (p, fn, ms = 20000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await p.evaluate(fn).catch(() => false)) return true; await wait(300); } return false; };
const setVal = (p, sel, val) => p.evaluate((sel, val) => { const i = document.querySelector(sel); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, val); i.dispatchEvent(new Event('input', { bubbles: true })); }, sel, val);

const T = await owner('/tenants', { name: 'VAT Pharmacy', admin: { name: 'Vera Admin', email: 'vera@vat.rx', password: 'vera-pass-1234' } });
const tid = T.tenant.id, slug = T.tenant.slug;
await owner('/tenants/' + tid, { features: { catalog: false } });
const rows = async (t) => (await owner(`/tenants/${tid}/records?t=${t}`)).rows?.map((r) => r.rec) || [];
const day = new Date().toISOString();
await owner('/tenants/' + tid + '/records', { records: [
  { t: 'settings', id: 'settings', rec: { name: 'VAT Pharmacy', taxRate: 18, defaultTaxCategory: 'exempt' } },
  { t: 'products', id: 'p-med', rec: { name: 'Vatfree Tabs 500mg', form: 'Tablets', unit: 'Tablet', price: 10000, cost: 5000, reorder: 0, taxCategory: 'exempt' } },
  { t: 'products', id: 'p-lot', rec: { name: 'Sundry Body Lotion', form: 'Lotion', unit: 'Bottle', price: 5000, cost: 3000, reorder: 0, taxCategory: 'standard' } },
  { t: 'batches', id: 'b1', rec: { productId: 'p-med', batch: 'V1', expiry: '2030-01-01', cost: 5000 } },
  { t: 'batches', id: 'b2', rec: { productId: 'p-lot', batch: 'L1', expiry: '2030-01-01', cost: 3000 } },
  { t: 'movements', id: 'm1', rec: { productId: 'p-med', qty: 50, type: 'Opening stock', batchId: 'b1', branchId: 'main', date: day } },
  { t: 'movements', id: 'm2', rec: { productId: 'p-lot', qty: 50, type: 'Opening stock', batchId: 'b2', branchId: 'main', date: day } },
] });

const b = await puppeteer.launch({ executablePath: CHROME, headless: true });
const p = await (await b.createBrowserContext()).newPage();
await p.setViewport({ width: 1366, height: 900 });
await p.goto(base + '/' + slug, { waitUntil: 'networkidle2' }); await wait(600);
await p.evaluate(() => { for (const id of ['pos', 'dashboard', 'reports', 'inventory']) localStorage.setItem('rxpos-tip:' + id, '1'); });
await setVal(p, 'input[autocomplete=username]', 'vera@vat.rx'); await setVal(p, 'input[type=password]', 'vera-pass-1234');
await p.evaluate(() => [...document.querySelectorAll('form button')].find((x) => /^Sign in/.test(x.textContent.trim()))?.click());
await p.waitForSelector('.sidebar', { timeout: 20000 });
await until(p, () => /Synced/.test(document.querySelector('.pill.clock .clock-state')?.innerText || ''), 30000);

// the medicine list shows each medicine's VAT category
await p.evaluate(() => { location.hash = '#/medicines'; }); await wait(1500);
const inv = await p.evaluate(() => document.querySelector('main')?.innerText || '');
check('the medicine list shows the VAT category of each medicine', /Exempt/.test(inv) && /Standard rate/.test(inv), inv.slice(0, 200));

// the till: 3 tablets (exempt, 30,000) and 2 bottles of lotion (standard, 10,000)
await p.evaluate(() => { location.hash = '#/pos'; }); await wait(900);
const add = async (q, n) => {
  for (let k = 0; k < n; k++) { await p.evaluate((q) => [...document.querySelectorAll('.product:not(.disabled)')].find((x) => x.innerText.includes(q))?.click(), q); await wait(300); }
};
await add('Vatfree', 3); await add('Sundry', 2);
const totals = await p.evaluate(() => document.querySelector('.totals')?.innerText || '');
check('the till charges VAT on the lotion only: 18% of 10,000', /VAT \(18% on UGX 10,000\)\s*UGX 1,800/.test(totals) && /UGX 41,800/.test(totals), totals.replace(/\n/g, ' | '));
await p.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F9', bubbles: true }))); await wait(900);
const dlg = await p.$('.dialog .btn.primary'); if (dlg) { await dlg.click(); await wait(900); }
check('the sale completes', await until(p, () => /Sale complete/.test([...document.querySelectorAll('.modal')].map((m) => m.innerText).join(' ')), 8000));
const rc = await p.evaluate(() => document.querySelector('.receipt')?.innerText || '');
check('the receipt shows VAT by category', /S VAT 18% \(standard\) on UGX 10,000\s*UGX 1,800/.test(rc) && /E Exempt on UGX 30,000\s*UGX 0/.test(rc) && /Total VAT\s*UGX 1,800/.test(rc), rc.replace(/\n/g, ' | '));
await p.screenshot({ path: out + '/receipt.png' });
await p.keyboard.press('Escape');
await until(p, () => /^Synced/.test(document.querySelector('.pill.clock .clock-state')?.innerText || ''), 20000);

// what the cloud got
const sale = (await rows('sales'))[0];
check('the sale keeps each line\'s VAT category and VAT', JSON.stringify(sale?.items?.map((i) => [i.id, i.taxCategory, i.tax]).sort()) === JSON.stringify([['p-lot', 'standard', 1800], ['p-med', 'exempt', 0]]), JSON.stringify(sale?.items?.map((i) => [i.id, i.taxCategory, i.tax])));
check('…and the breakdown with EFRIS codes', sale?.tax === 1800 && sale.total === 41800 && sale.taxRate === 18 && JSON.stringify(sale.taxBreakdown.map((r) => [r.category, r.efris, r.net, r.tax])) === JSON.stringify([['standard', '01', 10000, 1800], ['exempt', '03', 30000, 0]]), JSON.stringify(sale?.taxBreakdown));
check('the cloud raises no sale check', !(await rows('anomalies')).length, JSON.stringify(await rows('anomalies')));

// Reports: VAT by category
await p.evaluate(() => { location.hash = '#/reports'; }); await wait(1500);
const vt = await p.evaluate(() => document.querySelector('[data-testid=vat-breakdown]')?.innerText || '');
check('Reports shows VAT by category', /VAT 18% \(standard\)\s*UGX 10,000\s*UGX 1,800/.test(vt) && /Exempt\s*UGX 30,000\s*UGX 0/.test(vt), vt.replace(/\n/g, ' | '));
await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

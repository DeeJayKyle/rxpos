// Till layouts (fictional pharmacy): Classic (as it always was), Standard and Advanced UI, chosen per device and kept
// after a reload; switching keeps the sale. Advanced: three columns, glass totals, Ctrl+K command bar with +qty / void /
// disc / hold, and a pulse on the line that changed.
//   node v52-pos-layouts.mjs <base> <ownerKey> <outDir>
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

for (const x of (await owner('/tenants')).tenants || []) if (x.name === 'Layouts Sample Pharmacy') await owner('/tenants/' + x.id + '/delete', { confirm: x.slug });
const T = await owner('/tenants', { name: 'Layouts Sample Pharmacy', admin: { name: 'Lena Admin', email: 'lena@test.rx', password: 'lena-pass-1234' } });
const tid = T.tenant.id;
await owner('/tenants/' + tid, { features: { catalog: false, weather: false, promos: false } });
const day = new Date(Date.now() - 86400000).toISOString();
const sale = (id, cust, total, paid) => ({ t: 'sales', id, rec: { number: id, date: day, type: 'retail', branchId: 'main', items: [], subtotal: total, discount: 0, tax: 0, total, paid, payment: 'Cash', customerId: cust, customerName: cust, cashier: 'Lena Admin', status: 'completed' } });
await owner('/tenants/' + tid + '/records', { records: [
  { t: 'products', id: 'ly-a', rec: { name: 'Calmex 500mg Tabs', generic: 'Calmex', form: 'Tablets', unit: 'Tablet', barcode: '7010001', price: 500, cost: 300, reorder: 0 } },
  { t: 'products', id: 'ly-b', rec: { name: 'Zinco Syrup 100ml', generic: 'Zinco', form: 'Syrups', unit: 'Bottle', barcode: '7010002', price: 6000, cost: 4000, reorder: 0 } },
  { t: 'batches', id: 'ly-ba', rec: { productId: 'ly-a', batch: 'C1', expiry: '2029-01-31', cost: 300, received: day.slice(0, 10) } },
  { t: 'batches', id: 'ly-bb', rec: { productId: 'ly-b', batch: 'Z1', expiry: '2029-01-31', cost: 4000, received: day.slice(0, 10) } },
  { t: 'movements', id: 'ly-ma', rec: { productId: 'ly-a', batchId: 'ly-ba', qty: 100, type: 'Opening stock', date: day, branchId: 'main', user: 'Lena Admin' } },
  { t: 'movements', id: 'ly-mb', rec: { productId: 'ly-b', batchId: 'ly-bb', qty: 20, type: 'Opening stock', date: day, branchId: 'main', user: 'Lena Admin' } },
  ...['Amox', 'Brufen', 'Cetrix', 'Dexa', 'Eno', 'Flagyl', 'Gaviscon', 'Hydro'].flatMap((n, i) => [
    { t: 'products', id: 'ly-x' + i, rec: { name: n + ' Sample ' + (i + 1), generic: n, form: 'Tablets', unit: 'Tablet', barcode: '70200' + (10 + i), price: 1000 + i * 100, cost: 500, reorder: 0 } },
    { t: 'batches', id: 'ly-xb' + i, rec: { productId: 'ly-x' + i, batch: 'X' + i, expiry: '2029-01-31', cost: 500, received: day.slice(0, 10) } },
    { t: 'movements', id: 'ly-xm' + i, rec: { productId: 'ly-x' + i, batchId: 'ly-xb' + i, qty: 50, type: 'Opening stock', date: day, branchId: 'main', user: 'Lena Admin' } }]),
  { t: 'customers', id: 'ly-c1', rec: { name: 'Grace Sample', phone: '0700111222', allergies: '' } },
  { t: 'customers', id: 'ly-c2', rec: { name: 'Henry Example', phone: '0700333444', allergies: '' } },
  ...[1, 2, 3, 4, 5].map((i) => sale('R-L' + i, 'ly-c1', 1000, 1000)),
  sale('R-C1', 'ly-c2', 8000, 3000),
] });

const b = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
const p = await (await b.createBrowserContext()).newPage(); await p.setViewport({ width: 1440, height: 900 });
await p.goto(base + '/' + T.tenant.slug, { waitUntil: 'networkidle2' });
await p.waitForSelector('input[type=password]');
await p.evaluate(() => { const set = (sel, v) => { const i = document.querySelector(sel); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, v); i.dispatchEvent(new Event('input', { bubbles: true })); }; set('input[autocomplete=username]', 'lena@test.rx'); set('input[type=password]', 'lena-pass-1234'); });
await p.evaluate(() => [...document.querySelectorAll('form button')].find((x) => /^Sign in/.test(x.textContent.trim()))?.click());
await p.waitForSelector('.sidebar', { timeout: 30000 }); await wait(2500);
await p.evaluate(() => { location.hash = '#/pos'; }); await wait(1800);

const addCode = async (code) => { await p.focus('.pos-products input.search'); await p.keyboard.type(code); await p.keyboard.press('Enter'); await wait(350); };
const lines = () => p.evaluate(() => [...document.querySelectorAll('.cart-line')].map((l) => `${l.querySelector('strong')?.textContent}×${l.querySelector('input[aria-label="Quantity"]')?.value}`).join(', '));
check('the till offers three layouts: Classic, Standard, Advanced UI (Standard to start)', await p.evaluate(() => { const s = document.querySelector('select[aria-label="Till layout"]'); return !!s && [...s.options].map((o) => o.text).join('|') === 'Classic|Standard|Advanced UI' && s.value === 'standard'; }));
await addCode('7010001'); await addCode('7010002'); await addCode('7020010');
const sale0 = await lines();

// Classic: the till exactly as before
await p.select('select[aria-label="Till layout"]', 'classic'); await wait(400);
check('Classic: no client strip, no key labels or extra total rows; Charge as before', await p.evaluate(() => !document.querySelector('.pos-side') && !document.querySelector('.kbd-sub') && !document.querySelector('.grand-sub') && /^Charge UGX/.test([...document.querySelectorAll('.pos-cart button')].find((x) => /Charge/.test(x.textContent)).textContent.trim()) && getComputedStyle(document.querySelector('.pos')).gridTemplateColumns.split(' ').length === 2));
check('…and the sale is untouched by the switch', (await lines()) === sale0, await lines());

// Advanced UI
await p.select('select[aria-label="Till layout"]', 'advanced'); await wait(500);
const adv = await p.evaluate(() => { const r = (s) => document.querySelector(s).getBoundingClientRect(); const a = r('.pos-side'), l = r('.pos-ledger'), y = r('.pos-pay'); const pay = getComputedStyle(document.querySelector('.pos-pay')); return { order: a.right < l.left && l.right < y.left, ratio: Math.round((l.width / y.width) * 10) / 10, glass: /blur/.test(pay.backdropFilter || pay.webkitBackdropFilter || ''), btn: [...document.querySelectorAll('.pos-pay button')].some((x) => /^Process checkout/.test(x.textContent.trim())), nums: [...document.querySelectorAll('.line-num')].map((x) => x.textContent).join() }; });
check('Advanced: client | sale ledger | glass totals, 25 / 50 / 25', adv.order && adv.ratio >= 1.8 && adv.ratio <= 2.2 && adv.glass, JSON.stringify(adv));
check('…with "Process checkout" in the totals panel and numbered lines', adv.btn && adv.nums === '1,2,3', adv.nums);
check('…and the same sale', (await lines()) === sale0, await lines());
await p.screenshot({ path: path.join(out, 'advanced.png') });
await p.reload({ waitUntil: 'networkidle2' }); await wait(2000);
check('the choice is kept on this device after a reload (and the sale too)', await p.evaluate(() => document.querySelector('select[aria-label="Till layout"]').value === 'advanced') && (await lines()) === sale0);

// the command bar
const cmd = async (t) => { await p.keyboard.type(t); await p.keyboard.press('Enter'); await wait(300); };
await p.keyboard.down('Control'); await p.keyboard.press('k'); await p.keyboard.up('Control'); await wait(300);
check('Ctrl+K opens the command bar with the cursor in it', await p.evaluate(() => !!document.querySelector('.omni') && document.activeElement === document.querySelector('.omni input')));
await cmd('+qty 1');
const pulsed = await p.evaluate(() => /pulse-[ab]/.test(document.querySelector('.cart-line').className));
check('"+qty 1" adds one to line 1, and the line pulses', /Calmex 500mg Tabs×2/.test(await lines()) && pulsed, await lines());
await cmd('qty 2 3');
check('"qty 2 3" sets line 2 to 3', /Zinco Syrup 100ml×3/.test(await lines()), await lines());
await cmd('void 3');
check('"void 3" removes line 3', (await lines()).split(', ').length === 2, await lines());
await cmd('disc 1 10');
check('"disc 1 10" takes 10% off line 1 (500 → 450)', await p.evaluate(() => document.querySelector('.cart-line input[aria-label="Unit price"]').value === '450'));
await cmd('disc 5');
check('"disc 5" takes 5% off the sale', await p.evaluate(() => document.querySelector('input[aria-label="Discount"]').value === String(Math.round((900 + 18000) * 0.05))));
await cmd('blah blah');
check('a mistake says what the commands are', /Not a command/.test(await p.evaluate(() => document.querySelector('.omni-msg')?.textContent || '')));
await p.evaluate(() => { const i = document.querySelector('.omni input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, ''); i.dispatchEvent(new Event('input', { bubbles: true })); });
await p.keyboard.type('amox'); await wait(300);
check('typing a medicine lists it; Enter adds it', /Amox Sample 1/.test(await p.evaluate(() => document.querySelector('.omni-list')?.innerText || '')));
await p.keyboard.press('Enter'); await wait(300);
check('…added as line 3', /Amox Sample 1×1/.test(await lines()), await lines());
for (let i = 0; i < 4; i++) await p.keyboard.press('Tab');
check('Tab stays inside the command bar', await p.evaluate(() => !!document.activeElement?.closest('.omni')));
await p.screenshot({ path: path.join(out, 'omnibar.png') });
await p.keyboard.press('Escape'); await wait(300);
check('Esc closes it and the cursor goes back to the medicine search', await p.evaluate(() => !document.querySelector('.omni') && document.activeElement === document.querySelector('.pos-products input')));

// Standard: Ctrl+K is the app-wide search as before
await p.select('select[aria-label="Till layout"]', 'standard'); await wait(400);
await p.keyboard.down('Control'); await p.keyboard.press('k'); await p.keyboard.up('Control'); await wait(400);
check('in Standard, Ctrl+K is still the app-wide search', await p.evaluate(() => !document.querySelector('.omni') && !!document.querySelector('.modal-bg, .palette')));

await b.close();
await owner('/tenants/' + tid + '/delete', { confirm: T.tenant.slug });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

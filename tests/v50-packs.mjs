// Packs (fictional pharmacy): Add Stock receives a medicine in its largest pack (the cost is per box), the retail till
// sells single tablets and the wholesale till whole boxes at the box's wholesale price; each line can be switched.
// Stock is checked in the cloud's own records.
//   node v50-packs.mjs <base> <ownerKey> <outDir>
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
const until = async (p, fn, ms = 15000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await p.evaluate(fn).catch(() => false)) return true; await wait(300); } return false; };

for (const x of (await owner('/tenants')).tenants || []) if (x.name === 'Packs Sample Pharmacy') await owner('/tenants/' + x.id + '/delete', { confirm: x.slug });
const T = await owner('/tenants', { name: 'Packs Sample Pharmacy', admin: { name: 'Pat Admin', email: 'pat@test.rx', password: 'pat-pass-1234' } });
const tid = T.tenant.id;
await owner('/tenants/' + tid, { features: { catalog: false, weather: false, promos: false } });
const day = new Date().toISOString();
await owner('/tenants/' + tid + '/records', { records: [
  { t: 'products', id: 'pk-para', rec: { name: 'Paramol 500mg Tabs', generic: 'Paramol', form: 'Tablets', unit: 'Tablet', barcode: '7009001', price: 60, wholesale: 45, cost: 30, reorder: 0,
    packs: [{ name: 'Strip', size: 10, price: 550 }, { name: 'Box', size: 100, price: 5000, wholesale: 4200 }] } },
  { t: 'batches', id: 'pk-b1', rec: { productId: 'pk-para', batch: 'PM1', expiry: '2029-01-31', cost: 30, received: day.slice(0, 10) } },
  { t: 'movements', id: 'pk-m1', rec: { productId: 'pk-para', batchId: 'pk-b1', qty: 150, type: 'Opening stock', date: day, branchId: 'main', user: 'Pat Admin' } },
  { t: 'suppliers', id: 'pk-sup', rec: { name: 'Sample Wholesalers Ltd', contact: '', phone: '', email: '', address: '' } },
] });
const exp = () => fetch(base + '/api/owner/tenants/' + tid + '/export', { headers: { Authorization: 'Bearer ' + ownerKey } }).then((r) => r.json());
const stockOf = async () => (await exp()).movements.filter((m) => m.productId === 'pk-para').reduce((a, m) => a + m.qty, 0);

const b = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
const p = await (await b.createBrowserContext()).newPage(); await p.setViewport({ width: 1366, height: 900 });
await p.goto(base + '/' + T.tenant.slug, { waitUntil: 'networkidle2' });
await p.waitForSelector('input[type=password]');
await p.evaluate(() => { const set = (sel, v) => { const i = document.querySelector(sel); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, v); i.dispatchEvent(new Event('input', { bubbles: true })); }; set('input[autocomplete=username]', 'pat@test.rx'); set('input[type=password]', 'pat-pass-1234'); });
await p.evaluate(() => [...document.querySelectorAll('form button')].find((x) => /^Sign in/.test(x.textContent.trim()))?.click());
await p.waitForSelector('.sidebar', { timeout: 30000 }); await wait(2500);
const go = async (h) => { await p.evaluate((x) => { location.hash = '#' + x; }, h); await wait(1500); };
const setVal = (sel, v) => p.evaluate((s, val) => { const i = document.querySelector(s); const proto = i.tagName === 'TEXTAREA' ? HTMLTextAreaElement : HTMLInputElement; Object.getOwnPropertyDescriptor(proto.prototype, 'value').set.call(i, String(val)); i.dispatchEvent(new Event('input', { bubbles: true })); }, sel, v);

// Settings shows the three choices, with the defaults
await go('/settings'); await p.evaluate(() => [...document.querySelectorAll('button, a')].find((x) => /Receipts/.test(x.textContent))?.click()); await wait(500);
const sets = await p.evaluate(() => [...document.querySelectorAll('label.field')].filter((l) => /receives medicines with packs|till sells in/.test(l.innerText)).map((l) => l.querySelector('select').value).join());
check('Settings: Add Stock in packs, retail in units, wholesale in packs (the defaults)', sets === 'pack,unit,pack', sets);

// 1. Add Stock: the medicine comes in its largest pack, the cost per box
await go('/add-stock');
await p.select('form.card select', 'pk-sup');
await p.focus('table.stock-lines tbody tr:first-child .med-pick input'); await p.keyboard.type('paramol'); await wait(400); await p.keyboard.press('Enter'); await wait(400);
const line = await p.evaluate(() => { const r = document.querySelector('table.stock-lines tbody tr'); return { as: r.querySelector('select[aria-label="Received as"]')?.value, cost: r.querySelector('output[aria-label="Unit cost"]')?.textContent }; });
check('Add Stock receives in boxes of 100 by default, cost per box 3,000', line.as === 'Box' && line.cost === 'UGX 3,000', JSON.stringify(line));
await setVal('table.stock-lines tbody tr:first-child input[aria-label="Quantity"]', 2); await wait(200);
check('…and shows the tablets: 2 boxes = 200', /= 200 tablets/.test(await p.evaluate(() => document.querySelector('table.stock-lines tbody tr').innerText)));
// switching to strips keeps the cost per tablet
await p.select('table.stock-lines tbody tr:first-child select[aria-label="Received as"]', 'Strip'); await wait(200);
check('switching to strips: cost per strip 300 (same per tablet)', (await p.evaluate(() => document.querySelector('table.stock-lines tbody tr output[aria-label="Unit cost"]').textContent)) === 'UGX 300');
await p.select('table.stock-lines tbody tr:first-child select[aria-label="Received as"]', 'Box'); await wait(200);
await setVal('table.stock-lines tbody tr:first-child input[aria-label="Line total"]', 6400); await wait(100); // 2 boxes: 3,200 a box
await setVal('table.stock-lines tbody tr:first-child input[aria-label="Batch number"]', 'PM2');
await p.click('table.stock-lines tbody tr:first-child input[aria-label="Expiry date"]'); await p.keyboard.type('31/12/2030'); await p.keyboard.press('Tab'); await wait(300);
await p.evaluate(() => [...document.querySelectorAll('button')].find((x) => /^Receive stock/.test(x.textContent.trim()))?.click());
check('the delivery is received', await until(p, () => /Received 1 item/.test(document.body.innerText)));
let st = 0; for (let k = 0; k < 20 && st !== 350; k++) { st = await stockOf(); if (st !== 350) await wait(500); }
check('stock 150 → 350 tablets', st === 350, st);
const bat = (await exp()).batches.find((x) => x.batch === 'PM2');
check('the batch costs 32 per tablet (3,200 a box)', bat && bat.cost === 32, JSON.stringify(bat));

// 2. retail till: one tablet
await go('/pos');
await p.focus('.pos-products input.search'); await p.keyboard.type('7009001'); await p.keyboard.press('Enter'); await wait(500);
const retail = await p.evaluate(() => { const l = document.querySelector('.cart-line'); return { by: l?.querySelector('select[aria-label="Sell by"]')?.value ?? '', text: l?.innerText.replace(/\s+/g, ' ') }; });
check('the retail till sells single tablets by default', retail.by === '' && /UGX 60\b/.test(retail.text || ''), JSON.stringify(retail));
await p.evaluate(() => [...document.querySelectorAll('button')].find((x) => /Clear all/.test(x.textContent))?.click()); await wait(300);

// 3. wholesale till: a whole box at the box's wholesale price
await go('/pos/wholesale');
await p.focus('.pos-products input.search'); await p.keyboard.type('7009001'); await p.keyboard.press('Enter'); await wait(500);
const whole = await p.evaluate(() => { const l = [...document.querySelectorAll('.cart-line')].pop(); return { by: l?.querySelector('select[aria-label="Sell by"]')?.value ?? '', text: l?.innerText.replace(/\s+/g, ' ') }; });
check('the wholesale till sells a box by default, at the box\'s wholesale price 4,200', whole.by === 'Box' && /4,200/.test(whole.text || ''), JSON.stringify(whole));
await p.evaluate(() => { const s = [...document.querySelectorAll('.cart-line')].pop().querySelector('select[aria-label="Sell by"]'); s.value = ''; s.dispatchEvent(new Event('change', { bubbles: true })); }); await wait(300);
const sw = await p.evaluate(() => [...document.querySelectorAll('.cart-line')].pop()?.querySelector('select[aria-label="Sell by"]')?.value);
check('…and the line can be switched to single tablets', sw === '', sw);
await p.screenshot({ path: path.join(out, 'wholesale.png'), fullPage: true });

await b.close();
await owner('/tenants/' + tid + '/delete', { confirm: T.tenant.slug });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

// Packs (fictional pharmacy): Add Stock receives a medicine in its largest pack (the cost is per box), the retail till
// sells single tablets and the wholesale till whole boxes at the box's wholesale price; each line can be switched.
// Stock is checked in the cloud's own records.
//   node v50-packs.mjs <base> <ownerKey> <outDir>
import puppeteer from 'puppeteer-core';
import { confirmReview } from './review.mjs';
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
  // counted in boxes by mistake: changed to tablets in step 5
  { t: 'products', id: 'pk-amx', rec: { name: 'Amoxi 250mg Caps', generic: 'Amoxi', form: 'Capsules', unit: 'Box', barcode: '7009002', price: 10000, wholesale: 9000, cost: 7000, reorder: 2 } },
  { t: 'batches', id: 'pk-b9', rec: { productId: 'pk-amx', batch: 'AX1', expiry: '2029-06-30', cost: 7000, received: day.slice(0, 10) } },
  { t: 'movements', id: 'pk-m9', rec: { productId: 'pk-amx', batchId: 'pk-b9', qty: 5, type: 'Opening stock', date: day, branchId: 'main', user: 'Pat Admin' } },
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
await confirmReview(p);
check('the delivery is received', await until(p, () => /Received 1 item/.test(document.body.innerText)));
let st = 0; for (let k = 0; k < 20 && st !== 350; k++) { st = await stockOf(); if (st !== 350) await wait(500); }
check('stock 150 → 350 tablets', st === 350, st);
const bat = (await exp()).batches.find((x) => x.batch === 'PM2');
check('the batch costs 32 per tablet (3,200 a box)', bat && bat.cost === 32, JSON.stringify(bat));

// 2. retail till: one tablet
await go('/pos');
await p.focus('.pos-products input.search'); await p.keyboard.type('7009001'); await p.keyboard.press('Enter'); await wait(500);
const retail = await p.evaluate(() => { const l = document.querySelector('.cart-line'); return { by: l?.querySelector('.unit-toggle [aria-checked=true]')?.dataset.value ?? l?.querySelector('select[aria-label="Sell by"]')?.value ?? '', text: l?.innerText.replace(/\s+/g, ' ') }; });
check('the retail till sells single tablets by default', retail.by === '' && /UGX 60\b/.test(retail.text || ''), JSON.stringify(retail));
await p.evaluate(() => [...document.querySelectorAll('button')].find((x) => /Clear all/.test(x.textContent))?.click()); await wait(300);

// 3. wholesale till: a whole box at the box's wholesale price
await go('/pos/wholesale');
await p.focus('.pos-products input.search'); await p.keyboard.type('7009001'); await p.keyboard.press('Enter'); await wait(500);
const whole = await p.evaluate(() => { const l = [...document.querySelectorAll('.cart-line')].pop(); return { by: l?.querySelector('.unit-toggle [aria-checked=true]')?.dataset.value ?? l?.querySelector('select[aria-label="Sell by"]')?.value ?? '', text: l?.innerText.replace(/\s+/g, ' ') }; });
check('the wholesale till sells a box by default, at the box\'s wholesale price 4,200', whole.by === 'Box' && /4,200/.test(whole.text || ''), JSON.stringify(whole));
await p.evaluate(() => { const l = [...document.querySelectorAll('.cart-line')].pop(); const t = l.querySelector('.unit-toggle button[data-value=""]'); if (t) { t.click(); return; } const s = l.querySelector('select[aria-label="Sell by"]'); s.value = ''; s.dispatchEvent(new Event('change', { bubbles: true })); }); await wait(300);
const sw = await p.evaluate(() => { const l = [...document.querySelectorAll('.cart-line')].pop(); return l?.querySelector('.unit-toggle [aria-checked=true]')?.dataset.value ?? l?.querySelector('select[aria-label="Sell by"]')?.value; });
check('…and the line can be switched to single tablets', sw === '', sw);
await p.screenshot({ path: path.join(out, 'wholesale.png'), fullPage: true });
await p.evaluate(() => [...document.querySelectorAll('button')].find((x) => /Clear all/.test(x.textContent))?.click()); await wait(300);

// 4. the admin sets the selling units ahead: a pair, a half strip (from the strip), the till starting on a strip and no
//    single tablets
const click = (sel, re) => p.evaluate((s, src) => { const r = new RegExp(src); const el = [...document.querySelectorAll(s)].filter((x) => r.test(x.textContent.trim())).pop(); el?.click(); return !!el; }, sel, re.source);
await go('/medicines'); await setVal('.page-head input.search', 'Paramol'); await wait(500);
check('the medicine list offers Selling units', await click('tbody button', /^Selling units/)); await wait(400);
await click('.modal button', /^\+ Pair/); await click('.modal button', /^\+ Half strip \(5\)/); await wait(200);
await p.evaluate(() => { document.querySelector('.modal input[aria-label="Till starts on Strip"]').click(); const c = [...document.querySelectorAll('.modal label')].find((l) => /sold loose/.test(l.innerText))?.querySelector('input[type=checkbox]'); if (c?.checked) c.click(); }); await wait(200);
await p.screenshot({ path: path.join(out, 'selling-units.png') });
await click('.modal button', /Save selling units/); await wait(500);
let rec = null;
for (let k = 0; k < 20; k++) { rec = (await exp()).products.find((x) => x.id === 'pk-para'); if (rec?.sellAs === 'Strip') break; await wait(500); }
check('saved: Pair 2, Half strip 5, Strip 10, Box 100; the till starts on Strip; not sold loose', rec && rec.sellAs === 'Strip' && rec.loose === false && (rec.packs || []).map((k) => `${k.name}=${k.size}`).join() === 'Pair=2,Half strip=5,Strip=10,Box=100', JSON.stringify(rec && { packs: rec.packs, sellAs: rec.sellAs, loose: rec.loose }));
await go('/pos');
await p.focus('.pos-products input.search'); await p.keyboard.type('7009001'); await p.keyboard.press('Enter'); await wait(500);
const strip = await p.evaluate(() => { const l = document.querySelector('.cart-line'); const s = l?.querySelector('select[aria-label="Sell by"]'); return { by: s?.value ?? l?.querySelector('.unit-toggle [aria-checked=true]')?.dataset.value, opts: s ? [...s.options].map((o) => o.value).join() : '', text: l?.innerText.replace(/\s+/g, ' ') }; });
check('the till starts on a strip at 550, offers pair, half strip, strip and box, and no single tablet', strip.by === 'Strip' && strip.opts === 'Pair,Half strip,Strip,Box' && /550/.test(strip.text || ''), JSON.stringify(strip));
await p.evaluate(() => [...document.querySelectorAll('button')].find((x) => /Clear all/.test(x.textContent))?.click()); await wait(300);

// 5. change the unit of issue: Amoxi was counted in boxes; 1 box = 100 capsules
await go('/medicines'); await setVal('.page-head input.search', 'Amoxi'); await wait(500);
await click('tbody button', /^Selling units/); await wait(300);
check('Selling units offers Change unit of issue to an admin', await click('.modal button', /Change unit of issue/)); await wait(300);
await setVal('.modal input[list="unit-names"]', 'Capsule'); await setVal('.modal input[type=number]', 100); await wait(200);
await click('.modal button', /^Change unit$/); await wait(400);
await click('.modal button', /^Change unit$/); await wait(800); // the confirmation
let data = null, amx = null;
for (let k = 0; k < 20; k++) { data = await exp(); amx = data.products.find((x) => x.id === 'pk-amx'); if (amx?.unit === 'Capsule') break; await wait(500); }
const amxStock = data.movements.filter((m) => m.productId === 'pk-amx').reduce((a, m) => a + m.qty, 0);
check('stock 5 boxes → 500 capsules by a Unit change movement', amxStock === 500 && data.movements.some((m) => m.productId === 'pk-amx' && m.type === 'Unit change' && m.qty === 495 && m.batchId === 'pk-b9'), amxStock);
check('price 10,000 → 100 a capsule, cost 70, reorder 2 → 200, the box kept as a pack at 10,000', amx && amx.price === 100 && amx.cost === 70 && amx.reorder === 200 && (amx.packs || []).some((k) => k.name === 'Box' && k.size === 100 && k.price === 10000), JSON.stringify(amx && { price: amx.price, cost: amx.cost, reorder: amx.reorder, packs: amx.packs }));
check('the batch costs 70 a capsule, and the change is in the audit log', data.batches.find((x) => x.id === 'pk-b9')?.cost === 70 && data.audit.some((a) => a.action === 'Unit of issue changed' && /1 Box = 100 Capsule/.test(a.details)));

await b.close();
await owner('/tenants/' + tid + '/delete', { confirm: T.tenant.slug });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

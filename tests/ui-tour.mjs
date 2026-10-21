// Screenshot tour of the main screens (desktop and phone, light and dark) with realistic data, for design review.
// Every page must render without errors.   node ui-tour.mjs <base> <ownerKey> <outDir>
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
import { CHROME } from './chrome.mjs';
const [base, ownerKey, out] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + String(x).slice(0, 200) : ''}`); };
const owner = (p, body) => fetch(base + '/api/owner' + p, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ownerKey }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());
const iso = (n) => new Date(Date.now() - n * 864e5).toISOString();
const day = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

const t = await owner('/tenants', { name: 'Kampala Road Pharmacy', admin: { name: 'Grace Namata', email: 'grace@test.rx', password: 'grace-pass-123' } });
const slug = t.tenant.slug, tid = t.tenant.id;
const meds = [['Amoxyl 500mg caps', 'Capsules', 1200, 800, 140], ['Panadol Extra tabs', 'Tablets', 1000, 500, 220], ['Coartem 80/480', 'Tablets', 18000, 13000, 35], ['ORS sachet', 'Sachets', 500, 300, 400],
  ['Cetirizine 10mg', 'Tablets', 300, 120, 18], ['Metformin 500mg', 'Tablets', 250, 120, 600], ['Ventolin inhaler', 'Inhalers', 25000, 19000, 6], ['Flagyl 400mg', 'Tablets', 400, 200, 0], ['Zinc 20mg', 'Tablets', 200, 90, 90], ['Cough syrup 100ml', 'Syrups', 6000, 3800, 24]];
const recs = [{ t: 'suppliers', id: 's1', rec: { name: 'Kampala Medics', phone: '0700000001' } }];
meds.forEach(([name, form, price, cost, qty], i) => {
  recs.push({ t: 'products', id: 'p' + i, rec: { name, generic: name.split(' ')[0], form, price, cost, wholesale: Math.round(price * 0.9), reorder: 20, unit: 'Unit', shelf: 'A' + (i % 4 + 1), barcode: '600100' + i } });
  if (qty) { recs.push({ t: 'batches', id: 'b' + i, rec: { productId: 'p' + i, batch: 'BN' + (100 + i), expiry: day(i === 4 ? 40 : 300 + i * 20), cost } }); recs.push({ t: 'movements', id: 'm' + i, rec: { productId: 'p' + i, qty, type: 'Opening stock', batchId: 'b' + i, branchId: 'main', date: iso(60) } }); }
});
for (let i = 0; i < 30; i++) {
  const items = [meds[i % 10], meds[(i * 3) % 10]].map(([name, , price, cost], k) => ({ id: 'p' + ((k ? i * 3 : i) % 10), name, qty: 1 + (i % 3), price, cost, alloc: [] }));
  const total = items.reduce((a, x) => a + x.qty * x.price, 0);
  recs.push({ t: 'sales', id: 'sale' + i, rec: { number: 'R' + i, date: iso(i * 0.9 + 0.1), type: 'retail', branchId: 'main', items, subtotal: total, discount: 0, tax: 0, total, payment: i % 3 ? 'Cash' : 'Mobile Money', paid: total, customerId: 'walk-in', customerName: 'Walk-in Customer', cashier: 'Grace Namata', status: 'completed' } });
}
await owner('/tenants/' + tid + '/records', { records: recs });
await owner('/tenants/' + tid, { features: { catalog: false } });

const b = await puppeteer.launch({ executablePath: CHROME, headless: true });
const errors = [];
const P = await (await b.createBrowserContext()).newPage();
P.on('pageerror', (e) => errors.push(e.message));
await P.setViewport({ width: 1440, height: 900 });
await P.goto(base + '/' + slug, { waitUntil: 'networkidle2' }); await wait(800);
await P.screenshot({ path: path.join(out, 'signin.png') });
await P.type('input[type=email]', 'grace@test.rx'); await P.type('input[type=password]', 'grace-pass-123');
await P.evaluate(() => [...document.querySelectorAll('button')].find((x) => x.textContent.includes('Sign in')).click());
await P.waitForSelector('.sidebar', { timeout: 20000 }); await wait(4000);
await P.evaluate(() => document.querySelectorAll('.popups button, .popup button').forEach((x) => /close|dismiss|later|×/i.test(x.textContent + x.ariaLabel) && x.click()));
const pages = [['dashboard', '/'], ['pos', '/pos'], ['add-stock', '/add-stock'], ['inventory', '/inventory'], ['stock-count', '/stock-count'], ['reports', '/reports'], ['settings', '/settings'], ['medicines', '/medicines']];
const shoot = async (tag) => {
  for (const [name, hash] of pages) {
    await P.goto(base + '/' + slug + '#' + hash, { waitUntil: 'networkidle2' }); await wait(1200);
    await P.keyboard.press('Escape');
    const ok = await P.evaluate(() => !!document.querySelector('.page, .pos') && !/Something went wrong/i.test(document.body.innerText));
    check(`${tag}: ${name} renders`, ok);
    await P.screenshot({ path: path.join(out, `${tag}-${name}.png`) });
  }
};
await shoot('desktop-light');
await P.evaluate(() => localStorage.setItem('pharmapos-theme', 'dark')); await P.reload({ waitUntil: 'networkidle2' }); await wait(1500);
await shoot('desktop-dark');
await P.evaluate(() => localStorage.setItem('pharmapos-theme', 'light'));
await P.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }); await P.reload({ waitUntil: 'networkidle2' }); await wait(1500);
await shoot('phone');
check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await b.close();
await owner('/tenants/' + tid + '/delete', { confirm: slug });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

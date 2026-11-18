// Every theme on two pages (dashboard and Sales History) on a PC, for the owner's review of the two-colour themes.
// Only on request: npm test -- shots-themes. Fictional data only.   node shots-themes.mjs <base> <ownerKey> <outDir>
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
import { CHROME } from './chrome.mjs';
import { THEMES } from '../src/themes.js';
const [base, ownerKey, out] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const owner = (p, body) => fetch(base + '/api/owner' + p, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ownerKey }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());
const iso = (n) => new Date(Date.now() - n * 864e5).toISOString();
const day = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

const t = await owner('/tenants', { name: 'Kampala Road Pharmacy', admin: { name: 'Amina Nakato', email: 'amina@themes.rx', password: 'amina-pass-123' } });
const slug = t.tenant.slug, tid = t.tenant.id;
const meds = [['Amoxicillin 500mg Capsules', 'Capsules', 500, 300, 140], ['Paracetamol 500mg', 'Tablets', 100, 40, 900], ['Artemether/Lumefantrine 80/480mg', 'Tablets', 18000, 13000, 12],
  ['ORS sachet', 'Sachets', 500, 300, 400], ['Salbutamol 100mcg Inhaler', 'Inhalers', 25000, 19000, 3], ['Metformin 500mg', 'Tablets', 250, 120, 0]];
const recs = [];
meds.forEach(([name, form, price, cost, qty], i) => {
  recs.push({ t: 'products', id: 'p' + i, rec: { name, generic: name.split(' ')[0], form, price, cost, reorder: 20, unit: 'Unit', shelf: 'A' + (i + 1) } });
  if (qty) {
    recs.push({ t: 'batches', id: 'b' + i, rec: { productId: 'p' + i, batch: 'B-' + (1000 + i), expiry: day(i === 2 ? 30 : i === 4 ? -10 : 400), cost } });
    recs.push({ t: 'movements', id: 'm' + i, rec: { productId: 'p' + i, qty, type: 'Opening stock', batchId: 'b' + i, branchId: 'main', date: iso(60) } });
  }
});
for (let i = 0; i < 12; i++) {
  const [name, , price, cost] = meds[i % 6];
  recs.push({ t: 'sales', id: 'sale' + i, rec: { number: 'R' + (100 + i), date: iso(i * 0.9 + 0.05), type: 'retail', branchId: 'main', items: [{ id: 'p' + (i % 6), name, qty: 2, price, cost, alloc: [] }], subtotal: price * 2, discount: 0, tax: 0, total: price * 2,
    payment: i % 4 === 0 ? 'Credit' : 'Cash', paid: i % 4 === 0 ? 0 : price * 2, customerId: i % 4 === 0 ? 'c1' : 'walk-in', customerName: i % 4 === 0 ? 'Mukono Clinic' : 'Walk-in Customer', cashier: 'Amina Nakato', status: 'completed' } });
}
recs.push({ t: 'customers', id: 'c1', rec: { name: 'Mukono Clinic', type: 'Clinic / Hospital', phone: '0700000101' } });
await owner('/tenants/' + tid + '/records', { records: recs });
await owner('/tenants/' + tid, { features: { catalog: false } });

const b = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
const P = await (await b.createBrowserContext()).newPage();
await P.setViewport({ width: 1440, height: 900 });
await P.goto(base + '/' + slug, { waitUntil: 'networkidle2' }); await wait(600);
await P.type('input[autocomplete=username]', 'amina@themes.rx'); await P.type('input[type=password]', 'amina-pass-123');
await P.evaluate(() => [...document.querySelectorAll('button')].find((x) => x.textContent.includes('Sign in')).click());
await P.waitForSelector('.sidebar', { timeout: 20000 }); await wait(3000);
for (const [i, th] of THEMES.entries()) {
  await P.evaluate((id) => { localStorage.setItem('pharmapos-theme', id); localStorage.removeItem('rxpos-theme-mode'); location.hash = '#/'; }, th.id);
  await P.reload({ waitUntil: 'networkidle2' }); await wait(2200);
  await P.evaluate(() => document.querySelectorAll('.popups button, .popup button').forEach((x) => /close|dismiss|later|×/i.test(x.textContent + x.ariaLabel) && x.click()));
  const n = String(i + 1).padStart(2, '0');
  await P.screenshot({ path: path.join(out, `${n}-${th.id}-dashboard.png`) });
  await P.evaluate(() => { location.hash = '#/sales'; }); await wait(1500);
  await P.screenshot({ path: path.join(out, `${n}-${th.id}-sales.png`) });
}
await b.close();
await owner('/tenants/' + tid + '/delete', { confirm: slug });
console.log(`PASS  ${THEMES.length} themes × 2 pages in ${out}\n\n1 passed, 0 failed`);

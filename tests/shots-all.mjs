// Every page the administrator can open, on a PC (1440 × 900) and a phone (390 × 844), for design review.
// Only on request: npm test -- shots-all. Fictional data only.   node shots-all.mjs <base> <ownerKey> <outDir> [filter]
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
import { CHROME } from './chrome.mjs';
const [base, ownerKey, out, filter = process.env.SHOTS || ''] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const owner = (p, body) => fetch(base + '/api/owner' + p, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ownerKey }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());
const iso = (n) => new Date(Date.now() - n * 864e5).toISOString();
const day = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

const t = await owner('/tenants', { name: 'Kampala Road Pharmacy', admin: { name: 'Amina Nakato', email: 'amina@shots.rx', password: 'amina-pass-123' } });
const slug = t.tenant.slug, tid = t.tenant.id;
const meds = [['Amoxicillin 500mg Capsules', 'Capsules', 500, 300, 140], ['Paracetamol 500mg', 'Tablets', 100, 40, 900], ['Artemether/Lumefantrine 80/480mg', 'Tablets', 18000, 13000, 12],
  ['ORS sachet', 'Sachets', 500, 300, 400], ['Salbutamol 100mcg Inhaler', 'Inhalers', 25000, 19000, 3], ['Metformin 500mg', 'Tablets', 250, 120, 0], ['Cetirizine 10mg', 'Tablets', 200, 80, 60], ['Omeprazole 20mg', 'Capsules', 400, 150, 25]];
const recs = [];
meds.forEach(([name, form, price, cost, qty], i) => {
  recs.push({ t: 'products', id: 'p' + i, rec: { name, generic: name.split(' ')[0], form, price, cost, wholesale: Math.round(price * 0.9), reorder: 20, unit: 'Unit', shelf: 'A' + (i + 1), barcode: '600200' + i } });
  if (qty) {
    recs.push({ t: 'batches', id: 'b' + i, rec: { productId: 'p' + i, batch: 'B-2026-' + (1000 + i), expiry: day(i === 2 ? 30 : i === 4 ? -10 : 400), cost } });
    recs.push({ t: 'movements', id: 'm' + i, rec: { productId: 'p' + i, qty, type: 'Opening stock', batchId: 'b' + i, branchId: 'main', date: iso(60) } });
  }
});
for (let i = 0; i < 24; i++) {
  const [name, , price, cost] = meds[i % 6];
  const total = price * 2;
  recs.push({ t: 'sales', id: 'sale' + i, rec: { number: 'R' + (100 + i), date: iso(i * 1.3 + 0.05), type: 'retail', branchId: 'main', items: [{ id: 'p' + (i % 6), name, qty: 2, price, cost, alloc: [] }], subtotal: total, discount: 0, tax: 0, total,
    payment: i % 5 === 0 ? 'Credit' : 'Cash', paid: i % 5 === 0 ? 0 : total, customerId: i % 5 === 0 ? 'c1' : 'walk-in', customerName: i % 5 === 0 ? 'Mukono Clinic' : 'Walk-in Customer', cashier: 'Amina Nakato', status: 'completed' } });
}
recs.push({ t: 'customers', id: 'c1', rec: { name: 'Mukono Clinic', type: 'Clinic / Hospital', phone: '0700000101' } });
recs.push({ t: 'suppliers', id: 'sup1', rec: { name: 'Lakeside Pharma Distributors', phone: '0700000202' } });
recs.push({ t: 'expenses', id: 'e1', rec: { date: iso(2), category: 'Rent', amount: 450000, note: 'Shop rent' } });
await owner('/tenants/' + tid + '/records', { records: recs });
await owner('/tenants/' + tid, { features: { catalog: false } });

const b = await puppeteer.launch({ executablePath: CHROME, headless: true });
const P = await (await b.createBrowserContext()).newPage();
await P.setViewport({ width: 1440, height: 900 });
await P.goto(base + '/' + slug, { waitUntil: 'networkidle2' }); await wait(600);
await P.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('rxpos-tip')) localStorage.removeItem(k); });
await P.type('input[autocomplete=username]', 'amina@shots.rx'); await P.type('input[type=password]', 'amina-pass-123');
await P.evaluate(() => [...document.querySelectorAll('button')].find((x) => x.textContent.includes('Sign in')).click());
await P.waitForSelector('.sidebar', { timeout: 20000 }); await wait(4000);
// every page the menu lists (folded groups opened first)
await P.evaluate(() => document.querySelectorAll('.nav-group.collapsed .nav-title').forEach((x) => x.click())); await wait(400);
const routes = [...new Set(await P.evaluate(() => [...document.querySelectorAll('.sidebar nav a[href]')].map((a) => a.getAttribute('href').replace(/^#/, ''))))].filter((r) => !filter || r.includes(filter));
fs.writeFileSync(path.join(out, 'routes.txt'), routes.join('\n'));
const name = (r) => (r === '/' ? 'dashboard' : r.slice(1).replace(/\//g, '-'));
for (const [w, h, tag] of [[1440, 900, 'pc'], [390, 844, 'phone']]) {
  await P.setViewport({ width: w, height: h, isMobile: tag === 'phone', hasTouch: tag === 'phone', deviceScaleFactor: 1 });
  for (const [i, r] of routes.entries()) {
    await P.evaluate((x) => { location.hash = x; }, r); await wait(1300);
    await P.evaluate(() => document.querySelectorAll('.popups button, .popup button').forEach((x) => /close|dismiss|later|×/i.test(x.textContent + x.ariaLabel) && x.click()));
    await P.screenshot({ path: path.join(out, `${String(i).padStart(2, '0')}-${name(r)}-${tag}.png`), fullPage: tag === 'phone' ? false : false });
  }
}
await b.close();
await owner('/tenants/' + tid + '/delete', { confirm: slug });
console.log(`PASS  ${routes.length} pages × 2 screenshots in ${out}\n\n1 passed, 0 failed`);

// Screens fit phones, tablets and desktops, with large text and long names: nothing runs off the side of the page,
// the pharmacy's name is shown in full, the dashboard keeps New sale in reach and the till keeps Charge on screen.
// Screenshots for design review go to <outDir>.   node ui-fit.mjs <base> <ownerKey> <outDir>
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
const iso = (n) => new Date(Date.now() - n * 864e5).toISOString();
const day = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

// made-up pharmacy with a long name and long medicine names
const PHARMACY = 'St. Bernadette Community Pharmacy & Wellness Centre Nakawa';
const t = await owner('/tenants', { name: PHARMACY, admin: { name: 'Amina Nakato', email: 'amina@test.rx', password: 'amina-pass-123' } });
const slug = t.tenant.slug, tid = t.tenant.id;
const meds = [
  ['Amoxicillin + Clavulanic Acid 625mg Film-Coated Tablets (Augmentin Duo)', 'Tablets', 2500, 1700, 140],
  ['Paracetamol 500mg', 'Tablets', 100, 40, 900],
  ['Artemether / Lumefantrine 80/480mg Dispersible Tablets Paediatric Pack', 'Tablets', 18000, 13000, 12],
  ['ORS sachet', 'Sachets', 500, 300, 400],
  ['Salbutamol 100mcg Metered Dose Inhaler with Spacer Device', 'Inhalers', 25000, 19000, 3],
  ['Metformin 500mg', 'Tablets', 250, 120, 0],
];
const recs = [];
meds.forEach(([name, form, price, cost, qty], i) => {
  recs.push({ t: 'products', id: 'p' + i, rec: { name, generic: name.split(' ')[0], form, price, cost, wholesale: Math.round(price * 0.9), reorder: 20, unit: 'Unit', shelf: 'A' + (i + 1), barcode: '600200' + i } });
  if (qty) {
    recs.push({ t: 'batches', id: 'b' + i, rec: { productId: 'p' + i, batch: 'LONGBATCH-2026-' + (1000 + i), expiry: day(i === 2 ? 30 : i === 4 ? -10 : 400), cost } });
    recs.push({ t: 'movements', id: 'm' + i, rec: { productId: 'p' + i, qty, type: 'Opening stock', batchId: 'b' + i, branchId: 'main', date: iso(60) } });
  }
});
for (let i = 0; i < 12; i++) {
  const [name, , price, cost] = meds[i % 4];
  const total = price * 2;
  recs.push({ t: 'sales', id: 'sale' + i, rec: { number: 'R' + i, date: iso(i * 0.7 + 0.05), type: 'retail', branchId: 'main', items: [{ id: 'p' + (i % 4), name, qty: 2, price, cost, alloc: [] }], subtotal: total, discount: 0, tax: 0, total,
    payment: 'Cash', paid: total, customerId: 'walk-in', customerName: 'Walk-in Customer', cashier: 'Amina Nakato', status: 'completed' } });
}
await owner('/tenants/' + tid + '/records', { records: recs });
await owner('/tenants/' + tid, { features: { catalog: false } });

const b = await puppeteer.launch({ executablePath: CHROME, headless: true });
const errors = [];
const P = await (await b.createBrowserContext()).newPage();
P.on('pageerror', (e) => errors.push(e.message));
await P.setViewport({ width: 1440, height: 900 });
await P.goto(base + '/' + slug, { waitUntil: 'networkidle2' }); await wait(800);
await P.type('input[autocomplete=username]', 'amina@test.rx'); await P.type('input[type=password]', 'amina-pass-123');
await P.evaluate(() => [...document.querySelectorAll('button')].find((x) => x.textContent.includes('Sign in')).click());
await P.waitForSelector('.sidebar', { timeout: 20000 }); await wait(4000);
const closePopups = () => P.evaluate(() => document.querySelectorAll('.popups button, .popup button').forEach((x) => /close|dismiss|later|×/i.test(x.textContent + x.ariaLabel) && x.click()));
await closePopups();

const pages = [['dashboard', '/'], ['pos', '/pos'], ['inventory', '/inventory'], ['expiry', '/expiry'], ['sales', '/sales'], ['medicines', '/medicines'], ['reports', '/reports']];
// what runs past the right edge of the window (inside a scrolling box is fine: the box scrolls)
const overflow = () => P.evaluate(() => {
  const W = document.documentElement.clientWidth;
  const page = document.documentElement.scrollWidth - W;
  const scrolls = (el) => { for (let e = el.parentElement; e; e = e.parentElement) { const s = getComputedStyle(e); if (/(auto|scroll|hidden|clip)/.test(s.overflowX) && e !== document.body && e !== document.documentElement) return true; } return false; };
  const out = [];
  for (const el of document.querySelectorAll('.topbar *, .page *, .pos *, .bottom-nav *')) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height || getComputedStyle(el).position === 'fixed' && el.closest('.popups')) continue;
    if (r.right > W + 1 && !scrolls(el)) out.push((el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : el.tagName.toLowerCase()) + ` (${Math.round(r.right - W)}px)`);
  }
  return { page, out: [...new Set(out)].slice(0, 6) };
});

const shoot = async (tag) => {
  for (const [name, hash] of pages) {
    await P.goto(base + '/' + slug + '#' + hash, { waitUntil: 'networkidle2' }); await wait(1000);
    await P.keyboard.press('Escape'); await closePopups();
    const ok = await P.evaluate(() => !!document.querySelector('.page, .pos') && !/Something went wrong/i.test(document.body.innerText));
    const o = await overflow();
    check(`${tag}: ${name} renders and fits the width`, ok && o.page <= 1 && !o.out.length, `page +${o.page}px ${o.out.join(', ')}`);
    await P.screenshot({ path: path.join(out, `${tag}-${name}.png`), fullPage: name === 'dashboard' });
  }
};

const nameShown = () => P.evaluate((full) => [...document.querySelectorAll('.store-name, .welcome-store')].filter((e) => e.getClientRects().length)
  .every((e) => e.textContent.includes(full) && e.scrollWidth <= e.clientWidth + 1), PHARMACY);

for (const [tag, vp] of [['desktop', { width: 1440, height: 900 }], ['laptop', { width: 1100, height: 760 }], ['tablet', { width: 768, height: 1024, isMobile: true, hasTouch: true }],
  ['phone', { width: 390, height: 844, isMobile: true, hasTouch: true }], ['small-phone', { width: 360, height: 740, isMobile: true, hasTouch: true }]]) {
  await P.setViewport(vp); await P.reload({ waitUntil: 'networkidle2' }); await wait(1200);
  await shoot(tag);
  await P.goto(base + '/' + slug + '#/', { waitUntil: 'networkidle2' }); await wait(800);
  check(`${tag}: the pharmacy's full name is shown, not cut off`, await nameShown());
  const sale = await P.evaluate(() => { const a = [...document.querySelectorAll('a,button')].find((x) => /New sale/i.test(x.textContent) && x.getClientRects().length); if (!a) return null; const r = a.getBoundingClientRect(); return { top: r.top, h: r.height }; });
  check(`${tag}: New sale is in view at the top of the dashboard`, !!sale && sale.top < 400 && sale.h >= 40, JSON.stringify(sale));
}

// large text: a 390 px phone zoomed to 150 % lays out at 260 px; long names wrap instead of pushing the page wider
await P.setViewport({ width: 260, height: 563, isMobile: true, hasTouch: true, deviceScaleFactor: 3 }); await P.reload({ waitUntil: 'networkidle2' }); await wait(1200);
await shoot('phone-large-text');
await P.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true }); await P.reload({ waitUntil: 'networkidle2' }); await wait(1200);

// the till on a phone: a long medicine in the sale, Charge fully on screen and not covered
await P.goto(base + '/' + slug + '#/pos', { waitUntil: 'networkidle2' }); await wait(1200);
await P.tap('.product-grid .product'); await wait(500);
const charge = await P.evaluate(() => {
  const btn = [...document.querySelectorAll('.sheet-handle button, .pos-cart button')].find((x) => /Charge/.test(x.textContent) && x.getClientRects().length);
  if (!btn) return { found: false };
  const r = btn.getBoundingClientRect();
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return { found: true, inside: r.left >= 0 && r.right <= document.documentElement.clientWidth + 1 && r.bottom <= innerHeight + 1, top: btn.contains(hit) };
});
check('phone till: Charge is fully on screen and nothing covers it', charge.found && charge.inside && charge.top, JSON.stringify(charge));
await P.screenshot({ path: path.join(out, 'phone-pos-docked.png') });

check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await b.close();
await owner('/tenants/' + tid + '/delete', { confirm: slug });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

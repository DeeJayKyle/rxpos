// The till on a phone, as people really use it: an Android phone (412 × 915 and 360 × 740), with the phone's larger
// text setting (Android scales every font; text-size-adjust 130 % here), three medicines in the sale and the sale open.
// Everything needed to finish the sale must be on screen without hunting: Charge, the total, the payment choices;
// nothing cut off at the top, nothing under the bottom bar.   node pos-phone.mjs <base> <ownerKey> <outDir>
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
import { CHROME } from './chrome.mjs';
const [base, ownerKey, out] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + String(x).slice(0, 300) : ''}`); };
const owner = (p, body) => fetch(base + '/api/owner' + p, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ownerKey }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());
const iso = (n) => new Date(Date.now() - n * 864e5).toISOString();
const day = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

const t = await owner('/tenants', { name: 'Kireka Hill Pharmacy', admin: { name: 'Joan Akello', email: 'joan@test.rx', password: 'joan-pass-1234' } });
const slug = t.tenant.slug, tid = t.tenant.id;
const meds = [['MoxaForte 500mg Caps', 2000], ['Paracetamol 500mg Tablets', 500], ['Artemether / Lumefantrine 80/480mg Tablets', 14500]];
const recs = [];
meds.forEach(([name, price], i) => {
  recs.push({ t: 'products', id: 'p' + i, rec: { name, generic: name.split(' ')[0], form: 'Tablets', price, cost: Math.round(price * 0.6), reorder: 5, unit: 'Unit', barcode: '700300' + i } });
  recs.push({ t: 'batches', id: 'b' + i, rec: { productId: 'p' + i, batch: 'B' + i, expiry: day(500), cost: Math.round(price * 0.6) } });
  recs.push({ t: 'movements', id: 'm' + i, rec: { productId: 'p' + i, qty: 200, type: 'Opening stock', batchId: 'b' + i, branchId: 'main', date: iso(30) } });
});
await owner('/tenants/' + tid + '/records', { records: recs });
await owner('/tenants/' + tid, { features: { catalog: false } });

const b = await puppeteer.launch({ executablePath: CHROME, headless: true });
const errors = [];
for (const [tag, vp, zoom] of [['android-412', { width: 412, height: 915 }, 130], ['android-360', { width: 360, height: 740 }, 130], ['phone-390', { width: 390, height: 844 }, 100]]) {
  const P = await (await b.createBrowserContext()).newPage();
  P.on('pageerror', (e) => errors.push(e.message));
  await P.setViewport({ ...vp, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  // the phone's text size (Android WebView's text zoom works like text-size-adjust)
  await P.evaluateOnNewDocument((z) => { document.addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = `html { -webkit-text-size-adjust: ${z}% !important; text-size-adjust: ${z}% !important; }`; document.head.appendChild(s); }); }, zoom);
  await P.goto(base + '/' + slug, { waitUntil: 'networkidle2' }); await wait(800);
  await P.type('input[autocomplete=username]', 'joan@test.rx'); await P.type('input[type=password]', 'joan-pass-1234');
  await P.evaluate(() => [...document.querySelectorAll('button')].find((x) => x.textContent.includes('Sign in')).click());
  await P.waitForSelector('.bottom-nav', { timeout: 20000 }); await wait(3000);
  await P.goto(base + '/' + slug + '#/pos', { waitUntil: 'networkidle2' }); await wait(1500);
  await P.evaluate(() => document.querySelectorAll('.page-tip button').forEach((x) => /Got it/i.test(x.textContent) && x.click()));
  for (let i = 0; i < 3; i++) { await P.evaluate((n) => document.querySelectorAll('.product-grid .product')[n]?.click(), i); await wait(300); }
  // docked: Charge and the total in reach, not under the bottom bar
  const docked = await P.evaluate(() => {
    const h = document.querySelector('.sheet-handle'), c = h && [...h.querySelectorAll('button')].find((x) => /Charge/.test(x.textContent));
    if (!c) return { found: false };
    const r = c.getBoundingClientRect(), hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { found: true, onScreen: r.top >= 0 && r.bottom <= innerHeight && r.right <= innerWidth + 1, uncovered: c.contains(hit), text: h.innerText.replace(/\s+/g, ' ') };
  });
  check(`${tag}: docked sale shows the total and Charge, uncovered`, docked.found && docked.onScreen && docked.uncovered && /3 items/.test(docked.text), JSON.stringify(docked));
  await P.screenshot({ path: path.join(out, `${tag}-docked.png`) });
  // open the sale
  await P.evaluate(() => document.querySelector('.sheet-handle .grow')?.click()); await wait(700);
  const open = await P.evaluate(() => {
    const s = document.querySelector('.pos-cart.sheet.open'); if (!s) return { open: false };
    const sr = s.getBoundingClientRect(), W = document.documentElement.clientWidth, H = innerHeight;
    const vis = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { top: Math.round(r.top), bottom: Math.round(r.bottom), shown: r.top >= 0 && r.bottom <= H && r.left >= 0 && r.right <= W + 1 && !!hit && el.contains(hit) }; };
    const charge = [...s.querySelectorAll('button')].find((x) => /^Charge/.test(x.textContent.trim()) && x.getClientRects().length);
    const cash = [...s.querySelectorAll('.pay-methods .chip')].find((x) => /Cash/.test(x.textContent));
    const lines = [...s.querySelectorAll('.cart-line')].map((l) => Math.round(l.getBoundingClientRect().height));
    const wide = [...s.querySelectorAll('*')].filter((e) => { const r = e.getBoundingClientRect(); return r.width && r.right > W + 1; }).length;
    // anything cut off: a clipped box whose content is taller than it (not a list meant to scroll)
    const clipped = [...s.querySelectorAll('.sale-tabs, .cart-head, .cart-tools')].filter((e) => getComputedStyle(e).overflowY !== 'visible' && e.scrollHeight > e.clientHeight + 2).map((e) => e.className);
    return { open: true, sheetTop: Math.round(sr.top), charge: vis(charge), cash: vis(cash), lines, wide, clipped, H };
  });
  check(`${tag}: the open sale starts below the top of the screen`, open.open && open.sheetTop >= 0, JSON.stringify({ top: open.sheetTop }));
  check(`${tag}: Charge is on screen and tappable with the sale open`, !!open.charge?.shown, JSON.stringify(open.charge));
  check(`${tag}: nothing in the sale is cut off or runs off the side`, open.open && !open.wide && !open.clipped.length, JSON.stringify({ wide: open.wide, clipped: open.clipped }));
  check(`${tag}: each medicine line is compact (≤ 190 px, even a long two-line name at large text)`, open.lines.length === 3 && open.lines.every((h) => h <= 190), JSON.stringify(open.lines));
  await P.screenshot({ path: path.join(out, `${tag}-open.png`) });
  // Charge from the open sale takes the payment: the sale completes
  await P.evaluate(() => [...document.querySelectorAll('.pos-cart button')].find((x) => /^Charge/.test(x.textContent.trim()) && x.getClientRects().length)?.click()); await wait(1500);
  const done = await P.evaluate(() => /Sale complete|Receipt|Change/i.test(document.querySelector('.modal')?.innerText || ''));
  check(`${tag}: Charge completes the sale`, done);
  await P.screenshot({ path: path.join(out, `${tag}-charged.png`) });
  await P.close();
}
check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await b.close();
await owner('/tenants/' + tid + '/delete', { confirm: slug });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

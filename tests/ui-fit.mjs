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

// every page the admin can open (each one in the menu, and the owner console), at both phone sizes: nothing runs off
// the side, and the top bar has Back on every page but the dashboard
const routes = await P.evaluate(() => [...new Set([...document.querySelectorAll('.sidebar nav a[href]')].map((a) => a.getAttribute('href').replace(/^#/, '')))]);
check('the menu lists the admin\'s pages', routes.length >= 30, routes.length);
const backShown = () => P.evaluate(() => { const b = document.querySelector('.topbar .back-btn'); if (!b) return null; const r = b.getBoundingClientRect(); return r.width >= 40 && r.height >= 40 && r.left >= 0; });
for (const [tag, vp] of [['phone', { width: 390, height: 844, isMobile: true, hasTouch: true }], ['small-phone', { width: 360, height: 740, isMobile: true, hasTouch: true }]]) {
  await P.setViewport(vp); await P.reload({ waitUntil: 'networkidle2' }); await wait(1200);
  const bad = [], noBack = [];
  for (const r of routes) {
    await P.goto(base + '/' + slug + '#' + r, { waitUntil: 'networkidle2' }); await wait(700);
    await P.keyboard.press('Escape'); await closePopups(); await wait(150);
    const ok = await P.evaluate(() => !!document.querySelector('.page, .pos') && !/Something went wrong/i.test(document.body.innerText));
    const o = await overflow();
    if (!ok || o.page > 1 || o.out.length) bad.push(`${r}: ${ok ? '' : 'did not render '}+${o.page}px ${o.out.join(', ')}`);
    if (!!(await backShown()) !== (r !== '/')) noBack.push(r);
    await P.screenshot({ path: path.join(out, `${tag}-all${r.replace(/\//g, '_') || '_home'}.png`) });
  }
  check(`${tag}: all ${routes.length} pages render and fit the width`, !bad.length, bad.join(' | '));
  check(`${tag}: Back is in the top bar on every page but the dashboard`, !noBack.length, noBack.join(', '));
  // an open form: Add medicine is a sheet that fits the screen, its title bar and Save in view
  await P.goto(base + '/' + slug + '#/medicines', { waitUntil: 'networkidle2' }); await wait(800);
  await P.evaluate(() => [...document.querySelectorAll('.page button')].find((x) => /Add medicine/i.test(x.textContent))?.click()); await wait(700);
  const sheet = await P.evaluate(() => {
    const m = document.querySelector('.modal'); if (!m) return { found: false };
    const r = m.getBoundingClientRect(), W = document.documentElement.clientWidth, H = innerHeight;
    const save = [...m.querySelectorAll('button')].find((x) => /^Save/.test(x.textContent.trim()));
    const s = save?.getBoundingClientRect(), head = m.querySelector('.modal-head').getBoundingClientRect();
    const wide = [...m.querySelectorAll('*')].filter((e) => e.getBoundingClientRect().right > W + 1).length;
    return { found: true, fits: r.left >= -1 && r.right <= W + 1 && r.top >= -1 && r.bottom <= H + 1, wide, save: !!s && s.bottom <= H + 1 && s.top >= 0, head: head.top >= -1 };
  });
  check(`${tag}: Add medicine opens as a sheet that fits the screen, Save in view`, sheet.found && sheet.fits && !sheet.wide && sheet.save && sheet.head, JSON.stringify(sheet));
  await P.screenshot({ path: path.join(out, `${tag}-sheet-add-medicine.png`) });
  await P.keyboard.press('Escape'); await wait(400);
}
// owner console (web): fits a phone too
await P.goto(base + '/' + slug + '#/owner', { waitUntil: 'networkidle2' }); await wait(1200);
const ownerFit = await P.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
check('small-phone: owner console fits the width', ownerFit <= 1, `+${ownerFit}px`);
await P.screenshot({ path: path.join(out, 'small-phone-owner.png') });

// Back and swipe-back on a phone: Stock from the tab bar, then Back returns to the dashboard; again, then a swipe from
// the left edge does the same; a swipe that starts mid-screen does nothing
// (the owner page may still be fetching Google's sign-in script, which can hang where it is blocked: wait for the page, not the network)
await P.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true }); await P.goto(base + '/' + slug + '#/', { waitUntil: 'domcontentloaded' }); await wait(2000);
const hash = () => P.evaluate(() => location.hash);
const tabTo = async (label) => { await P.evaluate((l) => [...document.querySelectorAll('.bottom-nav a')].find((a) => a.textContent.trim() === l).click(), label); await wait(700); };
await tabTo('Stock');
check('phone: the Stock tab opens Inventory', (await hash()) === '#/inventory', await hash());
await P.tap('.topbar .back-btn'); await wait(700);
check('phone: Back returns to the dashboard', (await hash()) === '#/', await hash());
check('phone: the dashboard has the menu button instead of Back', await P.evaluate(() => !document.querySelector('.topbar .back-btn') && !!document.querySelector('.topbar .menu-btn')));
const swipe = async (x0, x1, y = 420) => {
  await P.touchscreen.touchStart(x0, y);
  for (let i = 1; i <= 8; i++) { await P.touchscreen.touchMove(x0 + ((x1 - x0) * i) / 8, y + i); await wait(16); }
  await P.touchscreen.touchEnd(); await wait(900);
};
await tabTo('Sales');
await swipe(180, 380);
check('phone: a swipe that starts mid-screen does not go back', (await hash()) === '#/sales', await hash());
const moved = await P.evaluate(async () => { const m = document.querySelector('main.content'); return getComputedStyle(m).left; });
check('phone: the page is back in place after a short swipe', moved === 'auto' || moved === '0px', moved);
await swipe(6, 330);
check('phone: swiping from the left edge goes back', (await hash()) === '#/', await hash());
check('phone: the page is in place after swiping back', await P.evaluate(() => { const m = document.querySelector('main.content'); return m.getBoundingClientRect().left <= 1 && !m.style.left && !document.documentElement.classList.contains('page-swiping'); }));
// opened directly (no history in the app): Back goes to the dashboard
await P.goto(base + '/' + slug + '#/expiry', { waitUntil: 'networkidle2' }); await P.reload({ waitUntil: 'networkidle2' }); await wait(1200);
await P.evaluate(() => history.replaceState({ ...history.state, idx: 0 }, ''));
await P.tap('.topbar .back-btn'); await wait(700);
check('phone: Back on a page opened directly goes to the dashboard', (await hash()) === '#/', await hash());

check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await b.close();
await owner('/tenants/' + tid + '/delete', { confirm: slug });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

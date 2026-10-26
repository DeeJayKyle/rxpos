// Layout audit across the sizes RxPOS really runs at: Android phones (small, large, landscape), tablets, Windows
// laptops and full-HD PCs (the Windows app renders like desktop web). On every main screen it checks for sideways
// page scrolling, elements sticking out of the screen, content hidden behind the phone's bottom bar, and (on touch
// screens) controls too small to tap; it saves a screenshot of each for review. Fictional sample data only.
//   node v35-layout.mjs <base> <ownerKey> <outDir>
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
import { CHROME } from './chrome.mjs';
const [base, ownerKey, out] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0, warnN = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + String(x).slice(0, 400) : ''}`); };
const warn = (n, x) => { warnN++; console.log(`WARN  ${n}  ${String(x).slice(0, 400)}`); };
const owner = (p, body) => fetch(base + '/api/owner' + p, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ownerKey }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());
const setVal = (p, sel, val) => p.evaluate((sel, val) => { const i = document.querySelector(sel); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, val); i.dispatchEvent(new Event('input', { bubbles: true })); }, sel, val);
const iso = (n) => new Date(Date.now() - n * 864e5).toISOString();
const day = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

// ---- a realistic, fictional pharmacy: long names, big numbers, packs, expiring and expired stock ----
const t = await owner('/tenants', { name: 'Sample Health Pharmacy & Wellness Centre', admin: { name: 'Alexandra Namusisi-Kintu', email: 'alex@test.rx', password: 'alex-pass-1234' } });
const slug = t.tenant.slug, tid = t.tenant.id;
const meds = [['Amoxicillin/Clavulanic Acid 625mg Film-coated Tablets', 'Amoxicillin + Clavulanate', 'Tablets', 1850, 1200, 340], ['Paracetamol 500mg', 'Paracetamol', 'Tablets', 100, 40, 2200],
  ['Artemether/Lumefantrine 80/480mg', 'Artemether + Lumefantrine', 'Tablets', 18000, 13000, 35], ['ORS sachet', 'Oral rehydration salts', 'Sachets', 500, 300, 400],
  ['Cetirizine 10mg', 'Cetirizine', 'Tablets', 300, 120, 4], ['Metformin 500mg', 'Metformin', 'Tablets', 250, 120, 1600], ['Salbutamol Inhaler 100mcg', 'Salbutamol', 'Inhalers', 25000, 19000, 6],
  ['Metronidazole 400mg', 'Metronidazole', 'Tablets', 400, 200, 0], ['Zinc Sulphate 20mg Dispersible', 'Zinc', 'Tablets', 200, 90, 90], ['Amoxicillin Suspension 125mg/5ml 100ml', 'Amoxicillin', 'Syrups', 6000, 3800, 24],
  ['Insulin Glargine 100IU/ml Pre-filled Pen', 'Insulin glargine', 'Injections', 145000, 118000, 12], ['Ferrous Sulphate + Folic Acid', 'Iron + Folic acid', 'Tablets', 150, 60, 900]];
const recs = [{ t: 'suppliers', id: 's1', rec: { name: 'Sample Medical Supplies (U) Ltd', phone: '0700000001' } }, { t: 'customers', id: 'c1', rec: { name: 'Jordan Example-Client', phone: '0700000002', allergies: 'Penicillin' } }];
meds.forEach(([name, generic, form, price, cost, qty], i) => {
  recs.push({ t: 'products', id: 'p' + i, rec: { name, generic, form, price, cost, wholesale: Math.round(price * 0.9), reorder: 20, unit: form === 'Tablets' ? 'Tablet' : 'Unit', shelf: 'A' + (i % 4 + 1), barcode: '6001000' + i, category: i % 2 ? 'Antibiotics' : 'Analgesics', ...(form === 'Tablets' ? { packs: [{ name: 'Strip', size: 10 }, { name: 'Box', size: 100 }] } : {}) } });
  if (qty) {
    recs.push({ t: 'batches', id: 'b' + i, rec: { productId: 'p' + i, batch: 'BN-2026-' + (100 + i), expiry: day(i === 4 ? 40 : i === 6 ? -10 : 300 + i * 20), cost } });
    recs.push({ t: 'movements', id: 'm' + i, rec: { productId: 'p' + i, qty, type: 'Opening stock', batchId: 'b' + i, branchId: 'main', date: iso(60) } });
  }
});
for (let i = 0; i < 40; i++) {
  const items = [meds[i % 12], meds[(i * 5) % 12]].map(([name, , , price, cost], k) => ({ id: 'p' + ((k ? i * 5 : i) % 12), name, qty: 1 + (i % 3), price, cost, alloc: [] }));
  const total = items.reduce((a, x) => a + x.qty * x.price, 0);
  recs.push({ t: 'sales', id: 'sale' + i, rec: { number: 'R' + (10000 + i), date: iso(i * 0.7 + 0.05), type: 'retail', branchId: 'main', items, subtotal: total, discount: 0, tax: 0, total, payment: ['Cash', 'Mobile Money', 'Card'][i % 3], paid: total, customerId: 'walk-in', customerName: 'Walk-in Customer', cashier: 'Alexandra Namusisi-Kintu', status: 'completed' } });
}
recs.push({ t: 'expenses', id: 'e1', rec: { date: iso(0.1), amount: 1250000, category: 'Rent', note: 'Monthly rent' } });
await owner('/tenants/' + tid + '/records', { records: recs });
await owner('/tenants/' + tid, { features: { catalog: false } });

const PAGES = ['/', '/pos', '/inventory', '/medicines', '/add-stock', '/stock-count', '/sales', '/reports', '/expiry', '/reorder', '/customers', '/expenses', '/prescriptions', '/drug-info', '/chat', '/calendar', '/settings', '/device'];
const VIEWS = [
  ['android-small', { width: 360, height: 740, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
  ['android', { width: 412, height: 915, isMobile: true, hasTouch: true, deviceScaleFactor: 2.6 }],
  ['android-landscape', { width: 915, height: 412, isMobile: true, hasTouch: true, deviceScaleFactor: 2.6 }],
  ['tablet', { width: 800, height: 1280, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
  ['tablet-landscape', { width: 1280, height: 800, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
  ['pc-laptop', { width: 1366, height: 768 }],
  ['pc-hd', { width: 1920, height: 1080 }],
];

const b = await puppeteer.launch({ executablePath: CHROME, headless: true });
const p = await (await b.createBrowserContext()).newPage();
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
await p.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
await p.setViewport(VIEWS[5][1]);
await p.goto(base + '/' + slug, { waitUntil: 'networkidle2' }); await wait(700);
await setVal(p, 'input[autocomplete=username]', 'alex@test.rx'); await setVal(p, 'input[type=password]', 'alex-pass-1234');
await p.evaluate(() => [...document.querySelectorAll('form button')].find((x) => /^Sign in/.test(x.textContent.trim()))?.click());
await p.waitForSelector('.sidebar', { timeout: 20000 }); await wait(3000);
// first-visit tips off, so screens look as they do day to day (the tips have their own tests)
await p.evaluate(() => { for (const id of ['pos', 'reports', 'inventory', 'add-stock', 'stock-count', 'dashboard']) localStorage.setItem('rxpos-tip:' + id, '1'); });

/** Everything the audit measures on the screen as it is now */
const measure = (touch) => p.evaluate((touch) => {
  const W = window.innerWidth;
  const name = (el) => (el.id ? '#' + el.id : el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '')) + (el.textContent ? ` "${el.textContent.trim().slice(0, 24)}"` : '');
  const visible = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && !el.closest('[hidden], .sidebar:not(.open)'); };
  const scrollsX = (el) => { for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) { const o = getComputedStyle(a).overflowX; if ((o === 'auto' || o === 'scroll' || o === 'hidden') && a.scrollWidth > a.clientWidth + 1) return true; } return false; };
  const inSidebar = (el) => !!el.closest('.sidebar, .drawer-bg, .modal-bg, .bell-menu, .spotlight, .popups, .toasts');
  const pageX = document.documentElement.scrollWidth - W;
  // elements sticking out past the right edge (not inside something that scrolls sideways on purpose, e.g. a table)
  const sticking = [...document.querySelectorAll('.main *, .bottom-nav *')].filter((el) => !inSidebar(el) && visible(el) && el.getBoundingClientRect().right > W + 1 && !scrollsX(el)).slice(0, 6).map(name);
  // touch targets smaller than 32 px (44 is ideal; the main controls are 44)
  const small = touch ? [...document.querySelectorAll('.main button, .main a[href], .main select, .main input:not([type=hidden]), .bottom-nav a, .bottom-nav button')]
    .filter((el) => !inSidebar(el) && visible(el) && !el.closest('table, .chart, .cal-grid, .bubble, .msg-menu') && el.type !== 'checkbox' && el.type !== 'radio')
    .filter((el) => { const r = el.getBoundingClientRect(); return r.height < 32 || r.width < 32; }).map((el) => { const r = el.getBoundingClientRect(); return `${name(el)} ${Math.round(r.width)}×${Math.round(r.height)}`; }) : [];
  // content hidden behind the phone's bottom bar: scroll to the end, then the last element must end above the bar
  const nav = document.querySelector('.bottom-nav');
  let hidden = '';
  if (nav && getComputedStyle(nav).display !== 'none') {
    window.scrollTo(0, document.documentElement.scrollHeight);
    const top = nav.getBoundingClientRect().top;
    const page = document.querySelector('.content > .page, .content > .pos');
    const kids = page ? [...page.querySelectorAll(':scope > *')].filter(visible) : [];
    const last = kids[kids.length - 1];
    if (last && !last.closest('.pos-cart.sheet') && last.getBoundingClientRect().bottom > top + 1 && !last.classList.contains('sheet') && getComputedStyle(last).position !== 'fixed') hidden = `${name(last)} ends at ${Math.round(last.getBoundingClientRect().bottom)}, bar at ${Math.round(top)}`;
    window.scrollTo(0, 0);
  }
  // table columns squeezed so tight that words break letter by letter
  const squeezed = [...document.querySelectorAll('.main th')].filter((th) => visible(th) && th.getBoundingClientRect().width < 36 && th.textContent.trim().length > 3).slice(0, 4).map(name);
  return { pageX, sticking, small: small.slice(0, 8), smallN: small.length, hidden, squeezed, crashed: /Something went wrong/i.test(document.body.innerText) };
}, touch);

const go = async (hash) => { await p.evaluate((h) => { location.hash = h; }, hash); await wait(900); await p.keyboard.press('Escape'); await wait(150); };
for (const [tag, vp] of VIEWS) {
  await p.setViewport(vp); await wait(400);
  for (const hash of PAGES) {
    await go('#' + hash);
    const m = await measure(!!vp.hasTouch);
    const where = `${tag} ${hash}`;
    check(`${where}: renders`, !m.crashed);
    check(`${where}: no sideways page scroll`, m.pageX <= 1, `${m.pageX}px wider · ${m.sticking.join(' | ')}`);
    if (m.sticking.length && m.pageX <= 1) warn(`${where}: elements past the right edge (clipped)`, m.sticking.join(' | '));
    if (m.hidden) check(`${where}: nothing hidden behind the bottom bar`, false, m.hidden);
    if (m.smallN) warn(`${where}: ${m.smallN} small touch target(s)`, m.small.join(' | '));
    if (m.squeezed.length) warn(`${where}: squeezed table columns`, m.squeezed.join(' | '));
    await p.screenshot({ path: path.join(out, `${tag}${hash.replace(/\//g, '_') || '_home'}.png`) });
  }
}
// dark theme spot check at laptop size
await p.evaluate(() => localStorage.setItem('pharmapos-theme', 'hybrid-dark')); await p.setViewport(VIEWS[5][1]);
await p.reload({ waitUntil: 'networkidle2' }); await wait(1500);
for (const hash of ['/', '/pos', '/reports']) { await go('#' + hash); await p.screenshot({ path: path.join(out, `dark-pc-laptop${hash.replace(/\//g, '_')}.png`) }); }

check('no script errors on any screen', !errors.length, errors.slice(0, 3).join(' | '));
await b.close();
await owner('/tenants/' + tid + '/delete', { confirm: slug });
console.log(`\n${warnN} warnings`);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

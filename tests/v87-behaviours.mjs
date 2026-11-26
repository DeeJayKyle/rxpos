// 1.18.0 behaviours (the owner's choice): Control Centre, sheets & gestures, the Dynamic Island, the home screen, the
// App Library, tiling and the till lock screen, each switched on this device and kept after a reload.
//   node v87-behaviours.mjs <base> <ownerKey> <outDir>
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import { CHROME } from './chrome.mjs';
const [base, ownerKey, out] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + String(x).slice(0, 160) : ''}`); };
const owner = (p, body) => fetch(base + '/api/owner' + p, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ownerKey }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());
const setVal = (p, sel, val) => p.evaluate((sel, val) => { const i = document.querySelector(sel); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, val); i.dispatchEvent(new Event('input', { bubbles: true })); }, sel, val);
const click = (p, sel) => p.evaluate((s) => { const el = document.querySelector(s); el?.click(); return !!el; }, sel);
const clickText = (p, sel, re) => p.evaluate((s, r) => { const el = [...document.querySelectorAll(s)].find((x) => new RegExp(r).test(x.textContent.trim())); el?.click(); return !!el; }, sel, re.source);
const attr = (p, k) => p.evaluate((k) => document.documentElement.dataset[k] || '', k);
const openCC = async (p) => { await click(p, '.cc-btn'); await p.waitForSelector('.cc-panel', { timeout: 5000 }); };

const t = await owner('/tenants', { name: 'Island Pharmacy', admin: { name: 'Ivy', email: 'ivy@test.rx', password: 'ivy-pass-12345' } });
const slug = t.tenant.slug, tid = t.tenant.id;
const day = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
await owner('/tenants/' + tid + '/records', { records: [
  { t: 'products', id: 'p1', rec: { name: 'Panadol 500mg', form: 'Tablets', price: 1000, cost: 600, reorder: 5, unit: 'Unit' } },
  { t: 'batches', id: 'b1', rec: { productId: 'p1', batch: 'B1', expiry: day(30), cost: 600 } },
  { t: 'movements', id: 'm1', rec: { productId: 'p1', qty: 3, type: 'Opening stock', batchId: 'b1', branchId: 'main', date: new Date(Date.now() - 5 * 864e5).toISOString() } },
  { t: 'sales', id: 's1', rec: { number: 'R1', date: new Date().toISOString(), type: 'retail', branchId: 'main', items: [{ id: 'p1', name: 'Panadol 500mg', qty: 2, price: 1000, cost: 600, alloc: [] }], subtotal: 2000, discount: 0, tax: 0, total: 2000, payment: 'Cash', paid: 2000, customerId: 'walk-in', customerName: 'Walk-in Customer', cashier: 'Ivy', status: 'completed' } },
] });
await owner('/tenants/' + tid, { features: { catalog: false } });

const b = await puppeteer.launch({ executablePath: CHROME, headless: true });
const p = await (await b.createBrowserContext()).newPage();
await p.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }, { name: 'prefers-reduced-motion', value: 'reduce' }]);
await p.setViewport({ width: 1366, height: 900 });
await p.goto(base + '/' + slug, { waitUntil: 'networkidle2' }); await wait(700);
await setVal(p, 'input[autocomplete=username]', 'ivy@test.rx'); await setVal(p, 'input[type=password]', 'ivy-pass-12345');
await p.evaluate(() => [...document.querySelectorAll('form button')].find((x) => /^Sign in/.test(x.textContent.trim()))?.click());
await p.waitForSelector('.sidebar', { timeout: 20000 }); await wait(2500);
await p.evaluate(() => { location.hash = '#/'; }); await wait(800);

// ---- 1.22.0 (the owner's clean-up): the extras are off on a new device, switched on in This device → Extras ----
check('no Control Centre button on a new device', !(await p.$('.cc-btn')));
await p.evaluate(() => { location.hash = '#/device'; }); await wait(900);
const flip = (re) => p.evaluate((r) => { const row = [...document.querySelectorAll('label.settings-row')].find((x) => new RegExp(r).test(x.textContent)); row?.querySelector('input')?.click(); return !!row; }, re.source);
check('This device → Extras switches on Control Centre and the App Library', (await flip(/^Control Centre/)) && (await flip(/^App Library/)));
await p.evaluate(() => { location.hash = '#/'; }); await wait(600);
check('…and the Control Centre button shows', !!(await p.$('.cc-btn')));

// ---- Control Centre ----
check('everything is off on a new device', !(await attr(p, 'sheets')) && !(await attr(p, 'island')) && !(await attr(p, 'home')) && !(await attr(p, 'tiling')));
await openCC(p);
const tiles = await p.evaluate(() => [...document.querySelectorAll('.cc-tile')].map((x) => x.textContent.trim()));
check('Control Centre has dark mode, gradient, the four behaviours, sync, App Library and lock', ['Dark mode', 'Gradient', 'Sheets & gestures', 'Dynamic Island', 'Home screen', 'Tiling', 'Sync now', 'App Library', 'Lock the till'].every((w) => tiles.some((x) => x.includes(w))), tiles.join(' | '));
await p.screenshot({ path: `${out}/control-centre.png` });
await click(p, '.cc-tile.cc-big'); await wait(400);
check('Dark mode in Control Centre goes to the theme\'s dark twin', (await p.evaluate(() => document.documentElement.dataset.palette)) === 'mint-teal-dark');
await click(p, '.cc-tile.cc-big'); await wait(400);
check('and back to light', (await p.evaluate(() => document.documentElement.dataset.palette)) === 'mint-teal');
for (const id of ['sheets', 'island']) await click(p, `.cc-tile[data-cc="${id}"]`);
await wait(200);
check('Sheets and Dynamic Island switch on', (await attr(p, 'sheets')) === 'on' && (await attr(p, 'island')) === 'on');
await p.keyboard.press('Escape'); await wait(200);
check('Escape closes Control Centre', !(await p.$('.cc-panel')));

// ---- Dynamic Island ----
// a toast from the app: pin this page (it says so in a toast)
await p.evaluate(() => { location.hash = '#/sales'; }); await wait(900);
await p.evaluate(() => document.querySelector('.account-btn')?.click()); await wait(150);
await clickText(p, '.account-drop .menu-item', /^Pin this page$/); await wait(300);
const island = await p.evaluate(() => { const t = document.querySelector('.toasts'), r = t?.getBoundingClientRect(), toast = t?.querySelector('.toast'); return toast ? { top: r.top, mid: Math.round(r.left + r.width / 2), w: innerWidth, bg: getComputedStyle(toast).backgroundColor, radius: parseFloat(getComputedStyle(toast).borderTopLeftRadius) } : null; });
check('a message shows in the Dynamic Island: a black pill at the top centre', island && island.top < 30 && Math.abs(island.mid - island.w / 2) < 40 && island.bg === 'rgb(0, 0, 0)' && island.radius > 100, JSON.stringify(island));
await p.screenshot({ path: `${out}/dynamic-island.png` });

// ---- Sheets ----
await p.evaluate(() => { location.hash = '#/customers'; }); await wait(900);
await clickText(p, 'button', /^(\+ )?(Add|New) customer$|^Add$/);
await p.waitForSelector('.modal', { timeout: 5000 }).catch(() => null);
const sheet = await p.evaluate(() => { const m = document.querySelector('.modal'); if (!m) return null; const r = m.getBoundingClientRect(); return { bottom: Math.round(r.bottom), h: innerHeight, grab: !!m.querySelector('.sheet-grab') && getComputedStyle(m.querySelector('.sheet-grab')).display !== 'none', radius: getComputedStyle(m).borderBottomLeftRadius }; });
check('a pop-up rises as a sheet from the bottom, with a grab handle', sheet && Math.abs(sheet.bottom - sheet.h) <= 2 && sheet.grab && sheet.radius === '0px', JSON.stringify(sheet));
await p.screenshot({ path: `${out}/sheet.png` });
// drag the handle down to close it
const g = await p.evaluate(() => { const r = document.querySelector('.modal .sheet-grab').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + 2 }; });
await p.mouse.move(g.x, g.y); await p.mouse.down(); await p.mouse.move(g.x, g.y + 200, { steps: 6 }); await p.mouse.move(g.x, g.y + 500, { steps: 6 }); await p.mouse.up(); await wait(500);
check('dragging the sheet down closes it', !(await p.$('.modal')));

// ---- App Library ----
await openCC(p); await clickText(p, '.cc-tile', /App Library/); await p.waitForSelector('.lib-sheet', { timeout: 5000 });
const folders = await p.evaluate(() => [...document.querySelectorAll('.lib-folder')].map((f) => f.getAttribute('aria-label')));
check('the App Library has Suggestions and a folder per menu group', folders[0] === 'Suggestions' && ['Sell', 'Stock', 'Settings'].every((x) => folders.includes(x)), folders.join(', '));
await p.screenshot({ path: `${out}/app-library.png` });
await setVal(p, '.lib-search input', 'stock');
const found = await p.evaluate(() => [...document.querySelectorAll('.lib-list a .grow')].map((x) => x.textContent));
check('searching lists the pages A to Z', found.length >= 3 && found.every((x) => /stock/i.test(x)) && [...found].sort((a, c) => a.localeCompare(c)).join() === found.join(), found.join(', '));
await clickText(p, '.lib-list a', /Stock Card/); await wait(800);
check('picking a page opens it and closes the library', (await p.evaluate(() => location.hash)) === '#/stock-card' && !(await p.$('.lib-sheet')));

// ---- Home screen ----
await p.evaluate(() => { location.hash = '#/'; }); await wait(700);
await openCC(p); await click(p, '.cc-tile[data-cc="home"]'); await p.keyboard.press('Escape'); await wait(600);
const home = await p.evaluate(() => ({ widgets: [...document.querySelectorAll('.home-widget')].map((w) => w.dataset.widget + ':' + [...w.classList].find((c) => c.startsWith('size-'))), dock: [...document.querySelectorAll('.home-dock .lib-name')].map((x) => x.textContent) }));
check('the home screen: clock and three small figures first, then medium and large widgets', home.widgets.slice(0, 4).join() === 'clock:size-s,w-sales:size-s,w-low:size-s,w-expiry:size-s' && home.widgets.some((w) => w.endsWith('size-m')) && home.widgets.some((w) => w.endsWith('size-l')), home.widgets.join(' '));
check('a dock of pages under the widgets', home.dock.includes('Sell') && home.dock.includes('Inventory'), home.dock.join(', '));
check('today\'s sales widget shows today\'s figure', /2,000|2K|2k/.test(await p.evaluate(() => document.querySelector('[data-widget="w-sales"]')?.textContent || '')));
await p.screenshot({ path: `${out}/home-screen.png`, fullPage: true });
await clickText(p, '.home-bar button', /Edit home screen/); await wait(200);
check('arranging: each widget gets remove, move and size buttons', await p.evaluate(() => document.querySelector('.home-screen.arranging') && document.querySelectorAll('.widget-tools').length === document.querySelectorAll('.home-widget').length));
await click(p, '[data-widget="clock"] .w-size'); await wait(150);
check('the size button makes the clock medium', await p.evaluate(() => document.querySelector('[data-widget="clock"]').classList.contains('size-m')));
await click(p, '[data-widget="w-expiry"] .w-remove'); await wait(150);
check('− takes a widget off', !(await p.$('[data-widget="w-expiry"]')));
await clickText(p, '.home-bar button', /Add a widget/); await wait(150);
await clickText(p, '.gallery-list button', /Expiring/); await wait(150);
check('+ adds it back from the gallery, at the end', await p.evaluate(() => [...document.querySelectorAll('.home-widget')].pop()?.dataset.widget === 'w-expiry'));
await click(p, '[data-widget="w-low"] button[aria-label^="Move Low stock earlier"]'); await wait(150);
check('‹ moves a widget earlier', await p.evaluate(() => [...document.querySelectorAll('.home-widget')].map((w) => w.dataset.widget).indexOf('w-low') === 1));
await p.screenshot({ path: `${out}/home-arranging.png` });
await clickText(p, '.home-bar button', /Done/); await wait(200);
await p.reload({ waitUntil: 'networkidle2' }); await p.waitForSelector('.sidebar', { timeout: 20000 }); await wait(1500);
const after = await p.evaluate(() => [...document.querySelectorAll('.home-widget')].map((w) => w.dataset.widget + ':' + [...w.classList].find((c) => c.startsWith('size-'))));
check('after a reload: the behaviours and the arrangement are kept', (await attr(p, 'island')) === 'on' && (await attr(p, 'home')) === 'on' && after[0] === 'clock:size-m' && after[1] === 'w-low:size-s' && after.at(-1) === 'w-expiry:size-s', after.join(' '));

// ---- Tiling ----
await openCC(p); await click(p, '.cc-tile[data-cc="tiling"]'); await p.keyboard.press('Escape'); await wait(1200);
const tile = await p.evaluate(() => { const t = document.querySelector('.tile-pane'); return t && { label: t.getAttribute('aria-label'), w: Math.round(t.getBoundingClientRect().width), h1: t.querySelector('h1')?.textContent || '' }; });
check('tiling: a second page beside this one (Sales History first)', tile && tile.label === 'Tiled: Sales History' && tile.w > 300 && /Sales/.test(tile.h1), JSON.stringify(tile));
await p.select('.tile-pane select', '/inventory'); await wait(1200);
check('the tile\'s page can be changed (Inventory)', /Inventory/.test(await p.evaluate(() => document.querySelector('.tile-pane h1')?.textContent || '')) && (await p.evaluate(() => location.hash)) === '#/');
await p.screenshot({ path: `${out}/tiling.png` });
await click(p, '.tile-pane button[aria-label="Close the tile"]'); await wait(300);
check('closing the tile switches tiling off', !(await p.$('.tile-pane')) && !(await attr(p, 'tiling')));

// ---- Lock screen ----
await openCC(p); await clickText(p, '.cc-tile', /Lock the till/); await p.waitForSelector('.lock-screen', { timeout: 5000 });
check('Lock the till shows the lock screen with the time and who locked it', await p.evaluate(() => /\d{1,2}:\d{2}/.test(document.querySelector('.lock-time')?.textContent || '') && /locked by Ivy/.test(document.querySelector('.lock-who')?.textContent || '')));
check('the lock screen lists what is waiting (low stock)', /low on stock/.test(await p.evaluate(() => document.querySelector('.lock-notes')?.textContent || '')));
await p.screenshot({ path: `${out}/lock-screen.png` });
await p.keyboard.press('Escape'); await wait(200);
check('Escape does not open it', !!(await p.$('.lock-screen')));
await p.keyboard.press('F2'); await wait(400);
check('page keys do nothing while locked (F2 stays on the dashboard)', (await p.evaluate(() => location.hash)) === '#/' && !!(await p.$('.lock-screen')));
await p.reload({ waitUntil: 'networkidle2' }); await p.waitForSelector('.sidebar', { timeout: 20000 }); await wait(1500);
check('a reload keeps the till locked', !!(await p.$('.lock-screen')));
await setVal(p, '#lock-secret', 'wrong-password-1'); await click(p, '.lock-form button[type=submit]'); await wait(2500);
check('a wrong password does not open it, and says so', !!(await p.$('.lock-screen')) && /wrong|password/i.test(await p.evaluate(() => document.querySelector('.lock-err')?.textContent || '')), await p.evaluate(() => document.querySelector('.lock-err')?.textContent || ''));
await setVal(p, '#lock-secret', 'ivy-pass-12345'); await click(p, '.lock-form button[type=submit]'); await wait(2500);
check('the right password opens the till where it was', !(await p.$('.lock-screen')) && !!(await p.$('.home-screen')));
// Ctrl+Shift+L locks it again
await p.keyboard.down('Control'); await p.keyboard.down('Shift'); await p.keyboard.press('L'); await p.keyboard.up('Shift'); await p.keyboard.up('Control'); await wait(300);
check('Ctrl+Shift+L locks the till', !!(await p.$('.lock-screen')));
await clickText(p, '.lock-foot button', /Sign out/); await wait(1500);
check('"Not Ivy? Sign out" signs out (no lock on the next person)', !(await p.$('.lock-screen')) && !(await p.$('.sidebar')));

// ---- auto-lock ----
await setVal(p, 'input[autocomplete=username]', 'ivy@test.rx'); await setVal(p, 'input[type=password]', 'ivy-pass-12345');
await p.evaluate(() => [...document.querySelectorAll('form button')].find((x) => /^Sign in/.test(x.textContent.trim()))?.click());
await p.waitForSelector('.sidebar', { timeout: 20000 }); await wait(1200);
check('after signing in again the till is open', !(await p.$('.lock-screen')));
await openCC(p); await clickText(p, '.cc-row button', /^2 min$/); await wait(150);
check('auto-lock can be set (2 min)', await p.evaluate(() => JSON.parse(localStorage.getItem('rxpos-behaviour')).lock === 2));
await p.keyboard.press('Escape'); await wait(200);

// ---- on a phone ----
await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true }); await p.waitForSelector('.topbar .cc-btn', { timeout: 20000 }); await wait(1500); // a phone view reloads the page
check('phone: the Control Centre button is in the top bar', await p.evaluate(() => { const r = document.querySelector('.cc-btn')?.getBoundingClientRect(); return !!r && r.width > 0 && r.right <= innerWidth; }));
check('phone: no sideways scrolling on the home screen', await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
await p.screenshot({ path: `${out}/phone-home.png` });
await openCC(p); await wait(300);
check('phone: Control Centre fits the screen', await p.evaluate(() => { const r = document.querySelector('.cc-panel').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; }));
await p.screenshot({ path: `${out}/phone-control-centre.png` });
await clickText(p, '.cc-tile', /Lock the till/); await p.waitForSelector('.lock-screen', { timeout: 5000 }); await wait(300);
check('phone: the lock screen hides the page (opaque)', await p.evaluate(() => { const bg = getComputedStyle(document.querySelector('.lock-screen')).backgroundImage; return /gradient/.test(bg); }));
await p.screenshot({ path: `${out}/phone-lock.png` });

await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

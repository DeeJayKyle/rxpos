// Tables and lists (UI batch 3, C1-C11; fictional data): pinned totals, columns chosen and ordered on this device, a
// sentence and a button on empty lists, the ticked rows' bar at the bottom, price and reorder level edited in the
// table (audited, with the permission), arrow keys, 100 rows then more as the list scrolls, details beside the list
// on a wide screen, the stock bar, swipe actions on a phone.
//   node v83-tables.mjs <base> <ownerKey> <outDir>
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
import { CHROME } from './chrome.mjs';
const [base, ownerKey, out = '.output/v83'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + String(x).slice(0, 300) : ''}`); };
const owner = (p, body) => fetch(base + '/api/owner' + p, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ownerKey }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());
const until = async (p, fn, ms = 20000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await p.evaluate(fn).catch(() => false)) return true; await wait(250); } return false; };

const T = await owner('/tenants', { name: 'Tables Sample Pharmacy', admin: { name: 'Tess Admin', email: 'tess@tables.rx', password: 'tess-pass-1234' } });
const tid = T.tenant.id, slug = T.tenant.slug;
await owner('/tenants/' + tid, { features: { catalog: false, weather: false, promos: false } });
const at = (i) => { const d = new Date(); d.setDate(d.getDate() - (i % 20)); d.setHours(9 + (i % 8), i % 60, 0, 0); return d.toISOString(); };
const day = new Date().toISOString().slice(0, 10);
await owner('/tenants/' + tid + '/records', { records: [
  { t: 'products', id: 'tp1', rec: { name: 'Calmex 500mg Tabs', generic: 'Calmex', form: 'Tablets', price: 500, cost: 300, reorder: 50 } },
  { t: 'products', id: 'tp2', rec: { name: 'Zinco Syrup 100ml', generic: 'Zinco', form: 'Syrups', price: 6000, cost: 4000, reorder: 5 } },
  { t: 'batches', id: 'tb1', rec: { productId: 'tp1', batch: 'C1', expiry: '2029-01-31', cost: 300, received: day } },
  { t: 'batches', id: 'tb2', rec: { productId: 'tp2', batch: 'Z1', expiry: '2029-01-31', cost: 4000, received: day } },
  { t: 'movements', id: 'tm1', rec: { productId: 'tp1', batchId: 'tb1', qty: 30, type: 'Opening stock', date: at(0), branchId: 'main', user: 'Tess Admin' } },
  { t: 'movements', id: 'tm2', rec: { productId: 'tp2', batchId: 'tb2', qty: 40, type: 'Opening stock', date: at(0), branchId: 'main', user: 'Tess Admin' } },
  { t: 'customers', id: 'tc1', rec: { name: 'Grace Sample', phone: '0700111222' } },
  { t: 'customers', id: 'tc2', rec: { name: 'Henry Example', phone: '0700333444' } },
  ...Array.from({ length: 130 }, (_, i) => ({ t: 'sales', id: 'ts' + i, rec: { number: 'R-' + String(1000 + i), date: at(i), type: 'retail', branchId: 'main', items: [], subtotal: 1000, discount: 0, tax: 0, total: 1000, paid: 1000, payment: 'Cash', customerName: i % 2 ? 'Grace Sample' : 'Walk-in Customer', cashier: 'Tess Admin', status: 'completed' } })),
] });

const b = await puppeteer.launch({ executablePath: CHROME, headless: true });
const p = await (await b.createBrowserContext()).newPage();
await p.setViewport({ width: 1440, height: 900 });
const errors = []; p.on('pageerror', (e) => errors.push(e.message));
await p.goto(base + '/' + slug, { waitUntil: 'networkidle2' }); await wait(500);
await p.evaluate(() => { for (const id of ['pos', 'dashboard', 'sales', 'inventory']) localStorage.setItem('rxpos-tip:' + id, '1'); });
await p.type('input[autocomplete=username]', 'tess@tables.rx'); await p.type('input[type=password]', 'tess-pass-1234');
await p.evaluate(() => [...document.querySelectorAll('form button')].find((x) => /^Sign in/.test(x.textContent.trim()))?.click());
await p.waitForSelector('.sidebar', { timeout: 20000 });
await until(p, () => /Synced/.test(document.querySelector('.pill.clock .clock-state')?.innerText || ''), 30000);
await wait(1000);

// Sales History
await p.evaluate(() => { location.hash = '#/sales'; });
await until(p, () => document.querySelectorAll('table.phone-rows tbody tr').length >= 100);
const rowsN = () => p.evaluate(() => document.querySelectorAll('table.phone-rows tbody tr').length);
check('C7 100 rows first, with "Showing 100 of 130" and no page buttons', await rowsN() === 100 && /Showing 100 of 130/.test(await p.evaluate(() => document.querySelector('.load-more')?.innerText || '')) && !(await p.$('.pager')), await rowsN());
await p.evaluate(() => document.querySelector('.load-more').scrollIntoView()); await wait(800);
check('C7 …the rest as the list scrolls', await rowsN() === 130, await rowsN());
check('C1 the total is pinned at the bottom of the sales list', await p.evaluate(() => { const td = document.querySelector('table.phone-rows tfoot tr.total-row td'); return !!td && getComputedStyle(td).position === 'sticky' && /130 sales/.test(td.innerText); }));
check('C1 the headings stay while scrolling', await p.evaluate(() => getComputedStyle(document.querySelector('table.phone-rows thead th')).position === 'sticky'));
// 1.16.0: a money column's heading carries the currency ("Total (UGX)"); the name is what is compared
const heads = () => p.evaluate(() => [...document.querySelectorAll('table.phone-rows thead th')].map((x) => x.textContent.replace(/[▲▼↕\s]+$/g, '').replace(/\s*\([A-Z]{3}\)$/, '').trim()).filter(Boolean));
await p.evaluate(() => [...document.querySelectorAll('.page-head button')].find((x) => /Columns/.test(x.textContent)).click()); await wait(200);
await p.evaluate(() => document.querySelector('.col-row[data-col=phone] input').click()); await wait(150);
await p.evaluate(() => document.querySelector('.col-row[data-col=total] button[aria-label^="Move Total up"]').click()); await wait(150);
let h = await heads();
check('C2 Columns: Phone hidden, Total moved before Status', !h.includes('Phone') && h.indexOf('Total') < h.indexOf('Status') && h.indexOf('Total') > 0, JSON.stringify(h));
await p.reload({ waitUntil: 'networkidle2' }); await until(p, () => document.querySelectorAll('table.phone-rows tbody tr').length >= 100);
h = await heads();
check('C2 …kept on this device', !h.includes('Phone') && h.indexOf('Total') < h.indexOf('Status'), JSON.stringify(h));
// C6 arrow keys, C8 details beside the list
await p.evaluate(() => document.activeElement?.blur()); await p.mouse.click(5, 450);
await p.keyboard.press('ArrowDown'); await p.keyboard.press('ArrowDown'); await wait(150);
check('C6 ↓ moves the highlighted row', await p.evaluate(() => [...document.querySelectorAll('table.phone-rows tbody tr')].indexOf(document.querySelector('tr.row-active')) === 1));
await p.keyboard.press('Enter'); await wait(500);
check('C8 Enter opens the receipt beside the list at 1440 px (the list stays)', await p.evaluate(() => !!document.querySelector('.details-pane') && !document.querySelector('.modal-bg') && !!document.querySelector('.list-and-details.with-details table.phone-rows') && /Receipt R-/.test(document.querySelector('.details-pane h2').innerText)));
await p.screenshot({ path: path.join(out, 'sales-details.png') });
await p.evaluate(() => document.querySelector('.details-pane .details-head button').click()); await wait(300);
// C4 tick two: the bar at the bottom
await p.evaluate(() => { const t = document.querySelectorAll('table.phone-rows tbody td.tick input'); t[0].click(); t[1].click(); }); await wait(300);
check('C4 ticking rows shows "2 selected" in a bar at the bottom with Print and Export', await p.evaluate(() => { const bb = document.querySelector('.bulk-dock'); if (!bb) return false; const r = bb.getBoundingClientRect(); return /2 selected/.test(bb.innerText) && /Print receipts/.test(bb.innerText) && /Export/.test(bb.innerText) && r.bottom > innerHeight - 60 && getComputedStyle(bb).position === 'fixed'; }));
await p.keyboard.press('Escape'); await wait(200);
check('C4 …Esc unticks and the bar goes', await p.evaluate(() => !document.querySelector('.bulk-dock')));

// Inventory
// wait for Inventory's own rows: Sales History's table (100+ rows) is still there for a moment after the switch
await p.evaluate(() => { location.hash = '#/inventory'; }); await until(p, () => /Inventory/.test(document.querySelector('.page-head h1')?.innerText || '') && [...document.querySelectorAll('table.phone-rows tbody tr')].some((r) => /Calmex/.test(r.innerText)) && !!document.querySelector('table.phone-rows .health-bar'));
check('C9 a stock bar on each row: Calmex low (30 of 50), Zinco good', await p.evaluate(() => { const bars = Object.fromEntries([...document.querySelectorAll('table.phone-rows tbody tr')].map((r) => [r.querySelector('.row-title strong').innerText, r.querySelector('.health-bar')?.className])); return /low/.test(bars['Calmex 500mg Tabs']) && /ok/.test(bars['Zinco Syrup 100ml']); }));
check('C1 the inventory value total is pinned', await p.evaluate(() => /Inventory value/.test(document.querySelector('table.phone-rows tfoot .total-row')?.innerText || '')));
const calmexRow = '[...document.querySelectorAll("table.phone-rows tbody tr")].find((r) => /Calmex/.test(r.innerText))';
await p.evaluate(`${calmexRow}.querySelector('[data-cell=price]').click()`); await wait(200);
check('C5 clicking the price edits it in place (the row does not open)', await p.evaluate(() => document.activeElement?.matches('.cell-edit input') && !document.querySelector('.details-pane, .modal-bg')));
await p.keyboard.down('Control'); await p.keyboard.press('a'); await p.keyboard.up('Control');
await p.keyboard.type('650'); await p.keyboard.press('Enter'); await wait(800);
check('C5 Enter saves the new price', await p.evaluate(`/650/.test(${calmexRow}.querySelector('[data-cell=price]').innerText)`));
await p.evaluate(`${calmexRow}.querySelector('[data-cell=reorder]').click()`); await wait(200);
await p.keyboard.type('9'); await p.keyboard.press('Escape'); await wait(300);
check('C5 Esc cancels (the reorder level stays 50)', await p.evaluate(`${calmexRow}.querySelector('[data-cell=reorder]').innerText.trim() === '50'`));
await p.evaluate(() => { location.hash = '#/audit'; }); await wait(1500);
check('C5 …the price change is in the audit log', await p.evaluate(() => /Calmex 500mg Tabs: UGX 500 → UGX 650 \(in the table\)/.test(document.querySelector('.page')?.innerText || '')));
// wait for Inventory's own rows: Sales History's table (100+ rows) is still there for a moment after the switch
await p.evaluate(() => { location.hash = '#/inventory'; }); await until(p, () => /Inventory/.test(document.querySelector('.page-head h1')?.innerText || '') && [...document.querySelectorAll('table.phone-rows tbody tr')].some((r) => /Calmex/.test(r.innerText)) && !!document.querySelector('table.phone-rows .health-bar'));
await p.evaluate(() => document.querySelector('table.phone-rows thead th.tick input').click()); await wait(300);
check('C4 inventory: all ticked → Print labels, Export, Change price', await p.evaluate(() => /2 selected/.test(document.querySelector('.bulk-dock')?.innerText || '') && ['Print labels', 'Export', 'Change price'].every((x) => document.querySelector('.bulk-dock').innerText.includes(x))));
await p.evaluate(() => [...document.querySelectorAll('.bulk-dock button')].find((x) => /Change price/.test(x.textContent)).click()); await wait(300);
await p.type('.modal input', '+10%'); await p.evaluate(() => [...document.querySelectorAll('.modal button')].find((x) => /Change prices/.test(x.textContent)).click()); await wait(800);
check('C4 Change price +10% on both (650 → 715, 6,000 → 6,600)', await p.evaluate(() => { const t = document.querySelector('table.phone-rows tbody').innerText; return /715/.test(t) && /6,600/.test(t); }));
await p.keyboard.press('Escape');
await p.evaluate(() => [...document.querySelectorAll('.chips-row button, .filter-chips button, button')].find((x) => /^Out of stock/.test(x.textContent.trim()))?.click()); await wait(500);
check('C3 an empty list says what goes there', await p.evaluate(() => /Nothing is out of stock/.test(document.querySelector('td.empty')?.innerText || '')));

// Customers: details beside the list, swipe on a phone
await p.evaluate(() => { location.hash = '#/customers'; }); await until(p, () => document.querySelectorAll('table.phone-rows tbody tr').length >= 2);
await p.evaluate(() => [...document.querySelectorAll('table.phone-rows tbody tr')].find((r) => /Grace/.test(r.innerText)).querySelector('td.actions .btn.ghost').click()); await wait(400);
check('C8 clients: the client opens beside the list at 1440 px', await p.evaluate(() => /Edit customer/.test(document.querySelector('.details-pane h2')?.innerText || '') && !document.querySelector('.modal-bg')));
await p.evaluate(() => document.querySelector('.details-pane .details-head button').click()); await wait(200);
await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
await p.reload({ waitUntil: 'networkidle2' }); await until(p, () => document.querySelectorAll('table.phone-rows tbody tr').length >= 2); await wait(1500);
const swipeLeft = async (sel) => {
  const r = await p.evaluate((s) => { const e = eval(s).getBoundingClientRect(); return { x: e.right - 30, y: e.top + e.height / 2 }; }, sel);
  const c = await p.target().createCDPSession();
  await c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: r.x, y: r.y }] });
  for (let k = 1; k <= 6; k++) await c.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: r.x - k * 30, y: r.y }] });
  await c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await wait(300);
};
await swipeLeft('[...document.querySelectorAll("table.phone-rows tbody tr")].find((r) => /Grace/.test(r.innerText))');
check('C10 phone: swiping a client shows Call and WhatsApp', await p.evaluate(() => { const a = document.querySelector('tr[data-swiped] .swipe-acts'); return !!a && /tel:\+?256700111222|tel:0700111222/.test(a.querySelector('a').href) && /wa\.me\/256700111222/.test(a.innerText + [...a.querySelectorAll('a')].map((x) => x.href).join()); }), await p.evaluate(() => document.querySelector('.swipe-acts')?.outerHTML));
await p.screenshot({ path: path.join(out, 'customers-swipe.png') });
await p.evaluate(() => { location.hash = '#/sales'; }); await until(p, () => document.querySelectorAll('table.phone-rows tbody tr').length >= 50);
await swipeLeft('document.querySelector("table.phone-rows tbody tr")');
check('C10 phone: swiping a sale shows Print and Refund', await p.evaluate(() => /Print/.test(document.querySelector('tr[data-swiped] .swipe-acts')?.innerText || '') && /Refund/.test(document.querySelector('tr[data-swiped] .swipe-acts').innerText)));
await p.evaluate(() => [...document.querySelectorAll('tr[data-swiped] .swipe-acts button')].find((x) => /Refund/.test(x.textContent)).click()); await wait(400);
check('C10 …Refund still goes through the refund sheet (a reason first)', await p.evaluate(() => !!document.querySelector('.modal') && /reason|why/i.test(document.querySelector('.modal').innerText)));
check('phone: nothing runs off the screen', await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
check('no page errors', !errors.length, errors.join(' | '));

await b.close();
await owner('/tenants/' + tid + '/delete', { confirm: slug });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

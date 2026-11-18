// Pages (UI batch 3, F1-F9; fictional data): the expiry calendar, the shelf map, Ctrl+K hints before typing, the
// offline banner, "Edited by" on a record, the audit log as sentences with chips, "is typing" in chat between two
// devices, the phone's bottom bar chosen on this device, a report's one-line summary.
//   node v85-pages.mjs <base> <ownerKey> <outDir>
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import { CHROME } from './chrome.mjs';
const [base, ownerKey, out = '.output/v85'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + String(x).slice(0, 300) : ''}`); };
const owner = (p, body) => fetch(base + '/api/owner' + p, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ownerKey }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());
const until = async (p, fn, ms = 20000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await p.evaluate(fn).catch(() => false)) return true; await wait(250); } return false; };

const T = await owner('/tenants', { name: 'Pages Sample Pharmacy', admin: { name: 'Pia Admin', email: 'pia@pages.rx', password: 'pia-pass-1234' } });
const tid = T.tenant.id, slug = T.tenant.slug;
await owner('/tenants/' + tid, { features: { catalog: false, weather: false, promos: false } });
const ymd = (d) => d.toISOString().slice(0, 10);
const inDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return ymd(d); };
const at = (daysAgo) => { const d = new Date(); d.setDate(d.getDate() - daysAgo); d.setHours(11, 0, 0, 0); return d.toISOString(); };
await owner('/tenants/' + tid + '/records', { records: [
  { t: 'products', id: 'pp1', rec: { name: 'Calmex 500mg Tabs', generic: 'Calmex', form: 'Tablets', price: 500, cost: 300, reorder: 5, shelf: 'A1' } },
  { t: 'products', id: 'pp2', rec: { name: 'Zinco Syrup 100ml', generic: 'Zinco', form: 'Syrups', price: 6000, cost: 4000, reorder: 2, shelf: 'B2' } },
  { t: 'products', id: 'pp3', rec: { name: 'Coldrex Cream', generic: 'Coldrex', form: 'Creams', price: 3000, cost: 2000, reorder: 2, shelf: 'Fridge' } },
  { t: 'batches', id: 'pb1', rec: { productId: 'pp1', batch: 'C1', expiry: inDays(10), cost: 300 } },
  { t: 'batches', id: 'pb2', rec: { productId: 'pp2', batch: 'Z1', expiry: inDays(-3), cost: 4000 } },
  { t: 'movements', id: 'pm1', rec: { productId: 'pp1', batchId: 'pb1', qty: 30, type: 'Opening stock', date: at(20), branchId: 'main', user: 'Pia Admin' } },
  { t: 'movements', id: 'pm2', rec: { productId: 'pp2', batchId: 'pb2', qty: 4, type: 'Opening stock', date: at(20), branchId: 'main', user: 'Pia Admin' } },
  { t: 'customers', id: 'pc1', rec: { name: 'Grace Sample', phone: '0700111222' } },
  { t: 'sales', id: 'ps1', rec: { number: 'R-9001', date: at(0), type: 'retail', branchId: 'main', items: [{ id: 'pp1', name: 'Calmex 500mg Tabs', qty: 4, price: 500, cost: 300 }], subtotal: 2000, discount: 0, tax: 0, total: 2000, paid: 2000, payment: 'Cash', customerName: 'Walk-in Customer', cashier: 'Pia Admin', status: 'completed' } },
  { t: 'audit', id: 'pa1', rec: { date: at(1), user: 'Amina Sample', action: 'Refund', details: 'R102 · UGX 5,000 · wrong item', branchId: 'main' } },
] });

const b = await puppeteer.launch({ executablePath: CHROME, headless: true });
const ctxA = await b.createBrowserContext(), ctxB = await b.createBrowserContext();
const p = await ctxA.newPage();
await p.setViewport({ width: 1440, height: 900 });
const errors = []; p.on('pageerror', (e) => errors.push(e.message));
const signIn = async (pg, email, pw) => {
  await pg.goto(base + '/' + slug, { waitUntil: 'networkidle2' }); await wait(400);
  await pg.evaluate(() => { for (const id of ['pos', 'dashboard', 'chat', 'expiry', 'shelves', 'audit', 'reports']) localStorage.setItem('rxpos-tip:' + id, '1'); });
  await pg.type('input[autocomplete=username]', email); await pg.type('input[type=password]', pw);
  await pg.evaluate(() => [...document.querySelectorAll('form button')].find((x) => /^Sign in/.test(x.textContent.trim()))?.click());
  await pg.waitForSelector('.sidebar', { timeout: 20000 });
  await until(pg, () => /Synced/.test(document.querySelector('.pill.clock .clock-state')?.innerText || ''), 30000);
};
await signIn(p, 'pia@pages.rx', 'pia-pass-1234');
const go = async (h) => { await p.evaluate((x) => { location.hash = x; }, h); await wait(1200); };

// F1 expiry calendar
await go('#/expiry');
await p.evaluate(() => [...document.querySelectorAll('.seg button')].find((x) => x.textContent === 'Calendar').click()); await wait(500);
check('F1 the expiry page has a Calendar: a month grid with the batch on its day, shaded by urgency', await p.evaluate(() => { const c = [...document.querySelectorAll('.exp-chip')].find((x) => /Calmex/.test(x.textContent)); return !!document.querySelector('.exp-cal-grid') && !!c && c.classList.contains('urgent') && !!c.closest('[data-day]'); }));
await p.evaluate(() => [...document.querySelectorAll('.exp-chip')].find((x) => /Calmex/.test(x.textContent)).click()); await wait(800);
check('F1 …a batch opens its stock card', await p.evaluate(() => location.hash.includes('stock-card')));
await go('#/expiry');
check('F1 …the view is kept on this device', await p.evaluate(() => !!document.querySelector('.exp-cal')));

// F2 shelf map
await go('#/shelves');
check('F2 a shelf map: A1 and B2 on a grid, "Fridge" apart', await p.evaluate(() => { const rows = [...document.querySelectorAll('.shelf-row')]; return rows.length >= 3 && /A1/.test(rows[0].innerText) && /B2/.test(rows[1].innerText) && /Fridge/.test(rows.at(-1).innerText); }));
await p.evaluate(() => [...document.querySelectorAll('.shelf-cell')].find((x) => /^A1/.test(x.innerText)).click()); await wait(400);
check('F2 …tapping a shelf lists its medicines', await p.evaluate(() => /Calmex/.test(document.querySelector('table tbody')?.innerText || '') && !/Zinco/.test(document.querySelector('table tbody')?.innerText || '')));

// F3 Ctrl+K before typing
await p.keyboard.down('Control'); await p.keyboard.press('k'); await p.keyboard.up('Control'); await wait(300);
await p.keyboard.type('calmex'); await wait(300);
await p.evaluate(() => [...document.querySelectorAll('.palette-item')].find((x) => /Calmex/.test(x.textContent))?.click()); await wait(600);
await p.keyboard.down('Control'); await p.keyboard.press('k'); await p.keyboard.up('Control'); await wait(300);
const sections = await p.evaluate(() => [...document.querySelectorAll('.palette-section')].map((x) => x.textContent));
check('F3 Ctrl+K before typing: recent searches and suggested actions', sections[0] === 'Recent searches' && sections.includes('Suggested') && await p.evaluate(() => /calmex/i.test(document.querySelector('.palette-list').innerText) && /New sale/.test(document.querySelector('.palette-list').innerText)), JSON.stringify(sections));
await p.keyboard.press('Escape'); await wait(200);

// F5 who changed it, F6 the audit log
await go('#/customers');
await p.evaluate(() => [...[...document.querySelectorAll('table tbody tr')].find((r) => /Grace/.test(r.innerText)).querySelectorAll('td.actions button')].find((b) => /Edit/.test(b.textContent)).click()); await wait(400);
await p.evaluate(() => { const i = [...document.querySelectorAll('.details-pane input, .modal input')].find((x) => x.type === 'email'); i.focus(); }); await p.keyboard.type('grace@sample.rx');
await p.evaluate(() => [...document.querySelectorAll('.details-pane button, .modal button')].find((x) => /^Save$/.test(x.textContent.trim())).click()); await wait(800);
await p.evaluate(() => [...[...document.querySelectorAll('table tbody tr')].find((r) => /Grace/.test(r.innerText)).querySelectorAll('td.actions button')].find((b) => /Edit/.test(b.textContent)).click()); await wait(400);
check('F5 a record says who changed it last, with a link to its history', /Edited by Pia Admin · (just now|\d+ min ago) · history/.test(await p.evaluate(() => document.querySelector('[data-testid=who-changed]')?.innerText || '')), await p.evaluate(() => document.querySelector('[data-testid=who-changed]')?.innerText));
await p.keyboard.press('Escape'); await wait(300);
await go('#/audit');
check('F6 the audit log reads as sentences', await p.evaluate(() => /Amina Sample refunded R102, UGX 5,000 · reason: wrong item/.test(document.querySelector('.audit-list').innerText)));
await p.evaluate(() => [...document.querySelectorAll('.audit-chips .chip')].find((x) => x.textContent === 'Amina Sample').click()); await wait(300);
check('F6 …chips by person', await p.evaluate(() => [...document.querySelectorAll('.audit-row')].every((r) => /Amina/.test(r.innerText)) && document.querySelectorAll('.audit-row').length >= 1));
await p.evaluate(() => [...document.querySelectorAll('.audit-chips .chip')].find((x) => x.textContent === 'Everyone').click());
await p.evaluate(() => [...document.querySelectorAll('.audit-chips .chip')].find((x) => x.textContent === 'Staff & sign-ins').click()); await wait(300);
check('F6 …and by kind of action', await p.evaluate(() => document.querySelectorAll('.audit-row').length >= 1 && [...document.querySelectorAll('.audit-row')].every((r) => /signed in|user|role/i.test(r.innerText))));

// F9 a report's one line
await go('#/reports');
check('F9 the report opens with one plain line from its figures', await until(p, () => /UGX 2,000 from 1 sale.*Calmex 500mg Tabs sold most/.test(document.querySelector('[data-testid=report-summary]')?.innerText || ''), 8000), await p.evaluate(() => document.querySelector('[data-testid=report-summary]')?.innerText));

// F7 "is typing" between two devices (a second person in the team chat)
await owner('/tenants/' + tid + '/users', { user: { name: 'Ben Second', email: 'ben@pages.rx', password: 'ben-pass-1234', role: 'pharmacist' } }).catch(() => null);
const q = await ctxB.newPage(); await q.setViewport({ width: 1280, height: 860 });
let second = true;
try { await signIn(q, 'ben@pages.rx', 'ben-pass-1234'); } catch { second = false; }
if (second) {
  await go('#/chat');
  await q.evaluate(() => { location.hash = '#/chat'; }); await wait(2500);
  await q.focus('.chat-input'); await q.keyboard.type('hello the');
  check('F7 chat: "Ben is typing…" shows on the other device', await until(p, () => /Ben is typing/.test(document.querySelector('[data-testid=typing]')?.innerText || ''), 10000));
} else check('F7 chat: a second person could sign in for the typing check', false);

// F4 the offline banner
await p.setOfflineMode(true); await p.evaluate(() => window.dispatchEvent(new Event('offline'))); await wait(500);
check('F4 offline: a slim banner under the top bar', await p.evaluate(() => /^Offline/.test(document.querySelector('.offline-banner')?.innerText || '')));
await p.setOfflineMode(false); await p.evaluate(() => window.dispatchEvent(new Event('online')));
check('F4 …back online: "All sent", then it goes', await until(p, () => /All sent/.test(document.querySelector('.offline-banner')?.innerText || ''), 10000) && await until(p, () => !document.querySelector('.offline-banner'), 8000));

// F8 the phone's bottom bar
await go('#/device');
await p.evaluate(() => { const set = (i, v) => { const s = document.querySelector(`.bar-pick select[data-slot="${i}"]`); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(s, v); s.dispatchEvent(new Event('change', { bubbles: true })); }; set(0, '/expiry'); });
await wait(200);
await p.evaluate(() => { const s = document.querySelector('.bar-pick select[data-slot="1"]'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(s, '/sales'); s.dispatchEvent(new Event('change', { bubbles: true })); });
await wait(200);
await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
await p.reload({ waitUntil: 'networkidle2' }); await wait(2000);
const tabs = await p.evaluate(() => [...document.querySelectorAll('.bottom-nav a, .bottom-nav button')].map((x) => x.innerText.trim()).filter(Boolean));
check('F8 phone: the chosen pages in the bottom bar, More last', tabs[0] === 'Expiry' && tabs[1] === 'Sales' && /More/.test(tabs.at(-1)), JSON.stringify(tabs));
check('no page errors', !errors.length, errors.join(' | '));

await b.close();
await owner('/tenants/' + tid + '/delete', { confirm: slug });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

// Keyboard, mouse, selection and navigation (the owner's request, 2026-11-10): page keys and two-key sequences, ? help,
// back / forward, pinned and recent pages, Ctrl+K commands, list keys, ticks with Shift ranges and bulk actions,
// right-click menus, double-click, columns per device, remembered search, keys changed per device, the stock hover.
// Fictional data only.   node v69-controls.mjs <base> <ownerKey>
import puppeteer from 'puppeteer-core';
import { CHROME } from './chrome.mjs';
const [base, ownerKey] = process.argv.slice(2);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + String(x).slice(0, 300) : ''}`); };
const owner = (p, body) => fetch(base + '/api/owner' + p, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ownerKey }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());
const until = async (p, fn, ms = 20000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await p.evaluate(fn).catch(() => false)) return true; await wait(250); } return false; };
const recs = async (tid, t) => ((await owner(`/tenants/${tid}/records?t=${t}`)).rows || []).map((x) => x.rec);

const T = await owner('/tenants', { name: 'Keys Pharmacy', admin: { name: 'Ari Admin', email: 'ari@keys.rx', password: 'ari-pass-1234' } });
const tid = T.tenant.id, slug = T.tenant.slug;
await owner('/tenants/' + tid, { features: { catalog: false } });
const date = new Date().toISOString();
await owner('/tenants/' + tid + '/records', { records: [
  ...['Achieng Grace', 'Bwire Paul', 'Kato Sam', 'Nabirye Ruth', 'Okello Joe'].map((name, i) => ({ t: 'customers', id: 'c' + i, rec: { name, phone: '07725550' + i + i } })),
  ...['Aerosol', 'Balm', 'Cream', 'Douche'].map((name, i) => ({ t: 'formulations', id: 'f' + i, rec: { name } })),
  { t: 'products', id: 'p1', rec: { name: 'Alpha Tabs', price: 1000, cost: 400, reorder: 5, category: 'Pain' } },
  { t: 'products', id: 'p2', rec: { name: 'Beta Syrup', price: 2000, cost: 900, reorder: 5 } },
  { t: 'batches', id: 'b1', rec: { productId: 'p1', batch: 'AL-7', expiry: '2029-03-31', cost: 400 } },
  { t: 'movements', id: 'm1', rec: { productId: 'p1', qty: 40, type: 'Opening stock', batchId: 'b1', branchId: 'main', date } },
  { t: 'sales', id: 'x1', rec: { number: 'R-KEY1', date, type: 'retail', branchId: 'main', cashier: 'Ari Admin', items: [{ id: 'p1', name: 'Alpha Tabs', qty: 1, price: 1000 }], subtotal: 1000, discount: 0, tax: 0, total: 1000, paid: 1000, payment: 'Cash', customerId: 'c0', customerName: 'Achieng Grace', status: 'completed' } },
] });

const b = await puppeteer.launch({ executablePath: CHROME, headless: true });
const p = await (await b.createBrowserContext()).newPage();
await p.setViewport({ width: 1440, height: 900 });
p.on('dialog', (d) => d.dismiss().catch(() => {}));
const errors = []; p.on('pageerror', (e) => errors.push(e.message));
await p.goto(base + '/' + slug, { waitUntil: 'networkidle2' }); await wait(600);
await p.evaluate(() => { for (const id of ['pos', 'dashboard', 'customers', 'sales', 'medicines', 'device']) localStorage.setItem('rxpos-tip:' + id, '1'); });
await p.type('input[autocomplete=username]', 'ari@keys.rx'); await p.type('input[type=password]', 'ari-pass-1234');
await p.evaluate(() => [...document.querySelectorAll('form button')].find((x) => /^Sign in/.test(x.textContent.trim()))?.click());
await p.waitForSelector('.sidebar', { timeout: 20000 });
await until(p, () => /Synced/.test(document.querySelector('.pill.clock .clock-state')?.innerText || ''), 30000);
const hash = () => p.evaluate(() => location.hash);
const focusBody = () => p.evaluate(() => document.activeElement?.blur());
const key = async (...ks) => { for (const k of ks) { await p.keyboard.press(k); await wait(120); } await wait(500); };
const rows = () => p.evaluate(() => [...document.querySelectorAll('.page table tbody tr')].map((r) => r.innerText.split('\t').filter(Boolean)[0]?.trim() || r.innerText.trim().split('\n')[0]));

// pages by key: G then C, F6; back and forward
await focusBody(); await key('g', 'c');
check('G then C opens Customers', (await hash()) === '#/customers', await hash());
await key('F6');
check('F6 opens Sales History', (await hash()) === '#/sales');
await p.keyboard.down('Alt'); await p.keyboard.press('ArrowLeft'); await p.keyboard.up('Alt'); await wait(600);
check('Alt+← goes back', (await hash()) === '#/customers', await hash());
await p.keyboard.down('Alt'); await p.keyboard.press('ArrowRight'); await p.keyboard.up('Alt'); await wait(600);
check('Alt+→ goes forward', (await hash()) === '#/sales', await hash());
check('breadcrumbs show where you are', /Sales\s*›\s*Sales History/.test(await p.evaluate(() => document.querySelector('.crumbs')?.innerText || '')), await p.evaluate(() => document.querySelector('.crumbs')?.innerText));

// ? on any page
await focusBody(); await key('?');
const helpText = await p.evaluate(() => document.querySelector('.modal')?.innerText || '');
check('? shows the keys for every page, lists and the mouse', /Keyboard and mouse/.test(helpText) && /G then C/.test(helpText) && /Double-click/.test(helpText) && /Right-click/.test(helpText), helpText.slice(0, 200));
await key('Escape');

// pin and recent
await key('g', 'c'); await focusBody(); await key('g', 'g');
check('G then G pins the page to the top of the menu', await p.evaluate(() => [...document.querySelectorAll('.nav-quick a.nav-pin')].some((a) => /Customers/.test(a.innerText))));
check('recent pages are listed in the menu', await p.evaluate(() => [...document.querySelectorAll('.nav-quick a.nav-recent')].some((a) => /Sales History/.test(a.innerText))));

// Ctrl+K commands
await p.keyboard.down('Control'); await p.keyboard.press('k'); await p.keyboard.up('Control'); await wait(300);
await p.keyboard.type('add a sup'); await wait(300);
check('Ctrl+K lists commands', /Commands/i.test(await p.evaluate(() => document.querySelector('.palette')?.innerText || '')) && /Add a supplier/.test(await p.evaluate(() => document.querySelector('.palette')?.innerText || '')));
await key('Enter');
check('…and "Add a supplier" opens the new supplier form', (await hash()) === '#/suppliers' && /Add supplier/.test(await p.evaluate(() => document.querySelector('.modal')?.innerText || '')));
await key('Escape');

// list keys on Customers
await key('g', 'c'); await focusBody();
await key('ArrowDown', 'ArrowDown', 'ArrowDown'); // (the walk-in customer is first)
check('↓ highlights rows', await p.evaluate(() => /Bwire Paul/.test(document.querySelector('tr.row-active')?.innerText || '')), await p.evaluate(() => document.querySelector('tr.row-active')?.innerText));
await key('Enter');
check('Enter opens the highlighted row', /Edit customer/.test(await p.evaluate(() => document.querySelector('.modal')?.innerText || '')));
await key('Escape'); await focusBody();
await key('n');
check('N adds a new one', /Add customer/.test(await p.evaluate(() => document.querySelector('.modal')?.innerText || '')));
await key('Escape'); await focusBody();
await key('/'); await p.keyboard.type('okel'); await wait(400);
check('/ goes to the search', (await rows()).length === 1 && /Okello/.test((await rows())[0]), JSON.stringify(await rows()));
// the search is kept when coming back
await key('F6'); await key('g', 'c');
check('the search is kept when you come back', (await p.evaluate(() => document.querySelector('.page .search')?.value)) === 'okel');
await p.evaluate(() => document.querySelector('.page .search')?.focus()); await key('Escape');
check('Esc in the search clears it', (await rows()).length === 6, JSON.stringify(await rows()));

// mouse: double-click, right-click
const cell = async (name) => (await p.$$('.page table tbody tr')).find(async () => true) && p.evaluateHandle((n) => [...document.querySelectorAll('.page table tbody tr')].find((r) => r.innerText.includes(n))?.querySelector('td:nth-child(2)'), name);
await (await cell('Kato Sam')).click({ count: 2 }); await wait(400);
check('double-click opens a row', /Edit customer/.test(await p.evaluate(() => document.querySelector('.modal')?.innerText || '')) && (await p.evaluate(() => [...document.querySelectorAll('.modal input')].some((i) => i.value === 'Kato Sam'))), await p.evaluate(() => document.querySelector('.modal')?.innerText?.slice(0, 80)));
await key('Escape');
await (await cell('Nabirye Ruth')).click({ button: 'right' }); await wait(300);
const menuText = await p.evaluate(() => document.querySelector('.ctx-menu')?.innerText || '');
check('right-click shows what can be done with the row', /Edit/.test(menuText) && /Tick/.test(menuText) && /Copy/.test(menuText) && /Export/.test(menuText) && !/Delete/.test(menuText), menuText.replace(/\n/g, ' · ') + ' (customers are never deleted)');
await key('Escape');
check('Esc closes the menu', !(await p.$('.ctx-menu')));

// ticks: one, then Shift+click for a range, then delete them together (formulations)
await p.evaluate(() => { location.hash = '#/formulations'; }); await wait(1200);
const sup = await p.evaluateHandle(() => [...document.querySelectorAll('.page table tbody tr')].find((r) => r.innerText.includes('Balm'))?.querySelector('td:nth-child(2)'));
await sup.click({ button: 'right' }); await wait(300);
check('a formulation\'s menu can delete it', /Delete/.test(await p.evaluate(() => document.querySelector('.ctx-menu')?.innerText || '')));
await key('Escape');
const tick = (n, shift) => p.evaluate((i, s) => { const r = document.querySelectorAll('.page table tbody tr')[i]; r.querySelector('td.tick input').dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: s })); }, n, !!shift);
const at = (n) => p.evaluate((x) => [...document.querySelectorAll('.page table tbody tr')].findIndex((r) => r.querySelector('td:nth-child(2)')?.innerText.trim() === x), n);
await tick(await at('Aerosol')); await wait(150); await tick(await at('Cream'), true); await wait(300);
check('Shift+click ticks the rows in between (3 ticked)', /3 ticked/.test(await p.evaluate(() => document.querySelector('.bulk-bar')?.innerText || '')));
await p.evaluate(() => [...document.querySelectorAll('.bulk-bar button')].find((x) => /Delete/.test(x.textContent))?.click()); await wait(300);
check('…delete asks once for all of them', /Delete 3 formulations/.test(await p.evaluate(() => document.querySelector('.modal, .dialog')?.innerText || '')), await p.evaluate(() => document.querySelector('.modal, .dialog')?.innerText));
await p.evaluate(() => [...document.querySelectorAll('.modal button, .dialog button')].find((x) => x.textContent.trim() === 'Delete')?.click()); await wait(800);
check('…and deletes them together', !(await rows()).some((r) => /^(Aerosol|Balm|Cream)$/.test(r)) && (await rows()).includes('Douche'), JSON.stringify(await rows()));
await until(p, () => /^Synced/.test(document.querySelector('.pill.clock .clock-state')?.innerText || ''), 20000);
check('…in the cloud too', (await recs(tid, 'formulations')).length === 1, (await recs(tid, 'formulations')).map((x) => x.name).join(', '));
const shownN = (await rows()).length;
await focusBody(); await p.keyboard.down('Control'); await p.keyboard.press('a'); await p.keyboard.up('Control'); await wait(300);
check('Ctrl+A ticks all shown', new RegExp(`^${shownN} ticked`).test(await p.evaluate(() => document.querySelector('.bulk-bar')?.innerText || '')));
await key('Escape');
check('Esc unticks', !(await p.$('.bulk-bar')));

// columns per device
await key('g', 'c'); await wait(300);
await p.evaluate(() => [...document.querySelectorAll('button')].find((x) => /^Columns/.test(x.textContent.trim()))?.click()); await wait(200);
const phoneCol = await p.evaluate(() => [...document.querySelectorAll('.col-chooser label')].map((l) => l.innerText.trim()));
await p.evaluate(() => { const l = [...document.querySelectorAll('.col-chooser label')].find((x) => /Phone/.test(x.innerText)); l?.querySelector('input').click(); }); await wait(200);
await p.reload({ waitUntil: 'networkidle2' }); await wait(1500);
check('a column hidden stays hidden on this device', !(await p.evaluate(() => [...document.querySelectorAll('.page thead th')].some((th) => /Phone/.test(th.innerText)))), JSON.stringify(phoneCol));

// Sales History: double-click and right-click
await key('F6'); await wait(400);
await p.evaluate(() => { const r = document.querySelector('.page table tbody tr'); r.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); }); await wait(400);
check('Sales: double-click opens the sale', /R-KEY1/.test(await p.evaluate(() => document.querySelector('.modal')?.innerText || '')));
await key('Escape');
await p.evaluate(() => { const r = document.querySelector('.page table tbody tr td:nth-child(2)'); const b = r.getBoundingClientRect(); r.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: b.x + 5, clientY: b.y + 5 })); }); await wait(300);
check('Sales: right-click offers print, copy and refund', /Print the receipt/.test(await p.evaluate(() => document.querySelector('.ctx-menu')?.innerText || '')) && /Refund/.test(await p.evaluate(() => document.querySelector('.ctx-menu')?.innerText || '')));
await key('Escape');

// Medicine List: hover shows stock and batches; ticked medicines change price together
await key('g', 'm'); await wait(500);
const name = await p.evaluateHandle(() => [...document.querySelectorAll('.page table tbody tr strong')].find((s) => s.innerText === 'Alpha Tabs'));
await name.hover(); await wait(800);
check('hovering a medicine shows its stock and batches', /40 tablets?|40 units/i.test(await p.evaluate(() => document.querySelector('.hover-card')?.innerText || '')) && /AL-7/.test(await p.evaluate(() => document.querySelector('.hover-card')?.innerText || '')), await p.evaluate(() => document.querySelector('.hover-card')?.innerText));
await p.mouse.move(5, 5);
await p.evaluate(() => document.querySelector('.page thead th.tick input').click()); await wait(200);
await p.evaluate(() => [...document.querySelectorAll('.bulk-bar button')].find((x) => /Change price/.test(x.textContent))?.click()); await wait(300);
await p.evaluate(() => { const i = document.querySelector('.modal input, .dialog input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, '+10%'); i.dispatchEvent(new Event('input', { bubbles: true })); });
await p.evaluate(() => [...document.querySelectorAll('.modal button, .dialog button')].find((x) => /Change prices/.test(x.textContent))?.click()); await wait(800);
await until(p, () => /^Synced/.test(document.querySelector('.pill.clock .clock-state')?.innerText || ''), 20000);
const prods = await recs(tid, 'products');
check('the ticked medicines change price together (+10%)', prods.find((x) => x.id === 'p1')?.price === 1100 && prods.find((x) => x.id === 'p2')?.price === 2200, JSON.stringify(prods.map((x) => [x.name, x.price])));

// keys changed on this device
await p.evaluate(() => { location.hash = '#/device'; }); await wait(1200);
await p.evaluate(() => [...document.querySelectorAll('button')].find((x) => x.getAttribute('aria-label') === 'Change the key for Customers')?.click()); await wait(200);
await key('g'); await p.keyboard.press('k'); await wait(400);
check('a key can be changed (Customers: G then K)', /G then K/.test(await p.evaluate(() => [...document.querySelectorAll('.keyboard-card tr')].find((r) => /^Customers/.test(r.innerText))?.innerText || '')));
await focusBody(); await key('g', 'k');
check('…and works at once', (await hash()) === '#/customers', await hash());
await focusBody(); await key('g', 'c');
check('…the old key no longer does', (await hash()) === '#/customers');
check('no errors on the page', errors.length === 0, errors.join(' | '));

await b.close();
await owner('/tenants/' + tid + '/delete', { confirm: slug });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

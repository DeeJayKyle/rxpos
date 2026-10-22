// Batch 18: Add Stock (new medicines, line totals, worked-out retail prices, unfinished-delivery draft) and
// Stock Count (stock take: blind count, scan, batches, sales during the count, found batches, posting).
//   node v18.mjs <base> <ownerKey> <outDir>
import puppeteer from 'puppeteer-core';
import { CHROME } from './chrome.mjs';
import fs from 'node:fs';
import path from 'node:path';
const [base, ownerKey, out] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + String(x).slice(0, 200) : ''}`); };
const owner = (p, body) => fetch(base + '/api/owner' + p, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ownerKey }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());
const until = async (pg, fn, ms = 15000, arg) => { const end = Date.now() + ms; while (Date.now() < end) { if (await pg.evaluate(fn, arg).catch(() => false)) return true; await wait(300); } return false; };
const iso = (n) => new Date(Date.now() - n * 864e5).toISOString();
const future = (days) => new Date(Date.now() + days * 864e5).toISOString().slice(0, 10);

// ---------- data ----------
const t = await owner('/tenants', { name: 'Stock Take Pharmacy', admin: { name: 'Sam Admin', email: 'sam@test.rx', password: 'sam-pass-123' } });
const slug = t.tenant.slug, tid = t.tenant.id;
const P = (id, name, extra = {}) => ({ t: 'products', id, rec: { name, generic: name, form: 'Tablets', price: 1000, wholesale: 900, cost: 500, reorder: 0, unit: 'Unit', ...extra } });
const B = (id, productId, expiry) => ({ t: 'batches', id, rec: { productId, batch: id.toUpperCase(), expiry, cost: 500 } });
const M = (id, productId, qty, batchId, type = 'Opening stock', days = 60) => ({ t: 'movements', id, rec: { productId, qty, type, batchId, branchId: 'main', date: iso(days) } });
await owner('/tenants/' + tid + '/records', { records: [
  P('p-amox', 'Amoxyl 500mg caps', { shelf: 'A1', barcode: '6001001' }), B('b-amox', 'p-amox', '2028-06-30'), M('m-amox', 'p-amox', 100, 'b-amox'),
  P('p-pan', 'Panadol Extra tabs', { shelf: 'A1', barcode: '6001002' }), B('b-pan1', 'p-pan', '2027-12-31'), M('m-pan1', 'p-pan', 50, 'b-pan1'), B('b-pan2', 'p-pan', '2028-12-31'), M('m-pan2', 'p-pan', 30, 'b-pan2'),
  P('p-cip', 'Ciprofloxacin 500mg tabs', { shelf: 'B2', barcode: '6001003' }), B('b-cip', 'p-cip', '2028-06-30'), M('m-cip', 'p-cip', 60, 'b-cip'),
  { t: 'suppliers', id: 'sup-km', rec: { name: 'Kampala Medics', phone: '0700000001' } },
  { t: 'suppliers', id: 'sup-np', rec: { name: 'Nile Pharma', phone: '0700000002' } },
  // the same medicine from two suppliers: Nile Pharma is cheaper
  { t: 'purchases', id: 'old-p1', rec: { number: 'GRN-OLD1', supplierId: 'sup-km', supplierName: 'Kampala Medics', date: new Date(Date.now() - 20 * 864e5).toISOString().slice(0, 10), items: [{ productId: 'p-pan', name: 'Panadol Extra tabs', qty: 10, cost: 520 }], total: 5200, paid: 5200, branchId: 'main', imported: 'test' } },
  { t: 'purchases', id: 'old-p2', rec: { number: 'GRN-OLD2', supplierId: 'sup-np', supplierName: 'Nile Pharma', date: new Date(Date.now() - 10 * 864e5).toISOString().slice(0, 10), items: [{ productId: 'p-pan', name: 'Panadol Extra tabs', qty: 10, cost: 450 }], total: 4500, paid: 4500, branchId: 'main', imported: 'test' } },
  // two weeks of sales and expenses, so the dashboard charts have something to draw
  ...Array.from({ length: 14 }, (_, i) => ({ t: 'sales', id: 'hist-s' + i, rec: { number: 'H' + i, date: iso(i + 0.2), type: 'retail', branchId: 'main', items: [{ id: 'p-cip', name: 'Ciprofloxacin 500mg tabs', qty: 1, price: 1000, cost: 500, alloc: [] }], subtotal: 1000, discount: 0, tax: 0, total: 40000 + ((i * 37) % 9) * 9000, payment: 'Cash', paid: 40000 + ((i * 37) % 9) * 9000, customerId: 'walk-in', customerName: 'Walk-in Customer', cashier: 'Sam Admin', status: 'completed' } })),
  ...Array.from({ length: 5 }, (_, i) => ({ t: 'expenses', id: 'hist-e' + i, rec: { date: new Date(Date.now() - i * 6 * 864e5).toISOString().slice(0, 10), category: 'Rent', amount: 60000 + i * 15000, note: 'test', bankId: 'cash-drawer' } })),
] });
await owner('/tenants/' + tid, { features: { catalog: false } });

const b = await puppeteer.launch({ executablePath: CHROME, headless: true });
const errors = [];
const ctx = await b.createBrowserContext();
const A = await ctx.newPage(); await A.setViewport({ width: 1366, height: 900 });
A.on('pageerror', (e) => errors.push(e.message));
const go = async (h) => { await A.goto(base + '/' + slug + '#' + h, { waitUntil: 'networkidle2' }); await wait(1000); };
const clickText = (sel, re) => A.evaluate((s, src) => { const el = [...document.querySelectorAll(s)].find((x) => new RegExp(src, 'i').test(x.textContent)); if (el) el.click(); return !!el; }, sel, re.source);
// set an input's value the way React sees typing (works for date / number boxes in any locale)
const setVal = (sel, value, n = 0) => A.evaluate((s, v, i) => { const el = document.querySelectorAll(s)[i]; if (!el) return false; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); return true; }, sel, String(value), n);
const lineVal = (row, label) => A.evaluate((r, l) => document.querySelectorAll('table.lines tbody tr')[r]?.querySelector(`input[aria-label="${l}"]`)?.value, row, label);
const toastText = () => A.evaluate(() => [...document.querySelectorAll('.toast')].map((x) => x.innerText).join(' | '));
const stockOf = async () => { await go('/inventory'); await clickText('.tab', /^All$/); await wait(300); return A.evaluate(() => Object.fromEntries([...document.querySelectorAll('tbody tr')].filter((r) => r.cells.length > 5).map((r) => [r.cells[0].innerText.split('\n')[0].trim(), Number(r.cells[5].innerText.trim())]))); };

await A.goto(base + '/' + slug, { waitUntil: 'networkidle2' }); await wait(800);
await A.type('input[autocomplete=username]', 'sam@test.rx'); await A.type('input[type=password]', 'sam-pass-123');
await A.evaluate(() => [...document.querySelectorAll('button')].find((x) => x.textContent.includes('Sign in')).click());
await until(A, () => !!document.querySelector('.sidebar'), 20000); await wait(4000);

// ---------- dashboard charts (screenshots for a visual check) ----------
await go('/'); await wait(1500);
const plot = await A.$('.chart-plot');
if (plot) { const bx = await plot.boundingBox(); await A.mouse.move(bx.x + bx.width * 0.7, bx.y + bx.height / 2); await wait(300); }
check('dashboard sales chart shows a tooltip with the day\'s sales on hover', /Sales/.test(await A.evaluate(() => document.querySelector('.chart-tooltip')?.innerText || '')));
await A.screenshot({ path: path.join(out, '0-dashboard-light.png') });
await A.evaluate(() => localStorage.setItem('pharmapos-theme', 'dark')); await A.reload({ waitUntil: 'networkidle2' }); await wait(1500);
{ const p2 = await A.$('.chart-plot'); if (p2) { const bx = await p2.boundingBox(); await A.mouse.move(bx.x + bx.width * 0.7, bx.y + bx.height / 2); await wait(300); } }
await A.screenshot({ path: path.join(out, '0-dashboard-dark.png') });
await A.evaluate(() => localStorage.setItem('pharmapos-theme', 'light')); await A.reload({ waitUntil: 'networkidle2' }); await wait(1000);

// ---------- Add Stock ----------
await go('/add-stock');
await A.type('.picker input', 'Zyntrafen 200mg');
const offer = await A.evaluate(() => document.querySelector('.picker-new')?.innerText || '');
check('Add Stock: a medicine not in the list can be added from the search box', /Zyntrafen 200mg/.test(offer) && /new medicine/i.test(offer), offer);
await A.click('.picker-new'); await wait(300);
check('…the line becomes a new medicine with the name filled in', (await A.evaluate(() => document.querySelector('tr.new-line input[aria-label="New medicine name"]')?.value)) === 'Zyntrafen 200mg');
await setVal('tr.new-line input[aria-label="Quantity"]', 10); await setVal('tr.new-line input[aria-label="Line total"]', 15000); await wait(200);
check('typing the line total works out the unit cost (15,000 ÷ 10 = 1,500)', (await lineVal(0, 'Unit cost')) === '1500', await lineVal(0, 'Unit cost'));
check('…and the retail price computes itself at the markup (1,500 + 50% = 2,250)', (await lineVal(0, 'New retail price')) === '2250', await lineVal(0, 'New retail price'));
await setVal('tr.new-line input[aria-label="Quantity"]', 12); await wait(200);
check('changing the quantity keeps the typed total and re-works cost and price (1,250 → 1,875)', (await lineVal(0, 'Unit cost')) === '1250' && (await lineVal(0, 'New retail price')) === '1875', [await lineVal(0, 'Unit cost'), await lineVal(0, 'New retail price')].join(' / '));
await setVal('tr.new-line input[aria-label="New retail price"]', 3000); await setVal('tr.new-line input[aria-label="Line total"]', 18000); await wait(200);
check('a retail price typed by hand is kept when the cost changes', (await lineVal(0, 'New retail price')) === '3000' && (await lineVal(0, 'Unit cost')) === '1500', [await lineVal(0, 'Unit cost'), await lineVal(0, 'New retail price')].join(' / '));
await setVal('tr.new-line input[aria-label="Expiry date"]', future(400)); await setVal('tr.new-line input[aria-label="Batch number"]', 'ZY1');
// an existing medicine by search + Enter
await A.type('.picker input', 'Amoxyl'); await A.keyboard.press('Enter'); await wait(300);
check('Enter in the search adds the first match', /Amoxyl/.test(await A.evaluate(() => document.querySelectorAll('table.lines tbody tr')[1]?.querySelector('select')?.selectedOptions[0]?.text || '')));
await setVal('table.lines tbody tr:nth-child(2) input[aria-label="Unit cost"]', 600); await wait(200);
check('a worked-out price never lowers an existing price (600 + 50% = 900 < 1,000: keeps 1,000)', (await lineVal(1, 'New retail price')) === '1000', await lineVal(1, 'New retail price'));
await setVal('table.lines tbody tr:nth-child(2) input[aria-label="Unit cost"]', 800); await wait(200);
const hint = await A.evaluate(() => document.querySelectorAll('table.lines tbody tr')[1].querySelector('.price-hint')?.innerText || '');
check('a higher cost raises the price (800 + 50% = 1,200) and shows the old one', (await lineVal(1, 'New retail price')) === '1200' && /was UGX 1,000/.test(hint), (await lineVal(1, 'New retail price')) + ' · ' + hint);
await setVal('table.lines tbody tr:nth-child(2) input[aria-label="Quantity"]', 20);
await setVal('table.lines tbody tr:nth-child(2) input[aria-label="Batch number"]', 'B-AMOX'); // same batch: goes into it
await setVal('table.lines tbody tr:nth-child(2) input[aria-label="Expiry date"]', '2028-06-30');
await A.select('form.card select', 'sup-km');
// the unfinished delivery survives a reload
await wait(600);
await A.reload({ waitUntil: 'networkidle2' }); await wait(1500);
check('an unfinished delivery is kept on the device after a reload', (await A.evaluate(() => document.querySelectorAll('table.lines tbody tr').length)) === 2 && /unfinished delivery/i.test(await A.evaluate(() => document.querySelector('.info-notice')?.innerText || '')));
// guard rails
await setVal('table.lines tbody tr:nth-child(2) input[aria-label="Expiry date"]', '2020-01-31');
await clickText('button', /Receive stock/); await wait(500);
const pastRefused = /already passed/.test(await toastText()) || await A.evaluate(() => document.querySelectorAll('table.lines tbody tr')[1].querySelector('input[aria-label="Expiry date"]').validity.rangeUnderflow);
check('an expiry date that has passed is refused (and nothing is saved)', pastRefused && !/Received/.test(await A.evaluate(() => document.body.innerText)), await toastText());
await setVal('table.lines tbody tr:nth-child(2) input[aria-label="Expiry date"]', '2028-06-30');
await clickText('button', /Receive stock/); await wait(1500);
const savedMsg = await A.evaluate(() => [...document.querySelectorAll('.notice')].map((x) => x.innerText).join(' '));
check('Receive stock saves the new medicine and the delivery', /Received 2 item/.test(savedMsg) && /1 new medicine/.test(savedMsg), savedMsg);
await A.type('.picker input', 'amoxyl 500mg caps');
check('the search does not offer to add a name that is already in the list', !(await A.$('.picker-new')));
let st = await stockOf();
check('stock: the new medicine is in stock (12) and Amoxyl went up by 20', st['Zyntrafen 200mg'] === 12 && st['Amoxyl 500mg caps'] === 120, JSON.stringify(st));
await go('/medicines');
const zy = await A.evaluate(() => [...document.querySelectorAll('tbody tr')].find((r) => /Zyntrafen/.test(r.innerText))?.innerText.replace(/\s+/g, ' ') || '');
check('the new medicine has the typed retail price (3,000), the cost (1,500) and a barcode', /3,000/.test(zy) && /1,500/.test(zy) && /\d{8,}/.test(zy), zy);
await A.screenshot({ path: path.join(out, '1-add-stock.png'), fullPage: true });

// ---------- Stock Count ----------
await go('/stock-count');
check('Stock Count page is in the menu and opens', /Stock Count/.test(await A.evaluate(() => document.querySelector('.sidebar').innerText)) && !!(await A.$('.count-steps')));
await clickText('.page-head button', /New stock count/); await wait(400);
await clickText('.modal button', /Start counting/); await wait(1200);
const prog = await A.evaluate(() => document.querySelector('.count-progress')?.innerText || '');
check('a full stock take lists every medicine in stock (4 of them, none counted)', /0 of 4 counted/.test(prog), prog);
check('blind count: system quantities are hidden', !(await A.$('.count-sys')));
// scan Amoxyl's barcode → its box is focused → count 95
await A.type('.count-search input', '6001001'); await A.keyboard.press('Enter'); await wait(500);
const focused = await A.evaluate(() => document.activeElement?.closest('[data-count-row]')?.dataset.countRow || '');
check('scanning a barcode jumps to that medicine\'s count box', focused === 'p-amox', focused);
await A.keyboard.type('115'); await A.keyboard.press('Enter'); await wait(600);
// Panadol has two batches: one box each
await A.evaluate(() => { const i = document.querySelector('.count-search input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, ''); i.dispatchEvent(new Event('input', { bubbles: true })); });
await clickText('.tab', /^All$/); await wait(300);
const panBoxes = await A.evaluate(() => document.querySelectorAll('[data-count-row="p-pan"] [data-count-input]').length);
check('a medicine with two batches gets a count box per batch', panBoxes === 2, panBoxes);
await A.focus('[data-count-row="p-pan"] [data-count-input]'); await A.keyboard.type('50'); await A.keyboard.press('Enter'); await wait(400);
await A.keyboard.type('28'); await A.keyboard.press('Enter'); await wait(800);
check('Enter moves to the next box (counts saved: 2 of 4)', /2 of 4 counted/.test(await A.evaluate(() => document.querySelector('.count-progress')?.innerText || '')), await A.evaluate(() => document.querySelector('.count-progress')?.innerText || ''));
// a sale happens on another till after Amoxyl was counted: it must not be undone by the count
await owner('/tenants/' + tid + '/records', { records: [M('m-sale-during', 'p-amox', -5, 'b-amox', 'Sale', 0)] });
await A.click('.pill.clock'); await wait(3000);
await clickText('.page-head button', /Review/); await wait(500);
const review = await A.evaluate(() => document.querySelector('.modal')?.innerText.replace(/\s+/g, ' ') || '');
check('review lists the differences: Amoxyl −5 (115 counted vs 120) and Panadol batch B-PAN2 −2', /Amoxyl 500mg caps B-AMOX \S+ 120 115 -5/.test(review) && /B-PAN2 \S+ 30 28 -2/.test(review), review.slice(0, 300));
check('items not counted are listed and left as they are unless ticked', /2 items were not counted/.test(review));
await A.screenshot({ path: path.join(out, '2-review.png'), fullPage: true });
await clickText('.modal button', /Post count/); await wait(400);
await A.evaluate(() => document.querySelector('.modal.dialog button[type=submit], .modal.dialog .btn.primary, .modal.dialog .btn.danger-solid')?.click()); await wait(1500);
check('posting says stock now matches the count', /stock now matches/i.test(await toastText()), await toastText());
st = await stockOf();
check('Amoxyl ends at 110: counted 115 minus the 5 sold after it was counted', st['Amoxyl 500mg caps'] === 110, st['Amoxyl 500mg caps']);
check('Panadol ends at 78 and the uncounted items are unchanged (Cipro 60, Zyntrafen 12)', st['Panadol Extra tabs'] === 78 && st['Ciprofloxacin 500mg tabs'] === 60 && st['Zyntrafen 200mg'] === 12, JSON.stringify(st));
await go('/stock-count');
const hist = await A.evaluate(() => document.querySelector('tbody tr')?.innerText.replace(/\s+/g, ' ') || '');
check('the count is in the history as posted, with 2 short', /Posted/.test(hist) && / 2 /.test(` ${hist} `), hist);

// a "scan as you go" count with a batch found on the shelf that RxPOS did not know about
await clickText('.page-head button', /New stock count/); await wait(400);
await clickText('.modal .scope-opt', /Scan as you go/); await wait(200);
await A.evaluate(() => document.querySelector('.modal .field.check input')?.click()); // not blind
await clickText('.modal button', /Start counting/); await wait(1200);
await A.type('.count-search input', 'Cipro'); await A.keyboard.press('Enter'); await wait(800);
check('an item scanned or typed is added to a "scan as you go" count', !!(await A.$('[data-count-row="p-cip"]')));
check('not blind: the system quantity shows', /60/.test(await A.evaluate(() => document.querySelector('[data-count-row="p-cip"] .count-sys')?.innerText || '')));
await A.focus('[data-count-row="p-cip"] [data-count-input]'); await A.keyboard.type('60'); await A.keyboard.press('Enter'); await wait(500);
await clickText('[data-count-row="p-cip"] button', /Found another batch/); await wait(300);
await A.type('.found-batch input[aria-label="Batch number"]', 'CX9');
await setVal('.found-batch input[aria-label="Expiry"]', future(700));
await A.type('.found-batch input[aria-label="Quantity found"]', '7');
await clickText('.found-batch button', /^Add$/); await wait(800);
check('a found batch is added to the count', /CX9/.test(await A.evaluate(() => document.querySelector('[data-count-row="p-cip"]')?.innerText || '')));
await clickText('.page-head button', /Review/); await wait(500);
await clickText('.modal button', /Post count/); await wait(400);
await A.evaluate(() => document.querySelector('.modal.dialog button[type=submit], .modal.dialog .btn.primary')?.click()); await wait(1500);
st = await stockOf();
check('posting adds the found batch: Cipro 60 → 67', st['Ciprofloxacin 500mg tabs'] === 67, st['Ciprofloxacin 500mg tabs']);
await go('/stock-card');
await A.evaluate(() => { const s = [...document.querySelectorAll('select')].find((x) => [...x.options].some((o) => o.value === 'p-cip')); s.value = 'p-cip'; s.dispatchEvent(new Event('change', { bubbles: true })); }); await wait(500);
check('the stock card shows the count as a "Stock count" movement', /Stock count/.test(await A.evaluate(() => document.querySelector('tbody')?.innerText || '')));

// ---------- POS: keyboard, held sales ----------
await go('/pos'); await wait(500);
const cartNames = () => A.evaluate(() => [...document.querySelectorAll('.cart-line strong')].map((x) => x.innerText));
await A.focus('.pos-products input.search');
await A.keyboard.press('ArrowRight'); await A.keyboard.press('Enter'); await wait(400);
check('POS: arrow keys move through the medicines and Enter adds the highlighted one', (await cartNames()).length === 1, JSON.stringify(await cartNames()));
await A.keyboard.type('99999999'); await A.keyboard.press('Enter'); await wait(400);
check('an unknown barcode adds nothing (never guesses)', (await cartNames()).length === 1 && /No medicine has the barcode/.test(await toastText()));
await A.evaluate(() => { const i = document.querySelector('.pos-products input.search'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, ''); i.dispatchEvent(new Event('input', { bubbles: true })); });
await A.focus('.pos-products input.search'); await A.keyboard.type('6001002'); await A.keyboard.press('Enter'); await wait(400);
await A.keyboard.press('+'); await wait(200);
const first = await cartNames();
check('a scanned barcode adds that medicine and + adds one more of it', first.includes('Panadol Extra tabs') && /\b2\b/.test(await A.evaluate(() => [...document.querySelectorAll('.cart-line')].find((l) => /Panadol/.test(l.innerText))?.querySelector('input[aria-label=Quantity]')?.value)), JSON.stringify(first));
await A.keyboard.down('Alt'); await A.keyboard.press('h'); await A.keyboard.up('Alt'); await wait(400);
check('Alt+H puts the sale on hold and starts an empty one', (await cartNames()).length === 0 && (await A.evaluate(() => document.querySelectorAll('.sale-tab-wrap').length)) === 1);
await A.focus('.pos-products input.search'); await A.keyboard.type('6001003'); await A.keyboard.press('Enter'); await wait(400);
await A.keyboard.down('Alt'); await A.keyboard.press('ArrowRight'); await A.keyboard.up('Alt'); await wait(400);
check('Alt+→ switches to the held sale, and the other one goes on hold', (await cartNames()).includes('Panadol Extra tabs') && !(await cartNames()).includes('Ciprofloxacin 500mg tabs') && (await A.evaluate(() => document.querySelectorAll('.sale-tab-wrap').length)) === 1);
await A.keyboard.down('Alt'); await A.keyboard.press('2'); await A.keyboard.up('Alt'); await wait(200);
check('Alt+2 picks the second payment method', /Mobile Money/.test(await A.evaluate(() => document.querySelector('.pay-methods .chip.active')?.innerText || '')));
await wait(500);
await A.reload({ waitUntil: 'networkidle2' }); await wait(1500);
check('the current sale and the held sale are still there after a reload', (await cartNames()).includes('Panadol Extra tabs') && (await A.evaluate(() => document.querySelectorAll('.sale-tab-wrap').length)) === 1);
await A.keyboard.press('Escape');
await A.evaluate(() => document.querySelector('.pos-head, .pos-title')?.click());
await A.keyboard.press('?'); await wait(300);
check('? shows the list of POS shortcuts', /Alt\+H/.test(await A.evaluate(() => document.querySelector('.modal')?.innerText || '')));
await A.screenshot({ path: path.join(out, '3-pos.png'), fullPage: true });

// ---------- self-update (web) ----------
await go('/settings'); await clickText('.tab', /Data & backup/); await wait(400);
const ver = await A.evaluate(() => document.querySelector('.card strong')?.innerText || '');
check('Settings shows the app version (1.0 and the build)', /RxPOS 1\.0 · \d{4}-\d{2}-\d{2}/.test(ver), ver);
const myBuild = await A.evaluate(() => fetch('./version.json').then((r) => r.json()).then((m) => m.build));
check('the site publishes version.json with the build and a file list', myBuild > 1e9, myBuild);
const apiVer = await fetch(base + '/api/version').then(async (r) => ({ cors: r.headers.get('access-control-allow-origin'), ...(await r.json()) })).catch((e) => ({ error: e.message }));
check('/api/version answers apps on other addresses (Android) with the same build, CORS allowed', apiVer.build === myBuild && apiVer.cors === '*' && /^updates\/web-\d+\.zip$/.test(apiVer.zip || ''), JSON.stringify({ b: apiVer.build, c: apiVer.cors, z: apiVer.zip, e: apiVer.error }));
const zipOk = await fetch(base + '/' + apiVer.zip).then((r) => r.ok && r.headers.get('content-length') !== '0').catch(() => false);
check('the update archive for Android can be downloaded', zipOk);
await A.setRequestInterception(true);
const onReq = (req) => (req.url().includes('/version.json') ? req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ version: '1.0.0', build: myBuild + 3600, label: '1.0 · newer', shell: 1, files: [] }) }) : req.continue());
A.on('request', onReq);
const reloaded = A.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).then(() => true).catch(() => false);
await clickText('button', /Update to the latest version/);
check('"Update to the latest version" finds the newer build and reloads the app onto it', await reloaded);
A.off('request', onReq); await A.setRequestInterception(false);
await wait(1500);

// ---------- supplier price comparison ----------
await go('/purchases'); await clickText('.tab', /Supplier prices/); await wait(400);
const sp = await A.evaluate(() => [...document.querySelectorAll('tbody tr')].find((r) => /Panadol/.test(r.innerText))?.innerText.replace(/\s+/g, ' ') || '');
check('Purchase History → Supplier prices: Panadol cheapest at Nile Pharma (450) vs Kampala Medics (520), 16% gap', /Nile Pharma UGX 450/.test(sp) && /Kampala Medics: UGX 520/.test(sp) && /16%/.test(sp), sp);
await go('/add-stock'); await A.select('form.card select', 'sup-km');
await A.type('.picker input', 'Panadol'); await A.keyboard.press('Enter'); await wait(300);
await setVal('table.lines tbody tr:nth-child(1) input[aria-label="Unit cost"]', 520); await wait(200);
check('Add Stock warns when another supplier sold it cheaper', /Nile Pharma: UGX 450/.test(await A.evaluate(() => document.querySelector('table.lines tbody tr')?.innerText || '')));
await clickText('button', /Start again|Discard/);

// ---------- profit & margins ----------
await owner('/tenants/' + tid + '/records', { records: [P('p-cip', 'Ciprofloxacin 500mg tabs', { shelf: 'B2', barcode: '6001003', price: 520 })] });
await A.click('.pill.clock'); await wait(3000);
await go('/reports'); await clickText('.tab', /Profit & margins/); await wait(500);
await setVal('.page-head input[type=date]', new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10)); await wait(500);
const prof = await A.evaluate(() => document.querySelector('.page')?.innerText.replace(/\s+/g, ' ') || '');
check('Reports → Profit & margins: gross profit and margin over the period', /Gross profit UGX [\d,]+/i.test(prof) && /Gross margin \d+%/i.test(prof), prof.slice(0, 200));
check('price check lists a medicine below the 20% target margin (Cipro 500 → 520 = 4%) with the price that would reach it (625)', /Ciprofloxacin 500mg tabs UGX 500 UGX 520 4% UGX 625/.test(prof), prof.match(/Price check.{0,200}/)?.[0]);

// ---------- returns to supplier ----------
{
  const before = (await stockOf())['Panadol Extra tabs'];
  await go('/returns'); await clickText('.page-head button', /New return/); await wait(400);
  await A.select('.modal select', 'sup-km');
  await A.type('.modal .picker input', 'Panadol'); await A.keyboard.press('Enter'); await wait(300);
  await setVal('.modal input[aria-label="Quantity returned"]', 5);
  await A.evaluate(() => { const s = document.querySelector('.modal select[aria-label="Reason"]'); s.value = 'Damaged'; s.dispatchEvent(new Event('change', { bubbles: true })); });
  await clickText('.modal button', /Save return/); await wait(1200);
  const row = await A.evaluate(() => document.querySelector('tbody tr')?.innerText.replace(/\s+/g, ' ') || '');
  check('a return to the supplier is saved with its credit note value (5 × 500)', /Kampala Medics/.test(row) && /Credit note/.test(row) && /UGX 2,500/.test(row), row);
  const after = (await stockOf())['Panadol Extra tabs'];
  check('returned stock leaves the batch (Panadol −5)', after === before - 5, `${before} → ${after}`);
  await go('/stock-card');
  await A.evaluate(() => { const s = [...document.querySelectorAll('select')].find((x) => [...x.options].some((o) => o.value === 'p-pan')); s.value = 'p-pan'; s.dispatchEvent(new Event('change', { bubbles: true })); }); await wait(500);
  check('the stock card shows it as a "Supplier return"', /Supplier return/.test(await A.evaluate(() => document.querySelector('tbody')?.innerText || '')));
}

// ---------- controlled drugs register & batch recall ----------
{
  await owner('/tenants/' + tid + '/records', { records: [P('p-amox', 'Amoxyl 500mg caps', { shelf: 'A1', barcode: '6001001', controlled: true, price: 1200, cost: 800 })] });
  await A.click('.pill.clock'); await wait(3000);
  await go('/pos'); await wait(500);
  await A.focus('.pos-products input.search'); await A.keyboard.type('6001001'); await A.keyboard.press('Enter'); await wait(400);
  await A.keyboard.down('Alt'); await A.keyboard.press('1'); await A.keyboard.up('Alt'); // cash
  await A.keyboard.press('F9'); await wait(500);
  const asked = await A.evaluate(() => /register details/.test(document.querySelector('.modal')?.innerText || ''));
  check('selling a controlled drug asks for patient, prescriber and prescription', asked);
  const fill = async (label, v) => A.evaluate((l, val) => { const f = [...document.querySelectorAll('.modal label.field')].find((x) => x.innerText.startsWith(l)); const i = f.querySelector('input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, val); i.dispatchEvent(new Event('input', { bubbles: true })); }, label, v);
  await fill("Patient's name", 'Jane Nakato'); await fill("Patient's ID", 'CM90012345'); await fill('Prescriber', 'Dr Okello'); await fill("Prescriber's registration", 'UMDPC-4411'); await fill('Prescription no.', 'RX-2201');
  await clickText('.modal button', /Record & continue/); await wait(1500);
  check('…then the sale completes', /Sale complete/.test(await A.evaluate(() => document.querySelector('.modal h3')?.innerText || '')));
  await clickText('.modal button', /New sale/); await wait(300);
  await go('/controlled'); await wait(500);
  const reg = await A.evaluate(() => document.querySelector('tbody')?.innerText.replace(/\s+/g, ' ') || '');
  check('the register shows the sale with patient, ID, prescriber and prescription, and the running balance', /Sale/.test(reg) && /Jane Nakato/.test(reg) && /CM90012345/.test(reg) && /Dr Okello \(UMDPC-4411\)/.test(reg) && /Rx RX-2201/.test(reg), reg.slice(0, 200));
  await clickText('.tab', /Batch recall/); await wait(300);
  await A.type('.search-wrap input', 'B-AMOX'); await wait(500);
  const rec = await A.evaluate(() => document.querySelector('.page')?.innerText.replace(/\s+/g, ' ') || '');
  check('batch recall lookup lists who received batch B-AMOX', /Amoxyl 500mg caps · batch B-AMOX/.test(rec) && /Jane Nakato/.test(rec), rec.slice(0, 250));
}

// ---------- daily owner summary ----------
{
  const r = await fetch(base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'sam@test.rx', password: 'sam-pass-123' }) }).then((x) => x.json());
  const sum = await fetch(base + '/api/summary', { headers: { Authorization: 'Bearer ' + r.token } }).then((x) => x.json());
  check("daily summary: today's sales, payment split, profit, best sellers and stock to watch", /daily summary for \d{4}-\d{2}-\d{2}/.test(sum.text || '') && /Sales: UGX [\d,]+ \(\d+ sales?\)/.test(sum.text) && /Gross profit/.test(sum.text) && /Best sellers:/.test(sum.text) && /Amoxyl/.test(sum.text), (sum.text || sum.error || '').slice(0, 300));
  await go('/settings'); await clickText('.tab', /Alerts/); await wait(300);
  await clickText('button', /Preview today's summary/); await wait(1500);
  check('Settings → Alerts previews the summary with a WhatsApp share button', /Sales: UGX/.test(await A.evaluate(() => document.querySelector('.summary-preview')?.innerText || '')) && !!(await A.$('a[href^="https://wa.me/?text="]')));
}

// ---------- pack sizes: sell and receive by the strip ----------
{
  await go('/medicines'); await A.type('.page-head input.search', 'Ciprofloxacin'); await wait(400);
  await clickText('tbody button', /^Packs/); await wait(300);
  await setVal('.modal input[aria-label="Pack name"]', 'Strip'); await setVal('.modal input[aria-label="Units in the pack"]', 10); await setVal('.modal input[aria-label="Pack price"]', 4800);
  await clickText('.modal button', /Save packs/); await wait(600);
  const before = (await stockOf())['Ciprofloxacin 500mg tabs'];
  await go('/pos'); await wait(500);
  await A.focus('.pos-products input.search'); await A.keyboard.type('6001003'); await A.keyboard.press('Enter'); await wait(400);
  await A.evaluate(() => { const l = [...document.querySelectorAll('.cart-line')].find((x) => /Ciprofloxacin/.test(x.innerText)); const s2 = l.querySelector('select[aria-label="Sell by"]'); s2.value = 'Strip'; s2.dispatchEvent(new Event('change', { bubbles: true })); }); await wait(200);
  await A.evaluate(() => [...document.querySelectorAll('.cart-line')].find((x) => /Ciprofloxacin/.test(x.innerText)).querySelector('button[aria-label=More]').click()); await wait(200);
  const line = await A.evaluate(() => [...document.querySelectorAll('.cart-line')].find((x) => /Ciprofloxacin/.test(x.innerText))?.innerText.replace(/\s+/g, ' '));
  check('POS sells by the strip: 2 strips at 4,800 = 9,600', /UGX 9,600/.test(line || ''), line);
  await A.keyboard.down('Alt'); await A.keyboard.press('1'); await A.keyboard.up('Alt');
  await clickText('button', /^Charge/); await wait(1500);
  const receipt = await A.evaluate(() => document.querySelector('.modal')?.innerText.replace(/\s+/g, ' ') || '');
  check('the receipt says 2 × Strip (10)', /2 × Strip \(10\) @ UGX 4,800/.test(receipt), receipt.slice(0, 200));
  await clickText('.modal button', /New sale/); await wait(300);
  const mid = (await stockOf())['Ciprofloxacin 500mg tabs'];
  check('stock goes down in tablets (20)', mid === before - 20, `${before} → ${mid}`);
  await go('/add-stock'); await A.evaluate(() => document.querySelectorAll('button[aria-label="Remove line"]').forEach((x) => x.click())); await wait(300);
  await A.select('form.card select', 'sup-km');
  await A.type('.picker input', 'Ciprofloxacin'); await A.keyboard.press('Enter'); await wait(300);
  await A.evaluate(() => { const s2 = document.querySelector('table.lines tbody tr select[aria-label="Received as"]'); s2.value = 'Strip'; s2.dispatchEvent(new Event('change', { bubbles: true })); }); await wait(200);
  await setVal('table.lines tbody tr:nth-child(1) input[aria-label="Quantity"]', 2);
  await setVal('table.lines tbody tr:nth-child(1) input[aria-label="Line total"]', 8000);
  await setVal('table.lines tbody tr:nth-child(1) input[aria-label="Batch number"]', 'B-CIP');
  await setVal('table.lines tbody tr:nth-child(1) input[aria-label="Expiry date"]', '2028-06-30'); await wait(200);
  check('Add Stock receives by the strip and shows the tablets (2 strips = 20)', /= 20 units/.test(await A.evaluate(() => document.querySelector('table.lines tbody tr')?.innerText || '')));
  await clickText('button', /Receive stock/); await wait(1500);
  const after = (await stockOf())['Ciprofloxacin 500mg tabs'];
  check('received strips add tablets to stock (+20)', after === mid + 20, `${mid} → ${after}`);
}

// ---------- camera barcode scanning (Chrome's fake camera shows a Code 128 barcode for 6001003, Ciprofloxacin) ----------
{
  const PAT = ('212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 221312 231212 112232 122132 122231 113222 123122 123221 223211 221132 221231 213212 223112 312131 311222 321122 321221 312212 322112 322211 212123 212321 232121 111323 131123 131321 112313 132113 132311 211313 231113 231311 112133 112331 132131 113123 113321 133121 313121 211331 231131 213113 213311 213131 311123 311321 331121 312113 312311 332111 314111 221411 431111 111224 111422 121124 121421 141122 141221 112214 112412 122114 122411 142112 142211 241211 221114 413111 241112 134111 111242 121142 121241 114212 124112 124211 411212 421112 421211 212141 214121 412121 111143 111341 131141 114113 114311 411113 411311 113141 114131 311141 411131 211412 211214 211232 2331112').split(' ');
  const text = '6001003', codes = [104, ...[...text].map((c) => c.charCodeAt(0) - 32)];
  codes.push(codes.reduce((a, c, i) => a + c * (i || 1), 0) % 103, 106);
  const widths = codes.flatMap((c) => [...PAT[c]].map(Number));
  const W = 640, H = 480, mod = 3, x0 = Math.round((W - widths.reduce((a, b) => a + b, 0) * mod) / 2);
  const Y = Buffer.alloc(W * H, 235);
  let x = x0; widths.forEach((w, i) => { if (i % 2 === 0) for (let yy = 140; yy < 340; yy++) Y.fill(16, yy * W + x, yy * W + x + w * mod); x += w * mod; });
  const UV = Buffer.alloc((W / 2) * (H / 2) * 2, 128);
  const frames = [Buffer.from(`YUV4MPEG2 W${W} H${H} F10:1 Ip A1:1 C420jpeg\n`)];
  for (let f = 0; f < 10; f++) frames.push(Buffer.from('FRAME\n'), Y, UV);
  const cam = path.resolve(out, 'barcode.y4m'); fs.writeFileSync(cam, Buffer.concat(frames));
  const bc = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${cam}`] });
  const C = await (await bc.createBrowserContext()).newPage(); await C.setViewport({ width: 1280, height: 860 });
  C.on('pageerror', (e) => errors.push(e.message));
  await C.goto(base + '/' + slug, { waitUntil: 'networkidle2' }); await wait(800);
  await C.type('input[autocomplete=username]', 'sam@test.rx'); await C.type('input[type=password]', 'sam-pass-123');
  await C.evaluate(() => [...document.querySelectorAll('button')].find((x) => x.textContent.includes('Sign in')).click());
  await until(C, () => !!document.querySelector('.sidebar'), 20000); await wait(3000);
  await C.goto(base + '/' + slug + '#/pos', { waitUntil: 'networkidle2' }); await wait(1200);
  await C.evaluate(() => { for (const b of document.querySelectorAll('.sale-tab-x')) b.remove(); });
  const before = await C.evaluate(() => [...document.querySelectorAll('.cart-line strong')].filter((x) => /Ciprofloxacin/.test(x.innerText)).length);
  await C.click('.cam-btn');
  const read = await until(C, () => /Ciprofloxacin 500mg tabs added/.test(document.querySelector('.camscan-last')?.innerText || ''), 25000);
  check('camera scan at the POS reads the barcode and adds the medicine', read, await C.evaluate(() => document.querySelector('.camscan-last, .camscan-msg')?.innerText || 'nothing read'));
  await C.evaluate(() => [...document.querySelectorAll('.modal button')].find((x) => /Done/.test(x.innerText))?.click()); await wait(400);
  check('…it is on the sale', (await C.evaluate(() => [...document.querySelectorAll('.cart-line strong')].some((x) => /Ciprofloxacin/.test(x.innerText)))) || before > 0);
  // scan-to-count in a stock count
  await C.goto(base + '/' + slug + '#/stock-count', { waitUntil: 'networkidle2' }); await wait(1000);
  await C.evaluate(() => [...document.querySelectorAll('.page-head button')].find((x) => /New stock count/.test(x.innerText)).click()); await wait(400);
  await C.evaluate(() => [...document.querySelectorAll('.modal .scope-opt')].find((x) => /Scan as you go/.test(x.innerText)).click()); await wait(200);
  await C.evaluate(() => [...document.querySelectorAll('.modal button')].find((x) => /Start counting/.test(x.innerText)).click()); await wait(1200);
  await C.click('.count-search .cam-count');
  const counted = await until(C, () => /Ciprofloxacin 500mg tabs: \d+ counted/.test(document.querySelector('.camscan-last')?.innerText || ''), 25000);
  check('scan-to-count: each scan of the pack counts it on the stock count', counted, await C.evaluate(() => document.querySelector('.camscan-last')?.innerText || ''));
  await C.screenshot({ path: path.join(out, '4-camera.png') });
  await bc.close();
}

check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await b.close();
await owner('/tenants/' + tid + '/delete', { confirm: slug });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

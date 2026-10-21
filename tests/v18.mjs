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
await A.type('input[type=email]', 'sam@test.rx'); await A.type('input[type=password]', 'sam-pass-123');
await A.evaluate(() => [...document.querySelectorAll('button')].find((x) => x.textContent.includes('Sign in')).click());
await until(A, () => !!document.querySelector('.sidebar'), 20000); await wait(4000);

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
await clickText('button', /Check for updates/); await wait(1200);
check('a newer build is noticed and offered ("update ready")', !!(await A.$('.update-pill')) && /New version ready/.test(await A.evaluate(() => document.body.innerText)), await A.evaluate(() => [...document.querySelectorAll('.card')].find((c) => /App version/.test(c.innerText))?.innerText.replace(/\s+/g, ' ')));
A.off('request', onReq); await A.setRequestInterception(false);
const reloaded = A.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).then(() => true).catch(() => false);
if (await A.$('.update-pill')) await A.click('.update-pill');
check('"Update" reloads the app onto the new build', await reloaded);
await wait(1500);

check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await b.close();
await owner('/tenants/' + tid + '/delete', { confirm: slug });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

// From the SmarterPOS review, second batch (27 Nov 2026), in the app against the local cloud: a held sale printed as a
// slip that another person opens by its code at their counter; a pharmacist's order goes to the manager as a request
// and becomes a draft order once approved; sales and commission per staff member; every list downloadable; the
// website's other pages (#/learn/…). Fictional data only.   node v94-shop-window-2.mjs <base> <ownerKey>
import puppeteer from 'puppeteer-core';
import { CHROME } from './chrome.mjs';
const [base, ownerKey] = process.argv.slice(2);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + String(x).slice(0, 300) : ''}`); };
const owner = (p, body) => fetch(base + '/api/owner' + p, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ownerKey }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());
const recs = async (tid, t) => ((await owner(`/tenants/${tid}/records?t=${t}&offset=0`)).rows || []).map((r) => r.rec);
const until = async (p, fn, ms = 20000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await p.evaluate(fn).catch(() => false)) return true; await wait(300); } return false; };
const ago = (d) => new Date(Date.now() - d * 864e5).toISOString();
const day = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const errors = [];

const t = await owner('/tenants', { name: 'Slip Test Pharmacy', admin: { name: 'Ada Admin', email: 'ada@slip.rx', password: 'ada-pass-1234' } });
const slug = t.tenant.slug, tid = t.tenant.id;
await owner('/tenants/' + tid, { features: { catalog: false } });
await owner('/tenants/' + tid + '/records', { records: [
  { t: 'products', id: 'p1', rec: { name: 'Sample Caps 250mg', form: 'Capsules', unit: 'Capsule', price: 1500, cost: 1000, reorder: 50 } },
  { t: 'batches', id: 'b1', rec: { productId: 'p1', batch: 'SC1', expiry: day(400), cost: 1000 } },
  { t: 'movements', id: 'm1', rec: { productId: 'p1', qty: 10, type: 'Opening stock', batchId: 'b1', branchId: 'main', date: ago(20) } },
  ...[9, 6, 3].map((d, i) => ({ t: 'movements', id: 'ms' + i, rec: { productId: 'p1', qty: -2, type: 'Sale', ref: 'R' + i, batchId: 'b1', branchId: 'main', date: ago(d) } })),
  ...[9, 6, 3].map((d, i) => ({ t: 'sales', id: 's' + i, rec: { number: 'R' + i, date: ago(d), type: 'retail', branchId: 'main', items: [{ id: 'p1', name: 'Sample Caps 250mg', qty: 2, price: 1500, cost: 1000 }], subtotal: 3000, total: 3000, paid: 3000, payment: 'Cash', cashier: i ? 'Pat Pharmacist' : 'Ada Admin', customerId: 'walk-in' } })),
  { t: 'settings', id: 'settings', rec: { name: 'Slip Test Pharmacy', commissionPct: 2 } },
] });
await owner('/tenants/' + tid + '/users', { user: { name: 'Pat Pharmacist', email: 'pat@slip.rx', role: 'pharmacist', password: 'pat-pass-1234' } });

const b = await puppeteer.launch({ executablePath: CHROME, headless: true });
const signIn = async (email, pw) => {
  const p = await (await b.createBrowserContext()).newPage();
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('dialog', (d) => d.dismiss().catch(() => {}));
  await p.setViewport({ width: 1366, height: 900 });
  await p.goto(base + '/' + slug, { waitUntil: 'networkidle2' }); await wait(600);
  await p.evaluate(() => { for (const id of ['pos', 'dashboard', 'sales', 'reorder', 'reports', 'settings']) localStorage.setItem('rxpos-tip:' + id, '1'); });
  await p.type('input[autocomplete=username]', email); await p.type('input[type=password]', pw);
  await p.evaluate(() => [...document.querySelectorAll('form button')].find((x) => /^Sign in/.test(x.textContent.trim()))?.click());
  await p.waitForSelector('.sidebar', { timeout: 20000 });
  await until(p, () => /^Synced/.test(document.querySelector('.pill.clock .clock-state')?.innerText || ''), 30000);
  return p;
};
const go = (p, hash) => p.evaluate((h) => { location.hash = h; }, hash).then(() => wait(1200));
const setInput = (p, sel, v) => p.evaluate((s, val) => { const i = document.querySelector(s); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, val); i.dispatchEvent(new Event('input', { bubbles: true })); }, sel, v);
const click = (p, sel, re) => p.evaluate((s, src) => { const x = [...document.querySelectorAll(s)].find((e) => new RegExp(src).test(e.textContent)); x?.click(); return !!x; }, sel, re.source);
const synced = (p) => until(p, () => /^Synced/.test(document.querySelector('.pill.clock .clock-state')?.innerText || ''), 30000);

// ---- Pat prepares a sale, holds it and prints a slip ----
const pat = await signIn('pat@slip.rx', 'pat-pass-1234');
await go(pat, '#/pos');
await setInput(pat, '.search-row input', 'Sample Caps'); await wait(300);
await pat.evaluate(() => document.querySelector('.product')?.click()); await wait(200);
await pat.evaluate(() => document.querySelector('.product')?.click()); await wait(200);
await pat.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'h', altKey: true, bubbles: true }))); await wait(600);
check('holding a sale offers "Print a slip"', await click(pat, '.toast button', /Print a slip/)); await wait(400);
const slipText = await pat.evaluate(() => document.querySelector('.sale-slip')?.innerText || '');
const code = (slipText.match(/S-[2-9A-HJ-NP-Z]{6}/) || [])[0];
check('…the slip shows its code, the medicines and the total, and says it is not a receipt', !!code && /Sample Caps 250mg/.test(slipText) && /3,000/.test(slipText) && /Not a receipt/.test(slipText), slipText.replace(/\s+/g, ' '));
await pat.keyboard.press('Escape'); await wait(300);
await synced(pat); await wait(1500);

// ---- Ada, at another counter, types the code ----
const ada = await signIn('ada@slip.rx', 'ada-pass-1234');
await go(ada, '#/pos');
await setInput(ada, '.search-row input', code.toLowerCase().replace('-', ''));
await ada.evaluate(() => document.querySelector('.search-row input').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))); await wait(800);
check('another person opens the slip by its code: the sale is on their till', await ada.evaluate(() => /Sample Caps 250mg/.test(document.querySelector('.cart, .pos-cart, .sale-lines')?.innerText || document.body.innerText) && [...document.querySelectorAll('.toast')].some((x) => /Slip S-/.test(x.innerText))), await ada.evaluate(() => [...document.querySelectorAll('.toast')].map((x) => x.innerText).join(' | ')));
await ada.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F9', bubbles: true })));
check('…and charges it', await until(ada, () => /Sale complete/.test(document.querySelector('.modal')?.innerText || ''), 8000));
await ada.keyboard.press('Escape'); await wait(300);
await synced(ada); await wait(1500);
check('the held sale is gone once paid (no double charge)', !(await recs(tid, 'drafts')).some((d) => d.kind === 'sale' && !d.deleted && d.data?.cart?.length));

// ---- Pat sends an order as a request; Ada approves it ----
await go(pat, '#/reorder');
check('a pharmacist reviews the order as a request', await click(pat, '.page button', /Review the request/)); await wait(500);
check('…and sends it to the manager', await click(pat, '.modal button', /Send 1 request/), await pat.evaluate(() => (document.querySelector('.modal')?.innerText || 'no modal: ' + document.body.innerText.replace(/\s+/g, ' ').split('Signed in').pop().slice(-280) || ''))); await wait(800);
await synced(pat); await wait(1500);
const req = (await recs(tid, 'purchaseOrders'))[0];
check('the cloud has it as Requested, by Pat', req?.status === 'Requested' && req.requestedBy === 'Pat Pharmacist', JSON.stringify(req));
await go(ada, '#/'); await wait(1500);
check('the manager\'s dashboard says a request is waiting', await ada.evaluate(() => /1 stock request waiting for your approval \(Pat Pharmacist\)/.test(document.querySelector('.stock-controls')?.innerText || '')));
await go(ada, '#/reorder');
await click(ada, '[role=tab], .tab, button', /^Purchase orders$/); await wait(500);
check('…and approves it', await click(ada, 'button', /^Approve$/)); await wait(800);
await synced(ada); await wait(1500);
const ok = (await recs(tid, 'purchaseOrders'))[0];
check('approved: an ordinary draft order, with who approved it', ok?.status === 'Draft' && ok.approvedBy === 'Ada Admin', JSON.stringify(ok));

// ---- sales and commission per staff; your data ----
await go(ada, '#/reports'); await wait(800);
const staff = await ada.evaluate(() => document.querySelector('.by-staff')?.innerText || '');
check('Reports: sales and 2% commission per staff member', /Commission 2%/i.test(staff) && /Pat Pharmacist/.test(staff) && /Ada Admin/.test(staff), staff.replace(/\s+/g, ' '));
await ada.evaluate(() => { location.hash = '#/settings'; }); await wait(800);
await ada.goto(base + '/' + slug + '#/settings', { waitUntil: 'networkidle2' }).catch(() => {});
await wait(500);
await click(ada, '[role=tab], .tab, button, a', /Data & backup/); await wait(600);
check('Settings: every list downloadable as a spreadsheet', await ada.evaluate(() => /Your data, as spreadsheets/.test(document.body.innerText) && [...document.querySelectorAll('.your-data button')].some((x) => /^Sales \(\d+\)/.test(x.textContent))));

// ---- the website's other pages ----
const w = await (await b.createBrowserContext()).newPage();
w.on('pageerror', (e) => errors.push(e.message));
await w.evaluateOnNewDocument(() => sessionStorage.setItem('rxpos-test-welcome', '1'));
for (const [h, re] of [['features', /Everything RxPOS does/], ['guide', /Help guide for the counter/], ['articles', /Articles for pharmacy owners/], ['articles/nda-inspection-checklist', /NDA inspection/], ['moving', /Moving to RxPOS/]]) {
  await w.goto(base + '/#/learn/' + h, { waitUntil: 'networkidle2' }); await wait(500);
  check(`website page #/learn/${h}`, re.test(await w.evaluate(() => document.querySelector('.front-page main')?.innerText || '')) && !(await w.$('input[type=password]')));
}
check('no page errors', errors.length === 0, errors.join(' | '));
await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

// 1.7 screens, run as the Windows app (tests/appmode.mjs) with a fictional pharmacy: the Vivid colour level, the
// dashboard charts (real dates, 7/30/90 days, a day opens its sales, top 10 by amount / quantity / profit), Reports →
// Sales lines (totals, profit, a line sold below cost, filters), Sales History (filters, phone, pages, print a
// receipt or an A4 invoice from the row), Purchase History (payment type, notes, supplier filter), and synced drafts:
// a sale held on one device continues on another, a supervisor sees and discards a cashier's held sale (audited), a
// delivery saved as a draft continues and is received once, and no draft changes stock.
//   node v41-reports-drafts.mjs <base> <ownerKey> <outDir>
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import { CHROME } from './chrome.mjs';
import { asDesktopApp, APP_ARGS } from './appmode.mjs';
const [base, ownerKey, out] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + String(x).slice(0, 240) : ''}`); };
const owner = (p, body) => fetch(base + '/api/owner' + p, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ownerKey }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());
const until = async (p, fn, ms = 20000, arg) => { const end = Date.now() + ms; while (Date.now() < end) { if (await p.evaluate(fn, arg).catch(() => false)) return true; await wait(300); } return false; };
const untilNode = async (fn, ms = 25000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn().catch(() => false)) return true; await wait(500); } return false; };
const hoursAgo = (h) => new Date(Date.now() - h * 36e5).toISOString();
const day = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

for (const x of (await owner('/tenants')).tenants || []) if (x.name === 'Colour Sample Pharmacy') await owner('/tenants/' + x.id + '/delete', { confirm: x.slug });
const t = await owner('/tenants', { name: 'Colour Sample Pharmacy', admin: { name: 'Robin Sample', email: 'robin@test.rx', password: 'robin-pass-1234' } });
const slug = t.tenant.slug, tid = t.tenant.id;
await owner('/tenants/' + tid + '/users', { user: { name: 'Casey Cashier', email: 'casey@test.rx', role: 'cashier', password: 'casey-pass-123' } });
const sales = [];
for (let i = 0; i < 60; i++) {
  const c1 = i % 5 === 0;
  sales.push({ t: 'sales', id: 'sx' + i, rec: { number: 'RTEST' + String(i).padStart(3, '0'), date: hoursAgo(2 + i * 6), items: [{ id: 'p1', name: 'Sample Tabs 500mg', qty: 2, price: 500, cost: 300 }],
    subtotal: 1000, discount: 0, tax: 0, total: 1000, paid: 1000, payment: i % 2 ? 'Mobile Money' : 'Cash', cashier: i % 3 ? 'Robin Sample' : 'Ann Sample',
    customerId: c1 ? 'c1' : 'walk-in', customerName: c1 ? 'Grace Sample' : 'Walk-in Customer', status: 'completed', type: 'retail', branchId: 'main' } });
}
sales.push({ t: 'sales', id: 'sloss', rec: { number: 'RLOSS01', date: hoursAgo(1), items: [{ id: 'p2', name: 'Loss Leader Tabs', qty: 1, price: 200, cost: 300 }], subtotal: 200, discount: 0, tax: 0, total: 200, paid: 200,
  payment: 'Cash', cashier: 'Robin Sample', customerId: 'walk-in', customerName: 'Walk-in Customer', status: 'completed', type: 'retail', branchId: 'main' } });
await owner('/tenants/' + tid + '/records', { records: [
  { t: 'products', id: 'p1', rec: { name: 'Sample Tabs 500mg', generic: 'Samplamol', form: 'Tablets', unit: 'Tablet', price: 500, cost: 300, reorder: 0 } },
  { t: 'batches', id: 'b1', rec: { productId: 'p1', batch: 'S1', expiry: day(300), cost: 300 } },
  { t: 'movements', id: 'm1', rec: { productId: 'p1', qty: 500, type: 'Opening stock', batchId: 'b1', branchId: 'main', date: hoursAgo(24 * 30) } },
  { t: 'products', id: 'p2', rec: { name: 'Loss Leader Tabs', generic: 'Lossamol', form: 'Tablets', unit: 'Tablet', price: 200, cost: 300, reorder: 0 } },
  { t: 'batches', id: 'b2', rec: { productId: 'p2', batch: 'L1', expiry: day(300), cost: 300 } },
  { t: 'movements', id: 'm2', rec: { productId: 'p2', qty: 50, type: 'Opening stock', batchId: 'b2', branchId: 'main', date: hoursAgo(24 * 30) } },
  { t: 'customers', id: 'c1', rec: { name: 'Grace Sample', phone: '0772000111' } },
  { t: 'suppliers', id: 's1', rec: { name: 'Sample Supplies Ltd' } },
  { t: 'suppliers', id: 's2', rec: { name: 'Other Sample Pharma' } },
  { t: 'purchases', id: 'pu1', rec: { number: 'GRNA1', supplierId: 's1', supplierName: 'Sample Supplies Ltd', invoice: 'INV-1', date: day(-2), total: 50000, paid: 50000, bankId: 'cash-drawer', notes: 'two cartons short', items: [], receivedBy: 'Robin Sample', branchId: 'main' } },
  { t: 'purchases', id: 'pu2', rec: { number: 'GRNA2', supplierId: 's2', supplierName: 'Other Sample Pharma', invoice: 'INV-2', date: day(-1), total: 30000, paid: 0, bankId: 'cash-drawer', items: [], receivedBy: 'Robin Sample', branchId: 'main' } },
  ...sales,
] });
await owner('/tenants/' + tid, { features: { catalog: false, weather: false, promos: false } });

const b = await puppeteer.launch({ executablePath: CHROME, headless: true, args: APP_ARGS });
const device = async (email, password) => {
  const ctx = await b.createBrowserContext();
  const p = await ctx.newPage();
  await p.setViewport({ width: 1440, height: 900 });
  await asDesktopApp(p, base);
  await p.goto(base + '/' + slug, { waitUntil: 'networkidle2' }); await wait(500);
  await p.evaluate(() => { for (const id of ['pos', 'dashboard', 'reports', 'add-stock', 'sales']) localStorage.setItem('rxpos-tip:' + id, '1'); window.print = () => { window.__printed = (window.__printed || 0) + 1; }; });
  await p.type('input[autocomplete=username]', email); await p.type('input[type=password]', password);
  await p.evaluate(() => [...document.querySelectorAll('form button')].find((x) => /^Sign in/.test(x.textContent.trim()))?.click());
  await p.waitForSelector('.sidebar', { timeout: 25000 });
  await until(p, () => /Synced/.test(document.querySelector('.pill.clock .clock-state')?.innerText || ''), 30000);
  await p.evaluate(() => { window.print = () => { window.__printed = (window.__printed || 0) + 1; }; });
  return p;
};
const go = async (p, hash) => { await p.evaluate((h) => { location.hash = h; }, hash); await wait(900); };
const text = (p, sel = 'body') => p.evaluate((s) => document.querySelector(s)?.innerText || '', sel);
const clickText = (p, sel, re) => p.evaluate((s, src) => { const r = new RegExp(src); const el = [...document.querySelectorAll(s)].find((x) => r.test(x.textContent.trim())); el?.click(); return !!el; }, sel, re.source);
const select = (p, label, value) => p.evaluate((l, v) => {
  const lab = [...document.querySelectorAll('.report-filters label')].find((x) => x.firstChild?.textContent.trim() === l);
  const s = lab?.querySelector('select'); if (!s) return false;
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(s, v); s.dispatchEvent(new Event('change', { bubbles: true })); return true;
}, label, value);
const setDate = (p, sel, v) => p.evaluate((s, val) => { const i = document.querySelector(s); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, val); i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); }, sel, v);
const stock = (p, id) => p.evaluate((pid) => new Promise((res) => {
  const q = indexedDB.open('pharmapos');
  q.onsuccess = () => { const g = q.result.transaction('records').objectStore('records').getAll(); g.onsuccess = () => { let n = 0; for (const x of g.result) if (x.t === 'movements') for (const m of x.rs) if (m.productId === pid) n += m.qty; q.result.close(); res(n); }; };
}), id);

const A = await device('robin@test.rx', 'robin-pass-1234');

// ---- Vivid ----
await go(A, '#/');
const calm = await A.evaluate(() => getComputedStyle(document.querySelector('.stat.teal')).backgroundImage);
// switched on the way a person does it: appearance menu → Colour → Vivid
await A.click('button[aria-label="Theme"]'); await wait(300);
await clickText(A, '.style-item', /^Vivid/); await wait(500);
const now = await A.evaluate(() => ({ attr: document.documentElement.dataset.colour, bg: getComputedStyle(document.querySelector('.stat.teal')).backgroundImage }));
check('appearance menu → Colour → Vivid takes effect at once', now.attr === 'vivid' && /gradient/.test(now.bg), JSON.stringify(now));
await A.reload({ waitUntil: 'networkidle2' }); await A.waitForSelector('.sidebar', { timeout: 20000 }); await wait(1200);
await A.evaluate(() => { window.print = () => { window.__printed = (window.__printed || 0) + 1; }; });
const vivid = await A.evaluate(() => ({ attr: document.documentElement.dataset.colour, bg: getComputedStyle(document.querySelector('.stat.teal')).backgroundImage, color: getComputedStyle(document.querySelector('.stat.teal strong')).color }));
check('…and is kept after a restart', vivid.attr === 'vivid');
check('Calm is the standard look (no solid tile)', !/gradient/.test(calm), calm);
check('Vivid fills the toned tiles with their colour and white text', vivid.attr === 'vivid' && /gradient/.test(vivid.bg) && vivid.color === 'rgb(255, 255, 255)', JSON.stringify(vivid));
check('tiles carry their meaning: expenses orange, profit violet', await A.evaluate(() => [...document.querySelectorAll('.stat')].some((s) => /expenses/i.test(s.innerText) && s.classList.contains('orange')) && [...document.querySelectorAll('.stat')].some((s) => /Gross profit/i.test(s.innerText) && s.classList.contains('violet'))));
await wait(2500); await A.screenshot({ path: `${out}/dashboard-vivid.png`, fullPage: true });

// ---- dashboard charts ----
check('daily sales chart with total, average and best day', /Daily average/.test(await text(A)) && /Best day/.test(await text(A)) && await A.evaluate(() => document.querySelectorAll('.trend-svg').length >= 2));
await clickText(A, '.seg button', /^90 days$/); await wait(300);
check('…switches to 90 days (with real dates and "Today")', /last 90 days/.test(await text(A)) && await A.evaluate(() => [...document.querySelectorAll('.trend-axis')].some((x) => x.textContent === 'Today')));
check('money in & out month by month: sales, purchases, expenses, gross profit', await A.evaluate(() => ['in', 'purch', 'exp', 'profit'].every((c) => document.querySelector('.trend-series.' + c))));
check('top 10 ranks by amount, with quantity and profit under each name', /Sample Tabs 500mg/.test(await text(A, '.top-list')) && /sold · profit/.test(await text(A, '.top-list')));
await clickText(A, '.seg button', /^Quantity$/); await wait(200);
check('…and can rank by quantity', /^1\s*Sample Tabs/.test((await text(A, '.top-list')).trim()));
await A.evaluate(() => { const hits = document.querySelectorAll('.trend-hit'); hits[hits.length - 1].dispatchEvent(new MouseEvent('click', { bubbles: true })); }); await wait(900);
const today = new Date(); const tk = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
check('clicking a day opens that day\'s sales', await A.evaluate((k) => /#\/sales/.test(location.hash) && [...document.querySelectorAll('input[type=date]')].filter((i) => i.value === k).length === 2, tk));

// ---- Reports → Sales lines ----
await go(A, '#/reports'); await clickText(A, '.tabs .tab', /^Sales lines$/); await wait(500);
await setDate(A, '.page-head input[type=date]', day(-30)); await wait(300);
await A.evaluate((v) => { const i = document.querySelectorAll('.page-head input[type=date]')[1]; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, v); i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); }, day(0)); await wait(500);
const totals = await text(A, '.lines-table tr.total-row');
check('Sales lines: one row per line with the totals of every line (amount 60,200 · profit 23,900)', /60,200/.test(totals) && /23,900/.test(totals), totals);
check('…columns as asked: date & time, customer, dispenser, receipt, trade and generic name, qty, amount, profit', await A.evaluate(() => { const h = [...document.querySelectorAll('.lines-table thead th')].map((x) => x.textContent.replace(/[▲▼↕]/g, '').trim().toLowerCase()); return ['Date & time', 'Customer', 'Dispenser', 'Receipt', 'Trade name', 'Generic name', 'Qty', 'Amount', 'Profit'].every((c) => h.includes(c.toLowerCase())); }));
check('…the generic name comes from the medicine', /Samplamol/.test(await text(A, '.lines-table')));
check('…a line sold below cost is flagged as a loss', /Sold below cost\s*1/i.test(await text(A, '.stats')) && await A.evaluate(() => [...document.querySelectorAll('.lines-table tr')].some((r) => /RLOSS01/.test(r.innerText) && r.querySelector('.loss'))));
check('…50 lines per page with page buttons', await A.evaluate(() => document.querySelectorAll('.lines-table tbody tr').length === 51 && !!document.querySelector('.pager')));
await select(A, 'Dispenser', 'Ann Sample'); await wait(400);
check('…filter by dispenser (Ann Sample: 20 lines, 20,000)', /20,000/.test(await text(A, '.lines-table tr.total-row')) && /20 lines/.test(await text(A, '.stats')), await text(A, '.lines-table tr.total-row'));
await wait(2500); await A.screenshot({ path: `${out}/sales-lines.png`, fullPage: true });

// ---- Sales History ----
await go(A, '#/sales'); await A.evaluate(() => { for (const i of document.querySelectorAll('.page-head input[type=date]')) { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, ''); i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); } }); await wait(500);
check('Sales History: 25 per page with page buttons (61 sales)', await A.evaluate(() => [...document.querySelectorAll('.page tbody tr')].filter((r) => !r.classList.contains('total-row')).length === 25 && /of 61/.test(document.querySelector('.pager')?.innerText || '')));
check('…separate time column and the customer\'s phone', await A.evaluate(() => [...document.querySelectorAll('.page thead th')].some((x) => /^Time/.test(x.textContent.trim())) && /0772000111/.test(document.querySelector('.page tbody').innerText)));
check('…payment shown as a labelled chip', await A.evaluate(() => !!document.querySelector('.pay-chip.cash') && !!document.querySelector('.pay-chip.momo')));
await select(A, 'Payment', 'Mobile Money'); await wait(400);
check('…filter by payment (30 Mobile Money sales)', /30 sales/.test(await text(A, 'tr.total-row')), await text(A, 'tr.total-row'));
await A.evaluate(() => [...document.querySelectorAll('.page tbody tr')][0].querySelector('.act-invoice').click()); await wait(400);
check('…Invoice on a row prints a full-page invoice', await A.evaluate(() => window.__printed >= 1));
await A.evaluate(() => [...document.querySelectorAll('.page tbody tr')][0].querySelector('.act-print').click()); await wait(400);
check('…Receipt on a row prints the till receipt', await A.evaluate(() => window.__printed >= 2));

// ---- Purchase History ----
await go(A, '#/purchases'); await wait(400);
const ph = await text(A, '.page');
check('Purchase History: payment type and notes columns', /payment type/i.test(ph) && /two cartons short/.test(ph) && /Credit/.test(ph) && /Cash at hand|Cash/.test(ph), ph.slice(-300));
await select(A, 'Supplier', 'Other Sample Pharma'); await wait(300);
check('…filter by supplier', await A.evaluate(() => { const r = [...document.querySelectorAll('.page tbody tr')].filter((x) => !x.classList.contains('total-row')); return r.length === 1 && /INV-2/.test(r[0].innerText); }));

// ---- drafts: a held sale follows the person to another device ----
const before = await stock(A, 'p1');
await go(A, '#/pos');
await A.evaluate(() => { const i = document.querySelector('.search-row input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, 'Sample Tabs'); i.dispatchEvent(new Event('input', { bubbles: true })); }); await wait(300);
await A.evaluate(() => document.querySelector('.product')?.click()); await wait(300);
await A.keyboard.down('Alt'); await A.keyboard.press('h'); await A.keyboard.up('Alt'); await wait(800);
check('holding a sale makes a synced draft (sale tab shown, cart cleared)', await A.evaluate(() => document.querySelectorAll('.sale-tab-wrap').length === 1 && !document.querySelector('.cart-line')));
check('…the draft reaches the cloud', await untilNode(async () => (await owner(`/tenants/${tid}/records?t=drafts`)).total === 1));
check('…and a held sale does not change stock', (await stock(A, 'p1')) === before, `${before} → ${await stock(A, 'p1')}`);

const B = await device('robin@test.rx', 'robin-pass-1234');
await go(B, '#/sales'); await clickText(B, '.tabs .tab', /^Held sales/); await wait(500);
check('another device of the same person shows it under Sales History → Held sales', await until(B, () => /Sample Tabs 500mg|Sale/.test(document.querySelector('.draft-card')?.innerText || ''), 20000));
await clickText(B, '.draft-card button', /^Continue$/);
check('…Continue opens it at the till on that device', await until(B, () => /#\/pos/.test(location.hash) && document.querySelectorAll('.cart-line').length === 1, 15000));
check('…and it leaves the drafts (no copy left behind)', await untilNode(async () => (await owner(`/tenants/${tid}/records?t=drafts`)).total === 0));
await A.bringToFront(); // a device in use checks every 5 s (60 s in the background)
check('…the first device no longer shows it as held', await until(A, () => !document.querySelector('.sale-tab-wrap'), 30000));
await B.bringToFront();

// ---- a supervisor sees and discards a cashier's held sale ----
const C = await device('casey@test.rx', 'casey-pass-123');
await go(C, '#/pos');
await C.evaluate(() => { const i = document.querySelector('.search-row input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, 'Sample Tabs'); i.dispatchEvent(new Event('input', { bubbles: true })); }); await wait(300);
await C.evaluate(() => document.querySelector('.product')?.click()); await wait(300);
await C.keyboard.down('Alt'); await C.keyboard.press('h'); await C.keyboard.up('Alt'); await wait(800);
await untilNode(async () => (await owner(`/tenants/${tid}/records?t=drafts`)).total === 1);
await go(B, '#/sales'); await clickText(B, '.tabs .tab', /^Held sales/); await wait(400);
await clickText(B, '.seg button', /^Everyone/);
check('a supervisor sees everyone\'s held sales, with who started them', await until(B, () => /started by Casey Cashier/.test(document.querySelector('.draft-grid')?.innerText || ''), 20000));
await clickText(B, '.seg button', /^Mine$/); await wait(200);
check('…"Mine" shows only their own', !/Casey Cashier/.test(await text(B, '.draft-grid')));
await clickText(B, '.seg button', /^Everyone/); await wait(200);
check('the dashboard shows an "Open drafts" tile', await (async () => { await go(B, '#/'); return /open drafts\s*1/i.test(await text(B, '.stats.alerts')); })());
await go(B, '#/sales'); await clickText(B, '.tabs .tab', /^Held sales/); await wait(300); await clickText(B, '.seg button', /^Everyone/); await wait(200);
await clickText(B, '.draft-card button', /^Discard$/); await wait(300); await clickText(B, '.modal button', /^Discard$/);
check('…discarding it asks, removes it and writes the audit log', await untilNode(async () => (await owner(`/tenants/${tid}/records?t=drafts`)).total === 0 && (await owner(`/tenants/${tid}/records?t=audit&q=Draft%20discarded`)).total >= 1));

// ---- a delivery saved as a draft, continued and received once ----
const s0 = await stock(B, 'p1');
await go(B, '#/add-stock'); await wait(500);
await B.evaluate(() => { const i = document.querySelector('.picker input.search'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, 'Sample Tabs'); i.dispatchEvent(new Event('input', { bubbles: true })); }); await wait(300);
await B.evaluate(() => document.querySelector('.picker-list button')?.click()); await wait(300);
await B.evaluate(() => { const sel = document.querySelector('.page form select'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(sel, 's1'); sel.dispatchEvent(new Event('change', { bubbles: true })); }); await wait(200);
await clickText(B, 'button', /^Save as draft$/); await wait(800);
check('Add Stock: "Save as draft" keeps the delivery and starts a fresh one', await untilNode(async () => (await owner(`/tenants/${tid}/records?t=drafts`)).total === 1) && /saved deliver/.test(await text(B, '.page')));
check('…a delivery draft does not change stock', (await stock(B, 'p1')) === s0);
await go(B, '#/purchases'); await clickText(B, '.tabs .tab', /^Drafts/); await wait(400);
await clickText(B, '.draft-card button', /^Continue$/);
check('…Purchase History → Drafts → Continue brings it back into Add Stock (with its supplier)', await until(B, () => /Continuing a saved draft/.test(document.body.innerText) && document.querySelector('.page form select')?.value === 's1' && document.querySelectorAll('.page table tbody tr').length >= 1, 15000));
await B.evaluate(() => { const i = document.querySelector('.page table input[type=date]'); if (i) { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, new Date(Date.now() + 400 * 864e5).toISOString().slice(0, 10)); i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); } }); await wait(200);
await clickText(B, 'button', /^Receive stock$/); await wait(1500);
check('…receiving it adds the stock once and removes the draft', await untilNode(async () => (await owner(`/tenants/${tid}/records?t=drafts`)).total === 0) && (await stock(B, 'p1')) === s0 + 1, `${s0} → ${await stock(B, 'p1')}`);
await B.screenshot({ path: `${out}/add-stock.png`, fullPage: true });

await b.close();
await owner('/tenants/' + tid + '/delete', { confirm: slug });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

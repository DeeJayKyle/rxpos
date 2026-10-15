// Batch 17: pharmacy picker at sign-in, midnight day change, PDF receipts/reports, invoice scan → Add Stock,
// select & remove on the current sale, highlighted sale edits with history, in-stock-only expiry/low stock.
//   node v17.mjs <base> <ownerKey> <outDir>
import puppeteer from 'puppeteer-core';
import { CHROME } from './chrome.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const [base, ownerKey, out] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const dl = path.resolve(out, 'downloads'); fs.rmSync(dl, { recursive: true, force: true }); fs.mkdirSync(dl, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + String(x).slice(0, 200) : ''}`); };
const owner = (p, body) => fetch(base + '/api/owner' + p, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ownerKey }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());
const api = (p, body) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, ...(await r.json()) }));
const until = async (pg, fn, ms = 15000, arg) => { const end = Date.now() + ms; while (Date.now() < end) { if (await pg.evaluate(fn, arg).catch(() => false)) return true; await wait(300); } return false; };
const day = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const iso = (n) => new Date(Date.now() - n * 864e5).toISOString();

// ---------- data ----------
const t = await owner('/tenants', { name: 'Ntinda Test Pharmacy', admin: { name: 'Ada Admin', email: 'ada@test.rx', password: 'ada-pass-123' } });
const slug = t.tenant.slug, tid = t.tenant.id;
const P = (id, name, extra = {}) => ({ t: 'products', id, rec: { name, generic: name, form: 'Tablets', price: 1000, wholesale: 900, cost: 500, reorder: 0, unit: 'Unit', ...extra } });
const B = (id, productId, expiry, batch = id) => ({ t: 'batches', id, rec: { productId, batch, expiry, cost: 500 } });
const M = (id, productId, qty, batchId) => ({ t: 'movements', id, rec: { productId, qty, type: 'Opening stock', batchId, branchId: 'main', date: iso(60) } });
const recs = [
  P('p-amox', 'Amoxyl 500mg caps'), B('b-amox', 'p-amox', '2028-06-30'), M('m-amox', 'p-amox', 100, 'b-amox'),
  P('p-pan', 'Panadol Extra tabs'), B('b-pan', 'p-pan', '2028-06-30'), M('m-pan', 'p-pan', 80, 'b-pan'),
  P('p-cip', 'Ciprofloxacin 500mg tabs'), B('b-cip', 'p-cip', '2028-06-30'), M('m-cip', 'p-cip', 60, 'b-cip'),
  // #7 low stock: in stock and at/below reorder → low; out of stock with a reorder level → NOT low
  P('p-low', 'Lowstock Syrup 100ml', { reorder: 10 }), B('b-low', 'p-low', '2029-01-31'), M('m-low', 'p-low', 5, 'b-low'),
  P('p-zero', 'Neverstocked Cream 20g', { reorder: 10 }),
  // #7 expiry: a batch with no stock left that expires soon doesn't count; one with stock does
  P('p-expA', 'Expiry Alpha tabs'), B('b-expA1', 'p-expA', day(20)), M('m-expA1', 'p-expA', 6, 'b-expA1'), { t: 'movements', id: 'm-expA1-out', rec: { productId: 'p-expA', qty: -6, type: 'Sale', batchId: 'b-expA1', branchId: 'main', date: iso(5) } },
  B('b-expA2', 'p-expA', day(500)), M('m-expA2', 'p-expA', 10, 'b-expA2'),
  P('p-expB', 'Expiry Beta caps'), B('b-expB', 'p-expB', day(20)), M('m-expB', 'p-expB', 4, 'b-expB'),
  P('p-expC', 'Expiry Gamma drops'), B('b-expC', 'p-expC', day(15)),
  { t: 'suppliers', id: 'sup-km', rec: { name: 'Kampala Medics', phone: '0700000001' } },
  // #6 a sale copied from another system (record-only edits)
  { t: 'sales', id: 'rx-s-77', rec: { number: 'RX77', date: iso(3), type: 'retail', branchId: 'main', items: [{ id: 'p-pan', name: 'Panadol Extra tabs', qty: 2, price: 1000, cost: 500, alloc: [] }], subtotal: 2000, discount: 0, tax: 0, total: 2000, payment: 'Cash', paid: 2000, tendered: 2000, customerId: 'walk-in', customerName: 'Walk-in Customer', cashier: 'Old Cashier', status: 'completed', imported: 'Rxtera' } },
];
await owner('/tenants/' + tid + '/records', { records: recs });
// switch off the 9,710 built-in medicines for a clean test
await owner('/tenants/' + tid, { features: { catalog: false } });

// #1 the same email at three pharmacies (two with the same password)
const mk = async (name, pw) => { const r = await owner('/tenants', { name, admin: { name: 'Multi Person', email: 'multi@test.rx', password: pw } }); return r.tenant; };
const T1 = await mk('Alpha Multi Pharmacy', 'multi-pass-123'), T2 = await mk('Beta Multi Pharmacy', 'multi-pass-123'), T3 = await mk('Gamma Multi Pharmacy', 'other-pass-456');
let r = await api('/api/login', { email: 'multi@test.rx', password: 'multi-pass-123' });
check('#1 sign-in with an email at several pharmacies returns the pharmacies to choose from', Array.isArray(r.choose) && r.choose.length === 2 && r.choose.map((c) => c.name).join(',') === 'Alpha Multi Pharmacy,Beta Multi Pharmacy', JSON.stringify(r).slice(0, 160));
check('#1 …only the ones this password opens (not Gamma)', !JSON.stringify(r).includes('Gamma'));
r = await api('/api/login', { email: 'multi@test.rx', password: 'other-pass-456' });
check('#1 a password that opens just one of them signs straight in', r.status === 200 && r.token && r.tenant === T3.id, r.tenant);
r = await api('/api/login', { email: 'multi@test.rx', password: 'wrong-password-1' });
check('#1 a wrong password reveals no pharmacy names', r.status === 401 && !r.choose && !/Alpha|Beta|Gamma/.test(JSON.stringify(r)), r.error);
r = await api('/api/login', { email: 'multi@test.rx', password: 'multi-pass-123', tenant: T2.slug });
check('#1 choosing a pharmacy signs in there', r.status === 200 && r.tenant === T2.id);

const chrome = CHROME;
const b = await puppeteer.launch({ executablePath: chrome, headless: true });
const errors = [];
const newPage = async (tz) => {
  const ctx = await b.createBrowserContext();
  const p = await ctx.newPage(); await p.setViewport({ width: 1366, height: 860 });
  if (tz) await p.emulateTimezone(tz);
  p.on('pageerror', (e) => errors.push(e.message));
  const cdp = await p.createCDPSession();
  await cdp.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: dl });
  return p;
};
const signIn = async (p, email, pw, where = '/' + slug) => {
  await p.goto(base + where, { waitUntil: 'networkidle2' }); await wait(800);
  await p.type('input[type=email]', email); await p.type('input[type=password]', pw);
  await p.evaluate(() => [...document.querySelectorAll('button')].find((x) => x.textContent.includes('Sign in')).click());
};
const go = async (p, h) => { await p.goto(base + '/' + slug + '#' + h, { waitUntil: 'networkidle2' }); await wait(1200); };
const clickText = (p, sel, re) => p.evaluate((s, src) => { const el = [...document.querySelectorAll(s)].find((x) => new RegExp(src, 'i').test(x.textContent)); if (el) el.click(); return !!el; }, sel, re.source);

// ---------- #1 picker in the app (plain address, no pharmacy in it) ----------
{
  const p = await newPage();
  await signIn(p, 'multi@test.rx', 'multi-pass-123', '/');
  const shown = await until(p, () => document.querySelectorAll('.pharmacy-choice').length === 2, 15000);
  check('#1 sign-in screen asks "Which pharmacy?" with both pharmacies', shown, await p.evaluate(() => document.querySelector('.auth-card')?.innerText.slice(0, 160)));
  await p.screenshot({ path: path.join(out, '1-picker.png') });
  await clickText(p, '.pharmacy-choice', /Beta Multi/);
  const inn = await until(p, () => !!document.querySelector('.sidebar'), 20000);
  check('#1 picking "Beta Multi Pharmacy" signs in to it', inn && p.url().includes('/' + T2.slug), p.url());
  await p.browserContext().close();
}

// ---------- #2 the day changes at local midnight (not 3 am) ----------
{
  const now = new Date();
  // a time zone where it is just after 1 am, so "today" locally is not today in UTC for one of the sales below
  let off = (25 - now.getUTCHours()) % 24; if (off > 14) off -= 24;
  const tz = off === 0 ? 'Etc/GMT' : `Etc/GMT${off > 0 ? '-' : '+'}${Math.abs(off)}`;
  const local = new Date(now.getTime() + off * 3600e3);
  const midnightUtc = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - off * 3600e3;
  const sale = (id, at, total) => ({ t: 'sales', id, rec: { number: id.toUpperCase(), date: new Date(at).toISOString(), type: 'retail', branchId: 'main', items: [{ id: 'p-cip', name: 'Ciprofloxacin 500mg tabs', qty: 1, price: total, cost: 1, alloc: [] }], subtotal: total, discount: 0, tax: 0, total, payment: 'Cash', paid: total, tendered: total, customerId: 'walk-in', customerName: 'Walk-in Customer', cashier: 'Ada Admin', status: 'completed', imported: 'Test' } });
  await owner('/tenants/' + tid + '/records', { records: [sale('late-yday', midnightUtc - 30 * 60e3, 7700), sale('early-today', midnightUtc + 10 * 60e3, 3300)] });
  const p = await newPage(tz);
  await signIn(p, 'ada@test.rx', 'ada-pass-123');
  await until(p, () => !!document.querySelector('.sidebar'), 20000); await wait(4000);
  await go(p, '/');
  const tile = await p.evaluate(() => [...document.querySelectorAll('.stat')].find((s) => /today's sales/i.test(s.innerText))?.innerText.replace(/\s+/g, ' '));
  check(`#2 "Today's sales" just after local midnight (${tz}) counts only sales since midnight`, /3,300/.test(tile || '') && !/7,700|11,000/.test(tile || ''), tile);
  await go(p, '/sales');
  await p.evaluate(() => { const [f, t] = document.querySelectorAll('.page-head input[type=date]'); return [f, t]; });
  const todayLocal = await p.evaluate(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; });
  await p.evaluate((d) => { for (const i of document.querySelectorAll('.page-head input[type=date]')) { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, d); i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); } }, todayLocal);
  await wait(600);
  const list = await p.evaluate(() => [...document.querySelectorAll('tbody tr')].map((r) => r.innerText).join('|'));
  check('#2 Sales History "today" filter uses the local day', list.includes('EARLY-TODAY') && !list.includes('LATE-YDAY'), list.slice(0, 120));
  await p.browserContext().close();
}

// ---------- main session ----------
const A = await newPage();
await signIn(A, 'ada@test.rx', 'ada-pass-123');
await until(A, () => !!document.querySelector('.sidebar'), 20000); await wait(5000);

// #7 in-stock-only alerts
await go(A, '/');
const tiles = await A.evaluate(() => Object.fromEntries([...document.querySelectorAll('.stat')].map((s) => [s.querySelector('small')?.textContent.trim(), s.querySelector('strong')?.textContent.trim()])));
check('#7 dashboard "Low stock" counts only medicines in stock (1: Lowstock Syrup, not the never-stocked cream)', tiles['Low stock'] === '1', JSON.stringify(tiles));
check('#7 dashboard "Soon expiring" counts only batches with stock left (1: Expiry Beta)', tiles['Soon expiring'] === '1', tiles['Soon expiring']);
await go(A, '/expiry');
const expRows = await A.evaluate(() => [...document.querySelectorAll('tbody tr')].map((r) => r.innerText.split('\t')[0]).join(','));
check('#7 Expiring list shows only in-stock batches', expRows.includes('Expiry Beta') && !expRows.includes('Expiry Alpha') && !expRows.includes('Expiry Gamma'), expRows);
await go(A, '/inventory');
await clickText(A, '.tab', /Low stock/); await wait(500);
const lowRows = await A.evaluate(() => [...document.querySelectorAll('tbody tr')].map((r) => r.innerText.split('\t')[0]).join(','));
check('#7 Inventory "Low stock" tab: only in-stock items', lowRows.includes('Lowstock Syrup') && !lowRows.includes('Neverstocked'), lowRows);
await go(A, '/reorder');
const reo = await A.evaluate(() => document.body.innerText);
check('#7 reorder suggestions leave out never-stocked, never-sold medicines', !reo.includes('Neverstocked Cream'));

// #5 select & remove on the current sale
await go(A, '/pos');
const addProduct = (name) => A.evaluate((n) => { const el = [...document.querySelectorAll('.product')].find((x) => x.innerText.includes(n)); el?.click(); return !!el; }, name);
await addProduct('Amoxyl'); await addProduct('Panadol Extra'); await addProduct('Ciprofloxacin'); await wait(400);
check('#5 three items on the current sale, each with a tick box and ✕', (await A.evaluate(() => [document.querySelectorAll('.cart-line').length, document.querySelectorAll('.cart-line .line-check').length, document.querySelectorAll('.cart-line .line-remove').length].join())) === '3,3,3');
await A.evaluate(() => { const ls = [...document.querySelectorAll('.cart-line')]; ls.filter((l) => /Amoxyl|Cipro/.test(l.innerText)).forEach((l) => l.querySelector('.line-check').click()); });
await wait(300);
const rmBtn = await A.evaluate(() => [...document.querySelectorAll('.cart-head button')].map((x) => x.innerText.trim()).join('|'));
check('#5 ticking 2 lines offers "Remove 2 items"', /Remove 2 items/.test(rmBtn), rmBtn);
await clickText(A, '.cart-head button', /Remove 2 items/); await wait(300);
const left = await A.evaluate(() => [...document.querySelectorAll('.cart-line')].map((l) => l.querySelector('strong').innerText).join(','));
check('#5 only the ticked items are removed', left === 'Panadol Extra tabs', left);
await A.evaluate(() => document.querySelector('.cart-line .line-remove').click()); await wait(300);
check('#5 ✕ removes a single item', (await A.evaluate(() => document.querySelectorAll('.cart-line').length)) === 0);

// a real sale to edit and print
await addProduct('Ciprofloxacin'); await wait(300);
await A.evaluate(() => { const q = document.querySelector('.cart-line .qty input'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(q, '3'); q.dispatchEvent(new Event('input', { bubbles: true })); });
await wait(300);
await clickText(A, '.pos-cart button, .pos-cart .btn', /^(Charge|Complete|Pay|Checkout)/);
await until(A, () => /Sale complete/.test(document.body.innerText), 8000);
// #3 receipt PDF right after the sale
const before = new Set(fs.readdirSync(dl));
await clickText(A, '.modal button', /^PDF$/); await wait(3500);
const newFiles = () => fs.readdirSync(dl).filter((f) => !before.has(f) && !f.endsWith('.crdownload'));
let got = newFiles().find((f) => /^receipt-.*\.pdf$/.test(f));
check('#3 after a sale, "PDF" downloads the receipt', !!got && fs.readFileSync(path.join(dl, got)).subarray(0, 4).toString() === '%PDF', got || fs.readdirSync(dl).join(','));
await A.keyboard.press('Escape'); await wait(400);

// #6 edit the sale, then see it highlighted with its history
await go(A, '/sales');
const saleNo = await A.evaluate(() => [...document.querySelectorAll('tbody tr')].find((r) => !r.innerText.includes('RX77') && !/EARLY|LATE/.test(r.innerText))?.querySelector('strong')?.innerText);
await A.evaluate((n) => { const row = [...document.querySelectorAll('tbody tr')].find((r) => r.innerText.includes(n)); [...row.querySelectorAll('button')].find((x) => /Edit/.test(x.innerText)).click(); }, saleNo);
await wait(600);
await A.evaluate(() => {
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  const q = document.querySelector('.modal table.lines input[type=number]'); set.call(q, '2'); q.dispatchEvent(new Event('input', { bubbles: true }));
  const why = [...document.querySelectorAll('.modal input')].find((i) => /wrong quantity/i.test(i.placeholder || '')); set.call(why, 'Customer returned one strip'); why.dispatchEvent(new Event('input', { bubbles: true }));
});
await clickText(A, '.modal button', /Save changes/); await wait(1000);
const rowInfo = await A.evaluate((n) => { const row = [...document.querySelectorAll('tbody tr')].find((r) => r.innerText.includes(n)); return { cls: row.className, badge: row.querySelector('.edited-badge')?.innerText }; }, saleNo);
check('#6 the edited sale is highlighted with an "Edited" badge', /edited-row/.test(rowInfo.cls) && /Edited/.test(rowInfo.badge || ''), JSON.stringify(rowInfo));
await A.evaluate((n) => [...document.querySelectorAll('tbody tr')].find((r) => r.innerText.includes(n)).querySelector('.edited-badge').click(), saleNo);
await wait(700);
const hist = await A.evaluate(() => document.querySelector('.edit-card')?.innerText.replace(/\s+/g, ' ') || '');
check('#6 viewing it shows who edited, why, and before → after', /Ada Admin/.test(hist) && /Customer returned one strip/.test(hist) && /3× Ciprofloxacin/.test(hist) && /2× Ciprofloxacin/.test(hist), hist.slice(0, 200));
await A.screenshot({ path: path.join(out, '6-edit-history.png') });
// #3 receipt PDF from Sales History
const t2 = Date.now();
await clickText(A, '.modal button', /^PDF$/); await wait(3000);
got = fs.readdirSync(dl).find((f) => /^receipt-.*\.pdf$/.test(f) && fs.statSync(path.join(dl, f)).mtimeMs >= t2 - 500);
check('#3 Sales History receipt downloads as PDF', !!got, got);
await A.keyboard.press('Escape'); await wait(300);
await clickText(A, '.chip', /Edited only/); await wait(400);
const onlyEd = await A.evaluate(() => [...document.querySelectorAll('tbody tr')].length);
check('#6 "Edited only" shows just the edited sale', onlyEd === 1, onlyEd);
await clickText(A, '.chip', /Edited only/); await wait(300);
// a sale copied from Rxtera can be corrected (record only, stock untouched)
const panBefore = await A.evaluate(() => 0);
await A.evaluate(() => { const row = [...document.querySelectorAll('tbody tr')].find((r) => r.innerText.includes('RX77')); [...row.querySelectorAll('button')].find((x) => /Edit/.test(x.innerText))?.click(); });
await wait(600);
const ro = await A.evaluate(() => document.querySelector('.modal')?.innerText || '');
check('#6 a sale copied from Rxtera can be edited (record only)', /record only/i.test(ro), ro.slice(0, 120));
await A.evaluate(() => {
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  const q = document.querySelector('.modal table.lines input[type=number]'); set.call(q, '1'); q.dispatchEvent(new Event('input', { bubbles: true }));
  const why = [...document.querySelectorAll('.modal input')].find((i) => /wrong quantity/i.test(i.placeholder || '')); set.call(why, 'Typo in old system'); why.dispatchEvent(new Event('input', { bubbles: true }));
});
await clickText(A, '.modal button', /Save changes/); await wait(800);
await go(A, '/inventory');
const panStock = await A.evaluate(() => { const r = [...document.querySelectorAll('tbody tr')].find((x) => x.innerText.includes('Panadol Extra')); return r?.innerText; });
check('#6 …and its correction does not move today\'s stock', /\b80\b/.test(panStock || ''), panStock);

// #3 report PDFs
await go(A, '/reports');
const before3 = new Set(fs.readdirSync(dl));
await clickText(A, '.page-head button', /^PDF$/); await wait(3500);
got = fs.readdirSync(dl).filter((f) => !before3.has(f)).find((f) => /\.pdf$/.test(f));
check('#3 Reports → PDF downloads the open report', !!got && fs.statSync(path.join(dl, got)).size > 2000, got);
await go(A, '/sales');
const before4 = new Set(fs.readdirSync(dl));
await clickText(A, '.page-head button', /^PDF$/); await wait(3000);
got = fs.readdirSync(dl).filter((f) => !before4.has(f)).find((f) => /\.pdf$/.test(f));
check('#3 Sales History → PDF of the whole filtered list', !!got, got);
await go(A, '/inventory');
const before5 = new Set(fs.readdirSync(dl));
await clickText(A, '.page-head button', /^PDF$/); await wait(3000);
got = fs.readdirSync(dl).filter((f) => !before5.has(f)).find((f) => /\.pdf$/.test(f));
check('#3 Inventory → PDF', !!got, got);

// #4 scan a supplier invoice (PDF) → Add Stock, checked, then saved
const { jsPDF } = await import('jspdf');
const inv = new jsPDF(); inv.setFontSize(16); inv.text('KAMPALA MEDICS LTD — TAX INVOICE No. KM-5521', 14, 20); inv.setFontSize(11);
['AMOXYL 500MG CAPSULES 10X10   B: AX77  EXP 06/2028   QTY 20  @ 450  = 9000', 'PANADOL EXTRA TABLETS   B: PE12  EXP 30 Jun 2029   QTY 10  @ 300  = 3000', 'QWERTAZOL 77MG TABS   B: QZ1  EXP 2030-01  QTY 5  @ 1200  = 6000'].forEach((l, i) => inv.text(l, 14, 40 + i * 10));
const invPath = path.resolve(out, 'invoice.pdf'); fs.writeFileSync(invPath, Buffer.from(inv.output('arraybuffer')));
await A.setRequestInterception(true);
let aiCalls = 0, aiImage = '';
A.on('request', (req) => {
  if (req.url().includes('/api/ai/invoice')) {
    aiCalls++; aiImage = JSON.parse(req.postData() || '{}').image || '';
    return req.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ supplier: 'KAMPALA MEDICS LTD', invoiceNo: 'KM-5521', date: '15/10/2026', total: 18000, items: [
      { name: 'AMOXYL 500MG CAPSULES 10X10', batch: 'AX77', expiry: '06/2028', qty: 20, unitCost: 450, lineTotal: 9000 },
      { name: 'PANADOL EXTRA TABLETS', batch: 'PE12', expiry: '30 Jun 2029', qty: 10, unitCost: 300, lineTotal: 3000 },
      { name: 'QWERTAZOL 77MG TABS', batch: 'QZ1', expiry: '2030-01', qty: 5, unitCost: 0, lineTotal: 6000, unclear: true },
    ] }) });
  }
  return req.continue();
});
await go(A, '/add-stock');
await clickText(A, '.page-head button', /Scan invoice/); await wait(500);
const fileInput = await A.$('.modal input[type=file][accept*="pdf"]');
await fileInput.uploadFile(invPath);
const opened = await until(A, () => document.querySelectorAll('.modal .scan-thumbs img').length === 1, 20000);
check('#4 a PDF invoice opens as a page image', opened);
await clickText(A, '.modal button', /Read invoice/);
const filled = await until(A, () => !document.querySelector('.modal') && document.querySelectorAll('table.lines tbody tr').length >= 3, 20000);
check('#4 the invoice page was sent to the reader as an image', aiCalls === 1 && /^data:image\/jpeg;base64,/.test(aiImage), aiCalls);
const form = await A.evaluate(() => ({
  supplier: document.querySelector('select')?.selectedOptions[0]?.text, invoice: [...document.querySelectorAll('input')].find((i) => i.value === 'KM-5521')?.value, date: document.querySelector('input[type=date]')?.value,
  lines: [...document.querySelectorAll('table.lines tbody tr')].map((tr) => { const ins = tr.querySelectorAll('input'); return { med: tr.querySelector('select').selectedOptions[0]?.text, qty: ins[0].value, cost: ins[1].value, batch: ins[3].value, exp: ins[4].value, read: tr.querySelector('.scan-read')?.innerText.trim() }; }),
  saveDisabled: [...document.querySelectorAll('button')].find((x) => /Receive stock/.test(x.innerText))?.disabled,
  notice: document.querySelector('.scan-notice')?.innerText.replace(/\s+/g, ' '),
}));
check('#4 supplier, invoice no. and date are filled from the invoice', filled && form.supplier === 'Kampala Medics' && form.invoice === 'KM-5521' && form.date === '2026-10-15', JSON.stringify({ s: form.supplier, i: form.invoice, d: form.date }));
check('#4 lines matched to the pharmacy\'s medicines with qty, cost, batch and expiry', form.lines[0]?.med === 'Amoxyl 500mg caps' && form.lines[0].qty === '20' && form.lines[0].cost === '450' && form.lines[0].batch === 'AX77' && form.lines[0].exp === '2028-06-30' && form.lines[1]?.med === 'Panadol Extra tabs' && form.lines[1].exp === '2029-06-30', JSON.stringify(form.lines.slice(0, 2)));
check('#4 an unknown medicine is flagged for the person to decide (cost worked out from the line total)', form.lines[2]?.med === 'Select medicine…' && form.lines[2].cost === '1200' && form.lines[2].exp === '2030-01-31' && /QWERTAZOL/.test(form.lines[2].read || ''), JSON.stringify(form.lines[2]));
check('#4 nothing can be saved until the person ticks that they checked it', form.saveDisabled === true && /check every line/i.test(form.notice || ''), form.notice);
await A.screenshot({ path: path.join(out, '4-scanned-invoice.png'), fullPage: true });
// the person corrects the scan: unknown line becomes a new medicine, Panadol qty fixed to 12
await A.evaluate(() => {
  const rows = document.querySelectorAll('table.lines tbody tr');
  const sel = rows[2].querySelector('select'); sel.value = '__new__'; sel.dispatchEvent(new Event('change', { bubbles: true }));
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  const q = rows[1].querySelectorAll('input')[0]; set.call(q, '12'); q.dispatchEvent(new Event('input', { bubbles: true }));
  const p = rows[2].querySelectorAll('input')[2]; set.call(p, '2500'); p.dispatchEvent(new Event('input', { bubbles: true }));
});
await A.evaluate(() => document.querySelector('.scan-confirm input').click()); await wait(300);
await clickText(A, 'button', /Receive stock/); await wait(1500);
const savedMsg = await A.evaluate(() => document.querySelector('.notice')?.innerText || '');
check('#4 after checking and ticking, "Receive stock" saves it', /Received 3 item/.test(savedMsg), savedMsg);
await go(A, '/inventory');
const inv2 = await A.evaluate(() => Object.fromEntries([...document.querySelectorAll('tbody tr')].map((r) => [r.cells[0].innerText.split('\n')[0].trim(), r.innerText.replace(/\s+/g, ' ')])));
check('#4 stock went up by the corrected amounts (Amoxyl 100 → 120, Panadol 80 → 92)', /\b120\b/.test(inv2['Amoxyl 500mg caps'] || '') && /\b92\b/.test(inv2['Panadol Extra tabs'] || ''), JSON.stringify([inv2['Amoxyl 500mg caps'], inv2['Panadol Extra tabs']]).slice(0, 200));
check('#4 the unknown line became a new medicine in stock', Object.keys(inv2).some((k) => /QWERTAZOL/i.test(k)), Object.keys(inv2).join(','));
await go(A, '/purchases');
const ph = await A.evaluate(() => document.querySelector('tbody tr')?.innerText || '');
check('#4 it is in Purchase History with the invoice number', /KM-5521/.test(ph) && /Kampala Medics/.test(ph), ph);

check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await b.close();
for (const x of [tid, T1.id, T2.id, T3.id]) await owner('/tenants/' + x + '/delete', { confirm: (await owner('/tenants')).tenants.find((y) => y.id === x)?.slug });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

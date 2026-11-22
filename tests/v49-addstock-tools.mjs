// Add Stock and Edit purchase tools (fictional pharmacy): columns that move and stay moved, the date format, a medicine
// picker you type into (in-stock medicines first), Enter for the next line, renaming a medicine, adding a supplier,
// and correcting a past delivery: add a line, remove one (and undo), change a line's medicine. Stock is checked in the
// cloud's own records after each step.
//   node v49-addstock-tools.mjs <base> <ownerKey> <outDir>
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
import { CHROME } from './chrome.mjs';
import { confirmReview } from './review.mjs';
const [base, ownerKey, out] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + String(x).slice(0, 240) : ''}`); };
const owner = (p, body) => fetch(base + '/api/owner' + p, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ownerKey }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());
const until = async (p, fn, ms = 15000, arg) => { const end = Date.now() + ms; while (Date.now() < end) { if (await p.evaluate(fn, arg).catch(() => false)) return true; await wait(300); } return false; };

for (const x of (await owner('/tenants')).tenants || []) if (x.name === 'Tools Sample Pharmacy') await owner('/tenants/' + x.id + '/delete', { confirm: x.slug });
const T = await owner('/tenants', { name: 'Tools Sample Pharmacy', admin: { name: 'Tia Admin', email: 'tia@test.rx', password: 'tia-pass-1234' } });
const tid = T.tenant.id;
await owner('/tenants/' + tid, { features: { catalog: false, weather: false, promos: false } });
const day = new Date().toISOString();
await owner('/tenants/' + tid + '/records', { records: [
  { t: 'products', id: 'tl-alpha', rec: { name: 'Alpha Tabs 10s', generic: 'Alphacillin', form: 'Tablets', unit: 'Strip', price: 3000, cost: 2000, reorder: 0 } },
  { t: 'products', id: 'tl-alsy', rec: { name: 'Alphamol Syrup 60ml', generic: 'Alphamol', form: 'Syrups', unit: 'Bottle', price: 4000, cost: 2500, reorder: 0 } },
  { t: 'products', id: 'tl-beta', rec: { name: 'Beta Cream 15g', generic: 'Betamol', form: 'Creams', unit: 'Tube', price: 5000, cost: 3500, reorder: 0 } },
  { t: 'batches', id: 'tl-b1', rec: { productId: 'tl-alpha', batch: 'AL1', expiry: '2029-01-31', cost: 2000, received: day.slice(0, 10) } },
  { t: 'movements', id: 'tl-m1', rec: { productId: 'tl-alpha', batchId: 'tl-b1', qty: 40, type: 'Opening stock', date: day, branchId: 'main', user: 'Tia Admin' } },
  { t: 'suppliers', id: 'tl-sup', rec: { name: 'Sample Wholesalers Ltd', contact: '', phone: '', email: '', address: '' } },
] });
const stock = async () => { // stock per medicine from the cloud's own stock movements
  const ex = await fetch(base + '/api/owner/tenants/' + tid + '/export', { headers: { Authorization: 'Bearer ' + ownerKey } }).then((r) => r.json());
  const s = {}; for (const m of ex.movements || []) s[m.productId] = (s[m.productId] || 0) + m.qty; return { s, ex };
};

const b = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
const p = await (await b.createBrowserContext()).newPage(); await p.setViewport({ width: 1366, height: 900 });
await p.goto(base + '/' + T.tenant.slug, { waitUntil: 'networkidle2' });
await p.waitForSelector('input[type=password]');
await p.evaluate(() => { const set = (sel, v) => { const i = document.querySelector(sel); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, v); i.dispatchEvent(new Event('input', { bubbles: true })); }; set('input[autocomplete=username]', 'tia@test.rx'); set('input[type=password]', 'tia-pass-1234'); });
await p.evaluate(() => [...document.querySelectorAll('form button')].find((x) => /^Sign in/.test(x.textContent.trim()))?.click());
await p.waitForSelector('.sidebar', { timeout: 30000 }); await wait(2500);
await p.evaluate(() => { location.hash = '#/add-stock'; }); await wait(1500);
const heads = () => p.evaluate(() => [...document.querySelectorAll('table.stock-lines thead th')].map((t) => t.textContent.trim()).filter((x) => x && x !== '#').join('|')); // (# is the fixed line-number column)

// 1. columns
check('columns start in the usual order', (await heads()).startsWith('Medicine|Qty|Unit cost'), await heads());
await p.click('button[aria-label="Move Medicine right"]'); await wait(200);
await p.click('button[aria-label="Move Expiry left"]'); await wait(200);
check('a column moves with its arrows', (await heads()) === 'Qty|Medicine|Unit cost (worked out)|Line total|New retail price|Expiry|Batch', await heads());
check('…and the cells move with it', await p.evaluate(() => { const tds = [...document.querySelectorAll('table.stock-lines tbody tr:first-child td:not(.line-no)')]; return tds[0].dataset.label === 'Qty' && tds[1].dataset.label === 'Medicine' && tds[5].dataset.label === 'Expiry'; }));
await p.reload({ waitUntil: 'networkidle2' }); await wait(2000);
check('the order is kept on this device after a reload', (await heads()) === 'Qty|Medicine|Unit cost (worked out)|Line total|New retail price|Expiry|Batch', await heads());
await p.evaluate(() => [...document.querySelectorAll('button')].find((x) => /reset column order/.test(x.textContent))?.click()); await wait(300);
check('"reset column order" puts them back', (await heads()).startsWith('Medicine|Qty|Unit cost'), await heads());

// 2. the medicine picker: in-stock first
await p.focus('table.stock-lines tbody tr:first-child .med-pick input'); await p.keyboard.type('alpha'); await wait(400);
const opts = await p.evaluate(() => [...document.querySelectorAll('.med-pick-list .med-pick-row')].map((r) => r.innerText.replace(/\s+/g, ' ').trim()));
check('typing searches the medicines; the one in stock comes first', /^Alpha Tabs 10s.*40 in stock/.test(opts[0] || '') && /^Alphamol Syrup/.test(opts[1] || '') && /none in stock/.test(opts[1] || ''), opts.join(' / '));
check('…the generic name finds it too', await p.evaluate(async () => { const i = document.querySelector('table.stock-lines tbody tr:first-child .med-pick input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, 'betamol'); i.dispatchEvent(new Event('input', { bubbles: true })); await new Promise((r) => setTimeout(r, 300)); return /^Beta Cream/.test(document.querySelector('.med-pick-row')?.innerText || ''); }));
await p.evaluate(() => { const i = document.querySelector('table.stock-lines tbody tr:first-child .med-pick input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, 'alpha'); i.dispatchEvent(new Event('input', { bubbles: true })); }); await wait(300);
await p.keyboard.press('Enter'); await wait(400);
check('Enter picks the highlighted medicine', (await p.evaluate(() => document.querySelector('table.stock-lines tbody tr:first-child .med-pick input').value)) === 'Alpha Tabs 10s');

// 3. Enter in a line adds the next line, with the cursor in its medicine search
await p.evaluate(() => { const i = document.querySelector('table.stock-lines tbody tr:first-child input[aria-label="Quantity"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, '10'); i.dispatchEvent(new Event('input', { bubbles: true })); });
await p.focus('table.stock-lines tbody tr:first-child input[aria-label="Quantity"]');
await p.keyboard.press('Enter'); await wait(500);
check('Enter on the last line adds a new line and puts the cursor in its medicine search', await p.evaluate(() => document.querySelectorAll('table.stock-lines tbody tr').length === 2 && document.activeElement === document.querySelector('table.stock-lines tbody tr:nth-child(2) .med-pick input')));
check('…and never receives the delivery', !/Received/.test(await p.evaluate(() => document.body.innerText)));
await p.keyboard.type('alphamol'); await wait(300); await p.keyboard.press('Enter'); await wait(300);

// 4. dates in the chosen format
await p.select('select.date-fmt', 'mdy'); await wait(300);
check('the date format can be changed (MM/DD/YYYY)', /^\d\d\/\d\d\/\d{4}$/.test(await p.evaluate(() => document.querySelector('input[aria-label="Delivery date"]').value)) && (await p.evaluate(() => document.querySelector('input[aria-label="Delivery date"]').placeholder)) === 'mm/dd/yyyy');
await p.click('table.stock-lines tbody tr:first-child input[aria-label="Expiry date"]'); await p.keyboard.type('06/2029'); await p.keyboard.press('Tab'); await wait(300);
check('an expiry typed as month/year is the last day of that month', (await p.evaluate(() => document.querySelector('table.stock-lines tbody tr:first-child .date-input input[type=date]').value)) === '2029-06-30');
await p.click('table.stock-lines tbody tr:nth-child(2) input[aria-label="Expiry date"]'); await p.keyboard.type('12/31/2030'); await p.keyboard.press('Tab'); await wait(300);
check('…and a full date in MM/DD/YYYY', (await p.evaluate(() => document.querySelector('table.stock-lines tbody tr:nth-child(2) .date-input input[type=date]').value)) === '2030-12-31');
await p.select('select.date-fmt', 'dmy'); await wait(200);
check('switching back to DD/MM/YYYY shows the same dates', (await p.evaluate(() => document.querySelector('table.stock-lines tbody tr:first-child input[aria-label="Expiry date"]').value)) === '30/06/2029');

// 5. rename a medicine from Add Stock
await p.click('table.stock-lines tbody tr:first-child button[aria-label="Rename medicine"]'); await wait(300);
await p.evaluate(() => { const i = document.querySelector('.modal input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, 'Alpha Tabs 500mg 10s'); i.dispatchEvent(new Event('input', { bubbles: true })); });
await p.evaluate(() => [...document.querySelectorAll('.modal button')].find((x) => /Save name/.test(x.textContent))?.click()); await wait(800);
check('a medicine renamed from Add Stock is renamed in the line', (await p.evaluate(() => document.querySelector('table.stock-lines tbody tr:first-child .med-pick input').value)) === 'Alpha Tabs 500mg 10s');
check('…and in the cloud\'s medicine list, with an audit line', await (async () => { for (let k = 0; k < 20; k++) { const { ex } = await stock(); if ((ex.products || []).find((x) => x.id === 'tl-alpha')?.name === 'Alpha Tabs 500mg 10s' && (ex.audit || []).some((a) => a.action === 'Medicine renamed')) return true; await wait(500); } return false; })());

// 6. a new supplier from the supplier box
await p.select('form.card select', '__new_supplier__'); await wait(300);
await p.evaluate(() => { const i = document.querySelector('.modal input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, 'Lakeside Pharma Distributors'); i.dispatchEvent(new Event('input', { bubbles: true })); });
await p.evaluate(() => [...document.querySelectorAll('.modal button')].find((x) => /Add supplier/.test(x.textContent))?.click()); await wait(600);
check('"New supplier" adds the supplier and chooses it', await p.evaluate(() => document.querySelector('form.card select').selectedOptions[0]?.text === 'Lakeside Pharma Distributors'));

// receive: 10 Alpha + 1 Alphamol at their costs
await p.evaluate(() => { const i = document.querySelector('table.stock-lines tbody tr:nth-child(2) input[aria-label="Quantity"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, '4'); i.dispatchEvent(new Event('input', { bubbles: true })); });
await wait(200);
// 1.10.0: colourful lines and columns (src/linecolors.js)
const colours = () => p.evaluate(() => {
  const rows = [...document.querySelectorAll('table.stock-lines tbody tr')];
  return { rows: rows.map((r) => getComputedStyle(r).getPropertyValue('--line').trim()), stripe: rows.map((r) => getComputedStyle(r.querySelector('td')).boxShadow),
    badge: rows.map((r) => getComputedStyle(r.querySelector('.line-badge')).backgroundColor), keys: rows.map((r) => r.dataset.line),
    heads: [...document.querySelectorAll('table.stock-lines thead th[class*="col-"]')].map((t) => [t.className.match(/col-(\w+)/g).pop(), getComputedStyle(t).borderTopColor]),
    grid: getComputedStyle(rows[0].querySelector('td.col-qty')).borderRightWidth };
});
let c = await colours();
check('each line has its own colour (stripe and number badge)', c.rows.length === 2 && c.rows[0] && c.rows[0] !== c.rows[1] && c.badge[0] !== c.badge[1] && /inset/.test(c.stripe[0]), JSON.stringify(c.rows));
check('every column heading has its own colour band', new Set(c.heads.map((h) => h[1])).size === c.heads.length && c.heads.length === 7, JSON.stringify(c.heads));
check('grid lines between the columns', c.grid === '1px', c.grid);
const qtyBand = c.heads.find((h) => h[0] === 'col-qty')[1];
await p.click('button[aria-label="Move Qty right"]'); await wait(200);
const moved = await colours();
check('a column keeps its colour when it moves', moved.heads[2][0] === 'col-qty' && moved.heads[2][1] === qtyBand, JSON.stringify(moved.heads.slice(0, 3)));
await p.evaluate(() => [...document.querySelectorAll('button')].find((x) => /reset column order/.test(x.textContent))?.click()); await wait(200);
await p.evaluate(() => [...document.querySelectorAll('button')].find((x) => /\+ Add line/.test(x.textContent))?.click()); await wait(200);
c = await colours();
const second = c.rows[1];
await p.evaluate(() => document.querySelector('table.stock-lines tbody tr:nth-child(3) button[aria-label="Remove line"]').click()); await wait(200);
c = await colours();
check('a line keeps its colour when another is removed', c.rows[1] === second && c.rows.length === 2, JSON.stringify(c.rows));
await p.screenshot({ path: path.join(out, 'add-stock.png'), fullPage: true });
const themeMode = async (l) => { await p.evaluate(() => { if (!document.querySelector('.theme-menu')) document.querySelector('button[title="Theme"]')?.click(); }); await wait(200); await p.evaluate((x) => [...document.querySelectorAll('.mode-opt')].find((o) => o.textContent.trim() === x)?.click(), l); await wait(300); if (await p.evaluate(() => !!document.querySelector('.theme-menu'))) await p.evaluate(() => document.querySelector('button[title="Theme"]')?.click()); await p.mouse.click(5, 890); await wait(300); };
await themeMode('Dark');
check('the line colours stay on a dark theme', await p.evaluate(() => document.documentElement.dataset.theme === 'dark' && !!getComputedStyle(document.querySelector('table.stock-lines tbody tr')).getPropertyValue('--line').trim()));
await p.screenshot({ path: path.join(out, 'add-stock-dark.png'), fullPage: true });
await themeMode('Light');
await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 }); await wait(500);
check('on a phone each line is a card with its colour stripe', await p.evaluate(() => { const r = document.querySelector('table.stock-lines tbody tr'); const st = getComputedStyle(r); return st.display === 'grid' && parseFloat(st.borderLeftWidth) >= 5; }));
await p.screenshot({ path: path.join(out, 'add-stock-phone.png'), fullPage: true });
await p.setViewport({ width: 1366, height: 900, deviceScaleFactor: 1 }); await wait(500);
await p.evaluate(() => [...document.querySelectorAll('button')].find((x) => /^Receive stock/.test(x.textContent.trim()))?.click());
await confirmReview(p);
check('the delivery is received', await until(p, () => /Received 2 item/.test(document.body.innerText)));
let st = await (async () => { for (let k = 0; k < 20; k++) { const r = await stock(); if (r.s['tl-alsy'] === 4) return r.s; await wait(500); } return (await stock()).s; })();
check('stock: Alpha 40 → 50, Alphamol 0 → 4', st['tl-alpha'] === 50 && st['tl-alsy'] === 4, JSON.stringify(st));

// 7. Edit purchase: add a missed item, remove one (undo once), change nothing else
await p.evaluate(() => { location.hash = '#/purchases'; }); await wait(1500);
await p.evaluate(() => [...document.querySelectorAll('button')].find((x) => /^Edit$/.test(x.textContent.trim()))?.click()); await wait(800);
check('Edit purchase opens with its lines as medicine pickers', await p.evaluate(() => document.querySelectorAll('.modal .med-pick input').length === 2));
await p.evaluate(() => [...document.querySelectorAll('.modal button')].find((x) => /Add an item/.test(x.textContent))?.click()); await wait(300);
await p.focus('.modal tbody tr:nth-child(3) .med-pick input'); await p.keyboard.type('beta'); await wait(300); await p.keyboard.press('Enter'); await wait(300);
await p.evaluate(() => { const r = document.querySelector('.modal tbody tr:nth-child(3)'); const set = (l, v) => { const i = r.querySelector(`input[aria-label="${l}"]`); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, v); i.dispatchEvent(new Event('input', { bubbles: true })); }; set('Quantity', '6'); set('Batch', 'BC9'); set('Expiry', '2031-03-31'); });
check('an added line takes the medicine\'s cost (shown, not typed)', /3,500/.test(await p.evaluate(() => document.querySelector('.modal tbody tr:nth-child(3) output[aria-label="Unit cost"]')?.textContent || '')));
check('…and its line total is cost × quantity', (await p.evaluate(() => document.querySelector('.modal tbody tr:nth-child(3) input[aria-label="Line total"]').value)) === '21000');
check('the unit cost cannot be typed in Edit purchase', await p.evaluate(() => !document.querySelector('.modal input[aria-label="Cost"], .modal input[aria-label="Unit cost"]')));
// remove the Alphamol line, undo, remove again
const removeAlphamol = () => p.evaluate(() => [...document.querySelectorAll('.modal tbody tr')].find((r) => /Alphamol/.test(r.querySelector('.med-pick input')?.value || ''))?.querySelector('button[aria-label="Remove line"]')?.click());
await removeAlphamol(); await wait(200);
check('a removed line shows as removed, with Undo', await p.evaluate(() => /removed/.test(document.querySelector('.modal tr.line-removed')?.innerText || '') && !!document.querySelector('.modal tr.line-removed button')));
await p.evaluate(() => [...document.querySelectorAll('.modal tr.line-removed button')].find((x) => /Undo/.test(x.textContent))?.click()); await wait(200);
check('…Undo brings it back', await p.evaluate(() => !document.querySelector('.modal tr.line-removed')));
await removeAlphamol(); await wait(200);
await p.evaluate(() => { const i = [...document.querySelectorAll('.modal input')].find((x) => /audit/i.test(x.closest('label')?.innerText || '')); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, 'Alphamol not delivered; Beta Cream was missed'); i.dispatchEvent(new Event('input', { bubbles: true })); });
check('Edit purchase lines have the same colours', await p.evaluate(() => { const r = [...document.querySelectorAll('.modal table.stock-lines tbody tr.hued')]; return r.length === 3 && new Set(r.map((x) => getComputedStyle(x).getPropertyValue('--line').trim())).size === 3; }));
await p.screenshot({ path: path.join(out, 'edit-purchase.png'), fullPage: true });
await p.evaluate(() => [...document.querySelectorAll('.modal button')].find((x) => /Save changes/.test(x.textContent))?.click()); await wait(1200);
st = await (async () => { for (let k = 0; k < 20; k++) { const r = await stock(); if (r.s['tl-beta'] === 6) return r; await wait(500); } return stock(); })();
check('stock after the edit: Alphamol back to 0, Beta Cream +6, Alpha unchanged', st.s['tl-alsy'] === 0 && st.s['tl-beta'] === 6 && st.s['tl-alpha'] === 50, JSON.stringify(st.s));
const pur = (st.ex.purchases || []).find((x) => x.editedBy);
check('the delivery now lists Alpha and Beta Cream, total 20,000 + 21,000', pur && pur.items.map((i) => i.productId).sort().join() === 'tl-alpha,tl-beta' && pur.total === 41000, JSON.stringify(pur?.items?.map((i) => [i.productId, i.qty, i.cost])));
check('the audit log says what changed and why', (st.ex.audit || []).some((a) => a.action === 'Purchase edited' && /1 line removed, 1 added/.test(a.details) && /Beta Cream was missed/.test(a.details)));
check('the new line went into its own batch with the typed expiry', (st.ex.batches || []).some((x) => x.productId === 'tl-beta' && x.batch === 'BC9' && x.expiry === '2031-03-31'));

// 8. changing a line's medicine: the old stock goes back, the new one comes in
await p.evaluate(() => [...document.querySelectorAll('button')].find((x) => /^Edit$/.test(x.textContent.trim()))?.click()); await wait(800);
await p.focus('.modal tbody tr:nth-child(2) .med-pick input'); await p.keyboard.type('alphamol'); await wait(300); await p.keyboard.press('Enter'); await wait(300);
check('changing a line\'s medicine says what will happen', /was Beta Cream 15g/.test(await p.evaluate(() => document.querySelector('.modal tbody tr:nth-child(2)').innerText)));
await p.evaluate(() => { const i = [...document.querySelectorAll('.modal input')].find((x) => /audit/i.test(x.closest('label')?.innerText || '')); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, 'It was the syrup, not the cream'); i.dispatchEvent(new Event('input', { bubbles: true })); });
await p.evaluate(() => [...document.querySelectorAll('.modal button')].find((x) => /Save changes/.test(x.textContent))?.click()); await wait(1200);
st = await (async () => { for (let k = 0; k < 20; k++) { const r = await stock(); if (r.s['tl-beta'] === 0) return r; await wait(500); } return stock(); })();
check('the cream\'s 6 went back out and 6 syrups came in', st.s['tl-beta'] === 0 && st.s['tl-alsy'] === 6, JSON.stringify(st.s));

// 9. the review before receiving (2026-11-22): the invoice total, "Use today", the same invoice twice
const setIn = (sel, v) => p.evaluate((x, y) => { const i = document.querySelector(x); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, y); i.dispatchEvent(new Event('input', { bubbles: true })); }, sel, v);
const dmy = (d) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
const fillBeta = async (invoice, qty) => {
  await p.evaluate(() => { location.hash = '#/purchases'; }); await wait(800);
  await p.evaluate(() => { location.hash = '#/add-stock'; }); await wait(1500);
  await p.select('form.card select', 'tl-sup'); await wait(300);
  await p.evaluate(() => document.querySelector('[data-testid=invoice-summary]')?.click()); await wait(200); // unfold the invoice details
  await setIn('input[aria-label="Invoice number"]', invoice);
  await p.focus('table.stock-lines tbody tr:first-child .med-pick input'); await p.keyboard.type('beta'); await wait(400); await p.keyboard.press('Enter'); await wait(300);
  await setIn('table.stock-lines tbody tr:first-child input[aria-label="Quantity"]', String(qty));
  await p.click('table.stock-lines tbody tr:first-child input[aria-label="Expiry date"]'); await p.keyboard.type('12/2031'); await p.keyboard.press('Tab'); await wait(300);
};
await fillBeta('INV-9', 2);
await setIn('input[aria-label="Invoice total"]', '9999'); await wait(200);
check('the invoice total is compared with the lines as you type', /UGX 2,999 short of the invoice/.test(await p.evaluate(() => document.querySelector('[data-testid=invoice-total-diff]')?.innerText || '')), await p.evaluate(() => document.querySelector('[data-testid=invoice-total-diff]')?.innerText || '(none)'));
await setIn('input[aria-label="Invoice total"]', '7000'); await wait(200);
check('…and the note goes when they match', await p.evaluate(() => !document.querySelector('[data-testid=invoice-total-diff]')));
await p.evaluate(() => { const i = document.querySelector('input[aria-label="Delivery date"]'); i.focus(); i.select(); }); await p.keyboard.type(dmy(new Date(Date.now() - 10 * 864e5))); await p.keyboard.press('Tab'); await wait(300);
check('a date that is not today says so, with "Use today"', /Not today/.test(await p.evaluate(() => document.querySelector('[data-testid=date-note]')?.innerText || '')), await p.evaluate(() => document.querySelector('input[aria-label="Delivery date"]').value + ' | ' + (document.querySelector('[data-testid=date-note]')?.innerText || '(no note)') + ' | ' + [...document.querySelectorAll('.toast')].map((x) => x.innerText).join(' / ')));
await p.evaluate(() => [...document.querySelectorAll('[data-testid=date-note] button')].find((x) => /Use today/.test(x.textContent))?.click()); await wait(300);
check('…"Use today" puts today back', (await p.evaluate(() => document.querySelector('input[aria-label="Delivery date"]').value)) === dmy(new Date()) && await p.evaluate(() => !document.querySelector('[data-testid=date-note]')));
await p.evaluate(() => [...document.querySelectorAll('button')].find((x) => /^Receive stock/.test(x.textContent.trim()))?.click());
const plain = await confirmReview(p);
check('nothing unusual: the review is the summary only', /Receive this delivery\?/.test(plain) && /Sample Wholesalers Ltd · invoice INV-9/.test(plain) && /1 line, 2 units, total UGX 7,000/.test(plain), plain.slice(0, 300));
check('…and receiving goes ahead', await until(p, () => /Received 1 item/.test(document.body.innerText)));
const purchasesNow = async () => { for (let k = 0; k < 20; k++) { const n = ((await stock()).ex.purchases || []).length; if (n >= 2) return n; await wait(500); } return ((await stock()).ex.purchases || []).length; };
const before = await purchasesNow();
await fillBeta('inv 9', 1);
await p.evaluate(() => [...document.querySelectorAll('button')].find((x) => /^Receive stock/.test(x.textContent.trim()))?.click());
await until(p, () => /Check before receiving/.test(document.querySelector('.modal.dialog')?.innerText || ''), 5000);
const twice = await p.evaluate(() => document.querySelector('.modal.dialog')?.innerText || '');
check('the same invoice from the same supplier again is flagged', /Check before receiving: 1 thing to look at/.test(twice) && /Invoice inv 9 from Sample Wholesalers Ltd was already received on \d\d\/\d\d\/\d{4} \(GRN/.test(twice), twice.slice(0, 400));
await p.screenshot({ path: path.join(out, 'receive-review.png') });
await p.evaluate(() => [...document.querySelectorAll('.modal.dialog button')].find((x) => /Go back and fix/.test(x.textContent))?.click()); await wait(1200);
await setIn('input[aria-label="Invoice total"]', '9999'); await wait(200);
await p.screenshot({ path: path.join(out, 'invoice-details.png') });
check('…"Go back and fix" receives nothing', (((await stock()).ex.purchases || []).length) === before && await p.evaluate(() => document.querySelectorAll('table.stock-lines tbody tr').length === 1));

await b.close();
await owner('/tenants/' + tid + '/delete', { confirm: T.tenant.slug });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

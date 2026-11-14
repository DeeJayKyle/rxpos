// Database views and slash commands (Notion-like): Table / Board / Gallery on the medicine list, customers and sales
// (kept per page on the device), the ⋯ menu on cards and table rows, "/" in Ctrl+K (commands only) and in the till's
// search box (/disc 10, /void 1), and the breadcrumb's group opening the page sheet. Fictional data only.
//   node v75-views.mjs <base> <ownerKey>
import puppeteer from 'puppeteer-core';
import { CHROME } from './chrome.mjs';
const [base, ownerKey] = process.argv.slice(2);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + String(x).slice(0, 300) : ''}`); };
const owner = (p, body) => fetch(base + '/api/owner' + p, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ownerKey }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());
const until = async (p, fn, ms = 20000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await p.evaluate(fn).catch(() => false)) return true; await wait(250); } return false; };

const T = await owner('/tenants', { name: 'Views Pharmacy', admin: { name: 'Ari Admin', email: 'ari@views.rx', password: 'ari-pass-1234' } });
const tid = T.tenant.id, slug = T.tenant.slug;
await owner('/tenants/' + tid, { features: { catalog: false } });
const date = new Date().toISOString();
await owner('/tenants/' + tid + '/records', { records: [
  { t: 'products', id: 'p1', rec: { name: 'Amoxil 500mg Caps', generic: 'Amoxicillin', form: 'Capsules', price: 500, cost: 200, reorder: 5 } },
  { t: 'products', id: 'p2', rec: { name: 'Cipro 500', generic: 'Ciprofloxacin', form: 'Tablets', price: 800, cost: 300, reorder: 50 } },
  { t: 'products', id: 'p3', rec: { name: 'Zinc 20mg', generic: 'Zinc', form: 'Tablets', price: 200, cost: 90, reorder: 5 } },
  { t: 'movements', id: 'm1', rec: { productId: 'p1', qty: 40, type: 'Opening stock', branchId: 'main', date } },
  { t: 'movements', id: 'm2', rec: { productId: 'p2', qty: 10, type: 'Opening stock', branchId: 'main', date } },
  { t: 'customers', id: 'c1', rec: { name: 'Test Clinic One', type: 'Clinic / Hospital', phone: '0700000101' } },
  { t: 'customers', id: 'c2', rec: { name: 'Test Retail Client', type: 'Retail', allergies: 'Penicillin' } },
  { t: 'sales', id: 's1', rec: { number: 'R1', date, type: 'retail', branchId: 'main', items: [{ id: 'p1', name: 'Amoxil 500mg Caps', qty: 2, price: 500, cost: 200, alloc: [] }], subtotal: 1000, discount: 0, tax: 0, total: 1000, payment: 'Cash', paid: 1000, customerId: 'walk-in', customerName: 'Walk-in Customer', cashier: 'Ari Admin', status: 'completed' } },
  { t: 'sales', id: 's2', rec: { number: 'R2', date, type: 'retail', branchId: 'main', items: [{ id: 'p2', name: 'Cipro 500', qty: 1, price: 800, cost: 300, alloc: [] }], subtotal: 800, discount: 0, tax: 0, total: 800, payment: 'Credit', paid: 0, customerId: 'c1', customerName: 'Test Clinic One', cashier: 'Ari Admin', status: 'completed' } },
] });
const b = await puppeteer.launch({ executablePath: CHROME, headless: true });
const p = await (await b.createBrowserContext()).newPage();
await p.setViewport({ width: 1440, height: 900 });
const errors = []; p.on('pageerror', (e) => errors.push(e.message));
await p.goto(base + '/' + slug, { waitUntil: 'networkidle2' }); await wait(500);
await p.evaluate(() => { for (const id of ['pos', 'dashboard', 'medicines', 'customers', 'sales']) localStorage.setItem('rxpos-tip:' + id, '1'); });
await p.type('input[autocomplete=username]', 'ari@views.rx'); await p.type('input[type=password]', 'ari-pass-1234');
await p.evaluate(() => [...document.querySelectorAll('form button')].find((x) => /^Sign in/.test(x.textContent.trim()))?.click());
await p.waitForSelector('.sidebar', { timeout: 20000 });
await until(p, () => /Synced/.test(document.querySelector('.pill.clock .clock-state')?.innerText || ''), 30000);
const go = async (h) => { await p.evaluate((x) => { location.hash = x; }, h); await wait(1000); };
const view = (name) => p.evaluate((n) => [...document.querySelectorAll('.view-switch button')].find((x) => x.title === n)?.click(), name);
const cols = () => p.evaluate(() => [...document.querySelectorAll('.dv-col')].map((c) => c.getAttribute('aria-label') + ':' + [...c.querySelectorAll('.dv-title')].map((t) => t.textContent).join('+')));

await go('#/medicines');
await view('Board'); await wait(300);
check('medicines board: out of stock, running low, in stock', JSON.stringify(await cols()) === JSON.stringify(['Out of stock:Zinc 20mg', 'Running low:Cipro 500', 'In stock:Amoxil 500mg Caps']), JSON.stringify(await cols()));
await p.evaluate(() => document.querySelector('.dv-card .dv-more').click()); await wait(200);
check('a card\'s ⋯ opens the row menu', await p.evaluate(() => [...document.querySelectorAll('.ctx-menu button')].some((x) => /Stock card/.test(x.textContent))));
await p.keyboard.press('Escape');
await view('Gallery'); await wait(300);
check('medicines gallery shows a card each', await p.evaluate(() => document.querySelectorAll('.dv-gallery .dv-card').length === 3));
await go('#/customers'); await go('#/medicines');
check('the view is kept for the page on this device', await p.evaluate(() => !!document.querySelector('.dv-gallery') && document.querySelector('.view-switch [aria-checked=true]')?.title === 'Gallery'));
await view('Table'); await wait(300);
check('table rows have a ⋯ menu', await p.evaluate(() => { const b = document.querySelector('tbody tr .row-more'); b?.click(); return !!b; }) && await until(p, () => !!document.querySelector('.ctx-menu'), 2000));
await p.keyboard.press('Escape');

await go('#/customers'); await view('Board'); await wait(300);
const cc = await cols();
check('customers board by type', cc.includes('Clinic / Hospital:Test Clinic One') && cc.includes('Retail:Test Retail Client'), JSON.stringify(cc));
check('allergies show on the card', await p.evaluate(() => /Allergies: Penicillin/.test(document.querySelector('.dv-board').innerText)));

await go('#/sales'); await view('Board'); await wait(300);
const sc = await cols();
check('sales board: paid, owing, refunded', sc[0].startsWith('Paid:R1') && sc[1].startsWith('Owing:R2') && sc[2] === 'Refunded:', JSON.stringify(sc));
await view('Table');

// the breadcrumb's group opens the page sheet
await p.evaluate(() => document.querySelector('.crumb-group')?.click()); await wait(300);
check('the breadcrumb group opens every page', await p.evaluate(() => !!document.querySelector('.mega-sheet')));
await p.keyboard.press('Escape'); await wait(200);

// "/" in Ctrl+K: commands only
await p.keyboard.down('Control'); await p.keyboard.press('k'); await p.keyboard.up('Control'); await wait(300);
await p.keyboard.type('/note');
check('"/" in Ctrl+K lists commands only', await until(p, () => { const s = [...document.querySelectorAll('.palette-section')].map((x) => x.textContent); return s.includes('Commands') && !s.includes('Medicines') && !s.includes('AI') && /New note page/.test(document.querySelector('.palette-list').innerText); }, 3000));
await p.keyboard.press('Enter'); await wait(800);
check('a slash command runs: a new note page opens', await p.evaluate(() => location.hash.includes('/notes') && document.querySelector('.note-title')?.value === ''));

// "/" in the till's search box
await go('#/pos');
await p.evaluate(() => [...document.querySelectorAll('.product-grid .product')].find((x) => /Amoxil/.test(x.textContent))?.click()); await wait(300);
check('the till has the line to work on', await p.evaluate(() => document.querySelectorAll('.cart-line').length === 1));
await p.focus('input.search.big');
await p.keyboard.type('/di'); await wait(200);
check('"/" in the till search lists its commands', await p.evaluate(() => /disc 10/.test(document.querySelector('.till-slash')?.innerText || '')));
await p.evaluate(() => { const el = document.activeElement; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ''); el.dispatchEvent(new Event('input', { bubbles: true })); });
await p.keyboard.type('/disc 10'); await p.keyboard.press('Enter'); await wait(300);
check('/disc 10 gives 10% off the sale', await p.evaluate(() => document.querySelector('input[aria-label=Discount]')?.value === '50'), await p.evaluate(() => document.querySelector('input[aria-label=Discount]')?.value));
check('the search box is cleared after a command', await p.evaluate(() => document.activeElement?.value === ''));
await p.keyboard.type('/void 1'); await p.keyboard.press('Enter'); await wait(300);
check('/void 1 removes the line', await p.evaluate(() => !document.querySelector('.cart-line')));

check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await b.close();
await owner('/tenants/' + tid + '/delete', { confirm: slug });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

// Pharmacy workspace (1.5): navigation rail, spelling-tolerant POS search, favourites / recent / in-stock filters,
// unit and pack labels, grouped notification centre, plain save state, consistent stock valuation, records to review.
// Fictional sample data only.   node v34-workspace.mjs <base> <ownerKey> <outDir>
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import { CHROME } from './chrome.mjs';
const [base, ownerKey, out] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + String(x).slice(0, 180) : ''}`); };
const owner = (p, body) => fetch(base + '/api/owner' + p, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ownerKey }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());
const setVal = (p, sel, val) => p.evaluate((sel, val) => { const i = document.querySelector(sel); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, val); i.dispatchEvent(new Event('input', { bubbles: true })); }, sel, val);
const day = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const iso = (n) => new Date(Date.now() - n * 864e5).toISOString();

const t = await owner('/tenants', { name: 'Sample Care Pharmacy', admin: { name: 'Tess Sample', email: 'tess@test.rx', password: 'tess-pass-1234' } });
const slug = t.tenant.slug, tid = t.tenant.id;
await owner('/tenants/' + tid + '/records', { records: [
  // one medicine with an expired batch AND a good batch: the case where the old Stock Valuation disagreed with Inventory
  { t: 'products', id: 'p1', rec: { name: 'Amoxyl 500mg caps', generic: 'Amoxicillin', form: 'Capsules', unit: 'Capsule', price: 1000, cost: 600, reorder: 5, barcode: '7000001', packs: [{ name: 'Strip', size: 10 }] } },
  { t: 'batches', id: 'b1', rec: { productId: 'p1', batch: 'OLD1', expiry: day(-5), cost: 500 } },
  { t: 'batches', id: 'b2', rec: { productId: 'p1', batch: 'NEW1', expiry: day(400), cost: 600 } },
  { t: 'movements', id: 'm1', rec: { productId: 'p1', qty: 2, type: 'Opening stock', batchId: 'b1', branchId: 'main', date: iso(30) } },
  { t: 'movements', id: 'm2', rec: { productId: 'p1', qty: 10, type: 'Opening stock', batchId: 'b2', branchId: 'main', date: iso(30) } },
  // a record with problems to review (no retail price, no form)
  { t: 'products', id: 'p2', rec: { name: 'Ferrous Sulphate 200 mg', generic: 'Iron', unit: 'Tablet', price: 0, cost: 50, reorder: 0 } },
  { t: 'products', id: 'p3', rec: { name: 'Zinc 20mg', generic: 'Zinc', form: 'Tablets', unit: 'Tablet', price: 200, cost: 90, reorder: 0 } },
  { t: 'batches', id: 'b3', rec: { productId: 'p3', batch: 'Z1', expiry: day(300), cost: 90 } },
  { t: 'movements', id: 'm3', rec: { productId: 'p3', qty: 30, type: 'Opening stock', batchId: 'b3', branchId: 'main', date: iso(30) } },
  { t: 'sales', id: 's1', rec: { number: 'R1', date: iso(1), type: 'retail', branchId: 'main', items: [{ id: 'p3', name: 'Zinc 20mg', qty: 1, price: 200, cost: 90, alloc: [] }], subtotal: 200, discount: 0, tax: 0, total: 200, payment: 'Cash', paid: 200, customerId: 'walk-in', customerName: 'Walk-in Customer', cashier: 'Tess Sample', status: 'completed' } },
] });
await owner('/tenants/' + tid, { features: { catalog: false } });

const b = await puppeteer.launch({ executablePath: CHROME, headless: true });
const p = await (await b.createBrowserContext()).newPage();
await p.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
await p.setViewport({ width: 1366, height: 900 });
await p.goto(base + '/' + slug, { waitUntil: 'networkidle2' }); await wait(700);
await setVal(p, 'input[autocomplete=username]', 'tess@test.rx'); await setVal(p, 'input[type=password]', 'tess-pass-1234');
await p.evaluate(() => [...document.querySelectorAll('form button')].find((x) => /^Sign in/.test(x.textContent.trim()))?.click());
await p.waitForSelector('.sidebar', { timeout: 20000 }); await wait(3000);
const go = async (hash) => { await p.goto(base + '/' + slug + '#' + hash, { waitUntil: 'networkidle2' }); await wait(1000); };

// ---- save state beside the clock (no "sync" wording on the bar) ----
const pill = await p.evaluate(() => document.querySelector('.pill.clock .clock-state')?.textContent || '');
check('top bar says the sync state in plain words', /^(Synced|Syncing…|\d+ waiting|Offline.*|On this device)$/.test(pill.trim()), pill);

// ---- navigation rail ----
const w0 = await p.evaluate(() => document.querySelector('.sidebar').getBoundingClientRect().width);
await p.click('.rail-btn'); await wait(400);
const w1 = await p.evaluate(() => document.querySelector('.sidebar').getBoundingClientRect().width);
check('the menu collapses to a compact rail', w1 < 100 && w0 > 200, `${w0} → ${w1}`);
check('rail links keep their names (tooltip + screen readers)', await p.evaluate(() => { const a = [...document.querySelectorAll('.sidebar nav a')].find((x) => x.getAttribute('href') === '#/pos'); return !!a && /POS/.test(a.title) && /POS/.test(a.textContent); }));
await p.reload({ waitUntil: 'networkidle2' }); await wait(1500);
check('the rail is remembered on this device', await p.evaluate(() => document.querySelector('.shell').classList.contains('rail')));

// ---- POS search, units, packs, filters ----
await go('/pos');
await setVal(p, '.search-row input', 'amoxycillin 500 mg'); await wait(300);
const found = await p.evaluate(() => [...document.querySelectorAll('.product')].map((x) => x.innerText.split('\n')[0]));
check('POS: a misspelt generic + strength finds the brand', found[0] === 'Amoxyl 500mg caps', found.join(','));
const card = await p.evaluate(() => document.querySelector('.product')?.innerText.replace(/\s+/g, ' ') || '');
check('POS: the card shows the price per sale unit and the pack size', /\/ capsule/.test(card) && /1 strip = 10 capsules/.test(card), card);
await setVal(p, '.search-row input', 'sulfate'); await wait(300);
check('POS: sulphate is found as sulfate', await p.evaluate(() => /Ferrous Sulphate/.test(document.querySelector('.product')?.innerText || '')));
await setVal(p, '.search-row input', ''); await wait(200);
await p.evaluate(() => [...document.querySelectorAll('.view-chip')].find((x) => x.textContent.trim() === 'In stock')?.click()); await wait(300);
check('POS: "In stock" hides medicines with no stock', await p.evaluate(() => ![...document.querySelectorAll('.product')].some((x) => /Ferrous/.test(x.innerText))));
await p.evaluate(() => [...document.querySelectorAll('.view-chip')].find((x) => x.textContent.trim() === 'Recent')?.click()); await wait(300);
check('POS: "Recent" lists what sold recently at this branch', (await p.evaluate(() => [...document.querySelectorAll('.product')].map((x) => x.innerText.split('\n')[0]).join(','))) === 'Zinc 20mg');
await p.evaluate(() => [...document.querySelectorAll('.view-chip')].find((x) => x.textContent.trim() === 'All')?.click()); await wait(200);
await p.evaluate(() => document.querySelector('.product-wrap .fav-btn')?.click()); await wait(200);
await p.evaluate(() => [...document.querySelectorAll('.view-chip')].find((x) => x.textContent.includes('Favourites'))?.click()); await wait(300);
check('POS: a starred medicine appears under Favourites', (await p.evaluate(() => document.querySelectorAll('.product').length)) === 1);
await p.evaluate(() => [...document.querySelectorAll('.view-chip')].find((x) => x.textContent.trim() === 'All')?.click()); await wait(200);
await p.screenshot({ path: `${out}/pos-rail.png` });

// ---- expired stock stays guarded: the expired batch is never sold silently ----
await setVal(p, '.search-row input', 'amoxyl'); await wait(300);
for (let i = 0; i < 10; i++) { await p.evaluate(() => document.querySelector('.product')?.click()); await wait(120); }
await p.evaluate(() => document.querySelector('.product')?.click()); await wait(400);
check('POS: past the unexpired stock, the pharmacist must confirm selling expired stock', await p.evaluate(() => /Only expired stock left/.test(document.body.innerText)));
await p.keyboard.press('Escape'); await wait(300);

// ---- notification centre ----
await go('/');
await p.evaluate(() => document.querySelector('button[title="Notifications"]')?.click()); await wait(300);
const bell = await p.evaluate(() => ({ heads: [...document.querySelectorAll('.bell-menu .bell-head')].map((x) => x.textContent), why: !!document.querySelector('.bell-menu .bell-why') }));
check('notification centre groups by severity, with the reason for each', bell.heads.some((h) => /^Urgent/.test(h)) && bell.why, JSON.stringify(bell));
await p.keyboard.press('Escape');

// ---- stock valuation agrees with Inventory (same batch-cost rule) ----
await go('/inventory');
const invSub = await p.evaluate(() => document.querySelector('.page-head .sub')?.textContent || '');
await go('/reports');
await p.evaluate(() => [...document.querySelectorAll('.tab')].find((x) => /Stock Valuation/.test(x.textContent))?.click()); await wait(400);
const rep = await p.evaluate(() => Object.fromEntries([...document.querySelectorAll('.stat')].map((s) => [s.querySelector('small')?.textContent.trim(), s.querySelector('strong')?.textContent.trim()])));
// at the medicine's cost: Amoxyl good batch 10 × 600 + Zinc 30 × 90 = 8,700; expired (Amoxyl old batch, 2 units) not included
check('Stock Valuation: stock at cost, expired excluded (8,700)', /8,700/.test(rep['Stock at cost'] || ''), JSON.stringify(rep));
check('Stock Valuation: only the expired batch counts as expired, at the medicine\'s cost (2 × 600 = 1,200)', /1,200/.test(rep['Expired stock (cost)'] || ''), rep['Expired stock (cost)']);
check('…the same totals Inventory shows', /8,700 at cost/.test(invSub) && /1,200 expired/.test(invSub), invSub);

// ---- reorder explanation ----
await go('/reorder');
check('Reorder explains fixed levels vs the sales forecast', await p.evaluate(() => /reorder level/.test(document.querySelector('.explain')?.textContent || '') && /sells per day/.test(document.querySelector('.explain')?.textContent || '')));

// ---- drug information: spelling-tolerant search, never stuck loading ----
await go('/drug-info');
await setVal(p, '.page .search-wrap input', 'amoxycillin'); await wait(300);
check('Drug info: a misspelt name still finds the medicine', await p.evaluate(() => [...document.querySelectorAll('.ref-links .chip')].some((x) => /Amoxyl/.test(x.textContent))));
await p.evaluate(() => [...document.querySelectorAll('.ref-links .chip')].find((x) => /Amoxyl/.test(x.textContent))?.click());
const settled = await (async () => { for (let i = 0; i < 50; i++) { const st = await p.evaluate(() => (document.querySelector('.druginfo-title') ? 'label' : document.querySelector('.druginfo .error button') ? 'error+retry' : /No label found/.test(document.querySelector('.druginfo')?.innerText || '') ? 'not found' : document.querySelector('.druginfo-skeleton') ? 'loading' : 'other')); if (st !== 'loading') return st; await wait(500); } return 'loading'; })();
check('Drug info: the lookup ends in a clear state within 25 s (label, not found, or an error with Try again)', ['label', 'error+retry', 'not found'].includes(settled), settled);
check('Drug info: reference links are always offered', (await p.evaluate(() => document.querySelectorAll('.druginfo .ref-links a').length)) >= 5);

// ---- records to review ----
await go('/medicines');
await p.evaluate(() => [...document.querySelectorAll('.page-head button')].find((x) => /Needs review/.test(x.textContent))?.click()); await wait(400);
const rows = await p.evaluate(() => [...document.querySelectorAll('tbody tr')].map((r) => r.innerText.replace(/\s+/g, ' ')));
check('Needs review lists the record with problems, and why', rows.length === 1 && /Ferrous/.test(rows[0]) && /No retail price/.test(rows[0]) && /No formulation/.test(rows[0]), JSON.stringify(rows));
check('…and leaves the record as it is (still no retail price)', /UGX 0\b/.test(rows[0] || ''), rows[0]);

// ---- dashboard on a phone: two KPIs per row while the amounts fit ----
await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
await go('/');
check('phone: two KPI cards per row', (await p.evaluate(() => getComputedStyle(document.querySelector('.kpis')).gridTemplateColumns.split(' ').length)) === 2);
check('phone: no horizontal overflow', await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));

await b.close();
await owner('/tenants/' + tid + '/delete', { confirm: slug });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

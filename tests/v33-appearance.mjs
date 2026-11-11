// Appearance: Light / Dark / Follow system (live with the OS), accent presets that never touch status colours,
// and the premium dashboard (profit, transactions, alert tiles, chart period) on real data.
//   node v33-appearance.mjs <base> <ownerKey> <outDir>
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import { CHROME } from './chrome.mjs';
const [base, ownerKey, out] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + String(x).slice(0, 160) : ''}`); };
const owner = (p, body) => fetch(base + '/api/owner' + p, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ownerKey }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());
const setVal = (p, sel, val) => p.evaluate((sel, val) => { const i = document.querySelector(sel); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, val); i.dispatchEvent(new Event('input', { bubbles: true })); }, sel, val);
const html = (p) => p.evaluate(() => ({ theme: document.documentElement.dataset.theme, palette: document.documentElement.dataset.palette, accent: document.documentElement.dataset.accent || '' }));
const css = (p, name) => p.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name);
const openMenu = (p) => p.evaluate(() => { if (!document.querySelector('.theme-menu')) document.querySelector('button[title="Theme"]')?.click(); });
const pickMode = (p, label) => p.evaluate((l) => [...document.querySelectorAll('.mode-opt')].find((x) => x.textContent.trim() === l)?.click(), label);

// one sale today with a known cost, so profit and transactions have real values
const t = await owner('/tenants', { name: 'Look Pharmacy', admin: { name: 'Lena', email: 'lena@test.rx', password: 'lena-pass-1234' } });
const slug = t.tenant.slug, tid = t.tenant.id;
const day = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
await owner('/tenants/' + tid + '/records', { records: [
  { t: 'products', id: 'p1', rec: { name: 'Panadol 500mg', form: 'Tablets', price: 1000, cost: 600, reorder: 5, unit: 'Unit' } },
  { t: 'batches', id: 'b1', rec: { productId: 'p1', batch: 'B1', expiry: day(-3), cost: 600 } },
  { t: 'movements', id: 'm1', rec: { productId: 'p1', qty: 4, type: 'Opening stock', batchId: 'b1', branchId: 'main', date: new Date(Date.now() - 5 * 864e5).toISOString() } },
  { t: 'sales', id: 's1', rec: { number: 'R1', date: new Date().toISOString(), type: 'retail', branchId: 'main', items: [{ id: 'p1', name: 'Panadol 500mg', qty: 3, price: 1000, cost: 600, alloc: [] }], subtotal: 3000, discount: 0, tax: 0, total: 3000, payment: 'Cash', paid: 3000, customerId: 'walk-in', customerName: 'Walk-in Customer', cashier: 'Lena', status: 'completed' } },
] });
await owner('/tenants/' + tid, { features: { catalog: false } });

const b = await puppeteer.launch({ executablePath: CHROME, headless: true });
const p = await (await b.createBrowserContext()).newPage();
await p.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }, { name: 'prefers-reduced-motion', value: 'reduce' }]);
await p.setViewport({ width: 1280, height: 900 });
await p.goto(base + '/' + slug, { waitUntil: 'networkidle2' }); await wait(700);
await setVal(p, 'input[autocomplete=username]', 'lena@test.rx'); await setVal(p, 'input[type=password]', 'lena-pass-1234');
await p.evaluate(() => [...document.querySelectorAll('form button')].find((x) => /^Sign in/.test(x.textContent.trim()))?.click());
await p.waitForSelector('.sidebar', { timeout: 20000 }); await wait(3000);

check('a new device starts on RxPOS Hybrid Light (system is light)', (await html(p)).palette === 'hybrid-light', JSON.stringify(await html(p)));

// ---- dashboard on real data ----
const tiles = await p.evaluate(() => Object.fromEntries([...document.querySelectorAll('.stat')].map((s) => [s.querySelector('small')?.textContent.trim(), s.querySelector('strong')?.textContent.trim()])));
check('dashboard: gross profit today = sales less cost (3 × (1,000 − 600) = 1,200)', /1,200/.test(tiles['Gross profit today'] || ''), JSON.stringify(tiles));
check('dashboard: transactions today = 1', tiles['Transactions'] === '1', tiles['Transactions']);
check('dashboard: expired tile counts the expired batch in stock', tiles['Expired'] === '1', tiles['Expired']);
check('dashboard: Low stock and Soon expiring tiles are still there', 'Low stock' in tiles && 'Soon expiring' in tiles);
await p.evaluate(() => [...document.querySelectorAll('.seg button')].find((x) => /7 days/.test(x.textContent))?.click()); await wait(300);
check('dashboard: chart period switches to 7 days', /last 7 days/.test(await p.evaluate(() => document.querySelector('.card-head h3')?.textContent || '')));
check('dashboard: Promote today shows a picture per medicine', await p.evaluate(() => !document.querySelector('.promo-row') || [...document.querySelectorAll('.promo-row')].every((r) => r.querySelector('.promo-art svg, .promo-art img'))));
await p.screenshot({ path: `${out}/dashboard-light.png` });

// ---- Light / Dark / System ----
const ok0 = await css(p, '--ok');
await openMenu(p); await wait(200);
await pickMode(p, 'Dark'); await wait(300);
check('Dark switches to RxPOS Hybrid Dark', (await html(p)).palette === 'hybrid-dark' && (await html(p)).theme === 'dark', JSON.stringify(await html(p)));
await openMenu(p); await wait(200);
await pickMode(p, 'System'); await wait(300);
check('System follows the OS (light)', (await html(p)).palette === 'hybrid-light');
check('System mode is remembered', (await p.evaluate(() => localStorage.getItem('rxpos-theme-mode'))) === 'system');
await p.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }, { name: 'prefers-reduced-motion', value: 'reduce' }]); await wait(400);
check('System switches live when the OS goes dark', (await html(p)).palette === 'hybrid-dark', JSON.stringify(await html(p)));
await p.reload({ waitUntil: 'networkidle2' }); await wait(1500);
check('System mode survives a reload (dark OS → dark)', (await html(p)).palette === 'hybrid-dark');
await p.screenshot({ path: `${out}/dashboard-dark.png` });

// ---- picking a palette leaves System mode ----
await openMenu(p); await wait(200);
await p.evaluate(() => [...document.querySelectorAll('.theme-item')].find((x) => x.textContent.includes('Tokyo'))?.click()); await wait(300);
check('picking a palette applies it and stops following the system', (await html(p)).palette === 'tokyo-night' && (await p.evaluate(() => localStorage.getItem('rxpos-theme-mode'))) === null);
await openMenu(p); await wait(200);
await pickMode(p, 'Light'); await wait(300);
check('Light from a dark palette goes to RxPOS Hybrid Light', (await html(p)).palette === 'hybrid-light');

// ---- accent presets ----
const prim0 = await css(p, '--primary');
await openMenu(p); await wait(200);
await p.evaluate(() => document.querySelector('.accent-opt[aria-label="Violet"]')?.click()); await wait(300);
check('Violet accent is applied', (await html(p)).accent === 'violet' && (await css(p, '--primary')) !== prim0, await css(p, '--primary'));
check('an accent never changes the status colours', (await css(p, '--ok')) === ok0, `${ok0} → ${await css(p, '--ok')}`);
await p.reload({ waitUntil: 'networkidle2' }); await wait(1500);
check('the accent survives a reload', (await html(p)).accent === 'violet');
await openMenu(p); await wait(200);
await p.evaluate(() => document.querySelector('.accent-opt[aria-label="Theme colour"]')?.click()); await wait(300);
check('Theme colour removes the accent', (await html(p)).accent === '' && (await p.evaluate(() => localStorage.getItem('rxpos-accent'))) === null);

// ---- POS payment buttons coloured by kind; Reports payment donut ----
await p.goto(base + '/' + slug + '#/pos', { waitUntil: 'networkidle2' }); await wait(1200);
const chips = await p.evaluate(() => [...document.querySelectorAll('.pay-methods .chip')].map((c) => [c.textContent.replace(/\d$/, '').trim(), [...c.classList].find((k) => k.startsWith('pay-')), getComputedStyle(c).backgroundColor]));
check('POS: payment buttons carry their kind (Cash = cash, Mobile Money = momo)', chips.some(([n, k]) => n === 'Cash' && k === 'pay-cash') && chips.some(([n, k]) => n === 'Mobile Money' && k === 'pay-momo'), JSON.stringify(chips));
check('POS: the chosen payment button is filled with its colour', await p.evaluate(() => { const a = document.querySelector('.pay-methods .chip.active'); return !!a && getComputedStyle(a).backgroundColor !== getComputedStyle(document.querySelector('.pay-methods .chip:not(.active)')).backgroundColor; }));
await p.goto(base + '/' + slug + '#/reports', { waitUntil: 'networkidle2' }); await wait(1200);
check('Reports: payment donut shows the period total with one segment per method', await p.evaluate(() => /3,000/.test(document.querySelector('.donut-total')?.textContent || '') && document.querySelectorAll('.donut-seg').length === 1));
await p.screenshot({ path: `${out}/reports-light.png` });

// ---- phone: two KPIs per row (amounts still readable), the alerts as one list, Sell button in the bar ----
await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
await p.goto(base + '/' + slug + '#/', { waitUntil: 'networkidle2' }); await wait(1500);
const cols = await p.evaluate(() => ['.kpis', '.alerts'].map((s) => getComputedStyle(document.querySelector(s)).gridTemplateColumns.split(' ').length));
check('phone: KPI cards two per row, alerts one list', cols[0] === 2 && cols[1] === 1, cols.join(','));
check('phone: no horizontal overflow', await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
check('phone: bottom nav is Home · Stock · Sell · Sales · More', (await p.evaluate(() => [...document.querySelectorAll('.bottom-nav > *')].map((x) => x.textContent.trim()).join('·'))) === 'Home·Stock·Sell·Sales·More');
await p.screenshot({ path: `${out}/phone-dashboard.png` });

await b.close();
await owner('/tenants/' + tid + '/delete', { confirm: slug });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

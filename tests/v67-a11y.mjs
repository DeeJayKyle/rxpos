// Step 24: accessibility audit. axe-core (the same engine as the browsers' accessibility tools) checks the sign-in page
// and the main pages of the app, in the light and the dark theme; any serious or critical problem fails the suite.
// Fictional data only.   node v67-a11y.mjs <base> <ownerKey>   (RXPOS_A11Y_ALL=1 lists minor problems too)
import fs from 'node:fs';
import { createRequire } from 'node:module';
import puppeteer from 'puppeteer-core';
import { CHROME } from './chrome.mjs';
const [base, ownerKey] = process.argv.slice(2);
const AXE = fs.readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + String(x).slice(0, 1500) : ''}`); };
const owner = (p, body) => fetch(base + '/api/owner' + p, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ownerKey }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());
const until = async (p, fn, ms = 20000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await p.evaluate(fn).catch(() => false)) return true; await wait(300); } return false; };

const T = await owner('/tenants', { name: 'Access Pharmacy', admin: { name: 'Ari Admin', email: 'ari@access.rx', password: 'ari-pass-1234' } });
const tid = T.tenant.id, slug = T.tenant.slug;
await owner('/tenants/' + tid, { features: { catalog: false } });
const date = new Date().toISOString();
await owner('/tenants/' + tid + '/records', { records: [
  { t: 'products', id: 'p1', rec: { name: 'Access Tabs', price: 1000, cost: 400, reorder: 5, barcode: '7010001' } },
  { t: 'batches', id: 'b1', rec: { productId: 'p1', batch: 'A1', expiry: '2030-01-01', cost: 400 } },
  { t: 'movements', id: 'm1', rec: { productId: 'p1', qty: 100, type: 'Opening stock', batchId: 'b1', branchId: 'main', date } },
  { t: 'customers', id: 'c1', rec: { name: 'Grace Achieng', phone: '0772555111' } },
  { t: 'suppliers', id: 's1', rec: { name: 'Sample Wholesalers', phone: '0414000000' } },
  { t: 'insurers', id: 'i1', rec: { name: 'Jubilee Health', schemes: [{ id: 'gold', name: 'Gold', copayPct: 10 }] } },
  { t: 'sales', id: 'x1', rec: { number: 'R1', date, type: 'retail', branchId: 'main', cashier: 'Ari Admin', items: [{ id: 'p1', name: 'Access Tabs', qty: 1, price: 1000 }], subtotal: 1000, discount: 0, tax: 0, total: 1000, paid: 1000, payment: 'Cash', customerId: 'c1', customerName: 'Grace Achieng', status: 'completed' } },
] });

const PAGES = ['dashboard', 'pos', 'sales', 'shifts', 'customers', 'suppliers', 'insurers', 'medicines', 'inventory', 'add-stock', 'purchases', 'expiry',
  'expenses', 'debtors', 'cash-book', 'reports', 'users', 'settings'];
const all = process.env.RXPOS_A11Y_ALL === '1';
// what counts: serious and critical problems (minor and moderate are listed with RXPOS_A11Y_ALL=1)
const audit = (p) => p.evaluate(async (axeSrc) => {
  if (!window.axe) (0, eval)(axeSrc); // the axe script, read from node_modules
  const r = await window.axe.run(document, { resultTypes: ['violations'], runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] } });
  return r.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.slice(0, 4).map((n) => n.target.join(' ') + (n.failureSummary ? ' — ' + n.failureSummary.split('\n').slice(1, 2).join('').trim() : '')), count: v.nodes.length }));
}, AXE);
const show = (vs) => vs.map((v) => ` [${v.impact}] ${v.id} ×${v.count}: ${v.help}\n      ${v.nodes.join('\n      ')}`).join('');
const serious = (vs) => vs.filter((v) => all || v.impact === 'serious' || v.impact === 'critical');

const b = await puppeteer.launch({ executablePath: CHROME, headless: true });
for (const theme of ['light', 'dark']) {
  const ctx = await b.createBrowserContext();
  const p = await ctx.newPage();
  await p.setViewport({ width: 1366, height: 900 });
  await p.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: theme }]);
  p.on('dialog', (d) => d.dismiss().catch(() => {}));
  await p.goto(base + '/' + slug, { waitUntil: 'networkidle2' }); await wait(800);
  await p.evaluate(() => { for (const id of ['pos', 'dashboard', 'sales', 'insurers', 'settings', 'add-stock']) localStorage.setItem('rxpos-tip:' + id, '1'); });
  await p.reload({ waitUntil: 'networkidle2' }); await wait(800);
  let v = serious(await audit(p));
  check(`[${theme}] sign-in page`, v.length === 0, show(v));
  await p.type('input[autocomplete=username]', 'ari@access.rx'); await p.type('input[type=password]', 'ari-pass-1234');
  await p.evaluate(() => [...document.querySelectorAll('form button')].find((x) => /^Sign in/.test(x.textContent.trim()))?.click());
  await p.waitForSelector('.sidebar', { timeout: 20000 });
  await until(p, () => /Synced/.test(document.querySelector('.pill.clock .clock-state')?.innerText || ''), 30000);
  for (const page of PAGES) {
    await p.evaluate((x) => { location.hash = '#/' + x; }, page); await wait(1500);
    v = serious(await audit(p));
    check(`[${theme}] ${page}`, v.length === 0, show(v));
  }
  await ctx.close();
}
await b.close();
await owner('/tenants/' + tid + '/delete', { confirm: slug });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

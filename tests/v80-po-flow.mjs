// Reorder → purchase orders (2026-11-15): the review names the supplier rule actually used (cheapest / last / by hand),
// groups lines by the supplier chosen for each, shows estimated totals and that prices need confirming; order
// quantities can be typed (checked) and rounded to whole packs; Print and WhatsApp no longer mark an order sent,
// "Mark as sent" does, with an audit entry. Fictional data only.
//   node v80-po-flow.mjs <base> <ownerKey> <outDir>
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
import { CHROME } from './chrome.mjs';
const [base, ownerKey, out = '.output/v80'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + String(x).slice(0, 300) : ''}`); };
const owner = (p, body) => fetch(base + '/api/owner' + p, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ownerKey }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());
const until = async (p, fn, ms = 20000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await p.evaluate(fn).catch(() => false)) return true; await wait(250); } return false; };
const iso = (n) => new Date(Date.now() - n * 864e5).toISOString();

const T = await owner('/tenants', { name: 'Order Flow Pharmacy', admin: { name: 'Ola Admin', email: 'ola@orders.rx', password: 'ola-pass-1234' } });
const tid = T.tenant.id, slug = T.tenant.slug;
await owner('/tenants/' + tid, { features: { catalog: false } });
const recs = [
  { t: 'products', id: 'p1', rec: { name: 'Amoxil 500mg Caps', generic: 'Amoxicillin', form: 'Capsules', price: 500, cost: 220, reorder: 5 } },
  { t: 'products', id: 'p2', rec: { name: 'Cipro 500 Tabs', generic: 'Ciprofloxacin', form: 'Tablets', price: 800, cost: 300, reorder: 5, packs: [{ name: 'Box', size: 10 }] } },
  { t: 'batches', id: 'b1', rec: { productId: 'p1', batch: 'A1', expiry: '2029-06-30', cost: 220, branchId: 'main' } },
  { t: 'batches', id: 'b2', rec: { productId: 'p2', batch: 'C1', expiry: '2029-06-30', cost: 300, branchId: 'main' } },
  { t: 'movements', id: 'm1', rec: { productId: 'p1', qty: 12, type: 'Opening stock', branchId: 'main', batchId: 'b1', date: iso(40) } },
  { t: 'movements', id: 'm2', rec: { productId: 'p2', qty: 6, type: 'Opening stock', branchId: 'main', batchId: 'b2', date: iso(40) } },
  { t: 'branches', id: 'br2', rec: { name: 'Ntinda branch' } },
  { t: 'expenseCategories', id: 'ec1', rec: { name: 'Rent' } },
  { t: 'expenses', id: 'e1', rec: { date: iso(1), categoryId: 'ec1', description: 'Shop rent', amount: 5000, method: 'Cash' } },
  { t: 'suppliers', id: 'sA', rec: { name: 'Alpha Supplies', phone: '' } },
  { t: 'suppliers', id: 'sB', rec: { name: 'Beta Pharma', phone: '' } },
  // Alpha sold Amoxil cheaper earlier; Beta is the last supplier of both
  { t: 'purchases', id: 'pu1', rec: { number: 'P1', date: iso(30), supplierId: 'sA', supplierName: 'Alpha Supplies', branchId: 'main', items: [{ productId: 'p1', name: 'Amoxil 500mg Caps', qty: 10, cost: 200 }], total: 2000, paid: 2000 } },
  { t: 'purchases', id: 'pu2', rec: { number: 'P2', date: iso(10), supplierId: 'sB', supplierName: 'Beta Pharma', branchId: 'main', items: [{ productId: 'p1', name: 'Amoxil 500mg Caps', qty: 10, cost: 250 }, { productId: 'p2', name: 'Cipro 500 Tabs', qty: 10, cost: 300 }], total: 5500, paid: 5500 } },
];
for (let d = 1; d <= 28; d++) recs.push({ t: 'sales', id: 's' + d, rec: { number: 'R' + d, date: iso(d), type: 'retail', branchId: 'main', items: [{ id: 'p1', name: 'Amoxil 500mg Caps', qty: 3, price: 500, cost: 220, alloc: [] }, { id: 'p2', name: 'Cipro 500 Tabs', qty: 2, price: 800, cost: 300, alloc: [] }], subtotal: 3100, discount: 0, tax: 0, total: 3100, payment: 'Cash', paid: 3100, customerId: 'walk-in', customerName: 'Walk-in Customer', cashier: 'Ola Admin', status: 'completed' } });
await owner('/tenants/' + tid + '/records', { records: recs });

const b = await puppeteer.launch({ executablePath: CHROME, headless: true });
const p = await (await b.createBrowserContext()).newPage();
await p.setViewport({ width: 1440, height: 900 });
const errors = []; p.on('pageerror', (e) => errors.push(e.message));
await p.goto(base + '/' + slug, { waitUntil: 'networkidle2' }); await wait(500);
await p.evaluate(() => { for (const id of ['pos', 'dashboard', 'reorder']) localStorage.setItem('rxpos-tip:' + id, '1'); });
await p.type('input[autocomplete=username]', 'ola@orders.rx'); await p.type('input[type=password]', 'ola-pass-1234');
await p.evaluate(() => [...document.querySelectorAll('form button')].find((x) => /^Sign in/.test(x.textContent.trim()))?.click());
await p.waitForSelector('.sidebar', { timeout: 20000 });
await until(p, () => /Synced/.test(document.querySelector('.pill.clock .clock-state')?.innerText || ''), 30000);
const go = async (h) => { await p.evaluate((x) => { location.hash = x; }, h); await wait(1200); };
const click = (re, scope = 'body') => p.evaluate((src, sc) => { const r = new RegExp(src); const el = [...document.querySelector(sc).querySelectorAll('button, a.btn, .tab')].reverse().find((x) => r.test(x.textContent.trim())); el?.click(); return !!el; }, re.source, scope);
const modal = () => p.evaluate(() => [...document.querySelectorAll('.modal')].pop()?.innerText || '');
const setQty = async (name, v) => { await p.evaluate((n, val) => { const i = document.querySelector(`input[aria-label="Order quantity for ${n}"]`); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, val); i.dispatchEvent(new Event('input', { bubbles: true })); }, name, v); await wait(300); };

await go('#/reorder');
check('both medicines are suggested', await until(p, () => /Amoxil 500mg Caps/.test(document.body.innerText) && /Cipro 500 Tabs/.test(document.body.innerText)));
check('order quantities can be typed', await p.evaluate(() => document.querySelectorAll('input[aria-label^="Order quantity for"]').length === 2));

// Cheapest supplier (default)
await click(/^Review orders/); await wait(500);
let m = await modal();
check('review (cheapest): names the cheapest-supplier rule, not "last bought"', /cheapest supplier/.test(m) && !/last bought/.test(m), m.slice(0, 200));
check('…Amoxil goes to Alpha (cheapest), Cipro to Beta: two orders', /Review 2 purchase orders/.test(m) && /Alpha Supplies/.test(m) && /Beta Pharma/.test(m));
check('…says prices are estimates to confirm and that nothing is sent', /confirm prices/.test(m) && /not sent/.test(m));
await p.screenshot({ path: path.join(out, 'review-cheapest.png') });
await click(/^Back$/, '.modal'); await wait(300);

// Last supplier
await click(/^Last supplier$/); await wait(400);
await click(/^Review orders/); await wait(500);
m = await modal();
check('review (last): names the last-supplier rule', /last bought/.test(m) && !/cheapest supplier/.test(m), m.slice(0, 200));
check('…both lines grouped under Beta Pharma: one order', /Review 1 purchase order\b/.test(m) && !/Alpha Supplies/.test(m));
await click(/^Back$/, '.modal'); await wait(300);

// Quantities
await setQty('Cipro 500 Tabs', '0');
check('a quantity of 0 is flagged', await p.evaluate(() => document.querySelector('input[aria-label="Order quantity for Cipro 500 Tabs"]').getAttribute('aria-invalid') === 'true' && /Whole number, 1 or more/.test(document.body.innerText)));
await click(/^Review orders/); await wait(500);
check('…and blocks the review', !(await p.evaluate(() => /Review \d purchase order/.test([...document.querySelectorAll('.modal')].pop()?.innerText || ''))));
await setQty('Cipro 500 Tabs', '25');
await p.evaluate(() => [...document.querySelectorAll('label.check')].find((x) => /whole packs/.test(x.textContent)).querySelector('input').click()); await wait(300);
check('rounding to packs makes 25 → 3 boxes of 10', await p.evaluate(() => /3 boxes of 10/.test(document.querySelector('input[aria-label="Order quantity for Cipro 500 Tabs"]').closest('td').innerText)));
await p.screenshot({ path: path.join(out, 'reorder-qty.png') });
await click(/^Review orders/); await wait(500);
m = await modal();
check('review shows the rounded quantity 30 and its line total', /Cipro 500 Tabs\s+30\b/.test(m) && /9,000|9000/.test(m), m.slice(0, 400));
await click(/^Create 1 draft order$/, '.modal'); await wait(1200);
check('creating opens Purchase orders with one Draft order', await until(p, () => /Draft/.test(document.querySelector('.page table')?.innerText || '')));

// Print / Mark as sent
await p.evaluate(() => { window.print = () => { window.__printed = (window.__printed || 0) + 1; }; });
await click(/^Open$/); await wait(500);
await click(/^Print$/, '.modal'); await wait(600);
check('Print prints…', await p.evaluate(() => window.__printed === 1));
check('…but leaves the order a Draft', /Status: \W*Draft/.test(await modal()));
check('the WhatsApp link no longer changes the status on click', await p.evaluate(() => { const a = [...document.querySelectorAll('.modal a.btn')].find((x) => /WhatsApp/.test(x.textContent)); return a && !a.onclick; }));
await p.screenshot({ path: path.join(out, 'po-draft.png') });
await click(/^Mark as sent$/, '.modal'); await wait(500);
await click(/^Mark as sent$/); await wait(1000);
check('Mark as sent (after asking) sets the status to Sent', /Status: \W*Sent/.test(await modal()) && /marked sent/.test(await modal()));
check('…and the Mark as sent button goes away', !(await p.evaluate(() => [...document.querySelectorAll('.modal button')].some((x) => x.textContent.trim() === 'Mark as sent'))));
await p.screenshot({ path: path.join(out, 'po-sent.png') });
await p.keyboard.press('Escape'); await wait(300);
await go('#/audit');
check('marking sent is in the audit log', await until(p, () => /Purchase order marked sent/.test(document.body.innerText), 8000));

// Reports say what they cover; expenses (no branch) are explained, not silently redefined
await go('#/reports');
check('reports: a scope line with branch, dates and what Sales counts', await until(p, () => /All branches · \d{4}-\d\d-\d\d to \d{4}-\d\d-\d\d · Sales include tax/.test(document.querySelector('[data-testid=report-scope]')?.innerText || ''), 8000));
await p.evaluate(() => [...document.querySelectorAll('.report-groups button')].find((x) => x.textContent === 'Money').click()); await wait(300);
await click(/^Expenses Report$/); await wait(400);
await p.select('select[aria-label=Branch]', 'br2'); await wait(500);
const sc = await p.evaluate(() => document.querySelector('[data-testid=report-scope]').innerText);
check('…for a branch other than main, Expenses says none are counted there and why', /Ntinda branch/.test(sc) && /whole pharmacy, not per branch, so none are counted for this branch/.test(sc), sc);
await p.screenshot({ path: path.join(out, 'reports-scope.png') });
// quick report cards: one tap sets the dates and the report
await p.select('select[aria-label=Branch]', 'all'); await wait(300);
await p.evaluate(() => [...document.querySelectorAll('.quick-report')].find((x) => /Today's sales/.test(x.textContent)).click()); await wait(600);
const todayIso = await p.evaluate(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; });
check("quick report: Today's sales shows the Sales Report for today only", await p.evaluate((t) => new RegExp(`Sales Report · All branches · ${t} to ${t}`).test(document.querySelector('[data-testid=report-scope]').innerText), todayIso));
await p.screenshot({ path: path.join(out, 'reports-quick.png') });
await go('#/');
check('dashboard: the expenses card says expenses are for the whole pharmacy', await until(p, () => /Whole pharmacy \(expenses have no branch\)/.test(document.body.innerText), 8000));

// phone
await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
await go('#/reorder');
await p.screenshot({ path: path.join(out, 'reorder-phone.png'), fullPage: true });
check('phone: no sideways scroll on Reorder', await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
// status pills on the orders list
await p.setViewport({ width: 1440, height: 900 }); await go('#/reorder'); await click(/^Purchase orders$/); await wait(500);
check('orders list: the status is a pill with words (Sent)', await p.evaluate(() => !!document.querySelector('.status-pill[data-status=Sent]') && /Sent/.test(document.querySelector('.status-pill').innerText)));
// This device: the account card and Log out
await go('#/device');
check('This device: account card with the name, role and Change password', await p.evaluate(() => /Ola Admin/.test(document.querySelector('.account-card')?.innerText || '') && /admin/i.test(document.querySelector('.account-card').innerText) && /Change password/.test(document.querySelector('.account-card').innerText)));
await p.screenshot({ path: path.join(out, 'device-account.png') });
await p.evaluate(() => document.querySelector('.account-logout').click()); await wait(1500);
check('…its Log out signs out', await until(p, () => !!document.querySelector('input[autocomplete=username]'), 8000));
check('sign-in: icons inside the boxes and a large Sign in button', await p.evaluate(() => document.querySelectorAll('.field.with-icon .input-icon').length === 2 && document.querySelector('.btn.auth-submit').getBoundingClientRect().height >= 48));
await p.screenshot({ path: path.join(out, 'signin.png') });
check('no page errors', !errors.length, errors.join(' | '));
await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

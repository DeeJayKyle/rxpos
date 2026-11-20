// The owner's rules of 2026-11-20: "Start your shift?" on signing in and "End your shift?" on signing out; past sales
// outside any shift turned into shifts only once the owner approves; the till opens on the medicines in stock, A–Z,
// with no Recent list; Tidy names renames only what a person ticks and approves.
//   node v88-owner-rules.mjs <base> <ownerKey> <outDir>
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import { CHROME } from './chrome.mjs';
const [base, ownerKey, out] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + String(x).slice(0, 200) : ''}`); };
const owner = (p, body) => fetch(base + '/api/owner' + p, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ownerKey }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());
const setVal = (p, sel, val) => p.evaluate((sel, val) => { const i = document.querySelector(sel); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, val); i.dispatchEvent(new Event('input', { bubbles: true })); }, sel, val);
const clickText = (p, sel, re) => p.evaluate((s, r) => { const el = [...document.querySelectorAll(s)].find((x) => new RegExp(r).test(x.textContent.trim())); el?.click(); return !!el; }, sel, re.source);
const dialogTitle = (p) => p.evaluate(() => document.querySelector('.modal.dialog h3')?.textContent || '');
const go = async (p, h) => { await p.evaluate((h) => { location.hash = '#' + h; }, h); await wait(1200); };

const t = await owner('/tenants', { name: 'Rules Pharmacy', admin: { name: 'Ivy', email: 'ivy88@test.rx', password: 'ivy-pass-12345' } });
const slug = t.tenant.slug, tid = t.tenant.id;
const ago = (days, h) => { const d = new Date(Date.now() - days * 864e5); d.setHours(h, 0, 0, 0); return d.toISOString(); };
const day = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const sale = (id, cashier, date, total) => ({ t: 'sales', id, rec: { number: id, date, type: 'retail', branchId: 'main', items: [{ id: 'p1', name: 'Zinc 20mg', qty: 1, price: total, cost: 1, alloc: [] }], subtotal: total, discount: 0, tax: 0, total, payment: 'Cash', paid: total, customerId: 'walk-in', customerName: 'Walk-in Customer', cashier, status: 'completed' } });
await owner('/tenants/' + tid + '/records', { records: [
  { t: 'products', id: 'p1', rec: { name: 'Zinc 20mg', form: 'Tablets', price: 300, cost: 100, unit: 'Unit' } },
  { t: 'products', id: 'p2', rec: { name: 'AMOXIL 500 MG CAPS', form: 'Capsules', price: 500, cost: 200, unit: 'Unit' } },
  { t: 'products', id: 'p3', rec: { name: 'Atenolol 50mg', form: 'Tablets', price: 200, cost: 80, unit: 'Unit' } },
  ...['p1', 'p3'].flatMap((id) => [{ t: 'batches', id: 'b' + id, rec: { productId: id, batch: 'B' + id, expiry: day(400), cost: 100 } }, { t: 'movements', id: 'm' + id, rec: { productId: id, qty: 20, type: 'Opening stock', batchId: 'b' + id, branchId: 'main', date: ago(10, 8) } }]),
  sale('S1', 'Ivy', ago(3, 9), 300), sale('S2', 'Ivy', ago(3, 15), 600), sale('S3', 'Henry Example', ago(2, 10), 900),
] });
await owner('/tenants/' + tid, { features: { catalog: false } });

const b = await puppeteer.launch({ executablePath: CHROME, headless: true });
const p = await (await b.createBrowserContext()).newPage();
// a test robot sees the shift questions only when it asks for them (src/shiftstart.js)
await p.evaluateOnNewDocument(() => { try { localStorage.setItem('rxpos-shift-questions', '1'); } catch { /* */ } });
await p.setViewport({ width: 1366, height: 900 });
await p.goto(base + '/' + slug, { waitUntil: 'networkidle2' }); await wait(700);
await setVal(p, 'input[autocomplete=username]', 'ivy88@test.rx'); await setVal(p, 'input[type=password]', 'ivy-pass-12345');
await p.evaluate(() => [...document.querySelectorAll('form button')].find((x) => /^Sign in/.test(x.textContent.trim()))?.click());
await p.waitForSelector('.sidebar', { timeout: 20000 }); await wait(3000);

// ---- signing in: "Start your shift?" ----
check('signing in asks "Start your shift?"', /Start your shift/.test(await dialogTitle(p)), await dialogTitle(p));
await setVal(p, '.modal.dialog input', '20000');
await clickText(p, '.modal.dialog button', /^Start shift$/); await wait(1000);
await go(p, '/shifts');
check('…yes starts the shift with the float', await p.evaluate(() => /Shift open since .* float UGX 20,000/.test(document.querySelector('.page')?.innerText || '')), await p.evaluate(() => document.querySelector('.notice')?.innerText));
await p.reload({ waitUntil: 'networkidle2' }); await wait(2500);
check('…asked once per sign-in (not again after a reload)', !(await dialogTitle(p)));

// ---- past sales into shifts: only with the owner's approval ----
const notice = await p.evaluate(() => document.querySelector('[data-testid=shift-backfill]')?.innerText || '');
check('the owner sees past sales made outside any shift', /3 past sales/.test(notice) && /2 days of work by 2 people/.test(notice) && /Nothing changes until you approve/.test(notice), notice);
const before = (await owner('/tenants/' + tid + '/records?t=shifts')).total;
await clickText(p, '[data-testid=shift-backfill] button', /Review/); await wait(500);
const listed = await p.evaluate(() => [...document.querySelectorAll('.modal tbody tr')].map((r) => r.innerText.replace(/\s+/g, ' ')));
check('…the review lists one shift per person and day', listed.length === 2 && listed.some((x) => /Ivy/.test(x) && /\b2\b/.test(x)) && listed.some((x) => /Henry Example/.test(x)), listed.join(' | '));
check('…nothing was saved before approving', (await owner('/tenants/' + tid + '/records?t=shifts')).total === before);
await clickText(p, '.modal button', /^Approve and create/); await wait(500);
await clickText(p, '.modal.dialog button', /^Approve and create$/); await wait(2500);
const shifts = await owner('/tenants/' + tid + '/records?t=shifts');
const rebuilt = shifts.rows.map((r) => r.rec).filter((x) => x.rebuilt);
check('…approved: two rebuilt shifts, no cash count, with their sales', rebuilt.length === 2 && rebuilt.every((x) => x.counted === null && x.float === 0) && rebuilt.find((x) => x.user === 'Ivy')?.summary?.total === 900, JSON.stringify(rebuilt.map((x) => [x.user, x.summary?.total, x.counted])));
check('…and the notice is gone', await p.evaluate(() => !document.querySelector('[data-testid=shift-backfill]')));
check('…shown as rebuilt, never balanced or short', await p.evaluate(() => /rebuilt from sales/.test(document.querySelector('.table-wrap')?.innerText || '')));

// ---- the till: in stock, A–Z, no Recent ----
await go(p, '/pos'); await wait(800);
const chips = await p.evaluate(() => [...document.querySelectorAll('.view-chip')].map((x) => x.textContent.trim() + (x.classList.contains('active') ? '*' : '')));
check('the till opens on In stock; no Recent filter', chips[0] === 'In stock*' && !chips.some((x) => /Recent/.test(x)), chips.join(','));
const names = await p.evaluate(() => [...document.querySelectorAll('.product')].map((x) => x.innerText.split('\n')[0]));
check('…medicines in stock, A–Z', JSON.stringify(names) === JSON.stringify(['Atenolol 50mg', 'Zinc 20mg']), names.join(','));
await setVal(p, '.search-row input', 'amoxil'); await wait(600);
check('…a typed search still finds a medicine that is out of stock', await p.evaluate(() => [...document.querySelectorAll('.product')].some((x) => /AMOXIL/.test(x.innerText))));
await setVal(p, '.search-row input', ''); await wait(300);

// ---- Tidy names: nothing renamed until ticked and approved ----
await go(p, '/medicines');
await clickText(p, 'button', /^Tidy names$/); await wait(600);
const rows = await p.evaluate(() => [...document.querySelectorAll('.name-check tbody tr')].map((r) => [r.cells[1]?.textContent, r.querySelector('input:not([type=checkbox])')?.value]));
check('Tidy names suggests the house style', rows.some(([a, b]) => a === 'AMOXIL 500 MG CAPS' && b === 'Amoxil 500mg Capsules'), JSON.stringify(rows));
check('…nothing is ticked at first; Approve is off', await p.evaluate(() => ![...document.querySelectorAll('.name-check input[type=checkbox]')].some((x) => x.checked) && [...document.querySelectorAll('.modal .btn.primary')].find((x) => /Approve and rename/.test(x.textContent))?.disabled));
await p.evaluate(() => document.querySelector('.name-check input[type=checkbox]')?.click()); await wait(200);
await clickText(p, '.modal .btn.primary', /^Approve and rename/); await wait(500);
check('…approving asks once more, listing the change', /Rename 1 medicine/.test(await dialogTitle(p)) && await p.evaluate(() => /AMOXIL 500 MG CAPS → Amoxil 500mg Capsules/.test(document.querySelector('.modal.dialog')?.innerText || '')));
await clickText(p, '.modal.dialog button', /^Approve and rename$/); await wait(2000);
const prods = await owner('/tenants/' + tid + '/records?t=products');
check('…then renamed, and audited', prods.rows.some((r) => r.id === 'p2' && r.rec.name === 'Amoxil 500mg Capsules'), JSON.stringify(prods.rows.map((r) => r.rec.name)));
await p.keyboard.press('Escape'); await wait(300);

// ---- signing out: "End your shift?" ----
await p.evaluate(() => document.querySelector('button[title="Log out"]').click()); await wait(800);
check('signing out with a shift open asks "End your shift?"', /End your shift/.test(await dialogTitle(p)), await dialogTitle(p));
await clickText(p, '.modal.dialog button', /^End shift and count cash$/); await wait(1500);
check('…yes opens the cash count on Shifts', await p.evaluate(() => location.hash.includes('/shifts') && /count the cash/i.test(document.querySelector('.modal h3, .modal-head')?.textContent || '')));
await p.evaluate(() => { const i = [...document.querySelectorAll('.cash-count label')].find((l) => /Other coins/.test(l.textContent))?.querySelector('input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, '20000'); i.dispatchEvent(new Event('input', { bubbles: true })); });
await clickText(p, '.modal button', /^Close shift$/); await wait(2500);
const open = (await owner('/tenants/' + tid + '/records?t=shifts')).rows.map((r) => r.rec).filter((x) => !x.closedAt);
check('…the shift is closed with the count, then the person is signed out', open.length === 0 && await p.evaluate(() => !!document.querySelector('input[type=password]')), JSON.stringify(open));

await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

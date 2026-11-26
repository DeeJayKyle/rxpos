// The shared table and tabs (the owner's request, 2026-11-26: every list and table works the way Add Stock's lines do):
// Quick Edit shows every medicine 100 at a time with "Showing 100 of N", headings sort, move and resize and keep it,
// tabs move and hide and keep it, and the person's layout follows them to another device. Plus the cloud's rules for
// the layout record: a person writes and receives only their own.
//   node v91-shared-table.mjs <base> <ownerKey> <outDir>
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
import { CHROME } from './chrome.mjs';
import { dmHidden, prefsRefused, KNOWN_TABLES } from '../worker/policy.js';
const [base, ownerKey, out] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + String(x).slice(0, 200) : ''}`); };
const owner = (p, body) => fetch(base + '/api/owner' + p, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ownerKey }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());
const setVal = (p, sel, val) => p.evaluate((sel, val) => { const i = document.querySelector(sel); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, val); i.dispatchEvent(new Event('input', { bubbles: true })); }, sel, val);
const until = async (p, fn, ms = 15000, ...a) => { const end = Date.now() + ms; while (Date.now() < end) { try { if (await p.evaluate(fn, ...a)) return true; } catch { /* navigating */ } await wait(250); } return false; };

// ---- the cloud's rules for prefs (no browser needed) ----
check('prefs is a known table', KNOWN_TABLES.has('prefs'));
check('a person may write their own layout', !prefsRefused({ t: 'prefs', id: 'u:7', rec: { userId: '7' } }, '7'));
check('…not someone else\'s', prefsRefused({ t: 'prefs', id: 'u:8', rec: { userId: '8' } }, '7'));
check('…nor their own id carrying another person', prefsRefused({ t: 'prefs', id: 'u:7', rec: { userId: '8' } }, '7'));
check('a layout reaches its own person only', !dmHidden('prefs', JSON.stringify({ userId: '7' }), '7') && dmHidden('prefs', JSON.stringify({ userId: '8' }), '7'));
check('other tables are not touched by it', !dmHidden('products', JSON.stringify({ userId: '8' }), '7'));

const t = await owner('/tenants', { name: 'Layout Pharmacy', admin: { name: 'Lia', email: 'lia@layout.rx', password: 'lia-pass-12345' } });
const slug = t.tenant.slug, tid = t.tenant.id;
const recs = [];
for (let i = 1; i <= 150; i++) {
  const n = String(i).padStart(3, '0');
  recs.push({ t: 'products', id: 'p' + n, rec: { name: 'Medicine ' + n, form: 'Tablets', price: 1000 + i, cost: 500, unit: 'Unit' } });
  recs.push({ t: 'movements', id: 'm' + n, rec: { productId: 'p' + n, qty: 5 + i, type: 'Opening stock', branchId: 'main', date: new Date(Date.now() - 864e5).toISOString() } });
}
await owner('/tenants/' + tid + '/records', { records: recs });

const b = await puppeteer.launch({ executablePath: CHROME, headless: true });
const errors = [];
const signIn = async () => {
  const p = await (await b.createBrowserContext()).newPage();
  p.on('pageerror', (e) => errors.push(e.message));
  await p.setViewport({ width: 1440, height: 900 });
  await p.goto(base + '/' + slug, { waitUntil: 'networkidle2' }); await wait(600);
  await setVal(p, 'input[autocomplete=username]', 'lia@layout.rx'); await setVal(p, 'input[type=password]', 'lia-pass-12345');
  await p.evaluate(() => [...document.querySelectorAll('form button')].find((x) => /^Sign in/.test(x.textContent.trim()))?.click());
  await p.waitForSelector('.sidebar', { timeout: 20000 });
  await until(p, () => /Synced/.test(document.querySelector('.pill.clock .clock-state')?.innerText || ''), 30000);
  return p;
};
const heads = (p, table) => p.evaluate((tb) => [...document.querySelectorAll(`[data-table="${tb}"] thead th`)].map((th) => th.textContent.trim()), table);
const tabsOf = (p) => p.evaluate(() => [...document.querySelector('.tabs').querySelectorAll('[role=tab]')].map((x) => x.textContent.trim()));

const A = await signIn();
await A.evaluate(() => { location.hash = '#/quick-edit'; });
await A.waitForSelector('[data-table="quick-edit"] tbody tr', { timeout: 15000 });
await wait(600);
// every medicine, 100 at a time
const rowsA = await A.evaluate(() => document.querySelectorAll('[data-table="quick-edit"] tbody tr').length);
check('Quick Edit draws the first 100 medicines', rowsA === 100, rowsA);
check('…and says "Showing 100 of 150"', await A.evaluate(() => /Showing 100 of 150/.test(document.querySelector('[data-table="quick-edit"] .load-more')?.innerText || '')));
await A.evaluate(() => [...document.querySelectorAll('[data-table="quick-edit"] .load-more button')].find((x) => /more/.test(x.textContent))?.click());
check('…"Show 50 more" draws the rest', await until(A, () => document.querySelectorAll('[data-table="quick-edit"] tbody tr').length === 150));

// sort by a heading
await A.evaluate(() => [...document.querySelectorAll('[data-table="quick-edit"] th .th-sort')].find((x) => x.textContent.trim() === 'Medicine')?.click());
await wait(300);
const firstName = () => A.evaluate(() => document.querySelector('[data-table="quick-edit"] tbody tr td')?.innerText.split('\n')[0]);
const s1 = await A.evaluate(() => [...document.querySelectorAll('[data-table="quick-edit"] th .th-sort')].find((x) => x.textContent.trim() === 'Medicine')?.dataset.sort);
check('clicking a heading sorts by it (and marks it)', s1 === 'desc' && (await firstName()) === 'Medicine 150', s1 + ' ' + (await firstName()));

// move a column with its arrows
const before = await heads(A, 'quick-edit');
const second = before[1];
await A.evaluate((n) => document.querySelector(`[data-table="quick-edit"] th button[aria-label="Move ${n} right"]`)?.click(), second);
await wait(300);
const after = await heads(A, 'quick-edit');
check('a heading\'s → arrow moves the column one place right', after[2] === second && after[1] === before[2], after.join(' | '));

// resize a column from its edge (keyboard: 16 px a step)
const w0 = await A.evaluate(() => document.querySelector('[data-table="quick-edit"] thead th:nth-child(2)').getBoundingClientRect().width);
await A.addStyleTag({ content: 'th.col-move .col-resize { display: block !important; }' }); // headless Chrome reports a touch screen (no hover), where edges are hidden
await A.focus('[data-table="quick-edit"] thead th:nth-child(2) .col-resize');
for (let i = 0; i < 5; i++) await A.keyboard.press('ArrowRight');
await wait(300);
const w1 = await A.evaluate(() => document.querySelector('[data-table="quick-edit"] thead th:nth-child(2)').getBoundingClientRect().width);
check('a column\'s edge makes it wider', w1 >= w0 + 40, `${Math.round(w0)} → ${Math.round(w1)}`);

// kept after a reload
await A.reload({ waitUntil: 'networkidle2' });
await A.waitForSelector('[data-table="quick-edit"] tbody tr', { timeout: 20000 }); await wait(600);
check('the order, width and sort are kept after a reload', (await heads(A, 'quick-edit')).join() === after.join() && (await firstName()) === 'Medicine 150');

// ---- tabs move and hide ----
await A.evaluate(() => { location.hash = '#/reorder'; });
await A.waitForSelector('.tabs [role=tab]', { timeout: 15000 }); await wait(500);
const t0 = await tabsOf(A);
await A.focus('.tabs [role=tab]');
await A.keyboard.down('Control'); await A.keyboard.down('Shift'); await A.keyboard.press('ArrowRight'); await A.keyboard.up('Shift'); await A.keyboard.up('Control');
await wait(300);
const t1 = await tabsOf(A);
check('Ctrl + Shift + → moves a tab one place right', t1[0] === t0[1] && t1[1] === t0[0], t1.join(' | '));
// right-click a tab that is not open: Hide
const deadTab = await A.evaluateHandle(() => [...document.querySelectorAll('.tabs [role=tab]')].find((x) => /Dead stock/.test(x.textContent) && x.getAttribute('aria-selected') !== 'true'));
const box = await deadTab.boundingBox();
await A.mouse.click(box.x + 10, box.y + 5, { button: 'right' });
await A.waitForSelector('.ctx-menu', { timeout: 5000 });
check('right-click a tab: move and hide choices', await A.evaluate(() => /Move left/.test(document.querySelector('.ctx-menu').innerText) && /Hide Dead stock/.test(document.querySelector('.ctx-menu').innerText)));
await A.evaluate(() => [...document.querySelectorAll('.ctx-menu button')].find((x) => /^Hide/.test(x.textContent.trim()))?.click());
await wait(300);
check('…Hide takes the tab away', !(await tabsOf(A)).some((x) => /Dead stock/.test(x)));
await A.reload({ waitUntil: 'networkidle2' });
await A.waitForSelector('.tabs [role=tab]', { timeout: 20000 }); await wait(500);
const t2 = await tabsOf(A);
check('…both kept after a reload', t2.join() === t1.filter((x) => !/Dead stock/.test(x)).join(), t2.join(' | '));
// the hidden tab comes back from the same menu
const fh = await (await A.$('.tabs [role=tab]')).boundingBox();
await A.mouse.click(fh.x + 10, fh.y + 5, { button: 'right' });
await A.waitForSelector('.ctx-menu', { timeout: 5000 });
await A.evaluate(() => [...document.querySelectorAll('.ctx-menu button')].find((x) => /Show hidden tabs \(1\)/.test(x.textContent))?.click());
await wait(300);
const t3 = await tabsOf(A);
check('…"Show hidden tabs" brings it back in its place', t3.join() === t1.join(), t3.join(' | '));
await A.mouse.click(fh.x + 10, fh.y + 5, { button: 'right' });
await A.waitForSelector('.ctx-menu', { timeout: 5000 });
await A.evaluate(() => [...document.querySelectorAll('.ctx-menu button')].find((x) => /^Hide/.test(x.textContent.trim()) && !x.disabled)?.click());
await wait(300);
await A.screenshot({ path: path.join(out, 'tabs.png') });

// ---- the layout follows the person to another device ----
await wait(2500); // the layout is kept with the person a moment after the last change
await until(A, () => /Synced/.test(document.querySelector('.pill.clock .clock-state')?.innerText || ''), 20000);
const B = await signIn();
await B.evaluate(() => { location.hash = '#/quick-edit'; });
await B.waitForSelector('[data-table="quick-edit"] tbody tr', { timeout: 15000 });
const synced = await until(B, (want) => [...document.querySelectorAll('[data-table="quick-edit"] thead th')].map((th) => th.textContent.trim()).join() === want, 20000, after.join());
check('another device shows the same column order', synced, (await heads(B, 'quick-edit')).join(' | '));
await B.evaluate(() => { location.hash = '#/reorder'; });
await B.waitForSelector('.tabs [role=tab]', { timeout: 15000 }); await wait(500);
check('…and the same tabs', (await tabsOf(B)).join() === t2.join(), (await tabsOf(B)).join(' | '));
// "Standard order" on one device puts everything back
const first = await B.$('.tabs [role=tab]');
const fb = await first.boundingBox();
await B.mouse.click(fb.x + 10, fb.y + 5, { button: 'right' });
await B.waitForSelector('.ctx-menu', { timeout: 5000 });
await B.evaluate(() => [...document.querySelectorAll('.ctx-menu button')].find((x) => /Standard order/.test(x.textContent))?.click());
await wait(300);
check('"Standard order" brings the tabs back as they were', (await tabsOf(B)).join() === t0.join(), (await tabsOf(B)).join(' | '));

check('no page errors', errors.length === 0, errors.join(' | '));
await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

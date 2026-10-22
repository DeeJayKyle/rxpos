// Username sign-in (staff sign in with a username + pharmacy, no email) and the Consumption (ABC) report.
//   node v22-username-abc.mjs <base> <ownerKey> <outDir>
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import { CHROME } from './chrome.mjs';
const [base, ownerKey, out] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + String(x).slice(0, 200) : ''}`); };
const owner = (p, body) => fetch(base + '/api/owner' + p, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ownerKey }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());
const api = (p, body) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, ...(await r.json().catch(() => ({})))}));
const clickText = (p, sel, re) => p.evaluate((s, src) => { const r = new RegExp(src); const el = [...document.querySelectorAll(s)].find((x) => r.test(x.textContent)); el?.click(); return !!el; }, sel, re.source);

const t = await owner('/tenants', { name: 'ABC Pharmacy', admin: { name: 'Ann Admin', email: 'ann@test.rx', password: 'ann-pass-123' } });
const slug = t.tenant.slug, tid = t.tenant.id;

// ---- Admin adds a cashier with a USERNAME (no email) ----
const b = await puppeteer.launch({ executablePath: CHROME, headless: true });
const A = await (await b.createBrowserContext()).newPage();
await A.goto(base + '/' + slug, { waitUntil: 'networkidle2' }); await wait(700);
await A.type('input[autocomplete=username]', 'ann@test.rx'); await A.type('input[type=password]', 'ann-pass-123');
await A.evaluate(() => [...document.querySelectorAll('button')].find((x) => x.textContent.includes('Sign in')).click());
await A.waitForSelector('.sidebar', { timeout: 20000 }); await wait(2500);
await A.goto(base + '/' + slug + '#/users', { waitUntil: 'networkidle2' }); await wait(1200);
await clickText(A, 'button', /Add user/); await wait(500);
await A.evaluate(() => { const set = (sel, v) => { const e = document.querySelector(sel); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(e, v); e.dispatchEvent(new Event('input', { bubbles: true })); }; set('.modal input', 'Mary Mukasa'); });
await A.evaluate(() => { const l = [...document.querySelectorAll('.modal label.field')]; const u = l.find((x) => /Username/.test(x.innerText)).querySelector('input'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(u, 'mary'); u.dispatchEvent(new Event('input', { bubbles: true })); const pw = l.find((x) => /Password/.test(x.innerText)).querySelector('input'); set.call(pw, 'mary-pass-123'); pw.dispatchEvent(new Event('input', { bubbles: true })); });
await clickText(A, '.modal button', /Add user/); await wait(1500);
check('admin can add a staff member with a username and no email', await A.evaluate(() => /Mary Mukasa/.test(document.body.innerText)));
// wait for sync so the cloud has Mary
await wait(2500);

// ---- Mary signs in with username + pharmacy, no email ----
const r1 = await api('/api/login', { email: 'mary', password: 'mary-pass-123', tenant: slug });
check('username + pharmacy + password signs in', !!r1.token && r1.user?.name === 'Mary Mukasa', JSON.stringify(r1).slice(0, 150));
const r2 = await api('/api/login', { email: 'mary', password: 'wrong', tenant: slug });
check('wrong password is refused', r2.status === 401, r2.status);
const r3 = await api('/api/login', { email: 'mary', password: 'mary-pass-123' });
check('a username with no pharmacy is refused (usernames are per pharmacy)', r3.status === 400, r3.status);
// Mary signs in on a fresh browser through the UI
const M = await (await b.createBrowserContext()).newPage();
await M.goto(base + '/' + slug, { waitUntil: 'networkidle2' }); await wait(700);
await M.type('input[autocomplete=username]', 'mary'); await M.type('input[type=password]', 'mary-pass-123');
await M.evaluate(() => [...document.querySelectorAll('button')].find((x) => x.textContent.includes('Sign in')).click());
check('username sign-in works on the sign-in screen', await (async () => { for (let i = 0; i < 25; i++) { if (await M.$('.sidebar')) return true; await wait(500); } return false; })());
await M.screenshot({ path: out + '/username-signed-in.png' });
await M.close();
check('email sign-in still works', !!(await api('/api/login', { email: 'ann@test.rx', password: 'ann-pass-123', tenant: slug })).token);

// ---- Consumption (ABC) report ----
const iso = (n) => new Date(Date.now() - n * 864e5).toISOString();
const meds = [['Coartem 80/480', 18000, 13000], ['Panadol tabs', 500, 300], ['Amoxyl caps', 1200, 800], ['ORS sachet', 500, 300], ['Slow cream', 9000, 6000], ['Dusty syrup', 7000, 4000]];
const recs = [];
meds.forEach(([name, price, cost], i) => {
  recs.push({ t: 'products', id: 'p' + i, rec: { name, form: 'Tablets', price, cost, reorder: 10 } });
  recs.push({ t: 'batches', id: 'bb' + i, rec: { productId: 'p' + i, batch: 'B' + i, expiry: '2028-01-01', cost } });
  recs.push({ t: 'movements', id: 'mm' + i, rec: { productId: 'p' + i, qty: i === 4 ? 30 : 200, type: 'Opening stock', batchId: 'bb' + i, branchId: 'main', date: iso(40) } });
});
// sales over 20 days: Coartem is the class-A value driver; "Slow cream" and "Dusty syrup" don't sell
for (let d = 0; d < 20; d++) {
  const items = [{ id: 'p0', name: 'Coartem 80/480', qty: 3, price: 18000, cost: 13000 }, { id: 'p1', name: 'Panadol tabs', qty: 10, price: 500, cost: 300 }, { id: 'p2', name: 'Amoxyl caps', qty: 4, price: 1200, cost: 800 }, { id: 'p3', name: 'ORS sachet', qty: 6, price: 500, cost: 300 }];
  const total = items.reduce((a, x) => a + x.qty * x.price, 0);
  recs.push({ t: 'sales', id: 'sale' + d, rec: { number: 'R' + d, date: iso(d), type: 'retail', branchId: 'main', items, subtotal: total, discount: 0, tax: 0, total, payment: 'Cash', paid: total, cashier: 'Ann Admin', status: 'completed' } });
}
await owner('/tenants/' + tid + '/records', { records: recs });
await A.reload({ waitUntil: 'networkidle2' }); await wait(500);
await A.goto(base + '/' + slug + '#/reports', { waitUntil: 'networkidle2' }); await wait(1500);
await clickText(A, '.tab', /Consumption/); await wait(500);
// widen the date range to include the seeded sales
await A.evaluate(() => { const ins = document.querySelectorAll('.page-head input[type=date]'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(ins[0], new Date(Date.now() - 40 * 864e5).toISOString().slice(0, 10)); ins[0].dispatchEvent(new Event('input', { bubbles: true })); ins[0].dispatchEvent(new Event('change', { bubbles: true })); });
await wait(800);
const body = await A.evaluate(() => document.body.innerText);
check('the Consumption (ABC) report lists medicines by class', /Consumption by medicine/.test(body) && await A.evaluate(() => document.querySelectorAll('.abc').length > 0));
const coartem = await A.evaluate(() => { const row = [...document.querySelectorAll('.table-wrap tbody tr')].find((r) => /Coartem/.test(r.innerText)); return row ? { cls: row.querySelector('.abc')?.textContent, txt: row.innerText.replace(/\s+/g, ' ') } : null; });
check('Coartem (highest value used) is class A', coartem?.cls === 'A', JSON.stringify(coartem));
const idleHead = await A.evaluate(() => [...document.querySelectorAll('.card h3')].map((h) => h.innerText).find((x) => /not sold this period/i.test(x)) || '');
check('"In stock but not sold this period" flags the two idle medicines', /\(2\)/.test(idleHead), idleHead);
await A.screenshot({ path: out + '/consumption-abc.png', fullPage: true });
await A.close();
await owner('/tenants/' + tid + '/delete', { confirm: slug });
await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

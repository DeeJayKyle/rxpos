// Step 26: features copied from the Flutter app into the React app: scheduled report emails, Shelves and grouping by
// class / area / form / shelf, Payroll & HR, and the till's panels sized by dragging. The same records as the Flutter
// app. Fictional data only.   node v70-from-flutter.mjs <base> <ownerKey>
import puppeteer from 'puppeteer-core';
import { CHROME } from './chrome.mjs';
const [base, ownerKey] = process.argv.slice(2);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + String(x).slice(0, 300) : ''}`); };
const owner = (p, body) => fetch(base + '/api/owner' + p, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ownerKey }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());
const until = async (p, fn, ms = 20000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await p.evaluate(fn).catch(() => false)) return true; await wait(250); } return false; };
const recs = async (tid, t) => ((await owner(`/tenants/${tid}/records?t=${t}`)).rows || []).map((x) => x.rec);

const T = await owner('/tenants', { name: 'Copy Pharmacy', admin: { name: 'Ari Admin', email: 'ari@copy.rx', password: 'ari-pass-1234' } });
const tid = T.tenant.id, slug = T.tenant.slug;
await owner('/tenants/' + tid, { features: { catalog: false } });
const date = new Date().toISOString();
await owner('/tenants/' + tid + '/records', { records: [
  { t: 'products', id: 'p1', rec: { name: 'Amoxil 500mg Caps', generic: 'Amoxicillin', form: 'Capsules', price: 500, cost: 200 } },
  { t: 'products', id: 'p2', rec: { name: 'Cipro 500', generic: 'Ciprofloxacin', form: 'Tablets', price: 800, cost: 300 } },
  { t: 'products', id: 'p3', rec: { name: 'Coartem 20/120', generic: 'Artemether Lumefantrine', form: 'Tablets', price: 7000, cost: 4000 } },
  ...['p1', 'p2', 'p3'].map((id, i) => ({ t: 'movements', id: 'm' + i, rec: { productId: id, qty: 20, type: 'Opening stock', branchId: 'main', date } })),
] });

const b = await puppeteer.launch({ executablePath: CHROME, headless: true });
const p = await (await b.createBrowserContext()).newPage();
await p.setViewport({ width: 1440, height: 900 });
p.on('dialog', (d) => d.dismiss().catch(() => {}));
const errors = []; p.on('pageerror', (e) => errors.push(e.message));
await p.goto(base + '/' + slug, { waitUntil: 'networkidle2' }); await wait(600);
await p.evaluate(() => { for (const id of ['pos', 'dashboard', 'inventory', 'shelves', 'payroll', 'settings']) localStorage.setItem('rxpos-tip:' + id, '1'); });
await p.type('input[autocomplete=username]', 'ari@copy.rx'); await p.type('input[type=password]', 'ari-pass-1234');
await p.evaluate(() => [...document.querySelectorAll('form button')].find((x) => /^Sign in/.test(x.textContent.trim()))?.click());
await p.waitForSelector('.sidebar', { timeout: 20000 });
await until(p, () => /Synced/.test(document.querySelector('.pill.clock .clock-state')?.innerText || ''), 30000);
const go = async (h) => { await p.evaluate((x) => { location.hash = x; }, h); await wait(1200); };
const setVal = (sel, v) => p.evaluate((s, val) => { const el = document.querySelector(s); const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, val); el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); }, sel, v);
const click = (re, sel = 'button') => p.evaluate((s, src) => { const el = [...document.querySelectorAll(s)].find((x) => new RegExp(src).test(x.textContent.trim())); el?.click(); return !!el; }, sel, re.source);
const synced = () => until(p, () => /^Synced/.test(document.querySelector('.pill.clock .clock-state')?.innerText || ''), 20000);
const text = () => p.evaluate(() => document.querySelector('main')?.innerText || '');

// Inventory grouped by therapeutic area
await go('#/inventory');
await setVal('select[aria-label="Sort and group the medicines"]', 'area'); await wait(400);
const heads = await p.evaluate(() => [...document.querySelectorAll('tr.group-head')].map((r) => r.innerText.replace(/\s+/g, ' ').trim()));
check('Inventory groups the medicines by therapeutic area', heads.some((h) => /Anti-infectives \(2\)/.test(h)) && heads.some((h) => /Antimalarials \(1\)/.test(h)), JSON.stringify(heads));
await p.evaluate(() => [...document.querySelectorAll('tr.group-head button')].find((x) => /Anti-infectives/.test(x.innerText))?.click()); await wait(300);
check('…a group folds away', !/Cipro 500/.test(await text()) && /Coartem/.test(await text()));

// Shelves: all the anti-infectives on one shelf at once
await go('#/shelves');
await setVal('select[aria-label="Sort and group the medicines"]', 'area'); await wait(400);
await p.evaluate(() => [...document.querySelectorAll('tr.group-head')].find((r) => /Anti-infectives/.test(r.innerText))?.querySelector('button[title^="Put all"]')?.click()); await wait(300);
await setVal('input[aria-label="Shelf"]', 'A1');
await click(/^Put on shelf$/); await wait(800);
await synced();
const prods = await recs(tid, 'products');
check('Shelves: a whole therapeutic area put on a shelf at once', prods.find((x) => x.id === 'p1')?.shelf === 'A1' && prods.find((x) => x.id === 'p2')?.shelf === 'A1' && !prods.find((x) => x.id === 'p3')?.shelf, JSON.stringify(prods.map((x) => [x.name, x.shelf])));
check('…recorded in the audit log', (await recs(tid, 'audit')).some((a) => a.action === 'Shelf assigned' && /Anti-infectives → shelf A1/.test(a.details || '')));

// Payroll & HR: a staff member, an advance, a month prepared and paid
await go('#/payroll');
await click(/Add staff member/); await wait(300);
const field = () => '.modal label.field:has(> span) input';
await p.evaluate(() => { const set = (lbl, v) => { const l = [...document.querySelectorAll('.modal label.field')].find((x) => x.querySelector('span')?.innerText.startsWith(lbl)); const i = l.querySelector('input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, v); i.dispatchEvent(new Event('input', { bubbles: true })); }; set('Full name', 'Amina Nakato'); set('Basic salary', '800000'); });
await p.evaluate(() => [...document.querySelectorAll('.modal button')].find((x) => x.textContent.trim() === 'Save')?.click()); await wait(500);
check('a staff member is added', /Amina Nakato/.test(await text()) && field().length > 0);
await click(/^Salary advances$/, '.tab'); await wait(300);
await click(/Give an advance/); await wait(300);
await p.evaluate(() => { const ls = [...document.querySelectorAll('.modal label.field')]; const sel = ls.find((x) => /^To/.test(x.innerText)).querySelector('select'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(sel, sel.options[1].value); sel.dispatchEvent(new Event('change', { bubbles: true })); const amt = ls.find((x) => /^Amount/.test(x.innerText)).querySelector('input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(amt, '50000'); amt.dispatchEvent(new Event('input', { bubbles: true })); });
await p.evaluate(() => [...document.querySelectorAll('.modal button')].find((x) => x.textContent.trim() === 'Give advance')?.click()); await wait(500);
await click(/^Payroll$/, '.tab'); await wait(300);
await click(/^Prepare$/); await wait(300);
await p.evaluate(() => [...document.querySelectorAll('.modal button')].find((x) => x.textContent.trim() === 'Prepare')?.click()); await wait(500);
const runText = await text();
check('the month is prepared: PAYE 142,000, NSSF 40,000, the advance 50,000, net 568,000', /142,000/.test(runText) && /40,000/.test(runText) && /568,000/.test(runText), runText.match(/Amina[\s\S]{0,200}/)?.[0]);
await click(/Mark as paid/); await wait(300);
await p.evaluate(() => [...document.querySelectorAll('.modal button')].find((x) => x.textContent.trim() === 'Mark as paid')?.click()); await wait(800);
await synced();
const exps = await recs(tid, 'expenses');
check('paid: net pay and PAYE & NSSF recorded as Salaries expenses, the advance an expense too', exps.some((e) => /^Salaries /.test(e.description) && e.amount === 568000) && exps.some((e) => /^PAYE & NSSF/.test(e.description) && e.amount === 262000) && exps.some((e) => /Salary advance: Amina/.test(e.description) && e.amount === 50000), JSON.stringify(exps.map((e) => [e.description, e.amount])));
check('…the advance is taken back by this payroll', (await recs(tid, 'salaryAdvances'))[0]?.payrollId === (await recs(tid, 'payrolls'))[0]?.id && (await recs(tid, 'payrolls'))[0]?.status === 'paid');

// Settings → Alerts: a scheduled report email
await go('#/settings');
await click(/^Alerts/, '.tab'); await wait(300);
await p.evaluate(() => document.querySelector('#report-emails button')?.click()); await wait(300);
await setVal('input[aria-label="Report name"]', 'Weekly for the owner');
await setVal('input[aria-label="Email it to"]', 'owner@example.com');
await p.evaluate(() => [...document.querySelectorAll('.modal button')].find((x) => x.textContent.trim() === 'Save')?.click()); await wait(800);
await synced();
const sch = (await recs(tid, 'reportSchedules'))[0];
check('a report email is scheduled (the same record as the Flutter app)', sch?.name === 'Weekly for the owner' && sch.frequency === 'weekly' && sch.reports.length === 5 && sch.emails === 'owner@example.com', JSON.stringify(sch));
await p.evaluate(() => [...document.querySelectorAll('#report-emails button')].find((x) => x.textContent.trim() === 'Preview')?.click());
check('…Preview shows what would be sent', await until(p, () => /owner@example.com/.test([...document.querySelectorAll('.toast')].map((x) => x.innerText).join(' ')), 15000), await p.evaluate(() => [...document.querySelectorAll('.toast')].map((x) => x.innerText).join(' | ')));

// the till: the sale panel's width dragged, remembered, double-click resets
await go('#/pos');
await p.waitForSelector('.pos-cart', { timeout: 15000 }).catch(() => {}); await wait(500);
const before = await p.evaluate(() => document.querySelector('.pos-cart').getBoundingClientRect().width);
const h = await p.$('.split-handle');
const hb = await h.boundingBox();
await p.mouse.move(hb.x + 4, hb.y + 100); await p.mouse.down(); await p.mouse.move(hb.x - 120, hb.y + 100, { steps: 6 }); await p.mouse.up(); await wait(300);
const after = await p.evaluate(() => document.querySelector('.pos-cart').getBoundingClientRect().width);
check('the sale panel is widened by dragging its edge', after > before + 80, `${before} → ${after}`);
await p.reload({ waitUntil: 'networkidle2' }); await wait(1500);
const kept = await p.evaluate(() => document.querySelector('.pos-cart').getBoundingClientRect().width);
check('…and stays so on this device', Math.abs(kept - after) < 4, `${after} / ${kept}`);
await p.evaluate(() => document.querySelector('.split-handle').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))); await wait(300);
check('…a double-click goes back to the standard width', Math.abs((await p.evaluate(() => document.querySelector('.pos-cart').getBoundingClientRect().width)) - before) < 4);
check('no errors on the page', errors.length === 0, errors.join(' | '));

await b.close();
await owner('/tenants/' + tid + '/delete', { confirm: slug });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

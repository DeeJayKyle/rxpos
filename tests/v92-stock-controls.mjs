// Stock controls (stock review, 27 Nov 2026), in the app against the local cloud: a pharmacist taking more than the
// limit off stock picks a reason and needs a manager's password; the movement keeps both; the cloud flags the loss for
// the owner; the dashboard shows shrinkage and the Stock losses report lists the change; the device reports its
// version to the owner console. Fictional data only.   node v92-stock-controls.mjs <base> <ownerKey>
import puppeteer from 'puppeteer-core';
import { CHROME } from './chrome.mjs';
const [base, ownerKey] = process.argv.slice(2);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + String(x).slice(0, 300) : ''}`); };
const owner = (p, body) => fetch(base + '/api/owner' + p, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ownerKey }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());
const until = async (p, fn, ms = 20000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await p.evaluate(fn).catch(() => false)) return true; await wait(300); } return false; };
const day = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const ago = (d) => new Date(Date.now() - d * 864e5).toISOString();

const t = await owner('/tenants', { name: 'Stock Controls Pharmacy', admin: { name: 'Ada Admin', email: 'ada@ctl.rx', password: 'ada-pass-1234' } });
const slug = t.tenant.slug, tid = t.tenant.id;
await owner('/tenants/' + tid, { features: { catalog: false } });
await owner('/tenants/' + tid + '/records', { records: [
  { t: 'products', id: 'p1', rec: { name: 'Sample Caps 250mg', form: 'Capsules', unit: 'Capsule', price: 1500, cost: 1000, reorder: 0, shelf: 'B2' } },
  { t: 'batches', id: 'b1', rec: { productId: 'p1', batch: 'SC1', expiry: day(400), cost: 1000 } },
  { t: 'batches', id: 'b2', rec: { productId: 'p1', batch: 'SC0', expiry: day(20), cost: 1000 } },
  { t: 'movements', id: 'm1', rec: { productId: 'p1', qty: 100, type: 'Opening stock', batchId: 'b1', branchId: 'main', date: ago(20) } },
  { t: 'movements', id: 'm2', rec: { productId: 'p1', qty: 5, type: 'Opening stock', batchId: 'b2', branchId: 'main', date: ago(20) } },
  // sold over the last weeks and nothing delivered: the dashboard reminds about deliveries
  ...[15, 10, 3].map((d, i) => ({ t: 'movements', id: 'ms' + i, rec: { productId: 'p1', qty: -2, type: 'Sale', ref: 'R' + i, batchId: 'b1', branchId: 'main', date: ago(d) } })),
] });
await owner('/tenants/' + tid + '/users', { user: { name: 'Mia Manager', email: 'mia@ctl.rx', role: 'manager', password: 'mia-pass-1234' } });
await owner('/tenants/' + tid + '/users', { user: { name: 'Pat Pharmacist', email: 'pat@ctl.rx', role: 'pharmacist', password: 'pat-pass-1234' } });

const b = await puppeteer.launch({ executablePath: CHROME, headless: true });
const signIn = async (email, pw) => {
  const ctx = await b.createBrowserContext();
  const p = await ctx.newPage();
  await p.setViewport({ width: 1366, height: 900 });
  p.on('dialog', (d) => d.dismiss().catch(() => {}));
  await p.goto(base + '/' + slug, { waitUntil: 'networkidle2' }); await wait(600);
  await p.evaluate(() => { for (const id of ['pos', 'dashboard', 'sales', 'medicines', 'expiry', 'reports']) localStorage.setItem('rxpos-tip:' + id, '1'); });
  await p.type('input[autocomplete=username]', email); await p.type('input[type=password]', pw);
  await p.evaluate(() => [...document.querySelectorAll('form button')].find((x) => /^Sign in/.test(x.textContent.trim()))?.click());
  await p.waitForSelector('.sidebar', { timeout: 20000 });
  await until(p, () => /Synced/.test(document.querySelector('.pill.clock .clock-state')?.innerText || ''), 30000);
  return p;
};
const go = async (p, hash) => { await p.evaluate((h) => { location.hash = h; }, hash); await wait(1200); };
const setVal = (p, sel, v) => p.evaluate((s, val) => { const i = document.querySelector(s); const proto = i.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(i, val); i.dispatchEvent(new Event(i.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); }, sel, v);
const modalText = (p) => p.evaluate(() => document.querySelector('.modal')?.innerText || '');

// ---- a pharmacist removes 60 capsules (UGX 60,000, over the 50,000 limit) ----
const pat = await signIn('pat@ctl.rx', 'pat-pass-1234');
await go(pat, '#/stock-card');
await pat.evaluate(() => [...document.querySelectorAll('.page-head button')].find((x) => /Count \/ adjust/.test(x.textContent))?.click()); await wait(500);
check('the adjust dialog asks why from a list (a count is a "Count correction" by default)', await pat.evaluate(() => { const s = [...document.querySelectorAll('.modal select')].find((x) => [...x.options].some((o) => o.value === 'damaged')); return !!s && s.value === 'count'; }));
await pat.evaluate(() => [...document.querySelectorAll('.modal .tab, .modal [role=tab], .modal button')].find((x) => x.textContent.trim() === 'Remove')?.click()); await wait(300);
await pat.evaluate(() => { const s = [...document.querySelectorAll('.modal select')].find((x) => [...x.options].some((o) => o.value === 'SC1' || /SC1/.test(o.textContent))); if (s) { s.value = [...s.options].find((o) => /SC1/.test(o.textContent)).value; s.dispatchEvent(new Event('change', { bubbles: true })); } }); await wait(200);
await setVal(pat, '.modal input[type=number]', '60'); await wait(300);
await pat.evaluate(() => { const s = [...document.querySelectorAll('.modal select')].find((x) => [...x.options].some((o) => o.value === 'damaged')); s.value = 'damaged'; s.dispatchEvent(new Event('change', { bubbles: true })); }); await wait(300);
const asks = await modalText(pat);
check('over the limit, a manager must approve (and the value is shown)', /A manager must approve taking off more than/.test(asks) && /60,000/.test(asks), asks.replace(/\s+/g, ' ').slice(0, 300));
const mia = await pat.evaluate(() => [...document.querySelectorAll('.modal .refund-approve option')].find((o) => o.textContent === 'Mia Manager')?.value);
check('…offering the manager', !!mia);
await setVal(pat, '.modal .refund-approve select', mia);
await setVal(pat, '.modal .refund-approve input[type=password]', 'wrong-pass-0000');
await pat.evaluate(() => [...document.querySelectorAll('.modal .form-actions button')].find((x) => x.textContent.trim() === 'Save').click()); await wait(2500);
check('a wrong password is refused and nothing is saved', /not right for Mia Manager/.test(await modalText(pat)), (await modalText(pat)).slice(-200));
await setVal(pat, '.modal .refund-approve input[type=password]', 'mia-pass-1234');
await pat.evaluate(() => [...document.querySelectorAll('.modal .form-actions button')].find((x) => x.textContent.trim() === 'Save').click());
check('the manager\'s password lets it through', await until(pat, () => !document.querySelector('.modal'), 15000));
await until(pat, () => /^Synced/.test(document.querySelector('.pill.clock .clock-state')?.innerText || ''), 30000); await wait(1500);

const moves = (await owner(`/tenants/${tid}/records?t=movements`)).rows || [];
const adj = moves.map((r) => (typeof r.rec === 'string' ? JSON.parse(r.rec) : r.rec)).find((m) => m?.type === 'Adjustment');
check('the movement keeps the reason and who approved it', adj && adj.qty === -60 && adj.reason === 'damaged' && adj.approvedBy === 'Mia Manager' && /Damaged or broken/.test(adj.note), JSON.stringify(adj));
const found = ((await owner(`/tenants/${tid}/records?t=anomalies`)).rows || []).map((r) => (typeof r.rec === 'string' ? JSON.parse(r.rec) : r.rec)).find((a) => a?.kind === 'stock-loss');
check('the cloud flags the loss for the owner, with the approver', !!found && found.amount === 60000 && /Sample Caps 250mg: 60 taken off/.test(found.detail) && /approved by Mia Manager/.test(found.detail), JSON.stringify(found));

// ---- the admin's dashboard, report and the owner console ----
const ada = await signIn('ada@ctl.rx', 'ada-pass-1234');
await go(ada, '#/');
check('the dashboard lists it among "Sales and stock to check"', await until(ada, () => /Big stock loss by hand/.test(document.querySelector('.sale-checks')?.innerText || ''), 15000));
const ctl = await ada.evaluate(() => document.querySelector('.stock-controls')?.innerText || '');
check('the Stock controls card shows shrinkage this month, why and by whom', /Shrinkage this month/.test(ctl) && /Damaged or broken/.test(ctl) && /Pat Pharmacist/.test(ctl), ctl.replace(/\s+/g, ' ').slice(0, 300));
check('…and reminds that no delivery has been recorded', /No delivery has been recorded/.test(ctl), ctl.replace(/\s+/g, ' ').slice(0, 300));
check('"Sell these first" lists the batch expiring in 20 days with its shelf', await ada.evaluate(() => { const c = [...document.querySelectorAll('.card')].find((x) => /Sell these first/.test(x.innerText)); return !!c && /SC0/.test(c.innerText) && /shelf B2/.test(c.innerText); }));
await go(ada, '#/reports');
await ada.evaluate(() => [...document.querySelectorAll('.report-groups button')].find((x) => x.textContent.trim() === 'Stock')?.click()); await wait(400);
await ada.evaluate(() => [...document.querySelectorAll('.tab, [role=tab], button')].find((x) => x.textContent.trim() === 'Stock losses')?.click()); await wait(800);
const rep = await ada.evaluate(() => document.querySelector('.page')?.innerText || '');
check('the Stock losses report lists the change with its reason and approver', /Taken off by hand/i.test(rep) && /Damaged or broken/.test(rep) && /Mia Manager/.test(rep), rep.replace(/\s+/g, ' ').slice(0, 400));

const devs = await owner(`/tenants/${tid}/devices`);
check('the owner console sees each device\'s app version', Array.isArray(devs.devices) && devs.devices.length >= 2 && devs.devices.every((d) => d.platform && d.last_at), JSON.stringify(devs).slice(0, 300));

// ---- settings switch the approval off ----
await go(ada, '#/settings');
check('Settings has the stock control limits', await ada.evaluate(() => /Stock controls/.test(document.querySelector('.page')?.innerText || '') || [...document.querySelectorAll('.tab, [role=tab], button')].some((x) => /Receipts/.test(x.textContent))));

await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

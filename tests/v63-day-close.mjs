// Closing a day (workplan step 18): a manager closes a day; its records can't be changed or deleted any more; a
// refund of its sale and anything new dated in it are kept and flagged; reopening needs an admin. Then the screens:
// the Close the day panel, and no Edit for a closed day's sale or expense. Fictional data only.
//   node v63-day-close.mjs <base> <ownerKey>
import puppeteer from 'puppeteer-core';
import { CHROME } from './chrome.mjs';
const [base, ownerKey] = process.argv.slice(2);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + String(x).slice(0, 200) : ''}`); };
const owner = (p, body) => fetch(base + '/api/owner' + p, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ownerKey }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());
const api = (p, body, token) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, ...(await r.json().catch(() => ({}))) }));
const until = async (p, fn, ms = 20000, arg) => { const end = Date.now() + ms; while (Date.now() < end) { if (await p.evaluate(fn, arg).catch(() => false)) return true; await wait(300); } return false; };
// Uganda days (UTC+3), as the cloud counts them
const ugDay = (msAgo = 0) => new Date(Date.now() - msAgo + 3 * 3600e3).toISOString().slice(0, 10);
const YDAY = ugDay(864e5), TODAY = ugDay();
const at = (day, hh = '09') => `${day}T${hh}:00:00.000Z`; // 12:00 in Uganda that day
let n = 0;
const ch = (t, id, rec, extra = {}) => ({ op: crypto.randomUUID(), t, id, at: new Date(Date.now() + n++).toISOString(), ...(rec ? { rec: { id, ...rec } } : {}), ...extra });
const push = (tok, changes) => api('/api/sync', { v: 2, deviceId: 'dev-' + Math.random().toString(36).slice(2), since: 0, changes }, tok);

const T = await owner('/tenants', { name: 'Close Pharmacy', admin: { name: 'Ada Admin', email: 'ada@close.rx', password: 'ada-pass-1234' } });
const tid = T.tenant.id, slug = T.tenant.slug;
await owner('/tenants/' + tid, { features: { catalog: false } });
for (const [name, email, role] of [['Cal Cashier', 'cal@close.rx', 'cashier'], ['Max Manager', 'max@close.rx', 'manager'], ['Pia Pharmacist', 'pia@close.rx', 'pharmacist']])
  await owner('/tenants/' + tid + '/users', { user: { name, email, role, password: email.split('@')[0] + '-pass-1234' } });
const login = async (email) => (await api('/api/login', { email, password: email.split('@')[0] + '-pass-1234', tenant: slug })).token;
const [ada, cal, max, pia] = await Promise.all(['ada@close.rx', 'cal@close.rx', 'max@close.rx', 'pia@close.rx'].map(login));
const sale = (id, number, day) => ({ number, date: at(day), type: 'retail', branchId: 'main', cashier: 'Cal Cashier', items: [{ id: 'p1', name: 'Close Tabs', qty: 1, price: 500 }], subtotal: 500, discount: 0, tax: 0, total: 500, paid: 500, payment: 'Cash', customerId: 'walk-in', status: 'completed' });
const findings = async () => (await owner(`/tenants/${tid}/records?t=anomalies`)).rows?.map((r) => r.rec) || [];

await owner('/tenants/' + tid + '/records', { records: [{ t: 'products', id: 'p1', rec: { name: 'Close Tabs', price: 500, cost: 300 } }] });
let r = await push(cal, [ch('sales', 's1', sale('s1', 'R-Y1', YDAY)), ch('expenses', 'e1', { date: YDAY, amount: 7000, category: 'Fuel', branchId: 'main' }, {})]);
check('yesterday\'s sale is recorded', r.applied >= 1, JSON.stringify(r).slice(0, 100));
await push(max, [ch('expenses', 'e1', { date: YDAY, amount: 7000, category: 'Fuel', branchId: 'main' })]);

r = await push(cal, [ch('dayCloses', 'main:' + YDAY, { branchId: 'main', day: YDAY, open: false, closedBy: 'Cal Cashier' })]);
check('a cashier cannot close a day', r.refused === 1);
r = await push(max, [ch('dayCloses', 'main:' + YDAY, { branchId: 'main', day: YDAY, open: false, closedBy: 'Max Manager', closedAt: new Date().toISOString(), snapshot: { sales: 1, total: 500 } })]);
check('a manager closes yesterday', r.applied === 1 && r.refused === 0);

r = await push(max, [ch('sales', 's1', { ...sale('s1', 'R-Y1', YDAY), total: 1, subtotal: 1, paid: 1, items: [{ id: 'p1', qty: 1, price: 1 }] })]);
check('a closed day\'s sale cannot be edited (even by a manager)', r.refused === 1);
r = await push(max, [ch('expenses', 'e1', null, { deleted: true })]);
check('…nor its expense deleted', r.refused === 1);
r = await push(max, [ch('expenses', 'e1', { date: YDAY, amount: 70000, category: 'Fuel', branchId: 'main' })]);
check('…nor its expense changed', r.refused === 1);
r = await push(cal, [ch('sales', 's1', sale('s1', 'R-Y1', YDAY))]);
check('re-sending it unchanged is fine (an older app)', r.refused === 0);
r = await push(max, [ch('expenses', 'e2', { date: TODAY, amount: 1000, category: 'Water', branchId: 'main' })]);
r = await push(max, [ch('expenses', 'e2', { date: YDAY, amount: 1000, category: 'Water', branchId: 'main' })]);
check('today\'s expense cannot be moved back into the closed day', r.refused === 1);

r = await push(pia, [ch('sales', 's1', { ...sale('s1', 'R-Y1', YDAY), status: 'refunded', refundedBy: 'Pia', refundedAt: new Date().toISOString() }), ch('movements', 'mv-ref', { productId: 'p1', qty: 1, type: 'Refund', ref: 'R-Y1', branchId: 'main', date: new Date().toISOString() })]);
check('a refund of a closed day\'s sale goes through', r.applied === 2 && r.refused === 0, JSON.stringify(r).slice(0, 120));
r = await push(cal, [ch('sales', 's2', sale('s2', 'R-LATE', YDAY)), ch('movements', 'mv-late', { productId: 'p1', qty: -1, type: 'Sale', ref: 'R-LATE', branchId: 'main', date: at(YDAY) })]);
check('a sale made offline yesterday and sent today is kept', r.applied === 2 && r.refused === 0);
r = await push(max, [ch('movements', 'mv-adj', { productId: 'p1', qty: -5, type: 'Adjustment', branchId: 'main', date: at(YDAY), note: 'shelf count' })]);
check('a stock adjustment dated in the closed day is kept', r.applied === 1);
const f = await findings();
const kinds = (num) => f.filter((x) => x.saleNumber === num || x.saleId === num).map((x) => x.kind).sort().join(',');
check('the owner sees the refund of a closed day\'s sale', kinds('R-Y1') === 'closed-refund', JSON.stringify(f.map((x) => [x.saleNumber, x.kind])));
check('…the late sale, once (not again for its stock movement)', kinds('R-LATE') === 'late' && !f.some((x) => x.saleId === 'mv-late'));
check('…and the back-dated stock adjustment', f.some((x) => x.saleId === 'mv-adj' && x.kind === 'late' && /Adjustment/.test(x.detail)), JSON.stringify(f.find((x) => x.saleId === 'mv-adj')));

r = await push(max, [ch('dayCloses', 'main:' + YDAY, { branchId: 'main', day: YDAY, open: true, reopenedBy: 'Max', reason: 'fix' })]);
check('a manager cannot reopen a day', r.refused === 1);
r = await push(ada, [ch('dayCloses', 'main:' + YDAY, { branchId: 'main', day: YDAY, open: true, reopenedBy: 'Ada Admin', reason: 'wrong fuel amount' })]);
check('an admin reopens it', r.applied === 1);
r = await push(max, [ch('expenses', 'e1', { date: YDAY, amount: 7500, category: 'Fuel', branchId: 'main' })]);
check('once reopened, its expense can be corrected', r.applied === 1 && r.refused === 0);

// the screens: a manager closes today on the Shifts page; today's sale and expense lose their Edit
await push(cal, [ch('sales', 's3', sale('s3', 'R-T1', TODAY))]);
const b = await puppeteer.launch({ executablePath: CHROME, headless: true });
const p = await (await b.createBrowserContext()).newPage();
await p.emulateTimezone('Africa/Kampala');
await p.setViewport({ width: 1366, height: 900 });
await p.goto(base + '/' + slug, { waitUntil: 'networkidle2' }); await wait(600);
await p.evaluate(() => { for (const id of ['pos', 'dashboard', 'shifts', 'sales', 'expenses']) localStorage.setItem('rxpos-tip:' + id, '1'); });
await p.type('input[autocomplete=username]', 'max@close.rx'); await p.type('input[type=password]', 'max-pass-1234');
await p.evaluate(() => [...document.querySelectorAll('form button')].find((x) => /^Sign in/.test(x.textContent.trim()))?.click());
await p.waitForSelector('.sidebar', { timeout: 20000 });
await until(p, () => /Synced/.test(document.querySelector('.pill.clock .clock-state')?.innerText || ''), 30000);
const go = async (h) => { await p.evaluate((x) => { location.hash = x; }, h); await wait(1200); };
await go('#/sales');
const editsBefore = await p.evaluate(() => document.querySelectorAll('.act-edit').length);
await go('#/shifts');
check('the manager sees "Close the day" with today open', await p.evaluate((d) => { const c = document.querySelector('.day-close'); return !!c && [...c.querySelectorAll('tr')].some((tr) => tr.innerText.includes(d) && /Open/.test(tr.innerText)); }, TODAY));
await p.evaluate((d) => [...document.querySelectorAll('.day-close tr')].find((tr) => tr.innerText.includes(d)).querySelector('button').click(), TODAY); await wait(500);
await p.evaluate(() => [...document.querySelectorAll('.modal button')].find((x) => /Close the day/.test(x.textContent))?.click());
check('closing today: it shows as closed, with its totals', await until(p, (d) => [...document.querySelectorAll('.day-close tr')].some((tr) => tr.innerText.includes(d) && /Closed/.test(tr.innerText) && /1 sales/.test(tr.innerText)), 8000, TODAY));
await until(p, () => /^Synced/.test(document.querySelector('.pill.clock .clock-state')?.innerText || ''), 20000);
const closeRec = (await owner(`/tenants/${tid}/records?t=dayCloses`)).rows?.map((x) => x.rec).find((c) => c.day === TODAY);
check('…and the close reaches the cloud with the frozen totals', closeRec?.snapshot?.sales === 1 && closeRec.snapshot.total === 500 && closeRec.closedBy === 'Max Manager', JSON.stringify(closeRec));
await go('#/sales');
const editsAfter = await p.evaluate(() => document.querySelectorAll('.act-edit').length);
check('today\'s sale has no Edit once the day is closed', editsBefore >= 1 && editsAfter === editsBefore - 1, `${editsBefore} → ${editsAfter}`);
await go('#/expenses');
check('…nor today\'s expense (shown as "Day closed"; yesterday\'s, reopened, keeps Edit)', await p.evaluate(() => [...document.querySelectorAll('.page tbody tr')].some((tr) => /UGX 1,000/.test(tr.innerText) && /Day closed/.test(tr.innerText) && !/Edit/.test(tr.innerText)) && [...document.querySelectorAll('.page tbody tr')].some((tr) => /UGX 7,500/.test(tr.innerText) && /Edit/.test(tr.innerText))));
await b.close();

await owner('/tenants/' + tid + '/delete', { confirm: slug });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

// Scheduled email reports (worker/reports.js): node v54-scheduled-reports.mjs <base> <ownerKey>
// Fictional data only. The local cloud has no email account, so a send says so; the workbook is checked by building it here.
import { xlsx, reportSheets, periodFor, periodToDate } from '../worker/reports.js';
const [base, ownerKey] = process.argv.slice(2);
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); };
const call = async (path, { method, body, auth } = {}) => {
  const r = await fetch(base + path, { method: method || (body ? 'POST' : 'GET'), headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: 'Bearer ' + auth } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let j; try { j = JSON.parse(text); } catch { j = text; }
  return [r.status, j];
};
const at = () => new Date().toISOString();
const sync = (tok, changes = []) => call('/api/sync', { auth: tok, body: { deviceId: 'dev-' + Math.random(), since: 0, changes } });

// when each frequency is due (21:00 in Uganda = 18:00 UTC)
check('daily: every day', periodFor('daily', new Date('2026-11-04T18:00:00Z'))?.label === '2026-11-04');
check('weekly: only on Sundays, the last 7 days', periodFor('weekly', new Date('2026-11-04T18:00:00Z')) === null && periodFor('weekly', new Date('2026-11-08T18:00:00Z'))?.from === '2026-11-02');
check('monthly: only on the last day, the whole month', periodFor('monthly', new Date('2026-11-29T18:00:00Z')) === null && periodFor('monthly', new Date('2026-11-30T18:00:00Z'))?.from === '2026-11-01');
const td = periodToDate('monthly', new Date('2026-11-07T18:00:00Z'));
check('"send now" covers the period up to today', td.from === '2026-11-01' && td.to === '2026-11-07' && td.startIso === '2026-10-31T21:00:00.000Z');

// the workbook itself
const sales = [{ id: 's1', number: 'R1', date: '2026-11-07T08:00:00.000Z', total: 3000, paid: 3000, payment: 'Cash', cashier: 'Ann Admin', branchId: 'main',
  items: [{ name: 'Paracetamol 500mg', qty: 10, price: 300, cost: 100 }] }, { id: 's2', number: 'R2', date: '2026-11-07T09:00:00.000Z', total: 500, status: 'refunded', items: [] }];
const { sheets, figures } = reportSheets({ sales, expenses: [{ date: '2026-11-07', amount: 700, description: 'Airtime', categoryId: 'x' }], label: '2026-11-07' });
check('sheets: summary, sales, by medicine, expenses, stock', sheets.map((s) => s.name).join('|') === 'Summary|Sales|Sales by medicine|Expenses|Expiring|Low stock');
check('figures: sales, profit, net', figures.total === 3000 && figures.profit === 2000 && figures.net === 1300, JSON.stringify([figures.total, figures.profit, figures.net]));
check('by medicine: quantity, sales, profit', JSON.stringify(sheets[2].rows) === JSON.stringify([{ medicine: 'Paracetamol 500mg', quantity: 10, sales: 3000, cost: 1000, profit: 2000 }]));
const book = xlsx([...sheets, { name: 'Risky', rows: [{ text: '=1+1' }] }]);
const str = new TextDecoder('latin1').decode(book);
check('a zip with one worksheet per sheet', book[0] === 0x50 && book[1] === 0x4b && str.includes('xl/worksheets/sheet7.xml') && !str.includes('sheet8.xml'));
check('numbers stay numbers; formulas stay text', str.includes('<c r="I2" s="2"><v>3000</v></c>') && str.includes("<t xml:space=\"preserve\">'=1+1</t>"));

// the cloud: who may keep schedules, preview and "send now"
let [s, j] = await call('/api/owner/tenants', { auth: ownerKey, body: { name: 'Report Sample Pharmacy', admin: { name: 'Ann Admin', email: 'ann@reports.rx', password: 'ann-pass-1234' } } });
const tid = j.tenant?.id;
await call(`/api/owner/tenants/${tid}/users`, { auth: ownerKey, body: { user: { name: 'Cal Cashier', email: 'cal@reports.rx', role: 'cashier', password: 'cal-pass-1234' } } });
[s, j] = await call('/api/login', { body: { email: 'ann@reports.rx', password: 'ann-pass-1234' } });
const admin = j.token;
[s, j] = await call('/api/login', { body: { email: 'cal@reports.rx', password: 'cal-pass-1234' } });
const cashier = j.token;
const schedule = { id: 'rs1', name: 'Daily sales', emails: 'owner@example.com, not-an-email', frequency: 'daily', reports: ['summary', 'sales'], active: true };
[s, j] = await sync(cashier, [{ t: 'reportSchedules', id: 'rs-cal', rec: { ...schedule, id: 'rs-cal' }, at: at() }]);
check('a cashier cannot set up report emails', j.refused === 1 && j.applied === 0);
const today = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
[s, j] = await sync(admin, [{ t: 'reportSchedules', id: 'rs1', rec: schedule, at: at() },
  { t: 'sales', id: 's1', rec: { ...sales[0], date: new Date().toISOString() }, at: at() }, { t: 'expenses', id: 'e1', rec: { date: today, amount: 700, description: 'Airtime' }, at: at() }]);
check('an administrator saves a schedule', j.applied === 3 && j.refused === 0, JSON.stringify({ a: j.applied, r: j.refused }));
[s, j] = await call('/api/reports/send?id=rs1', { auth: cashier });
check('a cashier cannot send one', s === 403);
[s, j] = await call('/api/reports/send?id=rs1', { auth: admin });
check('preview: only the valid address, the chosen sheets, today\'s sale', s === 200 && j.to.join() === 'owner@example.com' && j.sheets.map((x) => x.name).join() === 'Summary,Sales' && j.sheets[1].rows === 1 && j.file.endsWith('.xlsx'), JSON.stringify(j));
[s, j] = await call('/api/reports/send', { auth: admin, body: { id: 'rs1' } });
check('send now without an email account says so', s === 200 && j.sent === 0 && j.error === 'email not set up', JSON.stringify(j));
[s, j] = await call('/api/reports/send?id=nope', { auth: admin });
check('an unknown schedule → 404', s === 404);
await call(`/api/owner/tenants/${tid}/delete`, { auth: ownerKey, body: { confirm: 'report-sample-pharmacy' } });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

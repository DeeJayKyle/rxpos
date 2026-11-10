// Sale checks end to end (workplan step 3): the cloud keeps every sale, records findings next to it, shows them only
// to roles with the audit log, and an admin marks them checked on the dashboard. The till's discount box follows
// "Give discounts". Fictional data only.   node v56-sale-checks.mjs <base> <ownerKey>
import puppeteer from 'puppeteer-core';
import { CHROME } from './chrome.mjs';
const [base, ownerKey] = process.argv.slice(2);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + String(x).slice(0, 200) : ''}`); };
const owner = (p, body) => fetch(base + '/api/owner' + p, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ownerKey }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());
const api = (p, body, token) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, ...(await r.json().catch(() => ({}))) }));
let n = 0;
const at = () => new Date(Date.now() + n++).toISOString();
const push = (token, changes, deviceId = 'dev-' + Math.random().toString(36).slice(2)) => api('/api/sync', { v: 2, deviceId, since: 0, changes: changes.map((c) => ({ op: crypto.randomUUID(), at: at(), ...c })) }, token);
const until = async (p, fn, ms = 20000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await p.evaluate(fn).catch(() => false)) return true; await wait(300); } return false; };

const t = await owner('/tenants', { name: 'Checks Pharmacy', admin: { name: 'Ann Admin', email: 'ann@chk.rx', password: 'ann-pass-1234' } });
const tid = t.tenant.id, slug = t.tenant.slug;
await owner('/tenants/' + tid, { features: { catalog: false } });
await owner('/tenants/' + tid + '/records', { records: [
  { t: 'products', id: 'p1', rec: { name: 'Check Tabs 500mg', form: 'Tablets', unit: 'Tablet', price: 1000, cost: 400, reorder: 0, updatedAt: '2026-01-01T00:00:00.000Z' } },
  { t: 'batches', id: 'b1', rec: { productId: 'p1', batch: 'C1', expiry: '2030-01-01', cost: 400 } },
  { t: 'movements', id: 'm1', rec: { productId: 'p1', qty: 100, type: 'Opening stock', batchId: 'b1', branchId: 'main', date: new Date().toISOString() } },
] });
await owner('/tenants/' + tid + '/users', { user: { name: 'Cid Cashier', email: 'cid@chk.rx', role: 'cashier', password: 'cid-pass-1234' } });
const login = async (email) => (await api('/api/login', { email, password: email.split('@')[0] + '-pass-1234', tenant: slug })).token;
const [annTok, cidTok] = [await login('ann@chk.rx'), await login('cid@chk.rx')];

const sale = { number: 'R-CHK', date: new Date().toISOString(), type: 'retail', branchId: 'main', cashier: 'Cid Cashier', items: [{ id: 'p1', name: 'Check Tabs 500mg', qty: 2, price: 1000 }], subtotal: 2000, discount: 0, tax: 0, total: 2000, paid: 2000, payment: 'Cash', customerId: 'walk-in', status: 'completed' };
const findings = async () => (await owner(`/tenants/${tid}/records?t=anomalies`)).rows?.map((r) => r.rec) || [];

// a cashier's sale with a discount, one below price and one whose total doesn't add up: all kept, all flagged
let r = await push(cidTok, [
  { t: 'sales', id: 'ok', rec: { ...sale, id: 'ok', number: 'R-OK' } },
  { t: 'sales', id: 'd1', rec: { ...sale, id: 'd1', number: 'R-DISC', discount: 300, total: 1700, paid: 1700 } },
  { t: 'sales', id: 'c1', rec: { ...sale, id: 'c1', number: 'R-CHEAP', items: [{ id: 'p1', name: 'Check Tabs 500mg', qty: 2, price: 100 }], subtotal: 200, total: 200, paid: 200 } },
  { t: 'sales', id: 'x1', rec: { ...sale, id: 'x1', number: 'R-SUM', total: 50, paid: 50 } },
  { t: 'sales', id: 'pf', rec: { ...sale, id: 'pf', number: 'R-PF', discount: 300, total: 1700, paid: 1700, proformaId: 'pf-1' } },
]);
check('every sale is kept (none refused)', r.applied === 5 && r.refused === 0, JSON.stringify({ applied: r.applied, refused: r.refused }));
let f = await findings();
const byNum = (num) => f.filter((x) => x.saleNumber === num).map((x) => x.kind).join(',');
check('a correct sale has no finding', byNum('R-OK') === '');
check('a cashier\'s discount is flagged', byNum('R-DISC') === 'discount', byNum('R-DISC'));
check('a sale below the medicine\'s price is flagged', byNum('R-CHEAP') === 'price', byNum('R-CHEAP'));
check('a total that doesn\'t add up is flagged', byNum('R-SUM') === 'totals', byNum('R-SUM'));
check('a discount carried from a proforma is not flagged', byNum('R-PF') === '');
check('each finding names the cashier', f.every((x) => x.cashier === 'Cid Cashier'));

r = await push(cidTok, [{ t: 'sales', id: 'd1', rec: { ...sale, id: 'd1', number: 'R-DISC', discount: 300, total: 1700, paid: 1700, receiptSent: true } }]);
check('a re-send adds no second finding', (await findings()).length === f.length);

// who receives the findings
const pulled = async (tok) => (await push(tok, [])).changes?.filter((c) => c.t === 'anomalies').length || 0;
check('the cashier does not receive the findings', (await pulled(cidTok)) === 0);
check('the admin receives them', (await pulled(annTok)) === 3);
r = await push(cidTok, [{ t: 'anomalies', id: f[0].id, rec: { ...f[0], reviewed: true } }]);
check('a cashier cannot mark a finding checked', r.refused === 1);
check('the owner console counts 3 to check', (await owner('/tenants')).tenants.find((x) => x.id === tid)?.stats.anomalies === 3);

// on screen: the admin's dashboard lists them and "Checked" clears one; the cashier's discount box is locked
const b = await puppeteer.launch({ executablePath: CHROME, headless: true });
const signIn = async (email) => {
  const p = await (await b.createBrowserContext()).newPage();
  await p.setViewport({ width: 1366, height: 900 });
  p.on('dialog', (d) => d.dismiss().catch(() => {}));
  await p.goto(base + '/' + slug, { waitUntil: 'networkidle2' }); await wait(600);
  await p.evaluate(() => { for (const id of ['pos', 'dashboard']) localStorage.setItem('rxpos-tip:' + id, '1'); });
  await p.type('input[autocomplete=username]', email); await p.type('input[type=password]', email.split('@')[0] + '-pass-1234');
  await p.evaluate(() => [...document.querySelectorAll('form button')].find((x) => /^Sign in/.test(x.textContent.trim()))?.click());
  await p.waitForSelector('.sidebar', { timeout: 20000 });
  await until(p, () => /Synced/.test(document.querySelector('.pill.clock .clock-state')?.innerText || ''), 30000);
  return p;
};
const ann = await signIn('ann@chk.rx');
await ann.evaluate(() => { location.hash = '#/'; }); await wait(1200);
check('the admin\'s dashboard shows "Sales to check" with 3', await until(ann, () => /Sales to check\s*3/.test(document.querySelector('.sale-checks')?.innerText || ''), 10000),
  await ann.evaluate(() => document.querySelector('.sale-checks')?.innerText.slice(0, 120) || 'no card'));
check('…naming the sale and what was found', await ann.evaluate(() => /R-DISC/.test(document.querySelector('.sale-checks').innerText) && /Discount without permission/.test(document.querySelector('.sale-checks').innerText)));
await ann.evaluate(() => [...document.querySelectorAll('.sale-checks button')].find((x) => x.textContent.trim() === 'Checked').click());
check('"Checked" leaves 2', await until(ann, () => /Sales to check\s*2/.test(document.querySelector('.sale-checks')?.innerText || ''), 8000));
check('…and syncs: the owner console counts 2', await (async () => { for (let i = 0; i < 30; i++) { if ((await owner('/tenants')).tenants.find((x) => x.id === tid)?.stats.anomalies === 2) return true; await wait(500); } return false; })());
check('…and the audit log records who checked it', (await owner(`/tenants/${tid}/records?t=audit`)).rows?.some((x) => x.rec?.action === 'Sale check reviewed'));

const cid = await signIn('cid@chk.rx');
await cid.evaluate(() => { location.hash = '#/'; }); await wait(1200);
check('the cashier\'s dashboard has no "Sales to check"', !(await cid.evaluate(() => !!document.querySelector('.sale-checks'))));
await cid.evaluate(() => { location.hash = '#/pos'; }); await wait(1200);
check('the cashier\'s discount box is locked (no "Give discounts")', await cid.evaluate(() => document.querySelector('input[aria-label=Discount]')?.disabled === true));
await b.close();

await owner('/tenants/' + tid + '/delete', { confirm: slug });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

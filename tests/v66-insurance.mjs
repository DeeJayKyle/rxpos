// Step 22: insurance. An insurer's scheme splits a sale at the till (the client pays the co-pay, the insurer owes the
// rest, capped by the scheme's cover limit), the insurer's share is not the client's debt, the Insurers page shows what
// each insurer owes and records its payment, and the cloud flags a split that doesn't add up. Fictional data only.
//   node v66-insurance.mjs <base> <ownerKey>
import puppeteer from 'puppeteer-core';
import { CHROME } from './chrome.mjs';
const [base, ownerKey] = process.argv.slice(2);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + String(x).slice(0, 300) : ''}`); };
const owner = (p, body) => fetch(base + '/api/owner' + p, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ownerKey }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());
const api = (p, body, token) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, ...(await r.json().catch(() => ({}))) }));
const until = async (p, fn, ms = 20000, arg) => { const end = Date.now() + ms; while (Date.now() < end) { if (await p.evaluate(fn, arg).catch(() => false)) return true; await wait(300); } return false; };
const push = (tok, changes) => api('/api/sync', { v: 2, deviceId: 'dev-' + Math.random().toString(36).slice(2), since: 0, changes: changes.map((c) => ({ op: crypto.randomUUID(), at: new Date().toISOString(), ...c })) }, tok);
const recs = async (tid, t) => ((await owner(`/tenants/${tid}/records?t=${t}`)).rows || []).map((x) => x.rec);

const T = await owner('/tenants', { name: 'Cover Pharmacy', admin: { name: 'Ari Admin', email: 'ari@cover.rx', password: 'ari-pass-1234' } });
const tid = T.tenant.id, slug = T.tenant.slug;
await owner('/tenants/' + tid, { features: { catalog: false } });
await owner('/tenants/' + tid + '/records', { records: [
  { t: 'products', id: 'p1', rec: { name: 'Cover Tabs', price: 1000, cost: 400, reorder: 0 } },
  { t: 'batches', id: 'b1', rec: { productId: 'p1', batch: 'C1', expiry: '2030-01-01', cost: 400 } },
  { t: 'movements', id: 'm1', rec: { productId: 'p1', qty: 100, type: 'Opening stock', batchId: 'b1', branchId: 'main', date: new Date().toISOString() } },
  { t: 'customers', id: 'c1', rec: { name: 'Grace Achieng', phone: '0772555111', insuranceNo: 'JB-77' } },
  // 10% co-pay, the insurer covers at most 1,500 per sale
  { t: 'insurers', id: 'i1', rec: { name: 'Jubilee Health', schemes: [{ id: 'gold', name: 'Gold', copayPct: 10, copayFixed: 0, limit: 1500 }] } },
] });
const ari = (await api('/api/login', { email: 'ari@cover.rx', password: 'ari-pass-1234', tenant: slug })).token;

// the cloud: a split that comes to more than the sale is flagged
const sale = (id, number, paid, share) => ({ id, number, date: new Date().toISOString(), type: 'retail', branchId: 'main', cashier: 'Ari Admin', items: [{ id: 'p1', name: 'Cover Tabs', qty: 2, price: 1000 }], subtotal: 2000, discount: 0, tax: 0, total: 2000, paid, payment: 'Cash', customerId: 'c1', customerName: 'Grace Achieng', status: 'completed', insurance: { insurerId: 'i1', insurer: 'Jubilee Health', schemeId: 'gold', scheme: 'Gold', memberNo: 'JB-77', share } });
let r = await push(ari, [{ t: 'sales', id: 'bad', rec: sale('bad', 'R-BAD', 500, 1800) }]);
const f = await recs(tid, 'anomalies');
check('the cloud keeps the sale but flags an insurance split above the total', r.applied === 1 && f.some((x) => x.saleNumber === 'R-BAD' && x.kind === 'insurance' && /Jubilee Health is billed 1,800/.test(x.detail)), JSON.stringify(f.map((x) => [x.saleNumber, x.kind])));
await push(ari, [{ t: 'sales', id: 'bad', deleted: true }]);

const b = await puppeteer.launch({ executablePath: CHROME, headless: true });
const p = await (await b.createBrowserContext()).newPage();
await p.setViewport({ width: 1366, height: 900 });
p.on('dialog', (d) => d.dismiss().catch(() => {}));
await p.goto(base + '/' + slug, { waitUntil: 'networkidle2' }); await wait(600);
await p.evaluate(() => { for (const id of ['pos', 'dashboard', 'insurers', 'debtors']) localStorage.setItem('rxpos-tip:' + id, '1'); });
await p.type('input[autocomplete=username]', 'ari@cover.rx'); await p.type('input[type=password]', 'ari-pass-1234');
await p.evaluate(() => [...document.querySelectorAll('form button')].find((x) => /^Sign in/.test(x.textContent.trim()))?.click());
await p.waitForSelector('.sidebar', { timeout: 20000 });
await until(p, () => /Synced/.test(document.querySelector('.pill.clock .clock-state')?.innerText || ''), 30000);
const go = async (h) => { await p.evaluate((x) => { location.hash = x; }, h); await wait(1200); };
const setInput = (sel, v) => p.evaluate((s, val) => { const i = document.querySelector(s); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, val); i.dispatchEvent(new Event('input', { bubbles: true })); }, sel, v);
const body = () => p.evaluate(() => document.body.innerText);
const synced = () => until(p, () => /^Synced/.test(document.querySelector('.pill.clock .clock-state')?.innerText || ''), 20000);

// the till: Grace, 2 × 1,000, Jubilee Gold: 10% would leave the insurer 1,800, above its 1,500 cover: the client pays 500
await go('#/pos');
const ring = async () => {
  await setInput('.search-row input', 'Cover Tabs'); await wait(300);
  await p.evaluate(() => document.querySelector('.product')?.click()); await wait(200);
  await p.evaluate(() => document.querySelector('.product')?.click()); await wait(200);
};
await ring();
await p.select('select[aria-label="Insurance scheme"]', 'i1|gold'); await wait(300);
await p.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F9', bubbles: true }))); await wait(500);
check('an insured sale needs a registered client', /Choose the insured client/.test(await body()));
await p.evaluate(() => document.querySelectorAll('.toast button').forEach((x) => x.click()));
await setInput('input[aria-label="Find client"]', 'Grace'); await wait(500);
await p.evaluate(() => [...document.querySelectorAll('[role=option]')].find((x) => /Grace Achieng/.test(x.innerText))?.click()); await wait(300);
await p.select('select[aria-label="Insurance scheme"]', ''); await wait(200);
await p.select('select[aria-label="Insurance scheme"]', 'i1|gold'); await wait(300);
check('the member number comes from the client', (await p.$eval('input[aria-label="Member number"]', (i) => i.value)) === 'JB-77');
const t = await body();
check('the split is shown: Jubilee pays 1,500, the client 500', /Jubilee Health pays\s*−\s*UGX\s*1,500/.test(t) && /Client pays\s*UGX\s*500/.test(t) && /Charge\s*UGX\s*500/.test(t), t.match(/Total[\s\S]{0,200}/)?.[0]);
await p.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F9', bubbles: true })));
check('the sale completes', await until(p, () => /Sale complete/.test(document.querySelector('.modal')?.innerText || ''), 6000));
check('the receipt names the insurer and the member', /Jubilee Health \(Gold\)[\s\S]{0,40}1,500/.test(await p.evaluate(() => document.querySelector('.modal')?.innerText || '')) && /Member no\. JB-77/.test(await p.evaluate(() => document.querySelector('.modal')?.innerText || '')));
await p.keyboard.press('Escape'); await wait(300);
await synced();
const s = (await recs(tid, 'sales')).find((x) => x.insurance && x.number !== 'R-BAD');
check('saved: total 2,000, paid 500, the insurer billed 1,500', s && s.total === 2000 && s.paid === 500 && s.insurance.share === 1500 && s.insurance.memberNo === 'JB-77' && s.customerId === 'c1', JSON.stringify(s && { total: s.total, paid: s.paid, insurance: s.insurance }));
check('no finding for a correct insured sale', !(await recs(tid, 'anomalies')).some((x) => x.saleId === s?.id || x.saleNumber === s?.number));

// the insurer's share is not Grace's debt
await go('#/debtors');
check('Grace owes nothing (Debtors)', !/Grace Achieng/.test(await body()) && /No outstanding balances/.test(await body()));

// Insurers: Jubilee owes 1,500; its payment clears it and goes into the cash book as money in
await go('#/insurers');
check('Jubilee owes 1,500 and its sale is listed', /Jubilee Health[\s\S]*1,500/.test(await body()) && /JB-77/.test(await body()));
await p.evaluate(() => [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Receive payment')?.click()); await wait(400);
await p.evaluate(() => [...document.querySelectorAll('.modal button')].find((x) => /Record payment/.test(x.textContent))?.click()); await wait(800);
check('after its payment Jubilee owes nothing', await until(p, () => ![...document.querySelectorAll('button')].some((x) => x.textContent.trim() === 'Receive payment'), 4000));
await synced();
const pay = (await recs(tid, 'payments'))[0];
check('the payment is saved as from the insurer', pay?.kind === 'insurer' && pay?.partyId === 'i1' && pay?.amount === 1500, JSON.stringify(pay));
await go('#/cash-book');
check('the cash book shows it as money in', /Payment from Jubilee Health/.test(await body()));

// a new insurer with a scheme, from the page
await go('#/insurers');
await p.evaluate(() => [...document.querySelectorAll('button')].find((x) => /Add insurer/.test(x.textContent))?.click()); await wait(300);
await setInput('input[aria-label="Insurer name"]', 'Sanlam Care');
await setInput('input[aria-label="Scheme name"]', 'Corporate');
await setInput('input[aria-label="Fixed co-pay"]', '2000');
await p.evaluate(() => [...document.querySelectorAll('.modal button')].find((x) => x.textContent.trim() === 'Save')?.click()); await wait(800);
await synced();
const sc = (await recs(tid, 'insurers')).find((x) => x.name === 'Sanlam Care');
check('an insurer and its scheme are saved', sc?.schemes?.length === 1 && sc.schemes[0].name === 'Corporate' && sc.schemes[0].copayFixed === 2000 && sc.schemes[0].copayPct === 10, JSON.stringify(sc));
check('…and recorded in the audit log', (await recs(tid, 'audit')).some((x) => x.action === 'Insurer added' && /Sanlam Care: Corporate/.test(x.details || x.detail || '')));

await b.close();
await owner('/tenants/' + tid + '/delete', { confirm: slug });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

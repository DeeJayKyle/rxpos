// Document numbers end to end (workplan step 7): till numbers from the cloud, receipts counting up in the app, the
// count saved with the sale and synced, and the branch code from the owner console. Fictional data only.
//   node v59-doc-numbers.mjs <base> <ownerKey>
import puppeteer from 'puppeteer-core';
import { CHROME } from './chrome.mjs';
const [base, ownerKey] = process.argv.slice(2);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + String(x).slice(0, 200) : ''}`); };
const owner = (p, body) => fetch(base + '/api/owner' + p, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ownerKey }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());
const api = (p, body, token) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, ...(await r.json().catch(() => ({}))) }));
const until = async (p, fn, ms = 20000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await p.evaluate(fn).catch(() => false)) return true; await wait(300); } return false; };

const t = await owner('/tenants', { name: 'Numbers Pharmacy', admin: { name: 'Nia Admin', email: 'nia@num.rx', password: 'nia-pass-1234' } });
const tid = t.tenant.id, slug = t.tenant.slug;
await owner('/tenants/' + tid, { features: { catalog: false } });
await owner('/tenants/' + tid + '/records', { records: [
  { t: 'products', id: 'p1', rec: { name: 'Number Tabs 500mg', form: 'Tablets', unit: 'Tablet', price: 500, cost: 300, reorder: 0 } },
  { t: 'batches', id: 'b1', rec: { productId: 'p1', batch: 'N1', expiry: '2030-01-01', cost: 300 } },
  { t: 'movements', id: 'm1', rec: { productId: 'p1', qty: 100, type: 'Opening stock', batchId: 'b1', branchId: 'main', date: new Date().toISOString() } },
] });
const token = (await api('/api/login', { email: 'nia@num.rx', password: 'nia-pass-1234', tenant: slug })).token;

// till numbers
const a1 = await api('/api/till', { deviceId: 'dev-a' }, token), a2 = await api('/api/till', { deviceId: 'dev-a' }, token), b1 = await api('/api/till', { deviceId: 'dev-b' }, token);
check('a device gets a till number', a1.till >= 1, JSON.stringify(a1));
check('…the same one when it asks again', a2.till === a1.till);
check('another device gets another', b1.till > 0 && b1.till !== a1.till, JSON.stringify(b1));
check('only a signed-in device gets one', (await api('/api/till', { deviceId: 'dev-c' })).status === 401);

// receipts in the app
const b = await puppeteer.launch({ executablePath: CHROME, headless: true });
const p = await (await b.createBrowserContext()).newPage();
await p.setViewport({ width: 1366, height: 900 });
p.on('dialog', (d) => d.dismiss().catch(() => {}));
await p.goto(base + '/' + slug, { waitUntil: 'networkidle2' }); await wait(600);
await p.evaluate(() => { for (const id of ['pos', 'dashboard']) localStorage.setItem('rxpos-tip:' + id, '1'); });
await p.type('input[autocomplete=username]', 'nia@num.rx'); await p.type('input[type=password]', 'nia-pass-1234');
await p.evaluate(() => [...document.querySelectorAll('form button')].find((x) => /^Sign in/.test(x.textContent.trim()))?.click());
await p.waitForSelector('.sidebar', { timeout: 20000 });
await until(p, () => /Synced/.test(document.querySelector('.pill.clock .clock-state')?.innerText || ''), 30000);
await wait(1500); // the till number arrives right after signing in
const sell = async () => {
  await p.evaluate(() => { location.hash = '#/pos'; }); await wait(900);
  await p.evaluate(() => { const i = document.querySelector('.search-row input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, 'Number Tabs'); i.dispatchEvent(new Event('input', { bubbles: true })); }); await wait(300);
  await p.evaluate(() => document.querySelector('.product')?.click()); await wait(300);
  await p.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F9', bubbles: true })));
  await until(p, () => /Sale complete/.test(document.querySelector('.modal')?.innerText || ''), 8000);
  const n = await p.evaluate(() => document.querySelector('.modal')?.innerText.match(/\bR-[A-Z0-9]+-\d{2,}-\d{6,}\b|\bR[0-9A-Z]{7}\b/)?.[0] || null);
  await p.keyboard.press('Escape'); await wait(300);
  return n;
};
const r1 = await sell(), r2 = await sell();
const m1 = r1?.match(/^R-([A-Z0-9]+)-(\d+)-(\d+)$/), m2 = r2?.match(/^R-([A-Z0-9]+)-(\d+)-(\d+)$/);
check('the first receipt is R-<branch>-<till>-000001', !!m1 && m1[3] === '000001' && m1[1] === 'MAI', r1);
check('the next one is 000002 on the same till', !!m2 && m2[2] === m1?.[2] && m2[3] === '000002', r2);
check('the receipt number is on the sale in the cloud', await (async () => { for (let i = 0; i < 20; i++) { if ((await owner(`/tenants/${tid}/records?t=sales&q=${r2}`)).total === 1) return true; await wait(500); } return false; })());
const counter = (await owner(`/tenants/${tid}/records?t=counters`)).rows?.[0]?.rec;
check('the till\'s counter synced with the sales (R = 2)', counter?.R === 2 && String(counter?.till) === String(Number(m1?.[2])), JSON.stringify(counter));

// the owner gives the branch a code: the next receipt uses it and keeps counting
await owner(`/tenants/${tid}/branches`, { branch: { id: 'main', name: 'Main branch', code: 'kla' } });
await p.evaluate(() => window.dispatchEvent(new Event('rxpos-refresh'))); // sync now (the menu's Refresh)
await until(p, () => /Synced/.test(document.querySelector('.pill.clock .clock-state')?.innerText || ''), 15000); await wait(1000);
const r3 = await sell();
check('a branch code set by the owner is used, the count goes on', new RegExp(`^R-KLA-${m1?.[2]}-000003$`).test(r3 || ''), r3);
await b.close();

await owner('/tenants/' + tid + '/delete', { confirm: slug });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

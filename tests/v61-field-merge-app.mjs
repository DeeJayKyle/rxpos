// Field-by-field merge in the React app (workplan step 14), run as the Windows app (data kept on the device): offline,
// the price of a medicine is changed in Quick Edit; meanwhile another device changes its reorder level; when the app
// is back online both changes are in the cloud AND in the app's own copy. Fictional data only.
//   node v61-field-merge-app.mjs <base> <ownerKey>
import puppeteer from 'puppeteer-core';
import { CHROME } from './chrome.mjs';
import { asDesktopApp, APP_ARGS } from './appmode.mjs';
import { stampFields } from '../src/fieldmerge.js';
const [base, ownerKey] = process.argv.slice(2);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + String(x).slice(0, 220) : ''}`); };
const owner = (p, body) => fetch(base + '/api/owner' + p, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ownerKey }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());
const api = (p, body, token) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, ...(await r.json().catch(() => ({}))) }));
const until = async (p, fn, ms = 20000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await p.evaluate(fn).catch(() => false)) return true; await wait(300); } return false; };

const T = await owner('/tenants', { name: 'Merge App Pharmacy', admin: { name: 'Ama Admin', email: 'ama@mergeapp.rx', password: 'ama-pass-1234' } });
const tid = T.tenant.id, slug = T.tenant.slug;
await owner('/tenants/' + tid, { features: { catalog: false } });
await owner('/tenants/' + tid + '/records', { records: [
  { t: 'products', id: 'p2', rec: { name: 'Merge Syrup 100ml', form: 'Syrups', unit: 'Bottle', price: 1000, cost: 600, reorder: 10 } },
  { t: 'batches', id: 'b2', rec: { productId: 'p2', batch: 'M1', expiry: '2030-01-01', cost: 600 } },
  { t: 'movements', id: 'm2', rec: { productId: 'p2', qty: 30, type: 'Opening stock', batchId: 'b2', branchId: 'main', date: new Date().toISOString() } },
] });
const cloudP2 = async () => (await owner(`/tenants/${tid}/records?t=products`)).rows?.find((r) => r.id === 'p2')?.rec;
const deviceP2 = (p) => p.evaluate(() => new Promise((res) => { const q = indexedDB.open('pharmapos'); q.onsuccess = () => { const g = q.result.transaction('records').objectStore('records').getAll(); g.onsuccess = () => { res(g.result.filter((x) => x.t === 'products').flatMap((x) => x.rs).find((r) => r.id === 'p2') || null); q.result.close(); }; }; q.onerror = () => res(null); }));

const b = await puppeteer.launch({ executablePath: CHROME, headless: true, args: APP_ARGS });
const p = await (await b.createBrowserContext()).newPage();
await p.setViewport({ width: 1366, height: 860 });
const cloud = await asDesktopApp(p, base);
p.on('dialog', (d) => d.dismiss().catch(() => {}));
await p.goto(base + '/' + slug, { waitUntil: 'networkidle2' }); await wait(600);
await p.evaluate(() => { for (const id of ['pos', 'dashboard', 'quick-edit']) localStorage.setItem('rxpos-tip:' + id, '1'); });
await p.type('input[autocomplete=username]', 'ama@mergeapp.rx'); await p.type('input[type=password]', 'ama-pass-1234');
await p.evaluate(() => [...document.querySelectorAll('form button')].find((x) => /^Sign in/.test(x.textContent.trim()))?.click());
await p.waitForSelector('.sidebar', { timeout: 20000 });
check('the app has the medicine', await until(p, () => /Synced/.test(document.querySelector('.pill.clock .clock-state')?.innerText || ''), 30000) && (await deviceP2(p))?.price === 1000);

// offline: the price is changed here
cloud.set('down');
await p.evaluate(() => { location.hash = '#/quick-edit'; }); await wait(1200);
const priceCol = await p.evaluate(() => [...document.querySelectorAll('.page thead th')].findIndex((th) => th.textContent.trim() === 'Retail'));
await p.evaluate((col) => {
  const row = [...document.querySelectorAll('.page tbody tr')].find((tr) => /Merge Syrup/.test(tr.innerText));
  const input = row.children[col].querySelector('input');
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '1500');
  input.dispatchEvent(new Event('input', { bubbles: true }));
}, priceCol);
await wait(200);
await p.evaluate(() => [...document.querySelectorAll('button')].find((x) => /^Save 1 change/.test(x.textContent.trim()))?.click()); await wait(800);
const here = await deviceP2(p);
check('offline, the new price is saved on the device with its field times', here?.price === 1500 && !!here?._f && here._f.reorder && !here._f.price, JSON.stringify(here));

// meanwhile, another device changes the reorder level (from the cloud's copy, which still has the old price)
const tok = (await api('/api/login', { email: 'ama@mergeapp.rx', password: 'ama-pass-1234', tenant: slug })).token;
const c0 = await cloudP2();
const now = new Date().toISOString();
await api('/api/sync', { v: 2, deviceId: 'dev-other', since: 0, changes: [{ op: crypto.randomUUID(), t: 'products', id: 'p2', at: now, rec: stampFields(c0, { ...c0, reorder: 40 }, now) }] }, tok);
check('the other device\'s reorder level is in the cloud, with the old price', (await cloudP2())?.reorder === 40 && (await cloudP2())?.price === 1000);

// back online: the app sends its price and downloads the merged medicine
cloud.set('up');
await p.evaluate(() => window.dispatchEvent(new Event('rxpos-refresh')));
await until(p, () => /^Synced/.test(document.querySelector('.pill.clock .clock-state')?.innerText || ''), 30000); await wait(1500);
await p.evaluate(() => window.dispatchEvent(new Event('rxpos-refresh')));
await until(p, () => /^Synced/.test(document.querySelector('.pill.clock .clock-state')?.innerText || ''), 30000); await wait(1000);
const c1 = await cloudP2();
check('the cloud has both: the price from this app, the reorder level from the other device', c1?.price === 1500 && c1?.reorder === 40, JSON.stringify(c1));
const d1 = await deviceP2(p);
check('the app has both too', d1?.price === 1500 && d1?.reorder === 40, JSON.stringify(d1));
await b.close();

await owner('/tenants/' + tid + '/delete', { confirm: slug });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

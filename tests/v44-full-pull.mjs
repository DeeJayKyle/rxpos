// A device that is missing records the cloud has gets them back (fictional data, as the Windows app,
// tests/appmode.mjs). On 27 Oct 2026 a Windows app lacked 6 deliveries, their batches and stock movements and
// a medicine that the cloud had, while it had every sale: the cloud never sends a device the records that carry
// that device's own id, so a device that lost its own copy, or shares its id with another device, never got
// them again. A full download (FULL_PULL once after the update, or "Download everything again") includes them.
//   node v44-full-pull.mjs <base> <ownerKey>
import puppeteer from 'puppeteer-core';
import { CHROME } from './chrome.mjs';
import { asDesktopApp, APP_ARGS } from './appmode.mjs';
const [base, ownerKey] = process.argv.slice(2);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + String(x).slice(0, 240) : ''}`); };
const owner = (p, body) => fetch(base + '/api/owner' + p, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ownerKey }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());
const until = async (p, fn, ms = 20000, arg) => { const end = Date.now() + ms; while (Date.now() < end) { if (await p.evaluate(fn, arg).catch(() => false)) return true; await wait(300); } return false; };

for (const x of (await owner('/tenants')).tenants || []) if (x.name === 'Full Pull Sample Pharmacy') await owner('/tenants/' + x.id + '/delete', { confirm: x.slug });
const T = await owner('/tenants', { name: 'Full Pull Sample Pharmacy', admin: { name: 'Fay Admin', email: 'fay@test.rx', password: 'fay-pass-1234' } });
await owner('/tenants/' + T.tenant.id, { features: { catalog: false, weather: false, promos: false } });
await owner('/tenants/' + T.tenant.id + '/records', { records: [{ t: 'products', id: 'fp-base', rec: { name: 'Baseline Tabs', generic: 'Baseline', form: 'Tablets', unit: 'Tablet', price: 500, cost: 300, reorder: 0 } }] });

const b = await puppeteer.launch({ executablePath: CHROME, headless: true, args: APP_ARGS });
const p = await (await b.createBrowserContext()).newPage(); await p.setViewport({ width: 1280, height: 860 });
await asDesktopApp(p, base);
await p.goto(base + '/', { waitUntil: 'networkidle2' }); await wait(600);
await p.waitForSelector('input[type=password]', { timeout: 20000 });
await p.evaluate(() => { const set = (sel, v) => { const i = document.querySelector(sel); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, v); i.dispatchEvent(new Event('input', { bubbles: true })); }; set('input[autocomplete=username]', 'fay@test.rx'); set('input[type=password]', 'fay-pass-1234'); });
await p.evaluate(() => [...document.querySelectorAll('form button')].find((x) => /^Sign in/.test(x.textContent.trim()))?.click());
check('signed in on the app', await until(p, () => !!document.querySelector('.sidebar'), 25000));

const kv = (k) => p.evaluate((key) => new Promise((res) => { const q = indexedDB.open('pharmapos'); q.onsuccess = () => { const g = q.result.transaction('kv').objectStore('kv').get(key); g.onsuccess = () => { res(g.result); q.result.close(); }; }; }), k);
const setKv = (k, v) => p.evaluate((key, val) => new Promise((res) => { const q = indexedDB.open('pharmapos'); q.onsuccess = () => { const tx = q.result.transaction('kv', 'readwrite'); tx.objectStore('kv').put(val, key); tx.oncomplete = () => { res(true); q.result.close(); }; }; }), k, v);
const has = (id) => p.evaluate((pid) => new Promise((res) => { const q = indexedDB.open('pharmapos'); q.onsuccess = () => { const g = q.result.transaction('records').objectStore('records').getAll(); g.onsuccess = () => { res(g.result.some((x) => x.t === 'products' && x.rs.some((r) => r.id === pid))); q.result.close(); }; }; }), id);
check('the first sync of an updated app is a full one, then marked done', await until(p, () => true, 100) && (await (async () => { for (let i = 0; i < 40; i++) { const c = await kv('sync'); if (c?.fullPull >= 1 && c.lastSync) return true; await wait(500); } return false; })()));
check('…and it has the pharmacy', await has('fp-base'));

// records reach the cloud carrying this device's own id (a twin device with the same id, or a copy this device lost)
const cfg = await kv('sync');
const lose = async (id, name) => {
  const r = await fetch(cfg.url.replace(/^https:\/\/(?:www\.|api\.)?rxposug\.com/, base) + '/api/sync', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + cfg.key },
    body: JSON.stringify({ deviceId: cfg.deviceId, since: 0, v: 2, changes: [{ t: 'products', id, op: crypto.randomUUID(), at: new Date().toISOString(), rec: { id, name, generic: name, form: 'Syrups', unit: 'Bottle', price: 900, cost: 600, reorder: 0 } }] }) });
  return (await r.json()).applied;
};
check('a delivery\'s medicine reaches the cloud under this device\'s id', (await lose('fp-lost-1', 'Twin Syrup')) === 1);
await p.reload({ waitUntil: 'networkidle2' }); await wait(4000);
check('a normal sync does not deliver it (the bug as it was)', !(await has('fp-lost-1')));

// "Download everything again" on This device
await p.evaluate(() => { location.hash = '#/device'; }); await wait(1200);
const clicked = await p.evaluate(() => { const x = [...document.querySelectorAll('button')].find((e) => /Download everything again/.test(e.textContent)); x?.click(); return !!x; });
check('This device has "Download everything again"', clicked);
await wait(500);
await p.evaluate(() => [...document.querySelectorAll('.modal button, .dialog button')].find((x) => /^Download everything/.test(x.textContent.trim()))?.click());
check('…which brings the missing medicine back', await (async () => { for (let i = 0; i < 40; i++) { if (await has('fp-lost-1')) return true; await wait(500); } return false; })());
check('…without losing what the device had', await has('fp-base'));

// the automatic one-time full download after an update (FULL_PULL) does the same without anyone pressing anything
check('another one reaches the cloud under this device\'s id', (await lose('fp-lost-2', 'Twin Drops')) === 1);
await setKv('sync', { ...(await kv('sync')), fullPull: 0 });
await p.reload({ waitUntil: 'networkidle2' });
check('after an update the app downloads everything once and gets it', await (async () => { for (let i = 0; i < 40; i++) { if (await has('fp-lost-2')) return true; await wait(500); } return false; })());

await b.close();
await owner('/tenants/' + T.tenant.id + '/delete', { confirm: T.tenant.slug });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

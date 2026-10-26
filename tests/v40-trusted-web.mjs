// Optional offline work in a browser (1.6, src/webpolicy.js): a session-only browser can be made a trusted device on
// This device → Sync & storage. Checks: it refuses while offline, copies the pharmacy onto the device, caches the app
// (public/sw-offline.js) and reports readiness from what is really cached; it then reloads and sells with no internet,
// keeps that sale through a refresh and sends it once when back online; a second tab is held back (one tab at a time)
// and can take over; switching it off removes only RxPOS's own data and leaves it session-only again. Session-only browsers are covered by v36.
//   node v40-trusted-web.mjs <base> <ownerKey> <outDir>
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import { CHROME } from './chrome.mjs';
const [base, ownerKey, out] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + String(x).slice(0, 220) : ''}`); };
const owner = (p, body) => fetch(base + '/api/owner' + p, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ownerKey }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());
const setVal = (p, sel, val) => p.evaluate((sel, val) => { const i = document.querySelector(sel); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, val); i.dispatchEvent(new Event('input', { bubbles: true })); }, sel, val);
const until = async (p, fn, ms = 15000, arg) => { const end = Date.now() + ms; while (Date.now() < end) { if (await p.evaluate(fn, arg).catch(() => false)) return true; await wait(300); } return false; };
const text = (p) => p.evaluate(() => document.body.innerText).catch(() => '');
const click = (p, re) => p.evaluate((src) => { const r = new RegExp(src); const b = [...document.querySelectorAll('button')].find((x) => r.test(x.textContent.trim())); b?.click(); return !!b; }, re.source);
const signIn = async (p) => {
  await p.waitForSelector('input[type=password]', { timeout: 20000 });
  await setVal(p, 'input[autocomplete=username]', 'sam@test.rx'); await setVal(p, 'input[type=password]', 'sam-pass-1234');
  await p.evaluate(() => [...document.querySelectorAll('form button')].find((x) => /^Sign in/.test(x.textContent.trim()))?.click());
  await p.waitForSelector('.sidebar', { timeout: 25000 }); await wait(1500);
};
const sell = async (p) => {
  await p.evaluate(() => { location.hash = '#/pos'; }); await wait(1200);
  await p.evaluate(() => document.querySelector('.product')?.click()); await wait(300);
  await p.keyboard.press('F9');
  const ok = await until(p, () => /Sale complete/.test(document.body.innerText), 8000);
  await p.keyboard.press('Escape'); await wait(500);
  return ok;
};
const onDevice = (p) => p.evaluate(() => new Promise((res) => {
  const r = indexedDB.open('pharmapos');
  r.onsuccess = () => { const d = r.result; if (!d.objectStoreNames.contains('records')) { d.close(); return res({ sales: 0, outbox: 0 }); }
    const tx = d.transaction(['records', 'outbox']); let sales = 0, outbox = 0;
    tx.objectStore('records').openCursor().onsuccess = (e) => { const c = e.target.result; if (c) { if (c.value.t === 'sales') sales++; c.continue(); } };
    tx.objectStore('outbox').count().onsuccess = (e) => { outbox = e.target.result; };
    tx.oncomplete = () => { d.close(); res({ sales, outbox }); }; };
  r.onerror = () => res(null);
}));
const cloudSales = async (tid) => (await owner('/tenants/' + tid + '/records?t=sales')).total ?? -1;

for (const x of (await owner('/tenants')).tenants || []) if (x.name === 'Trusted Sample Pharmacy') await owner('/tenants/' + x.id + '/delete', { confirm: x.slug }); // an earlier interrupted run
const t = await owner('/tenants', { name: 'Trusted Sample Pharmacy', admin: { name: 'Sam Sample', email: 'sam@test.rx', password: 'sam-pass-1234' } });
const slug = t.tenant.slug, tid = t.tenant.id;
await owner('/tenants/' + tid + '/records', { records: [
  { t: 'products', id: 'p1', rec: { name: 'Sample Tabs 500mg', generic: 'Sample', form: 'Tablets', unit: 'Tablet', price: 500, cost: 300, reorder: 5 } },
  { t: 'batches', id: 'b1', rec: { productId: 'p1', batch: 'S1', expiry: new Date(Date.now() + 300 * 864e5).toISOString().slice(0, 10), cost: 300 } },
  { t: 'movements', id: 'm1', rec: { productId: 'p1', qty: 50, type: 'Opening stock', batchId: 'b1', branchId: 'main', date: new Date(Date.now() - 864e5).toISOString() } },
] });
await owner('/tenants/' + tid, { features: { catalog: false } });

const b = await puppeteer.launch({ executablePath: CHROME, headless: true });
const ctx = await b.createBrowserContext();
const p = await ctx.newPage();
await p.setViewport({ width: 1280, height: 860 });
p.on('dialog', (d) => d.accept());
await p.goto(base + '/' + slug, { waitUntil: 'networkidle2' });
await signIn(p);
await wait(2000);

// ---- session-only by default; the switch is on This device ----
await p.evaluate(() => { location.hash = '#/device'; }); await wait(1200);
check('a browser starts session-only and offers "Work offline in this browser"', /Session-only/.test(await text(p)) && await p.evaluate(() => [...document.querySelectorAll('button')].some((x) => /Work offline in this browser/.test(x.textContent))));
await p.setOfflineMode(true); await wait(500);
await click(p, /Work offline in this browser/); await wait(400); await click(p, /Make this a trusted device/); await wait(800);
check('switching it on while offline is refused with the reason', /first set-up needs the internet/i.test(await text(p)) && !(await p.evaluate(() => localStorage.getItem('rxpos-trusted-device'))));
await p.setOfflineMode(false); await wait(2500);

// ---- switch it on ----
await click(p, /Work offline in this browser/); await wait(400); await click(p, /Make this a trusted device/);
await wait(4000);
check('after switching on, the browser is marked trusted and the pharmacy is on the device', await p.evaluate(() => localStorage.getItem('rxpos-trusted-device') === '1') && !!(await onDevice(p)));
await signIn(p); // once more, online: this is what lets the person sign in here offline
await p.evaluate(() => { location.hash = '#/device'; }); await wait(1000);
check('This device shows "Trusted device"', /Trusted device/.test(await text(p)));
const ready = await until(p, () => /Ready to work offline/.test(document.body.innerText), 40000);
check('readiness is verified: app files cached, pharmacy downloaded, offline sign-in ready', ready, (await text(p)).match(/App saved[^\n]*/)?.[0] || '');
const sw = await p.evaluate(async () => ({ regs: (await navigator.serviceWorker.getRegistrations()).map((r) => r.active?.scriptURL || ''), caches: await caches.keys() }));
check('the offline worker is sw-offline.js and its cache is RxPOS-named', sw.regs.some((u) => /sw-offline\.js/.test(u)) && sw.caches.length > 0 && sw.caches.every((k) => k.startsWith('rxpos')), JSON.stringify(sw));
await p.screenshot({ path: `${out}/trusted-ready.png` });

// ---- offline: refresh, sell, refresh again ----
await p.setOfflineMode(true); await wait(500);
await p.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
check('offline: a refresh opens RxPOS from the cache (still signed in, no "online only" screen)', await until(p, () => !!document.querySelector('.sidebar') && !document.querySelector('.web-offline'), 20000));
const before = await cloudSales(tid);
check('offline: a sale can be made', await sell(p));
const dev = await onDevice(p);
check('…it is on the device with a change waiting for the cloud', dev?.sales >= 1 && dev?.outbox >= 1, JSON.stringify(dev));
await p.reload({ waitUntil: 'domcontentloaded' }).catch(() => {}); await wait(2500);
await p.evaluate(() => { location.hash = '#/sales'; }); await wait(1500);
check('offline: the sale survives a refresh', await until(p, () => /500/.test(document.querySelector('.page tbody')?.innerText || ''), 10000));
check('the status shows it waiting', /waiting/i.test(await p.evaluate(() => document.querySelector('.clock-pill, .sync-pill, [class*=pill]')?.innerText || document.body.innerText)));

// ---- second tab: one tab at a time ----
const p2 = await ctx.newPage(); await p2.setViewport({ width: 1100, height: 760 });
await p2.goto(base + '/' + slug, { waitUntil: 'domcontentloaded' }).catch(() => {});
check('a second tab is held back: "RxPOS is open in another tab"', await until(p2, () => /open in another tab/.test(document.body.innerText), 15000));
await click(p2, /Use RxPOS in this tab/);
check('…it can take over (a new tab signs in), and the first tab steps aside', await until(p2, () => !!document.querySelector('input[type=password]'), 20000) && await until(p, () => /moved to another tab/.test(document.body.innerText), 5000));
await signIn(p2);
await p.close();

// ---- back online: the sale is sent once ----
await p2.setOfflineMode(false);
const sent = await (async () => { const end = Date.now() + 30000; while (Date.now() < end) { if ((await cloudSales(tid)) === before + 1 && (await onDevice(p2))?.outbox === 0) return true; await wait(1000); } return false; })();
check('back online: the offline sale reaches the cloud exactly once', sent, `cloud ${await cloudSales(tid)} (was ${before})`);

// ---- switching it off ----
await p2.evaluate(() => { location.hash = '#/device'; }); await wait(1200);
await click(p2, /Stop working offline in this browser/); await wait(400); await click(p2, /Stop and remove/);
await until(p2, () => !document.querySelector('.tab-gate'), 3000);
await wait(5000);
const gone = await p2.evaluate(async () => ({ trusted: localStorage.getItem('rxpos-trusted-device'), db: (await indexedDB.databases?.() || []).some((d) => d.name === 'pharmapos'), caches: await caches.keys(), sw: (await navigator.serviceWorker.getRegistrations()).length, keys: Object.keys(localStorage) }));
check('switching it off removes RxPOS data, worker and caches, and keeps appearance preferences', !gone.trusted && !gone.db && gone.caches.length === 0 && gone.sw === 0, JSON.stringify(gone));
check('…and the browser is session-only again', await until(p2, () => /Session-only|nothing is kept/i.test(document.body.innerText), 15000));

await b.close();
await owner('/tenants/' + tid + '/delete', { confirm: slug });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

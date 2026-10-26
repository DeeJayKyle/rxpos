// The web version is online only and keeps nothing on the computer (src/webpolicy.js); the Windows and Android apps
// keep working offline (tests/appmode.mjs). Checks: no service worker or caches, no on-device database, only
// appearance preferences in localStorage, pages never cached, the session lasts for this tab only (a reload stays
// signed in and downloads afresh; a new tab or sign-out starts clean), offline blocks work with the reason, and
// leftovers from older versions are removed.   node v36-web-online.mjs <base> <ownerKey> <outDir>
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import { CHROME } from './chrome.mjs';
import { asDesktopApp } from './appmode.mjs';
const [base, ownerKey, out] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + String(x).slice(0, 220) : ''}`); };
const owner = (p, body) => fetch(base + '/api/owner' + p, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ownerKey }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());
const setVal = (p, sel, val) => p.evaluate((sel, val) => { const i = document.querySelector(sel); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, val); i.dispatchEvent(new Event('input', { bubbles: true })); }, sel, val);
const until = async (p, fn, ms = 15000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await p.evaluate(fn).catch(() => false)) return true; await wait(300); } return false; };

const t = await owner('/tenants', { name: 'Online Sample Pharmacy', admin: { name: 'Robin Sample', email: 'robin@test.rx', password: 'robin-pass-1234' } });
const slug = t.tenant.slug, tid = t.tenant.id;
await owner('/tenants/' + tid + '/records', { records: [
  { t: 'products', id: 'p1', rec: { name: 'Sample Tabs 500mg', generic: 'Sample', form: 'Tablets', unit: 'Tablet', price: 500, cost: 300, reorder: 5 } },
  { t: 'batches', id: 'b1', rec: { productId: 'p1', batch: 'S1', expiry: new Date(Date.now() + 300 * 864e5).toISOString().slice(0, 10), cost: 300 } },
  { t: 'movements', id: 'm1', rec: { productId: 'p1', qty: 50, type: 'Opening stock', batchId: 'b1', branchId: 'main', date: new Date(Date.now() - 864e5).toISOString() } },
] });
await owner('/tenants/' + tid, { features: { catalog: false } });

// ---- the server never lets the browser keep the app's pages ----
for (const path of ['/', '/' + slug, '/version.json', '/sw.js']) {
  const cc = (await fetch(base + path)).headers.get('cache-control') || '';
  check(`${path} is served with Cache-Control: no-store`, /no-store/.test(cc), cc);
}

const b = await puppeteer.launch({ executablePath: CHROME, headless: true });
const ctx = await b.createBrowserContext();
const p = await ctx.newPage();
await p.setViewport({ width: 1280, height: 860 });

// leftovers from an older version: an offline service worker, its cache, the on-device database and saved items
await p.goto(base + '/' + slug, { waitUntil: 'networkidle2' }); await wait(800);
await p.evaluate(async () => {
  await caches.open('rxpos-v2').then((c) => c.put('/old', new Response('old')));
  await new Promise((res) => { const r = indexedDB.open('pharmapos', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => { r.result.close(); res(); }; r.onerror = res; });
  localStorage.setItem('rxpos-offline-v1', '{"x":{"pw":"old"}}'); localStorage.setItem('rxpos-pos:x:main:retail', '{"held":[1]}'); localStorage.setItem('pharmapos-theme', 'hybrid-dark');
  document.cookie = 'old=1; path=/';
});
await p.reload({ waitUntil: 'networkidle2' }); await wait(1500);
const left = await p.evaluate(async () => ({ caches: (await caches.keys()).length, db: (await indexedDB.databases?.() || []).some((d) => d.name === 'pharmapos'), keys: Object.keys(window.localStorage), sw: (await navigator.serviceWorker?.getRegistrations?.() || []).length, cookie: document.cookie }));
check('older leftovers are removed: caches, on-device database, service worker, cookies', left.caches === 0 && !left.db && left.sw === 0 && !left.cookie, JSON.stringify(left));
check('…saved data is removed, appearance preferences are kept', !left.keys.includes('rxpos-offline-v1') && !left.keys.some((k) => k.startsWith('rxpos-pos:')) && left.keys.includes('pharmapos-theme'), left.keys.join(','));

// ---- sign in and make a sale ----
check('sign-in screen offers no "Remember me" and says nothing is kept', await p.evaluate(() => !document.querySelector('.remember-row input[type=checkbox]') && /nothing is kept/i.test(document.body.innerText)));
await setVal(p, 'input[autocomplete=username]', 'robin@test.rx'); await setVal(p, 'input[type=password]', 'robin-pass-1234');
await p.evaluate(() => [...document.querySelectorAll('form button')].find((x) => /^Sign in/.test(x.textContent.trim()))?.click());
await p.waitForSelector('.sidebar', { timeout: 20000 }); await wait(2500);
check('no quick-PIN button on the web', await p.evaluate(() => !document.querySelector('.user-box button[title*="PIN"]')));
await p.evaluate(() => { location.hash = '#/pos'; }); await wait(1200);
await p.evaluate(() => document.querySelector('.product')?.click()); await wait(300);
await p.keyboard.press('F9'); await wait(1500);
check('a sale can be made', await until(p, () => /Sale complete/.test(document.body.innerText), 8000));
await p.keyboard.press('Escape'); await wait(2500); // let it reach the cloud
const sales = (await owner('/tenants/' + tid + '/records?table=sales').catch(() => null));
const stored = await p.evaluate(async () => ({ db: (await indexedDB.databases?.() || []).map((d) => d.name), keys: Object.keys(window.localStorage), caches: (await caches.keys()).length }));
check('after working: no on-device database and no caches', !stored.db.includes('pharmapos') && stored.caches === 0, JSON.stringify(stored));
check('after working: localStorage holds appearance preferences only', stored.keys.every((k) => /^(pharmapos-theme|rxpos-theme-mode|rxpos-accent|rxpos-surface-style|rxpos-rail|pharmapos-nav|rxpos-tip:|rxpos-device|rxpos-sound|rxpos-pos-favs:|rxpos-weekly-|rxpos-announced)/.test(k)), stored.keys.join(','));

// ---- the session is this tab only ----
await p.reload({ waitUntil: 'networkidle2' });
check('a reload in the same tab stays signed in', await until(p, () => !!document.querySelector('.sidebar'), 15000));
await p.evaluate(() => { location.hash = '#/sales'; }); await wait(2500);
check('…and downloads the pharmacy afresh from the cloud (the sale is there)', await until(p, () => document.querySelectorAll('.page tbody tr').length >= 1 && /500/.test(document.querySelector('.page tbody')?.innerText || ''), 15000));
const p2 = await ctx.newPage(); await p2.goto(base + '/' + slug, { waitUntil: 'networkidle2' }); await wait(1500);
check('a new tab is not signed in (nothing was kept)', await p2.evaluate(() => !document.querySelector('.sidebar') && !!document.querySelector('input[type=password]')));
await p2.close();

// ---- offline: work stops with the reason, and resumes when back ----
await p.setOfflineMode(true); await wait(800);
check('offline: a screen explains the web version is online only', await until(p, () => !!document.querySelector('.web-offline') && /online only/.test(document.querySelector('.web-offline').innerText), 5000));
await p.screenshot({ path: `${out}/web-offline.png` });
await p.setOfflineMode(false); await wait(800);
check('back online: the screen goes away', await until(p, () => !document.querySelector('.web-offline'), 5000));

// ---- signing out clears everything ----
await p.evaluate(() => document.querySelector('button[title="Log out"]')?.click());
await p.waitForSelector('input[type=password]', { timeout: 15000 }); await wait(1000);
const after = await p.evaluate(() => ({ session: window.sessionStorage.length, keys: Object.keys(window.localStorage) }));
check('sign-out clears this tab and keeps only appearance preferences', after.session === 0 && after.keys.every((k) => /^(pharmapos-theme|rxpos-theme-mode|rxpos-accent|rxpos-surface-style|rxpos-rail|pharmapos-nav|rxpos-tip:|rxpos-device|rxpos-sound|rxpos-pos-favs:|rxpos-weekly-|rxpos-announced)/.test(k)), JSON.stringify(after));

// ---- the Windows app still keeps the pharmacy for offline work ----
const a = await ctx.newPage(); await a.setViewport({ width: 1280, height: 860 }); await asDesktopApp(a, base);
await a.goto(base + '/' + slug, { waitUntil: 'networkidle2' }); await wait(800);
await setVal(a, 'input[autocomplete=username]', 'robin@test.rx'); await setVal(a, 'input[type=password]', 'robin-pass-1234');
await a.evaluate(() => [...document.querySelectorAll('form button')].find((x) => /^Sign in/.test(x.textContent.trim()))?.click());
await a.waitForSelector('.sidebar', { timeout: 20000 }); await wait(3000);
check('Windows app: keeps the pharmacy on the device for offline work', await a.evaluate(async () => (await indexedDB.databases?.() || []).some((d) => d.name === 'pharmapos')));
check('Windows app: no "online only" screen when offline', await (async () => { await a.setOfflineMode(true); await wait(800); const ok = await a.evaluate(() => !document.querySelector('.web-offline') && !!document.querySelector('.sidebar')); await a.setOfflineMode(false); return ok; })());

await b.close();
await owner('/tenants/' + tid + '/delete', { confirm: slug });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

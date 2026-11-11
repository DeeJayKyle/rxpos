// Representative timings for the workflows that matter at the till, on synthetic (fictional) data, run as the Windows
// app (data kept on the device; tests/appmode.mjs). Not part of `npm test`: run with `npm run bench`.
//   node bench.mjs <base> <ownerKey> <outDir>
// Each figure is the median of several runs in one headless Chromium on this machine, so compare runs on the same
// machine only. Writes <outDir>/bench.json.
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CHROME } from './chrome.mjs';
import { asDesktopApp, APP_ARGS } from './appmode.mjs';
const [base, ownerKey, out] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const owner = (p, body) => fetch(base + '/api/owner' + p, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ownerKey }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const median = (a) => { const s = [...a].sort((x, y) => x - y); return Math.round(s[Math.floor(s.length / 2)]); };
const iso = (n) => new Date(Date.now() - n * 864e5).toISOString();
const day = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

const SIZES = { small: { products: 300, sales: 1000, catalog: false }, large: { products: 2000, sales: 15000, catalog: true },
  // faster sync (docs/SYNC-SPEED-PLAN.md): a pharmacy several years old, about 200,000 records; only with BENCH_SIZES=xlarge
  xlarge: { products: 5000, sales: 60000, catalog: true, only: true } };
const only = process.env.BENCH_SIZES ? process.env.BENCH_SIZES.split(',') : Object.keys(SIZES).filter((k) => !SIZES[k].only);

async function seed(size) {
  const cfg = SIZES[size];
  const t = await owner('/tenants', { name: `Bench ${size} Pharmacy`, admin: { name: 'Bench User', email: `bench-${size}@test.rx`, password: 'bench-pass-1234' } });
  const tid = t.tenant.id, slug = t.tenant.slug;
  const recs = [];
  for (let i = 0; i < cfg.products; i++) {
    recs.push({ t: 'products', id: 'p' + i, rec: { name: `Sample Medicine ${i} ${['500mg', '250mg', '10mg', '100ml'][i % 4]}`, generic: `Generic ${i % 300}`, form: ['Tablets', 'Capsules', 'Syrups'][i % 3], unit: 'Tablet', price: 100 + (i % 50) * 50, cost: 60 + (i % 50) * 30, reorder: 10, barcode: '7' + String(i).padStart(9, '0'), category: ['Analgesics', 'Antibiotics', 'Vitamins'][i % 3] } });
    recs.push({ t: 'batches', id: 'b' + i, rec: { productId: 'p' + i, batch: 'B' + i, expiry: day(30 + (i % 600)), cost: 60 + (i % 50) * 30 } });
    recs.push({ t: 'movements', id: 'm' + i, rec: { productId: 'p' + i, qty: 100000, type: 'Opening stock', batchId: 'b' + i, branchId: 'main', date: iso(400) } });
  }
  for (let i = 0; i < cfg.sales; i++) {
    const a = i % cfg.products, b2 = (i * 7) % cfg.products;
    const items = [a, b2].map((k) => ({ id: 'p' + k, name: `Sample Medicine ${k}`, qty: 1 + (i % 3), price: 100 + (k % 50) * 50, cost: 60 + (k % 50) * 30, alloc: [{ batchId: 'b' + k, qty: 1 + (i % 3) }] }));
    const total = items.reduce((s, x) => s + x.qty * x.price, 0);
    recs.push({ t: 'sales', id: 's' + i, rec: { number: 'R' + i, date: iso((i / cfg.sales) * 360), type: 'retail', branchId: 'main', items, subtotal: total, discount: 0, tax: 0, total, payment: 'Cash', paid: total, customerId: 'walk-in', customerName: 'Walk-in Customer', cashier: 'Bench User', status: 'completed' } });
    items.forEach((x, j) => recs.push({ t: 'movements', id: `sm${i}-${j}`, rec: { productId: x.id, qty: -x.qty, type: 'Sale', ref: 'R' + i, batchId: x.alloc[0].batchId, branchId: 'main', date: iso((i / cfg.sales) * 360) } }));
  }
  for (let i = 0; i < recs.length; i += 500) { const j = await owner('/tenants/' + tid + '/records', { records: recs.slice(i, i + 500) }); if (!j.ok) throw new Error('seeding failed: ' + JSON.stringify(j)); }
  if (!cfg.catalog) await owner('/tenants/' + tid, { features: { catalog: false } });
  return { tid, slug, records: recs.length };
}

const results = { machine: `${os.cpus()[0]?.model || 'cpu'} × ${os.cpus().length}, ${Math.round(os.totalmem() / 2 ** 30)} GB, ${os.platform()}`, chromium: '', when: new Date().toISOString(), sizes: {} };
const b = await puppeteer.launch({ executablePath: CHROME, headless: true, args: APP_ARGS });
results.chromium = await b.version();

for (const size of only) {
  const { tid, slug, records } = await seed(size);
  const ctx = await b.createBrowserContext();
  const p = await ctx.newPage();
  await p.setViewport({ width: 1366, height: 768 });
  await asDesktopApp(p, base);
  const r = { records, catalog: SIZES[size].catalog };
  const go = (hash) => p.evaluate((h) => { location.hash = h; }, hash);

  log(size, 'seeded', JSON.stringify(r));
  // 1. first sign-in on this device: download everything
  await p.goto(base + '/' + slug, { waitUntil: 'networkidle2' });
  await p.evaluate(() => { for (const id of ['pos', 'reports', 'inventory', 'dashboard']) localStorage.setItem('rxpos-tip:' + id, '1'); });
  await p.type('input[autocomplete=username]', `bench-${size}@test.rx`); await p.type('input[type=password]', 'bench-pass-1234');
  let t0 = Date.now();
  await p.evaluate(() => [...document.querySelectorAll('form button')].find((x) => /^Sign in/.test(x.textContent.trim()))?.click());
  // ready to use: the "Setting up" screen has gone (stage 2 of the faster sync: once the core is in)
  await p.waitForFunction(() => !!document.querySelector('.sidebar') && !document.querySelector('.first-sync') && (/Up to date/.test(document.querySelector('.pill.clock')?.title || '') || !!document.querySelector('.history-loading')), { timeout: 600000, polling: 100 });
  r.readyMs = Date.now() - t0;
  await p.waitForFunction(() => /Up to date/.test(document.querySelector('.pill.clock')?.title || ''), { timeout: 600000, polling: 200 });
  r.firstDownloadMs = Date.now() - t0;
  await wait(2500); // let the device finish saving

  log(size, 'downloaded', JSON.stringify(r));
  // 2. warm start: reload until the POS can take a sale
  const starts = [];
  for (let i = 0; i < 3; i++) {
    await p.goto('about:blank'); // a real restart (a hash change alone does not reload the app)
    t0 = Date.now(); // from navigation start: loading the app, reading the device's storage, showing the POS
    await p.goto(base + '/' + slug + '#/pos', { waitUntil: 'domcontentloaded' });
    await p.waitForFunction(() => document.querySelectorAll('.product-grid .product').length > 0 && !!document.querySelector('.search-row input'), { timeout: 120000, polling: 50 });
    starts.push(Date.now() - t0);
    await wait(1500);
  }
  r.startupToCheckoutMs = median(starts);

  log(size, 'started', JSON.stringify(r));
  // 3. product search (time from typing to the grid showing matches)
  const searches = [];
  for (const q of ['sample medicine 12', 'generic 7', '500mg', 'para', '7000000042']) {
    searches.push(await p.evaluate(async (q) => {
      const i = document.querySelector('.search-row input');
      const set = (v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, v); i.dispatchEvent(new Event('input', { bubbles: true })); };
      set(''); await new Promise((r) => setTimeout(r, 100));
      const before = document.querySelector('.product-grid')?.innerText;
      const t = performance.now(); set(q);
      for (;;) { await new Promise((r) => requestAnimationFrame(r)); if (document.querySelector('.product-grid')?.innerText !== before || performance.now() - t > 3000) break; }
      return performance.now() - t;
    }, q));
  }
  r.searchMs = median(searches);
  await p.evaluate(() => { const i = document.querySelector('.search-row input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, 'sample'); i.dispatchEvent(new Event('input', { bubbles: true })); });
  await wait(300);

  log(size, 'searched', JSON.stringify(r));
  // 4. add to basket, 5. complete and save a sale (until the sale is in the device's storage)
  const adds = [], saves = [];
  for (let n = 0; n < 5; n++) {
    adds.push(await p.evaluate(async () => {
      const before = document.querySelectorAll('.cart-line').length;
      const t = performance.now();
      document.querySelectorAll('.product:not(.disabled)')[1]?.click();
      for (;;) { await new Promise((r) => requestAnimationFrame(r)); if (document.querySelectorAll('.cart-line').length !== before || performance.now() - t > 3000) break; }
      return performance.now() - t;
    }));
    saves.push(await p.evaluate(async () => {
      const t = performance.now();
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F9', bubbles: true }));
      for (;;) { await new Promise((r) => setTimeout(r, 5)); if (/Sale complete/.test(document.querySelector('.modal')?.innerText || '') || performance.now() - t > 10000) break; }
      const shown = performance.now() - t;
      const number = document.querySelector('.modal .receipt')?.innerText.match(/\bR-[A-Z0-9]+-\d{2,}-\d{6,}\b|\bR[A-Z0-9]{6,}\b/)?.[0];
      // until the sale is on the device (both the 1.5 table blobs and the 1.6 record store are checked)
      const onDevice = async () => new Promise((res) => { const q = indexedDB.open('pharmapos'); q.onsuccess = () => { const db = q.result; const names = [...db.objectStoreNames]; const tx = db.transaction(names, 'readonly'); const hits = []; if (names.includes('records')) { const g = tx.objectStore('records').getAll(); g.onsuccess = () => hits.push(g.result.some((x) => x?.r?.number === number || (x?.t === 'sales' && (x.rs || []).some((r) => r.number === number)))); } const g2 = tx.objectStore('kv').get('t:sales'); g2.onsuccess = () => hits.push((g2.result || []).some((s) => s.number === number)); tx.oncomplete = () => { db.close(); res(hits.some(Boolean)); }; }; q.onerror = () => res(false); });
      while (!(await onDevice()) && performance.now() - t < 10000) await new Promise((r) => setTimeout(r, 20));
      return { shown, durable: performance.now() - t };
    }));
    await p.keyboard.press('Escape'); await wait(300);
  }
  r.addToBasketMs = median(adds);
  r.saleShownMs = median(saves.map((s) => s.shown));
  r.saleOnDeviceMs = median(saves.map((s) => s.durable));

  log(size, 'sold', JSON.stringify(r));
  // 6. inventory, 7. reports
  const screen = async (hash, ready) => { await go(hash === '#/' ? '#/sales' : '#/'); await wait(800); const t = Date.now(); await go(hash); await p.waitForFunction(ready, { timeout: 60000, polling: 20 }).catch(async () => { throw new Error(`${hash} did not appear: ${(await p.evaluate(() => document.querySelector('.page')?.innerText.slice(0, 300) || location.hash).catch(() => '?')).replace(/\s+/g, ' ')}`); }); return Date.now() - t; };
  const thrice = async (hash, ready) => { const a = []; for (let i = 0; i < 3; i++) a.push(await screen(hash, ready)); return median(a); };
  r.inventoryMs = await thrice('#/inventory', () => document.querySelectorAll('.page tbody tr').length > 10);
  r.reportsMs = await thrice('#/reports', () => document.querySelectorAll('.page .stat').length >= 4);
  r.dashboardMs = await thrice('#/', () => document.querySelectorAll('.page .stat').length >= 4 && !!document.querySelector('.trend-svg')); // the dashboard charts (src/charts.jsx)

  log(size, 'screens', JSON.stringify(r));
  // 8. 20 sales offline, then reconnect: time until everything is in the cloud
  await go('#/pos'); await wait(800);
  await p.setOfflineMode(true); await wait(300);
  for (let n = 0; n < 20; n++) {
    await p.evaluate(() => document.querySelectorAll('.product:not(.disabled)')[2]?.click()); await wait(60);
    await p.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F9', bubbles: true })));
    await p.waitForFunction(() => /Sale complete/.test(document.querySelector('.modal')?.innerText || ''), { timeout: 10000 });
    await p.keyboard.press('Escape'); await wait(80);
  }
  await wait(1000);
  t0 = Date.now();
  await p.setOfflineMode(false);
  await p.waitForFunction(() => /Up to date/.test(document.querySelector('.pill.clock')?.title || '') && !/waiting|Syncing/i.test(document.querySelector('.pill.clock .clock-state')?.innerText || ''), { timeout: 120000, polling: 100 });
  r.reconnectSync20SalesMs = Date.now() - t0;

  await ctx.close();
  // 7. the web version (keeps nothing): signing in downloads the pharmacy every time
  const wctx = await b.createBrowserContext();
  const w = await wctx.newPage();
  await w.setViewport({ width: 1366, height: 768 });
  await w.goto(base + '/' + slug, { waitUntil: 'networkidle2' });
  await w.evaluate(() => { for (const id of ['pos', 'reports', 'inventory', 'dashboard']) localStorage.setItem('rxpos-tip:' + id, '1'); });
  await w.type('input[autocomplete=username]', `bench-${size}@test.rx`); await w.type('input[type=password]', 'bench-pass-1234');
  t0 = Date.now();
  await w.evaluate(() => [...document.querySelectorAll('form button')].find((x) => /^Sign in/.test(x.textContent.trim()))?.click());
  await w.waitForFunction(() => !!document.querySelector('.sidebar') && !document.querySelector('.first-sync') && (/Up to date/.test(document.querySelector('.pill.clock')?.title || '') || !!document.querySelector('.history-loading')), { timeout: 600000, polling: 100 });
  r.webReadyMs = Date.now() - t0;
  await w.waitForFunction(() => /Up to date/.test(document.querySelector('.pill.clock')?.title || ''), { timeout: 600000, polling: 200 });
  r.webFirstDownloadMs = Date.now() - t0;
  await wctx.close();

  results.sizes[size] = r;
  console.log(size, JSON.stringify(r));
  await owner('/tenants/' + tid + '/delete', { confirm: slug });
}
await b.close();
fs.writeFileSync(path.join(out, 'bench.json'), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
console.log('\n0 passed, 0 failed');

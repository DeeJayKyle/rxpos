// How fast the classic app feels with a big pharmacy, on a slow phone CPU (Chrome's 4× throttle): switching pages,
// adding to a sale, typing in the till's search, and how much the main thread is blocked while another device's
// changes sync in. Fictional pharmacy: 3,000 of its own medicines on top of the 9,700-medicine catalog, batches,
// stock movements and 6,000 past sales.   node perf-speed.mjs <base> <ownerKey> <outDir>
//   RXPOS_PERF_REPORT=1 prints every timing.
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
import { CHROME } from './chrome.mjs';
import { asDesktopApp, APP_ARGS } from './appmode.mjs';
const [base, ownerKey, out] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + String(x).slice(0, 300) : ''}`); };
const owner = (p, body) => fetch(base + '/api/owner' + p, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ownerKey }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());
const iso = (n) => new Date(Date.now() - n * 864e5).toISOString();
const day = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const SLOW = Number(process.env.RXPOS_PERF_CPU || 4);

// ---- a big fictional pharmacy ----
const t = await owner('/tenants', { name: 'Speedway Pharmacy', admin: { name: 'Pat Okello', email: 'pat@speed.rx', password: 'pat-pass-1234' } });
const slug = t.tenant.slug, tid = t.tenant.id;
const recs = [];
const N = 3000;
for (let i = 0; i < N; i++) {
  const price = 500 + (i % 40) * 250;
  recs.push({ t: 'products', id: 'sp' + i, rec: { name: `Speedmed ${i} ${['Tablets', 'Capsules', 'Syrup', 'Cream'][i % 4]} ${100 + (i % 9) * 50}mg`, generic: ['Paracetamol', 'Amoxicillin', 'Ibuprofen', 'Cetirizine', 'Metformin'][i % 5], form: ['Tablets', 'Capsules', 'Syrups', 'Creams'][i % 4], price, cost: Math.round(price * 0.6), reorder: 10, unit: 'Unit', barcode: '7100' + String(i).padStart(6, '0') } });
  recs.push({ t: 'batches', id: 'sb' + i, rec: { productId: 'sp' + i, batch: 'B' + i, expiry: day(60 + (i % 600)), cost: Math.round(price * 0.6) } });
  recs.push({ t: 'movements', id: 'sm' + i, rec: { productId: 'sp' + i, qty: 500, type: 'Opening stock', batchId: 'sb' + i, branchId: 'main', date: iso(200) } });
}
for (let s = 0; s < 6000; s++) {
  const items = [0, 1, 2].map((k) => { const i = (s * 7 + k * 13) % N; return { id: 'sp' + i, name: `Speedmed ${i}`, price: 1000, cost: 600, qty: 1 + (k % 2) }; });
  recs.push({ t: 'sales', id: 'ss' + s, rec: { number: 'S-' + s, date: iso(s % 30), type: 'retail', branchId: 'main', items, subtotal: 5000, discount: 0, tax: 0, total: 5000, payment: 'Cash', paid: 5000, tendered: 5000, customerId: 'walk-in', customerName: 'Walk-in Customer', cashier: 'Pat Okello', status: 'completed' } });
}
for (let i = 0; i < recs.length; i += 500) await owner('/tenants/' + tid + '/records', { records: recs.slice(i, i + 500) });

// as the Windows / Android app: the pharmacy kept on the device (the web version keeps nothing)
const b = await puppeteer.launch({ executablePath: CHROME, headless: true, protocolTimeout: 300000, args: APP_ARGS });
const errors = [];
const report = [];
const P = await (await b.createBrowserContext()).newPage();
P.on('pageerror', (e) => errors.push(e.message));
P.on('dialog', (d) => d.dismiss().catch(() => {}));
await P.setViewport({ width: 1366, height: 860 });
await asDesktopApp(P, base);
// long tasks (main thread blocked ≥ 50 ms) from the start
await P.evaluateOnNewDocument(() => {
  window.__long = [];
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__long.push({ at: e.startTime, ms: e.duration }); }).observe({ type: 'longtask', buffered: true }); } catch { /* no long tasks API */ }
});
await P.goto(base + '/' + slug, { waitUntil: 'networkidle2' }); await wait(800);
await P.evaluate(() => { for (const id of ['pos', 'dashboard', 'sales', 'insurers', 'settings', 'add-stock', 'inventory']) localStorage.setItem('rxpos-tip:' + id, '1'); });
await P.type('input[autocomplete=username]', 'pat@speed.rx'); await P.type('input[type=password]', 'pat-pass-1234');
await P.evaluate(() => [...document.querySelectorAll('form button')].find((x) => /^Sign in/.test(x.textContent.trim()))?.click());
await P.waitForSelector('.sidebar', { timeout: 60000 });
const t0 = Date.now();
const synced = async (ms = 240000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await P.evaluate(() => /Synced/.test(document.querySelector('.pill.clock .clock-state')?.innerText || '')).catch(() => false)) return true; await wait(500); } return false; };
check('the big pharmacy downloads and the app says Synced', await synced(), `${Math.round((Date.now() - t0) / 1000)} s`);
report.push(['first download (no throttle)', Date.now() - t0]);
await wait(3000);
await P.emulateCPUThrottling(SLOW);
// RXPOS_PERF_PROFILE=1: CPU profiles of each part (open in Chrome DevTools → Performance, or tools that read .cpuprofile)
const cdp = await P.createCDPSession();
const profiling = !!process.env.RXPOS_PERF_PROFILE;
if (profiling) await cdp.send('Profiler.enable');
const startProfile = async () => { if (profiling) await cdp.send('Profiler.start'); };
const stopProfile = async (name) => { if (!profiling) return; const { profile } = await cdp.send('Profiler.stop'); fs.writeFileSync(path.join(out, name + '.cpuprofile'), JSON.stringify(profile)); };

// ---- switching pages: from the hash change until the page's own content is on screen ----
const ROUTES = [['/sales', 'table tbody tr, .sale-card'], ['/', '.stats'], ['/pos', '.product-grid .product'], ['/inventory', 'table tbody tr, .inv-card'], ['/sales', 'table tbody tr, .sale-card'], ['/add-stock', 'table.lines, .lines'],
  ['/customers', 'table, .empty'], ['/reports', '.page h1'], ['/expiry', '.page h1'], ['/pos', '.product-grid .product'], ['/', '.stats']];
const navTimes = [];
await startProfile();
for (const [route, sel] of ROUTES) {
  await P.keyboard.press('Shift'); // a person is using the app (background jobs wait for a quiet moment)
  // RXPOS_PERF_TRACE=/inventory: a browser trace of that page change (style, layout, paint, script), summarised
  const tracing = process.env.RXPOS_PERF_TRACE === route && !navTimes.some(([r]) => r === route);
  const oneProfile = process.env.RXPOS_PERF_PROFILE_ROUTE === route && !navTimes.some(([r]) => r === route);
  if (oneProfile) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.start'); }
  if (tracing) await P.tracing.start({ path: path.join(out, 'trace.json'), categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'blink', 'v8.execute'] });
  const ms = await P.evaluate(async (route, sel) => {
    const main = document.querySelector('main');
    const old = main?.firstElementChild;
    const t = performance.now();
    location.hash = '#' + route;
    let first = 0, kind = '';
    for (;;) {
      await new Promise((r) => requestAnimationFrame(r));
      const now = document.querySelector('main')?.firstElementChild;
      if (!first && now !== old) { first = Math.round(performance.now() - t); kind = now?.className || now?.tagName || ''; }
      if (now && now !== old && sel.split(', ').some((x) => now.querySelector(x) || now.matches(x))) break;
      if (performance.now() - t > 15000) return -1;
    }
    await new Promise((r) => requestAnimationFrame(r)); // painted
    window.__navLog = (window.__navLog || []).concat(`${route}: main changed at ${first} ms (${kind})`);
    return Math.round(performance.now() - t);
  }, route, sel);
  if (oneProfile) { const { profile } = await cdp.send('Profiler.stop'); fs.writeFileSync(path.join(out, 'route.cpuprofile'), JSON.stringify(profile)); }
  if (tracing) {
    await P.tracing.stop();
    const ev = JSON.parse(fs.readFileSync(path.join(out, 'trace.json'))).traceEvents.filter((e) => e.ph === 'X' && e.dur);
    const by = {};
    for (const e of ev) by[e.name] = (by[e.name] || 0) + e.dur / 1000;
    console.log('trace ' + route + ':', Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 14).map(([k, v]) => `${k} ${Math.round(v)}`).join(' · '));
  }
  navTimes.push([route, ms]);
  report.push(['open ' + route, ms]);
  await wait(400);
}
await stopProfile('pages');
report.push(['page change detail', (await P.evaluate(() => window.__navLog || [])).join(' · ')]);
const second = navTimes.slice(-2).map(([, ms]) => ms); // the till and dashboard again (code already loaded)
check(`switching pages is quick on a slow phone CPU (${SLOW}× throttle): every page under 900 ms`, navTimes.every(([, ms]) => ms >= 0 && ms < 900), JSON.stringify(navTimes));
check('a page opened before comes back under 450 ms', second.every((ms) => ms >= 0 && ms < 450), JSON.stringify(second));

// ---- the till: adding to the sale, typing in the search ----
await P.evaluate(() => { location.hash = '#/pos'; }); await wait(1500);
const addMs = [];
for (let k = 0; k < 5; k++) {
  addMs.push(await P.evaluate(async (k) => {
    const before = document.querySelectorAll('.cart-line').length;
    const t = performance.now();
    document.querySelectorAll('.product-grid .product')[k]?.click();
    for (;;) { await new Promise((r) => requestAnimationFrame(r)); if (document.querySelectorAll('.cart-line').length > before) break; if (performance.now() - t > 5000) return -1; }
    return Math.round(performance.now() - t);
  }, k));
}
report.push(['add to sale (each)', addMs.join(' / ')]);
check('adding a medicine to the sale shows within 200 ms', addMs.every((ms) => ms >= 0 && ms < 200), JSON.stringify(addMs));
await P.focus('.pos-products input.search');
await startProfile();
const typeMs = [];
for (const ch of 'speedmed 12') {
  const t1 = await P.evaluate(() => performance.now());
  await P.keyboard.type(ch);
  typeMs.push(await P.evaluate(async (t1) => { await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); return Math.round(performance.now() - t1); }, t1));
}
await stopProfile('typing');
report.push(['typing in search (per key)', typeMs.join(' / ')]);
check('typing in the till search keeps up (each key under 150 ms)', Math.max(...typeMs) < 150, JSON.stringify(typeMs));

// ---- sync in the background: another device changes 1,000 records while the till is used ----
await P.evaluate(() => { window.__long = []; });
const burst = [];
for (let i = 0; i < 1000; i++) burst.push({ t: 'products', id: 'sp' + i, rec: { ...recs[i * 3].rec, price: recs[i * 3].rec.price + 50 } });
await startProfile();
const pushAt = Date.now();
for (let i = 0; i < burst.length; i += 500) await owner('/tenants/' + tid + '/records', { records: burst.slice(i, i + 500) });
const during = [];
for (let k = 0; k < 6; k++) {
  await wait(800);
  during.push(await P.evaluate(async () => {
    const t = performance.now();
    document.querySelector('.cart-line button[aria-label=More]')?.click();
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return Math.round(performance.now() - t);
  }));
}
await wait(4000);
await stopProfile('sync');
const long = await P.evaluate(() => window.__long.map((x) => Math.round(x.ms)));
report.push(['taps while syncing (ms)', during.join(' / ')]);
report.push(['long tasks while syncing', `${long.length} tasks, longest ${Math.max(0, ...long)} ms, total ${long.reduce((a, x) => a + x, 0)}`]);
check('the till answers taps while another device\'s changes sync in (each under 250 ms)', during.every((ms) => ms < 250), JSON.stringify(during));
check('syncing never blocks the screen for long (no single block over 400 ms)', Math.max(0, ...long) < 400, JSON.stringify(long.slice(0, 20)));
report.push(['sync burst seconds', Math.round((Date.now() - pushAt) / 1000)]);
await P.emulateCPUThrottling(1);
await P.screenshot({ path: path.join(out, 'pos-after-sync.png') });
check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await b.close();
await owner('/tenants/' + tid + '/delete', { confirm: slug });
if (process.env.RXPOS_PERF_REPORT) { console.log('\n--- timings ---'); for (const [k, v] of report) console.log(k.padEnd(34), v); }
fs.writeFileSync(path.join(out, 'timings.json'), JSON.stringify(Object.fromEntries(report), null, 1));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

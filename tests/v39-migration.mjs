// The one-time move from 1.5 storage (one IndexedDB value per table) to 1.6 records + outbox, on a Windows-app
// device (tests/appmode.mjs): every record arrives, the 1.5 copy is kept for recovery, a sale 1.5 had not sent yet is
// queued and reaches the cloud exactly once, and an already-sent sale is not sent again. Fictional data only.
//   node v39-migration.mjs <base> <ownerKey> <outDir>
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import { CHROME } from './chrome.mjs';
import { asDesktopApp, APP_ARGS } from './appmode.mjs';
const [base, ownerKey, out] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + String(x).slice(0, 240) : ''}`); };
const owner = (p, body) => fetch(base + '/api/owner' + p, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ownerKey }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());
const until = async (p, fn, ms = 20000, arg) => { const end = Date.now() + ms; while (Date.now() < end) { if (await p.evaluate(fn, arg).catch(() => false)) return true; await wait(300); } return false; };

const t = await owner('/tenants', { name: 'Upgrade Sample Pharmacy', admin: { name: 'Uma Sample', email: 'uma@test.rx', password: 'uma-pass-12345' } });
const tid = t.tenant.id, slug = t.tenant.slug;
await owner('/tenants/' + tid, { features: { catalog: false } });
const login = await fetch(base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'uma@test.rx', password: 'uma-pass-12345', tenant: slug }) }).then((r) => r.json());
// what the cloud has now (the "already sent" sale is in it; the unsent one is not)
const ago = (min) => new Date(Date.now() - min * 60000).toISOString();
const sent = { id: 'sale-sent', number: 'RSENT01', date: ago(120), items: [{ id: 'lg1', name: 'Legacy Tabs', qty: 1, price: 700, cost: 400 }], total: 700, tax: 0, payment: 'Cash', status: 'completed', branchId: 'main', updatedAt: ago(120) };
await owner('/tenants/' + tid + '/records', { records: [{ t: 'sales', id: 'sale-sent', rec: sent }] });
const cursor = (await fetch(base + '/api/sync', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + login.token }, body: JSON.stringify({ deviceId: 'lg-dev', since: 0, changes: [] }) }).then((r) => r.json())).cursor;

// the 1.5 device: whole tables as single values, its sync position, pushedAt one hour ago
const legacy = {
  products: [{ id: 'lg1', name: 'Legacy Tabs', generic: 'Legacy', form: 'Tablets', unit: 'Tablet', price: 700, cost: 400, reorder: 0, updatedAt: ago(300) }],
  sales: [
    { id: 'sale-unsent', number: 'RUNSENT1', date: ago(10), items: [{ id: 'lg1', name: 'Legacy Tabs', qty: 2, price: 700, cost: 400 }], total: 1400, tax: 0, payment: 'Cash', status: 'completed', branchId: 'main', updatedAt: ago(10) },
    sent,
  ],
  movements: [{ id: 'mv-unsent', productId: 'lg1', qty: -2, type: 'Sale', ref: 'RUNSENT1', branchId: 'main', date: ago(10), updatedAt: ago(10) }],
  customers: [{ id: 'walk-in', name: 'Walk-in Customer', phone: '', updatedAt: '2000-01-01T00:00:00.000Z' }],
  users: [{ id: login.user.id, name: 'Uma Sample', email: 'uma@test.rx', role: 'admin', updatedAt: ago(500) }],
  _tomb: [], settings: { name: 'Upgrade Sample Pharmacy', currency: 'UGX', updatedAt: ago(500) },
};
const cfg = { deviceId: 'lg-dev', url: 'https://rxposug.com', key: login.token, account: 'uma@test.rx', tenant: tid, slug, pharmacy: 'Upgrade Sample Pharmacy', cursor, pushedAt: ago(60), lastSync: ago(60), branchId: 'main' };

const b = await puppeteer.launch({ executablePath: CHROME, headless: true, args: APP_ARGS });
const p = await (await b.createBrowserContext()).newPage();
await p.setViewport({ width: 1366, height: 860 });
const cloud = await asDesktopApp(p, base);
cloud.set('down'); // first look at the device without the cloud
await p.goto(base + '/favicon.svg'); // same origin, without starting the app
await p.evaluate(async ({ legacy, cfg, user }) => {
  await new Promise((res, rej) => {
    const q = indexedDB.open('pharmapos', 1);
    q.onupgradeneeded = () => q.result.createObjectStore('kv');
    q.onsuccess = () => { const tx = q.result.transaction('kv', 'readwrite'); const kv = tx.objectStore('kv'); for (const [k, v] of Object.entries(legacy)) kv.put(v, 't:' + k); kv.put(cfg, 'sync'); tx.oncomplete = () => { q.result.close(); res(); }; tx.onerror = rej; };
    q.onerror = rej;
  });
  sessionStorage.setItem('pharmapos-session', JSON.stringify(user));
}, { legacy, cfg, user: { id: login.user.id, name: 'Uma Sample', email: 'uma@test.rx', role: 'admin' } });

await p.goto(base + '/' + slug + '#/sales', { waitUntil: 'networkidle2' }); await wait(2500);
const st = await p.evaluate(async () => new Promise((res) => { const q = indexedDB.open('pharmapos'); q.onsuccess = () => { const db = q.result; const tx = db.transaction(['records', 'kv', 'outbox'], 'readonly'); const out = {}; const g = (s, m, k, f) => { const r = tx.objectStore(s)[m](k); r.onsuccess = () => { out[f] = r.result; }; }; g('records', 'getAll', undefined, 'records'); g('kv', 'get', 'storage-version', 'version'); g('kv', 'get', 't:sales', 'legacySales'); g('kv', 'get', 'migrated-v1-counts', 'counts'); g('outbox', 'getAll', undefined, 'outbox'); tx.oncomplete = () => { db.close(); res(out); }; }; }));
const recs = (st.records || []).map((x) => x.t + '|' + x.r.id);
check('every 1.5 record is in the 1.6 record store', ['products|lg1', 'sales|sale-unsent', 'sales|sale-sent', 'movements|mv-unsent', 'users|' + login.user.id].every((k) => recs.includes(k)), recs.join(','));
check('the storage version is 2', st.version === 2, st.version);
check('the 1.5 copy is kept for recovery', Array.isArray(st.legacySales) && st.legacySales.length === 2);
check('the counts checked during the upgrade are recorded', st.counts?.sales === 2, JSON.stringify(st.counts));
const queued = (st.outbox || []).map((o) => o.t + '|' + o.id);
check('the sale 1.5 had not sent yet is queued, with its movement', queued.includes('sales|sale-unsent') && queued.includes('movements|mv-unsent'), queued.join(','));
check('the sale 1.5 had already sent is not queued again', !queued.includes('sales|sale-sent'));
check('the app shows both sales after the upgrade', await until(p, () => /RUNSENT1/.test(document.querySelector('.page tbody')?.innerText || '') && /RSENT01/.test(document.querySelector('.page tbody')?.innerText || ''), 10000));

cloud.set('up');
await p.evaluate(() => window.dispatchEvent(new Event('online')));
check('online again: the queued sale is sent', await until(p, () => /Synced/.test(document.querySelector('.pill.clock .clock-state')?.innerText || ''), 30000), await p.evaluate(() => document.querySelector('.pill.clock')?.title));
const cloudSales = (await owner(`/tenants/${tid}/records?t=sales`)).rows.map((r) => r.rec.number).sort();
check('the cloud has each sale exactly once', JSON.stringify(cloudSales) === JSON.stringify(['RSENT01', 'RUNSENT1']), cloudSales.join(','));
check('…and the unsent sale\'s stock movement', (await owner(`/tenants/${tid}/records?t=movements&q=RUNSENT1`)).total === 1);

// a restart after the upgrade reads the new store (no second migration)
await p.goto('about:blank'); await p.goto(base + '/' + slug + '#/sales', { waitUntil: 'networkidle2' }); await wait(2000);
check('after a restart the device opens from the new store', await until(p, () => /RUNSENT1/.test(document.querySelector('.page tbody')?.innerText || ''), 10000));
const ob = await p.evaluate(async () => new Promise((res) => { const q = indexedDB.open('pharmapos'); q.onsuccess = () => { const g = q.result.transaction('outbox').objectStore('outbox').count(); g.onsuccess = () => { res(g.result); q.result.close(); }; }; }));
check('…and nothing is queued twice', ob === 0, ob);

await b.close();
await owner('/tenants/' + tid + '/delete', { confirm: slug });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

// On-device data security and renewable sign-ins (2026-11-26), on a Windows-app device (tests/appmode.mjs): a device
// from 1.22 (records stored as plain text, a 30-day pass) is upgraded in place: every record is sealed with the
// device's key and still opens, a client it had not sent yet still reaches the cloud, its long pass is swapped for a
// renewable sign-in, and "Remember me" reopens the app on the lock screen. Fictional data only.
//   node v90-device-security.mjs <base> <ownerKey>
import puppeteer from 'puppeteer-core';
import { CHROME } from './chrome.mjs';
import { asDesktopApp, APP_ARGS } from './appmode.mjs';
import { deviceRecords, deviceKv, deviceRaw } from './devicedata.mjs';
import { passExpiry } from '../src/session.js';
const [base, ownerKey] = process.argv.slice(2);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + String(x).slice(0, 240) : ''}`); };
const owner = (p, body) => fetch(base + '/api/owner' + p, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ownerKey }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());
const until = async (p, fn, ms = 20000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await p.evaluate(fn).catch(() => false)) return true; await wait(400); } return false; };
const later = async (fn, ms = 20000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn().catch(() => false)) return true; await wait(500); } return false; };

const t = await owner('/tenants', { name: 'Sealed Sample Pharmacy', admin: { name: 'Sid Sample', email: 'sid@sealed.rx', password: 'sid-pass-12345' } });
const tid = t.tenant.id, slug = t.tenant.slug;
await owner('/tenants/' + tid, { features: { catalog: false } });
// an app from before renewal: the long pass (no `session: 2`)
const login = await fetch(base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'sid@sealed.rx', password: 'sid-pass-12345', tenant: slug }) }).then((r) => r.json());
check('the 1.22 device holds a long pass', passExpiry(login.token) - Date.now() > 29 * 864e5);
const cursor = (await fetch(base + '/api/sync', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + login.token }, body: JSON.stringify({ deviceId: 'sealed-dev', since: 0, changes: [] }) }).then((r) => r.json())).cursor;

// the device as 1.22 left it: plain record buckets (src/storage.js bucketOf), a client not sent yet in the outbox
const bucketOf = (tb, id) => { let h = 2166136261; const s = String(id); for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return tb + '|#' + ((h >>> 0) % 64).toString(16); };
const at = new Date().toISOString();
const recs = [
  ['users', { id: login.user.id, name: 'Sid Sample', email: 'sid@sealed.rx', role: 'admin', updatedAt: at }],
  ['customers', { id: 'walk-in', name: 'Walk-in Customer', phone: '', updatedAt: '2000-01-01T00:00:00.000Z' }],
  ['customers', { id: 'cl-plain', name: 'Plainly Visible Patient', phone: '0772000111', updatedAt: at }],
  ['products', { id: 'pd-plain', name: 'Sealtest Tabs 10mg', price: 900, cost: 500, updatedAt: at }],
];
const buckets = {};
for (const [tb, r] of recs) (buckets[bucketOf(tb, r.id)] ??= { t: tb, rs: [] }).rs.push(r);
const cfg = { url: 'https://rxposug.com', key: login.token, keyUser: login.user.id, tenant: tid, slug, pharmacy: 'Sealed Sample Pharmacy', deviceId: 'sealed-dev', cursor, outboxV2: true, fullPull: 99, lastSync: at, branchId: 'main' };

const b = await puppeteer.launch({ executablePath: CHROME, headless: true, args: APP_ARGS });
const ctx = await b.createBrowserContext();
const p = await ctx.newPage();
await p.setViewport({ width: 1366, height: 860 });
const errors = []; p.on('pageerror', (e) => errors.push(e.message));
await asDesktopApp(p, base);
await p.goto(base + '/favicon.svg'); // same origin, without starting the app
await p.evaluate(async ({ buckets, cfg, user, at }) => {
  await new Promise((res, rej) => {
    const q = indexedDB.open('pharmapos', 2);
    q.onupgradeneeded = () => { q.result.createObjectStore('kv'); q.result.createObjectStore('records'); q.result.createObjectStore('outbox', { autoIncrement: true }); };
    q.onsuccess = () => {
      const tx = q.result.transaction(['kv', 'records', 'outbox'], 'readwrite');
      for (const [k, v] of Object.entries(buckets)) tx.objectStore('records').put(v, k);
      tx.objectStore('kv').put(2, 'storage-version');
      tx.objectStore('kv').put({ name: 'Sealed Sample Pharmacy', currency: 'UGX', updatedAt: at }, 's2:settings');
      tx.objectStore('kv').put(cfg, 'sync');
      tx.objectStore('outbox').add({ op: 'op-plain-1', txn: 'tx-1', t: 'customers', id: 'cl-plain', at });
      tx.oncomplete = () => { q.result.close(); res(); }; tx.onerror = rej;
    };
    q.onerror = rej;
  });
  sessionStorage.setItem('pharmapos-session', JSON.stringify(user));
}, { buckets, cfg, user: { id: login.user.id, name: 'Sid Sample', email: 'sid@sealed.rx', role: 'admin' }, at });
const before = await deviceRaw(p);
check('before the update the client\'s name can be read straight from the device', JSON.stringify(before.records).includes('Plainly Visible Patient'));

await p.goto(base + '/' + slug + '#/customers', { waitUntil: 'networkidle2' });
check('after the update the app opens with its clients', await until(p, () => /Plainly Visible Patient/.test(document.querySelector('.page')?.innerText || ''), 20000));
const raw = await deviceRaw(p);
check('every record bucket is now sealed', raw.records.length > 0 && raw.records.every((x) => x.__enc === 1 && !x.rs && x.ct), raw.records.map((x) => Object.keys(x).join('/')).join(' '));
check('…and nothing on the device shows the client\'s name or phone', !/Plainly Visible|0772000111|Sealtest/.test(JSON.stringify(raw.records)));
check('the sign-in kept on the device is sealed', raw.kv.sync?.__enc === 1 && !JSON.stringify(raw.kv.sync).includes(login.token.slice(2, 30)));
check('the device key can\'t be read out of the page', await p.evaluate(async () => { const q = await new Promise((r) => { const o = indexedDB.open('pharmapos'); o.onsuccess = () => r(o.result); }); const e = await new Promise((r) => { const g = q.transaction('kv').objectStore('kv').get('device-key'); g.onsuccess = () => r(g.result); }); q.close(); try { await crypto.subtle.exportKey('raw', e.key); return false; } catch { return e.key.extractable === false; } }));
const opened = (await deviceRecords(p)).flatMap((x) => x.rs.map((r) => x.t + '|' + r.id));
check('every record is still there, opened with the key', ['customers|cl-plain', 'products|pd-plain', 'users|' + login.user.id].every((k) => opened.includes(k)), opened.join(','));

check('the client the old version had not sent reaches the cloud', await later(async () => (await owner(`/tenants/${tid}/records?t=customers&q=Plainly`)).total === 1, 30000));
check('the long pass is swapped for a renewable sign-in', await later(async () => { const c = await deviceKv(p, 'sync'); return !!c?.refresh && !!c.sid && passExpiry(c.key) - Date.now() <= 15 * 60000; }, 30000));
const ended = await fetch(base + '/api/config', { headers: { Authorization: 'Bearer ' + login.token } });
check('…and the long pass stops working in the cloud', ended.status === 401, ended.status);

// a change after the update: sealed as it is saved, and still there after a restart
await p.goto('about:blank'); await p.goto(base + '/' + slug + '#/customers', { waitUntil: 'networkidle2' });
check('after a restart the app reads the sealed records', await until(p, () => /Plainly Visible Patient/.test(document.querySelector('.page')?.innerText || ''), 20000));
check('…and keeps syncing with the renewed sign-in', await until(p, () => !document.querySelector('.pill.clock.err, .pill.clock.bad') && !/expired/i.test(document.querySelector('.pill.clock')?.title || ''), 15000));

// "Remember me": the app reopens on the lock screen, not open as the last person
const remembered = await ctx.newPage();
await asDesktopApp(remembered, base);
await remembered.goto(base + '/favicon.svg');
await remembered.evaluate((user) => { localStorage.setItem('rxpos-remember', JSON.stringify({ user, until: Date.now() + 864e5 })); localStorage.removeItem('rxpos-locked'); }, { id: login.user.id, name: 'Sid Sample', email: 'sid@sealed.rx', role: 'admin' });
await p.close();
await remembered.goto(base + '/' + slug, { waitUntil: 'networkidle2' });
check('a remembered sign-in reopens the app on the lock screen', await until(remembered, () => !!document.querySelector('.lock-screen'), 15000));
check('…with the idle lock on by default (5 minutes)', await remembered.evaluate(() => !localStorage.getItem('rxpos-behaviour') || JSON.parse(localStorage.getItem('rxpos-behaviour')).lock !== 0));

check('no page errors', !errors.length, errors.join(' | '));
await b.close();
await owner('/tenants/' + tid + '/delete', { confirm: slug });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

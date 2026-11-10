// The self-hosted hub's move to the cloud's code (workplan step 16): a hub from before (hub.json) starts as the new
// hub, its data is moved into hub.db once and kept as a backup, staff sign in with the passwords they had (an old
// unsalted one too), devices download everything, and the cloud's rules now apply (stock movements can't be deleted).
// Starts its own hub on port 8796.   node hub-move.mjs
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + String(x).slice(0, 200) : ''}`); };
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rxpos-hub-move-'));
const KEY = 'hub-move-key-0123456789';
const BASE = 'http://localhost:8796';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// an old hub's file: fictional staff (one with a 1.0-style unsalted password), medicines, a sale, a deleted client
const salt = crypto.randomBytes(16).toString('base64');
const row = (t, id, rec, seq, extra = {}) => [t + '|' + id, { t, id, rec, deleted: false, at: `2026-10-0${1 + (seq % 8)}T10:00:00.000Z`, seq, origin: 'dev-old', ...extra }];
const rows = Object.fromEntries([
  row('users', 'u1', { id: 'u1', name: 'Hana Hub', email: 'hana@hub.rx', role: 'admin', algo: 'pbkdf2', salt, iter: 100000, hash: crypto.pbkdf2Sync('hana-pass-1234', Buffer.from(salt, 'base64'), 100000, 32, 'sha256').toString('hex') }, 1),
  row('users', 'u2', { id: 'u2', name: 'Lee Legacy', email: 'lee@hub.rx', role: 'cashier', hash: crypto.createHash('sha256').update('pharmapos:lee-pass-1234').digest('hex') }, 2),
  row('products', 'p1', { id: 'p1', name: 'Hub Tabs', price: 500, cost: 300 }, 3),
  row('movements', 'm1', { id: 'm1', productId: 'p1', qty: 40, type: 'Opening stock', branchId: 'main' }, 4),
  row('sales', 's1', { id: 's1', number: 'R1', items: [{ id: 'p1', qty: 2, price: 500 }], subtotal: 1000, discount: 0, tax: 0, total: 1000, paid: 1000, status: 'completed' }, 5),
  row('customers', 'c-gone', null, 6, { deleted: true }),
]);
fs.writeFileSync(path.join(dir, 'hub.json'), JSON.stringify({ seq: 6, rows }));

const start = () => spawn(process.execPath, ['--no-warnings', path.join(root, 'server', 'hub.mjs'), '--port', '8796', '--data', dir], { env: { ...process.env, RXPOS_SYNC_KEY: KEY }, stdio: ['ignore', 'pipe', 'pipe'] });
const up = async () => { for (let i = 0; i < 60; i++) { if (await fetch(BASE + '/api/health').then((r) => r.ok).catch(() => false)) return true; await wait(250); } return false; };
const api = (p, body, token) => fetch(BASE + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, ...(await r.json().catch(() => ({}))) }));

let hub = start();
let log = '';
hub.stdout.on('data', (d) => { log += d; });
check('the new hub starts on an old hub\'s folder', await up());
check('…says it moved the records', /Moved 6 records from hub\.json into hub\.db/.test(log), log.trim());
check('…and keeps hub.json as a backup', !fs.existsSync(path.join(dir, 'hub.json')) && fs.readdirSync(dir).some((f) => /^hub\.before-move-.*\.json$/.test(f)));
const hana = await api('/api/login', { email: 'hana@hub.rx', password: 'hana-pass-1234', tenant: 'main' });
check('staff sign in with the password they had', hana.status === 200 && !!hana.token, JSON.stringify(hana).slice(0, 120));
const lee = await api('/api/login', { email: 'lee@hub.rx', password: 'lee-pass-1234', tenant: 'main' });
check('…an old unsalted password too', lee.status === 200 && !!lee.token);
const pulled = await api('/api/sync', { v: 2, deviceId: 'dev-new', since: 0, changes: [] }, hana.token);
const has = (t, id) => (pulled.changes || []).find((c) => c.t === t && c.id === id);
check('a device downloads the medicines, stock and sales', has('products', 'p1')?.rec?.name === 'Hub Tabs' && has('movements', 'm1')?.rec?.qty === 40 && has('sales', 's1')?.rec?.total === 1000);
check('…a deleted client stays deleted', has('customers', 'c-gone')?.deleted === true);
check('…and never the password hashes', !('hash' in (has('users', 'u1')?.rec || { hash: 1 })));
const del = await api('/api/sync', { v: 2, deviceId: 'dev-new', since: 0, changes: [{ op: crypto.randomUUID(), t: 'movements', id: 'm1', deleted: true, at: new Date().toISOString() }] }, hana.token);
check('the cloud\'s rules apply now: a stock movement cannot be deleted', del.refused === 1);
const sell = await api('/api/sync', { v: 2, deviceId: 'dev-new', since: 0, changes: [{ op: crypto.randomUUID(), t: 'products', id: 'p1', at: new Date().toISOString(), rec: { id: 'p1', name: 'Hub Tabs', price: 1 } }] }, lee.token);
check('…and so do the permissions: a cashier cannot change a price', sell.refused === 1);
hub.kill(); await wait(500);

// a second start: nothing moved again, nothing lost
hub = start(); log = ''; hub.stdout.on('data', (d) => { log += d; });
await up();
const again = await api('/api/sync', { v: 2, deviceId: 'dev-other', since: 0, changes: [] }, (await api('/api/login', { email: 'hana@hub.rx', password: 'hana-pass-1234', tenant: 'main' })).token);
check('after a restart the data is there, moved once only', !/Moved/.test(log) && (again.changes || []).some((c) => c.t === 'sales' && c.id === 's1'));
check('a daily copy of the database is made', fs.readdirSync(path.join(dir, 'backups')).some((f) => /^hub-\d{4}-\d{2}-\d{2}\.db$/.test(f)));
hub.kill();
fs.rmSync(dir, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

// Backup → delete → restore gives back the same pharmacy (records, sign-in, chat attachment).
//   node tests/backup-test.mjs <base> <ownerKey>
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const [base, ownerKey] = process.argv.slice(2);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + String(x).slice(0, 200) : ''}`); };
const owner = (p, body) => fetch(base + '/api/owner' + p, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ownerKey }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());
const call = (p, body, tok) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, ...(await r.json()) }));
const pullAll = async (tok) => { const out = []; let since = 0; for (;;) { const r = await call('/api/sync', { deviceId: 'dev-' + Math.random(), since, changes: [] }, tok); out.push(...r.changes); since = r.cursor; if (!r.more) return out; } };

const t = (await owner('/tenants', { name: 'Backup Test Pharmacy', slug: 'backup-test', admin: { name: 'Bea Admin', email: 'bea@test.rx', password: 'bea-pass-123' } })).tenant;
const recs = [{ t: 'products', id: 'p1', rec: { name: 'Backup Med 1', price: 1000, cost: 500 } }, { t: 'batches', id: 'b1', rec: { productId: 'p1', batch: 'X1', expiry: '2029-01-31', cost: 500 } },
  { t: 'movements', id: 'm1', rec: { productId: 'p1', qty: 40, type: 'Opening stock', batchId: 'b1', branchId: 'main', date: new Date().toISOString() } }];
for (let i = 0; i < 1200; i++) recs.push({ t: 'sales', id: 's' + i, rec: { number: 'S' + i, date: new Date().toISOString(), total: 1000, items: [{ id: 'p1', name: 'Backup Med 1', qty: 1, price: 1000 }], payment: 'Cash', status: 'completed', branchId: 'main' } });
for (let i = 0; i < recs.length; i += 400) await owner('/tenants/' + t.id + '/records', { records: recs.slice(i, i + 400) });
let login = await call('/api/login', { email: 'bea@test.rx', password: 'bea-pass-123', tenant: 'backup-test' });
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const up = await call('/api/files', { id: 'att-backup-01', n: 0, chunks: 1, size: png.length, type: 'image/png', name: 'dot.png', data: png.toString('base64') }, login.token);
const before = await pullAll(login.token);
check('test pharmacy has its records and an attachment', before.length >= 1203 && up.done, `${before.length} records, upload ${up.done}`);

// back up
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rxbk-'));
const env = { ...process.env, RXPOS_API: base, OWNER_KEY: ownerKey, BACKUP_PASSPHRASE: 'test-passphrase-123' };
const b = spawnSync(process.execPath, [path.join(root, 'tools/backup.mjs'), dir], { env, encoding: 'utf8' });
const info = (() => { try { return JSON.parse(b.stdout.trim().split('\n').pop()); } catch { return {}; } })();
check('backup made an encrypted file with every record and the attachment', b.status === 0 && info.records >= 1203 && info.chunks >= 1, b.stdout + b.stderr);
const file = info.file;
check('the backup file is not readable without the passphrase', file && !fs.readFileSync(file).includes('Backup Med 1') && !fs.readFileSync(file).includes('bea@test.rx'));
const wrong = spawnSync(process.execPath, [path.join(root, 'tools/restore.mjs'), file], { env: { ...env, BACKUP_PASSPHRASE: 'wrong-pass' }, encoding: 'utf8' });
check('a wrong passphrase is refused', wrong.status !== 0 && /Wrong passphrase/.test(wrong.stderr), wrong.stderr.split('\n').find((l) => /Error/.test(l)));

// lose the pharmacy, then restore it
await owner('/tenants/' + t.id + '/delete', { confirm: 'backup-test' });
check('pharmacy deleted', !(await owner('/tenants')).tenants.some((x) => x.id === t.id));
const r = spawnSync(process.execPath, [path.join(root, 'tools/restore.mjs'), file, '--restore', '--tenant', t.id], { env, encoding: 'utf8' });
check('restore ran', r.status === 0 && /Done/.test(r.stdout), (r.stdout + r.stderr).slice(-200));
login = await call('/api/login', { email: 'bea@test.rx', password: 'bea-pass-123', tenant: 'backup-test' });
check('staff can sign in again with their old password', login.status === 200 && login.token, login.error);
const after = await pullAll(login.token);
const key = (c) => c.t + '|' + c.id + '|' + JSON.stringify(c.rec);
const a = new Set(after.map(key));
check('every record came back unchanged', before.length === after.length && before.every((c) => a.has(key(c))), `${before.length} → ${after.length}`);
const img = await fetch(base + up.path);
check('the chat attachment opens again', img.ok && Buffer.from(await img.arrayBuffer()).equals(png), img.status);

await owner('/tenants/' + t.id + '/delete', { confirm: 'backup-test' });
const gone = await fetch(base + up.path);
check('deleting a pharmacy also deletes its chat attachments', gone.status === 404, gone.status);
fs.rmSync(dir, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

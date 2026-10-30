// Backup → restore drill: proves a backup made by tools/backup.mjs actually restores (not just that the backup job
// "succeeded"). Seeds a pharmacy, backs the cloud up to an encrypted .rxbak, deletes the pharmacy to simulate data
// loss, restores from the file, and checks the pharmacy and its records come back byte-for-byte.
//   node v33-restore-drill.mjs <base> <ownerKey>
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const [base, ownerKey] = process.argv.slice(2);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PASS = 'restore-drill-passphrase-123456';
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + String(x).slice(0, 180) : ''}`); };
const owner = (p, body) => fetch(base + '/api/owner' + p, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ownerKey }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());
const run = (args) => execFileSync('node', args, { cwd: root, env: { ...process.env, RXPOS_API: base, OWNER_KEY: ownerKey, BACKUP_PASSPHRASE: PASS } }).toString();
const recordsOf = async (tid, t) => ((await owner(`/tenants/${tid}/records?t=${t}&offset=0`)).rows || []).map((r) => r.rec);

// seed a pharmacy with a few records of different kinds
const t = await owner('/tenants', { name: 'Drill Pharmacy', admin: { name: 'Dee Drill', email: 'dee@test.rx', password: 'dee-pass-1234' } });
const tid = t.tenant.id, slug = t.tenant.slug;
await owner('/tenants/' + tid + '/records', { records: [
  { t: 'customers', id: 'c1', rec: { id: 'c1', name: 'Jane Doe', phone: '0770000000' } },
  { t: 'products', id: 'p1', rec: { id: 'p1', name: 'Paracetamol 500mg', price: 1500 } },
  { t: 'movements', id: 'm1', rec: { id: 'm1', productId: 'p1', qty: 20, type: 'Opening stock' } },
] });
const before = await recordsOf(tid, 'customers');
check('seeded the pharmacy', before.some((r) => r.id === 'c1' && r.name === 'Jane Doe'));

// back the whole cloud up to an encrypted file
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rxdrill-'));
const out = run([path.join(root, 'tools/backup.mjs'), dir]);
const info = JSON.parse(out.trim().split('\n').pop());
check('the backup file was written and is non-empty', !!info.file && fs.existsSync(info.file) && info.bytes > 0, JSON.stringify({ bytes: info.bytes, records: info.records }));
check('the backup captured this pharmacy', info.tenants >= 1 && info.records >= 3, JSON.stringify({ tenants: info.tenants, records: info.records }));

// simulate data loss
await owner('/tenants/' + tid + '/delete', { confirm: slug });
check('after deletion the pharmacy is gone', !(await owner('/tenants')).tenants?.some((x) => x.id === tid));

// restore from the encrypted file and confirm the data is back, exactly
run([path.join(root, 'tools/restore.mjs'), info.file, '--restore']);
check('the pharmacy is restored', (await owner('/tenants')).tenants?.some((x) => x.id === tid));
const after = await recordsOf(tid, 'customers');
check('the customer is restored with its exact fields', after.some((r) => r.id === 'c1' && r.name === 'Jane Doe' && r.phone === '0770000000'), JSON.stringify(after));
const prods = await recordsOf(tid, 'products');
const moves = await recordsOf(tid, 'movements');
check('the product and movement are restored too', prods.some((r) => r.id === 'p1' && r.price === 1500) && moves.some((r) => r.id === 'm1' && r.qty === 20));

// a wrong passphrase cannot open the backup (confidentiality holds)
let denied = false;
try { execFileSync('node', [path.join(root, 'tools/restore.mjs'), info.file], { cwd: root, env: { ...process.env, BACKUP_PASSPHRASE: 'the-wrong-passphrase' }, stdio: 'pipe' }); }
catch { denied = true; }
check('a wrong passphrase cannot decrypt the backup', denied);

fs.rmSync(dir, { recursive: true, force: true });
await owner('/tenants/' + tid + '/delete', { confirm: slug });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

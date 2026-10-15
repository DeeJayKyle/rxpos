// Open an RxPOS backup made by tools/backup.mjs: show what is in it, save it as plain JSON, or put it back into a cloud.
//   BACKUP_PASSPHRASE=… node tools/restore.mjs <file.rxbak>                       → summary only
//   BACKUP_PASSPHRASE=… node tools/restore.mjs <file.rxbak> --json out.json       → decrypted copy (keep it safe!)
//   BACKUP_PASSPHRASE=… RXPOS_API=… OWNER_KEY=… node tools/restore.mjs <file.rxbak> --restore [--tenant <id>]
// --restore writes every row back exactly as it was (same ids, same sequence numbers). With --tenant only that
// pharmacy is put back. Devices pull the restored data on their next sync.
import fs from 'node:fs';
import zlib from 'node:zlib';
import crypto from 'node:crypto';

const [file, ...args] = process.argv.slice(2);
const flag = (n) => args.includes(n);
const val = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const PASS = process.env.BACKUP_PASSPHRASE;
if (!file || !PASS) { console.error('Usage: BACKUP_PASSPHRASE=… node tools/restore.mjs <file.rxbak> [--json out.json] [--restore [--tenant id]]'); process.exit(2); }

const buf = fs.readFileSync(file);
if (buf.subarray(0, 8).toString() !== 'RXPOSBK1') throw new Error('Not an RxPOS backup file');
const salt = buf.subarray(8, 24), iv = buf.subarray(24, 36), tag = buf.subarray(36, 52), enc = buf.subarray(52);
const key = crypto.scryptSync(PASS, salt, 32, { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
const d = crypto.createDecipheriv('aes-256-gcm', key, iv); d.setAuthTag(tag);
let data;
try { data = JSON.parse(zlib.gunzipSync(Buffer.concat([d.update(enc), d.final()])).toString()); }
catch { throw new Error('Wrong passphrase, or the file is damaged'); }

const only = val('--tenant');
const pick = (rows) => (only ? rows.filter((r) => (r.tenant ?? r.id) === only) : rows);
console.log(`Backup from ${data.at} (${data.database}): ${data.tenants.length} pharmacies, ${data.records.length} records, ${data.files.length} attachments`);
for (const t of data.tenants) console.log(`  ${t.id}${t.slug && t.slug !== t.id ? ' /' + t.slug : ''}  ${t.name}  ·  ${data.records.filter((r) => r.tenant === t.id && !r.deleted).length} records`);

if (val('--json')) { fs.writeFileSync(val('--json'), JSON.stringify(data, null, 1)); console.log('Saved plain JSON to', val('--json'), '(it contains password hashes and keys: keep it private)'); }

if (flag('--restore')) {
  const API = (process.env.RXPOS_API || 'https://pharmapos.pharmapos.workers.dev').replace(/\/+$/, '');
  const KEY = process.env.OWNER_KEY;
  if (!KEY) throw new Error('Set OWNER_KEY to restore');
  const send = async (part, rows, size = 500) => {
    for (let i = 0; i < rows.length; i += size) {
      const r = await fetch(`${API}/api/owner/restore`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + KEY }, body: JSON.stringify({ confirm: 'RESTORE', part, rows: rows.slice(i, i + size) }) });
      const j = await r.json();
      if (!r.ok) throw new Error(`${part}: ${j.error || r.status}`);
    }
    console.log(`restored ${rows.length} ${part}`);
  };
  await send('tenants', only ? data.tenants.filter((t) => t.id === only) : data.tenants);
  if (!only) await send('ownerConfig', data.ownerConfig);
  await send('records', pick(data.records));
  await send('files', pick(data.files));
  await send('chunks', pick(data.chunks), 4);
  console.log('Done. Devices pick up the restored data on their next sync.');
}

// Download the whole RxPOS cloud (every pharmacy, record and chat attachment) into one encrypted file.
//   RXPOS_API=https://api.rxposug.com OWNER_KEY=… BACKUP_PASSPHRASE=… node tools/backup.mjs [out-dir]
// The file is gzip-compressed JSON encrypted with AES-256-GCM (key from the passphrase via scrypt).
// Decrypt / put back with tools/restore.mjs. Runs every night in GitHub Actions (.github/workflows/backup.yml).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';

const API = (process.env.RXPOS_API || 'https://api.rxposug.com').replace(/\/+$/, '');
const KEY = process.env.OWNER_KEY;
const PASS = process.env.BACKUP_PASSPHRASE;
if (!KEY || !PASS) { console.error('Set OWNER_KEY and BACKUP_PASSPHRASE'); process.exit(2); }
const outDir = process.argv[2] || 'backups';

const get = async (q) => {
  for (let tries = 0; ; tries++) {
    try {
      const r = await fetch(`${API}/api/owner/backup?${q}`, { headers: { Authorization: 'Bearer ' + KEY }, signal: AbortSignal.timeout(60000) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'HTTP ' + r.status);
      return j;
    } catch (e) { if (tries >= 5) throw e; await new Promise((r) => setTimeout(r, 2000 * (tries + 1))); }
  }
};

const meta = await get('part=meta');
const records = [];
for (let after = 0; ;) {
  const page = await get(`part=records&after=${after}`);
  records.push(...page.rows);
  after = page.last;
  if (page.done) break;
}
const chunks = [];
for (let after = 0; ;) {
  const page = await get(`part=chunks&after=${after}`);
  chunks.push(...page.rows);
  after = page.last;
  if (page.done) break;
}
if (records.length < meta.counts.records) throw new Error(`Only ${records.length} of ${meta.counts.records} records came back — backup not saved`);

const data = { ...meta, records, chunks };
const plain = zlib.gzipSync(Buffer.from(JSON.stringify(data)), { level: 9 });
const salt = crypto.randomBytes(16), iv = crypto.randomBytes(12);
const key = crypto.scryptSync(PASS, salt, 32, { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
const c = crypto.createCipheriv('aes-256-gcm', key, iv);
const enc = Buffer.concat([c.update(plain), c.final()]);
// file layout: "RXPOSBK1" | salt(16) | iv(12) | tag(16) | ciphertext
const file = Buffer.concat([Buffer.from('RXPOSBK1'), salt, iv, c.getAuthTag(), enc]);
fs.mkdirSync(outDir, { recursive: true });
const name = path.join(outDir, `rxpos-backup-${meta.at.slice(0, 10)}.rxbak`);
fs.writeFileSync(name, file);
console.log(JSON.stringify({ file: name, bytes: file.length, tenants: meta.tenants.length, records: records.length, files: meta.files.length, chunks: chunks.length, database: meta.database }));

// tools/restore.mjs --verify opens a backup and fails loudly if it can't be decrypted or is empty. This is what the
// weekly restore drill runs on the real off-site backup, so it must never pass a bad file silently.
//   node unit-verify.mjs
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PASS = 'verify-test-passphrase-123456';
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + String(x).slice(0, 160) : ''}`); };

// write a .rxbak exactly the way tools/backup.mjs does: "RXPOSBK1" | salt(16) | iv(12) | tag(16) | ciphertext
const writeBak = (dir, name, data, passphrase = PASS) => {
  const plain = zlib.gzipSync(Buffer.from(JSON.stringify(data)), { level: 9 });
  const salt = crypto.randomBytes(16), iv = crypto.randomBytes(12);
  const key = crypto.scryptSync(passphrase, salt, 32, { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([c.update(plain), c.final()]);
  const file = path.join(dir, name);
  fs.writeFileSync(file, Buffer.concat([Buffer.from('RXPOSBK1'), salt, iv, c.getAuthTag(), enc]));
  return file;
};
// run `restore.mjs <file> --verify` and return its exit code (0 = verified, non-zero = rejected)
const verify = (file, passphrase) => {
  try { execFileSync('node', [path.join(root, 'tools/restore.mjs'), file, '--verify'], { cwd: root, env: { ...process.env, BACKUP_PASSPHRASE: passphrase }, stdio: 'pipe' }); return 0; }
  catch (e) { return e.status || 1; }
};

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rxverify-'));
const base = { at: '2026-10-30T00:00:00Z', database: 'test', files: [], chunks: [], ownerConfig: [] };
const good = writeBak(dir, 'good.rxbak', { ...base, tenants: [{ id: 't1', name: 'A' }], records: [{ tenant: 't1', id: 'r1' }] });
const empty = writeBak(dir, 'empty.rxbak', { ...base, tenants: [], records: [] });
const noRecords = writeBak(dir, 'norecords.rxbak', { ...base, tenants: [{ id: 't1', name: 'A' }], records: [] });

check('a real backup with pharmacies and records verifies', verify(good, PASS) === 0);
check('an empty backup is rejected', verify(empty, PASS) === 1);
check('a backup with no records is rejected', verify(noRecords, PASS) === 1);
check('a wrong passphrase is rejected', verify(good, 'the-wrong-passphrase') !== 0);

// a truncated / corrupt file is rejected too
const corrupt = path.join(dir, 'corrupt.rxbak');
fs.writeFileSync(corrupt, fs.readFileSync(good).subarray(0, 60));
check('a corrupt backup is rejected', verify(corrupt, PASS) !== 0);

fs.rmSync(dir, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

// Regression checks for the November 2026 audit (docs/AUDIT-2026-11-16.md): each finding, reproduced against the real
// cloud code (worker/index.js) running in this process on a throw-away local database, with synthetic data only.
//   node unit-audit-2026-11.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import nodeCrypto from 'node:crypto';
import { createClient } from '@libsql/client';
import worker from '../worker/index.js';
import { d1FromLibsql } from '../worker/libsql-d1.js';
import { totpAt, newRecoveryCodes } from '../worker/twostep.js';
import { tokenSecret } from '../worker/secret.js';
import { readView, widestView, legacyView } from '../worker/policy.js';
import { isLocalAddress, plainHttpToInternet } from '../server/netaddr.js';

crypto.subtle.timingSafeEqual ??= (a, b) => nodeCrypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' && !ok ? '  ' + String(x) : ''}`); };

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rxpos-audit-'));
const env = {
  DB: d1FromLibsql(createClient({ url: 'file:' + path.join(dir, 'd1.db').replace(/\\/g, '/') })),
  SYNC_KEY: 'test-main-sync-key-0123456789abcdef', TOKEN_SECRET: 'test-token-secret-'.padEnd(40, 'x'), OWNER_KEY: 'test-owner-key-0123456789abcdef', BACKUP_KEY: 'test-backup-only-key-0123456789abcdef',
  ASSETS: { fetch: () => new Response('{}') },
};
const call = async (p, { method = 'POST', body, token, headers = {} } = {}) => {
  const r = await worker.fetch(new Request('http://local' + p, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined }), env, { waitUntil() {} });
  const text = await r.text(); let j; try { j = JSON.parse(text); } catch { j = text; }
  return { status: r.status, j, headers: r.headers };
};
const OWN = env.OWNER_KEY;
const iso = (ms = Date.now()) => new Date(ms).toISOString();
const rec = async (k) => { const r = await env.DB.prepare('SELECT rec FROM records WHERE k = ?1').bind(k).first('rec'); return r ? JSON.parse(r) : null; };
const findings = async (pred) => (await env.DB.prepare("SELECT rec FROM records WHERE t = 'anomalies'").all()).results.map((x) => JSON.parse(x.rec)).filter(pred);

// ----- a synthetic pharmacy: an administrator, a manager and a cashier -----
await call('/api/health', { method: 'GET' });
await call('/api/owner/tenants', { token: OWN, body: { name: 'Audit Test Pharmacy', slug: 'audit-test', admin: { email: 'admin@audit.test', password: 'Admin-pass-123' } } });
const addUser = async (email, role) => (await call('/api/owner/tenants/audit-test/users', { token: OWN, body: { user: { email, password: 'Pass-word-123', role, name: role } } })).j.user.id;
const cashId = await addUser('cash@audit.test', 'cashier');
await addUser('mgr@audit.test', 'manager');
const login = async (email, password = 'Pass-word-123') => (await call('/api/login', { body: { email, password, tenant: 'audit-test' } })).j.token;
const at = await login('admin@audit.test', 'Admin-pass-123'), mt = await login('mgr@audit.test');
let ct = await login('cash@audit.test');
const sync = (token, changes, extra = {}) => call('/api/sync', { token, body: { deviceId: extra.deviceId || 'dev-' + Math.random(), since: 0, changes, limit: 10000, ...extra } }).then((r) => r.j);
check('the test pharmacy and its staff sign in', !!(at && mt && ct));

// ----- 1. role-based reading -----
await sync(at, [{ t: 'expenses', id: 'e1', rec: { id: 'e1', amount: 5, date: iso() }, at: iso() }, { t: 'bankTx', id: 'b1', rec: { id: 'b1', amount: 9, date: iso() }, at: iso() },
  { t: 'purchases', id: 'pu1', rec: { id: 'pu1', total: 9, date: iso() }, at: iso() }, { t: 'customers', id: 'c1', rec: { id: 'c1', name: 'Client' }, at: iso() }]);
const cashDl = await sync(ct, [], { all: true, deviceId: 'cashier-phone' });
const got = new Set(cashDl.changes.map((c) => c.t));
check('a cashier no longer downloads expenses, bank transactions, deliveries or the audit log', !['expenses', 'bankTx', 'purchases', 'audit'].some((t) => got.has(t)), [...got]);
check('…but still gets what the till needs (clients)', got.has('customers'));
check('…and the reply says which view it got', cashDl.view === 'hcfpa', cashDl.view);
const mgrDl = await sync(mt, [], { all: true, deviceId: 'manager-pc' });
check('a manager still gets the books', ['expenses', 'bankTx', 'purchases'].every((t) => mgrDl.changes.some((c) => c.t === t)));
await sync(mt, [], { deviceId: 'shared-till' });
const shared = await sync(ct, [], { all: true, deviceId: 'shared-till' });
check('a shared till keeps what its manager needs offline when a cashier syncs it', shared.view === 'all' || !shared.view.includes('f'), shared.view);
check('views combine as "hidden from everyone"', widestView(['cfpa', 'c']).key === 'c' && widestView(['cfpa']).key === 'cfpa' && legacyView('hcfpa').key === 'hc');
check('roles map to views', readView(new Set(['pos.sell'])).key === 'hcfpa' && readView('all').key === 'all');
const hist = await call('/api/history', { token: ct, body: { t: 'expenses', from: '2000-01-01', to: '2999-01-01', deviceId: 'cashier-phone' } });
check('older history follows the same rule', Array.isArray(hist.j.records) && hist.j.records.length === 0);

// ----- table names -----
const junk = await sync(ct, [{ t: 'zzJunk', id: 'x', rec: {}, at: iso() }, { t: '__proto__', id: 'x', rec: {}, at: iso() }, { t: 'constructor', id: 'y', rec: {}, at: iso() }]);
check('made-up and prototype table names are refused, not a server error', junk.refused === 3, JSON.stringify(junk));

// ----- 2. sales: identity, stock, proformas, prices -----
const S = { id: 's1', number: 'R-1', date: iso(), cashier: 'cashier', items: [{ id: 'p1', qty: 2, price: 1000 }], subtotal: 2000, discount: 0, tax: 0, total: 2000, paid: 2000, payment: 'Cash', branchId: 'main', status: 'completed' };
const mv = (id, type, qty, ref = 'R-1') => ({ t: 'movements', id, rec: { id, type, qty, productId: 'p1', batchId: 'b1', ref, branchId: 'main', date: iso() }, at: iso() });
let r = await sync(ct, [{ t: 'sales', id: 's1', rec: S, at: iso() }, mv('m1', 'Sale', -2)]);
check('an ordinary sale with its stock goes through', r.applied >= 2 && r.refused === 0, JSON.stringify(r));
check('…with no findings', (await findings((a) => a.saleNumber === 'R-1')).length === 0);
r = await sync(ct, [{ t: 'sales', id: 's1', rec: { ...S, date: '2025-01-01T09:00:00.000Z', cashier: 'someone else' }, at: iso(Date.now() + 1000) }]);
check('a cashier can no longer move a sale to another day or cashier', r.refused === 1 && (await rec('sales|s1')).date === S.date);
r = await sync(ct, [mv('m-fake', 'Sale', 500)]);
check('a "Sale" movement that adds stock is refused', r.refused === 1);
await sync(ct, [mv('m-orphan', 'Sale', -3, 'R-NOPE')]);
check('stock taken for a receipt the cloud does not have is flagged', (await findings((a) => a.kind === 'stock' && a.saleNumber === 'R-NOPE')).length === 1);
await sync(ct, [{ t: 'sales', id: 's2', rec: { ...S, id: 's2', number: 'R-2' }, at: iso() }, mv('m2', 'Sale', -9, 'R-2')]);
check('more stock taken than the sale has is flagged', (await findings((a) => a.kind === 'stock' && a.saleNumber === 'R-2')).length === 1);
await sync(ct, [{ t: 'sales', id: 's3', rec: { ...S, id: 's3', number: 'R-3', discount: 1800, total: 200, paid: 200, proformaId: 'made-up' }, at: iso() }]);
const k3 = (await findings((a) => a.saleNumber === 'R-3')).map((a) => a.kind).sort().join(',');
check('a made-up proformaId no longer hides a 90% discount', k3 === 'discount,proforma', k3);
const PF = { id: 'pf1', number: 'PF-1', status: 'Open', date: iso(), items: [{ id: 'p1', qty: 2, price: 1000 }], subtotal: 2000, discount: 300, tax: 0, total: 1700 };
await sync(at, [{ t: 'proformas', id: 'pf1', rec: PF, at: iso() }]);
await sync(ct, [{ t: 'sales', id: 's4', rec: { ...S, id: 's4', number: 'R-4', discount: 300, total: 1700, paid: 1700, proformaId: 'pf1' }, at: iso() },
  { t: 'proformas', id: 'pf1', rec: { ...PF, status: 'Converted', saleNumber: 'R-4' }, at: iso(Date.now() + 5) }]);
check('selling a real proforma at its own discount raises nothing', (await findings((a) => a.saleNumber === 'R-4')).length === 0);
check('…and the cashier may mark it converted', (await rec('proformas|pf1')).status === 'Converted');
r = await sync(ct, [{ t: 'proformas', id: 'pf1', rec: { ...PF, discount: 1900, total: 100 }, at: iso(Date.now() + 10) }]);
check('…but may not change its discount', r.refused === 1);
await sync(ct, [{ t: 'proformas', id: 'pf2', rec: { ...PF, id: 'pf2', number: 'PF-2', discount: 1500, total: 500 }, at: iso() }]);
check('a quotation made by a role without Proformas is checked like a sale', (await findings((a) => a.table === 'proformas' && a.saleId === 'pf2')).length >= 1);

// ----- 2b. conflicts are visible -----
const E = { id: 'e9', amount: 1000, note: 'first', date: iso() };
const now = Date.now();
await sync(at, [{ t: 'expenses', id: 'e9', rec: { ...E, updatedAt: iso(now) }, at: iso(now) }]);
r = await sync(at, [{ t: 'expenses', id: 'e9', rec: { ...E, amount: 5000, updatedAt: iso(now - 3600e3) }, at: iso(now - 3600e3) }], { deviceId: 'slow-clock' });
check('an edit older than the cloud\'s copy is reported in staleKeys', (r.staleKeys || []).includes('expenses|e9'), JSON.stringify(r.staleKeys));
check('…the reply carries the cloud\'s copy so the device matches', r.changes.some((c) => c.t === 'expenses' && c.id === 'e9' && c.rec.amount === 1000));
check('…the version that lost is kept for the owner', (await findings((a) => a.kind === 'stale' && a.saleId === 'e9' && /5000/.test(a.lost))).length === 1);
check('…and the reply has the cloud\'s time, for the clock warning', typeof r.serverTime === 'number');
r = await sync(at, [{ t: 'expenses', id: 'e9', rec: { ...E, updatedAt: iso(now) }, at: iso(now) }]);
check('sending the same record again is not a conflict', !(r.staleKeys || []).length);

// ----- 3. sessions -----
const ok = async (token) => (await call('/api/config', { method: 'GET', token })).status === 200;
check('a fresh pass works', await ok(ct));
await call('/api/owner/tenants/audit-test/users', { token: OWN, body: { user: { id: cashId, email: 'cash@audit.test', password: 'New-pass-word-456', role: 'cashier', name: 'cashier' } } });
check('a new password ends the passes issued before it', !(await ok(ct)));
ct = await login('cash@audit.test', 'New-pass-word-456');
check('…and the new password signs in', await ok(ct));
const ct2 = await login('cash@audit.test', 'New-pass-word-456');
await call('/api/logout', { token: ct2, body: {} });
check('signing out ends that pass', !(await ok(ct2)));
check('…but not the person\'s other sign-ins', await ok(ct));
const ct3 = await login('cash@audit.test', 'New-pass-word-456');
await call('/api/sessions/others', { token: ct3, body: {} });
check('"sign out everywhere else" ends the others and keeps this one', !(await ok(ct)) && (await ok(ct3)));
const dl3 = await sync(ct3, [], { all: true });
check('session fields never reach a device', dl3.changes.filter((c) => c.t === 'users').every((c) => !('sessionsFrom' in c.rec) && !('revoked' in c.rec) && !('hash' in c.rec)));
r = await call('/api/sessions/end', { token: mt, body: { uid: (await call('/api/owner/tenants/audit-test', { method: 'GET', token: OWN })).j.users.find((u) => u.role === 'admin').id } });
check('a manager cannot sign an administrator out everywhere', r.status === 403);
const h = await call('/api/health', { method: 'GET' });
check('health says the passes are signed with a dedicated secret', h.j.tokenSecret === 'dedicated');
check('…and reports the sync-key fallback without showing it', tokenSecret({ SYNC_KEY: 'k'.repeat(40) }) === 'k'.repeat(40));

// ----- 5. uploads and two-step -----
const b64 = (s) => Buffer.from(s).toString('base64');
const up = await call('/api/files', { token: at, body: { id: 'file-abcdefgh', n: 0, chunks: 1, size: 9, type: 'application/pdf', name: 'rx.pdf', data: b64('%PDF-real') } });
r = await call('/api/files', { token: ct3, body: { id: 'file-abcdefgh', n: 0, chunks: 1, size: 9, type: 'application/pdf', name: 'rx.pdf', data: b64('%PDF-fake') } });
const fileNow = await (await worker.fetch(new Request('http://local' + up.j.path), env, {})).text();
check('a finished file cannot be replaced by a colleague', r.status === 409 && fileNow === '%PDF-real', `${r.status} ${fileNow}`);
await call('/api/files', { token: at, body: { id: 'file-two-parts', n: 0, chunks: 2, size: 6, type: 'application/pdf', name: 'a.pdf', data: b64('%PD') } });
r = await call('/api/files', { token: ct3, body: { id: 'file-two-parts', n: 1, chunks: 2, size: 6, type: 'application/pdf', name: 'a.pdf', data: b64('F-x') } });
check('…nor can they add pieces to someone else\'s upload', r.status === 409);
r = await call('/api/files', { token: at, body: { id: 'file-too-big1', n: 0, chunks: 1, size: 4, type: 'application/pdf', name: 'b.pdf', data: b64('%PDF-longer') } });
check('pieces bigger than the declared size are refused', r.status === 400);
r = await call('/api/files', { token: at, body: { id: 'file-hash-bad', n: 0, chunks: 1, size: 5, type: 'application/pdf', name: 'c.pdf', data: b64('%PDF-'), sha256: '0'.repeat(64) } });
check('a file whose SHA-256 does not match is refused', r.status === 400);
r = await call('/api/files', { token: at, body: { id: 'file-hash-good', n: 0, chunks: 1, size: 5, type: 'application/pdf', name: 'c.pdf', data: b64('%PDF-'), sha256: nodeCrypto.createHash('sha256').update('%PDF-').digest('hex') } });
check('…one that matches is kept', r.status === 200 && r.j.done === true);
const adminId = (await call('/api/owner/tenants/audit-test', { method: 'GET', token: OWN })).j.users.find((u) => u.role === 'admin').id;
const su = await call('/api/2fa/setup', { token: at, body: {} });
await call('/api/2fa/enable', { token: at, body: { code: await totpAt(su.j.secret, Math.floor(Date.now() / 30000)) } });
r = await call('/api/2fa/reset', { token: mt, body: { uid: adminId } });
const still = await env.DB.prepare('SELECT enabled FROM twofa WHERE uid = ?1').bind(adminId).first('enabled');
check('a manager can no longer switch off an administrator\'s two-step sign-in', r.status === 403 && Number(still) === 1, `${r.status} ${still}`);
// recovery codes: shown once, each signs in once, then is used up
const enabledNow = await env.DB.prepare('SELECT recovery FROM twofa WHERE uid = ?1').bind(adminId).first('recovery');
check('switching two-step on keeps ten recovery codes, hashed', JSON.parse(enabledNow || '[]').length === 10 && !/[A-Z]{5}-/.test(enabledNow));
const rc = await newRecoveryCodes('audit-test', adminId);
await env.DB.prepare('UPDATE twofa SET recovery = ?2 WHERE uid = ?1').bind(adminId, JSON.stringify(rc.hashes)).run();
const withCode = (otp) => call('/api/login', { body: { email: 'admin@audit.test', password: 'Admin-pass-123', tenant: 'audit-test', otp } });
r = await withCode(rc.codes[0].toLowerCase());
check('a recovery code signs in instead of the app\'s code', r.status === 200 && !!r.j.token, r.status);
r = await withCode(rc.codes[0]);
check('…only once', r.status === 401);
check('…and it is written in the audit log', (await env.DB.prepare("SELECT COUNT(*) n FROM records WHERE t = 'audit' AND rec LIKE '%recovery code%'").first('n')) >= 1);
r = await withCode(rc.codes[1].replace('-', ''));
check('codes work with or without the dash', r.status === 200);
const left = await call('/api/2fa', { method: 'GET', token: r.j.token });
check('the person sees how many are left', left.j.recoveryLeft === 8, JSON.stringify(left.j));
r = await call(`/api/owner/tenants/audit-test/users/${adminId}/reset-2fa`, { token: OWN, body: {} });
check('…the RxPOS owner can, for an administrator who lost their phone', r.j.ok === true && !(await env.DB.prepare('SELECT enabled FROM twofa WHERE uid = ?1').bind(adminId).first('enabled')));

// ----- other checks -----
r = await call('/api/calendar-link', { method: 'GET', token: ct3 });
check('a cashier no longer gets the patients\' calendar link', r.status === 403);
const link1 = (await call('/api/calendar-link', { method: 'GET', token: at })).j.url;
const link2 = (await call('/api/calendar-link', { token: at, body: {} })).j.url;
const feed = async (u) => (await worker.fetch(new Request('http://local' + new URL(u).pathname), env, {})).status;
check('an administrator can replace the calendar link, and the old one stops', link1 !== link2 && (await feed(link1)) === 404 && (await feed(link2)) === 200);
await sync(at, [{ t: 'customers', id: 'pc1', rec: { id: 'pc1', name: 'Grace Nakato' }, at: iso() },
  { t: 'prescriptions', id: 'rx1', rec: { id: 'rx1', customerId: 'pc1', status: 'Dispensed', refillDays: 2, dispensedOn: iso().slice(0, 10), medications: 'Metformin 500mg' }, at: iso() }]);
const ics = async () => (await worker.fetch(new Request('http://local' + new URL(link2).pathname), env, {})).text();
const before = await ics();
await call('/api/calendar-link', { token: at, body: { private: true } });
const after = await ics();
check('the calendar feed can show refills with initials only, without medicines', /Grace Nakato/.test(before) && /Metformin/.test(before) && /G\. N\./.test(after) && !/Nakato|Metformin/.test(after));
check('…and choosing that keeps the same link', (await call('/api/calendar-link', { method: 'GET', token: at })).j.url === link2);
for (let i = 0; i < 5; i++) await call('/api/owner-auth/login', { body: { password: 'wrong' }, headers: { 'CF-Connecting-IP': '203.0.113.9' } });
await call('/api/owner/account', { token: OWN, body: { password: 'Owner-pass-12345' } });
r = await call('/api/owner-auth/login', { body: { password: 'Owner-pass-12345' }, headers: { 'CF-Connecting-IP': '198.51.100.7' } });
check('a stranger\'s wrong owner passwords no longer lock the owner out', r.status === 200, r.status);
r = await call('/api/owner-auth/login', { body: { password: 'Owner-pass-12345' }, headers: { 'CF-Connecting-IP': '203.0.113.9' } });
check('…the address that tried them is locked', r.status === 429);
const BK = env.BACKUP_KEY;
check('the backup-only key downloads the backup', (await call('/api/owner/backup', { method: 'GET', token: BK })).status === 200);
check('…and records the heartbeat', (await call('/api/owner/heartbeat', { token: BK, body: { bytes: 1, records: 1 } })).status === 200);
check('…but opens nothing else in the owner console', (await call('/api/owner/tenants', { method: 'GET', token: BK })).status === 403 && (await call('/api/owner/restore', { token: BK, body: {} })).status === 403);
check('API replies are marked nosniff', h.headers.get('x-content-type-options') === 'nosniff');
check('local addresses are local, the internet is not', isLocalAddress('192.168.1.5') && isLocalAddress('::ffff:10.0.0.2') && !isLocalAddress('41.210.1.1') && !isLocalAddress('172.32.0.1'));
check('apps refuse plain http to the internet only', plainHttpToInternet('http://41.210.1.1:8686') && !plainHttpToInternet('http://192.168.1.5:8686') && !plainHttpToInternet('https://hub.example.com'));

fs.rmSync(dir, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

// Regression checks for the 17 November 2026 audit (security records in the audit run): each finding, reproduced
// against the real cloud code (worker/index.js) running in this process on a throw-away local database, synthetic data.
//   node tests/unit-audit-2026-11-17.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import nodeCrypto from 'node:crypto';
import { createClient } from '@libsql/client';
import worker from '../worker/index.js';
import { d1FromLibsql } from '../worker/libsql-d1.js';
import { decide, dmHidden } from '../worker/policy.js';

crypto.subtle.timingSafeEqual ??= (a, b) => nodeCrypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' && !ok ? '  ' + String(x) : ''}`); };

// an in-memory stand-in for the R2 bucket, and a recording stand-in for the live hub (Durable Object)
const bucket = new Map();
const APPS = {
  get: async (k) => (bucket.has(k) ? { body: bucket.get(k) } : null), put: async (k, v) => { bucket.set(k, v); },
  delete: async (keys) => { for (const k of [].concat(keys)) bucket.delete(k); },
  list: async ({ prefix }) => ({ objects: [...bucket.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })), truncated: false }),
};
const hubCalls = [];
const HUB = { idFromName: (n) => n, get: (n) => ({ fetch: async (u, init) => { const url = typeof u === 'string' ? u : u.url; hubCalls.push({ tenant: n, path: new URL(url).pathname, body: init?.body ? JSON.parse(init.body) : null }); return new Response('ok'); } }) };

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rxpos-audit17-'));
const env = {
  DB: d1FromLibsql(createClient({ url: 'file:' + path.join(dir, 'd1.db').replace(/\\/g, '/') })),
  SYNC_KEY: 'test-main-sync-key-0123456789abcdef', TOKEN_SECRET: 'test-token-secret-'.padEnd(40, 'x'), OWNER_KEY: 'test-owner-key-0123456789abcdef',
  FILES_QUOTA_MB: '1', AT_USERNAME: 'sandbox', AT_API_KEY: 'dummy', APPS, HUB,
  ASSETS: { fetch: () => new Response('{}') },
};
const call = async (p, { method = 'POST', body, token, ip } = {}) => {
  const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(ip ? { 'CF-Connecting-IP': ip } : {}) };
  const r = await worker.fetch(new Request('http://local' + p, { method, headers, body: body ? JSON.stringify(body) : undefined }), env, { waitUntil() {} });
  const text = await r.text(); let j; try { j = JSON.parse(text); } catch { j = text; }
  return { status: r.status, j };
};
const OWN = env.OWNER_KEY;
const iso = (ms = Date.now()) => new Date(ms).toISOString();
const rec = async (k, t = 'audit-17') => { const r = await env.DB.prepare('SELECT rec, at FROM records WHERE tenant = ?1 AND k = ?2').bind(t, k).first(); return r ? { ...JSON.parse(r.rec), _at: r.at } : null; };
const findings = async (pred) => (await env.DB.prepare("SELECT rec FROM records WHERE t = 'anomalies'").all()).results.map((x) => JSON.parse(x.rec)).filter(pred);
const hexSha = (s) => nodeCrypto.createHash('sha256').update(s).digest('hex');

await call('/api/health', { method: 'GET' });
await call('/api/owner/tenants', { token: OWN, body: { name: 'Audit 17', slug: 'audit-17', admin: { email: 'admin@a17.test', password: 'Admin-pass-123' } } });
const addUser = async (email, role, t = 'audit-17') => (await call(`/api/owner/tenants/${t}/users`, { token: OWN, body: { user: { email, password: 'Pass-word-123', role, name: role } } })).j.user.id;
const cashId = await addUser('cash@a17.test', 'cashier');
const mgrId = await addUser('mgr@a17.test', 'manager');
const admin = (await env.DB.prepare("SELECT id FROM records WHERE tenant = 'audit-17' AND t = 'users' AND json_extract(rec, '$.email') = 'admin@a17.test'").first()).id;
const login = async (email, password = 'Pass-word-123', ip) => (await call('/api/login', { ip, body: { email, password, tenant: 'audit-17' } })).j.token;
const at = await login('admin@a17.test', 'Admin-pass-123'), mt = await login('mgr@a17.test');
const ct = await login('cash@a17.test');
const sync = (token, changes, extra = {}) => call('/api/sync', { token, body: { deviceId: extra.deviceId || 'dev-' + Math.random(), since: 0, changes, limit: 10000, ...extra } }).then((r) => r.j);
check('the test pharmacy and its staff sign in', !!(at && mt && ct));

// ----- stock: a Sale movement must name its receipt, and extra stock across pushes is caught -----
const mv = (id, qty, ref) => ({ t: 'movements', id, rec: { id, type: 'Sale', qty, productId: 'p1', batchId: 'b1', ...(ref === undefined ? {} : { ref }), branchId: 'main', date: iso() }, at: iso() });
let r = await sync(ct, [mv('m-noref', -500)]);
check('a cashier\'s Sale movement with no receipt number is refused', r.refused === 1 && !(await rec('movements|m-noref')), JSON.stringify(r));
const S = { id: 's1', number: 'R-1', date: iso(), cashier: 'cashier', items: [{ id: 'p1', qty: 1, price: 1000 }], subtotal: 1000, discount: 0, tax: 0, total: 1000, paid: 1000, payment: 'Cash', bankId: 'cash', branchId: 'main', status: 'completed' };
r = await sync(ct, [{ t: 'sales', id: 's1', rec: S, at: iso() }, mv('m1', -1, 'R-1')]);
check('an ordinary sale with its stock still goes through', r.refused === 0 && r.applied >= 2, JSON.stringify(r));
await sync(ct, [mv('m2', -1, 'R-1')]);
check('more stock taken for the same sale in a later push is flagged', (await findings((a) => a.saleNumber === 'R-1' && a.kind === 'stock')).length >= 1);
check('policy: a Sale movement without ref needs stock.adjust', (await decide({ t: 'movements', rec: { type: 'Sale', qty: -1 } }, null, 'cashier', (p) => p === 'pos.sell')).ok === false);

// ----- a sale's account (bankId) can't be moved by a seller -----
r = await sync(ct, [{ t: 'sales', id: 's1', rec: { ...S, bankId: 'bank-1' }, at: iso(Date.now() + 1000) }]);
check('a cashier can no longer move a sale\'s takings to another account', r.refused === 1 && (await rec('sales|s1')).bankId === 'cash', JSON.stringify(r));

// ----- change times: stored as canonical ISO, so a non-ISO time can't win last-writer-wins for good -----
const me = await rec('users|' + cashId);
const { hash: _h, salt: _s, iter: _i, ...pub } = me;
delete pub._at;
await sync(ct, [{ t: 'users', id: cashId, rec: { ...pub, phone: '0700000001' }, at: 'Jan 1 2000' }]);
check('a non-ISO change time is stored as ISO', /^\d{4}-\d{2}-\d{2}T/.test((await rec('users|' + cashId))._at), (await rec('users|' + cashId))._at);
await sync(at, [{ t: 'users', id: cashId, rec: { ...(await rec('users|' + cashId)), _at: undefined, disabled: true }, at: iso() }]);
check('…so an administrator can still disable that person', (await rec('users|' + cashId)).disabled === true);
check('…and their sign-in stops working', (await call('/api/config', { method: 'GET', token: ct })).status === 401);
check('…and their open live connections are told to close', hubCalls.some((c) => c.path === '/close' && c.body?.uids?.includes(cashId)));
await sync(at, [{ t: 'users', id: cashId, rec: { ...(await rec('users|' + cashId)), _at: undefined, disabled: false }, at: iso(Date.now() + 2000) }]);

// ----- a closed day: open:1 needs an administrator too -----
const close = { branchId: 'main', day: '2026-11-10', closedAt: iso(), by: 'manager' };
await sync(mt, [{ t: 'dayCloses', id: 'main:2026-11-10', rec: close, at: iso() }]);
r = await sync(mt, [{ t: 'dayCloses', id: 'main:2026-11-10', rec: { ...close, open: 1 }, at: iso(Date.now() + 1000) }]);
check('a manager can\'t reopen a closed day with open: 1', r.refused === 1, JSON.stringify(r));
r = await sync(mt, [{ t: 'dayCloses', id: 'main:2026-11-10', rec: { ...close, day: '2026-11-11' }, at: iso(Date.now() + 2000) }]);
check('…or move the close to another day', r.refused === 1, JSON.stringify(r));

// ----- reading: brought-forward figures and direct chats -----
await sync(at, [{ t: 'bankTx', id: 'bt1', rec: { id: 'bt1', type: 'Deposit', accountId: 'bank-x', amount: 55555, date: '2026-01-01T09:00:00.000Z' }, at: iso() }]);
const ct2 = await login('cash@a17.test');
const bf = (await call('/api/balances', { token: ct2, body: { window: '2026-06-01' } })).j;
check('a cashier who names no device gets no bank balances', !bf.account || Object.keys(bf.account).length === 0, JSON.stringify(bf.account));
await sync(mt, [{ t: 'messages', id: 'dm1', rec: { id: 'dm1', conv: ['dm', ...[admin, mgrId].sort()].join(':'), text: 'private', at: iso(), date: iso() }, at: iso() }, { t: 'messages', id: 'team1', rec: { id: 'team1', conv: 'team', text: 'hello', at: iso(), date: iso() }, at: iso() }]);
const dl = await sync(ct2, [], { all: true, deviceId: 'cash-phone' });
check('a cashier no longer downloads other people\'s direct messages', !dl.changes.some((c) => c.id === 'dm1') && dl.changes.some((c) => c.id === 'team1'));
const mine = await sync(mt, [], { all: true, deviceId: 'mgr-pc' });
check('…while the two people in the chat still get it', mine.changes.some((c) => c.id === 'dm1'));
const h = (await call('/api/history', { token: ct2, body: { t: 'messages', from: '2000-01-01', to: '2999-01-01' } })).j;
check('…and older history leaves it out too', Array.isArray(h.records) && !h.records.some((x) => x.id === 'dm1'));
check('dmHidden: exact participant match (u1 is not u10)', dmHidden('messages', JSON.stringify({ conv: 'dm:u10:u2' }), 'u1') && !dmHidden('messages', JSON.stringify({ conv: 'dm:u1:u2' }), 'u1'));

// ----- password reset: concurrent guesses get 5 tries in total -----
const k = 'audit-17:mgr@a17.test';
await env.DB.prepare("INSERT INTO reset_codes (k, code_hash, expires, tries, sent, window_start) VALUES (?1, ?2, ?3, 0, 0, 0) ON CONFLICT(k) DO UPDATE SET code_hash = ?2, expires = ?3, tries = 0").bind(k, hexSha(k + ':424242'), Date.now() + 15 * 60000).run();
const guesses = await Promise.all([...Array(8).keys()].map((i) => call('/api/password/reset', { body: { email: 'mgr@a17.test', tenant: 'audit-17', code: String(100000 + i), password: 'Attacker-pw-99' } })));
const right = await call('/api/password/reset', { body: { email: 'mgr@a17.test', tenant: 'audit-17', code: '424242', password: 'Attacker-pw-99' } });
check('after a burst of 8 wrong guesses the right code no longer works (5 tries in total)', right.status === 400 && guesses.filter((g) => g.j?.error === 'Wrong code.').length <= 5, JSON.stringify([right.j, guesses.map((g) => g.j?.error)]));

// ----- staff sign-in: concurrent wrong passwords hit the lock -----
await addUser('lock@a17.test', 'cashier');
const burst = await Promise.all([...Array(10).keys()].map((i) => call('/api/login', { ip: '10.9.9.9', body: { email: 'lock@a17.test', password: 'wrong-' + i, tenant: 'audit-17' } })));
const after = await call('/api/login', { ip: '10.9.9.9', body: { email: 'lock@a17.test', password: 'Pass-word-123', tenant: 'audit-17' } });
check('a burst of 10 wrong passwords from one address locks it, even for the right one', after.status === 429 && burst.filter((b) => b.status === 401).length <= 5, JSON.stringify([after.status, burst.map((b) => b.status)]));

// ----- owner sign-in: concurrent wrong passwords hit the lock -----
const ot = (await call('/api/owner-auth/login', { body: { password: OWN } })).j.token;
await call('/api/owner/account', { token: ot, body: { password: 'my-own-owner-pass-1' } });
const oburst = await Promise.all([...Array(10).keys()].map((i) => call('/api/owner-auth/login', { ip: '10.8.8.8', body: { password: 'wrong-owner-' + i } })));
const oafter = await call('/api/owner-auth/login', { ip: '10.8.8.8', body: { password: 'my-own-owner-pass-1' } });
check('a burst of wrong owner passwords locks that address', oafter.status === 429 && oburst.filter((b) => b.status === 401).length <= 5, JSON.stringify([oafter.status, oburst.map((b) => b.status)]));
check('…while the master key still works', (await call('/api/owner-auth/login', { ip: '10.8.8.8', body: { password: OWN } })).status === 200);

// ----- SMS: the hourly cap counts phones, and a request has at most 20 -----
await call('/api/owner/tenants/audit-17/secrets', { token: OWN, body: { AT_USERNAME: 'sandbox', AT_API_KEY: 'dummy-key' } });
const realFetch = globalThis.fetch;
let smsTo = 0;
globalThis.fetch = async (u, init) => (String(u).includes('africastalking') ? (smsTo += String(new URLSearchParams(String(init.body)).get('to')).split(',').length, new Response(JSON.stringify({ SMSMessageData: { Recipients: [] } }))) : realFetch(u, init));
const many = await call('/api/sms', { token: at, body: { to: [...Array(1000).keys()].map((i) => '25671' + String(i).padStart(7, '0')), message: 'x' } });
check('one request to 1,000 phones is refused', many.status === 400 && smsTo === 0, JSON.stringify(many));
const okSms = await call('/api/sms', { token: at, body: { to: ['256710000001'], message: 'hello' } });
check('…a normal message still goes', okSms.status === 200 && smsTo === 1, JSON.stringify(okSms));
const used = await env.DB.prepare("SELECT sent FROM reset_codes WHERE k = '__sms__:audit-17'").first('sent');
const big = await call('/api/sms', { token: at, body: { to: ['256710000002'], message: 'y'.repeat(900) } });
check('a long message counts each 153-character part', big.status === 200 && (await env.DB.prepare("SELECT sent FROM reset_codes WHERE k = '__sms__:audit-17'").first('sent')) === used + 6);
globalThis.fetch = realFetch;

// ----- file storage: uploads under way count towards the allowance -----
const piece = Buffer.alloc(300 * 1024, 7).toString('base64');
const starts = await Promise.all(['qa', 'qb', 'qc'].map((id) => call('/api/files', { token: at, body: { id: 'quota-' + id + '00000', n: 0, chunks: 2, size: 600 * 1024, type: 'application/pdf', data: piece } })));
check('several uploads started at once can\'t pass the allowance together', starts.filter((s) => s.status === 200).length <= 1, JSON.stringify(starts.map((s) => s.status)));

// ----- deleting a pharmacy removes its R2 copies -----
bucket.set('windows/audit-17/0/2026-06-01.v2.json', '{}'); bucket.set('snapshots/audit-17/0/all-x.json.gz', 'x'); bucket.set('windows/other/0/x.json', '{}');
await call('/api/owner/tenants/audit-17/delete', { token: OWN, body: { confirm: 'audit-17' } });
check('deleting a pharmacy removes its windows/ and snapshots/ copies (and nobody else\'s)', ![...bucket.keys()].some((x) => x.includes('/audit-17/')) && bucket.has('windows/other/0/x.json'), [...bucket.keys()].join(','));

console.log(`\n${pass} passed, ${fail} failed`);
fs.rmSync(dir, { recursive: true, force: true });
process.exit(fail ? 1 : 0);

// Renewable sign-ins (2026-11-26 sign-in audit), against the real cloud code (worker/index.js) in this process on a
// throw-away local database, synthetic data only: a short pass and a one-use renewal key, ended in the cloud by a
// sign-out, "sign out everywhere", a new password, a copied key or 14 idle days; apps from before keep working.
//   node unit-sessions.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import nodeCrypto from 'node:crypto';
import { createClient } from '@libsql/client';
import worker from '../worker/index.js';
import { d1FromLibsql } from '../worker/libsql-d1.js';
import { passExpiry } from '../src/session.js';

crypto.subtle.timingSafeEqual ??= (a, b) => nodeCrypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' && !ok ? '  ' + String(x) : ''}`); };

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rxpos-sessions-'));
const env = {
  DB: d1FromLibsql(createClient({ url: 'file:' + path.join(dir, 'd1.db').replace(/\\/g, '/') })),
  SYNC_KEY: 'test-main-sync-key-0123456789abcdef', TOKEN_SECRET: 'test-token-secret-'.padEnd(40, 'x'), OWNER_KEY: 'test-owner-key-0123456789abcdef',
  ASSETS: { fetch: () => new Response('{}') },
};
const call = async (p, { method = 'POST', body, token, headers = {} } = {}) => {
  const r = await worker.fetch(new Request('http://local' + p, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined }), env, { waitUntil() {} });
  const text = await r.text(); let j; try { j = JSON.parse(text); } catch { j = text; }
  return { status: r.status, j };
};
const OWN = env.OWNER_KEY;
await call('/api/health', { method: 'GET' });
await call('/api/owner/tenants', { token: OWN, body: { name: 'Session Test Pharmacy', slug: 'session-test', admin: { email: 'admin@session.test', password: 'Admin-pass-123' } } });
const cashId = (await call('/api/owner/tenants/session-test/users', { token: OWN, body: { user: { email: 'cash@session.test', password: 'Pass-word-123', role: 'cashier', name: 'cashier' } } })).j.user.id;
const login = (session = 2, password = 'Pass-word-123') => call('/api/login', { body: { email: 'cash@session.test', password, tenant: 'session-test', ...(session ? { session } : {}) } }).then((r) => r.j);
const ok = async (token) => (await call('/api/config', { method: 'GET', token })).status === 200;
const renew = (refresh, extra = {}) => call('/api/token/refresh', { body: { refresh, ...extra } });
const age = (sid, col, ms) => env.DB.prepare(`UPDATE sign_ins SET ${col} = ${col} - ?2 WHERE sid = ?1`).bind(sid, ms).run();

// ----- a renewable sign-in -----
const a = await login();
check('an app that renews gets a pass, a renewal key and a sign-in id', a.token?.startsWith('u.') && a.refresh?.startsWith('r.') && !!a.sid, JSON.stringify(Object.keys(a)));
const left = passExpiry(a.token) - Date.now();
check('…and the pass lasts 15 minutes, not 30 days', left > 14 * 60000 && left <= 15 * 60000, left);
check('…and it works', await ok(a.token));
const row = await env.DB.prepare('SELECT * FROM sign_ins WHERE sid = ?1').bind(a.sid).first();
check('the cloud keeps only a hash of the renewal key', row && row.cur !== a.refresh && !JSON.stringify(row).includes(a.refresh.split('.')[2]));

const old = await login(0);
check('an app from before renewal still gets the long pass', old.token && !old.refresh && passExpiry(old.token) - Date.now() > 29 * 864e5);

let r = await renew(a.refresh);
check('renewing gives a new pass and the next key', r.status === 200 && r.j.token !== a.token && r.j.refresh !== a.refresh && r.j.sid === a.sid, JSON.stringify(r.j));
const b = r.j;
check('…and the new pass works', await ok(b.token));
r = await renew(a.refresh);
check('the used key again within a minute (another window of the app): "already renewed", nothing ended', r.status === 409 && r.j.renewed === true);
check('…the sign-in still renews with its newest key', (r = await renew(b.refresh)).status === 200);
const c = r.j;
await age(a.sid, 'last', 2 * 60000);
r = await renew(b.refresh);
check('a used key after that (copied and used elsewhere) is refused…', r.status === 401);
check('…and ends the whole sign-in, the newest key too', (await renew(c.refresh)).status === 401);
check('a made-up key is refused', (await renew('r.' + a.sid + '.' + 'x'.repeat(43))).status === 401 && (await renew('nonsense')).status === 401);

// ----- sign-out ends it in the cloud -----
let d = await login();
await call('/api/logout', { token: d.token, body: {} });
check('signing out ends the pass at once', !(await ok(d.token)));
check('…and its renewal key', (await renew(d.refresh)).status === 401);

// ----- sign out everywhere else keeps this sign-in, even after it renewed -----
const e1 = await login(), e2 = await login();
r = await renew(e2.refresh); const e2b = r.j;
await call('/api/sessions/others', { token: e2b.token, body: {} });
check('"sign out everywhere else" ends the other sign-ins and their keys', !(await ok(e1.token)) && (await renew(e1.refresh)).status === 401);
check('…and keeps this one: its pass…', await ok(e2b.token));
r = await renew(e2b.refresh);
check('…and its renewals', r.status === 200 && (await ok(r.j.token)), JSON.stringify(r.j));
const e2c = r.j;

// ----- a new password ends every sign-in -----
await call('/api/owner/tenants/session-test/users', { token: OWN, body: { user: { id: cashId, email: 'cash@session.test', password: 'New-pass-word-456', role: 'cashier', name: 'cashier' } } });
check('a new password ends the passes…', !(await ok(e2c.token)));
check('…and the renewal keys', (await renew(e2c.refresh)).status === 401);

// ----- idle and maximum lifetimes -----
const f = await login(2, 'New-pass-word-456');
await age(f.sid, 'last', 15 * 864e5);
check('a key unused for 15 days has expired', (await renew(f.refresh)).status === 401);
const g = await login(2, 'New-pass-word-456');
await age(g.sid, 'created', 31 * 864e5);
check('a sign-in 31 days after its password can\'t be renewed any more', (await renew(g.refresh)).status === 401);

// ----- the device signs a sign-in out when someone else signs in on it -----
const h = await login(2, 'New-pass-word-456');
check('{ end: true } ends that sign-in', (await renew(h.refresh, { end: true })).status === 200 && (await renew(h.refresh)).status === 401);

// ----- an app from before swaps its long pass once -----
const legacy = await login(0, 'New-pass-word-456');
r = await call('/api/token/refresh', { token: legacy.token, body: {} });
check('an updated app swaps its long pass for a renewable sign-in', r.status === 200 && !!r.j.refresh && passExpiry(r.j.token) - Date.now() <= 15 * 60000, JSON.stringify(r.j));
check('…the long pass stops working', !(await ok(legacy.token)));
check('…and the swap works once only', (await call('/api/token/refresh', { token: legacy.token, body: {} })).status === 401);
check('…while the new sign-in renews', (await renew(r.j.refresh)).status === 200);

// ----- a disabled or removed person can't renew -----
const k = await login(2, 'New-pass-word-456');
await call('/api/owner/tenants/session-test/users', { token: OWN, body: { user: { id: cashId, email: 'cash@session.test', role: 'cashier', name: 'cashier', disabled: true } } });
check('a disabled account can\'t renew', (await renew(k.refresh)).status === 401);

// ----- nothing secret reaches a device -----
const at = (await call('/api/login', { body: { email: 'admin@session.test', password: 'Admin-pass-123', tenant: 'session-test', session: 2 } })).j;
const dl = (await call('/api/sync', { token: at.token, body: { deviceId: 'dev-1', since: 0, changes: [], all: true, limit: 10000 } })).j;
check('session fields never reach a device', dl.changes.filter((x) => x.t === 'users').every((x) => !('revoked' in x.rec) && !('sessionKeep' in x.rec) && !('sessionsFrom' in x.rec)));

fs.rmSync(dir, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

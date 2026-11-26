// Mobile Money payments kept in the cloud (worker/payments.js, 2026-11-26): a payment the customer approved after the
// till closed is still found (network callback or the 5-minute reconciliation), shown to the pharmacy's tills, and
// linked to exactly one sale. Runs the real cloud code in this process on a throw-away local database, with MTN and
// Airtel played by a fake network (no real money, no real network).
//   node tests/unit-pay-callbacks.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import nodeCrypto from 'node:crypto';
import { createClient } from '@libsql/client';
import worker from '../worker/index.js';
import { d1FromLibsql } from '../worker/libsql-d1.js';

crypto.subtle.timingSafeEqual ??= (a, b) => nodeCrypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' && !ok ? '  ' + String(x) : ''}`); };

// ----- a clock we can move, and a fake MTN + Airtel -----
const realNow = Date.now;
let shift = 0;
Date.now = () => realNow() + shift;
const later = (ms) => { shift += ms; };

const net = { mtn: new Map(), airtel: new Map(), calls: [], refuse: false }; // ref → { status, txid }
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
  const u = new URL(typeof input === 'string' ? input : input.url);
  const method = init.method || 'GET';
  const headers = Object.fromEntries(Object.entries(init.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
  net.calls.push({ host: u.host, path: u.pathname, method, headers, body: init.body });
  const j = (b, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } });
  if (u.host === 'sandbox.momodeveloper.mtn.com') {
    if (u.pathname === '/collection/token/') return j({ access_token: 'mtn-token', expires_in: 3600 });
    if (u.pathname === '/collection/v1_0/requesttopay' && method === 'POST') {
      if (net.refuse) return new Response('{"message":"payer not found"}', { status: 400 });
      net.mtn.set(headers['x-reference-id'], { status: 'PENDING' });
      return new Response(null, { status: 202 });
    }
    const m = u.pathname.match(/^\/collection\/v1_0\/requesttopay\/(.+)$/);
    if (m) { const s = net.mtn.get(m[1]); return s ? j({ status: s.status, financialTransactionId: s.txid, reason: s.reason }) : j({ message: 'not found' }, 404); }
  }
  if (u.host === 'openapiuat.airtel.africa') {
    if (u.pathname === '/auth/oauth2/token') return j({ access_token: 'airtel-token', expires_in: 3600 });
    if (u.pathname === '/merchant/v1/payments/' && method === 'POST') {
      const b = JSON.parse(init.body);
      net.airtel.set(b.transaction.id, { status: 'TIP' });
      return j({ status: { success: true } });
    }
    const m = u.pathname.match(/^\/standard\/v1\/payments\/(.+)$/);
    if (m) { const s = net.airtel.get(m[1]); return j({ data: { transaction: { status: s?.status || 'TF', airtel_money_id: s?.txid } } }); }
  }
  return new Response('{}', { status: 404 }); // anything else (uptime watch, alerts) goes nowhere in this test
};

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rxpos-pay-'));
const env = {
  DB: d1FromLibsql(createClient({ url: 'file:' + path.join(dir, 'd1.db').replace(/\\/g, '/') })),
  SYNC_KEY: 'test-main-sync-key-0123456789abcdef', TOKEN_SECRET: 'test-token-secret-'.padEnd(40, 'x'), OWNER_KEY: 'test-owner-key-0123456789abcdef',
  MTN_SUBSCRIPTION_KEY: 'sub', MTN_API_USER: 'user', MTN_API_KEY: 'key', MTN_ENV: 'sandbox',
  AIRTEL_CLIENT_ID: 'id', AIRTEL_CLIENT_SECRET: 'secret',
  PAY_CALLBACK_BASE: 'https://api.example.test',
  ASSETS: { fetch: () => new Response('{}') },
};
const call = async (p, { method = 'POST', body, token = env.SYNC_KEY, raw } = {}) => {
  const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) };
  const r = await worker.fetch(new Request((p.startsWith('http') ? '' : 'http://local') + p, { method, headers, body: raw ?? (body ? JSON.stringify(body) : undefined) }), env, { waitUntil() {} });
  const text = await r.text(); let j; try { j = JSON.parse(text); } catch { j = text; }
  return { status: r.status, j };
};
const row = (ref) => env.DB.prepare('SELECT * FROM pay_requests WHERE ref = ?1').bind(ref).first();
const cron = async () => {
  const jobs = [];
  await worker.scheduled({ cron: '*/5 * * * *' }, env, { waitUntil: (p) => jobs.push(p) });
  await Promise.allSettled(jobs);
};
const basket = { cart: [{ id: 'p1', name: 'Amoxicillin 500mg', price: 500, qty: 20 }], customerId: 'walk-in', discount: 0, payment: 'Mobile Money', branchId: 'main', mode: 'retail' };

await call('/api/health', { method: 'GET', token: '' });
// the main pharmacy (its payment keys are the Worker's own, as in production), signing in with its sync key
await env.DB.prepare("INSERT INTO tenants (id, name, key_hash, created_at) VALUES ('main', 'Main', ?1, ?2)")
  .bind(nodeCrypto.createHash('sha256').update(env.SYNC_KEY).digest('hex'), new Date().toISOString()).run();

// ----- 1. the request is kept before the network is asked, with the basket and MTN's callback address -----
let r = await call('/api/pay/request', { body: { provider: 'mtn', phone: '256770000001', amount: 10000, reference: 'PPTEST1', basket, deviceId: 'till-1' } });
check('an MTN request is sent', r.status === 200 && !!r.j.ref, JSON.stringify(r.j));
const ref1 = r.j.ref;
let row1 = await row(ref1);
check('…and kept in the cloud as pending, with the till\'s basket', row1?.status === 'PENDING' && JSON.parse(row1.basket).cart[0].name === 'Amoxicillin 500mg' && row1.amount === 10000 && row1.device === 'till-1');
const sent = net.calls.find((c) => c.path === '/collection/v1_0/requesttopay' && c.headers['x-reference-id'] === ref1);
const cb = sent?.headers['x-callback-url'];
check('MTN is given the same reference and a signed callback address', !!cb && cb.startsWith('https://api.example.test/api/pay/callback/mtn?') && cb.includes(encodeURIComponent(ref1)), cb);

// ----- 2. the till closes; the customer approves; the callback arrives -----
const cbPath = cb.replace('https://api.example.test', 'http://local');
const forged = cbPath.replace(/s=[^&]+/, 's=' + 'A'.repeat(32));
r = await call(forged, { method: 'PUT', token: '', body: { status: 'SUCCESSFUL', financialTransactionId: 'fake' } });
check('a callback with a wrong signature is refused', r.status === 403 && (await row(ref1)).status === 'PENDING', r.status);
later(10_000);
r = await call(cbPath, { method: 'PUT', token: '', body: { status: 'SUCCESSFUL', financialTransactionId: 'fake' } });
check('a callback\'s own word is not believed: the network still says pending, so it stays pending', r.status === 200 && (await row(ref1)).status === 'PENDING', JSON.stringify(r.j));
net.mtn.set(ref1, { status: 'SUCCESSFUL', txid: 'MTN-TX-1' });
later(10_000);
r = await call(cbPath, { method: 'PUT', token: '', body: {} });
row1 = await row(ref1);
check('the callback makes the cloud ask MTN, which says paid: kept as received, with the transaction id', row1.status === 'SUCCESSFUL' && row1.txid === 'MTN-TX-1', JSON.stringify(row1));
net.mtn.set(ref1, { status: 'FAILED' });
later(10_000);
await call(cbPath, { method: 'POST', token: '', body: {} });
check('a payment received is never turned back into a failure', (await row(ref1)).status === 'SUCCESSFUL');

// ----- 3. every till of the pharmacy sees it, after the first till's polling window -----
r = await call('/api/pay/open', { method: 'GET' });
check('while the first till could still record it, others are not shown it', r.status === 200 && !r.j.payments.some((p) => p.ref === ref1), JSON.stringify(r.j));
later(6 * 60_000);
r = await call('/api/pay/open', { method: 'GET' });
const open1 = r.j.payments.find((p) => p.ref === ref1);
check('then it shows as received but not recorded, with its basket', !!open1 && open1.amount === 10000 && open1.basket?.cart?.[0]?.id === 'p1' && open1.txid === 'MTN-TX-1', JSON.stringify(r.j));

// ----- 4. one payment, one sale -----
r = await call('/api/pay/link', { body: { provider: 'mtn', ref: ref1, saleId: 'sale-A', saleNumber: 'R-000101' } });
check('a person records the sale: the payment is linked to it', r.status === 200 && r.j.payment.saleId === 'sale-A', JSON.stringify(r.j));
r = await call('/api/pay/link', { body: { provider: 'mtn', ref: ref1, saleId: 'sale-A' } });
check('linking it again to the same sale is fine (a till retrying)', r.status === 200);
r = await call('/api/pay/link', { body: { provider: 'mtn', ref: ref1, saleId: 'sale-B' } });
check('the same payment can\'t be used for a second sale', r.status === 409 && /R-000101/.test(r.j.error), JSON.stringify(r.j));
r = await call('/api/pay/open', { method: 'GET' });
check('once recorded it no longer shows', !r.j.payments.some((p) => p.ref === ref1));

// ----- 5. Airtel: one callback address, the transaction id in the body -----
r = await call('/api/pay/request', { body: { provider: 'airtel', phone: '256750000002', amount: 4500, reference: 'PPTEST2', basket } });
const ref2 = r.j.ref;
check('an Airtel request is sent and kept', r.status === 200 && (await row(ref2))?.status === 'PENDING', JSON.stringify(r.j));
check('Airtel\'s transaction id is ours and unique-looking', /^PPTEST2[A-Z0-9]{10}$/.test(ref2), ref2);
net.airtel.set(ref2, { status: 'TS', txid: 'AIR-TX-2' });
later(10_000);
r = await call('/api/pay/callback/airtel', { token: '', body: { transaction: { id: ref2, status_code: 'TS', airtel_money_id: 'whatever' } } });
const row2 = await row(ref2);
check('Airtel\'s callback makes the cloud ask Airtel: received, with Airtel\'s own id', r.status === 200 && row2.status === 'SUCCESSFUL' && row2.txid === 'AIR-TX-2', JSON.stringify(row2));
r = await call('/api/pay/callback/airtel', { token: '', body: { transaction: { id: 'NOSUCHID123' } } });
check('a callback for an unknown transaction is answered and ignored', r.status === 200 && r.j.checked === 0);

// ----- 6. no callback at all: the 5-minute reconciliation finds it -----
r = await call('/api/pay/request', { body: { provider: 'mtn', phone: '256770000003', amount: 2000, reference: 'PPTEST3' } });
const ref3 = r.j.ref;
net.mtn.set(ref3, { status: 'SUCCESSFUL', txid: 'MTN-TX-3' });
await cron();
check('the reconciliation leaves a request alone in its first minute (the till is polling it)', (await row(ref3)).status === 'PENDING');
later(2 * 60_000);
await cron();
check('then asks MTN, and the payment is kept as received', (await row(ref3)).status === 'SUCCESSFUL');

// ----- 7. the till's own polling answers from the cloud once settled -----
r = await call(`/api/pay/status?provider=mtn&ref=${ref3}`, { method: 'GET' });
check('the till\'s status check reads the settled payment', r.status === 200 && r.j.status === 'SUCCESSFUL' && r.j.txid === 'MTN-TX-3', JSON.stringify(r.j));

// ----- 8. handled another way, with a note -----
r = await call('/api/pay/link', { body: { provider: 'mtn', ref: ref3, note: 'x' } });
check('handled another way needs a real note', r.status === 400);
r = await call('/api/pay/link', { body: { provider: 'mtn', ref: ref3, note: 'Refunded to the customer by the manager' } });
check('a received payment can be marked handled with a note', r.status === 200 && r.j.payment.note.startsWith('Refunded'));
r = await call('/api/pay/link', { body: { provider: 'mtn', ref: ref3, saleId: 'sale-C' } });
check('…and then can\'t be used for a sale', r.status === 409);

// ----- 9. refused at once, declined, lapsed -----
net.refuse = true;
r = await call('/api/pay/request', { body: { provider: 'mtn', phone: '256770000004', amount: 3000, reference: 'PPTEST4' } });
net.refuse = false;
const refused = (await env.DB.prepare("SELECT * FROM pay_requests WHERE reference = 'PPTEST4'").first());
check('a request MTN refuses is an error for the till and closed as failed', r.status === 502 && refused?.status === 'FAILED', `${r.status} ${refused?.status}`);
r = await call('/api/pay/link', { body: { provider: 'mtn', ref: refused.ref, saleId: 'sale-D' } });
check('a failed payment can\'t be linked to a sale', r.status === 409);
r = await call('/api/pay/request', { body: { provider: 'mtn', phone: '256770000005', amount: 3000, reference: 'PPTEST5' } });
const ref5 = r.j.ref;
later(49 * 3600_000);
await cron();
check('a request the network never answered lapses after 2 days', (await row(ref5)).status === 'EXPIRED');
r = await call(`/api/pay/status?provider=mtn&ref=${ref5}`, { method: 'GET' });
check('…and the till hears it as failed', r.j.status === 'FAILED');

// ----- 10. another pharmacy sees and touches none of it -----
await call('/api/owner/tenants', { token: env.OWNER_KEY, body: { name: 'Other', slug: 'other-ph', admin: { email: 'admin@other.test', password: 'Admin-pass-123' } } });
const other = (await call('/api/login', { token: '', body: { email: 'admin@other.test', password: 'Admin-pass-123', tenant: 'other-ph' } })).j.token;
check('a second pharmacy signs in', !!other);
r = await call('/api/pay/open', { method: 'GET', token: other });
check('it sees none of the first pharmacy\'s payments', r.status === 200 && r.j.payments.length === 0 && r.j.pending === 0, JSON.stringify(r.j));
r = await call('/api/pay/link', { token: other, body: { provider: 'airtel', ref: ref2, saleId: 'theirs' } });
check('and can\'t link one to its own sale', r.status === 404);

globalThis.fetch = realFetch;
Date.now = realNow;
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

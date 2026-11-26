// In-app calls reaching a phone whose app is closed (worker/callpush.js): Firebase push for a ring, with a mocked
// Google (no network, no Firebase account). Two parts:
//   1. the module: the service-account secret, a JWT Google can verify, the FCM message, gone tokens removed;
//   2. through the whole cloud (worker/index.js in Node on a throw-away libSQL file): a phone registers, a ring pushes
//      it and tells the caller so, /api/rtc/config and /api/health say whether the relay and push are set up.
// Fictional pharmacy only.   node unit-callpush.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import nodeCrypto from 'node:crypto';
import { createClient } from '@libsql/client';
import { serviceAccount, googleJwt, callMessage, pushRing, _resetPushCache } from '../worker/callpush.js';

crypto.subtle.timingSafeEqual ??= (a, b) => nodeCrypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
let passed = 0, failed = 0;
const ok = async (name, fn) => {
  try { await fn(); passed++; console.log('PASS ', name); }
  catch (e) { failed++; console.log('FAIL ', name, ' ', String(e?.message || e).slice(0, 300)); }
};

const { privateKey, publicKey } = nodeCrypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const SA = { type: 'service_account', project_id: 'rxpos-test', client_email: 'push@rxpos-test.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) };
const SECRET = JSON.stringify(SA);
const TOKEN_A = 'phone-token-aaaaaaaaaaaaaaaaaaaaaaaa', TOKEN_GONE = 'phone-token-gggggggggggggggggggggggg';

/** A fake Google: the token endpoint and FCM send; records what was sent */
const fakeGoogle = (gone = new Set()) => {
  const sent = [];
  const fn = async (url, init) => {
    if (String(url).startsWith('https://oauth2.googleapis.com/token')) {
      const jwt = new URLSearchParams(init.body).get('assertion');
      const [h, c, s] = jwt.split('.');
      const good = nodeCrypto.verify('RSA-SHA256', Buffer.from(h + '.' + c), publicKey, Buffer.from(s, 'base64url'));
      return new Response(JSON.stringify(good ? { access_token: 'google-access', expires_in: 3600 } : { error: 'invalid_grant' }), { status: good ? 200 : 400 });
    }
    const m = /\/v1\/projects\/([^/]+)\/messages:send$/.exec(String(url));
    if (m) {
      const body = JSON.parse(init.body);
      sent.push({ project: m[1], auth: init.headers.Authorization, body });
      if (gone.has(body.message.token)) return new Response(JSON.stringify({ error: { status: 'NOT_FOUND', details: [{ errorCode: 'UNREGISTERED' }] } }), { status: 404 });
      return new Response('{"name":"projects/rxpos-test/messages/1"}', { status: 200 });
    }
    throw new Error('unexpected fetch ' + url);
  };
  fn.sent = sent;
  return fn;
};

// ---------------- 1. the module ----------------
await ok('no secret, or a broken one, means push is off', async () => {
  assert.equal(serviceAccount({}), null);
  assert.equal(serviceAccount({ FCM_SERVICE_ACCOUNT: '{not json' }), null);
  assert.equal(serviceAccount({ FCM_SERVICE_ACCOUNT: '{"project_id":"x"}' }), null);
  assert.equal(serviceAccount({ FCM_SERVICE_ACCOUNT: SECRET }).project_id, 'rxpos-test');
});
await ok('the JWT is RS256, for the FCM scope, and verifies with the service account key', async () => {
  const jwt = await googleJwt(SA, Date.UTC(2026, 10, 26));
  const [h, c, s] = jwt.split('.');
  assert.deepEqual(JSON.parse(Buffer.from(h, 'base64url')), { alg: 'RS256', typ: 'JWT' });
  const claims = JSON.parse(Buffer.from(c, 'base64url'));
  assert.equal(claims.iss, SA.client_email);
  assert.equal(claims.scope, 'https://www.googleapis.com/auth/firebase.messaging');
  assert.equal(claims.exp - claims.iat, 3600);
  assert.ok(nodeCrypto.verify('RSA-SHA256', Buffer.from(h + '.' + c), publicKey, Buffer.from(s, 'base64url')));
});
await ok('the ring message: high priority, short life, the calls channel, the caller named', async () => {
  const m = callMessage(TOKEN_A, { callId: 'c1', fromName: 'Joan Akello' }).message;
  assert.equal(m.token, TOKEN_A);
  assert.equal(m.android.priority, 'HIGH');
  assert.equal(m.android.ttl, '45s');
  assert.equal(m.android.notification.channel_id, 'calls');
  assert.match(m.android.notification.body, /Joan Akello is calling you/);
  assert.deepEqual(m.data, { kind: 'call', callId: 'c1', fromName: 'Joan Akello' });
});
await ok('pushRing: nothing is sent without the secret or without a registered phone', async () => {
  const g = fakeGoogle();
  const db = { prepare: () => ({ bind: () => ({ all: async () => ({ results: [] }) }) }) };
  assert.equal(await pushRing({}, db, { tenant: 't', to: 'u', callId: 'c' }, g), 0);
  assert.equal(await pushRing({ FCM_SERVICE_ACCOUNT: SECRET }, db, { tenant: 't', to: 'u', callId: 'c' }, g), 0);
  assert.equal(g.sent.length, 0);
});

// ---------------- 2. through the whole cloud ----------------
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rxpos-callpush-'));
const { d1FromLibsql } = await import('../worker/libsql-d1.js');
const { default: worker } = await import('../worker/index.js');
const OWNER_KEY = 'local-owner-key-0123456789abcdef';
const baseEnv = {
  DB: d1FromLibsql(createClient({ url: 'file:' + path.join(dir, 'd1.db').replace(/\\/g, '/') })),
  DB_BACKEND: '', SYNC_KEY: 'test-only-sync-key-0123456789abcdefghijkl', OWNER_KEY,
  ASSETS: { fetch: () => new Response('app', { headers: { 'Content-Type': 'text/html' } }) },
};
const pushEnv = { ...baseEnv, FCM_SERVICE_ACCOUNT: SECRET };
const waits = [];
const req = (env, p, body, token) => worker.fetch(new Request('http://localhost' + p, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined }), env, { waitUntil(p) { waits.push(p); }, passThroughOnException() {} });
const owner = (p, body) => req(baseEnv, '/api/owner' + p, body, OWNER_KEY).then((r) => r.json());
let token, uid;
await ok('cloud: a pharmacy and its admin sign in', async () => {
  const tenant = (await owner('/tenants', { name: 'Kireka Hill Pharmacy', admin: { name: 'Joan Akello', email: 'joan@test.rx', password: 'joan-pass-1234' } })).tenant;
  const r = await (await req(baseEnv, '/api/login', { email: 'joan@test.rx', password: 'joan-pass-1234', tenant: tenant.slug })).json();
  token = r.token;
  uid = JSON.parse(Buffer.from(token.split('.')[1], 'base64url')).sub;
  assert.ok(token && uid, JSON.stringify(r).slice(0, 200));
});
await ok('cloud: /api/health and /api/rtc/config say what calls can count on', async () => {
  assert.deepEqual((await (await req(baseEnv, '/api/health')).json()).calls, { relay: false, push: false });
  assert.deepEqual((await (await req({ ...pushEnv, TURN_URLS: 'turn:turn.test:3478', TURN_USERNAME: 'u', TURN_CREDENTIAL: 'p' }, '/api/health')).json()).calls, { relay: true, push: true });
  const c = await (await req(baseEnv, '/api/rtc/config', null, token)).json();
  assert.equal(c.relay, false);
  assert.equal(c.push, false);
  assert.ok(c.iceServers.some((s) => String(s.urls).includes('stun:')));
});
await ok('cloud: registering a phone needs a sign-in and a real token', async () => {
  assert.equal((await req(pushEnv, '/api/rtc/push', { token: TOKEN_A })).status, 401);
  assert.equal((await req(pushEnv, '/api/rtc/push', { token: 'short' }, token)).status, 400);
  assert.equal((await req(pushEnv, '/api/rtc/push', { token: TOKEN_A, platform: 'android' }, token)).status, 200);
  assert.equal((await req(pushEnv, '/api/rtc/push', { token: TOKEN_GONE, platform: 'android' }, token)).status, 200);
});
await ok('cloud: a ring pushes the callee\'s phones, says so to the caller, and drops a token Google says is gone', async () => {
  const g = fakeGoogle(new Set([TOKEN_GONE]));
  const real = globalThis.fetch;
  globalThis.fetch = g;
  try {
    _resetPushCache();
    const r = await (await req(pushEnv, '/api/rtc', { type: 'ring', to: uid, callId: 'call-1' }, token)).json();
    assert.equal(r.ok, true);
    assert.equal(r.push, true);
    await Promise.all(waits.splice(0));
  } finally { globalThis.fetch = real; }
  assert.equal(g.sent.length, 2);
  assert.ok(g.sent.every((s) => s.project === 'rxpos-test' && s.auth === 'Bearer google-access'));
  assert.equal(g.sent[0].body.message.data.callId, 'call-1');
  const left = await baseEnv.DB.prepare('SELECT token FROM push_tokens').all();
  assert.deepEqual(left.results.map((x) => x.token), [TOKEN_A]);
  // the ring still waits in the cloud for the phone to fetch when it opens
  const w = await (await req(pushEnv, '/api/rtc?since=0', null, token)).json();
  assert.ok(w.messages.some((m) => m.type === 'ring' && m.call_id === 'call-1'));
});
await ok('cloud: without push set up, a ring tells the caller the phone was not pushed', async () => {
  const r = await (await req(baseEnv, '/api/rtc', { type: 'ring', to: uid, callId: 'call-2' }, token)).json();
  assert.equal(r.push, false);
});
await ok('cloud: signing a phone out removes its token', async () => {
  assert.equal((await req(pushEnv, '/api/rtc/push', { token: TOKEN_A, off: true }, token)).status, 200);
  assert.equal((await baseEnv.DB.prepare('SELECT COUNT(*) n FROM push_tokens').first('n')), 0);
});

fs.rmSync(dir, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

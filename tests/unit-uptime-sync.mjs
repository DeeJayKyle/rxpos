import assert from 'node:assert/strict';
import { uptimeCheck } from '../worker/uptime.js';
const originalFetch = globalThis.fetch;
let tenant = 'active-pharmacy';
const env = {
  SYNC_KEY: 'obsolete-key-not-owned-by-any-tenant',
  DB: { prepare: (sql) => ({ first: async () => sql.includes('FROM tenants') ? tenant : { ok: 1 }, all: async () => ({ results: [] }), bind: () => ({ run: async () => ({}) }) }) },
};
let status = 200, payload = { protocol: 2, cursor: 1 }, probes = 0;
const sync = async (dbEnv, body, who) => {
  probes++;
  assert.equal(dbEnv, env);
  assert.deepEqual(body, { deviceId: 'uptime-monitor', since: Number.MAX_SAFE_INTEGER, changes: [] });
  assert.equal(who.tenant, 'active-pharmacy');
  return Response.json(payload, { status });
};
globalThis.fetch = async (url) => {
  assert.ok(['https://rxposug.com/', 'https://www.rxposug.com/'].includes(url), 'Only public website checks leave the invocation');
  return new Response('website');
};
try {
  assert.deepEqual((await uptimeCheck(env, { sync })).problems, []);
  status = 500;
  const failed = await uptimeCheck(env, { sync });
  assert.equal(failed.dbOk, true);
  assert.ok(failed.problems.includes('Cloud sync: HTTP 500'));
  status = 200; payload = {};
  assert.ok((await uptimeCheck(env, { sync })).problems.includes('Cloud sync: Invalid sync response'));
  assert.equal(probes, 3);
  tenant = null;
  assert.deepEqual((await uptimeCheck(env, { sync })).problems, []);
  assert.equal(probes, 3, 'No sync tenant means there is no pharmacy sync to probe');
  // audit 2026-11-17 (2nd pass): the first outage email failed → it is tried again, not never
  {
    let stored = null; const sends = [];
    const env2 = { DB: { prepare: (sql) => ({ first: async () => (sql.includes('FROM tenants') ? null : { ok: 1 }),
      all: async () => ({ results: stored ? [{ k: 'uptime', v: stored }] : [] }), bind: (v) => ({ run: async () => { stored = v; return {}; } }) }) } };
    globalThis.fetch = async () => new Response('down', { status: 503 });
    const mailer = async (_e, _to, subject) => { sends.push(subject); return sends.length > 1; };
    await uptimeCheck(env2, { mailer, now: new Date('2026-11-17T10:00:00Z') });
    await uptimeCheck(env2, { mailer, now: new Date('2026-11-17T10:05:00Z') });
    assert.equal(sends.length, 2, 'the failed first alert is retried on the next check');
    await uptimeCheck(env2, { mailer, now: new Date('2026-11-17T10:10:00Z') });
    assert.equal(sends.length, 2, 'once sent, reminders wait an hour');
    console.log('PASS a failed first outage email is sent on the next check, then reminders wait an hour');
  }
  console.log('PASS monitor detects broken sync despite healthy database and website');
  console.log('PASS monitor uses an active tenant without a legacy key or external credentials');
  console.log('PASS monitor probes do not push records or modify device cursors');
  console.log('\n4 passed, 0 failed');
} finally { globalThis.fetch = originalFetch; }

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
  console.log('PASS monitor detects broken sync despite healthy database and website');
  console.log('PASS monitor uses an active tenant without a legacy key or external credentials');
  console.log('PASS monitor probes do not push records or modify device cursors');
} finally { globalThis.fetch = originalFetch; }

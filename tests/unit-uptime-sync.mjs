import assert from 'node:assert/strict';
import { uptimeCheck } from '../worker/uptime.js';
const originalFetch = globalThis.fetch;
const env = {
  SYNC_KEY: 'test-monitor-key',
  DB: { prepare: () => ({ first: async () => ({ ok: 1 }), all: async () => ({ results: [] }), bind: () => ({ run: async () => ({}) }) }) },
};
let status = 200, payload = { protocol: 2, cursor: 1 }, probes = 0;
globalThis.fetch = async (url, init) => {
  if (url === 'https://api.rxposug.com/api/sync') {
    probes++;
    assert.equal(init.headers.Authorization, 'Bearer test-monitor-key');
    assert.deepEqual(JSON.parse(init.body), { deviceId: 'uptime-monitor', since: Number.MAX_SAFE_INTEGER, changes: [] });
    assert.ok(init.signal);
    return Response.json(payload, { status });
  }
  return new Response('website');
};
try {
  assert.deepEqual((await uptimeCheck(env)).problems, []);
  status = 500;
  const failed = await uptimeCheck(env);
  assert.equal(failed.dbOk, true);
  assert.ok(failed.problems.includes('Cloud sync: HTTP 500'));
  status = 200; payload = {};
  assert.ok((await uptimeCheck(env)).problems.includes('Cloud sync: Invalid sync response'));
  assert.equal(probes, 3);
  console.log('PASS monitor detects broken sync despite healthy database and website');
  console.log('PASS monitor probes do not push records or modify device cursors');
} finally { globalThis.fetch = originalFetch; }

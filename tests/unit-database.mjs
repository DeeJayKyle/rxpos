// Saturate one invocation's libSQL limiter. Another invocation must still answer,
// without waiting for I/O (or credentials) owned by the first invocation.
import assert from 'node:assert/strict';
import { AsyncLocalStorage } from 'node:async_hooks';
import { withDatabase, databaseFetch } from '../worker/database.js';

const context = new AsyncLocalStorage();
const originalFetch = globalThis.fetch;
let release;
const blocked = new Promise((resolve) => { release = resolve; });
let startedA = 0;
const auth = [];
globalThis.fetch = async (input, init) => {
  const req = new Request(input, init);
  auth.push(req.headers.get('authorization'));
  if (context.getStore() === 'A') { startedA++; await blocked; }
  const body = await req.json();
  return new Response(JSON.stringify({
    baton: null,
    results: body.requests.map((r) => ({ type: 'ok', response: r.type === 'close'
      ? { type: 'close' }
      : { type: 'execute', result: { cols: [{ name: 'n', decltype: 'INTEGER' }], rows: [[{ type: 'integer', value: '1' }]], affected_row_count: 0, last_insert_rowid: null } } })),
  }), { headers: { 'content-type': 'application/json' } });
};
try {
  const raw = { DB_BACKEND: 'turso', TURSO_URL: 'https://database.example', TURSO_AUTH_TOKEN: 'old-token', DB: { d1: true } };
  const a = withDatabase(raw);
  const b = withDatabase(raw);
  const pending = context.run('A', () => Promise.all(Array.from({ length: 25 }, () => a.DB.prepare('SELECT 1 AS n').first('n'))));
  // Let the first invocation occupy every slot in its client.
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.ok(startedA > 0);
  let timer;
  const answer = await Promise.race([
    context.run('B', () => b.DB.prepare('SELECT 1 AS n').first('n')),
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Second invocation blocked by first invocation')), 1000); }),
  ]).finally(() => clearTimeout(timer));
  assert.equal(answer, 1);
  release();
  assert.equal((await pending).length, 25);
  console.log('PASS concurrent requests do not share the libSQL pending-work queue');

  const rotated = withDatabase({ ...raw, TURSO_AUTH_TOKEN: 'new-token' });
  await rotated.DB.prepare('SELECT 1 AS n').first();
  assert.equal(auth.at(-1), 'Bearer new-token');
  assert.equal(withDatabase({ DB: raw.DB }).DB, raw.DB);
  assert.equal(a.D1, raw.DB);
  assert.throws(() => withDatabase({ DB_BACKEND: 'turso' }), { status: 503 });
  console.log('PASS credential rotation, D1 binding and missing configuration');

  let observed;
  globalThis.fetch = async (_, init) => { observed = init.signal; return new Response('ok'); };
  const controller = new AbortController();
  await databaseFetch('https://database.example', { signal: controller.signal });
  controller.abort();
  assert.equal(observed.aborted, true);
  console.log('PASS database timeout wrapper preserves upstream cancellation');
} finally {
  release();
  globalThis.fetch = originalFetch;
}

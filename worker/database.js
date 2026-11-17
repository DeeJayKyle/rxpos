// A Cloudflare invocation must own its network client's pending work. libSQL's
// concurrency limiter queues promises; sharing a client across invocations can
// strand a request behind I/O owned by an invocation that already ended.
import { createClient } from '@libsql/client/web';
import { d1FromLibsql } from './libsql-d1.js';

export const DATABASE_TIMEOUT_MS = 15000;

export async function databaseFetch(input, init = {}) {
  const signal = AbortSignal.any([
    ...(init.signal ? [init.signal] : []),
    ...(input instanceof Request ? [input.signal] : []),
    AbortSignal.timeout(DATABASE_TIMEOUT_MS),
  ]);
  return fetch(input, { ...init, signal });
}

export function withDatabase(env) {
  if (env.DB_BACKEND !== 'turso') return { ...env, D1: env.DB };
  if (env.TURSO_TEST_DB) return { ...env, D1: env.DB, DB: env.TURSO_TEST_DB };
  if (!env.TURSO_URL) {
    const error = new Error('TURSO_URL is not set');
    error.status = 503;
    throw error;
  }
  const client = createClient({
    url: env.TURSO_URL,
    authToken: env.TURSO_AUTH_TOKEN,
    fetch: databaseFetch,
  });
  const db = d1FromLibsql(client);
  db.schemaKey = 'turso:' + env.TURSO_URL; // 2026-11-17 audit: lets the schema check run once per isolate, not per request
  return { ...env, D1: env.DB, DB: db };
}

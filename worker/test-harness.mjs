// Runs the RxPOS cloud Worker in Node on local libSQL files (no Cloudflare, no Turso account needed).
//   node worker/test-harness.mjs <port> <dataDir>
// Two databases: "d1.db" plays Cloudflare D1, "turso.db" plays Turso. Set DB_BACKEND=turso to serve from turso.db.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@libsql/client';
import worker from './index.js';
import { d1FromLibsql } from './libsql-d1.js';
import nodeCrypto from 'node:crypto';

// Cloudflare-only API used by the Worker
crypto.subtle.timingSafeEqual ??= (a, b) => nodeCrypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

const [port = '8791', dir = '.harness'] = process.argv.slice(2);
fs.mkdirSync(dir, { recursive: true });
const file = (n) => 'file:' + path.resolve(dir, n).replace(/\\/g, '/');
const env = {
  DB: d1FromLibsql(createClient({ url: file('d1.db') })),
  TURSO_TEST_DB: d1FromLibsql(createClient({ url: file('turso.db') })),
  TURSO_URL: 'test', TURSO_AUTH_TOKEN: 'test',
  DB_BACKEND: process.env.DB_BACKEND || '',
  SYNC_KEY: 'local-main-key-0123456789abcdef', OWNER_KEY: 'local-owner-key-0123456789abcdef',
  ASSETS: { fetch: () => new Response('app', { headers: { 'Content-Type': 'text/html' } }) },
};
http.createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  const r = await worker.fetch(new Request('http://localhost:' + port + req.url, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : body }), env);
  res.writeHead(r.status, Object.fromEntries(r.headers));
  res.end(Buffer.from(await r.arrayBuffer()));
}).listen(Number(port), () => console.log(`harness on ${port}, backend ${env.DB_BACKEND || 'd1'}`));

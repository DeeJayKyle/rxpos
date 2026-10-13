#!/usr/bin/env node
// RxPOS payment relay — gives Airtel Money a FIXED server IP to whitelist.
// Cloudflare Workers have no fixed outgoing IP, but Airtel only accepts calls from whitelisted IPs, so the RxPOS
// cloud sends Airtel requests here and this small server (on a VM with a static public IP) forwards them.
//
//   RELAY_KEY=long-random-secret node airtel-relay.mjs [--port 8787]
//
// Security: only requests carrying the RELAY_KEY are accepted, and only to Airtel's own API hosts.
// Run behind Caddy (HTTPS). No dependencies; Node.js 18+.
import http from 'node:http';
import crypto from 'node:crypto';

const PORT = Number(process.argv[process.argv.indexOf('--port') + 1]) || Number(process.env.PORT) || 8787;
const KEY = process.env.RELAY_KEY || '';
const ALLOWED_HOSTS = new Set(['openapi.airtel.africa', 'openapiuat.airtel.africa']);
const FORWARD_HEADERS = ['authorization', 'content-type', 'accept', 'x-country', 'x-currency'];

if (KEY.length < 24) {
  console.error('Set RELAY_KEY to a random secret of at least 24 characters.');
  process.exit(1);
}

const keyOk = (got) => {
  const a = Buffer.from(String(got || '')), b = Buffer.from(KEY);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  if (req.url === '/health') return send(res, 200, { ok: true, app: 'rxpos-relay' });
  if (req.method !== 'POST' || req.url !== '/forward') return send(res, 404, { error: 'Not found' });
  if (!keyOk(req.headers['x-relay-key'])) return send(res, 401, { error: 'Bad relay key' });

  const chunks = [];
  let size = 0;
  for await (const c of req) { size += c.length; if (size > 256 * 1024) return send(res, 413, { error: 'Too large' }); chunks.push(c); }
  let job;
  try { job = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return send(res, 400, { error: 'Bad JSON' }); }

  let target;
  try { target = new URL(job.url); } catch { return send(res, 400, { error: 'Bad url' }); }
  if (target.protocol !== 'https:' || !ALLOWED_HOSTS.has(target.hostname)) return send(res, 403, { error: 'Host not allowed' });

  const headers = {};
  for (const [k, v] of Object.entries(job.headers || {})) if (FORWARD_HEADERS.includes(k.toLowerCase())) headers[k] = String(v);
  try {
    const r = await fetch(target, { method: job.method === 'GET' ? 'GET' : 'POST', headers, body: job.method === 'GET' ? undefined : job.body, signal: AbortSignal.timeout(25000) });
    const text = await r.text();
    send(res, 200, { status: r.status, body: text });
  } catch (e) {
    send(res, 502, { error: 'Airtel unreachable: ' + e.message });
  }
});

server.listen(PORT, '127.0.0.1', () => console.log(`RxPOS relay listening on 127.0.0.1:${PORT} (behind Caddy)`));

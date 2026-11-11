#!/usr/bin/env node
// RxPOS Hub: keeps every RxPOS device (desktop apps and browsers) in sync on a pharmacy's own PC or server, and serves
// the web app. Since 1.x (workplan step 16) it runs the SAME code as the RxPOS cloud (worker/index.js) over SQLite
// built into Node, so a hub applies every rule the cloud does: permissions per table, append-only stock movements,
// field-by-field merge, sale checks, the sign-in slowdown, document numbers… Before, it was a separate, simpler copy.
//
//   RXPOS_SYNC_KEY=choose-a-long-secret node server/hub.mjs [--port 8686] [--data ./hub-data] [--web ./dist]
//   (needs Node.js 22.13+; the Windows app's built-in hub, `RxPOS.exe --hub --key=…`, already has it)
//
// Optional: RXPOS_OWNER_KEY (20+ characters) opens the owner console on the hub (add pharmacies, staff, branches);
// RXPOS_TRUST_PROXY=1 behind an HTTPS proxy (Caddy, nginx), so each device's own address counts for sign-in limits.
// Not on a hub (they need Cloudflare or outside services): the live connection (devices check every 10 s instead),
// Mobile Money, SMS, AI reading, emails. Data: <data>/hub.db, a copy every day in <data>/backups (last 30 kept).
// A hub from before (hub.json) is moved into hub.db once, on first start; hub.json is kept, renamed, as a backup.
// Devices signed in to an older hub sign in again once (the sign-in passes are made differently now).
import http from 'node:http';
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import nodeCrypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { d1FromSqlite } from './d1-sqlite.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const PORT = Number(arg('port', process.env.PORT || 8686));
const DATA_DIR = path.resolve(arg('data', process.env.RXPOS_DATA || process.env.PHARMAPOS_DATA || path.join(here, '..', 'hub-data')));
const WEB_DIR = path.resolve(arg('web', path.join(here, '..', 'dist')));
const KEY = process.env.RXPOS_SYNC_KEY || process.env.PHARMAPOS_SYNC_KEY || '';
const MAIN = 'main';

if (KEY.length < 12) {
  console.error('Set RXPOS_SYNC_KEY to a secret of at least 12 characters, e.g.\n  RXPOS_SYNC_KEY=my-long-secret-key node server/hub.mjs');
  process.exit(1);
}

// Cloudflare-only API the cloud code uses (constant-time comparison)
crypto.subtle.timingSafeEqual ??= (a, b) => nodeCrypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
// The cloud code, bundled into one file for the Windows app and the hub download (scripts/build-hub.mjs), or straight
// from worker/ in a source checkout
const corePath = fs.existsSync(path.join(here, 'hub-core.mjs')) ? path.join(here, 'hub-core.mjs') : path.join(here, '..', 'worker', 'index.js');
const { default: cloud, pruneSignInTables } = await import(pathToFileURL(corePath).href);

fs.mkdirSync(DATA_DIR, { recursive: true });
const db = d1FromSqlite(path.join(DATA_DIR, 'hub.db'));
const sha256 = (s) => nodeCrypto.createHash('sha256').update(s).digest('hex');

// ---------- the web app (everything that isn't /api) ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.wasm': 'application/wasm', '.zip': 'application/zip' };
const ASSETS = {
  async fetch(input) {
    let decoded;
    try { decoded = decodeURIComponent(new URL(typeof input === 'string' || input instanceof URL ? input : input.url).pathname); } catch { return new Response('Bad path', { status: 400 }); }
    let file = path.normalize(path.join(WEB_DIR, decoded));
    const rel = path.relative(WEB_DIR, file);
    if (rel.startsWith('..') || path.isAbsolute(rel)) return new Response('Forbidden', { status: 403 });
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      if (path.extname(decoded)) return new Response('Not found', { status: 404 }); // a missing file, not an app address
      file = path.join(WEB_DIR, 'index.html');
    }
    if (!fs.existsSync(file)) return new Response('Web app not built. Run "npm run build" first.', { status: 404, headers: { 'Content-Type': 'text/plain' } });
    return new Response(fs.readFileSync(file), { headers: { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' } });
  },
};

const env = {
  DB: db,
  SYNC_KEY: KEY,
  // sign-in passes are signed with a key made from the sync key (the cloud wants 32+ characters)
  TOKEN_SECRET: sha256('rxpos-hub-token:' + KEY),
  ...(process.env.RXPOS_OWNER_KEY ? { OWNER_KEY: process.env.RXPOS_OWNER_KEY } : {}),
  ...(process.env.PBKDF2_ITER ? { PBKDF2_ITER: process.env.PBKDF2_ITER } : {}),
  ...(process.env.PUBLIC_URL ? { PUBLIC_URL: process.env.PUBLIC_URL } : {}),
  ASSETS,
};
const ctx = { waitUntil: (p) => Promise.resolve(p).catch((e) => console.warn('background task:', e?.message || e)), passThroughOnException() {} };

// ---------- first start: the database, the hub's own pharmacy, and the move from hub.json ----------
await cloud.fetch(new Request('http://hub/api/health'), env, ctx); // creates the tables (the cloud's ensureSchema)
await db.prepare(`INSERT INTO tenants (id, name, key_hash, features, status, secrets, created_at, slug) VALUES (?1, ?2, ?3, '{}', 'active', '{}', ?4, ?1)
  ON CONFLICT(id) DO UPDATE SET key_hash = ?3`).bind(MAIN, 'Pharmacy on this hub', sha256(KEY), new Date().toISOString()).run();

const OLD = path.join(DATA_DIR, 'hub.json');
if (fs.existsSync(OLD) && !(await db.prepare('SELECT 1 x FROM records WHERE tenant = ?1 LIMIT 1').bind(MAIN).first('x'))) {
  const state = JSON.parse(fs.readFileSync(OLD, 'utf8'));
  const rows = Object.values(state.rows || {}).filter((r) => r && typeof r.t === 'string' && r.id != null);
  const insert = `INSERT OR REPLACE INTO records (tenant, k, t, id, rec, deleted, at, seq, origin) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`;
  await db.batch(rows.map((r) => db.prepare(insert).bind(MAIN, r.t + '|' + r.id, r.t, String(r.id), r.deleted ? null : JSON.stringify(r.rec ?? null),
    r.deleted ? 1 : 0, r.at || new Date(0).toISOString(), Number(r.seq) || 0, r.origin || 'hub-1')));
  const kept = OLD.replace(/\.json$/, `.before-move-${new Date().toISOString().slice(0, 10)}.json`);
  fs.renameSync(OLD, kept);
  console.log(`Moved ${rows.length} records from hub.json into hub.db (hub.json kept as ${path.basename(kept)}).`);
}

// ---------- daily: a copy of the database (last 30 kept), and the sign-in tables tidied ----------
async function daily() {
  const dir = path.join(DATA_DIR, 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const f = path.join(dir, `hub-${new Date().toISOString().slice(0, 10)}.db`);
  if (!fs.existsSync(f)) {
    try { db.raw.exec(`VACUUM INTO '${f.replace(/'/g, "''")}'`); } catch (e) { console.warn('backup failed:', e.message); }
  }
  for (const x of fs.readdirSync(dir).filter((n) => /^hub-.*\.db$/.test(n)).sort().reverse().slice(30)) fs.unlinkSync(path.join(dir, x));
  await pruneSignInTables(db).catch(() => {});
}
await daily();
setInterval(() => daily().catch(() => {}), 6 * 3600e3).unref?.();

// ---------- the server ----------
const MAX_BODY = 50e6;
const server = http.createServer(async (req, res) => {
  try {
    const chunks = [];
    let size = 0;
    for await (const c of req) { size += c.length; if (size > MAX_BODY) { res.writeHead(413).end('Too large'); return; } chunks.push(c); }
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) if (v != null && !k.startsWith(':')) headers.set(k, Array.isArray(v) ? v.join(', ') : v);
    // the device's address, for the sign-in limits: the connection's own, or behind an HTTPS proxy (Caddy, nginx) with
    // RXPOS_TRUST_PROXY=1, the first X-Forwarded-For entry (only then: a device could otherwise pretend to be anyone)
    const fwd = process.env.RXPOS_TRUST_PROXY === '1' ? String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() : '';
    headers.set('CF-Connecting-IP', fwd || req.socket.remoteAddress || 'noip');
    const url = `http://${req.headers.host || 'localhost:' + PORT}${req.url}`;
    const r = await cloud.fetch(new Request(url, { method: req.method, headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks) }), env, ctx);
    const out = {};
    r.headers.forEach((v, k) => { out[k] = v; });
    let buf = req.method === 'HEAD' ? undefined : Buffer.from(await r.arrayBuffer());
    // compress larger JSON replies (sync pages) when the device accepts it, as Cloudflare does for the cloud
    if (buf && buf.length > 2048 && /json/.test(out['content-type'] || '') && !out['content-encoding'] && /\bgzip\b/.test(String(req.headers['accept-encoding'] || ''))) {
      buf = zlib.gzipSync(buf, { level: 5 });
      out['content-encoding'] = 'gzip'; out.vary = 'Accept-Encoding'; delete out['content-length'];
    }
    res.writeHead(r.status, out);
    res.end(buf);
  } catch (e) {
    console.error(e);
    try { res.writeHead(500, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'Server error' })); } catch { /* reply already started */ }
  }
});

server.listen(PORT, () => {
  console.log(`RxPOS Hub running on http://0.0.0.0:${PORT}`);
  console.log(`Data: ${DATA_DIR}`);
  console.log('Link devices in RxPOS → Settings → Sync with this address and your sync key.');
});

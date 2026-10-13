#!/usr/bin/env node
// PharmaPOS Hub: keeps every PharmaPOS device (desktop apps and browsers) in sync, and serves the web app.
// No dependencies; needs Node.js 18+.
//
//   PHARMAPOS_SYNC_KEY=choose-a-long-secret node server/hub.mjs [--port 8686] [--data ./hub-data]
//
// Run it on the main PC (LAN) or on any server/VPS (online). Devices link to it in Settings → Sync.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const PORT = Number(arg('port', process.env.PORT || 8686));
const DATA_DIR = path.resolve(arg('data', process.env.PHARMAPOS_DATA || path.join(here, '..', 'hub-data')));
const WEB_DIR = path.resolve(arg('web', path.join(here, '..', 'dist')));
const KEY = process.env.PHARMAPOS_SYNC_KEY || '';
const PAGE = 2000;

if (KEY.length < 12) {
  console.error('Set PHARMAPOS_SYNC_KEY to a secret of at least 12 characters, e.g.\n  PHARMAPOS_SYNC_KEY=my-long-secret-key node server/hub.mjs');
  process.exit(1);
}

fs.mkdirSync(DATA_DIR, { recursive: true });
const FILE = path.join(DATA_DIR, 'hub.json');
// state.rows: { "table|id": { t, id, rec?, deleted?, at, seq, origin } }
let state = { seq: 0, rows: {} };
if (fs.existsSync(FILE)) state = JSON.parse(fs.readFileSync(FILE, 'utf8'));

let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const tmp = FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(state));
    fs.renameSync(tmp, FILE);
  }, 500);
}

// Daily backup, keep 30
function backup() {
  if (!fs.existsSync(FILE)) return;
  const dir = path.join(DATA_DIR, 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const f = path.join(dir, `hub-${new Date().toISOString().slice(0, 10)}.json`);
  if (!fs.existsSync(f)) fs.copyFileSync(FILE, f);
  for (const x of fs.readdirSync(dir).sort().reverse().slice(30)) fs.unlinkSync(path.join(dir, x));
}
backup();
setInterval(backup, 6 * 3600e3);

// ---- auth: the sync key (full access) or a staff sign-in token (same scheme as the cloud worker) ----
const ADMIN_ONLY = new Set(['users', 'settings', 'branches']);
const b64url = (buf) => Buffer.from(buf).toString('base64url');
const sign = (body) => crypto.createHmac('sha256', 'token:' + KEY).update(body).digest('base64url');

function authenticate(req) {
  const got = (req.headers.authorization || '').replace(/^Bearer /, '');
  if (got.startsWith('u.')) {
    const [, body, sig] = got.split('.');
    if (!body || !sig || sig.length !== sign(body).length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(sign(body)))) return null;
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    return p.exp > Date.now() ? { role: p.role, name: p.name } : null;
  }
  const a = Buffer.from(got), b = Buffer.from(KEY);
  return a.length === b.length && crypto.timingSafeEqual(a, b) ? { role: 'admin', name: 'sync key' } : null;
}

function login({ email, password }) {
  const e = String(email || '').trim().toLowerCase();
  const u = Object.values(state.rows).filter((r) => r.t === 'users' && !r.deleted).map((r) => r.rec).find((x) => x && x.email === e && !x.disabled);
  const pw = String(password || '');
  const ok = u && (u.algo === 'pbkdf2'
    ? crypto.pbkdf2Sync(pw, Buffer.from(u.salt, 'base64'), u.iter || 100000, 32, 'sha256').toString('hex') === u.hash
    : crypto.createHash('sha256').update('pharmapos:' + pw).digest('hex') === u.hash);
  if (!ok) return [401, { error: 'Wrong email or password, or this account has not been synced to the hub yet.' }];
  const body = b64url(JSON.stringify({ sub: u.id, name: u.name, role: u.role, exp: Date.now() + 30 * 864e5 }));
  return [200, { token: 'u.' + body + '.' + sign(body), user: { id: u.id, name: u.name, email: u.email, role: u.role } }];
}

function sync({ deviceId, since = 0, changes = [] }, who) {
  let applied = 0;
  for (const ch of changes) {
    if (!ch || typeof ch.t !== 'string' || ch.id == null || typeof ch.at !== 'string') continue;
    if (who.role !== 'admin' && ADMIN_ONLY.has(ch.t)) continue; // only admins change users, settings, branches
    const k = ch.t + '|' + ch.id;
    const cur = state.rows[k];
    if (cur && cur.at >= ch.at) continue; // last writer wins
    state.rows[k] = { t: ch.t, id: ch.id, rec: ch.deleted ? undefined : ch.rec, deleted: !!ch.deleted, at: ch.at, seq: ++state.seq, origin: deviceId };
    applied++;
  }
  if (applied) save();
  const out = Object.values(state.rows)
    .filter((r) => r.seq > since && r.origin !== deviceId)
    .sort((a, b) => a.seq - b.seq);
  const page = out.slice(0, PAGE);
  // Cursor: everything up to here has been delivered (rows from this device are skipped, not missed)
  const cursor = out.length > PAGE ? page[page.length - 1].seq : state.seq;
  return { changes: page.map(({ t, id, rec, deleted, at }) => ({ t, id, rec, deleted, at })), cursor, more: out.length > PAGE, applied };
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon' };

function send(res, code, body, type = 'application/json') {
  res.writeHead(code, {
    'Content-Type': type,
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Cache-Control': 'no-store',
  });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (req.method === 'OPTIONS') return send(res, 204, '');
  if (url.pathname === '/api/health') return send(res, 200, { ok: true, app: 'pharmapos-hub', rows: Object.keys(state.rows).length });
  if ((url.pathname === '/api/sync' || url.pathname === '/api/login') && req.method === 'POST') {
    const who = url.pathname === '/api/sync' ? authenticate(req) : null;
    if (url.pathname === '/api/sync' && !who) return send(res, 401, { error: 'Not signed in (wrong sync key or expired sign-in)' });
    const chunks = [];
    let size = 0;
    req.on('data', (c) => { size += c.length; if (size > 50e6) req.destroy(); else chunks.push(c); });
    req.on('end', () => {
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
        if (url.pathname === '/api/login') { const [code, out] = login(body); return send(res, code, out); }
        if (!body.deviceId) return send(res, 400, { error: 'Missing deviceId' });
        send(res, 200, sync(body, who));
      } catch (e) {
        send(res, 400, { error: 'Bad request: ' + e.message });
      }
    });
    return;
  }
  if (url.pathname === '/api/config') {
    if (!authenticate(req)) return send(res, 401, { error: 'Not signed in' });
    return send(res, 200, { mtn: false, airtel: false, sms: false, hub: 'local' });
  }
  // Static web app
  if (req.method !== 'GET') return send(res, 405, { error: 'Method not allowed' });
  let file = path.normalize(path.join(WEB_DIR, decodeURIComponent(url.pathname)));
  if (!file.startsWith(WEB_DIR)) return send(res, 403, { error: 'Forbidden' });
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(WEB_DIR, 'index.html');
  if (!fs.existsSync(file)) return send(res, 404, 'Web app not built. Run "npm run build" first.', 'text/plain');
  send(res, 200, fs.readFileSync(file), MIME[path.extname(file)] || 'application/octet-stream');
});

server.listen(PORT, () => {
  console.log(`PharmaPOS Hub running on http://0.0.0.0:${PORT}`);
  console.log(`Data: ${DATA_DIR}`);
  console.log('Link devices in PharmaPOS → Settings → Sync with this address and your sync key.');
});

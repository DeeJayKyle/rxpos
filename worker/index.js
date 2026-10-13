// PharmaPOS cloud on Cloudflare Workers (free plan) + D1.
//   /api/sync    offline-first sync (same protocol as server/hub.mjs)
//   /api/login   staff sign in with their PharmaPOS email + password → device token (no shared key needed)
//   /api/config  which integrations are switched on
//   /api/pay/*   MTN MoMo + Airtel Money "request to pay" (customer approves on their phone)
//   /api/sms     SMS via Africa's Talking
// Everything else is the web app, served from ./dist.
//
// Secrets (Workers → Settings → Variables and Secrets):
//   SYNC_KEY (required)  ·  MTN_SUBSCRIPTION_KEY, MTN_API_USER, MTN_API_KEY, MTN_ENV (sandbox|production), MTN_TARGET (default mtnuganda)
//   AIRTEL_CLIENT_ID, AIRTEL_CLIENT_SECRET, AIRTEL_ENV (uat|production), AIRTEL_COUNTRY (UG), AIRTEL_CURRENCY (UGX)
//   AT_USERNAME, AT_API_KEY, AT_SENDER_ID (optional)
const PAGE = 1000;
const MAX_PUSH = 500;
const ADMIN_ONLY = new Set(['users', 'settings', 'branches']);
const TOKEN_DAYS = 30;

let schemaReady = null;
function ensureSchema(db) {
  schemaReady ??= db.batch([
    db.prepare('CREATE TABLE IF NOT EXISTS rows (k TEXT PRIMARY KEY, t TEXT NOT NULL, id TEXT NOT NULL, rec TEXT, deleted INTEGER NOT NULL DEFAULT 0, at TEXT NOT NULL, seq INTEGER NOT NULL, origin TEXT)'),
    db.prepare('CREATE INDEX IF NOT EXISTS rows_seq ON rows(seq)'),
    db.prepare('CREATE INDEX IF NOT EXISTS rows_t ON rows(t)'),
    db.prepare('CREATE TABLE IF NOT EXISTS login_fail (email TEXT PRIMARY KEY, n INTEGER NOT NULL, until INTEGER NOT NULL DEFAULT 0)'),
  ]).catch((e) => { schemaReady = null; throw e; });
  return schemaReady;
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
const json = (body, status = 200) =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...cors } });

// ---------- auth ----------
const te = new TextEncoder();
const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const hmacKey = (env) => crypto.subtle.importKey('raw', te.encode('token:' + env.SYNC_KEY), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);

async function signToken(env, payload) {
  const body = b64url(te.encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(env), te.encode(body));
  return 'u.' + body + '.' + b64url(sig);
}
async function readToken(env, token) {
  const [, body, sig] = token.split('.');
  if (!body || !sig) return null;
  const ok = await crypto.subtle.verify('HMAC', await hmacKey(env), fromB64url(sig), te.encode(body));
  if (!ok) return null;
  const p = JSON.parse(new TextDecoder().decode(fromB64url(body)));
  return p.exp > Date.now() ? p : null;
}
/** → { role, name } for a valid sync key (full access) or staff token; null otherwise */
async function authenticate(req, env) {
  const key = env.SYNC_KEY || '';
  if (key.length < 12) return null;
  const got = (req.headers.get('Authorization') || '').replace(/^Bearer /, '');
  if (got.startsWith('u.')) {
    const p = await readToken(env, got).catch(() => null);
    return p ? { role: p.role, name: p.name, uid: p.sub } : null;
  }
  const a = te.encode(got), b = te.encode(key);
  return a.byteLength === b.byteLength && crypto.subtle.timingSafeEqual(a, b) ? { role: 'admin', name: 'sync key' } : null;
}

async function verifyPassword(u, pw) {
  if (u.algo === 'pbkdf2') {
    const key = await crypto.subtle.importKey('raw', te.encode(pw), 'PBKDF2', false, ['deriveBits']);
    const salt = Uint8Array.from(atob(u.salt), (c) => c.charCodeAt(0));
    return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: u.iter || 100000, hash: 'SHA-256' }, key, 256)) === u.hash;
  }
  return hex(await crypto.subtle.digest('SHA-256', te.encode('pharmapos:' + pw))) === u.hash;
}

const MAX_FAILS = 5;
const LOCK_MINUTES = 15;

async function login(env, { email, password }) {
  await ensureSchema(env.DB);
  const e = String(email || '').trim().toLowerCase().slice(0, 200);
  // Brute-force protection: after MAX_FAILS wrong passwords the email is locked for LOCK_MINUTES
  const fail = await env.DB.prepare('SELECT n, until FROM login_fail WHERE email = ?1').bind(e).first();
  if (fail && fail.until > Date.now()) {
    const mins = Math.ceil((fail.until - Date.now()) / 60000);
    return json({ error: `Too many wrong passwords. Try again in ${mins} minute${mins === 1 ? '' : 's'}, or ask your administrator to reset your password.` }, 429);
  }
  const { results } = await env.DB.prepare("SELECT rec FROM rows WHERE t = 'users' AND deleted = 0").all();
  const u = results.map((r) => JSON.parse(r.rec)).find((x) => x && x.email === e && !x.disabled);
  if (!u || !(await verifyPassword(u, String(password || '')))) {
    const n = (fail && fail.until <= Date.now() && fail.until > 0 ? 0 : fail?.n || 0) + 1;
    const until = n >= MAX_FAILS ? Date.now() + LOCK_MINUTES * 60000 : 0;
    await env.DB.prepare('INSERT INTO login_fail (email, n, until) VALUES (?1, ?2, ?3) ON CONFLICT(email) DO UPDATE SET n = ?2, until = ?3')
      .bind(e, until ? 0 : n, until).run();
    return json({ error: until ? `Too many wrong passwords. Sign-in is locked for ${LOCK_MINUTES} minutes.` : `Wrong email or password (${MAX_FAILS - n} attempt${MAX_FAILS - n === 1 ? '' : 's'} left before a ${LOCK_MINUTES}-minute lock).` }, until ? 429 : 401);
  }
  if (fail) await env.DB.prepare('DELETE FROM login_fail WHERE email = ?1').bind(e).run();
  const token = await signToken(env, { sub: u.id, name: u.name, role: u.role, exp: Date.now() + TOKEN_DAYS * 864e5 });
  return json({ token, user: { id: u.id, name: u.name, email: u.email, role: u.role } });
}

// ---------- sync ----------
async function sync(env, body, who) {
  const db = env.DB;
  await ensureSchema(db);
  const { deviceId, since = 0, changes = [] } = body;
  if (!deviceId) return json({ error: 'Missing deviceId' }, 400);
  if (changes.length > MAX_PUSH) return json({ error: `Send at most ${MAX_PUSH} changes per request` }, 413);

  // Last writer wins per record; every accepted write gets the next sequence number.
  const upsert = db.prepare(
    `INSERT INTO rows (k, t, id, rec, deleted, at, origin, seq)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, (SELECT COALESCE(MAX(seq), 0) + 1 FROM rows))
     ON CONFLICT(k) DO UPDATE SET rec = excluded.rec, deleted = excluded.deleted, at = excluded.at,
       origin = excluded.origin, seq = excluded.seq
     WHERE excluded.at > rows.at`
  );
  const stmts = [];
  let refused = 0;
  for (const ch of changes) {
    if (!ch || typeof ch.t !== 'string' || ch.id == null || typeof ch.at !== 'string') continue;
    if (who.role !== 'admin' && ADMIN_ONLY.has(ch.t)) { refused++; continue; } // only admins change users, settings, branches
    const id = String(ch.id);
    stmts.push(upsert.bind(ch.t + '|' + id, ch.t, id, ch.deleted ? null : JSON.stringify(ch.rec ?? null), ch.deleted ? 1 : 0, ch.at, deviceId));
  }
  let applied = 0;
  if (stmts.length) for (const r of await db.batch(stmts)) applied += r.meta.changes || 0;

  const { results } = await db
    .prepare('SELECT t, id, rec, deleted, at, seq FROM rows WHERE seq > ?1 AND origin IS NOT ?2 ORDER BY seq LIMIT ?3')
    .bind(Number(since) || 0, deviceId, PAGE + 1)
    .all();
  const more = results.length > PAGE;
  const page = more ? results.slice(0, PAGE) : results;
  const cursor = more ? page[page.length - 1].seq : ((await db.prepare('SELECT MAX(seq) m FROM rows').first('m')) || 0);
  // Build the response by hand so records stored as JSON text are not parsed and re-serialised (keeps CPU low)
  const items = page.map((r) => `{"t":${JSON.stringify(r.t)},"id":${JSON.stringify(r.id)},"at":${JSON.stringify(r.at)},"deleted":${r.deleted ? 'true' : 'false'},"rec":${r.rec ?? 'null'}}`);
  return json(`{"changes":[${items.join(',')}],"cursor":${cursor},"more":${more},"applied":${applied},"refused":${refused}}`);
}

// ---------- Mobile Money ----------
const tokens = {};
async function cachedToken(name, fetcher) {
  const t = tokens[name];
  if (t && t.exp > Date.now() + 30000) return t.value;
  const { value, ttl } = await fetcher();
  tokens[name] = { value, exp: Date.now() + ttl * 1000 };
  return value;
}

const mtn = {
  enabled: (env) => !!(env.MTN_SUBSCRIPTION_KEY && env.MTN_API_USER && env.MTN_API_KEY),
  cfg(env) {
    const live = env.MTN_ENV === 'production';
    return { base: env.MTN_BASE_URL || (live ? 'https://proxy.momoapi.mtn.com' : 'https://sandbox.momodeveloper.mtn.com'), target: live ? env.MTN_TARGET || 'mtnuganda' : 'sandbox', currency: live ? env.MTN_CURRENCY || 'UGX' : 'EUR' };
  },
  token(env) {
    const c = mtn.cfg(env);
    return cachedToken('mtn', async () => {
      const r = await fetch(c.base + '/collection/token/', { method: 'POST', headers: { Authorization: 'Basic ' + btoa(env.MTN_API_USER + ':' + env.MTN_API_KEY), 'Ocp-Apim-Subscription-Key': env.MTN_SUBSCRIPTION_KEY } });
      if (!r.ok) throw new Error(`MTN sign-in failed (${r.status})`);
      const j = await r.json();
      return { value: j.access_token, ttl: j.expires_in || 3000 };
    });
  },
  async request(env, { phone, amount, reference, note }) {
    const c = mtn.cfg(env);
    const ref = crypto.randomUUID();
    const r = await fetch(c.base + '/collection/v1_0/requesttopay', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + (await mtn.token(env)), 'X-Reference-Id': ref, 'X-Target-Environment': c.target, 'Ocp-Apim-Subscription-Key': env.MTN_SUBSCRIPTION_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: String(Math.round(amount)), currency: c.currency, externalId: reference, payer: { partyIdType: 'MSISDN', partyId: phone }, payerMessage: note.slice(0, 160), payeeNote: note.slice(0, 160) }),
    });
    if (r.status !== 202) throw new Error(`MTN refused the request (${r.status}) ${await r.text()}`.slice(0, 300));
    return ref;
  },
  async status(env, ref) {
    const c = mtn.cfg(env);
    const r = await fetch(`${c.base}/collection/v1_0/requesttopay/${ref}`, { headers: { Authorization: 'Bearer ' + (await mtn.token(env)), 'X-Target-Environment': c.target, 'Ocp-Apim-Subscription-Key': env.MTN_SUBSCRIPTION_KEY } });
    if (!r.ok) throw new Error(`MTN status check failed (${r.status})`);
    const j = await r.json();
    return { status: j.status === 'SUCCESSFUL' ? 'SUCCESSFUL' : j.status === 'FAILED' || j.status === 'REJECTED' ? 'FAILED' : 'PENDING', reason: j.reason || '', txid: j.financialTransactionId || '' };
  },
};

const airtel = {
  enabled: (env) => !!(env.AIRTEL_CLIENT_ID && env.AIRTEL_CLIENT_SECRET),
  cfg(env) {
    return { base: env.AIRTEL_ENV === 'production' ? 'https://openapi.airtel.africa' : 'https://openapiuat.airtel.africa', country: env.AIRTEL_COUNTRY || 'UG', currency: env.AIRTEL_CURRENCY || 'UGX' };
  },
  token(env) {
    const c = airtel.cfg(env);
    return cachedToken('airtel', async () => {
      const r = await fetch(c.base + '/auth/oauth2/token', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: '*/*' }, body: JSON.stringify({ client_id: env.AIRTEL_CLIENT_ID, client_secret: env.AIRTEL_CLIENT_SECRET, grant_type: 'client_credentials' }) });
      if (!r.ok) throw new Error(`Airtel sign-in failed (${r.status})`);
      const j = await r.json();
      return { value: j.access_token, ttl: Number(j.expires_in) || 3000 };
    });
  },
  headers: async (env, c) => ({ Authorization: 'Bearer ' + (await airtel.token(env)), 'Content-Type': 'application/json', Accept: '*/*', 'X-Country': c.country, 'X-Currency': c.currency }),
  async request(env, { phone, amount, reference }) {
    const c = airtel.cfg(env);
    const id = reference.replace(/[^A-Za-z0-9]/g, '').slice(0, 20) + Date.now().toString(36).slice(-4).toUpperCase();
    const r = await fetch(c.base + '/merchant/v1/payments/', {
      method: 'POST', headers: await airtel.headers(env, c),
      body: JSON.stringify({ reference: reference.slice(0, 64), subscriber: { country: c.country, currency: c.currency, msisdn: phone.replace(/^256/, '') }, transaction: { amount: Math.round(amount), country: c.country, currency: c.currency, id } }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.status?.success === false) throw new Error(`Airtel refused the request: ${j.status?.message || r.status}`);
    return id;
  },
  async status(env, ref) {
    const c = airtel.cfg(env);
    const r = await fetch(`${c.base}/standard/v1/payments/${ref}`, { headers: await airtel.headers(env, c) });
    const j = await r.json().catch(() => ({}));
    const s = j.data?.transaction?.status;
    return { status: s === 'TS' ? 'SUCCESSFUL' : s === 'TF' || s === 'TE' ? 'FAILED' : 'PENDING', reason: j.data?.transaction?.message || '', txid: j.data?.transaction?.airtel_money_id || '' };
  },
};
const PROVIDERS = { mtn, airtel };

// ---------- SMS (Africa's Talking) ----------
async function sendSms(env, { to, message }) {
  if (!env.AT_USERNAME || !env.AT_API_KEY) return json({ error: 'SMS is not set up on the server yet.' }, 400);
  const list = (Array.isArray(to) ? to : [to]).map((p) => '+' + String(p).replace(/\D/g, '')).filter((p) => p.length > 9);
  if (!list.length || !message) return json({ error: 'Phone number and message are required.' }, 400);
  const sandbox = env.AT_USERNAME === 'sandbox';
  const form = new URLSearchParams({ username: env.AT_USERNAME, to: list.join(','), message: String(message).slice(0, 918) });
  if (env.AT_SENDER_ID) form.set('from', env.AT_SENDER_ID);
  const r = await fetch(`https://api.${sandbox ? 'sandbox.' : ''}africastalking.com/version1/messaging`, {
    method: 'POST', headers: { apiKey: env.AT_API_KEY, Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' }, body: form,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) return json({ error: 'SMS provider error: ' + (j.SMSMessageData?.Message || r.status) }, 502);
  const recipients = j.SMSMessageData?.Recipients || [];
  return json({ sent: recipients.filter((x) => /success/i.test(x.status)).length, recipients: recipients.map((x) => ({ number: x.number, status: x.status, cost: x.cost })) });
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const path = url.pathname;
    if (!path.startsWith('/api/')) return env.ASSETS.fetch(req);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (path === '/api/health') return json({ ok: true, app: 'pharmapos-cloud', configured: (env.SYNC_KEY || '').length >= 12 });
    try {
      const body = req.method === 'POST' ? await req.json().catch(() => null) : null;
      if (req.method === 'POST' && !body) return json({ error: 'Bad request' }, 400);
      if (path === '/api/login' && req.method === 'POST') return await login(env, body);

      const who = await authenticate(req, env);
      if (!who) return json({ error: 'Not signed in (wrong sync key or expired sign-in)' }, 401);

      if (path === '/api/sync' && req.method === 'POST') return await sync(env, body, who);
      if (path === '/api/config') return json({ mtn: mtn.enabled(env), airtel: airtel.enabled(env), sms: !!(env.AT_USERNAME && env.AT_API_KEY), mtnEnv: env.MTN_ENV || 'sandbox', airtelEnv: env.AIRTEL_ENV || 'uat', role: who.role });
      if (path === '/api/pay/request' && req.method === 'POST') {
        const p = PROVIDERS[body.provider];
        if (!p?.enabled(env)) return json({ error: `${body.provider === 'airtel' ? 'Airtel Money' : 'MTN MoMo'} is not set up on the server yet.` }, 400);
        const amount = Number(body.amount);
        if (!(amount > 0) || !body.phone) return json({ error: 'Phone and amount are required' }, 400);
        const ref = await p.request(env, { phone: String(body.phone).replace(/\D/g, ''), amount, reference: String(body.reference || 'PharmaPOS'), note: String(body.note || 'PharmaPOS payment') });
        return json({ ref, provider: body.provider });
      }
      if (path === '/api/pay/status') {
        const p = PROVIDERS[url.searchParams.get('provider')];
        const ref = url.searchParams.get('ref');
        if (!p || !ref) return json({ error: 'provider and ref required' }, 400);
        return json(await p.status(env, ref));
      }
      if (path === '/api/sms' && req.method === 'POST') return await sendSms(env, body);
      return json({ error: 'Not found' }, 404);
    } catch (e) {
      return json({ error: e.message || 'Server error' }, 500);
    }
  },
};

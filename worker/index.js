// RxPOS cloud on Cloudflare Workers (free plan) + D1 — multi-pharmacy ("tenant") edition.
//   /api/sync              offline-first sync, per pharmacy (same protocol as server/hub.mjs)
//   /api/login             staff sign in with their RxPOS email + password (+ pharmacy code if the email is used at several)
//   /api/password/forgot   send a 6-digit reset code by email (Brevo, works with Gmail addresses) or SMS
//   /api/password/reset    set a new password with that code
//   /api/config            which integrations are switched on for this pharmacy
//   /api/pay/*             MTN MoMo + Airtel Money "request to pay" with THIS pharmacy's own merchant keys
//   /api/sms               SMS via Africa's Talking
//   /api/owner/*           owner console (vendor): create/suspend client pharmacies, features, keys, data reset
// Everything else is the web app, served from ./dist.
//
// Secrets: SYNC_KEY (the original "main" pharmacy), OWNER_KEY (owner console), optional BREVO_API_KEY + BREVO_SENDER_EMAIL
// (+ BREVO_SENDER_NAME) for password emails, and payment/SMS keys for the main pharmacy (MTN_*, AIRTEL_*, AT_*).
// Other pharmacies' payment/SMS keys are stored per pharmacy (owner console → client → Payments & SMS).
const PAGE = 1000;
const MAX_PUSH = 500;
const TOKEN_DAYS = 30;
const MAIN = 'main';
// Tables only some roles may change; the server enforces it whatever a device sends
const GUARDED = { users: 'users.manage', roles: 'users.manage', settings: 'settings.manage', branches: 'settings.manage' };
const SERVER_ONLY = new Set(['license']);

let schemaReady = null;
function ensureSchema(db) {
  schemaReady ??= db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS records (tenant TEXT NOT NULL, k TEXT NOT NULL, t TEXT NOT NULL, id TEXT NOT NULL, rec TEXT,
      deleted INTEGER NOT NULL DEFAULT 0, at TEXT NOT NULL, seq INTEGER NOT NULL, origin TEXT, PRIMARY KEY (tenant, k))`),
    db.prepare('CREATE INDEX IF NOT EXISTS records_seq ON records(tenant, seq)'),
    db.prepare('CREATE INDEX IF NOT EXISTS records_t ON records(tenant, t)'),
    db.prepare(`CREATE TABLE IF NOT EXISTS tenants (id TEXT PRIMARY KEY, name TEXT NOT NULL, key_hash TEXT UNIQUE, features TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'active', secrets TEXT NOT NULL DEFAULT '{}', notes TEXT, created_at TEXT NOT NULL)`),
    db.prepare('CREATE TABLE IF NOT EXISTS login_fail (email TEXT PRIMARY KEY, n INTEGER NOT NULL, until INTEGER NOT NULL DEFAULT 0)'),
    db.prepare('CREATE TABLE IF NOT EXISTS reset_codes (k TEXT PRIMARY KEY, code_hash TEXT NOT NULL, expires INTEGER NOT NULL, tries INTEGER NOT NULL DEFAULT 0, sent INTEGER NOT NULL DEFAULT 0, window_start INTEGER NOT NULL DEFAULT 0)'),
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
const httpError = (status, message) => Object.assign(new Error(message), { status });

// ---------- crypto helpers ----------
const te = new TextEncoder();
const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const sha256 = async (s) => hex(await crypto.subtle.digest('SHA-256', te.encode(s)));
const randomKey = (n = 28) => b64url(crypto.getRandomValues(new Uint8Array(32))).replace(/[-_]/g, '').slice(0, n);
const safeEqual = (a, b) => { const x = te.encode(String(a)), y = te.encode(String(b)); return x.byteLength === y.byteLength && crypto.subtle.timingSafeEqual(x, y); };
const hmacKey = (env) => crypto.subtle.importKey('raw', te.encode('token:' + env.SYNC_KEY), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);

async function signToken(env, payload) {
  const body = b64url(te.encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(env), te.encode(body));
  return 'u.' + body + '.' + b64url(sig);
}
async function readToken(env, token) {
  const [, body, sig] = token.split('.');
  if (!body || !sig) return null;
  if (!(await crypto.subtle.verify('HMAC', await hmacKey(env), fromB64url(sig), te.encode(body)))) return null;
  const p = JSON.parse(new TextDecoder().decode(fromB64url(body)));
  return p.exp > Date.now() ? p : null;
}

async function pbkdf2(pw, saltB64, iter = 100000) {
  const key = await crypto.subtle.importKey('raw', te.encode(pw), 'PBKDF2', false, ['deriveBits']);
  const salt = Uint8Array.from(atob(saltB64), (c) => c.charCodeAt(0));
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, key, 256));
}
async function verifyPassword(u, pw) {
  if (u.algo === 'pbkdf2') return (await pbkdf2(pw, u.salt, u.iter || 100000)) === u.hash;
  return (await sha256('pharmapos:' + pw)) === u.hash;
}

// ---------- tenants ----------
const DEFAULT_FEATURES = { branches: true, wholesale: true, proformas: true, prescriptions: true, finance: true, reports: true, reminders: true,
  chat: true, labels: true, import: true, reorder: true, transfers: true, momo: true, drugInfo: true, shifts: true };

/** The original single-pharmacy deployment becomes tenant "main", keyed by the SYNC_KEY secret. */
async function ensureMainTenant(env) {
  if (!env.SYNC_KEY || env.__mainChecked) return;
  const h = await sha256(env.SYNC_KEY);
  await env.DB.prepare("INSERT INTO tenants (id, name, key_hash, features, created_at) VALUES ('main', 'Main pharmacy', ?1, ?2, ?3) ON CONFLICT(id) DO UPDATE SET key_hash = ?1")
    .bind(h, JSON.stringify(DEFAULT_FEATURES), new Date().toISOString()).run();
  env.__mainChecked = true;
}
const tenantById = (env, id) => env.DB.prepare('SELECT * FROM tenants WHERE id = ?1').bind(id).first();

/** → { tenant, role, name, uid } for a valid pharmacy sync key or staff token; null otherwise */
async function authenticate(req, env) {
  const got = (req.headers.get('Authorization') || '').replace(/^Bearer /, '');
  if (!got) return null;
  let who = null;
  if (got.startsWith('u.')) {
    const p = await readToken(env, got).catch(() => null);
    if (p) who = { tenant: p.tn || MAIN, role: p.role, name: p.name, uid: p.sub };
  } else {
    const t = await env.DB.prepare('SELECT id FROM tenants WHERE key_hash = ?1').bind(await sha256(got)).first();
    if (t) who = { tenant: t.id, role: 'admin', name: 'sync key' };
  }
  if (!who) return null;
  const t = await tenantById(env, who.tenant);
  if (!t) return null;
  if (t.status !== 'active') throw httpError(403, 'This pharmacy account is suspended. Please contact your RxPOS provider.');
  return { ...who, tenantRow: t };
}

/** Does this role (in this pharmacy) have the permission? Admin always does. */
async function roleCan(env, tenant, role, perm) {
  if (role === 'admin') return true;
  const r = await env.DB.prepare("SELECT rec FROM records WHERE tenant = ?1 AND t = 'roles' AND id = ?2 AND deleted = 0").bind(tenant, role).first();
  const rec = r?.rec ? JSON.parse(r.rec) : null;
  return !!rec?.permissions?.includes(perm);
}

/** Write a record from the server (license, password reset, owner actions) so devices pick it up on their next sync. */
async function serverWrite(env, tenant, t, id, rec, deleted = false) {
  const at = new Date().toISOString();
  await env.DB.prepare(`INSERT INTO records (tenant, k, t, id, rec, deleted, at, origin, seq) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'server', (SELECT COALESCE(MAX(seq), 0) + 1 FROM records))
    ON CONFLICT(tenant, k) DO UPDATE SET rec = excluded.rec, deleted = excluded.deleted, at = excluded.at, origin = 'server', seq = excluded.seq`)
    .bind(tenant, t + '|' + id, t, id, deleted ? null : JSON.stringify({ ...rec, id, updatedAt: at }), deleted ? 1 : 0, at).run();
}
const writeLicense = (env, t) => serverWrite(env, t.id, 'license', 'license', { tenant: t.id, name: t.name, status: t.status, features: { ...DEFAULT_FEATURES, ...JSON.parse(t.features || '{}') } });

// ---------- login & password recovery ----------
const MAX_FAILS = 5;
const LOCK_MINUTES = 15;

async function findUsers(env, email, tenant) {
  const q = tenant
    ? env.DB.prepare("SELECT tenant, rec FROM records WHERE t = 'users' AND deleted = 0 AND tenant = ?1").bind(tenant)
    : env.DB.prepare("SELECT tenant, rec FROM records WHERE t = 'users' AND deleted = 0");
  const { results } = await q.all();
  return results.map((r) => ({ tenant: r.tenant, u: JSON.parse(r.rec) })).filter((x) => x.u && x.u.email === email && !x.u.disabled);
}

async function pickUser(env, body) {
  const email = String(body.email || '').trim().toLowerCase().slice(0, 200);
  const tenant = body.tenant ? String(body.tenant).trim().toLowerCase() : '';
  const found = await findUsers(env, email, tenant);
  if (found.length > 1) throw httpError(409, 'This email is used at more than one pharmacy. Enter your pharmacy code to continue.');
  return { email, tenant: found[0]?.tenant || tenant || MAIN, match: found[0] };
}

async function login(env, body) {
  const { email, tenant, match } = await pickUser(env, body);
  const lockKey = tenant + ':' + email;
  const fail = await env.DB.prepare('SELECT n, until FROM login_fail WHERE email = ?1').bind(lockKey).first();
  if (fail && fail.until > Date.now()) {
    const mins = Math.ceil((fail.until - Date.now()) / 60000);
    return json({ error: `Too many wrong passwords. Try again in ${mins} minute${mins === 1 ? '' : 's'}, or use "Forgot password".` }, 429);
  }
  if (!match || !(await verifyPassword(match.u, String(body.password || '')))) {
    const n = (fail && fail.until <= Date.now() && fail.until > 0 ? 0 : fail?.n || 0) + 1;
    const until = n >= MAX_FAILS ? Date.now() + LOCK_MINUTES * 60000 : 0;
    await env.DB.prepare('INSERT INTO login_fail (email, n, until) VALUES (?1, ?2, ?3) ON CONFLICT(email) DO UPDATE SET n = ?2, until = ?3').bind(lockKey, until ? 0 : n, until).run();
    return json({ error: until ? `Too many wrong passwords. Sign-in is locked for ${LOCK_MINUTES} minutes.` : `Wrong email or password (${MAX_FAILS - n} attempt${MAX_FAILS - n === 1 ? '' : 's'} left before a ${LOCK_MINUTES}-minute lock).` }, until ? 429 : 401);
  }
  const t = await tenantById(env, match.tenant);
  if (!t || t.status !== 'active') return json({ error: 'This pharmacy account is suspended. Please contact your RxPOS provider.' }, 403);
  if (fail) await env.DB.prepare('DELETE FROM login_fail WHERE email = ?1').bind(lockKey).run();
  const u = match.u;
  const token = await signToken(env, { sub: u.id, tn: match.tenant, name: u.name, role: u.role, exp: Date.now() + TOKEN_DAYS * 864e5 });
  return json({ token, tenant: match.tenant, pharmacy: t.name, user: { id: u.id, name: u.name, email: u.email, role: u.role } });
}

const mask = (s, keep = 3) => (s.length <= keep ? '***' : s.slice(0, keep) + '***' + s.slice(-2));

async function sendEmail(env, to, subject, text) {
  if (!env.BREVO_API_KEY || !env.BREVO_SENDER_EMAIL) throw httpError(400, 'Password emails are not set up yet. Ask your administrator to reset your password.');
  const r = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST', headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ sender: { email: env.BREVO_SENDER_EMAIL, name: env.BREVO_SENDER_NAME || 'RxPOS' }, to: [{ email: to }], subject, textContent: text }),
  });
  if (!r.ok) throw httpError(502, 'The email could not be sent (' + r.status + ').');
}

async function forgotPassword(env, body) {
  const { email, tenant, match } = await pickUser(env, body);
  const channel = body.channel === 'sms' ? 'sms' : 'email';
  // Same answer whether or not the account exists, so this can't be used to discover staff emails
  const generic = { sent: true, channel, message: channel === 'sms' ? 'If that account has a phone number, a code is on its way by SMS.' : 'If that account exists, a code is on its way to its email inbox.' };
  if (!match) return json(generic);
  const k = tenant + ':' + email;
  const row = await env.DB.prepare('SELECT sent, window_start FROM reset_codes WHERE k = ?1').bind(k).first();
  const windowStart = row && Date.now() - row.window_start < 3600e3 ? row.window_start : Date.now();
  const sent = row && windowStart === row.window_start ? row.sent : 0;
  if (sent >= 3) return json({ error: 'Too many reset codes requested. Try again in an hour or ask your administrator.' }, 429);
  const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, '0');
  const t = await tenantById(env, match.tenant);
  const text = `Your RxPOS password reset code for ${t?.name || 'your pharmacy'} is ${code}. It expires in 15 minutes. If you did not ask for this, ignore this message.`;
  if (channel === 'sms') {
    const phone = String(match.u.phone || '').replace(/\D/g, '');
    if (phone.length < 9) return json(generic);
    const res = await sendSms(providerEnv(env, t), { to: [phone.startsWith('0') ? '256' + phone.slice(1) : phone], message: text });
    if (!res.ok) throw httpError(502, 'SMS could not be sent. Try email or ask your administrator.');
  } else {
    await sendEmail(env, match.u.email, 'Your RxPOS password reset code', text);
  }
  await env.DB.prepare('INSERT INTO reset_codes (k, code_hash, expires, tries, sent, window_start) VALUES (?1, ?2, ?3, 0, ?4, ?5) ON CONFLICT(k) DO UPDATE SET code_hash = ?2, expires = ?3, tries = 0, sent = ?4, window_start = ?5')
    .bind(k, await sha256(k + ':' + code), Date.now() + 15 * 60000, sent + 1, windowStart).run();
  return json({ ...generic, hint: channel === 'sms' ? mask(String(match.u.phone || ''), 4) : mask(match.u.email) });
}

async function resetPassword(env, body) {
  const { email, tenant, match } = await pickUser(env, body);
  const pw = String(body.password || '');
  if (pw.length < 8) return json({ error: 'Use a password of at least 8 characters.' }, 400);
  const k = tenant + ':' + email;
  const row = await env.DB.prepare('SELECT * FROM reset_codes WHERE k = ?1').bind(k).first();
  if (!row || row.expires < Date.now() || row.tries >= 5) return json({ error: 'That code has expired. Request a new one.' }, 400);
  if (!match || !safeEqual(row.code_hash, await sha256(k + ':' + String(body.code || '').trim()))) {
    await env.DB.prepare('UPDATE reset_codes SET tries = tries + 1 WHERE k = ?1').bind(k).run();
    return json({ error: 'Wrong code.' }, 400);
  }
  const salt = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
  const u = { ...match.u, algo: 'pbkdf2', salt, iter: 100000, hash: await pbkdf2(pw, salt) };
  await serverWrite(env, match.tenant, 'users', u.id, u);
  await serverWrite(env, match.tenant, 'audit', crypto.randomUUID(), { date: new Date().toISOString(), user: u.name, action: 'Password reset (forgot password)', details: 'via ' + (body.channel || 'email') + ' code', branchId: 'main' });
  await env.DB.batch([env.DB.prepare('DELETE FROM reset_codes WHERE k = ?1').bind(k), env.DB.prepare('DELETE FROM login_fail WHERE email = ?1').bind(k)]);
  return json({ ok: true });
}

// ---------- sync ----------
async function sync(env, body, who) {
  const db = env.DB;
  const tenant = who.tenant;
  const { deviceId, since = 0, changes = [] } = body;
  if (!deviceId) return json({ error: 'Missing deviceId' }, 400);
  if (changes.length > MAX_PUSH) return json({ error: `Send at most ${MAX_PUSH} changes per request` }, 413);

  // Last writer wins per record; every accepted write gets the next sequence number.
  const upsert = db.prepare(
    `INSERT INTO records (tenant, k, t, id, rec, deleted, at, origin, seq)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, (SELECT COALESCE(MAX(seq), 0) + 1 FROM records))
     ON CONFLICT(tenant, k) DO UPDATE SET rec = excluded.rec, deleted = excluded.deleted, at = excluded.at, origin = excluded.origin, seq = excluded.seq
     WHERE excluded.at > records.at`
  );
  const allowed = {};
  const stmts = [];
  let refused = 0;
  for (const ch of changes) {
    if (!ch || typeof ch.t !== 'string' || ch.id == null || typeof ch.at !== 'string') continue;
    if (SERVER_ONLY.has(ch.t)) { refused++; continue; }
    const perm = GUARDED[ch.t];
    if (perm) {
      allowed[perm] ??= await roleCan(env, tenant, who.role, perm);
      if (!allowed[perm]) { refused++; continue; }
    }
    const id = String(ch.id);
    stmts.push(upsert.bind(tenant, ch.t + '|' + id, ch.t, id, ch.deleted ? null : JSON.stringify(ch.rec ?? null), ch.deleted ? 1 : 0, ch.at, deviceId));
  }
  let applied = 0;
  if (stmts.length) for (const r of await db.batch(stmts)) applied += r.meta.changes || 0;

  const { results } = await db
    .prepare('SELECT t, id, rec, deleted, at, seq FROM records WHERE tenant = ?1 AND seq > ?2 AND origin IS NOT ?3 ORDER BY seq LIMIT ?4')
    .bind(tenant, Number(since) || 0, deviceId, PAGE + 1)
    .all();
  const more = results.length > PAGE;
  const page = more ? results.slice(0, PAGE) : results;
  const cursor = more ? page[page.length - 1].seq : ((await db.prepare('SELECT MAX(seq) m FROM records').first('m')) || 0);
  // Build the response by hand so records stored as JSON text are not parsed and re-serialised (keeps CPU low)
  const items = page.map((r) => `{"t":${JSON.stringify(r.t)},"id":${JSON.stringify(r.id)},"at":${JSON.stringify(r.at)},"deleted":${r.deleted ? 'true' : 'false'},"rec":${r.rec ?? 'null'}}`);
  return json(`{"changes":[${items.join(',')}],"cursor":${cursor},"more":${more},"applied":${applied},"refused":${refused},"tenant":${JSON.stringify(tenant)}}`);
}

// ---------- Mobile Money (per pharmacy) ----------
/** Payment/SMS keys for a pharmacy: the main pharmacy uses the Worker secrets, client pharmacies their own stored keys. */
function providerEnv(env, t) {
  if (!t || t.id === MAIN) return env;
  return { ...JSON.parse(t.secrets || '{}'), AIRTEL_RELAY_URL: env.AIRTEL_RELAY_URL, AIRTEL_RELAY_KEY: env.AIRTEL_RELAY_KEY, __tenant: t.id };
}
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
    return cachedToken('mtn:' + (env.__tenant || MAIN), async () => {
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

// Airtel only accepts calls from whitelisted server IPs. Workers have no fixed IP, so when AIRTEL_RELAY_URL is set
// every Airtel call goes through the RxPOS relay (relay/airtel-relay.mjs) running on a VM with a static IP.
async function airtelFetch(env, url, init = {}) {
  if (!env.AIRTEL_RELAY_URL) return fetch(url, init);
  const r = await fetch(env.AIRTEL_RELAY_URL.replace(/\/+$/, '') + '/forward', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Relay-Key': env.AIRTEL_RELAY_KEY || '' },
    body: JSON.stringify({ url, method: init.method || 'GET', headers: init.headers || {}, body: init.body }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('Airtel relay: ' + (j.error || r.status));
  return new Response(j.body, { status: j.status });
}

const airtel = {
  enabled: (env) => !!(env.AIRTEL_CLIENT_ID && env.AIRTEL_CLIENT_SECRET),
  cfg(env) {
    return { base: env.AIRTEL_ENV === 'production' ? 'https://openapi.airtel.africa' : 'https://openapiuat.airtel.africa', country: env.AIRTEL_COUNTRY || 'UG', currency: env.AIRTEL_CURRENCY || 'UGX' };
  },
  token(env) {
    const c = airtel.cfg(env);
    return cachedToken('airtel:' + (env.__tenant || MAIN), async () => {
      const r = await airtelFetch(env, c.base + '/auth/oauth2/token', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: '*/*' }, body: JSON.stringify({ client_id: env.AIRTEL_CLIENT_ID, client_secret: env.AIRTEL_CLIENT_SECRET, grant_type: 'client_credentials' }) });
      if (!r.ok) throw new Error(`Airtel sign-in failed (${r.status})`);
      const j = await r.json();
      return { value: j.access_token, ttl: Number(j.expires_in) || 3000 };
    });
  },
  headers: async (env, c) => ({ Authorization: 'Bearer ' + (await airtel.token(env)), 'Content-Type': 'application/json', Accept: '*/*', 'X-Country': c.country, 'X-Currency': c.currency }),
  async request(env, { phone, amount, reference }) {
    const c = airtel.cfg(env);
    const id = reference.replace(/[^A-Za-z0-9]/g, '').slice(0, 20) + Date.now().toString(36).slice(-4).toUpperCase();
    const r = await airtelFetch(env, c.base + '/merchant/v1/payments/', {
      method: 'POST', headers: await airtel.headers(env, c),
      body: JSON.stringify({ reference: reference.slice(0, 64), subscriber: { country: c.country, currency: c.currency, msisdn: phone.replace(/^256/, '') }, transaction: { amount: Math.round(amount), country: c.country, currency: c.currency, id } }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.status?.success === false) throw new Error(`Airtel refused the request: ${j.status?.message || r.status}`);
    return id;
  },
  async status(env, ref) {
    const c = airtel.cfg(env);
    const r = await airtelFetch(env, `${c.base}/standard/v1/payments/${ref}`, { headers: await airtel.headers(env, c) });
    const j = await r.json().catch(() => ({}));
    const s = j.data?.transaction?.status;
    return { status: s === 'TS' ? 'SUCCESSFUL' : s === 'TF' || s === 'TE' ? 'FAILED' : 'PENDING', reason: j.data?.transaction?.message || '', txid: j.data?.transaction?.airtel_money_id || '' };
  },
};
const PROVIDERS = { mtn, airtel };

// ---------- SMS (Africa's Talking) ----------
async function sendSms(env, { to, message }) {
  if (!env.AT_USERNAME || !env.AT_API_KEY) return json({ error: 'SMS is not set up for this pharmacy yet.' }, 400);
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

// ---------- owner console (vendor) ----------
const SECRET_FIELDS = ['MTN_SUBSCRIPTION_KEY', 'MTN_API_USER', 'MTN_API_KEY', 'MTN_ENV', 'MTN_TARGET', 'AIRTEL_CLIENT_ID', 'AIRTEL_CLIENT_SECRET', 'AIRTEL_ENV', 'AT_USERNAME', 'AT_API_KEY', 'AT_SENDER_ID'];
const KEEP_ON_RESET = "('products','formulations','expenseCategories','license','roles')";

async function owner(env, req, url, body) {
  if (!env.OWNER_KEY || env.OWNER_KEY.length < 20) throw httpError(503, 'The owner console is not enabled (OWNER_KEY secret missing).');
  if (!safeEqual((req.headers.get('Authorization') || '').replace(/^Bearer /, ''), env.OWNER_KEY)) throw httpError(401, 'Wrong owner key.');
  const db = env.DB;
  const parts = url.pathname.split('/').slice(3); // /api/owner/<...>
  const view = async (t) => {
    const s = await db.prepare("SELECT COUNT(*) n, MAX(at) last, SUM(t = 'products' AND deleted = 0) products, SUM(t = 'users' AND deleted = 0) users, SUM(t = 'sales' AND deleted = 0) sales FROM records WHERE tenant = ?1").bind(t.id).first();
    const secrets = JSON.parse(t.secrets || '{}');
    return { id: t.id, name: t.name, status: t.status, notes: t.notes || '', created: t.created_at, features: { ...DEFAULT_FEATURES, ...JSON.parse(t.features || '{}') },
      stats: { records: s.n || 0, products: s.products || 0, users: s.users || 0, sales: s.sales || 0, lastActivity: s.last || null },
      payments: { mtn: t.id === MAIN ? mtn.enabled(env) : mtn.enabled(secrets), airtel: t.id === MAIN ? airtel.enabled(env) : airtel.enabled(secrets), sms: t.id === MAIN ? !!env.AT_API_KEY : !!secrets.AT_API_KEY } };
  };

  if (parts[0] === 'tenants' && !parts[1] && req.method === 'GET') {
    const { results } = await db.prepare('SELECT * FROM tenants ORDER BY created_at').all();
    return json({ tenants: await Promise.all(results.map(view)) });
  }
  if (parts[0] === 'tenants' && !parts[1] && req.method === 'POST') {
    const id = String(body.id || '').trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]{1,23}$/.test(id)) return json({ error: 'Pharmacy code: 2-24 lowercase letters, numbers or dashes (e.g. "jbm-kampala").' }, 400);
    if (await tenantById(env, id)) return json({ error: 'That pharmacy code is already used.' }, 409);
    const key = randomKey();
    const features = JSON.stringify({ ...DEFAULT_FEATURES, ...(body.features || {}) });
    await db.prepare('INSERT INTO tenants (id, name, key_hash, features, notes, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)')
      .bind(id, String(body.name || id).slice(0, 80), await sha256(key), features, String(body.notes || '').slice(0, 500), new Date().toISOString()).run();
    const t = await tenantById(env, id);
    await writeLicense(env, t);
    if (body.copyCatalogFrom) {
      // Give the new pharmacy the standard medicine list (no stock, no prices changed)
      await db.prepare(`INSERT INTO records (tenant, k, t, id, rec, deleted, at, origin, seq)
        SELECT ?1, k, t, id, rec, 0, at, 'server', seq FROM records WHERE tenant = ?2 AND deleted = 0 AND t IN ('products','formulations','expenseCategories') AND (t != 'products' OR id LIKE 'cat-%')`)
        .bind(id, String(body.copyCatalogFrom)).run();
    }
    return json({ tenant: await view(t), syncKey: key, note: 'Give this sync key to the pharmacy owner. It is shown only once.' });
  }
  const t = parts[1] && (await tenantById(env, parts[1]));
  if (!t) return json({ error: 'No such pharmacy.' }, 404);

  if (parts[2] === undefined && req.method === 'POST') {
    const name = body.name != null ? String(body.name).slice(0, 80) : t.name;
    const status = ['active', 'suspended'].includes(body.status) ? body.status : t.status;
    const features = body.features ? JSON.stringify({ ...JSON.parse(t.features || '{}'), ...body.features }) : t.features;
    const notes = body.notes != null ? String(body.notes).slice(0, 500) : t.notes;
    await db.prepare('UPDATE tenants SET name = ?2, status = ?3, features = ?4, notes = ?5 WHERE id = ?1').bind(t.id, name, status, features, notes).run();
    const u = await tenantById(env, t.id);
    await writeLicense(env, u);
    return json({ tenant: await view(u) });
  }
  if (parts[2] === 'rotate-key' && req.method === 'POST') {
    if (t.id === MAIN) return json({ error: 'The main pharmacy key is the SYNC_KEY secret; change it with "wrangler secret put SYNC_KEY".' }, 400);
    const key = randomKey();
    await db.prepare('UPDATE tenants SET key_hash = ?2 WHERE id = ?1').bind(t.id, await sha256(key)).run();
    return json({ syncKey: key, note: 'The old key stops working now. Devices must reconnect with this key or with staff accounts.' });
  }
  if (parts[2] === 'secrets' && req.method === 'POST') {
    if (t.id === MAIN) return json({ error: 'The main pharmacy uses the Cloudflare secrets (deploy\\setup-mobile-money.ps1).' }, 400);
    const cur = JSON.parse(t.secrets || '{}');
    for (const f of SECRET_FIELDS) if (body[f] !== undefined) { if (body[f] === '') delete cur[f]; else cur[f] = String(body[f]).trim(); }
    await db.prepare('UPDATE tenants SET secrets = ?2 WHERE id = ?1').bind(t.id, JSON.stringify(cur)).run();
    return json({ tenant: await view(await tenantById(env, t.id)) });
  }
  if (parts[2] === 'reset' && req.method === 'POST') {
    if (body.confirm !== t.id) return json({ error: 'Type the pharmacy code to confirm.' }, 400);
    const now = new Date().toISOString();
    const keep = body.keepMedicines === false ? "('license','roles')" : KEEP_ON_RESET;
    const m = (await db.prepare('SELECT COALESCE(MAX(seq), 0) m FROM records').first('m')) || 0;
    const r = await db.prepare(`UPDATE records SET deleted = 1, rec = NULL, at = ?2, origin = 'reset', seq = seq + ?3 WHERE tenant = ?1 AND deleted = 0 AND t NOT IN ${keep}
      AND NOT (t = 'customers' AND id = 'walk-in') AND NOT (t = 'banks' AND id = 'cash-drawer') AND NOT (t = 'branches' AND id = 'main')`).bind(t.id, now, m).run();
    return json({ ok: true, cleared: r.meta.changes || 0 });
  }
  return json({ error: 'Not found' }, 404);
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const path = url.pathname;
    if (!path.startsWith('/api/')) return env.ASSETS.fetch(req);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    try {
      await ensureSchema(env.DB);
      await ensureMainTenant(env);
      if (path === '/api/health') return json({ ok: true, app: 'rxpos-cloud', configured: (env.SYNC_KEY || '').length >= 12, multiPharmacy: true });
      const body = req.method === 'POST' ? await req.json().catch(() => null) : null;
      if (req.method === 'POST' && !body) return json({ error: 'Bad request' }, 400);
      if (path === '/api/login' && req.method === 'POST') return await login(env, body);
      if (path === '/api/password/forgot' && req.method === 'POST') return await forgotPassword(env, body);
      if (path === '/api/password/reset' && req.method === 'POST') return await resetPassword(env, body);
      if (path.startsWith('/api/owner/')) return await owner(env, req, url, body);

      const who = await authenticate(req, env);
      if (!who) return json({ error: 'Not signed in (wrong sync key or expired sign-in)' }, 401);
      const penv = providerEnv(env, who.tenantRow);

      if (path === '/api/sync' && req.method === 'POST') return await sync(env, body, who);
      if (path === '/api/config') return json({ tenant: who.tenant, pharmacy: who.tenantRow.name, mtn: mtn.enabled(penv), airtel: airtel.enabled(penv), sms: !!(penv.AT_USERNAME && penv.AT_API_KEY), email: !!(env.BREVO_API_KEY && env.BREVO_SENDER_EMAIL), mtnEnv: penv.MTN_ENV || 'sandbox', airtelEnv: penv.AIRTEL_ENV || 'uat', role: who.role });
      if (path === '/api/pay/request' && req.method === 'POST') {
        const p = PROVIDERS[body.provider];
        if (!p?.enabled(penv)) return json({ error: `${body.provider === 'airtel' ? 'Airtel Money' : 'MTN MoMo'} is not set up for this pharmacy yet.` }, 400);
        const amount = Number(body.amount);
        if (!(amount > 0) || !body.phone) return json({ error: 'Phone and amount are required' }, 400);
        const ref = await p.request(penv, { phone: String(body.phone).replace(/\D/g, ''), amount, reference: String(body.reference || 'RxPOS'), note: String(body.note || 'RxPOS payment') });
        return json({ ref, provider: body.provider });
      }
      if (path === '/api/pay/status') {
        const p = PROVIDERS[url.searchParams.get('provider')];
        const ref = url.searchParams.get('ref');
        if (!p || !ref) return json({ error: 'provider and ref required' }, 400);
        return json(await p.status(penv, ref));
      }
      if (path === '/api/sms' && req.method === 'POST') return await sendSms(penv, body);
      return json({ error: 'Not found' }, 404);
    } catch (e) {
      return json({ error: e.message || 'Server error' }, e.status || 500);
    }
  },
};

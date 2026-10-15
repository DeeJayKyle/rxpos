// Owner (RxPOS vendor) account for the owner console:
//  • the owner's own password (changeable), checked with PBKDF2 and a lockout after 5 wrong tries
//  • "Sign in with Google" (Gmail) and "Sign in with GitHub" to get back in when the password is forgotten
//  • the OWNER_KEY secret still works as the emergency master key
// A successful sign-in returns a 12-hour owner session token ("o.<payload>.<signature>").
// Settings live in the owner_config table: pw, email, google_email, google_client_id, github_login, github_client_id, github_client_secret.
// "email" lets the owner sign in on the main page (rxposug.com) with that email + the owner password.

const te = new TextEncoder();
const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const SESSION_HOURS = 12;
const MAX_FAILS = 5, LOCK_MINUTES = 15;

const key = (env) => crypto.subtle.importKey('raw', te.encode('owner-session:' + env.OWNER_KEY), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
async function sign(env, payload) {
  const body = b64url(te.encode(JSON.stringify(payload)));
  return body + '.' + b64url(await crypto.subtle.sign('HMAC', await key(env), te.encode(body)));
}
async function unsign(env, token) {
  const [body, sig] = String(token || '').split('.');
  if (!body || !sig) return null;
  if (!(await crypto.subtle.verify('HMAC', await key(env), fromB64url(sig), te.encode(body)))) return null;
  const p = JSON.parse(new TextDecoder().decode(fromB64url(body)));
  return p.exp > Date.now() ? p : null;
}
export const ownerSession = async (env, via) => 'o.' + (await sign(env, { kind: 'owner', via, exp: Date.now() + SESSION_HOURS * 3600e3 }));

/** Is this bearer token the master key or a valid owner session? */
export async function isOwner(env, bearer, safeEqual) {
  if (!env.OWNER_KEY || env.OWNER_KEY.length < 20) return false;
  if (safeEqual(bearer, env.OWNER_KEY)) return true;
  if (!bearer.startsWith('o.')) return false;
  const p = await unsign(env, bearer.slice(2)).catch(() => null);
  return p?.kind === 'owner';
}

// ---------- settings ----------
export async function getConfig(db) {
  const { results } = await db.prepare('SELECT k, v FROM owner_config').all();
  return Object.fromEntries(results.map((r) => [r.k, r.v]));
}
const setConfig = (db, entries) => db.batch(Object.entries(entries).map(([k, v]) => (v == null || v === ''
  ? db.prepare('DELETE FROM owner_config WHERE k = ?1').bind(k)
  : db.prepare('INSERT INTO owner_config (k, v) VALUES (?1, ?2) ON CONFLICT(k) DO UPDATE SET v = ?2').bind(k, String(v)))));

async function pbkdf2(pw, salt) {
  const k = await crypto.subtle.importKey('raw', te.encode(pw), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: Uint8Array.from(atob(salt), (c) => c.charCodeAt(0)), iterations: 100000, hash: 'SHA-256' }, k, 256));
}
async function checkPassword(cfg, pw) {
  if (!cfg.pw) return false;
  const { salt, hash } = JSON.parse(cfg.pw);
  return (await pbkdf2(pw, salt)) === hash;
}

/**
 * Main sign-in page: is this the owner's email and password? Doesn't count wrong tries itself (the caller does that
 * only when nothing else matched, so the owner's own staff sign-ins never lock the owner out).
 * → { match: true, token } | { locked: true } | { owner: true } (owner email, wrong password) | null (not the owner's email)
 */
export async function ownerMainLogin(env, email, password) {
  if (!env.OWNER_KEY || env.OWNER_KEY.length < 20) return null;
  const cfg = await getConfig(env.DB);
  if (!cfg.email || !cfg.pw || String(email || '').trim().toLowerCase() !== cfg.email.toLowerCase()) return null;
  const fail = await env.DB.prepare('SELECT n, until FROM login_fail WHERE email = ?1').bind('owner:').first();
  if (fail && fail.until > Date.now()) return { locked: true };
  if (!(await checkPassword(cfg, String(password || '')))) return { owner: true };
  if (fail) await env.DB.prepare('DELETE FROM login_fail WHERE email = ?1').bind('owner:').run();
  return { match: true, token: await ownerSession(env, 'password') };
}
/** Count a wrong owner password tried on the main page */
export async function ownerMainFail(env) {
  const fail = await env.DB.prepare('SELECT n, until FROM login_fail WHERE email = ?1').bind('owner:').first();
  const n = (fail && fail.until <= Date.now() && fail.until > 0 ? 0 : fail?.n || 0) + 1;
  const until = n >= MAX_FAILS ? Date.now() + LOCK_MINUTES * 60000 : 0;
  await env.DB.prepare('INSERT INTO login_fail (email, n, until) VALUES (?1, ?2, ?3) ON CONFLICT(email) DO UPDATE SET n = ?2, until = ?3').bind('owner:', until ? 0 : n, until).run();
}

// ---------- Google: verify the ID token from "Sign in with Google" ----------
let googleKeys = null;
export async function verifyGoogle(credential, clientId) {
  const [h, p, s] = String(credential || '').split('.');
  if (!h || !p || !s) throw new Error('Google sign-in failed.');
  const header = JSON.parse(new TextDecoder().decode(fromB64url(h)));
  if (!googleKeys || googleKeys.exp < Date.now()) {
    const r = await fetch('https://www.googleapis.com/oauth2/v3/certs');
    googleKeys = { keys: (await r.json()).keys, exp: Date.now() + 3600e3 };
  }
  const jwk = googleKeys.keys.find((k) => k.kid === header.kid);
  if (!jwk) throw new Error('Google sign-in failed (unknown key).');
  const k = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  if (!(await crypto.subtle.verify('RSASSA-PKCS1-v1_5', k, fromB64url(s), te.encode(h + '.' + p)))) throw new Error('Google sign-in failed (bad signature).');
  const c = JSON.parse(new TextDecoder().decode(fromB64url(p)));
  if (!['accounts.google.com', 'https://accounts.google.com'].includes(c.iss) || c.aud !== clientId || c.exp * 1000 < Date.now()) throw new Error('Google sign-in expired. Try again.');
  if (!c.email_verified) throw new Error('That Google account email is not verified.');
  return String(c.email).toLowerCase();
}

// ---------- routes ----------
/** Public: /api/owner-auth/* (sign in, recovery). */
export async function ownerAuthRoutes(env, req, url, body, { json, safeEqual }) {
  const db = env.DB;
  const path = url.pathname.replace('/api/owner-auth', '');
  const publicUrl = (env.PUBLIC_URL || url.origin).replace(/\/+$/, '');
  if (!env.OWNER_KEY || env.OWNER_KEY.length < 20) return json({ error: 'The owner console is not enabled (OWNER_KEY secret missing).' }, 503);
  const cfg = await getConfig(db);

  if (path === '/config' && req.method === 'GET') {
    return json({ password: !!cfg.pw, google: cfg.google_client_id && cfg.google_email ? { clientId: cfg.google_client_id } : null, github: !!(cfg.github_client_id && cfg.github_client_secret && cfg.github_login) });
  }

  if (path === '/login' && req.method === 'POST') {
    const lock = 'owner:';
    const fail = await db.prepare('SELECT n, until FROM login_fail WHERE email = ?1').bind(lock).first();
    const secret = String(body.password || '');
    // The master key (long and random) always works, even during a lock: it is the emergency way back in
    const master = safeEqual(secret, env.OWNER_KEY);
    if (!master && fail && fail.until > Date.now()) return json({ error: `Too many wrong tries. Try again in ${Math.ceil((fail.until - Date.now()) / 60000)} minutes, sign in with Google / GitHub, or use the master key.` }, 429);
    let via = null;
    if (master) via = 'master key';
    else if (await checkPassword(cfg, secret)) via = 'password';
    if (!via) {
      const n = (fail && fail.until <= Date.now() && fail.until > 0 ? 0 : fail?.n || 0) + 1;
      const until = n >= MAX_FAILS ? Date.now() + LOCK_MINUTES * 60000 : 0;
      await db.prepare('INSERT INTO login_fail (email, n, until) VALUES (?1, ?2, ?3) ON CONFLICT(email) DO UPDATE SET n = ?2, until = ?3').bind(lock, until ? 0 : n, until).run();
      return json({ error: until ? `Too many wrong tries. Locked for ${LOCK_MINUTES} minutes; use Google / GitHub to sign in.` : cfg.pw ? 'Wrong password.' : 'Wrong owner key.' }, until ? 429 : 401);
    }
    if (fail) await db.prepare('DELETE FROM login_fail WHERE email = ?1').bind(lock).run();
    return json({ token: await ownerSession(env, via), via, mustSetPassword: !cfg.pw });
  }

  if (path === '/google' && req.method === 'POST') {
    if (!cfg.google_client_id || !cfg.google_email) return json({ error: 'Google sign-in is not set up yet.' }, 400);
    try {
      const email = await verifyGoogle(body.credential, cfg.google_client_id);
      if (email !== cfg.google_email.toLowerCase()) return json({ error: `${email} is not the owner's Google account.` }, 403);
      return json({ token: await ownerSession(env, 'google'), via: 'google' });
    } catch (e) { return json({ error: e.message }, 401); }
  }

  if (path === '/github/start' && req.method === 'GET') {
    if (!cfg.github_client_id || !cfg.github_login) return Response.redirect(publicUrl + '/#/owner?oerr=' + encodeURIComponent('GitHub sign-in is not set up yet.'), 302);
    const state = await sign(env, { kind: 'gh-state', exp: Date.now() + 10 * 60000, n: crypto.randomUUID() });
    const u = new URL('https://github.com/login/oauth/authorize');
    u.search = new URLSearchParams({ client_id: cfg.github_client_id, redirect_uri: publicUrl + '/api/owner-auth/github/callback', scope: 'read:user', state, allow_signup: 'false' }).toString();
    return Response.redirect(u.toString(), 302);
  }
  if (path === '/github/callback' && req.method === 'GET') {
    const back = (q) => Response.redirect(publicUrl + '/#/owner?' + q, 302);
    try {
      const st = await unsign(env, url.searchParams.get('state'));
      if (st?.kind !== 'gh-state') return back('oerr=' + encodeURIComponent('GitHub sign-in expired. Try again.'));
      const t = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: cfg.github_client_id, client_secret: cfg.github_client_secret, code: url.searchParams.get('code'), redirect_uri: publicUrl + '/api/owner-auth/github/callback' }),
      }).then((r) => r.json());
      if (!t.access_token) return back('oerr=' + encodeURIComponent('GitHub did not confirm the sign-in.'));
      const u = await fetch('https://api.github.com/user', { headers: { Authorization: 'Bearer ' + t.access_token, 'User-Agent': 'RxPOS', Accept: 'application/vnd.github+json' } }).then((r) => r.json());
      if (String(u.login || '').toLowerCase() !== String(cfg.github_login).toLowerCase()) return back('oerr=' + encodeURIComponent(`GitHub user ${u.login} is not the owner's account.`));
      return back('ot=' + encodeURIComponent(await ownerSession(env, 'github')));
    } catch (e) { return back('oerr=' + encodeURIComponent('GitHub sign-in failed: ' + e.message)); }
  }
  return json({ error: 'Not found' }, 404);
}

/** Owner-only: /api/owner/account (already authenticated by the caller). */
export async function ownerAccount(env, req, url, body, { json }) {
  const db = env.DB;
  const cfg = await getConfig(db);
  const publicUrl = (env.PUBLIC_URL || url.origin).replace(/\/+$/, '');
  const view = (c) => ({
    hasPassword: !!c.pw, email: c.email || '', googleEmail: c.google_email || '', googleClientId: c.google_client_id || '',
    githubLogin: c.github_login || '', githubClientId: c.github_client_id || '', githubSecretSet: !!c.github_client_secret,
    githubCallback: publicUrl + '/api/owner-auth/github/callback', origin: publicUrl,
  });
  if (req.method === 'GET') return json(view(cfg));
  if (body.password != null) {
    const pw = String(body.password);
    if (pw.length < 10) return json({ error: 'Use at least 10 characters for the owner password.' }, 400);
    if (cfg.pw && !(await checkPassword(cfg, String(body.current || ''))) && String(body.current || '') !== env.OWNER_KEY) return json({ error: 'Your current password is wrong.' }, 400);
    const salt = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
    await setConfig(db, { pw: JSON.stringify({ salt, hash: await pbkdf2(pw, salt) }) });
  }
  const allowed = { email: 'email', googleEmail: 'google_email', googleClientId: 'google_client_id', githubLogin: 'github_login', githubClientId: 'github_client_id', githubClientSecret: 'github_client_secret' };
  const updates = {};
  for (const [k, col] of Object.entries(allowed)) if (body[k] !== undefined) updates[col] = String(body[k]).trim();
  if (updates.google_email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(updates.google_email)) return json({ error: 'Enter a valid Google (Gmail) address.' }, 400);
  if (updates.email) updates.email = updates.email.toLowerCase();
  if (updates.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(updates.email)) return json({ error: 'Enter a valid email for the owner.' }, 400);
  if (Object.keys(updates).length) await setConfig(db, updates);
  return json(view(await getConfig(db)));
}

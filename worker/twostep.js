// Two-step sign-in with an authenticator app (Google Authenticator, Microsoft Authenticator, Authy…): standard
// time-based 6-digit codes (TOTP, RFC 6238, SHA-1, 30 s). The secret lives only in the cloud's `twofa` table, never
// in the synced records, so a staff device can't read anyone's secret. A code is accepted once (no replay).

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function b32encode(bytes) {
  let bits = 0, value = 0, out = '';
  for (const b of bytes) { value = (value << 8) | b; bits += 8; while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}
export function b32decode(s) {
  const clean = String(s).toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0, value = 0; const out = [];
  for (const c of clean) { value = (value << 5) | B32.indexOf(c); bits += 5; if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; } }
  return new Uint8Array(out);
}

/** The 6-digit code for a secret at a 30-second step */
export async function totpAt(secret, step) {
  const key = await crypto.subtle.importKey('raw', b32decode(secret), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const msg = new ArrayBuffer(8);
  new DataView(msg).setUint32(0, Math.floor(step / 2 ** 32)); new DataView(msg).setUint32(4, step >>> 0);
  const h = new Uint8Array(await crypto.subtle.sign('HMAC', key, msg));
  const o = h[h.length - 1] & 15;
  const n = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1e6).padStart(6, '0');
}
/** The step the code matches (the current one or one either side, for clocks a little off), newer than `after`; else -1 */
export async function totpCheck(secret, code, after = 0, now = Date.now()) {
  const c = String(code || '').replace(/\D/g, '');
  if (c.length !== 6 || !secret) return -1;
  const step = Math.floor(now / 30000);
  for (const s of [step, step - 1, step + 1]) if (s > after && (await totpAt(secret, s)) === c) return s;
  return -1;
}

export const twoStepDdl = 'CREATE TABLE twofa (tenant TEXT NOT NULL, uid TEXT NOT NULL, secret TEXT, pending TEXT, enabled INTEGER NOT NULL DEFAULT 0, last_step INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (tenant, uid))';
export const twoStepOf = (env, tenant, uid) => env.DB.prepare('SELECT * FROM twofa WHERE tenant = ?1 AND uid = ?2').bind(tenant, uid).first();
export const markUsed = (env, tenant, uid, step) => env.DB.prepare('UPDATE twofa SET last_step = ?3 WHERE tenant = ?1 AND uid = ?2').bind(tenant, uid, step).run();

/**
 * /api/2fa…  (signed-in staff; `who` from the sign-in token)
 *   GET  /api/2fa              → { enabled }                    this person
 *   POST /api/2fa/setup        → { secret, uri }                start: a new secret to scan (not active yet)
 *   POST /api/2fa/enable {code}  → { enabled: true }            the first code from the app switches it on
 *   POST /api/2fa/disable {code} → { enabled: false }           a current code switches it off
 *   GET  /api/2fa/users        → { enabled: [uid…] }            administrators: who has it on
 *   POST /api/2fa/reset {uid}  → { ok }                         administrators: a staff member lost their phone
 * The person's user record carries `twoFactor: true/false` so devices know a code is needed (no secret in it).
 */
export async function twoStepRoutes(env, req, path, body, who, { json, roleCan, existingRec, serverWriteMany, audit }) {
  if (!who.uid) return json({ error: 'Sign in with your own account to use two-step sign-in' }, 403);
  const db = env.DB, tenant = who.tenant;
  const flag = async (uid, on) => {
    const u = await existingRec(db, tenant, 'users', uid);
    if (u && !!u.twoFactor !== on) await serverWriteMany(env, tenant, [{ t: 'users', id: uid, rec: { ...u, twoFactor: on } }, audit(on ? 'Two-step sign-in switched on' : 'Two-step sign-in switched off', u.name)]);
  };
  const row = await twoStepOf(env, tenant, who.uid);
  if (path === '/api/2fa' && req.method === 'GET') return json({ enabled: !!row?.enabled });
  if (path === '/api/2fa/setup' && req.method === 'POST') {
    if (row?.enabled) return json({ error: 'Two-step sign-in is already on. Switch it off first to move it to a new phone.' }, 409);
    const secret = b32encode(crypto.getRandomValues(new Uint8Array(20)));
    await db.prepare('INSERT INTO twofa (tenant, uid, pending) VALUES (?1, ?2, ?3) ON CONFLICT(tenant, uid) DO UPDATE SET pending = ?3').bind(tenant, who.uid, secret).run();
    const u = await existingRec(db, tenant, 'users', who.uid);
    const label = 'RxPOS:' + encodeURIComponent(u?.email || who.name || 'staff'); // issuer, literal colon, account (the most compatible form)
    return json({ secret, uri: `otpauth://totp/${label}?secret=${secret}&issuer=RxPOS&digits=6&period=30` });
  }
  if (path === '/api/2fa/enable' && req.method === 'POST') {
    const step = await totpCheck(row?.pending, body?.code);
    if (step < 0) return json({ error: 'That code is not right. Check the time on the phone is correct and type the newest code.' }, 400);
    await db.prepare('UPDATE twofa SET secret = pending, pending = NULL, enabled = 1, last_step = ?3 WHERE tenant = ?1 AND uid = ?2').bind(tenant, who.uid, step).run();
    await flag(who.uid, true);
    return json({ enabled: true });
  }
  if (path === '/api/2fa/disable' && req.method === 'POST') {
    if (!row?.enabled) return json({ enabled: false });
    const step = await totpCheck(row.secret, body?.code, row.last_step);
    if (step < 0) return json({ error: 'That code is not right.' }, 400);
    await db.prepare('DELETE FROM twofa WHERE tenant = ?1 AND uid = ?2').bind(tenant, who.uid).run();
    await flag(who.uid, false);
    return json({ enabled: false });
  }
  if (path === '/api/2fa/users' || path === '/api/2fa/reset') {
    if (!(await roleCan(env, tenant, who.role, 'users.manage'))) return json({ error: 'Only administrators' }, 403);
    if (path === '/api/2fa/users') return json({ enabled: (await db.prepare('SELECT uid FROM twofa WHERE tenant = ?1 AND enabled = 1').bind(tenant).all()).results.map((r) => r.uid) });
    if (req.method !== 'POST' || !body?.uid) return json({ error: 'Bad request' }, 400);
    await db.prepare('DELETE FROM twofa WHERE tenant = ?1 AND uid = ?2').bind(tenant, String(body.uid)).run();
    await flag(String(body.uid), false);
    return json({ ok: true });
  }
  return json({ error: 'Not found' }, 404);
}

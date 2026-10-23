// Device-bound offline sign-in (RxPOS security 0.2).
//
// Password hashes are no longer synced to devices, so a lost device — or a copy of its stored data — no longer
// exposes every staff member's password hash. Instead each device keeps, ONLY for the people who actually sign in
// on it, a small local verifier derived from their password, and (optionally) a quick numeric PIN. None of this is
// ever synced or sent to the cloud; it lives in this device's localStorage alone.
//
// A verifier is a slow salted hash of the password with a per-device random salt, so it cannot be moved to another
// device and cannot be matched against the synced records. A device can only verify a password offline for a user
// who has signed in on it at least once; everyone else's secrets are simply not present.
const KEY = 'rxpos-offline-v1';
const te = new TextEncoder();
const PW_ITER = 100000; // same cost as the server's password hash
const PIN_ITER = 310000; // a PIN is short, so hash it harder
const PIN_MAX_TRIES = 5; // then the PIN is forgotten and the full password is required

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const b64 = (bytes) => btoa(String.fromCharCode(...bytes));
const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
const write = (v) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* storage blocked */ } };
const slot = (tenant, userId) => `${tenant || ''}:${userId}`;
const newSalt = () => b64(crypto.getRandomValues(new Uint8Array(16)));

async function pbkdf2(pw, saltB64, iter) {
  const key = await crypto.subtle.importKey('raw', te.encode(pw), 'PBKDF2', false, ['deriveBits']);
  const salt = Uint8Array.from(atob(saltB64), (c) => c.charCodeAt(0));
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, key, 256));
}
const legacySha = async (pw) => hex(await crypto.subtle.digest('SHA-256', te.encode('pharmapos:' + pw)));

/** Remember a user's password on THIS device so they can sign in offline later. Call after any password sign-in. */
export async function rememberOffline(tenant, userId, password) {
  if (!userId || !password) return;
  const salt = newSalt();
  const all = read();
  all[slot(tenant, userId)] = { ...(all[slot(tenant, userId)] || {}), pw: { salt, iter: PW_ITER, hash: await pbkdf2(password, salt, PW_ITER) } };
  write(all);
}

/** Migration: adopt a synced hash a device still holds for a user, before it is stripped, so offline sign-in keeps
 *  working for that user until their next password entry (no plaintext needed, and only for this one user). */
export function adoptSyncedHash(tenant, userId, rec) {
  if (!userId || !rec?.hash) return;
  const all = read();
  const s = slot(tenant, userId);
  if (all[s]?.pw) return; // already have a device-salted verifier — nothing to adopt
  all[s] = { ...(all[s] || {}), legacy: { algo: rec.algo === 'pbkdf2' ? 'pbkdf2' : 'sha256', salt: rec.salt || '', hash: rec.hash } };
  write(all);
}

/** Does this device know how to verify this user offline (a verifier or an adopted legacy hash)? */
export function hasOffline(tenant, userId) { const e = read()[slot(tenant, userId)]; return !!(e && (e.pw || e.legacy)); }

/** Verify a password offline against this device's stored verifier. On a legacy hash, upgrade it to a verifier. */
export async function verifyOffline(tenant, userId, password) {
  const e = read()[slot(tenant, userId)];
  if (!e) return false;
  if (e.pw && (await pbkdf2(password, e.pw.salt, e.pw.iter)) === e.pw.hash) return true;
  if (e.legacy) {
    const ok = e.legacy.algo === 'pbkdf2'
      ? (await pbkdf2(password, e.legacy.salt, 100000)) === e.legacy.hash
      : (await legacySha(password)) === e.legacy.hash;
    if (ok) await rememberOffline(tenant, userId, password); // replace the adopted hash with a device-salted verifier
    return ok;
  }
  return false;
}

/** Forget everything this device remembers for a user (used when a device is handed over or reset). */
export function forgetOffline(tenant, userId) { const all = read(); delete all[slot(tenant, userId)]; write(all); }

// ---------- optional quick PIN (per device, per user) ----------
// A convenience for shared counter tablets: a short PIN re-opens the app offline instead of retyping the full
// password. It is explicitly weaker than the password (few digits), so it is attempt-limited and, after too many
// wrong tries, forgotten — the full password is then required. It never replaces the password and is never synced.

export async function setPin(tenant, userId, pin) {
  if (!userId || !/^\d{4,8}$/.test(String(pin || ''))) throw new Error('A PIN is 4 to 8 digits.');
  const salt = newSalt();
  const all = read();
  const s = slot(tenant, userId);
  all[s] = { ...(all[s] || {}), pin: { salt, iter: PIN_ITER, hash: await pbkdf2(String(pin), salt, PIN_ITER), tries: 0 } };
  write(all);
}
export function hasPin(tenant, userId) { return !!read()[slot(tenant, userId)]?.pin; }
export function clearPin(tenant, userId) { const all = read(); const e = all[slot(tenant, userId)]; if (e && e.pin) { delete e.pin; write(all); } }

/** Verify a PIN offline. Returns { ok, left } where left is the number of tries remaining; the PIN is forgotten
 *  (and the password required) once the tries run out. */
export async function verifyPin(tenant, userId, pin) {
  const all = read();
  const e = all[slot(tenant, userId)];
  if (!e?.pin) return { ok: false, left: 0 };
  const ok = (await pbkdf2(String(pin), e.pin.salt, e.pin.iter)) === e.pin.hash;
  if (ok) { e.pin.tries = 0; write(all); return { ok: true, left: PIN_MAX_TRIES }; }
  e.pin.tries = (e.pin.tries || 0) + 1;
  const left = Math.max(0, PIN_MAX_TRIES - e.pin.tries);
  if (left <= 0) delete e.pin; // too many wrong tries: fall back to the full password
  write(all);
  return { ok: false, left };
}

// Password hashing for the cloud (review 1.5, workplan step 5): staff passwords and the owner's own password.
//
// PBKDF2-SHA256 with a per-password salt and round count (`iter` is stored with each hash). The round count for new
// hashes is the Worker setting PBKDF2_ITER (default and minimum 100,000). It is a setting, not a constant, because
// Cloudflare may refuse PBKDF2 above 100,000 rounds or cut off a request that hashes for too long on its free plan,
// and neither can be checked before it is live: if the target is refused, the hash is made at 100,000 instead, so a
// raised setting can never lock anyone out. A correct sign-in re-hashes a weaker password (fewer rounds, or the old
// unsalted SHA-256 from 1.0/1.1) to the target. Every check compares in constant time.
export const FLOOR = 100000;
const MAX = 2_000_000;
const te = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

/** Rounds for new hashes: PBKDF2_ITER when it is a number ≥ 100,000 (at most 2,000,000), else 100,000 */
export function targetIter(env) {
  const n = Math.floor(Number(env?.PBKDF2_ITER));
  return Number.isFinite(n) && n >= FLOOR ? Math.min(n, MAX) : FLOOR;
}

export async function pbkdf2(pw, saltB64, iter = FLOOR) {
  const key = await crypto.subtle.importKey('raw', te.encode(String(pw)), 'PBKDF2', false, ['deriveBits']);
  const salt = Uint8Array.from(atob(saltB64), (c) => c.charCodeAt(0));
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, key, 256));
}

/** Constant time for equal-length strings (hex hashes are always 64 characters) */
export function sameHex(a, b) {
  const x = te.encode(String(a ?? '')), y = te.encode(String(b ?? ''));
  if (x.length !== y.length) return false;
  let d = 0;
  for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i];
  return d === 0;
}

/** Does this password open this record? (pbkdf2 with the record's own rounds, or the legacy unsalted SHA-256) */
export async function verify(rec, pw) {
  if (!rec?.hash) return false;
  if (rec.algo === 'pbkdf2') return sameHex(await pbkdf2(pw, rec.salt, Number(rec.iter) || FLOOR), rec.hash);
  return sameHex(hex(await crypto.subtle.digest('SHA-256', te.encode('pharmapos:' + String(pw)))), rec.hash);
}

/** A fresh hash at the target rounds ({ algo, salt, iter, hash }); 100,000 if the target is refused */
export async function hashNew(env, pw) {
  const salt = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
  let iter = targetIter(env);
  let hash;
  try { hash = await pbkdf2(pw, salt, iter); } catch (e) {
    if (iter === FLOOR) throw e;
    console.warn(`PBKDF2 at ${iter} rounds was refused (${e.message}); using ${FLOOR}. Lower PBKDF2_ITER.`);
    iter = FLOOR;
    hash = await pbkdf2(pw, salt, iter);
  }
  return { algo: 'pbkdf2', salt, iter, hash };
}

/** Weaker than the target: the old unsalted hash, or fewer rounds */
export const weaker = (rec, env) => rec?.algo !== 'pbkdf2' || (Number(rec?.iter) || FLOOR) < targetIter(env);

/**
 * After a correct password: a stronger hash for this record, or null when it is already as strong as this cloud can
 * make it (so a target that falls back to 100,000 does not rewrite a 100,000 hash at every sign-in).
 */
export async function upgrade(rec, pw, env) {
  if (!weaker(rec, env)) return null;
  const next = await hashNew(env, pw);
  if (rec?.algo === 'pbkdf2' && next.iter <= (Number(rec.iter) || FLOOR)) return null;
  return next;
}

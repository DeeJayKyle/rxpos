// Renewable sign-ins (2026-11-26 sign-in audit). The cloud gives this device a short pass (15 minutes) and a renewal
// key (worker/index.js renewSignIn). Before a call, a pass about to run out is renewed: the device gets a new pass and
// the next renewal key (each key works once). A sign-out, a new password or "sign out everywhere" ends the key in the
// cloud at once, and a key unused for 14 days (or 30 days after the password) expires: the person signs in again.
// Work on the till never waits for this: offline, the device keeps selling and the renewal happens when it is back.
//
// The store registers where the device's sync settings live (`cfg`: url, key = the pass, refresh = the renewal key);
// cloud.js, sync.js and live.js ask here for a fresh pass before they call the cloud.

/** Ask the cloud for a renewable sign-in when signing in (old clouds ignore it and send a long pass) */
export const SESSION_VERSION = 2;
const EARLY_MS = 2 * 60000; // renew this long before the pass runs out

let reg = null; // { get: () => cfg, save: (cfg) => Promise }
export function registerSession(r) { reg = r; }

/** When a pass runs out (ms), read from its body; 0 when it can't be read (a pharmacy sync key never runs out) */
export function passExpiry(key) {
  const body = String(key || '').startsWith('u.') ? String(key).split('.')[1] : '';
  if (!body) return 0;
  try {
    const p = JSON.parse(atob(body.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((body.length + 3) % 4)));
    return Number(p.exp) || 0;
  } catch { return 0; }
}
/** Does this pass belong to a renewable sign-in? */
export const renewable = (cfg) => !!cfg?.refresh && String(cfg?.key || '').startsWith('u.');
/** A long pass from before renewal (the device swaps it once for a renewable sign-in) */
const legacyPass = (cfg) => !cfg?.refresh && String(cfg?.key || '').startsWith('u.') && passExpiry(cfg.key) - Date.now() > 24 * 3600e3;

let inflight = null;
/**
 * The device's settings with a pass that is good for at least two more minutes (renewed if needed). `force` renews
 * even so (the cloud refused the pass). Never throws: offline or a cloud that can't be reached returns `cfg` as it is,
 * and an ended sign-in returns it without its renewal key (the next call then says "sign in again").
 */
export async function freshCfg(cfg, { force = false } = {}) {
  const cur = reg?.get?.();
  // the store may already hold a newer pass of the same sign-in (renewed by another call a moment ago)
  if (cur?.sid && cfg?.sid === cur.sid && cur.url === cfg.url && cur.key !== cfg.key) cfg = { ...cfg, key: cur.key, refresh: cur.refresh, sid: cur.sid };
  if (!cfg?.url) return cfg;
  const due = renewable(cfg) && (force || passExpiry(cfg.key) - Date.now() < EARLY_MS);
  const swap = !due && legacyPass(cfg) && !cfg.swapTried;
  if (!due && !swap) return cfg;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return cfg;
  inflight ??= renew(cfg, swap).finally(() => { inflight = null; });
  const next = await inflight;
  return next ? { ...cfg, ...next } : cfg;
}

async function renew(cfg, swap) {
  try {
    const res = await fetch(cfg.url + '/api/token/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(swap ? { Authorization: 'Bearer ' + cfg.key } : {}) },
      body: JSON.stringify(swap ? {} : { refresh: cfg.refresh }),
      signal: AbortSignal.timeout?.(15000),
    });
    const j = await res.json().catch(() => ({}));
    if (res.ok && j.token && j.refresh) return save(cfg, { key: j.token, refresh: j.refresh, sid: j.sid || '' });
    if (res.status === 409) { // another window of this app renewed it a moment ago: use what it saved
      const cur = reg?.get?.();
      return cur?.refresh && cur.refresh !== cfg.refresh ? { key: cur.key, refresh: cur.refresh, sid: cur.sid } : null;
    }
    if (swap) return save(cfg, { swapTried: true }); // an older cloud: keep the long pass, don't ask again
    if (res.status === 401 || res.status === 403) return save(cfg, { refresh: '', sid: '' }); // ended: sign in again
    return null; // the cloud had a problem: try again on the next call
  } catch {
    return null; // offline or too slow: the pass is renewed on a later call
  }
}

async function save(cfg, patch) {
  const cur = reg?.get?.();
  // only if the device is still linked the same way (not signed out or relinked while the renewal was on its way)
  if (reg?.save && cur && cur.url === cfg.url && cur.key === cfg.key) await reg.save({ ...cur, ...patch }).catch(() => {});
  return patch;
}

/** End a renewable sign-in in the cloud (the device now holds someone else's); never fails the caller */
export function endRenewal(cfg) {
  if (!cfg?.url || !cfg?.refresh) return Promise.resolve();
  return fetch(cfg.url + '/api/token/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh: cfg.refresh, end: true }) }).then(() => {}, () => {});
}

/** Forget the store (tests) */
export const resetSessionForTests = () => { reg = null; inflight = null; };

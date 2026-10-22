// Keeps every RxPOS device on the newest build published at rxposug.com:
//   web      the service worker fetches the new files; the page reloads itself
//   Windows  the app downloads only the files that changed and swaps them in (electron/updater.cjs, with rollback)
//   Android  the Capgo updater (MPL-2.0) installs the build's archive (rolls back if the new build doesn't start)
// An update is only applied when nothing is in progress: no open sale or dialog, nobody typing, or the app is in the
// background. The open sale, Add Stock delivery and held sales are kept on the device anyway (see POS / Add Stock).
import { DEFAULT_CLOUD } from './cloud.js';
import { isElectron, isAndroid } from './platform.js';

/* global __RXPOS_BUILD__, __RXPOS_LABEL__ */
export const BUILD = typeof __RXPOS_BUILD__ !== 'undefined' ? __RXPOS_BUILD__ : 0;
export const LABEL = typeof __RXPOS_LABEL__ !== 'undefined' ? __RXPOS_LABEL__ : '1.0 (development)';
const SHELL = 1; // must match the `shell` in version.json that this installer / APK can run (scripts/release-files.mjs)
const CHECK_EVERY = 10 * 60e3;

let state = { status: 'current', latest: null, error: '' }; // status: current | checking | downloading | ready | shell | error
const listeners = new Set();
const set = (patch) => { state = { ...state, ...patch }; listeners.forEach((f) => f(state)); };
export const updateState = () => state;
export function onUpdate(fn) { listeners.add(fn); fn(state); return () => listeners.delete(fn); }

let capgo = null, bundleId = null;
const plugin = async () => (capgo ??= (await import('@capgo/capacitor-updater')).CapacitorUpdater);
const versionUrl = () => (isAndroid ? DEFAULT_CLOUD + '/api/version' : './version.json');

/** Ask for the newest build; download it when it is newer than this one */
export async function checkForUpdate() {
  if (!BUILD || state.status === 'downloading' || state.status === 'ready') return state;
  if (isElectron) {
    if (!window.rxposShell) return state;
    set({ status: 'checking' });
    const r = await window.rxposShell.check().catch((e) => ({ status: 'error', error: e.message }));
    set(r.status === 'ready' ? { status: 'ready', latest: r } : { status: r.status === 'shell' ? 'shell' : r.status === 'error' ? 'error' : 'current', latest: r, error: r.error || '' });
    return state;
  }
  if (!navigator.onLine) return state;
  set({ status: 'checking' });
  try {
    const res = await fetch(versionUrl() + '?t=' + Date.now(), { cache: 'no-store' });
    const latest = res.ok ? await res.json() : null;
    if (!latest?.build || latest.build <= BUILD) return set({ status: 'current', latest }), state;
    if ((latest.shell || 1) > SHELL) return set({ status: 'shell', latest }), state;
    if (isAndroid) {
      set({ status: 'downloading', latest });
      const u = await plugin();
      const b = await u.download({ url: `${DEFAULT_CLOUD}/${latest.zip}`, version: String(latest.build), checksum: latest.zipSha256 });
      bundleId = b.id;
      await u.next({ id: b.id }); // used at the next start even if it is never idle before then
    } else {
      // the service worker picks up the new files on the reload; nudge it to check its own script too
      navigator.serviceWorker?.getRegistration().then((r) => r?.update()).catch(() => {});
    }
    set({ status: 'ready', latest });
  } catch (e) {
    set({ status: 'error', error: e.message || 'Update check failed' });
  }
  return state;
}

/** Switch to the downloaded build now */
export async function applyUpdate() {
  if (state.status !== 'ready') return;
  try { localStorage.setItem('rxpos-updated-from', String(BUILD)); } catch { /* ignore */ }
  if (isElectron) window.rxposShell?.apply();
  else if (isAndroid && bundleId) await (await plugin()).set({ id: bundleId });
  else location.reload();
}

/** The "Update now" button: get the newest build and switch to it straight away (the open sale and drafts are kept) */
export async function updateNow() {
  if (!BUILD) return { status: 'error', error: 'This is a development copy: updates come from the build instead' };
  if (state.status !== 'ready') await checkForUpdate();
  if (state.status === 'ready') { await applyUpdate(); return state; }
  return state;
}

// ---- when is it safe to switch? ----
let lastInput = Date.now();
const busy = () => {
  if (document.querySelector('.modal, .cart-line, tr.new-line')) return true;
  const a = document.activeElement;
  return !!(a && /INPUT|TEXTAREA|SELECT/.test(a.tagName) && a.value);
};
const idle = () => document.visibilityState === 'hidden' || (Date.now() - lastInput > 90e3 && !busy());

let started = false;
/** Start checking (once, at app start). Tells the Android updater the build started fine, so it won't roll back. */
export function startUpdates() {
  if (started || !BUILD) return;
  started = true;
  if (isAndroid) plugin().then((u) => u.notifyAppReady()).catch(() => {});
  if (isElectron) {
    window.rxposShell?.ready();
    window.rxposShell?.onUpdateReady((info) => set({ status: 'ready', latest: info }));
  }
  ['pointerdown', 'keydown'].forEach((e) => window.addEventListener(e, () => { lastInput = Date.now(); }, { passive: true, capture: true }));
  setTimeout(checkForUpdate, 20e3);
  setInterval(checkForUpdate, CHECK_EVERY);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkForUpdate(); else if (state.status === 'ready') applyUpdate(); });
  window.addEventListener('online', () => checkForUpdate());
  setInterval(() => { if (state.status === 'ready' && idle()) applyUpdate(); }, 15e3);
}

/** The build this device came from before its last update (shown once as "Updated"), then forgotten */
export function justUpdated() {
  try {
    const from = Number(localStorage.getItem('rxpos-updated-from'));
    if (from && from !== BUILD) { localStorage.removeItem('rxpos-updated-from'); return true; }
  } catch { /* ignore */ }
  return false;
}

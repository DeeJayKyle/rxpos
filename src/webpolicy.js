// What the browser version of RxPOS keeps on the computer. (The Windows and Android apps always keep the pharmacy on
// the device for offline work; none of this applies to them.)
//
// Session-only browser (the default, and what every existing browser user keeps):
//   • nothing is kept: at start-up RxPOS's own leftovers are cleared (its offline service worker and caches, its
//     on-device database, and every saved item except appearance preferences); pharmacy data lives in memory and comes
//     fresh from the cloud; anything the app saves in localStorage lives in this tab only (sessionStorage), so a reload
//     stays signed in while closing the tab forgets it all; signing out clears this tab too.
// Trusted device (opt-in, 1.6; Device page or the sign-in screen):
//   • for a pharmacy's own computer: RxPOS keeps the pharmacy in this browser (IndexedDB) and caches the app
//     (public/sw.js), so it opens and sells without internet, like the apps. It must be switched on while online (the
//     first download needs the internet) and can be switched off only when nothing is waiting to be sent. Browser
//     storage is not operating-system protected: use it only on a computer the pharmacy controls.
// Only RxPOS's own resources are ever cleared: its IndexedDB database ("pharmapos"), caches whose names start with
// "rxpos", its service worker, and its own keys. Other data on the same address is left alone.
// Appearance preferences are kept in both modes because they hold no pharmacy or personal data.
import { isWeb } from './platform.js';

export const TRUSTED_KEY = 'rxpos-trusted-device';
const PREFS = [/^pharmapos-theme$/, /^rxpos-theme-mode$/, /^rxpos-accent$/, /^rxpos-surface-style$/, /^rxpos-rail$/, /^pharmapos-nav$/,
  /^rxpos-tip:/, /^rxpos-device$/, /^rxpos-sound/, /^rxpos-pos-favs:/, /^rxpos-weekly-/, /^rxpos-announced$/, /^rxpos-trusted-device$/];
export const isPref = (k) => PREFS.some((r) => r.test(String(k)));
// the browser's own functions, kept before storage is routed below, so these always reach the real localStorage
const proto = typeof Storage !== 'undefined' ? Storage.prototype : null;
const realGet = proto?.getItem, realSet = proto?.setItem, realRemove = proto?.removeItem;
const clearLocal = () => { for (const k of Object.keys(window.localStorage)) if (!isPref(k)) realRemove.call(window.localStorage, k); };

/** This browser was made a trusted device (keeps the pharmacy for offline work) */
export const trustedDevice = () => { if (!isWeb) return false; try { return realGet.call(window.localStorage, TRUSTED_KEY) === '1'; } catch { return false; } };
/** Whether this RxPOS keeps the pharmacy on the device: the apps always, a browser only as a trusted device */
export const keepsData = () => !isWeb || trustedDevice();

/** RxPOS's own caches only (never another app's on the same address) */
const ownCaches = async () => (typeof caches === 'undefined' ? [] : (await caches.keys()).filter((k) => k.startsWith('rxpos')));

/** Clear what RxPOS (an older version or an earlier session) left in this browser. Never throws. */
export async function purgeWebData() {
  try { for (const r of (await navigator.serviceWorker?.getRegistrations?.()) || []) if (/\/sw\.js/.test(r.active?.scriptURL || r.installing?.scriptURL || r.waiting?.scriptURL || '/sw.js')) await r.unregister(); } catch { /* not supported */ }
  try { for (const k of await ownCaches()) await caches.delete(k); } catch { /* not supported */ }
  try { indexedDB.deleteDatabase('pharmapos'); } catch { /* not supported */ }
  try { clearLocal(); } catch { /* storage blocked */ }
  try {
    for (const c of document.cookie.split(';')) {
      const n = c.split('=')[0].trim();
      if (n) for (const path of ['/', location.pathname]) document.cookie = `${n}=; Max-Age=0; path=${path}`;
    }
  } catch { /* no cookies */ }
}

/** From now on, localStorage keeps only appearance preferences; anything else written there goes to this tab only. */
function routeStorage() {
  const S = Storage.prototype;
  const ls = window.localStorage, ss = window.sessionStorage;
  const { setItem, getItem, removeItem } = S;
  const pick = (store, k) => (store === ls && !isPref(k) ? ss : store);
  S.setItem = function (k, v) { return setItem.call(pick(this, k), k, v); };
  S.getItem = function (k) { return getItem.call(pick(this, k), k); };
  S.removeItem = function (k) { return removeItem.call(pick(this, k), k); };
}

let started = false;
/** Called first thing in main.jsx; does nothing in the Windows and Android apps or on a trusted device. */
export function startWebPolicy() {
  if (!isWeb || started || trustedDevice()) return;
  started = true;
  // clear first (it reads the real localStorage keys), then route every later write
  try { clearLocal(); } catch { /* storage blocked */ }
  try { routeStorage(); } catch { /* storage blocked */ }
  purgeWebData();
}

let leaving = false;
/** True while RxPOS itself is reloading the page (sign-out, switching mode), so the "unsent changes" warning stays quiet */
export const isLeaving = () => leaving;
/** Sign-out in a session-only browser: forget this tab's session too and start clean. */
export async function endWebSession() {
  leaving = true;
  await purgeWebData();
  try { window.sessionStorage.clear(); } catch { /* storage blocked */ }
  location.reload();
}

/** Make this browser a trusted device (the store copies what it holds onto the device first; see store.jsx) */
export function setTrusted(on) {
  try { on ? realSet.call(window.localStorage, TRUSTED_KEY, '1') : realRemove.call(window.localStorage, TRUSTED_KEY); } catch { /* storage blocked */ }
}
export const reloadForMode = () => { leaving = true; location.reload(); };

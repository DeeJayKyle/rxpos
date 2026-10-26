// The web version of RxPOS is online only and keeps nothing on the computer. Only the Windows and Android apps
// store the pharmacy for offline work.
//   • At start-up the browser's leftovers are cleared: the old offline service worker and its caches, the old on-device
//     database (IndexedDB), cookies, and every saved item except appearance preferences.
//   • While the app runs, pharmacy data lives in memory only (idb.js) and comes fresh from the cloud. Anything the app
//     would have saved in localStorage (held sales, drafts, sign-in) lives in this tab only (sessionStorage), so a
//     reload keeps you signed in while closing the tab forgets it all.
//   • Signing out clears this tab's storage too, then reloads.
// Appearance preferences are kept because they hold no pharmacy or personal data (theme, accent, menu layout, text
// size, sound choice, dismissed tips, favourite medicines as product ids, which notices were already shown).
import { isWeb } from './platform.js';

const PREFS = [/^pharmapos-theme$/, /^rxpos-theme-mode$/, /^rxpos-accent$/, /^rxpos-surface-style$/, /^rxpos-rail$/, /^pharmapos-nav$/,
  /^rxpos-tip:/, /^rxpos-device$/, /^rxpos-sound/, /^rxpos-pos-favs:/, /^rxpos-weekly-/, /^rxpos-announced$/];
export const isPref = (k) => PREFS.some((r) => r.test(String(k)));
// the browser's own removeItem, kept before storage is routed below, so clearing always reaches the real localStorage
const realRemove = typeof Storage !== 'undefined' ? Storage.prototype.removeItem : null;
const clearLocal = () => { for (const k of Object.keys(window.localStorage)) if (!isPref(k)) realRemove.call(window.localStorage, k); };

/** Clear what an older RxPOS (or an earlier session) left in this browser. Safe to call any time; never throws. */
export async function purgeWebData() {
  try { for (const r of (await navigator.serviceWorker?.getRegistrations?.()) || []) await r.unregister(); } catch { /* not supported */ }
  try { if (typeof caches !== 'undefined') for (const k of await caches.keys()) await caches.delete(k); } catch { /* not supported */ }
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
/** Called first thing in main.jsx; does nothing in the Windows and Android apps. */
export function startWebPolicy() {
  if (!isWeb || started) return;
  started = true;
  // clear first (it reads the real localStorage keys), then route every later write
  try { clearLocal(); } catch { /* storage blocked */ }
  try { routeStorage(); } catch { /* storage blocked */ }
  purgeWebData();
}

/** Sign-out on the web: forget this tab's session too and start clean. */
let leaving = false;
/** True while RxPOS itself is reloading the page (sign-out), so the "unsent changes" warning stays quiet */
export const isLeaving = () => leaving;
export async function endWebSession() {
  leaving = true;
  await purgeWebData();
  try { window.sessionStorage.clear(); } catch { /* storage blocked */ }
  location.reload();
}

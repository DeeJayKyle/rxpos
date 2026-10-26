// Minimal IndexedDB key/value store (localStorage is too small for a year of pharmacy sales).
// The Windows and Android apps keep the pharmacy here for offline work. The web version is online only and keeps
// nothing on the computer (src/webpolicy.js): there, everything lives in memory for this visit, except the cloud
// sign-in ("sync"), which lives in this tab only so a reload stays signed in and downloads the pharmacy afresh.
import { isWeb } from './platform.js';
const mem = new Map();
const TAB_KEY = 'rxpos-tab-sync';
const tab = {
  get: (key) => { if (key !== 'sync') return mem.get(key); try { return JSON.parse(sessionStorage.getItem(TAB_KEY)) ?? undefined; } catch { return undefined; } },
  set: (key, value) => { if (key !== 'sync') return void mem.set(key, value); try { sessionStorage.setItem(TAB_KEY, JSON.stringify(value)); } catch { /* storage blocked */ } },
  del: (key) => { mem.delete(key); if (key === 'sync') try { sessionStorage.removeItem(TAB_KEY); } catch { /* storage blocked */ } },
  keys: () => [...mem.keys()],
};
const DB_NAME = 'pharmapos';
const STORE = 'kv';

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

let dbp;
const conn = () => (dbp ??= open());

export async function idbGet(key) {
  if (isWeb) return tab.get(key);
  const db = await conn();
  return new Promise((resolve, reject) => {
    const r = db.transaction(STORE).objectStore(STORE).get(key);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export async function idbSet(key, value) {
  if (isWeb) return tab.set(key, value);
  const db = await conn();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function idbDel(key) {
  if (isWeb) return tab.del(key);
  const db = await conn();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function idbKeys() {
  if (isWeb) return tab.keys();
  const db = await conn();
  return new Promise((resolve, reject) => {
    const r = db.transaction(STORE).objectStore(STORE).getAllKeys();
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

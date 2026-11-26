// IndexedDB on this device: the Windows and Android apps keep the pharmacy here for offline work (the web version
// keeps nothing: it uses the memory back end in storage.js). Version 2 (RxPOS 1.6) adds two stores next to the original key/value one:
//   kv       – settings and small values (sync sign-in, snapshots, drug labels; the 1.5 table copies stay here until
//              the move to `records` has been verified, see storage.js)
//   records  – one entry per record, key "<table>|<id>", value { t, r }
//   outbox   – changes waiting for the cloud, in the order they were made (auto-increment key)
// In the web version nothing is stored: everything lives in memory for this visit, except
// the cloud sign-in ("sync"), which lives in this tab only so a reload stays signed in (src/webpolicy.js).
import { keepsData } from './webpolicy.js';
import { seal, unseal, isSealed } from './vault.js';

export const DB_NAME = 'pharmapos';
const VERSION = 2;
export const memoryOnly = () => !keepsData();

const mem = new Map();
const TAB_KEY = 'rxpos-tab-sync';
const tab = {
  get: (key) => { if (key !== 'sync') return mem.get(key); try { return JSON.parse(sessionStorage.getItem(TAB_KEY)) ?? undefined; } catch { return undefined; } },
  set: (key, value) => { if (key !== 'sync') return void mem.set(key, value); try { sessionStorage.setItem(TAB_KEY, JSON.stringify(value)); } catch { /* storage blocked */ } },
  del: (key) => { mem.delete(key); if (key === 'sync') try { sessionStorage.removeItem(TAB_KEY); } catch { /* storage blocked */ } },
  keys: () => [...mem.keys()],
};

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
      if (!db.objectStoreNames.contains('records')) db.createObjectStore('records');
      if (!db.objectStoreNames.contains('outbox')) db.createObjectStore('outbox', { autoIncrement: true });
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => db.close(); // another tab upgrading: step aside instead of blocking it
      resolve(db);
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('RxPOS is updating its storage in another window. Close the other RxPOS windows and try again.'));
  });
}

let dbp;
/** The shared connection (opened once) */
export const conn = () => (dbp ??= open().catch((e) => { dbp = null; throw e; }));

// 2026-11-26 (on-device data security, src/vault.js): kv values that hold patients' data or the sign-in are sealed:
// the sync link (its pass and renewal key), the daily copies, backups kept when switching pharmacy, and the tables
// of 1.0–1.5. Everything else (sounds, drug labels, small flags) is stored as before.
export const SEALED = (key) => { const k = String(key); return k === 'sync' || k === 'db' || k.startsWith('t:') || k.startsWith('snap:') || k.startsWith('backup:'); };

function rawGet(db, key) {
  return new Promise((resolve, reject) => {
    const r = db.transaction('kv').objectStore('kv').get(key);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export async function idbGet(key) {
  if (memoryOnly()) return tab.get(key);
  const db = await conn();
  return unseal(db, await rawGet(db, key));
}

export async function idbSet(key, value) {
  if (memoryOnly()) return tab.set(key, value);
  const db = await conn();
  if (SEALED(key) && value != null) value = await seal(db, value);
  return new Promise((resolve, reject) => {
    const tx = db.transaction('kv', 'readwrite');
    tx.objectStore('kv').put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Not saved'));
  });
}

export async function idbDel(key) {
  if (memoryOnly()) return tab.del(key);
  const db = await conn();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('kv', 'readwrite');
    tx.objectStore('kv').delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function idbKeys() {
  if (memoryOnly()) return tab.keys();
  const db = await conn();
  return new Promise((resolve, reject) => {
    const r = db.transaction('kv').objectStore('kv').getAllKeys();
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

/** A daily copy made by snapshot.worker.js: its record buckets are sealed one by one (storage.js), the rest is not
 *  patients' data */
const sealedCopy = (v) => v?.v === 2 && Array.isArray(v.rows) && v.rows.every((b) => isSealed(b));

/**
 * The one-time move to sealed kv values (2026-11-26): every value under a SEALED key that is still plain text is
 * sealed in place. A value changed by the app in the meantime is left for the next start (compared inside the write),
 * so nothing newer is ever overwritten. Done once per device (kv 'sealed-kv-v1'); never fails the caller.
 */
/** @param {{ only?: string }} [o] one key only (the sign-in, sealed before it is read at start) */
export async function sealKvAtRest({ only } = {}) {
  if (memoryOnly()) return { sealed: 0 };
  const db = await conn();
  if (!only && (await rawGet(db, 'sealed-kv-v1'))) return { sealed: 0 };
  let sealed = 0, left = 0;
  for (const k of only ? [only] : await idbKeys()) {
    if (!SEALED(k)) continue;
    const v = await rawGet(db, k);
    if (v == null || isSealed(v) || sealedCopy(v)) continue;
    const before = JSON.stringify(v);
    const s = await seal(db, v);
    const ok = await new Promise((resolve) => {
      const tx = db.transaction('kv', 'readwrite');
      const st = tx.objectStore('kv');
      const g = st.get(k);
      let wrote = false;
      g.onsuccess = () => { if (g.result != null && !isSealed(g.result) && JSON.stringify(g.result) === before) { st.put(s, k); wrote = true; } };
      tx.oncomplete = () => resolve(wrote);
      tx.onabort = () => resolve(false);
    });
    if (ok) sealed++; else left++;
  }
  if (!only && !left) await idbSet('sealed-kv-v1', new Date().toISOString()).catch(() => {});
  return { sealed, left };
}

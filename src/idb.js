// IndexedDB on this device: the Windows and Android apps, and a browser the pharmacy has made a trusted device,
// keep the pharmacy here for offline work. Version 2 (RxPOS 1.6) adds two stores next to the original key/value one:
//   kv       – settings and small values (sync sign-in, snapshots, drug labels; the 1.5 table copies stay here until
//              the move to `records` has been verified, see storage.js)
//   records  – one entry per record, key "<table>|<id>", value { t, r }
//   outbox   – changes waiting for the cloud, in the order they were made (auto-increment key)
// In a session-only browser (the web default) nothing is stored: everything lives in memory for this visit, except
// the cloud sign-in ("sync"), which lives in this tab only so a reload stays signed in (src/webpolicy.js).
import { keepsData } from './webpolicy.js';

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

export async function idbGet(key) {
  if (memoryOnly()) return tab.get(key);
  const db = await conn();
  return new Promise((resolve, reject) => {
    const r = db.transaction('kv').objectStore('kv').get(key);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export async function idbSet(key, value) {
  if (memoryOnly()) return tab.set(key, value);
  const db = await conn();
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

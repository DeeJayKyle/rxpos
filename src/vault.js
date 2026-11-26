// @ts-check
// The pharmacy encrypted on this device (2026-11-26, on-device data security). Patients' names, phone numbers,
// prescriptions and sales used to sit in IndexedDB as plain text: anyone with a copy of the app's data folder could
// read them. Now every stored record bucket (storage.js) and every whole-pharmacy copy and the sync link in the kv
// store (idb.js SEALED: daily copies, backups, the 1.5 tables, the sign-in) is sealed with AES-GCM-256.
//
// The key: one random key per device, made on first use and kept in the kv store under KEY_ID.
//   Windows app  the key's bytes are kept protected by Windows (DPAPI through Electron's safeStorage, electron/main.cjs):
//                only this Windows account on this PC can unwrap them, so a copied data folder stays unreadable.
//   elsewhere    a non-extractable WebCrypto key: the page can use it but never read it out. On Android the app's
//                data is private to the app and is no longer included in phone backups (build.yml allowBackup).
// A key is never replaced while data sealed with it may exist: a missing or unusable key makes reading fail (the app
// says so and changes nothing), it never starts over with an empty pharmacy.
//
// Sealed values look like { __enc: 1, iv, ct }; anything else is read as it is, so data stored before this (or by an
// older version) keeps working until it is sealed (storage.js migrates the records, idb.js the kv values).

const KEY_ID = 'device-key';
const te = new TextEncoder();
const td = new TextDecoder();

/** @param {Uint8Array} bytes */
const b64 = (bytes) => btoa(String.fromCharCode(...bytes));
/** @param {string} s */
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
/** @param {Uint8Array} raw */
const importRaw = (raw) => crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);

/** The Windows app's protection (null elsewhere) */
function shell() {
  const s = /** @type {any} */ (globalThis).window?.rxposShell;
  return s?.protect && s?.unprotect ? s : null;
}

/** @param {IDBRequest} r */
const req = (r) => new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });

/** @type {Map<IDBDatabase, Promise<CryptoKey>>} */
const keys = new Map();

/** This device's key (made once, the first time anything is sealed). @param {IDBDatabase} db @returns {Promise<CryptoKey>} */
export function deviceKey(db) {
  let p = keys.get(db);
  if (!p) { p = loadOrMake(db); keys.set(db, p); p.catch(() => keys.delete(db)); }
  return p;
}

/** @param {IDBDatabase} db */
async function loadOrMake(db) {
  const got = await req(db.transaction('kv').objectStore('kv').get(KEY_ID));
  if (got) return unwrap(got);
  let entry = null, key = null;
  const sh = shell();
  if (sh) {
    const raw = crypto.getRandomValues(new Uint8Array(32));
    const wrapped = await sh.protect(b64(raw)).catch(() => null);
    if (wrapped) { entry = { v: 1, wrapped }; key = await importRaw(raw); }
    raw.fill(0);
  }
  if (!entry) {
    key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    entry = { v: 1, key };
  }
  // add, never put: if another window made a key a moment ago, that one is kept and used
  const tx = db.transaction('kv', 'readwrite');
  tx.objectStore('kv').add(entry, KEY_ID);
  const saved = await new Promise((resolve) => { tx.oncomplete = () => resolve(true); tx.onabort = () => resolve(false); });
  if (saved) return /** @type {CryptoKey} */ (key);
  const other = await req(db.transaction('kv').objectStore('kv').get(KEY_ID));
  if (!other) throw new Error('The key for this device\'s data could not be saved.');
  return unwrap(other);
}

/** @param {any} e */
async function unwrap(e) {
  if (e?.key) return /** @type {CryptoKey} */ (e.key);
  if (e?.wrapped) {
    const sh = shell();
    if (!sh) throw new Error('This device\'s data is protected by the Windows app: open it in the RxPOS app on this PC.');
    const raw = unb64(await sh.unprotect(e.wrapped));
    try { return await importRaw(raw); } finally { raw.fill(0); }
  }
  throw new Error('The key for this device\'s data is damaged.');
}

/** Is this a sealed value? @param {any} v */
export const isSealed = (v) => !!v && typeof v === 'object' && v.__enc === 1 && !!v.ct;

/** Seal any JSON value. @param {IDBDatabase} db @param {any} value */
export async function seal(db, value) {
  const key = await deviceKey(db);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, te.encode(JSON.stringify(value === undefined ? null : value)));
  return { __enc: 1, iv, ct };
}

/** Open a sealed value (anything else is returned as it is). @param {IDBDatabase} db @param {any} v */
export async function unseal(db, v) {
  if (!isSealed(v)) return v;
  const key = await deviceKey(db);
  let pt;
  try { pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: v.iv }, key, v.ct); }
  catch (e) { throw Object.assign(new Error('Data on this device could not be decrypted with this device\'s key. Nothing was deleted.'), { cause: e }); }
  return JSON.parse(td.decode(pt));
}

/** Forget the cached keys (tests) */
export const resetVaultForTests = () => keys.clear();

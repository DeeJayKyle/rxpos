// @ts-check
// RxPOS storage (1.6): the one place the app reads and writes the pharmacy on this device. Screens never touch
// IndexedDB; they change the store (store.jsx), and the store hands each change to commit().
//
//   load()      the whole pharmacy, rebuilt from one entry per record
//   commit(c)   one atomic write: changed records, deleted records, settings, tombstones AND the outbox entries that
//               send the change to the cloud. Either all of it is on the device or none of it is, so a sale can never
//               be saved without its stock movements, or without the note that it still has to be sent.
//   outbox      changes waiting for the cloud (see sync.js): list, count, ack (remove after the cloud accepted them),
//               reject (keep refused ones aside for review: never silently dropped)
//
// Two back ends with the same contract: IndexedDB (apps, trusted browser) and memory (session-only browser).
// Types: src/contracts.d.ts.
import { conn, memoryOnly } from './idb.js';

/** @typedef {import('./contracts').Change} Change */
/** @typedef {import('./contracts').OutboxEntry} OutboxEntry */
/** @typedef {import('./contracts').Commit} Commit */
/** @typedef {import('./contracts').Loaded} Loaded */

export const STORAGE_VERSION = 2;
const KV_SETTINGS = 's2:settings';
const KV_TOMB = 's2:_tomb';
const KV_REJECTED = 'sync-rejected';
const key = (/** @type {string} */ t, /** @type {string} */ id) => t + '|' + id;

/** Promise for an IndexedDB transaction that settles when it is committed (or rejects when it fails / aborts) */
const done = (/** @type {IDBTransaction} */ tx) => new Promise((resolve, reject) => {
  tx.oncomplete = () => resolve(undefined);
  tx.onerror = () => reject(tx.error || new Error('Not saved on this device'));
  tx.onabort = () => reject(tx.error || new Error('Not saved on this device'));
});
const req = (/** @type {IDBRequest} */ r) => new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });

/** A plain, friendly reason for a failed write (full disk, private window, …) */
export function storageError(/** @type {any} */ e) {
  const name = e?.name || '';
  if (name === 'QuotaExceededError' || /quota/i.test(e?.message || '')) return Object.assign(new Error('This device is out of storage space, so the change was not saved. Free some space (or delete old backups on This device) and try again.'), { cause: e, quota: true });
  return Object.assign(new Error('Not saved on this device: ' + (e?.message || name || 'storage error')), { cause: e });
}

// ---------------------------------------------------------------------------------------------------------------
function idbStorage() {
  return {
    kind: 'indexeddb',
    /** @returns {Promise<Loaded|null>} */
    async load() {
      const db = await conn();
      const tx = db.transaction(['records', 'kv'], 'readonly');
      const [rows, settings, tomb, version] = await Promise.all([
        req(tx.objectStore('records').getAll()), req(tx.objectStore('kv').get(KV_SETTINGS)), req(tx.objectStore('kv').get(KV_TOMB)), req(tx.objectStore('kv').get('storage-version')),
      ]);
      if (version !== STORAGE_VERSION) return null;
      /** @type {Record<string, any[]>} */
      const tables = {};
      for (const { t, r } of rows) (tables[t] ??= []).push(r);
      return { tables, settings, tomb: tomb || [] };
    },
    /** @param {Commit} c */
    async commit(c) {
      const db = await conn();
      const tx = db.transaction(['records', 'kv', 'outbox'], 'readwrite');
      const finished = done(tx);
      try {
        const rs = tx.objectStore('records'), kv = tx.objectStore('kv'), ob = tx.objectStore('outbox');
        if (c.reset) rs.clear();
        for (const { t, rec } of c.puts || []) rs.put({ t, r: rec }, key(t, rec.id));
        for (const { t, id } of c.dels || []) rs.delete(key(t, id));
        if (c.settings) kv.put(c.settings, KV_SETTINGS);
        if (c.tomb) kv.put(c.tomb, KV_TOMB);
        if (c.version) kv.put(c.version, 'storage-version');
        for (const [k, v] of Object.entries(c.kv || {})) v === undefined ? kv.delete(k) : kv.put(v, k);
        if (c.clearOutbox) ob.clear();
        for (const op of c.ops || []) ob.add(op);
      } catch (e) { try { tx.abort(); } catch { /* already finished */ } await finished.catch(() => {}); throw storageError(e); }
      await finished.catch((e) => { throw storageError(e); });
    },
    /** @returns {Promise<OutboxEntry[]>} */
    async outbox() {
      const db = await conn();
      const tx = db.transaction('outbox', 'readonly');
      const s = tx.objectStore('outbox');
      const [keys, vals] = await Promise.all([req(s.getAllKeys()), req(s.getAll())]);
      return vals.map((v, i) => ({ ...v, key: keys[i] }));
    },
    async count() {
      const db = await conn();
      return /** @type {number} */ (await req(db.transaction('outbox').objectStore('outbox').count()));
    },
    /** Remove entries the cloud has accepted. @param {number[]} keys */
    async ack(keys) {
      if (!keys.length) return;
      const db = await conn();
      const tx = db.transaction('outbox', 'readwrite');
      const s = tx.objectStore('outbox');
      for (const k of keys) s.delete(k);
      await done(tx);
    },
    /** Keep refused entries for review (Needs attention) and take them out of the queue. @param {OutboxEntry[]} entries */
    async reject(entries, reason = '') {
      if (!entries.length) return;
      const db = await conn();
      const tx = db.transaction(['outbox', 'kv'], 'readwrite');
      const kv = tx.objectStore('kv');
      const list = (await req(kv.get(KV_REJECTED))) || [];
      kv.put([...list, ...entries.map((e) => ({ ...e, reason, at: new Date().toISOString() }))].slice(-500), KV_REJECTED);
      for (const e of entries) if (e.key != null) tx.objectStore('outbox').delete(e.key);
      await done(tx);
    },
    async rejected() { const db = await conn(); return (await req(db.transaction('kv').objectStore('kv').get(KV_REJECTED))) || []; },
    async clearRejected() { const db = await conn(); const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').delete(KV_REJECTED); await done(tx); },
  };
}

// ---------------------------------------------------------------------------------------------------------------
function memoryStorage() {
  /** @type {Map<string, {t:string, r:any}>} */ const records = new Map();
  /** @type {Map<number, any>} */ const ob = new Map();
  /** @type {Record<string, any>} */ const kv = {};
  let next = 1;
  /** @type {any[]} */ let rejected = [];
  return {
    kind: 'memory',
    async load() {
      if (kv['storage-version'] !== STORAGE_VERSION) return null;
      /** @type {Record<string, any[]>} */ const tables = {};
      for (const { t, r } of records.values()) (tables[t] ??= []).push(r);
      return { tables, settings: kv[KV_SETTINGS], tomb: kv[KV_TOMB] || [] };
    },
    /** @param {Commit} c */
    async commit(c) {
      if (c.reset) records.clear();
      for (const { t, rec } of c.puts || []) records.set(key(t, rec.id), { t, r: rec });
      for (const { t, id } of c.dels || []) records.delete(key(t, id));
      if (c.settings) kv[KV_SETTINGS] = c.settings;
      if (c.tomb) kv[KV_TOMB] = c.tomb;
      if (c.version) kv['storage-version'] = c.version;
      for (const [k, v] of Object.entries(c.kv || {})) if (v === undefined) delete kv[k]; else kv[k] = v;
      if (c.clearOutbox) ob.clear();
      for (const op of c.ops || []) ob.set(next++, op);
    },
    async outbox() { return [...ob.entries()].map(([k, v]) => ({ ...v, key: k })); },
    async count() { return ob.size; },
    /** @param {number[]} keys */ async ack(keys) { for (const k of keys) ob.delete(k); },
    /** @param {OutboxEntry[]} entries */ async reject(entries, reason = '') { rejected = [...rejected, ...entries.map((e) => ({ ...e, reason }))]; for (const e of entries) if (e.key != null) ob.delete(e.key); },
    async rejected() { return rejected; },
    async clearRejected() { rejected = []; },
  };
}

/** @typedef {ReturnType<typeof idbStorage>} Storage */
/** The storage for this device (decided once: apps and trusted browsers keep data; session-only browsers don't) */
let current;
/** @returns {Storage} */
export const storage = () => (current ??= memoryOnly() ? memoryStorage() : idbStorage());
/** Decide again (a browser switching to or from trusted-device mode) */
export const resetStorage = () => { current = undefined; };

// ---------------------------------------------------------------------------------------------------------------
// What changed between two states of the pharmacy. The store never mutates records in place (every edit makes a new
// object), so a record that is not the very same object as before has changed.

/**
 * @param {Record<string, any>} prev
 * @param {Record<string, any>} next
 * @param {{ tables: string[], local: boolean, skip?: (r:any) => boolean, noOp?: (r:any) => boolean, txn?: string, now?: () => string }} o
 * @returns {Commit}
 */
export function diff(prev, next, { tables, local, skip = () => false, noOp = () => false, txn = '', now = () => new Date().toISOString() }) {
  /** @type {Commit} */
  const c = { puts: [], dels: [], ops: [] };
  const tombAt = new Map((next._tomb || []).slice(-2000).map((/** @type {any} */ x) => [x.t + '|' + x.id, x.at]));
  for (const t of tables) {
    const a = prev?.[t] || [], b = next[t] || [];
    if (a === b) continue;
    const before = new Set(a);
    let kept = 0;
    for (const r of b) {
      if (before.has(r)) { kept++; continue; }
      if (skip(r)) continue;
      c.puts.push({ t, rec: r });
      if (local && !noOp(r)) c.ops.push({ op: uuid(), txn, t, id: String(r.id), at: r.updatedAt || now() });
    }
    // fewer of the old objects remain than there were: something was removed or replaced
    if (kept + c.puts.filter((p) => p.t === t).length < a.length || b.length < a.length) {
      const ids = new Set(b.map((/** @type {any} */ r) => r.id));
      for (const r of a) if (!ids.has(r.id)) {
        c.dels.push({ t, id: String(r.id) });
        if (local && !skip(r) && !noOp(r)) c.ops.push({ op: uuid(), txn, t, id: String(r.id), deleted: true, at: tombAt.get(t + '|' + r.id) || now() });
      }
    }
  }
  if (prev?.settings !== next.settings) {
    c.settings = next.settings;
    if (local && next.settings?.updatedAt !== prev?.settings?.updatedAt) c.ops.push({ op: uuid(), txn, t: 'settings', id: 'settings', at: next.settings.updatedAt || now() });
  }
  if (prev?._tomb !== next._tomb) c.tomb = next._tomb;
  return c;
}

export const uuid = () => (globalThis.crypto?.randomUUID ? crypto.randomUUID() : 'op-' + Date.now().toString(36) + Math.random().toString(36).slice(2));

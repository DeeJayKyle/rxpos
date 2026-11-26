// @ts-check
// RxPOS storage (1.6): the one place the app reads and writes the pharmacy on this device. Screens never touch
// IndexedDB; they change the store (store.jsx), and the store hands each change to commit().
//
//   load()      the whole pharmacy, rebuilt from its records (kept in small buckets on IndexedDB, see BUCKETS)
//   commit(c)   one atomic write: changed records, deleted records, settings, tombstones AND the outbox entries that
//               send the change to the cloud. Either all of it is on the device or none of it is, so a sale can never
//               be saved without its stock movements, or without the note that it still has to be sent.
//   outbox      changes waiting for the cloud (see sync.js): list, count, ack (remove after the cloud accepted them),
//               reject (keep refused ones aside for review: never silently dropped)
//
// Two back ends with the same contract: IndexedDB (Windows and Android apps) and memory (the web version, which keeps nothing).
// Types: src/contracts.d.ts.
import { conn, memoryOnly } from './idb.js';
import { seal, unseal, isSealed } from './vault.js';

/** @typedef {import('./contracts').Change} Change */
/** @typedef {import('./contracts').OutboxEntry} OutboxEntry */
/** @typedef {import('./contracts').Commit} Commit */
/** @typedef {import('./contracts').Loaded} Loaded */

export const STORAGE_VERSION = 2;
const KV_SETTINGS = 's2:settings';
const KV_TOMB = 's2:_tomb';
const KV_REJECTED = 'sync-rejected';
const key = (/** @type {string} */ t, /** @type {string} */ id) => t + '|' + id;
// On IndexedDB, records are kept in buckets: each record lives in bucket `<table>|#<hash of id mod 64>`, value
// { t, rs: [record, …] }. Measured on 51,000 records (docs/ARCHITECTURE.md): one IndexedDB value per record took
// 590 ms to read at start-up, buckets keyed by id 320 ms, array buckets 230 ms, whole-table arrays 140 ms; but a
// whole-table value made every sale rewrite the table. A bucket holds ~230 records of a 15,000-sale table, so a sale
// rewrites a few buckets, still in one transaction with its outbox entries.
const BUCKETS = 64;
const bucketOf = (/** @type {string} */ t, /** @type {any} */ id) => {
  let h = 2166136261; // FNV-1a
  const s = String(id);
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return t + '|#' + ((h >>> 0) % BUCKETS).toString(16);
};

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
// 2026-11-26 (on-device data security, src/vault.js): each bucket is stored sealed, { t, __enc: 1, iv, ct }, never as
// plain records. A commit can't open and re-seal a bucket inside its IndexedDB transaction (the browser ends a
// transaction that waits for anything else), so the open buckets are kept in memory (`open`, filled by load()):
// a commit builds and seals the new buckets first, then writes them with its outbox entries in ONE transaction, as
// before. Inside that transaction each bucket is checked to be the one the commit started from (`tag`: its iv); if
// another window changed it meanwhile, nothing is written and the commit starts again from what is stored.
// Buckets stored before this (plain { t, rs }) are read as they are and sealed by load() at once (sealBuckets).
const tagOf = (/** @type {any} */ v) => (!v ? '' : isSealed(v) ? Array.from(v.iv, (/** @type {number} */ b) => b.toString(16).padStart(2, '0')).join('') : 'plain');
const recsOf = async (/** @type {IDBDatabase} */ db, /** @type {any} */ v) => (!v ? [] : isSealed(v) ? await unseal(db, v) : v.rs || []);

/** The record buckets of a daily copy (snapshot.worker.js copies them as stored: sealed) as plain { t, rs } */
export async function openBuckets(/** @type {any[]} */ rows) {
  if (!rows?.some((b) => isSealed(b))) return rows || [];
  const db = await conn();
  return Promise.all(rows.map(async (b) => ({ t: b.t, rs: await recsOf(db, b) })));
}

function idbStorage() {
  /** @type {Map<string, {t:string, rs:any[], tag:string}>} open buckets as stored (the whole store once `all`) */
  const open = new Map();
  let all = false;
  let queue = Promise.resolve();
  /** one write at a time on this page (the open buckets must follow the store) */
  const serial = (/** @type {() => Promise<any>} */ fn) => { const p = queue.then(fn); queue = p.catch(() => {}); return p; };
  /** A bucket as stored now: from memory, else read and opened */
  const bucket = async (/** @type {IDBDatabase} */ db, /** @type {string} */ k) => {
    const have = open.get(k);
    if (have || all) return have || null;
    const v = await req(db.transaction('records').objectStore('records').get(k));
    if (!v) return null;
    const b = { t: v.t, rs: await recsOf(db, v), tag: tagOf(v) };
    open.set(k, b);
    return b;
  };
  /** Seal the buckets still stored as plain records (one transaction; each only if unchanged since it was read) */
  const sealBuckets = (/** @type {IDBDatabase} */ db, /** @type {string[]} */ plain) => serial(async () => {
    const sealed = await Promise.all(plain.map(async (k) => { const b = /** @type {any} */ (open.get(k)); return [k, b, { t: b.t, ...(await seal(db, b.rs)) }]; }));
    const tx = db.transaction('records', 'readwrite');
    const finished = done(tx);
    const st = tx.objectStore('records');
    for (const [k, b, v] of sealed) {
      const g = st.get(k);
      g.onsuccess = () => { if (tagOf(g.result) === 'plain' && (g.result.rs || []).length === b.rs.length) { st.put(v, k); b.tag = tagOf(v); } };
    }
    await finished;
  });

  return {
    kind: 'indexeddb',
    /** @returns {Promise<Loaded|null>} */
    async load() {
      const db = await conn();
      const tx = db.transaction(['records', 'kv'], 'readonly');
      const [rows, keys, settings, tomb, version] = await Promise.all([
        req(tx.objectStore('records').getAll()), req(tx.objectStore('records').getAllKeys()), req(tx.objectStore('kv').get(KV_SETTINGS)), req(tx.objectStore('kv').get(KV_TOMB)), req(tx.objectStore('kv').get('storage-version')),
      ]);
      const opened = await Promise.all(rows.map((/** @type {any} */ v) => recsOf(db, v)));
      open.clear();
      /** @type {string[]} */ const plain = [];
      rows.forEach((/** @type {any} */ v, /** @type {number} */ i) => { const k = String(keys[i]); open.set(k, { t: v.t, rs: opened[i], tag: tagOf(v) }); if (!isSealed(v)) plain.push(k); });
      all = true;
      // the one-time move: records stored before sealing are sealed now (a failure leaves them readable, and it is
      // tried again at the next start)
      if (plain.length) await sealBuckets(db, plain).catch((e) => console.warn('Sealing the stored records waits for the next start:', e?.message || e));
      if (version !== STORAGE_VERSION) return null;
      /** @type {Record<string, any[]>} */
      const tables = {};
      for (const { t, rs } of open.values()) { const list = (tables[t] ??= []); for (const r of rs) list.push(r); }
      return { tables, settings, tomb: tomb || [] };
    },
    /** @param {Commit} c */
    commit(c) {
      return serial(async () => {
        /** @type {Map<string, {t:string, put:Map<string, any>, del:Set<string>}>} changes grouped by bucket */
        const touched = new Map();
        const at = (/** @type {string} */ t, /** @type {any} */ id) => { const k = bucketOf(t, id); let b = touched.get(k); if (!b) touched.set(k, (b = { t, put: new Map(), del: new Set() })); return b; };
        for (const { t, rec } of c.puts || []) { const b = at(t, rec.id); b.put.set(String(rec.id), rec); b.del.delete(String(rec.id)); }
        for (const { t, id } of c.dels || []) { const b = at(t, id); b.del.add(String(id)); b.put.delete(String(id)); }
        const db = await conn();
        for (let attempt = 0; ; attempt++) {
          // the new buckets, sealed before the transaction opens
          /** @type {[string, {t:string, rs:any[]}, string, any][]} key, new bucket, the tag it was built on, stored value */
          const next = [];
          for (const [k, b] of touched) {
            const cur = c.reset ? null : await bucket(db, k);
            const recs = (cur?.rs || []).filter((/** @type {any} */ r) => !b.put.has(String(r.id)) && !b.del.has(String(r.id)));
            for (const r of b.put.values()) recs.push(r);
            next.push([k, { t: b.t, rs: recs }, cur?.tag || '', recs.length ? { t: b.t, ...(await seal(db, recs)) } : null]);
          }
          const tx = db.transaction(['records', 'kv', 'outbox'], 'readwrite');
          const finished = done(tx);
          let moved = false; // a bucket changed under us (another window): start again from what is stored
          try {
            const rs = tx.objectStore('records'), kv = tx.objectStore('kv'), ob = tx.objectStore('outbox');
            if (c.reset) rs.clear();
            for (const [k, , tag, v] of next) {
              const write = () => { if (v) rs.put(v, k); else rs.delete(k); };
              if (c.reset) { write(); continue; }
              const g = rs.get(k);
              g.onsuccess = () => { if (tagOf(g.result) !== tag) { moved = true; try { tx.abort(); } catch { /* already over */ } } else write(); };
            }
            if (c.settings) kv.put(c.settings, KV_SETTINGS);
            if (c.tomb) kv.put(c.tomb, KV_TOMB);
            if (c.version) kv.put(c.version, 'storage-version');
            for (const [k, v] of Object.entries(c.kv || {})) v === undefined ? kv.delete(k) : kv.put(v, k);
            if (c.clearOutbox) ob.clear();
            for (const op of c.ops || []) ob.add(op);
          } catch (e) { try { tx.abort(); } catch { /* already finished */ } await finished.catch(() => {}); throw storageError(e); }
          try { await finished; } catch (e) {
            if (moved && attempt < 3) { open.clear(); all = false; continue; }
            throw storageError(e);
          }
          if (c.reset) { open.clear(); all = true; }
          for (const [k, b, , v] of next) { if (v) open.set(k, { ...b, tag: tagOf(v) }); else open.delete(k); }
          return;
        }
      });
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
    /** How many record buckets are stored (0 = nothing at all, whatever the storage version says) */
    async recordCount() {
      const db = await conn();
      return /** @type {number} */ (await req(db.transaction('records').objectStore('records').count()));
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
    async recordCount() { return records.size; },
    /** @param {number[]} keys */ async ack(keys) { for (const k of keys) ob.delete(k); },
    /** @param {OutboxEntry[]} entries */ async reject(entries, reason = '') { rejected = [...rejected, ...entries.map((e) => ({ ...e, reason }))]; for (const e of entries) if (e.key != null) ob.delete(e.key); },
    async rejected() { return rejected; },
    async clearRejected() { rejected = []; },
  };
}

/** @typedef {ReturnType<typeof idbStorage>} Storage */
/** The storage for this device (decided once: the apps keep data; the web version doesn't) */
let current;
/** @returns {Storage} */
export const storage = () => (current ??= memoryOnly() ? memoryStorage() : idbStorage());
/** Decide again (tests) */
export const resetStorageForTests = () => { current = undefined; };

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
    // not every old object is still there unchanged: something was edited, removed, or removed and another added in
    // the same change (counting puts here missed that last case, so the removal was lost)
    if (kept < a.length) {
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

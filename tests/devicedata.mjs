// Reading what an app keeps on the device, for tests (2026-11-26: records, copies and the sign-in are sealed with the
// device's key, src/vault.js). Runs inside the page: it opens IndexedDB and unseals with the key stored there (a
// browser test has no Windows protection, so the key is a plain WebCrypto key in the kv store).
//   await deviceRecords(p)        → [{ t, rs: [record, …] }, …] every record bucket, opened
//   await deviceKv(p, 'sync')     → the kv value, opened
//   await deviceRaw(p)            → { records: [stored bucket values], kv: { key: stored value } } exactly as stored
const inPage = async (what, key) => {
  const db = await new Promise((res, rej) => { const q = indexedDB.open('pharmapos'); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
  try {
    if (!db.objectStoreNames.contains('kv')) return what === 'records' ? [] : what === 'raw' ? { records: [], kv: {} } : undefined;
    const get = (store, m, k) => new Promise((res, rej) => { const r = db.transaction(store).objectStore(store)[m](k); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const entry = await get('kv', 'get', 'device-key');
    const open = async (v) => {
      if (!(v && typeof v === 'object' && v.__enc === 1)) return v;
      const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: v.iv }, entry.key, v.ct);
      return JSON.parse(new TextDecoder().decode(pt));
    };
    if (what === 'raw') {
      const keys = await get('kv', 'getAllKeys'), vals = await get('kv', 'getAll');
      return { records: db.objectStoreNames.contains('records') ? await get('records', 'getAll') : [], kv: Object.fromEntries(keys.map((k, i) => [String(k), vals[i]])) };
    }
    if (what === 'kv') {
      const v = await open(await get('kv', 'get', key));
      // a daily copy keeps its record buckets sealed one by one
      if (v?.v === 2 && Array.isArray(v.rows)) v.rows = await Promise.all(v.rows.map(async (b) => (b.__enc === 1 ? { t: b.t, rs: await open(b) } : b)));
      return v;
    }
    if (!db.objectStoreNames.contains('records')) return [];
    return Promise.all((await get('records', 'getAll')).map(async (b) => (b.__enc === 1 ? { t: b.t, rs: await open(b) } : b)));
  } finally { db.close(); }
};
export const deviceRecords = (p) => p.evaluate(inPage, 'records');
export const deviceKv = (p, key) => p.evaluate(inPage, 'kv', key);
export const deviceRaw = (p) => p.evaluate(inPage, 'raw');

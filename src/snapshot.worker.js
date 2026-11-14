// The daily on-device undo copy (store.jsx), made off the main thread: this worker reads the pharmacy's records,
// settings and tombstones straight from IndexedDB and writes them as one value `snap:<day>`, then keeps the newest
// seven. The screen never waits for it (copying a big pharmacy on the main thread was one long step it could not
// interrupt). The copy holds what is saved on this device, exactly as storage.js keeps it: { v: 2, at, rows, settings,
// tomb } where rows are the record buckets ({ t, rs: [record, …] }); store.jsx loadSnapshot reads both this and the
// older whole-pharmacy copies.
//
// The whole worker is this one self-contained function (nothing from outside it): store.jsx starts it from a Blob, so
// it works the same from the Windows app's file:// pages, the Android app and the website (worker-src blob: is
// allowed in electron/main.cjs and public/_headers).
export function snapshotWorkerMain() {
  const DB_NAME = 'pharmapos';
  const KEEP = 7;
  const req = (r) => new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
  const done = (tx) => new Promise((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error || new Error('Not saved')); });

  self.onmessage = async ({ data }) => {
    const { key } = data || {};
    let db;
    try {
      db = await new Promise((resolve, reject) => {
        const r = indexedDB.open(DB_NAME); // the app's own version: this worker never upgrades or creates stores
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
        r.onupgradeneeded = () => { r.transaction.abort(); reject(new Error('no pharmacy on this device')); };
      });
      if (!db.objectStoreNames.contains('records') || !db.objectStoreNames.contains('kv')) throw new Error('no pharmacy on this device');
      const read = db.transaction(['records', 'kv'], 'readonly');
      const [rows, settings, tomb, keys] = await Promise.all([
        req(read.objectStore('records').getAll()), req(read.objectStore('kv').get('s2:settings')), req(read.objectStore('kv').get('s2:_tomb')), req(read.objectStore('kv').getAllKeys()),
      ]);
      if (!rows.length) throw new Error('nothing to copy yet');
      const write = db.transaction('kv', 'readwrite');
      const kv = write.objectStore('kv');
      kv.put({ v: 2, at: new Date().toISOString(), rows, settings: settings || null, tomb: tomb || [] }, key);
      const snaps = [...new Set([...keys.map(String).filter((k) => k.startsWith('snap:')), key])].sort();
      for (const old of snaps.slice(0, -KEEP)) kv.delete(old);
      await done(write);
      self.postMessage({ ok: true, records: rows.reduce((a, b) => a + (b.rs?.length || 0), 0) });
    } catch (e) {
      self.postMessage({ ok: false, error: String(e?.message || e) });
    } finally {
      db?.close();
    }
  };
}

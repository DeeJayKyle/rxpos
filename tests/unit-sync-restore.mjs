// A cloud restored from an older backup (src/sync.js): changes this device saved after that backup had already left the
// outbox, so the restored cloud lost them. After the epoch changes and everything is downloaded again, the device
// sends everything it holds once more: the lost sale and deletion come back, a newer copy in the cloud is never
// overwritten, a record deleted and made again goes up alive, an interrupted run still does it, and only once.
// Fictional data only; a fake cloud with the worker's rules (last writer wins, add-only rows).   node unit-sync-restore.mjs
import { build } from 'esbuild';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + x : ''}`); };

// the browser bits createSync touches
const noop = () => {};
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true, userAgent: 'node' }, configurable: true });
globalThis.window = { addEventListener: noop, removeEventListener: noop, localStorage: { getItem: () => null, setItem: noop, removeItem: noop } };
globalThis.document = { visibilityState: 'visible', addEventListener: noop, removeEventListener: noop };
globalThis.location = { protocol: 'https:', origin: 'https://rxposug.com', pathname: '/', hash: '' };

// src/sync.js imports store.jsx (JSX): bundle it for node first
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = await build({ entryPoints: [path.join(root, 'src/sync.js')], bundle: true, format: 'esm', platform: 'node', write: false, loader: { '.js': 'jsx' }, jsx: 'automatic', define: { 'import.meta.env.DEV': 'false' }, logLevel: 'error' });
const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rxpos-sync-')), 'sync.mjs');
fs.writeFileSync(file, out.outputFiles[0].text);
const { createSync, FULL_PULL } = await import(pathToFileURL(file).href);
const TABLES = ['products', 'customers', 'sales', 'movements'];
// every other table the app knows is empty on this fictional device
const withAllTables = (db) => new Proxy(db, { get: (o, k) => (k in o || typeof k !== 'string' ? o[k] : []) });

// ---- a fake cloud with the worker's rules ----
function cloud() {
  const c = { rows: new Map(), seq: 0, epoch: 'e1', ops: new Set(), failOn: 0, calls: 0 };
  c.snapshot = () => new Map([...c.rows].map(([k, v]) => [k, { ...v }]));
  c.restore = (snap) => { c.rows = new Map([...snap].map(([k, v]) => [k, { ...v }])); c.epoch = 'e2'; };
  c.fetch = async (url, init) => {
    if (!String(url).endsWith('/api/sync')) return { ok: false, status: 404, json: async () => ({}) }; // no ready-made chunks (stage 3), like a hub
    c.calls++;
    if (c.failOn && c.calls === c.failOn) throw new TypeError('Failed to fetch');
    const b = JSON.parse(init.body);
    for (const ch of b.changes) {
      if (c.ops.has(ch.op)) continue;
      c.ops.add(ch.op);
      const k = ch.t + '|' + ch.id, have = c.rows.get(k);
      if (ch.t === 'movements' && have) continue; // add-only
      if (have && have.at >= ch.at) continue; // the newer copy stays
      c.rows.set(k, { t: ch.t, id: ch.id, rec: ch.rec ?? null, deleted: !!ch.deleted, at: ch.at, seq: ++c.seq, origin: b.deviceId });
    }
    const page = [...c.rows.values()].filter((r) => r.seq > b.since && (b.all || r.origin !== b.deviceId)).sort((x, y) => x.seq - y.seq);
    return { ok: true, status: 200, json: async () => ({ changes: page.map((r) => ({ t: r.t, id: r.id, rec: r.rec, deleted: r.deleted, at: r.at })), cursor: c.seq, more: false, refusedKeys: [], protocol: 2, epoch: c.epoch }) };
  };
  return c;
}

// ---- a device: its records, outbox and sync settings in memory ----
function device(cl) {
  let db = { settings: { name: 'Sample Pharmacy', updatedAt: '2026-11-01T00:00:00.000Z' }, _tomb: [], ...Object.fromEntries(TABLES.map((t) => [t, []])) };
  let cfg = { url: 'https://api.rxposug.com', key: 'u.test', deviceId: 'dev-a', outboxV2: true, fullPull: FULL_PULL, cursor: 0 };
  const ob = new Map();
  let key = 0;
  const store = {
    async commit(c) { for (const o of c.ops) ob.set(++key, o); },
    async outbox() { return [...ob.entries()].map(([k, v]) => ({ ...v, key: k })); },
    async count() { return ob.size; },
    async ack(keys) { for (const k of keys) ob.delete(k); },
    async reject(es) { for (const e of es) ob.delete(e.key); },
    async rejected() { return []; },
  };
  const d = {
    get db() { return db; }, get cfg() { return cfg; }, outbox: ob,
    /** a local change, queued like store.update does */
    async save(t, rec, at) { db = { ...db, [t]: [...db[t].filter((r) => r.id !== rec.id), { ...rec, updatedAt: at }] }; await store.commit({ ops: [{ op: crypto.randomUUID(), txn: crypto.randomUUID(), t, id: rec.id, at }] }); },
    async remove(t, id, at) { db = { ...db, [t]: db[t].filter((r) => r.id !== id), _tomb: [...db._tomb, { t, id, at }] }; await store.commit({ ops: [{ op: crypto.randomUUID(), txn: crypto.randomUUID(), t, id, deleted: true, at }] }); },
  };
  globalThis.fetch = (url, init) => cl.fetch(url, init);
  d.sync = createSync({
    getDb: () => withAllTables(db), getCfg: () => cfg, saveCfg: async (x) => { cfg = x; }, onStatus: noop, store,
    applyRemote: async (changes) => { // last writer wins, like store.jsx
      for (const ch of changes) {
        const cur = db[ch.t]?.find((r) => r.id === ch.id), tomb = db._tomb.find((x) => x.t === ch.t && x.id === ch.id);
        if ((cur && cur.updatedAt >= ch.at) || (tomb && tomb.at >= ch.at) || !db[ch.t]) continue;
        db = { ...db, [ch.t]: ch.deleted ? db[ch.t].filter((r) => r.id !== ch.id) : [...db[ch.t].filter((r) => r.id !== ch.id), { ...ch.rec, id: ch.id, updatedAt: ch.at }] };
      }
    },
  });
  return d;
}

async function scenario() {
  const cl = cloud(), a = device(cl);
  await a.save('products', { id: 'p1', name: 'Calmex', price: 500 }, '2026-11-05T09:00:00.000Z');
  await a.save('customers', { id: 'c1', name: 'Amina Test' }, '2026-11-05T09:01:00.000Z');
  await a.sync.run();
  const backup = cl.snapshot(); // the nightly backup
  await a.save('sales', { id: 's1', number: 'R-1', total: 500 }, '2026-11-05T10:00:00.000Z');
  await a.remove('customers', 'c1', '2026-11-05T10:05:00.000Z');
  await a.sync.run();
  return { cl, a, backup };
}

try {
  {
    const { cl, a, backup } = await scenario();
    check('before the restore everything was sent and acknowledged', a.outbox.size === 0 && !!cl.rows.get('sales|s1'));
    cl.restore(backup);
    check('the restore lost the sale and undid the deletion', !cl.rows.get('sales|s1') && cl.rows.get('customers|c1')?.deleted === false);
    const r = await a.sync.run();
    check('after the restore the sync finishes', r.state === 'ok', r.error || r.state);
    check('the lost sale is back in the cloud', cl.rows.get('sales|s1')?.rec?.total === 500);
    check('the deletion is back too', cl.rows.get('customers|c1')?.deleted === true);
    check('nothing is left waiting', a.outbox.size === 0, String(a.outbox.size));
    check('the device no longer has a resend due', a.cfg.resendAfterRestore === false, String(a.cfg.resendAfterRestore));
    const calls = cl.calls;
    await a.sync.run();
    check('the resend happens only once', cl.calls === calls + 1 && a.outbox.size === 0);
    a.sync.stop();
  }
  {
    const { cl, a, backup } = await scenario();
    cl.restore(backup);
    cl.rows.set('products|p1', { t: 'products', id: 'p1', rec: { id: 'p1', name: 'Calmex', price: 650 }, deleted: false, at: '2026-11-06T08:00:00.000Z', seq: ++cl.seq, origin: 'dev-b' });
    await a.sync.run();
    check('a newer copy in the restored cloud is never overwritten', cl.rows.get('products|p1').rec.price === 650);
    check('…and this device takes the newer copy', a.db.products.find((p) => p.id === 'p1').price === 650);
    a.sync.stop();
  }
  {
    const { cl, a, backup } = await scenario();
    await a.save('customers', { id: 'c1', name: 'Amina Test (again)' }, '2026-11-05T11:00:00.000Z');
    await a.sync.run();
    cl.restore(backup);
    await a.sync.run();
    check('a record deleted and made again goes up alive', cl.rows.get('customers|c1')?.deleted === false && cl.rows.get('customers|c1')?.rec?.name === 'Amina Test (again)', JSON.stringify(cl.rows.get('customers|c1')));
    a.sync.stop();
  }
  {
    const { cl, a, backup } = await scenario();
    cl.restore(backup);
    cl.failOn = cl.calls + 2; // the connection drops right after the restore is noticed
    const cut = await a.sync.run();
    check('a run cut off after the restore fails…', cut.state !== 'ok', cut.state);
    check('…and the resend is remembered on the device', a.cfg.resendAfterRestore === true, String(a.cfg.resendAfterRestore));
    await a.sync.run();
    check('the next run still sends everything', cl.rows.get('sales|s1')?.rec?.total === 500 && a.cfg.resendAfterRestore === false);
    a.sync.stop();
  }
} catch (e) { fail++; console.log('FAIL  threw', e.stack); }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

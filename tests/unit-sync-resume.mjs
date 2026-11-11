// A first download that is cut off (src/sync.js): the pages that arrived stay on the device and the next run carries on
// from the last one, still asking for everything (all: true), instead of starting again from the beginning. On a slow
// connection a large pharmacy's first download otherwise never finishes. Only a finished download counts as done.
// Fictional data only; a fake cloud that pages like the worker.   node unit-sync-resume.mjs
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


// ---- a fake cloud that pages like the worker (100 records a page) ----
function cloud(n) {
  const c = { rows: [], epoch: 'e1', failOn: 0, calls: 0, asked: [] };
  for (let i = 1; i <= n; i++) c.rows.push({ t: 'products', id: 'p' + i, rec: { id: 'p' + i, name: 'Sample medicine ' + i, price: 100 + i }, at: '2026-11-01T00:00:00.000Z', seq: i, origin: 'dev-b' });
  c.fetch = async (url, init) => {
    if (!String(url).endsWith('/api/sync')) return { ok: false, status: 404, json: async () => ({}) }; // no ready-made chunks (stage 3), like a hub
    c.calls++;
    const b = JSON.parse(init.body);
    c.asked.push({ since: b.since, all: !!b.all });
    if (c.failOn && c.calls === c.failOn) throw new TypeError('Failed to fetch');
    const next = c.rows.filter((r) => r.seq > b.since && (b.all || r.origin !== b.deviceId));
    const page = next.slice(0, 100);
    return { ok: true, status: 200, json: async () => ({ changes: page.map((r) => ({ t: r.t, id: r.id, rec: r.rec, at: r.at })), cursor: page.length ? page[page.length - 1].seq : c.rows.length, more: next.length > page.length, refusedKeys: [], protocol: 2, epoch: c.epoch }) };
  };
  return c;
}

function device(cl, cfgOver = {}) {
  let db = { settings: { name: 'Sample Pharmacy', updatedAt: '2026-11-01T00:00:00.000Z' }, _tomb: [], ...Object.fromEntries(TABLES.map((t) => [t, []])) };
  let cfg = { url: 'https://api.rxposug.com', key: 'u.test', deviceId: 'dev-a', outboxV2: true, cursor: 0, ...cfgOver };
  const store = { async commit() {}, async outbox() { return []; }, async count() { return 0; }, async ack() {}, async reject() {}, async rejected() { return []; } };
  globalThis.fetch = (url, init) => cl.fetch(url, init);
  const d = { get db() { return db; }, get cfg() { return cfg; } };
  d.sync = createSync({
    getDb: () => withAllTables(db), getCfg: () => cfg, saveCfg: async (x) => { cfg = x; }, onStatus: noop, store,
    applyRemote: async (changes) => { for (const ch of changes) db = { ...db, [ch.t]: [...db[ch.t].filter((r) => r.id !== ch.id), { ...ch.rec, updatedAt: ch.at }] }; },
  });
  return d;
}

try {
  {
    const cl = cloud(350), a = device(cl); // a new device: never downloaded everything
    cl.failOn = 3; // the connection drops on the third page
    const cut = await a.sync.run();
    check('the cut-off first download is not counted as done', cut.state !== 'ok' && !a.cfg.lastSync && (a.cfg.fullPull || 0) < FULL_PULL, JSON.stringify({ s: cut.state, l: a.cfg.lastSync, f: a.cfg.fullPull }));
    check('the two pages that arrived stay on the device', a.db.products.length === 200, String(a.db.products.length));
    const before = cl.asked.length;
    const r = await a.sync.run();
    const resumed = cl.asked.slice(before);
    check('the next run carries on from the last page, not from the start', resumed[0]?.since === 200, JSON.stringify(resumed));
    check('…still asking for everything', resumed.every((x) => x.all));
    check('it finishes with every record, none twice', r.state === 'ok' && a.db.products.length === 350 && new Set(a.db.products.map((p) => p.id)).size === 350, `${r.state} ${a.db.products.length}`);
    check('only two more requests (the last 150 records)', resumed.length === 2, String(resumed.length));
    check('now it counts as done', a.cfg.fullPull === FULL_PULL && !!a.cfg.lastSync && !a.cfg.fullInProgress);
    const again = cl.asked.length;
    await a.sync.run();
    check('later runs ask only for what is new', cl.asked[again].since === 350 && !cl.asked[again].all, JSON.stringify(cl.asked[again]));
    a.sync.stop();
  }
  {
    // a device that has synced before (cursor far along) but is asked for a fresh full download: that starts from 0
    const cl = cloud(150), a = device(cl, { cursor: 150, fullPull: 0, lastSync: '2026-11-01T00:00:00.000Z' });
    await a.sync.run();
    check('a fresh full download starts from the beginning', cl.asked[0].since === 0 && cl.asked[0].all, JSON.stringify(cl.asked[0]));
    check('…and finishes', a.cfg.fullPull === FULL_PULL && a.db.products.length === 150);
    a.sync.stop();
  }
} catch (e) { fail++; console.log('FAIL  threw', e.stack); }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

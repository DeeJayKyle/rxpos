// Faster sync, stage 2 (src/sync.js, docs/SYNC-SPEED-PLAN.md): a full download asks for the core first, then the
// history, then what changed since the core ended. The app hears when the core is in; a cut-off download resumes in
// the phase it was in; a cloud without phases still gives everything. Fictional data only; a fake cloud that splits
// like the worker (HISTORY_SQL: here, sales marked old are history).   node unit-sync-phases.mjs
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
const { createSync, FULL_PULL, windowStart, historyMonthsOf } = await import(pathToFileURL(file).href);
const TABLES = ['products', 'customers', 'sales', 'movements'];
// every other table the app knows is empty on this fictional device
const withAllTables = (db) => new Proxy(db, { get: (o, k) => (k in o || typeof k !== 'string' ? o[k] : []) });



// ---- a fake cloud with phases (or without, like a cloud before stage 2) ----
function cloud({ products = 30, oldSales = 40, phases = true } = {}) {
  const c = { rows: [], seq: 0, epoch: 'e1', failOn: 0, calls: 0, asked: [], phases };
  const add = (t, id, rec) => c.rows.push({ t, id, rec: { id, ...rec }, at: '2026-11-01T00:00:00.000Z', seq: ++c.seq, origin: 'dev-b' });
  for (let i = 1; i <= products; i++) { add('products', 'p' + i, { name: 'Sample ' + i }); add('sales', 'old' + i, { old: true }); }
  for (let i = products + 1; i <= oldSales; i++) add('sales', 'old' + i, { old: true });
  c.add = add;
  const isHist = (r) => r.t === 'sales' && r.rec.old;
  c.fetch = async (url, init) => {
    if (!String(url).endsWith('/api/sync')) return { ok: false, status: 404, json: async () => ({}) }; // no ready-made chunks (stage 3), like a hub
    c.calls++;
    const b = JSON.parse(init.body);
    c.asked.push({ since: b.since, phase: b.phase || null, all: !!b.all, window: b.window || null });
    if (c.failOn && c.calls === c.failOn) throw new TypeError('Failed to fetch');
    const phase = c.phases && b.all && (b.phase === 'core' || b.phase === 'history') ? b.phase : null;
    const next = c.rows.filter((r) => r.seq > b.since && (b.all || r.origin !== b.deviceId) && (!phase || (phase === 'history') === isHist(r)));
    const page = next.slice(0, 7);
    const reply = { changes: page.map((r) => ({ t: r.t, id: r.id, rec: r.rec, at: r.at })), cursor: page.length && next.length > page.length ? page[page.length - 1].seq : c.seq, more: next.length > page.length, refusedKeys: [], protocol: 2, epoch: c.epoch };
    if (c.phases) reply.phase = phase;
    return { ok: true, status: 200, json: async () => reply };
  };
  return c;
}

function device(cl) {
  let db = { settings: { name: 'Sample Pharmacy', updatedAt: '2026-11-01T00:00:00.000Z' }, _tomb: [], ...Object.fromEntries(TABLES.map((t) => [t, []])) };
  let cfg = { url: 'https://api.rxposug.com', key: 'u.test', deviceId: 'dev-a', outboxV2: true, cursor: 0 };
  const store = { async commit() {}, async outbox() { return []; }, async count() { return 0; }, async ack() {}, async reject() {}, async rejected() { return []; } };
  globalThis.fetch = (url, init) => cl.fetch(url, init);
  let prune = () => {};
  const d = { statuses: [], get db() { return db; }, get cfg() { return cfg; }, setPrune: (fn) => { prune = fn; }, setCfg: (x) => { cfg = x; } };
  d.sync = createSync({
    getDb: () => withAllTables(db), getCfg: () => cfg, saveCfg: async (x) => { cfg = x; }, onStatus: (s) => d.statuses.push({ ...s, products: db.products.length, sales: db.sales.length }), store,
    pruneWindow: async (W) => prune(W),
    applyRemote: async (changes) => { for (const ch of changes) db = { ...db, [ch.t]: [...db[ch.t].filter((r) => r.id !== ch.id), { ...ch.rec, updatedAt: ch.at }] }; },
  });
  return d;
}

try {
  {
    const cl = cloud(), a = device(cl);
    const r = await a.sync.run();
    check('a full download finishes with every record', r.state === 'ok' && a.db.products.length === 30 && a.db.sales.length === 40, `${r.state} ${a.db.products.length} ${a.db.sales.length}`);
    const phases = cl.asked.map((x) => x.phase);
    check('it asks for the core first, then the history, then the rest', phases[0] === 'core' && phases.includes('history') && phases.indexOf('history') > phases.lastIndexOf('core') && phases[phases.length - 1] === null, phases.join(','));
    const ready = a.statuses.find((s) => s.history);
    check('the app hears the core is in while the history is still coming', !!ready && ready.products === 30 && ready.sales < 40, JSON.stringify(ready && { p: ready.products, s: ready.sales }));
    check('the history starts from the beginning', cl.asked.find((x) => x.phase === 'history')?.since === 0);
    check('the rest starts where the core ended (the cloud\'s last number then)', cl.asked[cl.asked.length - 1].since === cl.seq, JSON.stringify(cl.asked[cl.asked.length - 1]));
    check('done: no phase left over', a.cfg.fullPull === FULL_PULL && !a.cfg.phase && !a.cfg.fullInProgress);
    a.sync.stop();
  }
  {
    // records changed while the history downloads still arrive (they are newer than where the core ended)
    const cl = cloud(), a = device(cl);
    const f = cl.fetch;
    let added = false;
    cl.fetch = async (u, init) => { const b = JSON.parse(init.body); if (b.phase === 'history' && !added) { added = true; cl.add('products', 'p-new', { name: 'Added meanwhile' }); } return f(u, init); };
    await a.sync.run();
    check('a medicine added during the history download still arrives', a.db.products.some((p) => p.id === 'p-new'));
    a.sync.stop();
  }
  {
    // cut off during the history: the next run carries on in the history, the core is not downloaded again
    const cl = cloud(), a = device(cl);
    const f = cl.fetch;
    let histCalls = 0;
    cl.fetch = async (u, init) => { const b = JSON.parse(init.body); if (b.phase === 'history' && ++histCalls === 3) throw new TypeError('Failed to fetch'); return f(u, init); };
    const cut = await a.sync.run();
    check('a download cut off in the history is not done', cut.state !== 'ok' && a.cfg.phase === 'history' && a.cfg.fullInProgress, `${cut.state} ${a.cfg.phase}`);
    const before = cl.asked.length;
    const r = await a.sync.run();
    const resumed = cl.asked.slice(before);
    check('…the next run carries on in the history, not the core', resumed[0]?.phase === 'history' && resumed[0].since > 0 && !resumed.some((x) => x.phase === 'core'), JSON.stringify(resumed[0]));
    check('…and finishes with everything, none twice', r.state === 'ok' && a.db.sales.length === 40 && new Set(a.db.sales.map((s) => s.id)).size === 40);
    a.sync.stop();
  }
  {
    // a cloud before stage 2 ignores the phase and sends everything in order: still all of it
    const cl = cloud({ phases: false }), a = device(cl);
    const r = await a.sync.run();
    check('a cloud without phases still gives everything', r.state === 'ok' && a.db.products.length === 30 && a.db.sales.length === 40, `${a.db.products.length} ${a.db.sales.length}`);
    check('…asked once with the core, then as one plain download', cl.asked[0].phase === 'core' && cl.asked.slice(1).every((x) => !x.phase), cl.asked.map((x) => x.phase).join(','));
    a.sync.stop();
  }
  {
    // stage 4: recent history on this device (docs/SYNC-HISTORY-WINDOW.md)
    check('the window starts on the first day of the month N months back', windowStart(12, new Date('2026-11-11T10:00:00Z')) === '2025-11-01' && windowStart(6, new Date('2026-03-31T23:00:00Z')) === '2025-09-01' && windowStart(0) === '');
    const cl = cloud(), a = device(cl);
    await a.sync.run(); // first download, no window
    const bfAsked = [];
    let pruned = null;
    const f = cl.fetch;
    cl.fetch = async (u, init) => {
      if (String(u).endsWith('/api/balances')) { const b = JSON.parse(init.body); bfAsked.push(b.window); return { ok: true, status: 200, json: async () => ({ W: b.window, asOf: cl.seq, stock: [], customer: { c1: 500 } }) }; }
      return f(u, init);
    };
    a.setPrune((W) => { pruned = W; });
    a.setCfg({ ...a.cfg, historyMonths: 12 });
    const n0 = cl.asked.length;
    const r = await a.sync.run();
    const W = windowStart(12);
    check('choosing 12 months: older records are removed from this device only (no download again)', r.state === 'ok' && pruned === W && !cl.asked.slice(n0).some((x) => x.all), JSON.stringify({ pruned, asked: cl.asked.slice(n0) }));
    check('…and the cloud\'s brought-forward figures for that window are kept', bfAsked[0] === W && a.cfg.balances?.W === W && a.cfg.balances.customer.c1 === 500);
    const before = cl.asked.length;
    a.setCfg({ ...a.cfg, historyMonths: 0 });
    await a.sync.run();
    const again = cl.asked.slice(before);
    check('back to everything: the pharmacy is downloaded again (the older records come back), no window sent', again[0]?.all === true && again.every((x) => !x.window) && !a.cfg.window, JSON.stringify(again[0]));
  }
  {
    // a cloud (or hub) without brought-forward figures: the device keeps everything rather than show wrong balances
    const cl = cloud(), a = device(cl);
    await a.sync.run();
    a.setCfg({ ...a.cfg, historyMonths: 12 });
    await a.sync.run();
    check('a cloud without brought-forward figures: the device goes back to keeping everything', !a.cfg.window && !a.cfg.historyMonths && a.cfg.fullPull === 0, JSON.stringify({ w: a.cfg.window, m: a.cfg.historyMonths }));
  }
} catch (e) { fail++; console.log('FAIL  threw', e.stack); }

// The owner's decisions G and H: a device that never chose keeps 12 months in the Windows / Android apps and 1 month on
// the website (node runs as the website here); an explicit choice, "everything" (0) included, is always kept
check('a website that never chose keeps 1 month of history', historyMonthsOf({}) === 1 && historyMonthsOf(undefined) === 1);
check('"Everything" (0) chosen on This device stays everything', historyMonthsOf({ historyMonths: 0 }) === 0 && windowStart(historyMonthsOf({ historyMonths: 0 })) === '');
check('6, 12 or 24 months chosen are kept', [6, 12, 24].every((m) => historyMonthsOf({ historyMonths: m }) === m));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

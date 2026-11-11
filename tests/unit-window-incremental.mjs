// Brought-forward figures kept and updated incrementally (worker/window.js balancesAt with R2) must equal the figures
// added up from scratch (no R2) after every kind of change: new records, edits of old records (including a date moved
// across the window start), deletions, refunds, and a restore (new epoch). Real SQLite through the hub's D1 adapter.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { d1FromSqlite } from '../server/d1-sqlite.js';
import { balancesAt, pruneWindows } from '../worker/window.js';

let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + x : ''}`); };
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); }

/** a fake R2 bucket */
const bucket = () => { const m = new Map(); return { m, async get(k) { return m.has(k) ? { text: async () => m.get(k) } : null; }, async put(k, v) { m.set(k, v); }, async list() { return { objects: [...m.keys()].map((key) => ({ key })), truncated: false }; }, async delete(ks) { for (const k of [].concat(ks)) m.delete(k); } }; };
const same = (a, b) => {
  const norm = (o) => JSON.stringify({ stock: [...o.stock].map((x) => [x.branch, x.batch, x.product, Math.round(x.qty * 100)]).sort(), ...Object.fromEntries(['customer', 'supplier', 'insurer', 'account', 'loan'].map((k) => [k, Object.entries(o[k] || {}).map(([i, v]) => [i, Math.round(v * 100)]).filter(([, v]) => v).sort()])) });
  return norm(a) === norm(b);
};

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rxpos-winc-'));
const W = '2026-06-01';
let allEqual = true, worst = '', incrementalUsed = true;
for (let seed = 1; seed <= 12; seed++) {
  const r = rng(seed), file = path.join(dir, `p${seed}.db`);
  const raw = new DatabaseSync(file);
  raw.exec('CREATE TABLE records (tenant TEXT, k TEXT PRIMARY KEY, t TEXT, id TEXT, rec TEXT, deleted INTEGER, at TEXT, seq INTEGER, origin TEXT); CREATE TABLE owner_config (k TEXT PRIMARY KEY, v TEXT)');
  let seq = 0, epoch = '0';
  const put = (t, id, rec) => raw.prepare('INSERT OR REPLACE INTO records VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run('ph', t + '|' + id, t, id, rec ? JSON.stringify(rec) : null, rec ? 0 : 1, '', ++seq, 'dev');
  const day = () => new Date(Date.UTC(2025, 6, 1) + Math.floor(r() * 520) * 864e5).toISOString(); // Jul 2025 – Dec 2026, across W
  const live = [];
  const make = (i) => {
    const kind = r();
    if (kind < 0.5) return ['movements', 'm' + i, { productId: 'p' + Math.floor(r() * 15), batchId: 'b' + Math.floor(r() * 5), qty: Math.round((r() - 0.4) * 50), type: 'Sale', branchId: r() < 0.8 ? 'main' : 'br2', date: day() }];
    if (kind < 0.8) { const total = 1000 + Math.floor(r() * 9000); return ['sales', 's' + i, { number: 'R' + i, total, paid: r() < 0.4 ? Math.floor(total * r()) : total, customerId: r() < 0.5 ? 'c' + Math.floor(r() * 6) : 'walk-in', date: day(), status: 'completed', bankId: r() < 0.5 ? 'cash-drawer' : 'bank-1', items: [] }]; }
    const total = 2000 + Math.floor(r() * 20000); return ['purchases', 'pu' + i, { supplierId: 'sup' + Math.floor(r() * 4), total, paid: Math.floor(total * r()), date: day(), bankId: 'bank-1' }];
  };
  for (let i = 0; i < 300; i++) { const [t, id, rec] = make(i); put(t, id, rec); live.push([t, id, rec]); }
  const db = d1FromSqlite(file), R2 = bucket(), epochOf = async () => epoch;
  for (let round = 0; round < 6; round++) {
    const inc = await balancesAt({ DB: db, APPS: R2 }, 'ph', W, { epochOf });
    const full = await balancesAt({ DB: db }, 'ph', W, { epochOf });
    if (!same(inc, full)) { allEqual = false; worst ||= `seed ${seed} round ${round}`; }
    const kept = [...R2.m.entries()].find(([k]) => k.includes(`/${epoch}/`) && k.endsWith('.v2.json'));
    if (!kept || JSON.parse(kept[1]).asOf !== seq) incrementalUsed = false;
    // changes before the next round
    for (let j = 0; j < 40; j++) {
      const x = live[Math.floor(r() * live.length)];
      const what = r();
      if (what < 0.3) { x[2] = { ...x[2], date: day() }; put(...x); } // an old record's date moved (maybe across W)
      else if (what < 0.5) { x[2] = { ...x[2], ...(x[0] === 'movements' ? { qty: x[2].qty + 3 } : { total: (x[2].total || 0) + 500 }) }; put(...x); }
      else if (what < 0.6) { put(x[0], x[1], null); live.splice(live.indexOf(x), 1); } // deleted
      else if (what < 0.7 && x[0] === 'sales') { x[2] = { ...x[2], status: 'refunded', refundedAt: day() }; put(...x); }
      else { const nx = make(1000 + round * 100 + j); put(...nx); live.push(nx); }
    }
    if (round === 3) epoch = '1'; // a restore: the kept figures of the old epoch are not used
  }
  raw.close();
}
check('incrementally kept figures = figures from scratch, after inserts, edits across W, deletions, refunds and a restore (12 pharmacies × 6 rounds)', allEqual, worst);
check('each request updates the kept figures up to the newest change', incrementalUsed);

// reading only what changed: a request with nothing new reads no records
{
  const file = path.join(dir, 'q.db'), raw = new DatabaseSync(file);
  raw.exec('CREATE TABLE records (tenant TEXT, k TEXT PRIMARY KEY, t TEXT, id TEXT, rec TEXT, deleted INTEGER, at TEXT, seq INTEGER, origin TEXT)');
  raw.prepare('INSERT INTO records VALUES (?,?,?,?,?,?,?,?,?)').run('ph', 'movements|m1', 'movements', 'm1', JSON.stringify({ productId: 'p', batchId: 'b', qty: 5, branchId: 'main', date: '2026-01-01' }), 0, '', 1, 'd');
  raw.close();
  const db = d1FromSqlite(file); let reads = 0;
  const counted = { prepare: (sql) => { const st = db.prepare(sql); return { bind: (...a) => { const b = st.bind(...a); return { first: (c) => b.first(c), all: async () => { const res = await b.all(); if (/SELECT t, id, rec/.test(sql)) reads += res.results.length; return res; } }; } }; } };
  const R2 = bucket(), epochOf = async () => '0';
  await balancesAt({ DB: counted, APPS: R2 }, 'ph', W, { epochOf });
  const first = reads; reads = 0;
  const again = await balancesAt({ DB: counted, APPS: R2 }, 'ph', W, { epochOf });
  check('a request with nothing new since reads no records', first === 1 && reads === 0, `${first} then ${reads}`);
  check('…and still gives the figures', again.stock.length === 1 && again.stock[0].qty === 5);
}
// nightly prune: old epochs and the old one-file-per-sequence-number format go; the current kept figures stay
{
  const R2 = bucket();
  for (const k of ['windows/ph/0/2026-06-01.v2.json', 'windows/ph/0/2026-06-01-1234.json', 'windows/ph/9/2026-06-01.v2.json']) await R2.put(k, '{}');
  const n = await pruneWindows({ DB: null, APPS: R2 }, async () => '0');
  check('the nightly prune removes old epochs and the old format, and keeps the current figures', n === 2 && [...R2.m.keys()].join() === 'windows/ph/0/2026-06-01.v2.json', [...R2.m.keys()].join());
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

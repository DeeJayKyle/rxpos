// Read-only inventory check on a backup file (Settings → Data & backup → Download a backup). Changes nothing.
//   node tools/inventory-check.mjs rxpos-backup-2026-10-27.json [--hours 36] [--now 2026-10-27T12:00:00Z]
//
// Stock in RxPOS is never stored as a number: it is the sum of the stock movements (append-only, the cloud refuses
// edits and deletes), and the inventory value is each batch's stock × that batch's cost (the medicine's cost if the
// batch has none), with expired batches kept apart (store.jsx → batchValue). So this rebuilds the stock as it was
// `hours` ago by undoing the movements since then, explains every shilling of the change, and looks for the ways
// stock could disappear without a movement saying why:
//   • movements whose batch or medicine record is missing (that stock is in no total)
//   • sales whose stock movements don't match the sale (missing = stock not taken, extra = taken twice)
//   • deliveries whose stock movements don't match the delivery
import fs from 'node:fs';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
if (!file) { console.error('usage: node tools/inventory-check.mjs <backup.json> [--hours 36] [--now ISO]'); process.exit(2); }
const db = JSON.parse(fs.readFileSync(file, 'utf8'));
const hours = Number(opt('hours', 36));
const latest = [...(db.movements || []), ...(db.sales || [])].reduce((a, r) => (r.date > a ? r.date : a), '');
const NOW = new Date(opt('now', latest || new Date().toISOString()));
const FROM = new Date(NOW.getTime() - hours * 3600e3);
const inWindow = (d) => { const t = new Date(d); return t > FROM && t <= NOW; };
const MAIN = 'main';
const money = (n) => Math.round(n).toLocaleString('en-UG');
const qtyf = (n) => (Math.round(n * 100) / 100).toLocaleString('en-UG');
const day = (d) => d.toISOString().slice(0, 10);

const products = new Map((db.products || []).map((p) => [p.id, p]));
const batches = new Map((db.batches || []).map((b) => [b.id, b]));
const moves = db.movements || [];
const name = (pid) => products.get(pid)?.name || `(missing medicine ${pid})`;
// a movement's batch key: its batch, or the medicine's "legacy batch" (stock from before batches existed)
const keyOf = (m) => (m.branchId || MAIN) + '|' + (m.batchId || 'lb-' + m.productId);
const costOf = (m) => { const b = m.batchId && batches.get(m.batchId); return (b && b.cost) || products.get(m.productId)?.cost || 0; };
const expiryOf = (m) => (m.batchId ? batches.get(m.batchId)?.expiry : products.get(m.productId)?.expiry) || '';
const expiredOn = (expiry, at) => !!expiry && expiry < day(at); // daysUntil(expiry) < 0 on that day

// ---- stock now and then (then = now minus the movements in the window) ----
const lots = new Map(); // key → { productId, batchId, now, then, cost, expiry, orphan }
for (const m of moves) {
  const k = keyOf(m);
  let l = lots.get(k);
  if (!l) {
    const orphan = !products.has(m.productId) ? 'medicine record missing' : m.batchId && !batches.has(m.batchId) ? 'batch record missing' : '';
    l = { productId: m.productId, batchId: m.batchId, branchId: m.branchId || MAIN, now: 0, then: 0, cost: costOf(m), expiry: expiryOf(m), orphan };
    lots.set(k, l);
  }
  const q = Number(m.qty) || 0;
  if (new Date(m.date) <= NOW) l.now += q;
  if (new Date(m.date) <= FROM) l.then += q;
}
const valueAt = (which, at) => {
  let value = 0, expired = 0, hidden = 0, oldRule = 0;
  for (const l of lots.values()) {
    const q = l[which];
    if (!(q > 0)) continue;
    const v = q * l.cost;
    if (l.orphan) { hidden += v; continue; } // the app shows no batch for it: in no total
    if (expiredOn(l.expiry, at)) expired += v; else value += v;
    oldRule += q * (products.get(l.productId)?.cost || 0); // before 1.5.1: all stock × the medicine's latest cost
  }
  return { value, expired, hidden, oldRule };
};
const vNow = valueAt('now', NOW), vThen = valueAt('then', FROM);

// ---- where the value went: movements in the window by type, at batch cost ----
const byType = new Map();
for (const m of moves) {
  if (!inWindow(m.date)) continue;
  const l = lots.get(keyOf(m));
  const t = byType.get(m.type) || { n: 0, qty: 0, value: 0, users: new Map() };
  t.n++; t.qty += Number(m.qty) || 0; t.value += (Number(m.qty) || 0) * l.cost;
  t.users.set(m.user || '?', (t.users.get(m.user || '?') || 0) + (Number(m.qty) || 0) * l.cost);
  byType.set(m.type, t);
}
// batches that crossed their expiry date in the window: their value left "inventory value" for "expired"
let expiryShift = 0; const expiredNow = [];
for (const l of lots.values()) {
  if (l.orphan || !l.expiry) continue;
  if (!expiredOn(l.expiry, FROM) && expiredOn(l.expiry, NOW) && l.now > 0) { expiryShift += l.now * l.cost; expiredNow.push(l); }
}

// ---- cost of sales vs the stock the sales took ----
const saleMoves = new Map(); // receipt → { qty, value }
for (const m of moves) if (m.type === 'Sale') { const s = saleMoves.get(m.ref) || { qty: 0, value: 0, n: 0 }; s.qty += -m.qty; s.value += -m.qty * costOf(m); s.n++; saleMoves.set(m.ref, s); }
const sales = (db.sales || []).filter((s) => inWindow(s.date));
let cogs = 0, cogsAtBatch = 0, revenue = 0; const saleIssues = [];
for (const s of sales) {
  const lines = s.items || [];
  const want = lines.reduce((a, i) => a + (i.alloc || []).reduce((b, x) => b + Number(x.qty || 0), 0), 0);
  cogs += lines.reduce((a, i) => a + Number(i.qty || 0) * Number(i.cost || 0), 0);
  revenue += Number(s.total || 0);
  const got = saleMoves.get(s.number) || { qty: 0, value: 0, n: 0 };
  cogsAtBatch += got.value;
  if (Math.abs(got.qty - want) > 1e-6) saleIssues.push({ number: s.number, date: s.date, cashier: s.cashier, want, got: got.qty, status: s.status });
}
const saleNumbers = new Set((db.sales || []).map((s) => s.number));
const orphanSaleMoves = moves.filter((m) => m.type === 'Sale' && inWindow(m.date) && !saleNumbers.has(m.ref));

// ---- deliveries vs the stock they added ----
const purMoves = new Map();
for (const m of moves) if (m.type === 'Purchase') purMoves.set(m.ref, (purMoves.get(m.ref) || 0) + Number(m.qty || 0));
const purIssues = [];
for (const p of (db.purchases || []).filter((x) => inWindow(x.date) || inWindow(x.receivedAt || x.date))) {
  const want = (p.items || []).reduce((a, i) => a + Number(i.qty || 0), 0);
  const got = (purMoves.get(p.invoice || p.number) || 0) + (p.invoice ? purMoves.get(p.number) || 0 : 0);
  if (!p.edits?.length && Math.abs(got - want) > 1e-6) purIssues.push({ number: p.number, invoice: p.invoice, date: p.date, want, got });
}

// ---- report ----
const out = [];
const say = (s = '') => out.push(s);
say(`RxPOS inventory check · ${file}`);
say(`Window: ${FROM.toISOString().slice(0, 16)} → ${NOW.toISOString().slice(0, 16)} UTC (${hours} h) · ${moves.length.toLocaleString()} movements, ${(db.batches || []).length.toLocaleString()} batches, ${(db.products || []).length.toLocaleString()} medicines`);
say();
say('INVENTORY VALUE (at cost, expired not included — the Dashboard / Inventory figure)');
say(`  ${hours} h ago: ${money(vThen.value)}   now: ${money(vNow.value)}   change: ${money(vNow.value - vThen.value)}`);
say(`  expired stock: ${money(vThen.expired)} → ${money(vNow.expired)}`);
say(`  the old Stock Valuation rule (before 1.5.1: all stock × latest medicine cost, expired included) would show ${money(vNow.oldRule)} now`);
say();
say('WHERE THE CHANGE CAME FROM');
let explained = 0;
for (const [type, t] of [...byType].sort((a, b) => a[1].value - b[1].value)) {
  explained += t.value;
  const who = [...t.users].sort((a, b) => a[1] - b[1]).slice(0, 3).map(([u, v]) => `${u} ${money(v)}`).join(', ');
  say(`  ${type.padEnd(24)} ${String(t.n).padStart(5)} movements  ${qtyf(t.qty).padStart(10)} units  ${money(t.value).padStart(14)}   (${who})`);
}
say(`  ${'Batches that expired'.padEnd(24)} ${String(expiredNow.length).padStart(5)} batches   ${''.padStart(10)}        ${money(-expiryShift).padStart(14)}   (moved to "expired", not lost)`);
const residual = (vNow.value - vThen.value) - (explained - 0) + expiryShift;
say(`  ${'Not explained'.padEnd(24)} ${''.padStart(5)}             ${''.padStart(10)}        ${money(residual).padStart(14)}   (movements on expired batches, or rounding)`);
say();
say('COST OF SALES vs STOCK TAKEN BY SALES');
say(`  ${sales.length} sales, ${money(revenue)} sold · cost of sales (sale lines × cost on the receipt): ${money(cogs)}`);
say(`  stock the sales took, at batch cost: ${money(cogsAtBatch)}  (differs when a batch cost differs from the medicine's cost)`);
say(`  sales whose stock movements don't match the sale: ${saleIssues.length}`);
for (const i of saleIssues.slice(0, 30)) say(`    ${i.number} ${i.date.slice(0, 16)} ${i.cashier || ''} [${i.status}]: sale took ${qtyf(i.want)} units, movements took ${qtyf(i.got)}${i.got > i.want ? '  ← TAKEN TWICE' : i.got < i.want ? '  ← NOT TAKEN' : ''}`);
say(`  stock movements marked "Sale" with no matching sale: ${orphanSaleMoves.length}${orphanSaleMoves.length ? ' (' + money(orphanSaleMoves.reduce((a, m) => a - m.qty * costOf(m), 0)) + ')' : ''}`);
say();
say('DELIVERIES vs STOCK ADDED');
say(`  deliveries in the window whose stock movements don't match: ${purIssues.length}`);
for (const i of purIssues.slice(0, 30)) say(`    ${i.number} ${i.invoice || ''} ${String(i.date).slice(0, 16)}: delivery ${qtyf(i.want)} units, added ${qtyf(i.got)}`);
say();
say('STOCK IN NO TOTAL (record missing: would look like stock that vanished)');
const orphans = [...lots.values()].filter((l) => l.orphan && l.now !== 0);
say(`  ${orphans.length} batches · ${money(vNow.hidden)} at cost`);
for (const l of orphans.slice(0, 30)) say(`    ${name(l.productId)} · ${l.orphan} · ${qtyf(l.now)} units`);
const negative = [...lots.values()].filter((l) => !l.orphan && l.now < -1e-6);
say(`  batches below zero: ${negative.length}${negative.length ? ' · ' + negative.slice(0, 10).map((l) => `${name(l.productId)} ${qtyf(l.now)}`).join('; ') : ''}`);
say();
say('NEWLY EXPIRED IN THE WINDOW (largest first)');
for (const l of expiredNow.sort((a, b) => b.now * b.cost - a.now * a.cost).slice(0, 15)) say(`  ${name(l.productId)} · expiry ${l.expiry} · ${qtyf(l.now)} units · ${money(l.now * l.cost)}`);
console.log(out.join('\n'));

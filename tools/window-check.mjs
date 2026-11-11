// History window check on REAL pharmacies (docs/SYNC-HISTORY-WINDOW.md, "once the equality checks on real pharmacies
// pass"): for each pharmacy and window start W, builds the device a window would leave (the records keeps() keeps,
// plus the brought-forward figures from the entries before W, as the cloud's /api/balances sums them) and compares
// every balance with the whole-history figure: stock (per batch, per medicine, totals), client, supplier and insurer
// debts, cash and bank accounts, and loans. Read-only. Prints ids and figures only, never names.
//   RXPOS_API=… OWNER_KEY=… node tools/window-check.mjs [slug…] [--months 1,6,12,24]
import { build } from 'esbuild';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { fetchAll } from './stock-audit.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rxpos-wcheck-'));
const entry = path.join(dir, 'entry.js');
fs.writeFileSync(entry, `export * from ${JSON.stringify(path.join(root, 'src/balances.js'))};
export { keeps, WINDOWED } from ${JSON.stringify(path.join(root, 'src/historywindow.js'))};
export { customerBalance, supplierBalance } from ${JSON.stringify(path.join(root, 'src/store.jsx'))};
export { accountBalances, loanBalance } from ${JSON.stringify(path.join(root, 'src/finance.js'))};
export { insurerBalance } from ${JSON.stringify(path.join(root, 'src/insurance.js'))};
export { createStockIndexer } from ${JSON.stringify(path.join(root, 'src/stockindex.js'))};`);
const out = await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', write: false, loader: { '.js': 'jsx' }, jsx: 'automatic', define: { 'import.meta.env.DEV': 'false' }, logLevel: 'error' });
fs.writeFileSync(path.join(dir, 'b.mjs'), out.outputFiles[0].text);
const B = await import(pathToFileURL(path.join(dir, 'b.mjs')).href);

// the same as windowStart in src/sync.js: the first day of the month `m` months back
const windowStart = (m, now = new Date()) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - m, 1)).toISOString().slice(0, 10);
const close = (a, b) => Math.abs((Number(a) || 0) - (Number(b) || 0)) < 0.01;
const TABLES = ['products', 'batches', 'movements', 'sales', 'purchases', 'supplierReturns', 'expenses', 'payments', 'loans', 'bankTx', 'customers', 'suppliers', 'insurers', 'banks', 'transfers'];

/** Pure: compare every balance on a windowed device with the whole history. Returns { checked, mismatches[], kept, total }. */
export function checkWindow(full, W) {
  const bf = B.broughtForward(full, W);
  const stock = [];
  for (const mv of full.movements) if (String(mv.date) < W) {
    const br = mv.branchId || 'main', b = mv.batchId || 'lb-' + mv.productId;
    const x = stock.find((y) => y.branch === br && y.batch === b && y.product === mv.productId);
    if (x) x.qty += Number(mv.qty) || 0; else stock.push({ branch: br, batch: b, product: mv.productId, qty: Number(mv.qty) || 0 });
  }
  const win = { W, stock, ...Object.fromEntries(['customer', 'supplier', 'insurer', 'account', 'loan'].map((k) => [k, Object.fromEntries(bf[k])])) };
  const device = { ...full, _window: win };
  let kept = 0, total = 0;
  for (const t of Object.keys(full)) if (Array.isArray(full[t]) && B.WINDOWED.has(t)) { device[t] = full[t].filter((r) => B.keeps(t, r, W)); kept += device[t].length; total += full[t].length; }
  const mism = []; let checked = 0;
  const want = (name, a, b) => { checked++; if (!close(a, b)) mism.push(`${name}: window ${Math.round(a * 100) / 100} vs whole ${Math.round(b * 100) / 100}`); };
  for (const c of full.customers) want('client ' + c.id, B.customerBalance(device, c.id), B.customerBalance(full, c.id));
  for (const c of full.suppliers) want('supplier ' + c.id, B.supplierBalance(device, c.id), B.supplierBalance(full, c.id));
  for (const c of full.insurers) want('insurer ' + c.id, B.insurerBalance(device.sales, device.payments, c.id, B.windowSums(device)), B.insurerBalance(full.sales, full.payments, c.id));
  const a1 = B.accountBalances(device), a2 = B.accountBalances(full);
  for (const k of new Set([...Object.keys(a1), ...Object.keys(a2)])) want('account ' + k, a1[k], a2[k]);
  for (const l of full.loans) want('loan ' + l.id, B.loanBalance(device, l).repaid, B.loanBalance(full, l).repaid);
  const i1 = B.createStockIndexer()(device.movements, win), i2 = B.createStockIndexer()(full.movements);
  for (const [k, v] of i2.batch) want('stock ' + k, i1.batch.get(k), v);
  for (const [k, v] of i2.product) want('stock medicine ' + k, i1.product.get(k), v);
  for (const [k, v] of i2.total) want('stock total ' + k, i1.total.get(k), v);
  for (const [k, v] of i1.batch) if (!i2.batch.has(k)) want('stock (extra) ' + k, v, 0);
  return { checked, mismatches: mism, kept, total };
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const args = process.argv.slice(2);
  const mi = args.indexOf('--months');
  const months = (mi >= 0 ? args[mi + 1] : '1,6,12,24').split(',').map(Number);
  const only = args.filter((a, n) => !a.startsWith('--') && n !== mi + 1);
  const data = await fetchAll();
  let allOk = true;
  for (const t of data.tenants) {
    if (only.length && !only.includes(t.slug) && !only.includes(t.id)) continue;
    // inputFor keeps a few tables; take every live table of this pharmacy
    const full = Object.fromEntries(TABLES.map((k) => [k, []]));
    for (const r of data.rows) {
      if (r.tenant !== t.id || r.deleted || r.rec == null) continue;
      let rec; try { rec = typeof r.rec === 'string' ? JSON.parse(r.rec) : r.rec; } catch { continue; }
      if (!rec) continue; rec.id ??= r.id; (full[r.t] ||= []).push(rec);
    }
    console.log(`\n### ${t.name} (/${t.slug || t.id})`);
    for (const m of months) {
      const W = windowStart(m);
      const res = checkWindow(full, W);
      const ok = !res.mismatches.length; allOk &&= ok;
      console.log(`  ${String(m).padStart(2)} months (from ${W.slice(0, 10)}): ${ok ? 'EQUAL' : 'DIFFERENT'} — ${res.checked} balances checked, ${res.mismatches.length} differ; device keeps ${res.kept} of ${res.total} history records (${res.total ? Math.round(100 * res.kept / res.total) : 100}%)`);
      for (const x of res.mismatches.slice(0, 12)) console.log('      ' + x);
    }
  }
  console.log(allOk ? '\nAll balances equal with every window.' : '\nSome balances differ: do NOT turn the window on until fixed.');
  process.exit(allOk ? 0 : 1);
}

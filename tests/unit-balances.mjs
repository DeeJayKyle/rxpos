// src/balances.js (faster sync, stage 4): every balance as a sum of dated entries, exactly the screens' own figures,
// on generated pharmacies (fictional data only); and brought forward at a window start + the entries from it = the
// whole. Also writes nothing.   node unit-balances.mjs
import { build } from 'esbuild';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

let pass = 0, fail = 0;
const check = (name, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${x !== '' ? '  ' + x : ''}`); };
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// store.jsx is JSX: bundle what is needed for node
const entry = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rxpos-bal-')), 'entry.js');
fs.writeFileSync(entry, `export * from ${JSON.stringify(path.join(root, 'src/balances.js'))};
export { customerBalance, supplierBalance } from ${JSON.stringify(path.join(root, 'src/store.jsx'))};
export { accountBalances, loanBalance } from ${JSON.stringify(path.join(root, 'src/finance.js'))};
export { insurerBalance } from ${JSON.stringify(path.join(root, 'src/insurance.js'))};
export { createStockIndexer } from ${JSON.stringify(path.join(root, 'src/stockindex.js'))};`);
const out = await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', write: false, loader: { '.js': 'jsx' }, jsx: 'automatic', define: { 'import.meta.env.DEV': 'false' }, logLevel: 'error' });
const file = entry.replace(/entry\.js$/, 'b.mjs');
fs.writeFileSync(file, out.outputFiles[0].text);
const B = await import(pathToFileURL(file).href);

// a small seeded random generator, so a failure can be repeated
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); }

function pharmacy(seed) {
  const r = rng(seed), pick = (a) => a[Math.floor(r() * a.length)], amt = () => Math.round(r() * 50) * 500;
  const day = () => new Date(Date.UTC(2024, 0, 1) + Math.floor(r() * 900) * 864e5).toISOString();
  const banks = [{ id: 'cash-drawer', opening: 10000 }, { id: 'bank-1', opening: 0 }, { id: 'momo', opening: 500 }];
  const customers = ['c1', 'c2', 'c3', 'walk-in'], suppliers = ['s1', 's2'], insurers = ['i1', 'i2'];
  const db = { banks, customers: customers.map((id) => ({ id })), suppliers: suppliers.map((id) => ({ id })), insurers: insurers.map((id) => ({ id })),
    movements: [], sales: [], purchases: [], supplierReturns: [], expenses: [], payments: [], loans: [], bankTx: [], expenseCategories: [] };
  for (let i = 0; i < 300; i++) db.movements.push({ id: 'm' + i, productId: 'p' + (i % 7), batchId: r() < 0.2 ? undefined : 'b' + (i % 11), branchId: pick(['main', 'b2', undefined]), qty: Math.round((r() - 0.3) * 40), date: day() });
  for (let i = 0; i < 200; i++) {
    const total = amt() + 500, insured = r() < 0.2;
    const s = { id: 's' + i, total, paid: r() < 0.3 ? Math.round(total * r()) : total, date: day(), customerId: pick([...customers, undefined]), bankId: pick(['cash-drawer', 'bank-1', 'momo', undefined]), status: 'completed' };
    if (insured) { s.insurance = { insurerId: pick(insurers), share: Math.round(total * 0.6) }; s.paid = total - s.insurance.share; }
    if (r() < 0.1) { s.status = 'refunded'; s.refundedAt = day(); }
    if (r() < 0.05) s.imported = true;
    if (r() < 0.1) delete s.paid;
    db.sales.push(s);
  }
  for (let i = 0; i < 60; i++) { const total = amt() + 1000; db.purchases.push({ id: 'pu' + i, supplierId: pick(suppliers), total, paid: r() < 0.5 ? Math.round(total * r()) : undefined, date: day(), bankId: pick(['cash-drawer', 'bank-1', undefined]), imported: r() < 0.05 }); }
  for (let i = 0; i < 15; i++) db.supplierReturns.push({ id: 'sr' + i, supplierId: pick(suppliers), total: amt(), settle: pick(['credit', 'cash', 'replace']), date: day(), bankId: pick(['cash-drawer', 'bank-1']) });
  for (let i = 0; i < 50; i++) db.expenses.push({ id: 'e' + i, amount: amt(), date: day(), bankId: pick(['cash-drawer', 'bank-1', undefined]) });
  db.loans.push({ id: 'l1', lender: 'Sample Bank', amount: 1000000, interestRate: 10, date: day(), bankId: 'bank-1' });
  for (let i = 0; i < 80; i++) { const kind = pick(['customer', 'supplier', 'insurer', 'loan']); db.payments.push({ id: 'pay' + i, kind, partyId: kind === 'customer' ? pick(customers) : kind === 'supplier' ? pick(suppliers) : kind === 'insurer' ? pick(insurers) : 'l1', amount: amt(), date: day(), bankId: pick(['cash-drawer', 'bank-1', 'momo', undefined]) }); }
  for (let i = 0; i < 20; i++) db.bankTx.push({ id: 'bt' + i, type: pick(['Deposit', 'Withdrawal', 'Transfer']), bankId: pick(['bank-1', 'momo']), fromId: 'momo', toId: 'bank-1', amount: amt(), date: day() });
  return db;
}

const close = (a, b) => Math.abs((a || 0) - (b || 0)) < 1e-6;
let worst = '';
function same(name, seed, a, b) { if (!close(a, b) && !worst) worst = `${name} seed ${seed}: ${a} vs ${b}`; return close(a, b); }

let ok = { stock: true, customer: true, supplier: true, insurer: true, account: true, loan: true, window: true };
for (let seed = 1; seed <= 40; seed++) {
  const db = pharmacy(seed);
  const s = B.sumEntries(db);
  const idx = B.createStockIndexer()(db.movements);
  for (const [k, v] of idx.batch) ok.stock &&= same('stock ' + k, seed, s.stock.get(k), v);
  for (const c of db.customers) ok.customer &&= same('customer ' + c.id, seed, s.customer.get(c.id), B.customerBalance(db, c.id));
  for (const c of db.suppliers) ok.supplier &&= same('supplier ' + c.id, seed, s.supplier.get(c.id), B.supplierBalance(db, c.id));
  for (const c of db.insurers) ok.insurer &&= same('insurer ' + c.id, seed, s.insurer.get(c.id), B.insurerBalance(db.sales, db.payments, c.id));
  const acc = B.accountBalances(db);
  for (const b of db.banks) ok.account &&= same('account ' + b.id, seed, (Number(b.opening) || 0) + (s.account.get(b.id) || 0), acc[b.id]);
  ok.loan &&= same('loan', seed, s.loan.get('l1'), B.loanBalance(db, db.loans[0]).repaid);
  // a window: brought forward before W + the entries from W = the whole, for every kind and key
  for (const W of ['2024-06-01', '2025-01-15T00:00:00.000Z', '2026-12-31']) {
    const bf = B.broughtForward(db, W), recent = B.sumEntries(db, (e) => String(e.date) >= W);
    for (const kind of Object.keys(s)) for (const [k, v] of s[kind]) ok.window &&= same(`window ${W} ${kind} ${k}`, seed, (bf[kind].get(k) || 0) + (recent[kind].get(k) || 0), v);
  }
}
check('stock per branch and batch = the sum of movements (stockindex.js)', ok.stock, worst);
check('what each client owes = customerBalance', ok.customer, worst);
check('what we owe each supplier = supplierBalance', ok.supplier, worst);
check('what each insurer owes = insurerBalance', ok.insurer, worst);
check('each cash and bank account = accountBalances (the money ledger)', ok.account, worst);
check('a loan\'s repayments = loanBalance', ok.loan, worst);
check('brought forward at W + the entries from W = the whole, for every balance', ok.window, worst);
// a device keeping recent history: it holds every record with an entry from W (plus some older ones: open items, or
// an old record that arrived later) and the cloud's brought-forward figures; every balance must be exactly the
// whole-history figure (the windowed functions in store.jsx, finance.js, insurance.js and stockindex.js)
let dev = true, devWorst = '';
for (let seed = 41; seed <= 70; seed++) {
  const full = pharmacy(seed), r = rng(seed * 7);
  for (const W of ['2024-09-01T00:00:00.000Z', '2025-06-01T00:00:00.000Z']) {
    const bf = B.broughtForward(full, W);
    const stock = [];
    for (const mv of full.movements) if (String(mv.date) < W) { const br = mv.branchId || 'main', b = mv.batchId || 'lb-' + mv.productId; const x = stock.find((y) => y.branch === br && y.batch === b && y.product === mv.productId); if (x) x.qty += mv.qty; else stock.push({ branch: br, batch: b, product: mv.productId, qty: mv.qty }); }
    const win = { W, stock, ...Object.fromEntries(['customer', 'supplier', 'insurer', 'account', 'loan'].map((k) => [k, Object.fromEntries(bf[k])])) };
    const device = { ...full, _window: win };
    for (const t of B.ENTRY_TABLES.filter((x) => x !== 'loans')) device[t] = full[t].filter((rec) => B.hasEntryFrom(t, rec, W) || r() < 0.15);
    const want = (name, a, b) => { if (!close(a, b)) { dev = false; devWorst ||= `${name} seed ${seed} ${W}: ${a} vs ${b}`; } };
    for (const c of full.customers) want('customer ' + c.id, B.customerBalance(device, c.id), B.customerBalance(full, c.id));
    for (const c of full.suppliers) want('supplier ' + c.id, B.supplierBalance(device, c.id), B.supplierBalance(full, c.id));
    for (const c of full.insurers) want('insurer ' + c.id, B.insurerBalance(device.sales, device.payments, c.id, B.windowSums(device)), B.insurerBalance(full.sales, full.payments, c.id));
    const a1 = B.accountBalances(device), a2 = B.accountBalances(full);
    for (const b of full.banks) want('account ' + b.id, a1[b.id], a2[b.id]);
    want('loan', B.loanBalance(device, device.loans[0]).repaid, B.loanBalance(full, full.loans[0]).repaid);
    const i1 = B.createStockIndexer()(device.movements, win), i2 = B.createStockIndexer()(full.movements);
    for (const [k, v] of i2.batch) want('stock ' + k, i1.batch.get(k), v);
    for (const [k, v] of i2.product) want('stock product ' + k, i1.product.get(k), v);
    for (const [k, v] of i2.total) want('stock total ' + k, i1.total.get(k), v);
  }
}
check('a device with a window and brought-forward figures shows exactly the whole-history balances (every kind)', dev, devWorst);
check('an old sale refunded later: its sale entry is old, its refund entry new', (() => {
  const e = B.entriesOf('sales', { id: 'x', total: 1000, paid: 1000, date: '2024-01-01', status: 'refunded', refundedAt: '2026-11-01', customerId: 'walk-in' });
  return e.some((x) => x.kind === 'account' && x.amount === 1000 && x.date === '2024-01-01') && e.some((x) => x.kind === 'account' && x.amount === -1000 && x.date === '2026-11-01');
})());
check('a deleted record makes no entries', B.entriesOf('sales', { id: 'x', total: 5, deleted: true }).length === 0);

// the shared case file (tests/balance-cases.json) the Flutter app and the cloud check: records and the entries they
// make. `node unit-balances.mjs --write` makes it again from these rules; otherwise it must match them.
const casesFile = path.join(root, 'tests', 'balance-cases.json');
const sample = pharmacy(7);
const records = [];
for (const t of B.ENTRY_TABLES) for (const r of (sample[t] || []).slice(0, t === 'movements' || t === 'sales' ? 40 : 12)) records.push({ t, rec: r });
records.push({ t: 'sales', rec: { id: 'edge-refund', total: 1000, paid: 1000, date: '2024-01-01T08:00:00.000Z', status: 'refunded', refundedAt: '2026-11-01T08:00:00.000Z', customerId: 'c1' } });
records.push({ t: 'sales', rec: { id: 'edge-deleted', total: 5, deleted: true } });
records.push({ t: 'payments', rec: { id: 'edge-other', kind: 'other', partyId: 'x', amount: 300, date: '2025-01-01' } });
records.push({ t: 'movements', rec: { id: 'edge-legacy', productId: 'p9', qty: 5, date: '2025-01-01' } });
const cases = { about: 'src/balances.js entriesOf: the entries each record makes (faster sync, stage 4). Made by tests/unit-balances.mjs --write.', cases: records.map(({ t, rec }) => ({ t, rec, entries: B.entriesOf(t, rec) })) };
if (process.argv.includes('--write')) fs.writeFileSync(casesFile, JSON.stringify(cases, null, 1) + '\n');
const kept = JSON.parse(fs.readFileSync(casesFile, 'utf8'));
check('tests/balance-cases.json matches these rules (shared with the Flutter app)', JSON.stringify(kept.cases.map((c) => B.entriesOf(c.t, c.rec))) === JSON.stringify(kept.cases.map((c) => c.entries)), kept.cases.length + ' records');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

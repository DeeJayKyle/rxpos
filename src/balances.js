// Every balance in RxPOS as a sum of dated entries (faster sync, stage 4: docs/SYNC-HISTORY-WINDOW.md).
//
// Stock is the sum of stock movements; what a client, supplier or insurer owes, each cash or bank account and each
// loan are sums of what sales, purchases, payments, expenses, returns, loans and bank transfers put on them. This
// module lists, for one record, the entries it makes: { kind, key, date, amount } (stock also carries product and
// branch). The figures are exactly those of the screens' own functions (stockindex.js, store.jsx customerBalance /
// supplierBalance, insurance.js insurerBalance, finance.js ledger / accountBalances / loanBalance); tests/unit-
// balances.mjs checks that on generated pharmacies, and tests/balance-cases.json holds the same rules for the cloud
// and the Flutter app.
//
// With recent history on a device (a window starting at W), the cloud adds up the entries dated before W ("brought
// forward") and the device adds the entries dated from W in the records it holds. Splitting by the date of each
// ENTRY, not of each record, keeps every balance exact: an old sale refunded today has its sale entry before W and
// its refund entry after.
import { clientOwes, insurerShare } from './insurance.js';

export const CASH = 'cash-drawer'; // finance.js CASH
const n = (x) => Number(x) || 0;
const acct = (x) => x || CASH;
const MAIN = 'main'; // store.jsx MAIN_BRANCH

/** The tables whose records make entries */
export const ENTRY_TABLES = ['movements', 'sales', 'purchases', 'supplierReturns', 'expenses', 'payments', 'loans', 'bankTx'];

/** The entries one record of table t makes (an empty list for a deleted record or a table that makes none) */
export function entriesOf(t, r) {
  if (!r || r.deleted) return [];
  const out = [];
  const money = (account, date, amount) => { if (amount) out.push({ kind: 'account', key: acct(account), date, amount }); };
  switch (t) {
    case 'movements': {
      const branch = r.branchId || MAIN;
      out.push({ kind: 'stock', key: branch + '|' + (r.batchId || 'lb-' + r.productId), product: r.productId, branch, date: r.date || '', amount: n(r.qty) });
      break;
    }
    case 'sales': {
      if (r.customerId != null && r.customerId !== '') { const owes = clientOwes(r); if (owes) out.push({ kind: 'customer', key: r.customerId, date: r.date || '', amount: owes }); }
      const share = r.insurance?.insurerId ? insurerShare(r) : 0;
      if (share) out.push({ kind: 'insurer', key: r.insurance.insurerId, date: r.date || '', amount: share });
      if (!r.imported) {
        const paid = r.paid ?? r.total;
        if (paid > 0) money(r.bankId, r.date || '', n(paid));
        if (r.status === 'refunded') money(r.bankId, r.refundedAt || r.date || '', -n(paid));
      }
      break;
    }
    case 'purchases': {
      const owed = n(r.total) - n(r.paid ?? r.total);
      if (owed && r.supplierId) out.push({ kind: 'supplier', key: r.supplierId, date: r.date || '', amount: owed });
      if (!r.imported) { const paid = r.paid ?? r.total; if (paid > 0) money(r.bankId, r.date || '', -n(paid)); }
      break;
    }
    case 'supplierReturns': {
      if (r.settle === 'credit' && r.supplierId && n(r.total)) out.push({ kind: 'supplier', key: r.supplierId, date: r.date || '', amount: -n(r.total) });
      if (r.settle === 'cash' && r.total > 0) money(r.bankId, r.date || '', n(r.total));
      break;
    }
    case 'expenses': money(r.bankId, r.date || '', -n(r.amount)); break;
    case 'payments': {
      const a = n(r.amount);
      if (r.kind === 'customer' || r.kind === 'supplier' || r.kind === 'insurer') { if (a) out.push({ kind: r.kind, key: r.partyId, date: r.date || '', amount: -a }); }
      else if (r.kind === 'loan' && a) out.push({ kind: 'loan', key: r.partyId, date: r.date || '', amount: a }); // repaid
      money(r.bankId, r.date || '', r.kind === 'customer' || r.kind === 'insurer' ? a : -a);
      break;
    }
    case 'loans': money(r.bankId, r.date || '', n(r.amount)); break;
    case 'bankTx': {
      const from = r.type === 'Deposit' ? CASH : r.fromId || r.bankId;
      const to = r.type === 'Withdrawal' ? CASH : r.type === 'Deposit' ? r.bankId : r.toId;
      money(from, r.date || '', -n(r.amount));
      money(to, r.date || '', n(r.amount));
      break;
    }
    default: break;
  }
  return out;
}

/** Totals by kind and key: { stock: Map, customer: Map, … }; `keep(entry)` chooses which entries count */
export function sumEntries(db, keep = () => true) {
  const sums = { stock: new Map(), customer: new Map(), supplier: new Map(), insurer: new Map(), account: new Map(), loan: new Map() };
  for (const t of ENTRY_TABLES) {
    for (const r of db[t] || []) {
      for (const e of entriesOf(t, r)) {
        if (!keep(e)) continue;
        const m = sums[e.kind];
        m.set(e.key, (m.get(e.key) || 0) + e.amount);
      }
    }
  }
  return sums;
}

/** Brought-forward figures at window start W: the entries dated before W, by kind and key (what the cloud sends) */
export const broughtForward = (db, W) => sumEntries(db, (e) => String(e.date) < W);

// ---- on a device keeping recent history (db._window = { W, asOf, stock: [...], customer: {id: amount}, … }) ----
const windowCache = new WeakMap();
/**
 * With a window: every money balance = the cloud's brought-forward figure + the entries from W of the records this
 * device holds (cached per database object). Null without a window: the screens' own sums apply, as before.
 * The device must hold every record with an entry from W (an old sale refunded since, for example): the cloud's
 * download sends them (docs/SYNC-HISTORY-WINDOW.md).
 */
export function windowSums(db) {
  const win = db?._window;
  if (!win?.W) return null;
  const kept = windowCache.get(db);
  if (kept && kept.win === win) return kept.sums;
  const sums = sumEntries(db, (e) => String(e.date) >= win.W);
  for (const kind of ['customer', 'supplier', 'insurer', 'account', 'loan']) {
    for (const [k, v] of Object.entries(win[kind] || {})) sums[kind].set(k, (sums[kind].get(k) || 0) + Number(v || 0));
  }
  windowCache.set(db, { win, sums });
  return sums;
}

/** Does this record make any entry dated from W (so a device with that window must hold it)? */
export const hasEntryFrom = (t, r, W) => entriesOf(t, r).some((e) => String(e.date) >= W);

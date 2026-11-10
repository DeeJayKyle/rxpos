// Server-side write policy (review 1.1, workplan step 2).
//
// Before this, the cloud checked permissions only for users, roles, settings and payroll: any signed-in staff token
// could create, change or delete any other record through /api/sync (a cashier could change a price or delete a sale).
// `decide()` says whether one change from a staff device may be applied. It is pure: the caller passes the stored
// record (`old`, null when there is none) and `can(perm)`, which answers for the person's role. The pharmacy key
// (owner console / enrolment) bypasses it in worker/index.js, and an administrator's `can` is always true.
//
// The permission lists mirror what each screen of BOTH apps (src/pages, rxpos_flutter/lib/features) already requires
// before it writes the table, so nothing the apps do legitimately is refused. Tables not listed here (chat, calendar,
// drafts, temperature log, audit, the controlled register…) carry no money or stock and stay open to any staff member,
// as before; audit, movements and controlled stay append-only (worker/index.js INSERT_ONLY).

const SELL = ['pos.sell', 'pos.wholesale'];

/** table → permissions for creating/updating (`write`) and deleting (`delete`); any one of the list is enough */
export const TABLE_RULES = {
  products: { write: ['medicines.manage', 'stock.receive', 'inventory.edit', 'purchases.edit'], delete: ['medicines.manage'] },
  formulations: { write: ['medicines.manage'], delete: ['medicines.manage'] },
  catalogHidden: { write: ['medicines.manage'], delete: ['medicines.manage'] },
  batches: { write: ['stock.receive', 'purchases.edit', 'inventory.edit', 'medicines.manage', 'stock.adjust'], delete: ['inventory.edit', 'purchases.edit'] },
  purchaseOrders: { write: ['stock.receive', 'purchases.edit'], delete: ['stock.receive'] },
  supplierReturns: { write: ['stock.receive', 'stock.adjust'], delete: ['stock.adjust'] },
  stockCounts: { write: ['stock.count', 'stock.adjust'], delete: ['stock.adjust'] },
  countItems: { write: ['stock.count', 'stock.adjust'], delete: ['stock.count', 'stock.adjust'] },
  transfers: { write: ['transfers'], delete: ['transfers'] },
  customers: { write: ['customers', 'reminders'], delete: ['customers'] },
  insurers: { write: ['customers', 'finance'], delete: ['finance'] }, // step 22: insurers and their schemes
  suppliers: { write: ['suppliers', 'stock.receive'], delete: ['suppliers'] },
  prescriptions: { write: ['prescriptions'], delete: ['prescriptions'] },
  proformas: { write: ['proformas', ...SELL], delete: ['proformas'] }, // the till marks a proforma "Converted"
  shifts: { write: ['shifts', 'shifts.all'], delete: ['shifts.all'] },
  expenses: { write: ['finance', 'payroll'], delete: ['finance'] }, // a payroll run books the salaries as expenses
  expenseCategories: { write: ['finance', 'payroll'], delete: ['finance'] },
  banks: { write: ['finance'], delete: ['finance'] },
  bankTx: { write: ['finance'], delete: ['finance'] },
  loans: { write: ['finance'], delete: ['finance'] },
  anomalies: { write: ['audit'], delete: ['audit'] }, // step 3 sale findings: marking one checked
};

/** Stock movement type → who may record it. Any other type needs stock.adjust. */
export const MOVEMENT_RULES = {
  Sale: SELL,
  'Sale edit': ['sales.edit'],
  Refund: ['sales.refund'],
  Purchase: ['stock.receive'],
  'Purchase edit': ['purchases.edit'],
  'Opening stock': ['medicines.manage', 'stock.receive', 'inventory.edit'],
  'Inventory edit': ['inventory.edit'],
  'Expired write-off': ['stock.adjust'],
  'Stock count': ['stock.adjust'],
  Adjustment: ['stock.adjust'], // the Adjust stock dialog in both apps
  'Supplier return': ['stock.receive', 'stock.adjust'],
  'Transfer in': ['transfers'],
  'Transfer out': ['transfers'],
};

/** Tables whose decision depends on the stored record: worker/index.js fetches it only for these */
export const NEEDS_OLD = new Set(['sales', 'purchases', 'payments']);

const num = (v) => Number(v) || 0;
/** What a sale is worth and to whom: two records with the same money view are the same sale for permission purposes */
export function moneyView(s) {
  return JSON.stringify([
    num(s?.subtotal), num(s?.discount), num(s?.tax), num(s?.total), num(s?.paid), String(s?.payment ?? ''),
    String(s?.customerId ?? ''), String(s?.type ?? ''), String(s?.branchId ?? ''),
    (Array.isArray(s?.items) ? s.items : []).map((i) => [String(i?.id ?? ''), num(i?.qty), num(i?.price)]),
    // step 22: who is billed what (only on insured sales, so the view of every other sale is as it was)
    ...(s?.insurance ? [[String(s.insurance.insurerId ?? ''), num(s.insurance.share)]] : []),
  ]);
}
/** A refund changes only the status (to refunded) and who/when; the money stays exactly as it was */
export const isRefundOnly = (old, rec) => !!old && !!rec && old.status !== 'refunded' && rec.status === 'refunded' && moneyView(old) === moneyView(rec);
/** Nothing that matters changed (a re-send, or an older app pushing the same sale again) */
const unchanged = (old, rec) => !!old && !!rec && moneyView(old) === moneyView(rec) && (old.status ?? '') === (rec.status ?? '');

const anyOf = async (can, perms) => { for (const p of perms) if (await can(p)) return true; return false; };

/**
 * May this change be applied?  ch: { t, id, rec?, deleted? } · old: stored record or null · role: the person's role ·
 * can(perm) → boolean | Promise<boolean>.  Returns { ok: true } or { ok: false, need } (need = what was missing).
 */
export async function decide(ch, old, role, can) {
  const { t, rec, deleted } = ch;
  if (t === 'sales') {
    if (deleted) return role === 'admin' ? { ok: true } : { ok: false, need: 'admin' }; // owner's choice: admins only
    if (!old) return (await anyOf(can, SELL)) ? { ok: true } : { ok: false, need: SELL.join('|') };
    if (await can('sales.edit')) return { ok: true };
    if (isRefundOnly(old, rec) && (await can('sales.refund'))) return { ok: true };
    if (unchanged(old, rec) && (await anyOf(can, SELL))) return { ok: true };
    return { ok: false, need: isRefundOnly(old, rec) ? 'sales.refund' : 'sales.edit' };
  }
  if (t === 'dayCloses') {
    // step 18: closing a day needs "Close the day"; reopening one (or removing a close) needs an administrator
    if (deleted || rec?.open === true) return role === 'admin' ? { ok: true } : { ok: false, need: 'admin' };
    return (await can('day.close')) ? { ok: true } : { ok: false, need: 'day.close' };
  }
  if (t === 'purchases') {
    const perms = deleted || old ? ['purchases.edit'] : ['stock.receive'];
    return (await anyOf(can, perms)) ? { ok: true } : { ok: false, need: perms.join('|') };
  }
  if (t === 'payments') {
    // a debt payment can be recorded from Finance or from the customer/supplier page; changing or removing one is finance
    const perms = deleted || old ? ['finance'] : ['finance', 'customers', 'suppliers'];
    return (await anyOf(can, perms)) ? { ok: true } : { ok: false, need: perms.join('|') };
  }
  if (t === 'movements') {
    if (deleted) return { ok: true }; // refused anyway as append-only, with its own reason
    const perms = MOVEMENT_RULES[rec?.type] || ['stock.adjust'];
    return (await anyOf(can, perms)) ? { ok: true } : { ok: false, need: perms.join('|') };
  }
  const rule = TABLE_RULES[t];
  if (!rule) return { ok: true };
  const perms = deleted ? rule.delete : rule.write;
  return (await anyOf(can, perms)) ? { ok: true } : { ok: false, need: perms.join('|') };
}

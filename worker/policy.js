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
  fiscal: { write: [], delete: [] }, // URA EFRIS fiscal receipts: written by the cloud only (worker/efris.js), never by a device
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
  'Unit change': ['stock.adjust'], // Selling units → Change unit of issue (src/packs.js): stock re-counted in a smaller unit
  'Supplier return': ['stock.receive', 'stock.adjust'],
  'Transfer in': ['transfers'],
  'Transfer out': ['transfers'],
};

/** Tables whose decision depends on the stored record: worker/index.js fetches it only for these */
export const NEEDS_OLD = new Set(['sales', 'purchases', 'payments', 'proformas', 'dayCloses']);

// 2026-11 audit: every table the apps sync (src/store.jsx TABLES, rxpos_flutter record_store.dart syncedTables), plus
// `settings` and the old `controlled` register. A staff device writing any other name is refused (a made-up table was
// stored and sent to every device before). The pharmacy key (owner console, import tools) is not limited by this.
export const KNOWN_TABLES = new Set([
  'products', 'formulations', 'customers', 'suppliers', 'sales', 'proformas', 'purchases', 'movements',
  'prescriptions', 'expenses', 'expenseCategories', 'banks', 'bankTx', 'loans', 'payments', 'users',
  'batches', 'branches', 'transfers', 'audit', 'purchaseOrders', 'roles', 'messages', 'shifts', 'license', 'events', 'tempLogs',
  'catalogHidden', 'quizResults', 'stockCounts', 'countItems', 'supplierReturns', 'chatMarks', 'chatPins', 'chatReads', 'drafts',
  'anomalies', 'dayCloses', 'counters', 'insurers', 'employees', 'attendance', 'salaryAdvances', 'payrolls', 'reportSchedules',
  'notes', 'fiscal', 'settings', 'controlled',
]);

// 2026-11 audit: who RECEIVES which records. Before, every staff role downloaded every table except payroll and the
// sale checks, so a cashier's device held all expenses, bank transactions, loans, deliveries and the audit log even
// though no screen of theirs shows them. Each group lists the permissions of every screen (both apps) that reads those
// tables; a role with any one of them receives the group. Tables not listed (medicines, stock, sales, clients,
// payments, insurers…) are what selling, stock and debts need offline, and stay with everyone.
// `code` goes into the view key, which keys the cloud's ready-made download chunks (worker/snapshot.js).
export const READ_GROUPS = [
  { code: 'h', tables: ['employees', 'attendance', 'salaryAdvances', 'payrolls'], perms: ['payroll'] },
  { code: 'c', tables: ['anomalies'], perms: ['audit'] },
  // Finance, Reports, the dashboard's expense figures (finance|reports), a payroll run's expenses, Close the day
  { code: 'f', tables: ['expenses', 'expenseCategories', 'bankTx', 'loans'], perms: ['finance', 'reports', 'payroll', 'day.close'] },
  // Add stock / Purchases, Returns, Reorder, supplier balances (People → Suppliers), Reports, Close the day
  { code: 'p', tables: ['purchases', 'supplierReturns', 'purchaseOrders'], perms: ['stock.receive', 'purchases.edit', 'stock.adjust', 'suppliers', 'reorder', 'reports', 'finance', 'day.close'] },
  { code: 'a', tables: ['audit'], perms: ['audit'] },
];
/** Tables that only some roles receive */
export const RESTRICTED_TABLES = new Set(READ_GROUPS.flatMap((g) => g.tables));

/**
 * What this person may receive. perms: Set of the role's permissions, or 'all' (administrator / pharmacy key).
 * → { key, hidden: Set<table> }. key is 'all' when nothing is hidden (as before), else the hidden groups' codes.
 */
export function readView(perms) {
  let codes = '';
  if (perms !== 'all') for (const g of READ_GROUPS) if (!g.perms.some((p) => perms.has(p))) codes += g.code;
  return viewOfCodes(codes);
}
/** The view that hides these groups (a key from readView, or a string of group codes) */
export function viewOfCodes(codes) {
  const c = codes === 'all' ? '' : String(codes || '');
  const hidden = new Set();
  let key = '';
  for (const g of READ_GROUPS) if (c.includes(g.code)) { key += g.code; for (const t of g.tables) hidden.add(t); }
  return { key: key || 'all', hidden };
}
/**
 * A device is used by everyone who signs in on it (a shared till), and keeps what each of them needs offline. Its
 * view hides only what is hidden from every one of them: the groups common to all their keys.
 */
export const widestView = (keys) => viewOfCodes(READ_GROUPS.map((g) => g.code).filter((c) => keys.every((k) => k !== 'all' && k.includes(c))).join(''));
/** What the cloud hid before the 2026-11 audit (payroll and the sale checks only), for devices it already served */
export const legacyView = (key) => viewOfCodes([...(key === 'all' ? '' : key)].filter((c) => c === 'h' || c === 'c').join(''));

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
// 2026-11 audit: the money view alone let anyone who sells move a sale to another day or shift, renumber it or put
// it under another cashier's name ("the money is the same"). These are what a sale IS, besides its money; only
// someone with sales.edit may change them. (moneyView itself is unchanged: it also names the sale checks.)
const s = (v) => String(v ?? '');
// 2026-11-17 audit: bankId added: it decides which account (cash drawer, bank, mobile money) the takings are booked to
// (src/finance.js), so a seller re-sending a sale must not move them. isRefundOnly uses the same view.
export const identityView = (r) => moneyView(r) + JSON.stringify([s(r?.date), s(r?.number), s(r?.cashier), s(r?.createdBy), s(r?.proformaId), s(r?.shiftId), s(r?.bankId)]);
/** A refund changes only the status (to refunded) and who/when; the money stays exactly as it was */
export const isRefundOnly = (old, rec) => !!old && !!rec && old.status !== 'refunded' && rec.status === 'refunded' && identityView(old) === identityView(rec);
/** Nothing that matters changed (a re-send, or an older app pushing the same sale again) */
const unchanged = (old, rec) => !!old && !!rec && identityView(old) === identityView(rec) && (old.status ?? '') === (rec.status ?? '');

/** Selling a quotation: the till sets status "Converted" and the receipt number; nothing else may change */
const pfView = (p) => JSON.stringify([num(p?.subtotal), num(p?.discount), num(p?.tax), num(p?.total), s(p?.customerId), s(p?.type), s(p?.number), s(p?.date),
  (Array.isArray(p?.items) ? p.items : []).map((i) => [s(i?.id), num(i?.qty), num(i?.price)])]);
export const isConversionOnly = (old, rec) => !!old && !!rec && rec.status === 'Converted' && pfView(old) === pfView(rec);

// 2026-11 audit: stock changes a sale or a refund makes. A "Sale" movement takes stock out (negative quantity), a
// "Refund" puts it back (positive), in both apps (src/pages/POS.jsx, Sales.jsx; rxpos_flutter cart.dart, refund.dart).
// Anything else under those types was a way for anyone who sells to add or remove stock with no sale behind it.
const SIGN = { Sale: -1, Refund: 1 };
export const movementSignOk = (rec) => !SIGN[rec?.type] || Math.sign(Number(rec?.qty) || 0) === SIGN[rec.type];

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
    // 2026-11-17 audit: any truthy `open` reopens the day (src/dayclose.js closedSet), and moving a close to another day
    // or branch reopens the original one, so both need an administrator too (open: 1 used to get through)
    const moved = old && ((old.day ?? '') !== (rec?.day ?? '') || (old.branchId || 'main') !== (rec?.branchId || 'main'));
    if (deleted || rec?.open || moved) return role === 'admin' ? { ok: true } : { ok: false, need: 'admin' };
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
    if (!movementSignOk(rec)) return { ok: false, need: `a ${rec.type === 'Sale' ? 'negative' : 'positive'} quantity for a ${rec.type}` };
    // 2026-11-17 audit: a Sale or Refund movement with no receipt number skipped the check against its sale, so anyone
    // who sells could take stock out with nothing behind it. Both apps always set `ref`; without one it is an adjustment.
    const noRef = (rec?.type === 'Sale' || rec?.type === 'Refund') && !String(rec?.ref ?? '').trim();
    const perms = noRef ? ['stock.adjust'] : MOVEMENT_RULES[rec?.type] || ['stock.adjust'];
    return (await anyOf(can, perms)) ? { ok: true } : { ok: false, need: perms.join('|') };
  }
  if (t === 'proformas') {
    // a seller may only mark an existing quotation "Converted" (the till does on a sale); anything else is Proformas
    if (await can('proformas')) return { ok: true };
    // the classic till saves a quotation (F10) for anyone who sells; the cloud checks its discount and prices
    // (worker/anomalies.js) since its figures are trusted when it is sold
    if (!deleted && !old && (await anyOf(can, SELL))) return { ok: true };
    if (!deleted && old && (await anyOf(can, SELL)) && (isConversionOnly(old, rec) || pfView(old) + s(old.status) === pfView(rec) + s(rec?.status))) return { ok: true };
    return { ok: false, need: 'proformas' };
  }
  if (!KNOWN_TABLES.has(t)) return { ok: false, need: 'a known table' };
  const rule = Object.hasOwn(TABLE_RULES, t) ? TABLE_RULES[t] : null;
  if (!rule) return { ok: true };
  const perms = deleted ? rule.delete : rule.write;
  return (await anyOf(can, perms)) ? { ok: true } : { ok: false, need: perms.join('|') };
}

// 2026-11-17 audit: direct chats ("dm:<uid>:<uid>") were sent to every staff device and only the apps hid them. A row
// of a chat table in a direct conversation now reaches its two participants only (the pharmacy key sees everything).
const DM_TABLES = new Set(['messages', 'chatReads', 'chatPins', 'chatMarks']);
export function dmHidden(t, recText, uid) {
  if (!uid || !DM_TABLES.has(t)) return false;
  let conv;
  try { conv = String(JSON.parse(recText || 'null')?.conv || ''); } catch { return true; }
  return conv.startsWith('dm:') && !conv.slice(3).split(':').includes(String(uid));
}

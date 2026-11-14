import { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef, startTransition } from 'react';
import { idbGet, idbSet, idbDel, idbKeys } from './idb.js';
import { createSync, collectChanges } from './sync.js';
import { storage, diff, storageError, STORAGE_VERSION } from './storage.js';
import { featureSet, permissionsOf } from './access.js';
import { platformName } from './platform.js';
import { endWebSession, isLeaving, keepsData } from './webpolicy.js';
import { connectLive, disconnectLive, onLive } from './live.js';
import { DEFAULT_CLOUD, tillNumber } from './cloud.js';
import { nextNumber } from './docnumbers.js';
import { clientOwes } from './insurance.js';
import { windowSums } from './balances.js';
import { pruneOf } from './historywindow.js';
import { createStockIndexer } from './stockindex.js';
import { FIELD_TABLES, stampFields, mergeFields, sameRecord } from './fieldmerge.js';
import { setUnsent } from './update.js';
import { formatMoney } from './money.js';
import { pharmacyDefaults, overrideKey, readOverrides, writeOverrides, editOverrides, settingsEqual, PHARMACY_FIELDS } from './pharmacy-settings.js';

const SESSION_KEY = 'pharmapos-session';
// "Remember me": the sign-in survives closing the app on this device for 30 days (otherwise it ends with the session)
const REMEMBER_KEY = 'rxpos-remember';
const REMEMBER_DAYS = 30;

// Every synced table. Records carry `updatedAt`; deletions leave a tombstone in `_tomb`.
export const TABLES = [
  'products', 'formulations', 'customers', 'suppliers', 'sales', 'proformas', 'purchases', 'movements',
  'prescriptions', 'expenses', 'expenseCategories', 'banks', 'bankTx', 'loans', 'payments', 'users',
  'batches', 'branches', 'transfers', 'audit', 'purchaseOrders', 'roles', 'messages', 'shifts', 'license', 'events', 'tempLogs', 'catalogHidden', 'quizResults',
  'stockCounts', 'countItems', 'supplierReturns', 'chatMarks', 'chatPins', 'chatReads', 'drafts',
  'anomalies', // sale checks written by the cloud (worker/anomalies.js); only roles with the audit log receive them
  'dayCloses', // step 18: closed days per branch (src/dayclose.js)
  'counters', // step 7: each till's document counts (src/docnumbers.js), saved with the documents they number
  'insurers', // step 22: insurers and their schemes (src/insurance.js)
  // step 26 (from the Flutter app): Payroll & HR (the cloud sends them only to roles with Payroll) and report emails
  'employees', 'attendance', 'salaryAdvances', 'payrolls', 'reportSchedules',
  'notes', // 2026-11-14: Notes & SOP pages (src/notes.js)
];
// What is persisted on the device, one IndexedDB key per part
const PARTS = [...TABLES, 'settings', '_tomb'];
export const MAIN_BRANCH = 'main';

export async function listSnapshots() {
  return (await idbKeys()).filter((k) => String(k).startsWith('snap:')).sort().reverse().map((k) => k.slice(5));
}
export const loadSnapshot = (date) => idbGet('snap:' + date);

// id helper lives in ids.js (pure, unit-tested); imported for use here and re-exported so existing imports work.
import { uid } from './ids.js';
export { uid };
export const now = () => new Date().toISOString();
// Date helpers live in dates.js (pure, unit-tested); imported for use here and re-exported so existing imports from
// store.jsx keep working.
import { localDate, today, dayOf, monthOf, daysUntil, daysSince } from './dates.js';
export { localDate, today, dayOf, monthOf, daysUntil, daysSince };

// ---------- pricing ----------
/** Selling price from a cost and a markup (%), rounded to the nearest unit or up to the pharmacy's price step (e.g. 50) */
export function markupPrice(cost, markup, step = 0) {
  const raw = (Number(cost) || 0) * (1 + (Number(markup) || 0) / 100);
  if (!(raw > 0)) return 0;
  const st = Number(step) || 0;
  return st > 1 ? Math.ceil(raw / st) * st : Math.round(raw);
}

// ---------- stock alerts: only medicines actually in stock count ----------
/** Low stock: in stock, but at or below its reorder level (never-stocked medicines are not "low") */
export const isLowStock = (p) => p.stock > 0 && p.reorder > 0 && p.stock <= p.reorder;
/** Every batch with stock left that expires within `warn` days (soon) or has expired (expired) */
export function expiryBatches(products, batchesOf, warn) {
  const soon = [], expired = [];
  for (const p of products) {
    if (!(p.stock > 0)) continue;
    for (const b of batchesOf(p.id)) {
      if (!(b.qty > 0) || !b.expiry) continue;
      const days = daysUntil(b.expiry);
      if (days < 0) expired.push({ ...b, p, days });
      else if (days <= warn) soon.push({ ...b, p, days });
    }
  }
  const byExpiry = (a, b) => a.expiry.localeCompare(b.expiry);
  return { soon: soon.sort(byExpiry), expired: expired.sort(byExpiry) };
}
export { batchValue, stockValue } from './stockvalue.js';
/** Number of different medicines with stock expiring soon / already expired */
export const expiryCounts = (products, batchesOf, warn) => {
  const { soon, expired } = expiryBatches(products, batchesOf, warn);
  return { soon: new Set(soon.map((b) => b.p.id)).size, expired: new Set(expired.map((b) => b.p.id)).size, soonBatches: soon, expiredBatches: expired };
};

// ---------- passwords ----------
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
/** Legacy (v1.0/1.1) unsalted hash — still accepted at sign-in, then upgraded. */
export async function hashPassword(pw) {
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('pharmapos:' + pw)));
}
async function pbkdf2(pw, salt) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveBits']);
  const saltBytes = Uint8Array.from(atob(salt), (c) => c.charCodeAt(0));
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: saltBytes, iterations: 100000, hash: 'SHA-256' }, key, 256));
}
/** Salted, slow hash for new and changed passwords: returns fields to store on the user record. */
export async function makePassword(pw) {
  const salt = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
  return { algo: 'pbkdf2', salt, hash: await pbkdf2(pw, salt) };
}
export async function verifyPassword(u, pw) {
  if (!u?.hash) return false;
  return u.algo === 'pbkdf2' ? (await pbkdf2(pw, u.salt)) === u.hash : (await hashPassword(pw)) === u.hash;
}

// ---------- draft helpers (used inside update(d => …)) ----------
export function put(d, table, rec) {
  let r = { ...rec, id: rec.id || uid(), updatedAt: now() };
  const i = d[table].findIndex((x) => x.id === r.id);
  // step 14: medicines, clients, suppliers and batches remember when each field changed, so edits from two devices merge
  if (i >= 0 && FIELD_TABLES.has(table)) r = stampFields(d[table][i], r, r.updatedAt);
  if (i >= 0) d[table][i] = r;
  else d[table].unshift(r);
  return r;
}
/** Many records into one table in a single pass (put() searches the table for each record: slow for thousands) */
export function putMany(d, table, recs) {
  const at = now();
  const index = new Map(d[table].map((x, i) => [x.id, i]));
  const added = [];
  const out = recs.map((rec) => {
    let r = { ...rec, id: rec.id || uid(), updatedAt: at };
    const i = index.get(r.id);
    if (i !== undefined && FIELD_TABLES.has(table)) r = stampFields(d[table][i], r, at);
    if (i !== undefined) d[table][i] = r; else { added.push(r); index.set(r.id, -1); }
    return r;
  });
  if (added.length) d[table] = [...added.reverse(), ...d[table]]; // new ones first, as put() does
  return out;
}
export function del(d, table, id) {
  d[table] = d[table].filter((x) => x.id !== id);
  d._tomb.push({ t: table, id, at: now() });
  // a standard-catalog medicine is built into the app: remember that this pharmacy removed it
  if (table === 'products' && isBaseId(id)) put(d, 'catalogHidden', { id });
}

// ---------- standard catalog (built into the app, shared by every pharmacy) ----------
// The 9,710 standard medicines are not stored per pharmacy in the cloud. Each device lays them underneath the
// pharmacy's own medicines; only medicines a pharmacy adds or changes are synced. That keeps cloud writes tiny.
export const BASE_AT = '2000-01-01T00:00:00.000Z';
export const isBaseId = (id) => /^cat-\d+$/.test(String(id));
/** Untouched catalog items never leave the device */
export const isUntouchedBase = (r) => r._base && r.updatedAt === BASE_AT;
let catalog = null;
export async function loadCatalog() {
  if (!catalog) catalog = (await import('./data/catalog.json')).default;
  return catalog;
}
const baseProduct = ([name, generic, form, price, wholesale, cost, barcode, unit], i) => ({
  id: 'cat-' + (i + 1), name, generic, form, price, wholesale: wholesale || price, cost: cost || Math.round((wholesale || price) * 0.8),
  barcode: barcode || '2' + String(i + 1).padStart(11, '0'), unit, reorder: 0, fromCatalog: true, _base: true, updatedAt: BASE_AT,
});
/** Add (or remove, if the owner switched the catalog off) the built-in medicines. Returns the same object when nothing changes. */
export function withCatalog(d, cat = catalog) {
  if (!cat || !d) return d;
  const on = d.license?.[0]?.features?.catalog !== false;
  const hidden = new Set((d.catalogHidden || []).map((h) => h.id));
  const keep = d.products.filter((p) => !(isUntouchedBase(p) && (!on || hidden.has(p.id))));
  const have = new Set(keep.map((p) => p.id));
  const add = [];
  if (on) cat.rows.forEach((r, i) => { const id = 'cat-' + (i + 1); if (!have.has(id) && !hidden.has(id)) add.push(baseProduct(r, i)); });
  if (!add.length && keep.length === d.products.length) return d;
  return { ...d, products: add.length ? keep.concat(add) : keep };
}
/**
 * Erase the pharmacy's data on every device (deletions sync): sales, stock, customers, suppliers, finance, users…
 * Always keeps: the person doing it (so they can still sign in), roles, the licence and the built-in defaults
 * (walk-in customer, cash drawer, main branch). keepMedicines also keeps products, formulations and expense categories.
 */
export function eraseData(d, { keepMedicines = true, keepUserId } = {}) {
  const keepTables = new Set(['license', 'roles', ...(keepMedicines ? ['products', 'formulations', 'expenseCategories'] : [])]);
  const keepIds = { customers: 'walk-in', banks: 'cash-drawer', branches: MAIN_BRANCH, users: keepUserId };
  let n = 0;
  for (const t of TABLES) {
    if (keepTables.has(t)) continue;
    const gone = d[t].filter((r) => r.id !== keepIds[t]);
    if (!gone.length) continue;
    const at = now();
    d[t] = d[t].filter((r) => r.id === keepIds[t]);
    for (const r of gone) d._tomb.push({ t, id: r.id, at });
    n += gone.length;
  }
  return n;
}
/** Record a stock movement. Stock is always the sum of movements, so devices that worked offline merge safely. */
export function move(d, { productId, qty, type, ref = '', note = '', user = '', batchId = null, branchId = MAIN_BRANCH }) {
  return put(d, 'movements', { id: uid(), productId, qty: Number(qty), type, ref, note, user, batchId, branchId, date: now() });
}
/** Create a batch (lot) for a product; reuses an existing batch with the same number and expiry. */
export function addBatch(d, { productId, batch, expiry, cost }) {
  const code = String(batch || '').trim();
  const existing = d.batches.find((b) => b.productId === productId && b.batch === code && (b.expiry || '') === (expiry || ''));
  if (existing) return existing;
  return put(d, 'batches', { id: uid(), productId, batch: code || 'B' + today().replace(/-/g, '').slice(2), expiry: expiry || '', cost: Number(cost) || 0, received: today() });
}
/** Append to the audit trail (who did what, when, where). */
export function audit(d, user, action, details = '', branchId = MAIN_BRANCH) {
  put(d, 'audit', { id: uid(), date: now(), user: user?.name || user || '', action, details, branchId });
}
// FEFO allocation lives in fefo.js (pure, unit-tested); re-exported so existing imports from store.jsx keep working.
export { allocate } from './fefo.js';

// Fixed ids so the same defaults created on two devices merge instead of duplicating
const FORMS = ['Tablets', 'Capsules', 'Syrups', 'Suspensions', 'Injectables', 'Infusions', 'Creams', 'Ointments', 'Gels', 'Drops', 'Eye Drops', 'Ear Drops', 'Inhalers', 'Sachets', 'Suppositories', 'Pessaries', 'Lotions', 'Powders', 'Devices', 'Surgicals', 'Cosmetics', 'Supplements', 'Sundries', 'Others'];
const EXPENSE_CATS = ['Rent', 'Salaries', 'Electricity', 'Water', 'Transport', 'Airtime & Internet', 'Licenses & Fees', 'Repairs', 'Stationery', 'Other'];

export const DEFAULT_PAYMENT_METHODS = [
  { id: 'cash', name: 'Cash', type: 'cash' },
  { id: 'momo', name: 'Mobile Money', type: 'momo' },
  { id: 'card', name: 'Card', type: 'other' },
  { id: 'bank', name: 'Bank Transfer', type: 'other' },
  { id: 'insurance', name: 'Insurance', type: 'other' },
  { id: 'credit', name: 'Credit', type: 'credit' },
];

/** Factory defaults for settings (also used by "Restore default settings") */
export function defaultSettings() {
  return {
    name: 'My Pharmacy', address: '', phone: '', license: '', currency: 'UGX', decimals: 0, taxRate: 0,
    wholesaleMarkup: 25, retailMarkup: 50, priceRound: 0, minMargin: 20, expiryWarnDays: 90,
    receiptFooter: 'Thank you for your purchase. Get well soon!', paperWidth: 80, autoPrint: false,
    leadDays: 7, coverDays: 30, deadDays: 90,
    smsRefill: 'Hello {name}, this is {pharmacy}. Your refill of {medicine} is due on {date}. Reply or visit us to collect. Get well soon!',
    smsDebt: 'Hello {name}, this is a friendly reminder from {pharmacy} that your balance of {amount} is due. Thank you.',
    paymentMethods: DEFAULT_PAYMENT_METHODS, clientCapture: 'optional', features: {}, adminWhatsApp: '',
  };
}

function blankDb() {
  const t0 = '2000-01-01T00:00:00.000Z';
  const d = Object.fromEntries(TABLES.map((t) => [t, []]));
  d.formulations = FORMS.map((name) => ({ id: 'form-' + name.toLowerCase().replace(/\W+/g, '-'), name, updatedAt: t0 }));
  d.expenseCategories = EXPENSE_CATS.map((name) => ({ id: 'expcat-' + name.toLowerCase().replace(/\W+/g, '-'), name, updatedAt: t0 }));
  d.customers = [{ id: 'walk-in', name: 'Walk-in Customer', phone: '', updatedAt: t0 }];
  d.banks = [{ id: 'cash-drawer', name: 'Cash at hand', account: '', opening: 0, updatedAt: t0 }];
  d.branches = [{ id: MAIN_BRANCH, name: 'Main branch', address: '', updatedAt: t0 }];
  d.settings = { ...defaultSettings(), updatedAt: t0 };

  d._tomb = [];
  return d;
}

const SAMPLE = [
  ['Paracetamol 500mg', 'Paracetamol', 'Analgesic', 'Tablets', 30, 50, 100, 1200, 200, 400],
  ['Amoxicillin 500mg', 'Amoxicillin', 'Antibiotic', 'Capsules', 120, 180, 250, 600, 100, 200, true],
  ['Ibuprofen 400mg', 'Ibuprofen', 'NSAID', 'Tablets', 40, 70, 100, 800, 150, 25],
  ['Metformin 500mg', 'Metformin', 'Antidiabetic', 'Tablets', 60, 90, 150, 90, 120, 300, true],
  ['Amlodipine 5mg', 'Amlodipine', 'Antihypertensive', 'Tablets', 50, 80, 150, 400, 100, 500, true],
  ['Omeprazole 20mg', 'Omeprazole', 'PPI', 'Capsules', 70, 110, 200, 350, 80, 60],
  ['ORS Sachet', 'Oral Rehydration Salts', 'Electrolyte', 'Sachets', 300, 400, 500, 40, 50, 700],
  ['Cough Syrup 100ml', 'Dextromethorphan', 'Antitussive', 'Syrups', 3500, 4500, 6000, 60, 20, 15],
  ['Vitamin C 1000mg', 'Ascorbic acid', 'Supplement', 'Tablets', 80, 120, 200, 500, 100, 365],
  ['Artemether/Lumefantrine 20/120', 'Artemether/Lumefantrine', 'Antimalarial', 'Tablets', 4000, 5500, 7000, 75, 30, 240, true],
];

export function addSampleData(d, user, branchId = MAIN_BRANCH) {
  SAMPLE.forEach(([name, generic, category, form, cost, wholesale, price, stock, reorder, expDays, rx], i) => {
    const p = put(d, 'products', { name, generic, category, form, cost, wholesale, price, reorder, unit: 'Piece', barcode: '62000000' + String(1000 + i), rx: !!rx });
    const b = addBatch(d, { productId: p.id, batch: 'B' + Math.floor(1000 + Math.random() * 9000), expiry: localDate(Date.now() + expDays * 864e5), cost });
    move(d, { productId: p.id, qty: stock, type: 'Opening stock', user, batchId: b.id, branchId });
  });
  put(d, 'suppliers', { name: 'Sample Wholesale Ltd', contact: '', phone: '', email: '', address: '' });
}

function draft(db) {
  const d = { ...db, settings: { ...db.settings }, _tomb: db._tomb.slice() };
  TABLES.forEach((t) => (d[t] = (db[t] || []).slice()));
  return d;
}

/** Merge records pulled from the hub: last writer (by updatedAt) wins per record. */
export function mergeRemote(db, changes) {
  const d = draft(db);
  const index = {};
  let gone = null; // records deleted on this device, by `t|id` → when (a full download must not bring them back)
  for (const ch of changes) {
    if (ch.t === 'settings') {
      if (!d.settings.updatedAt || ch.at > d.settings.updatedAt) d.settings = { ...d.settings, ...ch.rec, updatedAt: ch.at };
      // the pharmacy's details belong to the Owner console: the cloud's always win, even over newer local settings
      else if (ch.rec) for (const [k] of PHARMACY_FIELDS) if (k in ch.rec && ch.rec[k] !== d.settings[k]) d.settings = { ...d.settings, [k]: ch.rec[k] };
      continue;
    }
    if (!d[ch.t]) continue;
    index[ch.t] ??= new Map(d[ch.t].map((r, i) => [r.id, i]));
    const i = index[ch.t].get(ch.id);
    const local = i !== undefined ? d[ch.t][i] : null;
    // step 14: a medicine, client, supplier or batch held here merges field by field (the newer value of each wins)
    if (local && !ch.deleted && ch.rec && FIELD_TABLES.has(ch.t)) {
      const merged = mergeFields(local, local.updatedAt, { ...ch.rec, id: ch.id }, ch.at);
      if (!sameRecord(merged, local)) d[ch.t][i] = merged;
      continue;
    }
    if (local && local.updatedAt >= ch.at) continue;
    if (!local && !ch.deleted) {
      gone ??= new Map(d._tomb.map((x) => [x.t + '|' + x.id, x.at]));
      if (gone.get(ch.t + '|' + ch.id) >= ch.at) continue;
    }
    if (ch.deleted) {
      if (local) { d[ch.t] = d[ch.t].filter((r) => r.id !== ch.id); delete index[ch.t]; }
    } else if (local) d[ch.t][i] = { ...ch.rec, updatedAt: ch.at };
    else { d[ch.t].push({ ...ch.rec, updatedAt: ch.at }); index[ch.t].set(ch.id, d[ch.t].length - 1); }
  }
  // newest first, like local inserts (only the lists that received something: re-sorting 40,000 sales on every
  // small sync made phones lag)
  const touched = new Set(changes.map((c) => c.t));
  ['sales', 'purchases', 'expenses', 'payments', 'bankTx', 'proformas', 'prescriptions', 'transfers', 'audit', 'purchaseOrders', 'stockCounts', 'supplierReturns'].forEach((t) => {
    if (touched.has(t)) d[t].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  });
  return d;
}

// ---------- device storage helpers (src/storage.js holds the contract) ----------
/** Built-in catalog medicines nobody changed are rebuilt from the app on every start: never stored */
const skipRecord = (r) => isUntouchedBase(r);
/** Built-in defaults nobody changed (walk-in customer, cash drawer…) are stored but every device already has them */
const noSync = (r) => r.updatedAt === BASE_AT;
const DATED = ['sales', 'purchases', 'expenses', 'payments', 'bankTx', 'proformas', 'prescriptions', 'transfers', 'audit', 'purchaseOrders', 'stockCounts', 'supplierReturns', 'movements', 'messages'];
// newest first. ISO times compare correctly as plain strings; localeCompare is far slower on 50,000 rows at start-up
const desc = (x, y) => (x < y ? 1 : x > y ? -1 : 0);
const byDate = (a, b) => desc(String(a.date || ''), String(b.date || ''));
const byChange = (a, b) => desc(String(a.updatedAt || ''), String(b.updatedAt || ''));
/** The pharmacy as the screens expect it (lists newest first) from one entry per record */
function fromRecords({ tables, settings, tomb }) {
  const out = { _tomb: tomb || [] };
  if (settings) out.settings = settings;
  for (const t of TABLES) out[t] = (tables[t] || []).sort(DATED.includes(t) ? byDate : byChange);
  return out;
}
const countOf = (d) => Object.fromEntries(TABLES.map((t) => [t, d[t].filter((r) => !skipRecord(r)).length]));
/**
 * One-time move from the 1.5 storage (one IndexedDB value per table, rewritten whole on every change) to one entry
 * per record. The 1.5 copy is left untouched (removeOldTableCopies deletes it 14 days later), the new copy is read
 * back and compared before it is used, and the changes 1.5 had not sent to the cloud yet go into the outbox in the
 * same transaction, so nothing waiting is lost.
 */
async function migrateLegacy(base, fill, cfg) {
  let saved;
  const parts = await Promise.all(PARTS.map((k) => idbGet('t:' + k)));
  if (parts.some((p) => p !== undefined)) saved = Object.fromEntries(PARTS.map((k, i) => [k, parts[i]]).filter(([, v]) => v !== undefined));
  else saved = (await idbGet('db')) || null; // data saved by version 1.0
  const d = saved ? fill(saved) : base;
  const want = countOf(d);
  const unsent = saved && cfg?.key ? collectChanges(d, cfg.pushedAt).map((ch) => ({ op: uid(), txn: 'migration', t: ch.t, id: String(ch.id), deleted: !!ch.deleted, at: ch.at })) : [];
  for (let attempt = 1; ; attempt++) {
    await storage().commit({ ...diff(null, d, { tables: TABLES, local: false, skip: skipRecord }), settings: d.settings, tomb: d._tomb, ops: unsent, reset: true, clearOutbox: true, version: STORAGE_VERSION,
      kv: saved ? { 'migrated-v1-at': now(), 'migrated-v1-counts': want } : {} });
    const back = await storage().load();
    const got = back && countOf(fromRecords(back));
    const same = got && TABLES.every((t) => got[t] === want[t]) && (back.settings?.updatedAt || '') === (d.settings?.updatedAt || '') && back.tomb.length === d._tomb.length;
    if (same) return d;
    if (attempt >= 2) throw new Error('the storage upgrade could not be verified (the copy from before it is kept: This device → Restore the copy from before the upgrade)');
  }
}
/** Restore the 1.5 copy kept by migrateLegacy (recovery, from This device). Reload afterwards. */
export async function restoreLegacyCopy() {
  if (!(await idbGet('t:sales')) && !(await idbGet('db'))) throw new Error('There is no copy from before the upgrade on this device.');
  const left = await storage().count();
  if (left) throw new Error(`${left} change(s) haven't reached the cloud yet. Let them send first, then restore.`);
  // the copy is older than the cloud: pull everything again after restoring, so nothing made since is missing
  const cfg = await idbGet('sync');
  if (cfg) await idbSet('sync', { ...cfg, cursor: 0, lastSync: '' });
  await storage().commit({ puts: [], dels: [], ops: [], kv: { 'storage-version': 1 } });
}
/** The 1.5 copy is removed 14 days after a verified upgrade (it is only kept for recovery) */
async function removeOldTableCopies() {
  if (!keepsData()) return;
  const at = await idbGet('migrated-v1-at');
  if (!at || Date.now() - Date.parse(at) < 14 * 864e5 || (await idbGet('migrated-v1-removed'))) return;
  for (const k of PARTS) await idbDel('t:' + k);
  await idbDel('db');
  await idbSet('migrated-v1-removed', now());
}

const Ctx = createContext(null);
// Sync status, changes waiting and storage problems change often while syncing: they have their own context, so a
// sync running in the background re-renders only what shows them (the clock pill, This device), never the pages.
const SyncCtx = createContext({ syncStatus: { state: 'off' }, pending: 0, storageIssue: '' });

// when the person last touched the app: heavy background jobs (the daily copy, the weekly reorder levels) wait for a
// quiet moment, so they never land in the middle of a sale or a page change
let lastInput = Date.now();
if (typeof window !== 'undefined') for (const ev of ['pointerdown', 'keydown', 'wheel', 'touchstart']) window.addEventListener(ev, () => { lastInput = Date.now(); }, { passive: true, capture: true });
/** Resolves once nobody has touched the app for [quietMs], the app is on screen and the browser is idle */
export async function whenQuiet(quietMs = 30000) {
  while (Date.now() - lastInput < quietMs || document.visibilityState !== 'visible') await new Promise((r) => setTimeout(r, 5000));
  await new Promise((r) => (window.requestIdleCallback ? requestIdleCallback(r, { timeout: 30000 }) : setTimeout(r, 1)));
}

export function StoreProvider({ children }) {
  const [db, setDb] = useState(null);
  const [syncCfg, setSyncCfgState] = useState(null);
  const [overrideRevision, setOverrideRevision] = useState(0);
  const localSettingsKey = overrideKey(syncCfg?.url, syncCfg?.tenant || syncCfg?.slug);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- overrideRevision: re-read this device's overrides after an edit
  const pharmacyOverrides = useMemo(() => readOverrides(localSettingsKey), [localSettingsKey, overrideRevision]);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- only the shared settings matter here, not every record change
  const effectiveSettings = useMemo(() => db ? { ...db.settings, ...pharmacyOverrides } : null, [db?.settings, pharmacyOverrides]);
  // stage 4 of the faster sync: a device keeping recent history carries the cloud's brought-forward figures with the
  // records (src/balances.js windowSums, src/stockindex.js); without a window there are none and nothing changes
  const win = syncCfg?.window && syncCfg?.balances?.W === syncCfg.window ? syncCfg.balances : null;
  const viewDb = useMemo(() => db ? { ...db, settings: effectiveSettings, ...(win ? { _window: win } : {}) } : null, [db, effectiveSettings, win]);
  const [syncStatus, setSyncStatus] = useState({ state: 'off' });
  const [user, setUserState] = useState(() => {
    try {
      const s = JSON.parse(sessionStorage.getItem(SESSION_KEY));
      if (s) return s;
      const r = JSON.parse(localStorage.getItem(REMEMBER_KEY));
      if (r?.user && r.until > Date.now()) return r.user;
      localStorage.removeItem(REMEMBER_KEY);
    } catch { /* storage blocked */ }
    return null;
  });
  // The latest state, always (updates read and write it synchronously, so two quick actions never lose each other)
  const dbRef = useRef(null);
  const setState = useCallback((next) => { dbRef.current = next; setDb(next); }, []);
  // Records from the cloud: the device's copy (dbRef) changes at once, the screen catches up as a low-priority
  // update that React interrupts for any tap or key, so syncing in the background never makes the app lag
  const setStateInBackground = useCallback((next) => { dbRef.current = next; startTransition(() => setDb(next)); }, []);
  const [storageIssue, setStorageIssue] = useState(''); // a write to the device failed (shown as Needs attention)

  // ---------- load (with the one-time move to record-level storage, verified before it is used) ----------
  useEffect(() => {
    (async () => {
      let cfg = null, loaded = null;
      const base = blankDb();
      const fill = (saved) => {
        const d = { ...base, ...saved, settings: { ...base.settings, ...(saved.settings || {}) }, _tomb: saved._tomb || [] };
        TABLES.forEach((t) => { if (!Array.isArray(d[t])) d[t] = base[t]; });
        if (!d.branches.length) d.branches = base.branches;
        return d;
      };
      try {
        cfg = await idbGet('sync');
        const rec = await storage().load();
        if (rec) loaded = fill(fromRecords(rec));
        else {
          loaded = await migrateLegacy(base, fill, cfg);
          // the changes it had not sent are in the outbox now: don't queue them a second time
          if (cfg) { cfg = { ...cfg, outboxV2: true }; await idbSet('sync', cfg); }
        }
      } catch (e) {
        console.error(e);
        setStorageIssue('RxPOS could not read this device\'s storage: ' + (e.message || e) + '. Nothing was deleted; close other RxPOS windows and reopen.');
      }
      setState(loaded || base);
      loadCatalog().then((cat) => { const prev = dbRef.current; const next = withCatalog(prev, cat); if (next !== prev) setState(next); }).catch(console.error);
      // devices set up on the old free addresses (rxpos.pages.dev, *.workers.dev) move to rxposug.com
      const moved = cfg?.url && /rxpos\.pages\.dev|pharmapos\.pharmapos\.workers\.dev/.test(cfg.url) ? { url: DEFAULT_CLOUD } : {};
      // web version: nothing is kept between visits, so the pharmacy is downloaded from the start every time
      // (with a new device id too: the cloud never sends a device its own changes back, and this page holds none of them)
      const fresh = !keepsData() && cfg ? { deviceId: uid(), cursor: 0, pushedAt: '', lastSync: '', epoch: undefined, outboxV2: true } : {};
      setSyncCfgState({ deviceId: uid(), url: '', key: '', pushedAt: '', cursor: 0, branchId: MAIN_BRANCH, ...(cfg || {}), ...moved, ...fresh });
      removeOldTableCopies().catch(console.error);
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- save: every change goes to the device in one transaction, in order ----------
  const chain = useRef(Promise.resolve());
  const persist = useCallback((c) => {
    if (!c.puts.length && !c.dels.length && !c.ops.length && !c.settings && !c.tomb && !c.reset) return Promise.resolve();
    const p = chain.current.then(() => storage().commit(c));
    chain.current = p.catch(() => {});
    return p.then(() => setStorageIssue((x) => (x ? '' : x)), (e) => { setStorageIssue(e.message); throw e; });
  }, []);

  // Daily on-device snapshot (last 7 kept) so a mistake can be undone even without a hub or manual backup
  // (checked once a day by key name only: reading the snapshot back to see if it exists copied the whole pharmacy
  // after every change; the copy is written when the device is idle)
  const snappedDay = useRef('');
  useEffect(() => {
    if (!db || !db.users.length || !keepsData()) return; // the web version keeps no copies on the computer
    const key = 'snap:' + today();
    if (snappedDay.current === key) return;
    const t = setTimeout(async () => {
      try {
        if ((await idbKeys()).includes(key)) { snappedDay.current = key; return; }
        await whenQuiet(); // the copy is one long step the screen can't interrupt
        await idbSet(key, dbRef.current);
        snappedDay.current = key;
        const snaps = (await idbKeys()).filter((k) => String(k).startsWith('snap:')).sort();
        for (const old of snaps.slice(0, -7)) await idbDel(old);
      } catch (e) { console.error(e); }
    }, 5000);
    return () => clearTimeout(t);
  }, [db]);

  const saveSyncCfg = useCallback((cfg) => {
    setSyncCfgState(cfg);
    cfgRef.current = cfg;
    return idbSet('sync', cfg).catch((e) => { console.error(e); setStorageIssue(storageError(e).message); });
  }, []);

  // Every local change is pushed to the cloud almost at once (0.4 s, so a burst of edits goes up together; never
  // later than 1.5 s after the first one), and other devices are told over the live connection to pull it
  const pushTimer = useRef(null);
  const pushFirst = useRef(0);
  const queuePush = useCallback(() => {
    clearTimeout(pushTimer.current);
    if (!pushFirst.current) pushFirst.current = Date.now();
    const wait = Math.max(0, Math.min(400, 1500 - (Date.now() - pushFirst.current)));
    pushTimer.current = setTimeout(() => { pushFirst.current = 0; syncRef.current?.run(); }, wait);
  }, []);
  const changedAt = useRef(0); // last local change (web: warn before leaving while it isn't in the cloud yet)
  const [pending, setPending] = useState(0); // changes on this device the cloud hasn't accepted yet
  const countPending = useCallback(() => storage().count().then(setPending).catch(() => {}), []);
  useEffect(() => setUnsent(pending), [pending]); // the web version keeps unsent work in memory: updates wait until it is sent
  /**
   * Change the pharmacy. The screen updates at once; the returned promise resolves when the change (and the note to
   * send it to the cloud) is saved on the device, and rejects if it could not be saved. Anything that tells the user
   * "saved" or "complete" (a sale, a delivery) waits for it. If the write fails and nothing changed since, the change
   * is taken back so the screen never shows something the device doesn't hold.
   */
  const update = useCallback((fn) => {
    const prev = dbRef.current;
    const d = draft(prev);
    fn(d);
    setState(d);
    changedAt.current = Date.now();
    const c = diff(prev, d, { tables: TABLES, local: true, txn: uid(), skip: skipRecord, noOp: noSync });
    const p = persist(c).then(() => { setPending((n) => n + c.ops.length); queuePush(); }, (e) => {
      if (dbRef.current === d) setState(prev);
      throw e;
    });
    p.catch(() => {}); // callers that don't wait still see the problem as "Needs attention"
    return p;
  }, [persist, queuePush, setState]);
  const upsert = useCallback((table, rec) => update((d) => { put(d, table, rec); }), [update]);
  const remove = useCallback((table, id) => update((d) => { del(d, table, id); }), [update]);
  const saveSettings = useCallback(async (settings) => {
    const shared = dbRef.current.settings;
    const previous = readOverrides(localSettingsKey);
    const next = editOverrides(shared, { ...shared, ...previous }, settings, previous);
    try {
      writeOverrides(localSettingsKey, next);
      setOverrideRevision((n) => n + 1);
      const canonical = { ...settings, ...pharmacyDefaults(shared) };
      // A Pharmacy-tab edit changes no shared record and queues no sync operation.
      if (!settingsEqual(canonical, { ...shared, ...pharmacyDefaults(shared) })) {
        await update((d) => { d.settings = { ...canonical, updatedAt: now() }; });
      }
    } catch (e) {
      try { writeOverrides(localSettingsKey, previous); } catch { /* retain the original error */ }
      setOverrideRevision((n) => n + 1);
      setStorageIssue(e.message || 'Device settings could not be saved');
      throw e;
    }
  }, [update, localSettingsKey]);
  const resetPharmacyOverrides = useCallback(() => {
    try { writeOverrides(localSettingsKey, {}); setOverrideRevision((n) => n + 1); }
    catch (e) { setStorageIssue(e.message); throw e; }
  }, [localSettingsKey]);

  const branchId = syncCfg?.branchId || MAIN_BRANCH;
  const setBranchId = useCallback((id) => saveSyncCfg({ ...cfgRef.current, branchId: id }), [saveSyncCfg]);

  /**
   * Sign in / out. Signing out never deletes changes that haven't reached the cloud: the Windows and Android apps
   * keep them and send them later; the web version (which keeps nothing) tries to send them first and, if it
   * can't, asks before letting them go (resolves false when the person chose to stay signed in).
   */
  const setUser = useCallback(async (u, { remember, confirmLoss } = {}) => {
    if (!u && !keepsData()) {
      await Promise.race([syncRef.current?.run(), new Promise((r) => setTimeout(r, 4000))]);
      const left = await storage().count().catch(() => 0);
      if (left && !(await (confirmLoss || (() => Promise.resolve(window.confirm(`${left} change(s) have not reached the cloud yet. This browser keeps nothing, so signing out now loses them. Sign out anyway?`))))(left))) return false;
    }
    try {
      if (u) {
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(u));
        if (remember) localStorage.setItem(REMEMBER_KEY, JSON.stringify({ user: u, until: Date.now() + REMEMBER_DAYS * 864e5 }));
        else if (remember === false) localStorage.removeItem(REMEMBER_KEY);
      } else { sessionStorage.removeItem(SESSION_KEY); localStorage.removeItem(REMEMBER_KEY); } // signing out always forgets
    } catch { /* storage blocked */ }
    if (!u && !keepsData()) { endWebSession(); return true; } // clear this tab and start clean (nothing stays on the computer)
    if (u && !user) update((d) => audit(d, u, 'Signed in', platformName, branchId));
    setUserState(u);
    return true;
  }, [user, update, branchId]);

  // background sync with the cloud (when configured)
  const syncRef = useRef(null);
  const cfgRef = useRef(null);
  cfgRef.current = syncCfg;
  const hasCfg = !!syncCfg;
  useEffect(() => {
    if (!hasCfg) return;
    syncRef.current = createSync({
      getDb: () => dbRef.current,
      getCfg: () => cfgRef.current,
      saveCfg: saveSyncCfg,
      store: storage(),
      // records from the cloud are saved on the device before the sync position moves past them
      applyRemote: (changes) => {
        const prev = dbRef.current;
        const next = withCatalog(mergeRemote(prev, changes));
        setStateInBackground(next);
        return persist(diff(prev, next, { tables: TABLES, local: false, skip: skipRecord }));
      },
      // stage 4: a shorter window (or the window moving on at a new month) drops the older records from THIS device
      // only: no outbox entries and no tombstones, so nothing is deleted in the cloud and a longer window brings them back
      // A record with a change still waiting to be sent stays until it has gone (src/historywindow.js pruneOf).
      pruneWindow: async (W) => {
        const waiting = new Set((await storage().outbox().catch(() => [])).map((e) => e.t + '|' + e.id));
        const prev = dbRef.current;
        const { tables, dels } = pruneOf(prev, W, waiting);
        const next = { ...prev, ...tables };
        if (!dels.length) return Promise.resolve();
        setStateInBackground(next);
        return persist({ puts: [], dels, ops: [] });
      },
      onStatus: (st) => {
        setSyncStatus(st);
        if (typeof st.pending === 'number') setPending(st.pending);
        if (st.state === 'ok' && !st.pending) sentAt.current = Date.now();
      },
    });
    countPending();
    return syncRef.current.stop;
  }, [hasCfg, syncCfg?.url, syncCfg?.key, saveSyncCfg]); // eslint-disable-line react-hooks/exhaustive-deps
  const syncNow = useCallback(() => syncRef.current?.run(), []);
  const pullAll = useCallback(() => syncRef.current?.pullAll(), []);
  // the web version keeps nothing: leaving or reloading while a change hasn't reached the cloud would lose it,
  // so the browser asks first
  const sentAt = useRef(0);
  useEffect(() => {
    if (keepsData()) return;
    const guard = (e) => { if (!isLeaving() && changedAt.current > sentAt.current && cfgRef.current?.key) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, []);
  useEffect(() => {
    if (!syncCfg?.key?.startsWith('u.') || !user) { disconnectLive(); return; }
    connectLive(syncCfg);
    let t;
    const off = onLive((m) => { if (m.type === 'changed' || m.type === 'open') { clearTimeout(t); t = setTimeout(() => syncRef.current?.run(), 30); } });
    return () => { off(); clearTimeout(t); };
  }, [syncCfg?.url, syncCfg?.key, syncCfg?.deviceId, !!user]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Link this device to a pharmacy after a cloud sign-in. If the device held another pharmacy's data (or old
   * device-only data), that is kept aside as a backup on the device and the store starts clean, then downloads.
   * Changes another pharmacy's sign-in hasn't sent yet are never carried over to this one: they are sent first (with
   * that pharmacy's own sign-in), and if they can't be, switching is refused with the reason.
   */
  const linkPharmacy = useCallback(async ({ url, token, account, tenant, slug, pharmacy }) => {
    const cur = cfgRef.current || {};
    const other = cur.tenant ? cur.tenant !== tenant : (dbRef.current?.users.length || 0) > 0;
    if (other && cur.tenant) {
      // twice at most: a first run() may just be the end of a sync that was already running (and failed, e.g. it
      // started while the connection was down); the second is a fresh attempt now that the person is signing in
      for (let i = 0; i < 2 && (await storage().count()); i++) await syncRef.current?.run();
      const left = await storage().count();
      if (left) throw new Error(`This device still has ${left} change(s) for ${cur.pharmacy || 'another pharmacy'} that haven't reached the cloud. Connect to the internet and let them send (or sign in to that pharmacy again) before signing in to a different pharmacy.`);
    }
    if (other) {
      try { await idbSet('backup:' + (cur.tenant || 'device') + ':' + now().slice(0, 19), dbRef.current); } catch (e) { console.error(e); }
      for (const k of await idbKeys().catch(() => [])) if (String(k).startsWith('snap:')) await idbDel(k).catch(() => {});
      const blank = withCatalog(blankDb());
      await persist({ ...diff(null, blank, { tables: TABLES, local: false, skip: skipRecord }), reset: true, clearOutbox: true, version: STORAGE_VERSION });
      setState(blank);
      setPending(0);
    }
    // a new link (another pharmacy, another cloud, or device-only data joining one) sends everything it holds once
    const next = { ...cur, url, key: token, account, tenant, slug, pharmacy, ...(other || cur.url !== url ? { cursor: 0, pushedAt: '', lastSync: '', outboxV2: false, till: undefined } : {}) };
    await saveSyncCfg(next);
    return other || !cur.lastSync;
  }, [saveSyncCfg, persist, setState]);

  // ---------- derived stock: per branch, per batch ----------
  // step 13 (src/stockindex.js): running balances; after a change only the new movements are added
  const stockIndexer = useRef(null);
  stockIndexer.current ??= createStockIndexer({ onMismatch: () => console.warn('Stock balances re-counted: the running totals differed from the full count') });
  const stockIndex = useMemo(() => stockIndexer.current(db?.movements, win), [db?.movements, win]); // stage 4: a window starts from brought-forward stock

  const batchMeta = useMemo(() => {
    const m = new Map();
    for (const b of db?.batches || []) { if (!m.has(b.productId)) m.set(b.productId, []); m.get(b.productId).push(b); }
    return m;
  }, [db?.batches]);

  const productById = useMemo(() => new Map((db?.products || []).map((p) => [p.id, p])), [db?.products]);

  /** Batches of a product at a branch with their quantities, earliest expiry first (FEFO order). */
  const batchesOf = useCallback((pid, br = branchId) => {
    const p = productById.get(pid);
    const list = (batchMeta.get(pid) || []).map((b) => ({ ...b, qty: stockIndex.batch.get(br + '|' + b.id) || 0 }));
    const legacy = stockIndex.batch.get(br + '|lb-' + pid);
    if (legacy) list.push({ id: 'lb-' + pid, productId: pid, batch: p?.batch || '—', expiry: p?.expiry || '', cost: p?.cost || 0, qty: legacy, legacy: true });
    return list.sort((a, b) => (a.expiry || '9999').localeCompare(b.expiry || '9999'));
  }, [batchMeta, stockIndex, productById, branchId]);

  // Products as seen from this device's branch: stock here, and the next batch to sell (earliest expiry with stock)
  const products = useMemo(() => (db?.products || []).map((p) => {
    const stock = stockIndex.product.get(branchId + '|' + p.id) || 0;
    let next = null;
    for (const b of batchMeta.get(p.id) || []) {
      if ((stockIndex.batch.get(branchId + '|' + b.id) || 0) > 0 && (!next || (b.expiry || '9999') < (next.expiry || '9999'))) next = b;
    }
    if (!next && (stockIndex.batch.get(branchId + '|lb-' + p.id) || 0) > 0) next = { batch: p.batch, expiry: p.expiry };
    return { ...p, stock, totalStock: stockIndex.total.get(p.id) || 0, batch: next?.batch ?? p.batch, expiry: next?.expiry ?? p.expiry };
  }), [db?.products, stockIndex, batchMeta, branchId]);

  const fmt = useCallback((n) => {
    const s = effectiveSettings || {};
    // The pharmacy's own locale (default en-UG), not the device's, so grouping/decimals are the same on every device (1.5)
    return formatMoney(n, { currency: s.currency || '', decimals: Number(s.decimals ?? 0), locale: s.locale || 'en-UG' });
  }, [effectiveSettings]);

  const branch = db?.branches.find((b) => b.id === branchId) || db?.branches[0];
  // step 7: document numbers (src/docnumbers.js). Called inside update(): the count is saved with the document.
  const numberFor = useCallback((d, kind) => nextNumber(d, put, kind, { till: cfgRef.current?.till, branch: d.branches?.find((b) => b.id === branchId) || branch }), [branchId, branch]);
  // a till number from the cloud once this device is signed in to one (the same device always gets the same number)
  useEffect(() => {
    if (!user || !syncCfg?.url || !syncCfg?.key || syncCfg?.till) return;
    let gone = false;
    const ask = () => tillNumber(syncCfg).then((r) => { if (!gone && r?.till > 0 && cfgRef.current?.key === syncCfg.key) saveSyncCfg({ ...cfgRef.current, till: r.till }); }).catch(() => {});
    ask();
    const again = setInterval(ask, 60000); // offline or an older cloud: keep the old-style numbers and ask again later
    return () => { gone = true; clearInterval(again); };
  }, [user, syncCfg?.url, syncCfg?.key, syncCfg?.till, syncCfg?.deviceId]); // eslint-disable-line react-hooks/exhaustive-deps
  const features = useMemo(() => (db ? featureSet(db) : {}), [db?.license, db?.settings]); // eslint-disable-line react-hooks/exhaustive-deps
  const perms = useMemo(() => (db && user ? permissionsOf(db, user.role) : new Set()), [db?.roles, user]); // eslint-disable-line react-hooks/exhaustive-deps
  const can = useCallback((p) => perms.has(p), [perms]);

  // Today's figures start again at local midnight, even on a screen that stays open overnight
  const [day, setDay] = useState(today);
  useEffect(() => {
    const n = new Date(); const next = new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1, 0, 0, 2);
    const t = setTimeout(() => setDay(today()), next - n);
    return () => clearTimeout(t);
  }, [day]);

  // One value for the pages, made again only when something in it changes (a new object every render would
  // re-render every page whenever anything in the store moved)
  const value = useMemo(() => (db && syncCfg ? {
    db: viewDb, sharedSettings: db.settings, pharmacyOverrides, resetPharmacyOverrides, update, upsert, remove, saveSettings, user, setUser, fmt, products, stockIndex, batchesOf,
    branchId, branch, setBranchId, numberFor, syncCfg, saveSyncCfg, syncNow, pullAll, linkPharmacy, features, can, day,
  } : null), [db, viewDb, pharmacyOverrides, resetPharmacyOverrides, update, upsert, remove, saveSettings, user, setUser, fmt, products, stockIndex, batchesOf,
    branchId, branch, setBranchId, numberFor, syncCfg, saveSyncCfg, syncNow, pullAll, linkPharmacy, features, can, day]);
  const syncValue = useMemo(() => ({ syncStatus, pending, storageIssue }), [syncStatus, pending, storageIssue]);

  if (!value) return <div className="loading"><div className="spinner" />Loading RxPOS…</div>;

  return (
    <Ctx.Provider value={value}>
      <SyncCtx.Provider value={syncValue}>{children}</SyncCtx.Provider>
    </Ctx.Provider>
  );
}

export const useStore = () => useContext(Ctx);
/** Sync status, changes waiting to be sent and storage problems (re-renders only the components that ask for them) */
export const useSyncState = () => useContext(SyncCtx);

export function downloadFile(name, content, type = 'text/plain') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(content instanceof Blob ? content : new Blob([content], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function toCSV(rows) {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]);
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
}

/** What each supplier last charged for each medicine: productId → [{ supplierId, supplierName, cost, date }], cheapest first */
export function supplierPrices(purchases) {
  const m = new Map();
  for (const p of purchases) {
    if (!p.supplierId) continue;
    for (const i of p.items || []) {
      if (!(i.cost > 0)) continue;
      let per = m.get(i.productId);
      if (!per) m.set(i.productId, (per = new Map()));
      const cur = per.get(p.supplierId);
      if (!cur || String(p.date) >= String(cur.date)) per.set(p.supplierId, { supplierId: p.supplierId, supplierName: p.supplierName, cost: i.cost, date: p.date });
    }
  }
  const out = new Map();
  for (const [k, per] of m) out.set(k, [...per.values()].sort((a, b) => a.cost - b.cost));
  return out;
}

/** Amount a customer owes: credit sales minus payments received. */
export function customerBalance(db, id) {
  const w = windowSums(db); // stage 4: a device keeping recent history (src/balances.js)
  if (w) return w.customer.get(id) || 0;
  const credit = db.sales.filter((s) => s.customerId === id).reduce((a, s) => a + clientOwes(s), 0); // an insurer's share is not the client's debt (step 22)
  const paid = db.payments.filter((p) => p.kind === 'customer' && p.partyId === id).reduce((a, p) => a + p.amount, 0);
  return credit - paid;
}
/** Amount we owe a supplier: purchases minus amounts paid on them, later payments and credit notes for returns. */
export function supplierBalance(db, id) {
  const w = windowSums(db);
  if (w) return w.supplier.get(id) || 0;
  const owed = db.purchases.filter((p) => p.supplierId === id).reduce((a, p) => a + (p.total - (p.paid ?? p.total)), 0);
  const paid = db.payments.filter((p) => p.kind === 'supplier' && p.partyId === id).reduce((a, p) => a + p.amount, 0);
  const credits = (db.supplierReturns || []).filter((r) => r.supplierId === id && r.settle === 'credit').reduce((a, r) => a + (r.total || 0), 0);
  return owed - paid - credits;
}

/** Normalise a Ugandan (or international) phone number to 2567XXXXXXXX form. */
export function normalizePhone(phone, country = '256') {
  let p = String(phone || '').replace(/[^\d+]/g, '');
  if (p.startsWith('+')) p = p.slice(1);
  if (p.startsWith('00')) p = p.slice(2);
  if (p.startsWith('0')) p = country + p.slice(1);
  if (p.length === 9) p = country + p;
  return p;
}
/** Fill {placeholders} in a message template. */
export const fillTemplate = (tpl, vars) => String(tpl || '').replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? m));

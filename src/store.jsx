import { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { idbGet, idbSet, idbDel, idbKeys } from './idb.js';
import { createSync } from './sync.js';

const SESSION_KEY = 'pharmapos-session';

// Every synced table. Records carry `updatedAt`; deletions leave a tombstone in `_tomb`.
export const TABLES = [
  'products', 'formulations', 'customers', 'suppliers', 'sales', 'proformas', 'purchases', 'movements',
  'prescriptions', 'expenses', 'expenseCategories', 'banks', 'bankTx', 'loans', 'payments', 'users',
  'batches', 'branches', 'transfers', 'audit', 'purchaseOrders',
];
// What is persisted on the device, one IndexedDB key per part
const PARTS = [...TABLES, 'settings', '_tomb'];
export const MAIN_BRANCH = 'main';

export async function listSnapshots() {
  return (await idbKeys()).filter((k) => String(k).startsWith('snap:')).sort().reverse().map((k) => k.slice(5));
}
export const loadSnapshot = (date) => idbGet('snap:' + date);

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-5);
export const now = () => new Date().toISOString();
export const today = () => new Date().toISOString().slice(0, 10);
export const daysUntil = (date) => Math.ceil((new Date(date) - new Date(today())) / 864e5);
export const daysSince = (date) => Math.floor((Date.now() - new Date(date)) / 864e5);

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
  const r = { ...rec, id: rec.id || uid(), updatedAt: now() };
  const i = d[table].findIndex((x) => x.id === r.id);
  if (i >= 0) d[table][i] = r;
  else d[table].unshift(r);
  return r;
}
export function del(d, table, id) {
  d[table] = d[table].filter((x) => x.id !== id);
  d._tomb.push({ t: table, id, at: now() });
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
/**
 * First-expiry-first-out: split `qty` across batches (sorted by expiry) and return [{batchId, qty, batch, expiry}].
 * Expired batches are skipped unless allowExpired.
 */
export function allocate(batches, qty, { allowExpired = false } = {}) {
  const out = [];
  let left = qty;
  const ok = (b) => allowExpired || !b.expiry || daysUntil(b.expiry) >= 0;
  for (const b of batches) {
    if (left <= 0) break;
    if (b.qty <= 0 || !ok(b)) continue;
    const take = Math.min(b.qty, left);
    out.push({ batchId: b.id, qty: take, batch: b.batch, expiry: b.expiry });
    left -= take;
  }
  // Anything left (stock not yet recorded) is booked against the next sellable batch so totals stay right
  if (left > 0) {
    const b = batches.find(ok) || batches[0];
    out.push({ batchId: b?.id || null, qty: left, batch: b?.batch || '', expiry: b?.expiry || '' });
  }
  return out;
}

// Fixed ids so the same defaults created on two devices merge instead of duplicating
const FORMS = ['Tablets', 'Capsules', 'Syrups', 'Suspensions', 'Injectables', 'Infusions', 'Creams', 'Ointments', 'Gels', 'Drops', 'Eye Drops', 'Ear Drops', 'Inhalers', 'Sachets', 'Suppositories', 'Pessaries', 'Lotions', 'Powders', 'Devices', 'Surgicals', 'Cosmetics', 'Supplements', 'Sundries', 'Others'];
const EXPENSE_CATS = ['Rent', 'Salaries', 'Electricity', 'Water', 'Transport', 'Airtime & Internet', 'Licenses & Fees', 'Repairs', 'Stationery', 'Other'];

function blankDb() {
  const t0 = '2000-01-01T00:00:00.000Z';
  const d = Object.fromEntries(TABLES.map((t) => [t, []]));
  d.formulations = FORMS.map((name) => ({ id: 'form-' + name.toLowerCase().replace(/\W+/g, '-'), name, updatedAt: t0 }));
  d.expenseCategories = EXPENSE_CATS.map((name) => ({ id: 'expcat-' + name.toLowerCase().replace(/\W+/g, '-'), name, updatedAt: t0 }));
  d.customers = [{ id: 'walk-in', name: 'Walk-in Customer', phone: '', updatedAt: t0 }];
  d.banks = [{ id: 'cash-drawer', name: 'Cash at hand', account: '', opening: 0, updatedAt: t0 }];
  d.branches = [{ id: MAIN_BRANCH, name: 'Main branch', address: '', updatedAt: t0 }];
  d.settings = {
    name: 'My Pharmacy', address: '', phone: '', license: '', currency: 'UGX', decimals: 0, taxRate: 0,
    wholesaleMarkup: 25, retailMarkup: 50, expiryWarnDays: 90,
    receiptFooter: 'Thank you for your purchase. Get well soon!', paperWidth: 80, autoPrint: false,
    leadDays: 7, coverDays: 30, deadDays: 90,
    smsRefill: 'Hello {name}, this is {pharmacy}. Your refill of {medicine} is due on {date}. Reply or visit us to collect. Get well soon!',
    smsDebt: 'Hello {name}, this is a friendly reminder from {pharmacy} that your balance of {amount} is due. Thank you.',
    updatedAt: t0,
  };
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
    const b = addBatch(d, { productId: p.id, batch: 'B' + Math.floor(1000 + Math.random() * 9000), expiry: new Date(Date.now() + expDays * 864e5).toISOString().slice(0, 10), cost });
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
  for (const ch of changes) {
    if (ch.t === 'settings') {
      if (!d.settings.updatedAt || ch.at > d.settings.updatedAt) d.settings = { ...d.settings, ...ch.rec, updatedAt: ch.at };
      continue;
    }
    if (!d[ch.t]) continue;
    index[ch.t] ??= new Map(d[ch.t].map((r, i) => [r.id, i]));
    const i = index[ch.t].get(ch.id);
    const local = i !== undefined ? d[ch.t][i] : null;
    if (local && local.updatedAt >= ch.at) continue;
    if (ch.deleted) {
      if (local) { d[ch.t] = d[ch.t].filter((r) => r.id !== ch.id); delete index[ch.t]; }
    } else if (local) d[ch.t][i] = { ...ch.rec, updatedAt: ch.at };
    else { d[ch.t].push({ ...ch.rec, updatedAt: ch.at }); index[ch.t].set(ch.id, d[ch.t].length - 1); }
  }
  // newest first, like local inserts
  ['sales', 'purchases', 'expenses', 'payments', 'bankTx', 'proformas', 'prescriptions', 'transfers', 'audit', 'purchaseOrders'].forEach((t) =>
    d[t].sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))));
  return d;
}

const Ctx = createContext(null);

export function StoreProvider({ children }) {
  const [db, setDb] = useState(null);
  const [syncCfg, setSyncCfgState] = useState(null);
  const [syncStatus, setSyncStatus] = useState({ state: 'off' });
  const [user, setUserState] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem(SESSION_KEY)); } catch { return null; }
  });
  const dbRef = useRef(null);
  dbRef.current = db;

  // load: each table is stored under its own key so a sale only rewrites the tables it touched
  const savedRefs = useRef({});
  useEffect(() => {
    (async () => {
      let saved = null, cfg = null;
      try {
        cfg = await idbGet('sync');
        const parts = await Promise.all(PARTS.map((k) => idbGet('t:' + k)));
        if (parts.some((p) => p !== undefined)) saved = Object.fromEntries(PARTS.map((k, i) => [k, parts[i]]).filter(([, v]) => v !== undefined));
        else saved = await idbGet('db'); // data saved by version 1.0
      } catch (e) { console.error(e); }
      const base = blankDb();
      const loaded = saved ? { ...base, ...saved, settings: { ...base.settings, ...saved.settings } } : base;
      if (!loaded.branches.length) loaded.branches = base.branches;
      if (saved) PARTS.forEach((k) => { if (saved[k] !== undefined) savedRefs.current[k] = loaded[k]; });
      setDb(loaded);
      setSyncCfgState({ deviceId: uid(), url: '', key: '', pushedAt: '', cursor: 0, branchId: MAIN_BRANCH, ...(cfg || {}) });
    })();
  }, []);

  // save changed tables (debounced), and flush immediately when the app is hidden or closed
  useEffect(() => {
    if (!db) return;
    const save = () => {
      for (const k of PARTS) {
        if (savedRefs.current[k] === db[k]) continue;
        savedRefs.current[k] = db[k];
        idbSet('t:' + k, db[k]).catch((e) => { savedRefs.current[k] = null; console.error(e); });
      }
    };
    const t = setTimeout(save, 250);
    const flush = () => document.visibilityState === 'hidden' && save();
    document.addEventListener('visibilitychange', flush);
    window.addEventListener('pagehide', save);
    return () => { clearTimeout(t); document.removeEventListener('visibilitychange', flush); window.removeEventListener('pagehide', save); };
  }, [db]);

  // Daily on-device snapshot (last 7 kept) so a mistake can be undone even without a hub or manual backup
  useEffect(() => {
    if (!db || !db.users.length) return;
    const key = 'snap:' + today();
    const t = setTimeout(async () => {
      try {
        if (await idbGet(key)) return;
        await idbSet(key, db);
        const snaps = (await idbKeys()).filter((k) => String(k).startsWith('snap:')).sort();
        for (const old of snaps.slice(0, -7)) await idbDel(old);
      } catch (e) { console.error(e); }
    }, 5000);
    return () => clearTimeout(t);
  }, [db]);

  const saveSyncCfg = useCallback((cfg) => {
    setSyncCfgState(cfg);
    idbSet('sync', cfg).catch(console.error);
  }, []);

  const update = useCallback((fn) => setDb((prev) => { const d = draft(prev); fn(d); return d; }), []);
  const upsert = useCallback((table, rec) => update((d) => { put(d, table, rec); }), [update]);
  const remove = useCallback((table, id) => update((d) => { del(d, table, id); }), [update]);
  const saveSettings = useCallback((s) => update((d) => { d.settings = { ...s, updatedAt: now() }; }), [update]);

  const branchId = syncCfg?.branchId || MAIN_BRANCH;
  const setBranchId = useCallback((id) => saveSyncCfg({ ...cfgRef.current, branchId: id }), [saveSyncCfg]);

  const setUser = useCallback((u) => {
    try {
      if (u) sessionStorage.setItem(SESSION_KEY, JSON.stringify(u));
      else sessionStorage.removeItem(SESSION_KEY);
    } catch {}
    if (u && !user) update((d) => audit(d, u, 'Signed in', navigator.userAgent.includes('Electron') ? 'Desktop app' : window.Capacitor ? 'Android app' : 'Browser', branchId));
    setUserState(u);
  }, [user, update, branchId]);

  // background sync with the hub (when configured)
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
      applyRemote: (changes) => setDb((prev) => mergeRemote(prev, changes)),
      onStatus: setSyncStatus,
    });
    return syncRef.current.stop;
  }, [hasCfg, syncCfg?.url, syncCfg?.key, saveSyncCfg]);
  const syncNow = useCallback(() => syncRef.current?.run(), []);

  // ---------- derived stock: per branch, per batch ----------
  const stockIndex = useMemo(() => {
    const batch = new Map(); // `${branch}|${batchId}` → qty
    const product = new Map(); // `${branch}|${productId}` → qty
    const total = new Map(); // productId → qty across all branches
    for (const mv of db?.movements || []) {
      const br = mv.branchId || MAIN_BRANCH;
      const bk = br + '|' + (mv.batchId || 'lb-' + mv.productId);
      const pk = br + '|' + mv.productId;
      batch.set(bk, (batch.get(bk) || 0) + mv.qty);
      product.set(pk, (product.get(pk) || 0) + mv.qty);
      total.set(mv.productId, (total.get(mv.productId) || 0) + mv.qty);
    }
    return { batch, product, total };
  }, [db?.movements]);

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
    const s = db?.settings || {};
    const dec = Number(s.decimals ?? 0);
    return `${s.currency || ''} ${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: dec, maximumFractionDigits: dec })}`.trim();
  }, [db?.settings]);

  const branch = db?.branches.find((b) => b.id === branchId) || db?.branches[0];

  if (!db || !syncCfg) return <div className="loading"><div className="spinner" />Loading PharmaPOS…</div>;

  return (
    <Ctx.Provider value={{ db, setDb, update, upsert, remove, saveSettings, user, setUser, fmt, products, stockIndex, batchesOf,
      branchId, branch, setBranchId, syncCfg, saveSyncCfg, syncStatus, syncNow }}>
      {children}
    </Ctx.Provider>
  );
}

export const useStore = () => useContext(Ctx);

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

/** Amount a customer owes: credit sales minus payments received. */
export function customerBalance(db, id) {
  const credit = db.sales.filter((s) => s.customerId === id && s.status !== 'refunded').reduce((a, s) => a + (s.total - (s.paid ?? s.total)), 0);
  const paid = db.payments.filter((p) => p.kind === 'customer' && p.partyId === id).reduce((a, p) => a + p.amount, 0);
  return credit - paid;
}
/** Amount we owe a supplier: purchases minus amounts paid on them and later payments. */
export function supplierBalance(db, id) {
  const owed = db.purchases.filter((p) => p.supplierId === id).reduce((a, p) => a + (p.total - (p.paid ?? p.total)), 0);
  const paid = db.payments.filter((p) => p.kind === 'supplier' && p.partyId === id).reduce((a, p) => a + p.amount, 0);
  return owed - paid;
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

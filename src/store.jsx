import { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { idbGet, idbSet, idbDel, idbKeys } from './idb.js';
import { createSync } from './sync.js';

const SESSION_KEY = 'pharmapos-session';

// Every synced table. Records carry `updatedAt`; deletions leave a tombstone in `_tomb`.
export const TABLES = [
  'products', 'formulations', 'customers', 'suppliers', 'sales', 'proformas', 'purchases', 'movements',
  'prescriptions', 'expenses', 'expenseCategories', 'banks', 'bankTx', 'loans', 'payments', 'users',
];
// What is persisted on the device, one IndexedDB key per part
const PARTS = [...TABLES, 'settings', '_tomb'];

export async function listSnapshots() {
  return (await idbKeys()).filter((k) => String(k).startsWith('snap:')).sort().reverse().map((k) => k.slice(5));
}
export const loadSnapshot = (date) => idbGet('snap:' + date);

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-5);
export const now = () => new Date().toISOString();
export const today = () => new Date().toISOString().slice(0, 10);
export const daysUntil = (date) => Math.ceil((new Date(date) - new Date(today())) / 864e5);

export async function hashPassword(pw) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('pharmapos:' + pw));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ---- draft helpers (used inside update(d => …)) ----
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
/** Record a stock movement. Stock is always the sum of movements, so devices can merge safely. */
export function move(d, { productId, qty, type, ref = '', note = '', user = '' }) {
  return put(d, 'movements', { id: uid(), productId, qty: Number(qty), type, ref, note, user, date: now() });
}

// Fixed ids so the same defaults created on two devices merge instead of duplicating
const FORMS = ['Tablet', 'Capsule', 'Syrup', 'Suspension', 'Injection', 'Infusion', 'Cream', 'Ointment', 'Gel', 'Drops', 'Inhaler', 'Sachet', 'Suppository', 'Pessary', 'Lotion', 'Powder', 'Device', 'Sundry'];
const EXPENSE_CATS = ['Rent', 'Salaries', 'Electricity', 'Water', 'Transport', 'Airtime & Internet', 'Licenses & Fees', 'Repairs', 'Stationery', 'Other'];

function blankDb() {
  const t0 = '2000-01-01T00:00:00.000Z';
  const d = Object.fromEntries(TABLES.map((t) => [t, []]));
  d.formulations = FORMS.map((name) => ({ id: 'form-' + name.toLowerCase(), name, updatedAt: t0 }));
  d.expenseCategories = EXPENSE_CATS.map((name) => ({ id: 'expcat-' + name.toLowerCase().replace(/\W+/g, '-'), name, updatedAt: t0 }));
  d.customers = [{ id: 'walk-in', name: 'Walk-in Customer', phone: '', updatedAt: t0 }];
  d.banks = [{ id: 'cash-drawer', name: 'Cash at hand', account: '', opening: 0, updatedAt: t0 }];
  d.settings = {
    name: 'My Pharmacy', address: '', phone: '', license: '', currency: 'UGX', decimals: 0, taxRate: 0,
    wholesaleMarkup: 25, retailMarkup: 50, expiryWarnDays: 90,
    receiptFooter: 'Thank you for your purchase. Get well soon!', updatedAt: t0,
  };
  d._tomb = [];
  return d;
}

const SAMPLE = [
  ['Paracetamol 500mg', 'Paracetamol', 'Analgesic', 'Tablet', 30, 50, 100, 1200, 200, 400],
  ['Amoxicillin 500mg', 'Amoxicillin', 'Antibiotic', 'Capsule', 120, 180, 250, 600, 100, 200, true],
  ['Ibuprofen 400mg', 'Ibuprofen', 'NSAID', 'Tablet', 40, 70, 100, 800, 150, 25],
  ['Metformin 500mg', 'Metformin', 'Antidiabetic', 'Tablet', 60, 90, 150, 90, 120, 300, true],
  ['Amlodipine 5mg', 'Amlodipine', 'Antihypertensive', 'Tablet', 50, 80, 150, 400, 100, 500, true],
  ['Omeprazole 20mg', 'Omeprazole', 'PPI', 'Capsule', 70, 110, 200, 350, 80, 60],
  ['ORS Sachet', 'Oral Rehydration Salts', 'Electrolyte', 'Sachet', 300, 400, 500, 40, 50, 700],
  ['Cough Syrup 100ml', 'Dextromethorphan', 'Antitussive', 'Syrup', 3500, 4500, 6000, 60, 20, 15],
  ['Vitamin C 1000mg', 'Ascorbic acid', 'Supplement', 'Tablet', 80, 120, 200, 500, 100, 365],
  ['Artemether/Lumefantrine 20/120', 'Artemether/Lumefantrine', 'Antimalarial', 'Tablet', 4000, 5500, 7000, 75, 30, 240, true],
];

export function addSampleData(d, user) {
  SAMPLE.forEach(([name, generic, category, form, cost, wholesale, price, stock, reorder, expDays, rx]) => {
    const p = put(d, 'products', {
      name, generic, category, form, cost, wholesale, price, reorder, unit: form === 'Syrup' ? 'Bottle' : 'Piece',
      barcode: '', batch: 'B' + Math.floor(1000 + Math.random() * 9000),
      expiry: new Date(Date.now() + expDays * 864e5).toISOString().slice(0, 10), rx: !!rx,
    });
    move(d, { productId: p.id, qty: stock, type: 'Opening stock', user });
  });
  put(d, 'suppliers', { name: 'Sample Wholesale Ltd', contact: '', phone: '', email: '', address: '' });
}

function draft(db) {
  const d = { ...db, settings: { ...db.settings }, _tomb: db._tomb.slice() };
  TABLES.forEach((t) => (d[t] = db[t].slice()));
  return d;
}

/** Merge records pulled from the hub: last writer (by updatedAt) wins per record. */
export function mergeRemote(db, changes) {
  const d = draft(db);
  const index = {};
  for (const ch of changes) {
    if (ch.t === 'settings') {
      if (!d.settings.updatedAt || ch.at > d.settings.updatedAt) d.settings = { ...ch.rec, updatedAt: ch.at };
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
  ['sales', 'purchases', 'expenses', 'payments', 'bankTx', 'proformas', 'prescriptions'].forEach((t) =>
    d[t].sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))));
  return d;
}

const Ctx = createContext(null);

export function StoreProvider({ children }) {
  const [db, setDb] = useState(null);
  const [syncCfg, setSyncCfgState] = useState(null);
  const [syncStatus, setSyncStatus] = useState({ state: 'off' });
  const [user, setUser] = useState(() => {
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
      if (saved) PARTS.forEach((k) => { if (saved[k] !== undefined) savedRefs.current[k] = loaded[k]; });
      setDb(loaded);
      setSyncCfgState(cfg || { deviceId: uid(), url: '', key: '', pushedAt: '', cursor: 0 });
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

  useEffect(() => {
    try {
      if (user) sessionStorage.setItem(SESSION_KEY, JSON.stringify(user));
      else sessionStorage.removeItem(SESSION_KEY);
    } catch {}
  }, [user]);

  const saveSyncCfg = useCallback((cfg) => {
    setSyncCfgState(cfg);
    idbSet('sync', cfg).catch(console.error);
  }, []);

  const update = useCallback((fn) => setDb((prev) => { const d = draft(prev); fn(d); return d; }), []);
  const upsert = useCallback((table, rec) => update((d) => { put(d, table, rec); }), [update]);
  const remove = useCallback((table, id) => update((d) => { del(d, table, id); }), [update]);
  const saveSettings = useCallback((s) => update((d) => { d.settings = { ...s, updatedAt: now() }; }), [update]);

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

  // derived stock levels
  const stock = useMemo(() => {
    const m = {};
    db?.movements.forEach((mv) => (m[mv.productId] = (m[mv.productId] || 0) + mv.qty));
    return m;
  }, [db?.movements]);
  const products = useMemo(() => db?.products.map((p) => ({ ...p, stock: stock[p.id] || 0 })) || [], [db?.products, stock]);

  const fmt = useCallback((n) => {
    const s = db?.settings || {};
    const dec = Number(s.decimals ?? 0);
    return `${s.currency || ''} ${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: dec, maximumFractionDigits: dec })}`.trim();
  }, [db?.settings]);

  if (!db || !syncCfg) return <div className="loading">Loading PharmaPOS…</div>;

  return (
    <Ctx.Provider value={{ db, setDb, update, upsert, remove, saveSettings, user, setUser, fmt, products, stock,
      syncCfg, saveSyncCfg, syncStatus, syncNow }}>
      {children}
    </Ctx.Provider>
  );
}

export const useStore = () => useContext(Ctx);

export function downloadFile(name, content, type = 'text/plain') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type }));
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

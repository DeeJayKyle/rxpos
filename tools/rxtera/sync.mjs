// Rxtera → RxPOS pharmacy: everything Rxtera holds. Re-runnable: fixed ids, only changed records are written.
// Usage: node tools/rxtera/sync.mjs <tenant-id> <data-folder> [--dry] [--all-medicines] [--mirror | --new-only]
//   e.g. node tools/rxtera/sync.mjs mcb-pharma mcb --mirror --dry
//   reads   <data-folder>/*.json (a path, or a name under %LOCALAPPDATA%/Temp/rxm) saved by receiver.cjs — see README.md
//   writes  the RxPOS cloud (RXPOS_API) through the owner API. Owner key: OWNER_KEY, or Documents/RxPOS-Data/RxPOS-OWNER-KEY.txt
// Optional files (used when present): saleheads, creditnotes, purchaselines, purchaseheads, debitnotes, extra, stockcount-N (Rxtera's logo is never copied)
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';

const DRY = process.argv.includes('--dry');
const ALL_MEDS = process.argv.includes('--all-medicines') || process.argv.includes('--mirror');
// --mirror: the pharmacy becomes an exact copy of Rxtera. Everything else is removed (staff, roles, settings, branches, chat and the audit trail stay)
const MIRROR = process.argv.includes('--mirror');
// --new-only: add only what RxPOS doesn't have yet (new sales, purchases, expenses, medicines, batches…); never edit or remove
const NEW_ONLY = process.argv.includes('--new-only');
if (NEW_ONLY && MIRROR) throw new Error('Use either --new-only or --mirror, not both');
const [TENANT, FOLDER] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (!TENANT || !FOLDER) throw new Error('Usage: node tools/rxtera/sync.mjs <tenant-id> <data-folder> [--dry] [--all-medicines] [--mirror]');
const BASE = (process.env.RXPOS_API || 'https://api.rxposug.com').replace(/\/+$/, '') + '/api/owner/tenants';
const API = BASE + '/' + TENANT;
const DIR = fs.existsSync(FOLDER) ? path.resolve(FOLDER) : path.join(process.env.LOCALAPPDATA || '.', 'Temp/rxm', FOLDER);
const KEY = process.env.OWNER_KEY || fs.readFileSync(path.join(os.homedir(), 'Documents/RxPOS-Data/RxPOS-OWNER-KEY.txt'), 'utf8')
  .split(/\r?\n/).map((l) => l.trim()).filter((l) => /^[A-Za-z0-9_-]{20,}$/.test(l)).pop();
const catalog = JSON.parse(fs.readFileSync(new URL('../../src/data/catalog.json', import.meta.url), 'utf8'));
const exists = (f) => fs.existsSync(path.join(DIR, f));
const read = (f) => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
const opt = (f, d) => (exists(f) ? read(f) : d);
const h = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 12);
const hashRec = (r) => h(JSON.stringify(r));
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const slug = (s) => String(s || '').toLowerCase().replace(/\W+/g, '-').replace(/^-|-$/g, '');
const num = (s) => Number(String(s ?? '').replace(/[^0-9.-]/g, '')) || 0;
const r2 = (x) => Math.round(x * 100) / 100;
const NOW = new Date().toISOString();
const TODAY = NOW.slice(0, 10);
const local = (s) => { s = String(s).trim(); if (/^\d{4}-\d{2}-\d{2}$/.test(s)) s += ' 12:00'; return new Date(s.replace(' ', 'T') + (s.length <= 16 ? ':00' : '') + '+03:00').toISOString(); }; // Uganda time

const call = async (url, o = {}) => {
  for (let tries = 0; ; tries++) {
    try {
      const r = await fetch(url, { ...o, headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(120000) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'HTTP ' + r.status);
      return j;
    } catch (e) { if (tries >= 4) throw e; await new Promise((r) => setTimeout(r, 3000 * (tries + 1))); }
  }
};
const api = (p, o) => call(API + p, o);

// ---------- what RxPOS has now ----------
// (the one-shot export is too heavy for big pharmacies, so read tables page by page; sales/purchases sent before are
//  remembered in <folder>/sent.json as id → content hash)
const loadTable = async (t) => { const rows = []; for (let off = 0; ; off += 50) { const j = await api('/records?t=' + t + '&offset=' + off); rows.push(...j.rows.map((r) => r.rec).filter(Boolean)); if (j.rows.length < 50) return rows; } };
const SENT = path.join(DIR, 'sent.json');
const sent = { sales: {}, purchases: {}, ...(exists('sent.json') ? read('sent.json') : {}) };
const cur = {};
// (--new-only never corrects existing stock, so it skips reading the long stock-movement history)
for (const t of ['products', 'batches', 'movements', 'suppliers', 'customers', 'formulations', 'expenseCategories', 'expenses', 'banks', 'audit', 'users']) cur[t] = NEW_ONLY && t === 'movements' ? [] : await loadTable(t);
const has = (t) => new Map((cur[t] || []).map((r) => [r.id, r]));
const curProducts = has('products'), curBatches = has('batches'), curCust = has('customers'), curSupp = has('suppliers');

// ---------- Rxtera data ----------
const meds = read('medicines.json');
const qe = read('quickedit.json').rows; // Trade name, Retail, W/sale, Cost, Batch, Qty, Expiry
const ch = read('costhistory.json').rows; // Trade, Generic, Batch, Cost, QtyAvail, QtyStocked, Expiry, Supplier, Arrival
const other = read('other.json');
const saleLines = fs.readdirSync(DIR).filter((f) => /^sales-\d{4}-\d{2}\.json$/.test(f)).flatMap((f) => read(f)); // dt, cust, disp, inv, trade, generic, qty, amount, profit
const pl = opt('purchaselines.json', null)?.rows || null; // Arrival, Invoice, Entrant, Supplier, Trade, Generic, Type, Batch, Expiry, Qty, Cost, Total, QtyRem, Value
const pheads = opt('purchaseheads.json', []); // id, date, supplier, payType, invoiceNo, total, entrant, notes
const sheads = opt('saleheads.json', []); // id, date, time, customer, notes, phone, payment, total, entrant, viewHtml
const creditNotes = opt('creditnotes.json', []);
const debitNotes = opt('debitnotes.json', []);
const extra = opt('extra.json', null);

const medByName = new Map();
for (const m of meds) if (!medByName.has(norm(m.name))) medByName.set(norm(m.name), m);
const catByName = new Map();
catalog.rows.forEach((r, i) => { if (!catByName.has(norm(r[0]))) catByName.set(norm(r[0]), i); });
const tenantByName = new Map();
for (const p of curProducts.values()) tenantByName.set(norm(p.name), p);

// the medicines to bring over: everything stocked, bought or sold (or the whole Rxtera list with --all-medicines)
const names = new Map(); // norm → { name, generic }
const note = (name, generic) => { const k = norm(name); if (k && !names.has(k)) names.set(k, { name: String(name).trim(), generic: String(generic || '').trim() }); };
for (const r of qe) note(r[0], '');
for (const r of ch) note(r[0], r[1]);
for (const r of pl || []) note(r[4], r[5]);
for (const l of saleLines) note(l[4], l[5]);
if (ALL_MEDS) for (const m of meds) note(m.name, m.generic);

// latest cost per medicine: newest delivery, else stock batches
const lastCost = new Map();
for (const r of [...ch].sort((a, b) => String(a[8]).localeCompare(String(b[8])))) if (num(r[3]) > 0) lastCost.set(norm(r[0]), num(r[3]));
for (const r of qe) if (!lastCost.has(norm(r[0])) && num(r[3]) > 0) lastCost.set(norm(r[0]), num(r[3]));
const qePrice = new Map(qe.map((r) => [norm(r[0]), { retail: num(r[1]), wholesale: num(r[2]) }]));

const out = []; // {t, id, rec, deleted}
const same = (a, b, keys) => a && keys.every((k) => JSON.stringify(a[k] ?? null) === JSON.stringify(b[k] ?? null));
const stats = {};
const bump = (k) => { stats[k] = (stats[k] || 0) + 1; };

// ---------- formulations (Rxtera "medicine types") ----------
const formIds = new Map((cur.formulations || []).map((f) => [norm(f.name), f.id]));
const forms = new Set([...(extra?.formulations.rows || []).map((r) => r[0]), ...meds.map((m) => m.type)].filter(Boolean).map((s) => s.trim()));
for (const name of forms) if (!formIds.has(norm(name))) { const id = 'form-' + slug(name); formIds.set(norm(name), id); out.push({ t: 'formulations', id, rec: { id, name } }); bump('formulations'); }

// ---------- medicines ----------
const pid = new Map(); // norm name → product id
for (const [k, { name, generic }] of names) {
  const m = medByName.get(k);
  const t = tenantByName.get(k);
  const ci = catByName.get(k);
  const id = t?.id || (ci != null ? 'cat-' + (ci + 1) : 'rx-' + (m?.code || h(k)));
  pid.set(k, id);
  let base = t || curProducts.get(id);
  if (!base && ci != null) {
    const [n, g, form, price, wholesale, cost, barcode, unit] = catalog.rows[ci];
    base = { id, name: n, generic: g, form, price, wholesale: wholesale || price, cost: cost || 0, barcode: barcode || '2' + String(ci + 1).padStart(11, '0'), unit, reorder: 0, fromCatalog: true };
  } else if (!base) base = { id, name, unit: 'Unit', reorder: 0 };
  const q = qePrice.get(k);
  const price = num(m?.retail) || q?.retail || base.price || 0;
  const rec = {
    ...base,
    generic: (m?.generic || generic || base.generic || name).trim(),
    form: m?.type || base.form || 'Others',
    price,
    wholesale: num(m?.wholesale) || q?.wholesale || price,
    cost: lastCost.get(k) ?? base.cost ?? 0,
    reorder: num(m?.min) || base.reorder || 0,
    rxteraCode: m?.code || '',
  };
  delete rec._base; delete rec.updatedAt;
  if (!same(curProducts.get(id), rec, ['name', 'generic', 'form', 'price', 'wholesale', 'cost', 'reorder', 'rxteraCode'])) { out.push({ t: 'products', id, rec }); bump('products'); }
}

// ---------- batches + stock (RxPOS stock is set to exactly what Rxtera holds) ----------
const arrival = new Map(ch.map((r) => [norm(r[0]) + '|' + r[2] + '|' + r[6], r[8]]));
const target = new Map(); // batchId → qty
// the same batch can appear more than once in Rxtera (separate deliveries): one batch here, weighted cost
const qeAgg = new Map();
for (const r of qe) { const key = norm(r[0]) + '|' + r[4] + '|' + r[6]; const g = qeAgg.get(key); if (!g) qeAgg.set(key, [...r]); else { const q = num(g[5]) + num(r[5]); g[3] = q ? (num(g[3]) * num(g[5]) + num(r[3]) * num(r[5])) / q : num(r[3]); g[5] = q; } }
const batchByKey = new Map();
for (const r of qeAgg.values()) {
  const k = norm(r[0]);
  const key = k + '|' + r[4] + '|' + r[6];
  const id = 'rx-b-' + h(key);
  batchByKey.set(key, id);
  target.set(id, num(r[5]));
  const rec = { id, productId: pid.get(k), batch: r[4] || 'RX', expiry: r[6] || '', cost: r2(num(r[3])), received: arrival.get(key) || TODAY };
  if (!same(curBatches.get(id), rec, ['productId', 'batch', 'expiry', 'cost']) && !out.some((o) => o.id === id)) { out.push({ t: 'batches', id, rec }); bump('batches'); }
}
// mirror: only stock moves made by this tool for batches Rxtera still holds count; every other move is removed
const keptMoves = MIRROR ? (cur.movements || []).filter((m) => String(m.id).startsWith('rx-m-') && target.has(m.batchId)) : cur.movements || [];
if (MIRROR) for (const m of cur.movements || []) if (!keptMoves.includes(m)) { out.push({ t: 'movements', id: m.id, deleted: true }); bump('movementsRemoved'); }
const stockNow = new Map(); // batchId|productId → qty
for (const mv of keptMoves) { const k = (mv.batchId || '') + '|' + mv.productId; stockNow.set(k, (stockNow.get(k) || 0) + Number(mv.qty || 0)); }
const batchProduct = new Map([...curBatches.values()].map((b) => [b.id, b.productId]));
for (const o of out) if (o.t === 'batches') batchProduct.set(o.id, o.rec.productId);
const run = NOW.replace(/\D/g, '').slice(0, 12);
const want = new Map();
for (const [b, q] of target) want.set(b + '|' + batchProduct.get(b), q);
if (!MIRROR) for (const k of stockNow.keys()) if (!want.has(k)) want.set(k, 0); // anything Rxtera doesn't hold goes to zero
for (const [k, q] of want) {
  const diff = q - (stockNow.get(k) || 0);
  if (!diff) continue;
  const [batchId, productId] = k.split('|');
  const first = !stockNow.has(k);
  bump(first ? 'openingStock' : 'stockSync');
  const id = 'rx-m-' + run + '-' + h(k);
  out.push({ t: 'movements', id, rec: { id, productId, qty: diff, type: first ? 'Opening stock' : 'Stock sync', ref: 'Rxtera', note: 'Matched to Rxtera stock', user: 'Rxtera import', batchId: batchId || null, branchId: 'main', date: NOW } });
}

// ---------- suppliers & customers ----------
const NOT_SUPPLIER = /^stock (count|take)$/i;
const sid = new Map();
for (const r of other.suppliers.rows) {
  const [name, email, phone, address, contact] = r;
  if (NOT_SUPPLIER.test(name)) continue;
  const id = 'rx-sup-' + h(norm(name));
  sid.set(norm(name), id);
  const rec = { id, name, contact, phone, email, address, tin: '' };
  if (!same(curSupp.get(id), rec, ['name', 'contact', 'phone', 'email', 'address'])) { out.push({ t: 'suppliers', id, rec }); bump('suppliers'); }
}
const cid = new Map();
const clean = (v) => (/^not applicable$/i.test(v || '') ? '' : v || '');
for (const r of other.customers.rows) {
  const [name, address, phone, email, notes] = r;
  if (/^client$/i.test(name.trim())) continue; // Rxtera's walk-in placeholder
  const id = 'rx-cus-' + h(norm(name));
  cid.set(norm(name), id);
  const rec = { id, name, address: clean(address), phone: clean(phone), email: clean(email), notes: clean(notes), type: 'Retail', creditLimit: 0 };
  if (!same(curCust.get(id), rec, ['name', 'address', 'phone', 'email', 'notes'])) { out.push({ t: 'customers', id, rec }); bump('customers'); }
}

// helper: write a sale/purchase only when its content changed since the last run
const keepIds = { sales: new Set(), purchases: new Set() };
const putHist = (t, rec) => { keepIds[t].add(rec.id); const hs = hashRec(rec); if (sent[t][rec.id] === hs) return; out.push({ t, id: rec.id, rec, hash: hs }); bump(t); };
const parseNote = (n) => { // "... No. Brand Name Generic No. Price Quantity Total 1 X Y 2800 -5 -14000 Total: ... Old Invoice Total: UGX a Credit Total: UGX b New Invoice Total: UGX c"
  const d = n.detail || '';
  const lines = (d.split('||')[1] || '').replace(/^.*?Price Quantity Total/, '').split(/Total:/)[0].trim();
  return { no: n.row[0], date: local(n.row[2]), by: n.row[5], oldTotal: r2(num(n.row[3])), newTotal: r2(num(n.row[4])), changes: lines.slice(0, 600) };
};

// ---------- purchase history (record only: stock already set above) ----------
const isoDay = (s) => String(s).slice(0, 10);
if (pl) {
  // real invoices: lines from Rxtera's Purchase Report, payment/entrant/notes from its Invoices History
  const heads = pheads.map((r) => ({ id: r[0], date: r[1], supplier: r[2], pay: r[3], invoice: String(r[4]), total: num(r[5]), entrant: r[6], notes: r[7] }));
  const dn = new Map();
  for (const n of debitNotes) { const k = String(n.row[1]); if (!dn.has(k)) dn.set(k, []); dn.get(k).push(parseNote(n)); }
  const groups = new Map();
  for (const r of pl) { if (NOT_SUPPLIER.test(r[3])) continue; const g = r[1] + '|' + r[3] + '|' + isoDay(r[0]); if (!groups.has(g)) groups.set(g, []); groups.get(g).push(r); }
  const used = new Set();
  for (const [g, rows] of groups) {
    const [invoice, supplier, day] = g.split('|');
    const cands = heads.filter((x) => x.invoice === invoice && norm(x.supplier) === norm(supplier) && !used.has(x.id));
    const head = cands.sort((a, b) => Math.abs(new Date(a.date) - new Date(day)) - Math.abs(new Date(b.date) - new Date(day)))[0];
    if (head) used.add(head.id);
    const items = rows.map((r) => ({ productId: pid.get(norm(r[4])) || null, name: r[4], qty: num(r[9]), cost: num(r[10]), batch: r[7], expiry: r[8], batchId: batchByKey.get(norm(r[4]) + '|' + r[7] + '|' + r[8]) || null }));
    const total = r2(items.reduce((a, i) => a + i.qty * i.cost, 0));
    const edits = head ? (dn.get(String(head.id)) || []).sort((a, b) => a.date.localeCompare(b.date)) : [];
    const id = 'rx-p-' + h('inv|' + g);
    putHist('purchases', {
      id, number: 'RXP-' + (head?.id ?? h(g).slice(0, 5)), supplierId: sid.get(norm(supplier)) || '', supplierName: supplier, invoice, date: day,
      receivedBy: head?.entrant || rows[0][2] || 'Rxtera', total, paid: total, payment: head?.pay ? head.pay[0].toUpperCase() + head.pay.slice(1) : 'Cash', bankId: 'cash-drawer', branchId: 'main',
      items, notes: head?.notes || '', imported: 'Rxtera', rxteraId: head?.id ?? null,
      ...(edits.length ? { edits: edits.map((e) => ({ at: e.date, by: e.by, reason: `Rxtera debit note ${e.no}: ${e.changes}`, oldTotal: e.oldTotal, newTotal: e.newTotal })), editedAt: edits.at(-1).date, editedBy: edits.at(-1).by } : {}),
    });
  }
  stats.purchaseInvoicesWithoutHeader = [...groups.keys()].length - used.size;
} else {
  const groups = new Map();
  for (const r of ch) { if (NOT_SUPPLIER.test(r[7])) continue; const g = r[7] + '|' + r[8]; if (!groups.has(g)) groups.set(g, []); groups.get(g).push(r); }
  for (const [g, rows] of groups) {
    const [supplier, date] = g.split('|');
    const items = rows.map((r) => ({ productId: pid.get(norm(r[0])), name: r[0], qty: num(r[5]), cost: num(r[3]), batch: r[2], expiry: r[6] }));
    const total = items.reduce((a, i) => a + i.qty * i.cost, 0);
    putHist('purchases', { id: 'rx-p-' + h(g), number: 'RXP-' + date.replace(/-/g, '') + '-' + h(g).slice(0, 4).toUpperCase(), supplierId: sid.get(norm(supplier)) || '', supplierName: supplier, invoice: '', date, receivedBy: 'Rxtera', total, paid: total, bankId: 'cash-drawer', branchId: 'main', items, imported: 'Rxtera' });
  }
}

// ---------- sales history (record only) ----------
const headBy = new Map(sheads.map((r) => [String(r[0]), r]));
const cn = new Map();
for (const n of creditNotes) { const k = String(n.row[1]); if (!cn.has(k)) cn.set(k, []); cn.get(k).push(parseNote(n)); }
const inv = new Map();
for (const l of saleLines) { if (!inv.has(l[3])) inv.set(l[3], []); inv.get(l[3]).push(l); }
for (const [no, lines] of inv) {
  const hd = headBy.get(String(no));
  const items = lines.map((l) => { const qty = num(l[6]) || 1, amount = num(l[7]), profit = num(l[8]); return { id: pid.get(norm(l[4])) || null, name: l[4] || '(medicine removed in Rxtera)', price: r2(amount / qty), cost: r2((amount - profit) / qty), qty, alloc: [] }; });
  const total = r2(lines.reduce((a, l) => a + num(l[7]), 0));
  const cust = hd?.[3] || lines[0][1];
  const customerId = cid.get(norm(cust)) || 'walk-in';
  const payment = hd?.[6] || 'Cash';
  const type = (String(hd?.[9] || '').match(/saleType=(\w+)/) || [])[1] || 'retail';
  const edits = (cn.get(String(no)) || []).sort((a, b) => a.date.localeCompare(b.date));
  putHist('sales', {
    id: 'rx-s-' + no, number: 'RX' + no, date: local(lines[0][0]), type, branchId: 'main', items, subtotal: total, discount: 0, tax: 0, total,
    payment, paid: total, tendered: total, bankId: 'cash-drawer', customerId, customerName: customerId === 'walk-in' ? 'Walk-in Customer' : cust,
    ...(hd?.[5] ? { customerPhone: hd[5] } : {}), ...(hd?.[4] ? { notes: hd[4] } : {}),
    cashier: lines[0][2] || hd?.[8] || '', status: 'completed', imported: 'Rxtera',
    ...(edits.length ? { edits: edits.map((e) => ({ at: e.date, by: e.by, reason: `Rxtera credit note ${e.no}: ${e.changes}`, oldTotal: e.oldTotal, newTotal: e.newTotal })), editedAt: edits.at(-1).date, editedBy: edits.at(-1).by } : {}),
  });
}
// sales listed in Rxtera with no item lines (e.g. an empty UGX 0 sale)
for (const hd of sheads) {
  const no = String(hd[0]);
  if (inv.has(no)) continue;
  const total = r2(num(hd[7]));
  putHist('sales', { id: 'rx-s-' + no, number: 'RX' + no, date: local(hd[1] + ' ' + (hd[2] || '12:00')), type: 'retail', branchId: 'main', items: [], subtotal: total, discount: 0, tax: 0, total,
    payment: hd[6] || 'Cash', paid: total, tendered: total, bankId: 'cash-drawer', customerId: 'walk-in', customerName: 'Walk-in Customer', cashier: hd[8] || '', status: 'completed', imported: 'Rxtera' });
}
// corrections on sales Rxtera later deleted altogether: kept in the audit trail
const curAuditIds = new Set((cur.audit || []).map((a) => a.id));
for (const [no, notes] of cn) {
  if (inv.has(no) || headBy.has(no)) continue;
  for (const e of notes) {
    const id = 'rx-cn-' + e.no;
    if (curAuditIds.has(id)) continue;
    out.push({ t: 'audit', id, rec: { id, date: e.date, user: e.by, action: 'Sale corrected (Rxtera)', branchId: 'main', details: `Rxtera credit note ${e.no} on sale ${no} (sale later deleted in Rxtera): total ${e.oldTotal} → ${e.newTotal}. ${e.changes}` } });
    bump('deletedSaleNotes');
  }
}
stats.salesWithCreditNotes = [...cn.keys()].filter((k) => inv.has(k)).length;
// earlier runs may have filed purchases under other ids: remove those so nothing is doubled
for (const t of ['sales', 'purchases']) for (const id of Object.keys(sent[t])) if (!keepIds[t].has(id)) { out.push({ t, id, deleted: true }); bump(t + 'Removed'); }

// ---------- expenses ----------
const HIST_BANK = 'rx-history';
if (extra) {
  const catIds = new Map((cur.expenseCategories || []).map((c) => [norm(c.name), c.id]));
  for (const [name] of extra.expenseCategories.rows) if (name && !catIds.has(norm(name))) { const id = 'expcat-' + slug(name); catIds.set(norm(name), id); out.push({ t: 'expenseCategories', id, rec: { id, name } }); bump('expenseCategories'); }
  const curExp = has('expenses');
  let sum = 0;
  for (const r of extra.expenses.rows) {
    const [no, cat, desc, amount, source, date] = r;
    const id = 'rx-exp-' + no;
    sum += num(amount);
    const rec = { id, date, categoryId: catIds.get(norm(cat)) || '', amount: num(amount), method: source || 'Cash', bankId: HIST_BANK, payee: '', description: desc || '', recordedBy: 'Rxtera', imported: 'Rxtera' };
    if (!same(curExp.get(id), rec, ['date', 'categoryId', 'amount', 'method', 'bankId', 'description'])) { out.push({ t: 'expenses', id, rec }); bump('expenses'); }
  }
  // Rxtera's past expenses were paid in the old system: book them to a history account whose opening balance
  // equals them, so today's Cash at hand isn't reduced (works with every app version)
  const bank = { id: HIST_BANK, name: 'Rxtera history (before RxPOS)', account: '', branch: '', opening: r2(sum) };
  if (!same(has('banks').get(HIST_BANK), bank, ['name', 'opening'])) { out.push({ t: 'banks', id: HIST_BANK, rec: bank }); bump('banks'); }
}

// ---------- stock counts (kept as history in the audit trail) ----------
const curAudit = has('audit');
for (const f of fs.readdirSync(DIR).filter((x) => /^stockcount-\d+\.json$/.test(x))) {
  const c = read(f);
  const meta = (extra?.stockCounts.rows || []).find((r) => String(r[0]) === String(c.id)) || [];
  const H = c.head; const ix = (n) => H.findIndex((x) => x.toLowerCase() === n);
  const [iT, iB, iS, iP, iSE, iPE] = ['trade name', 'batch', 'system count', 'physical count', 'system expiry', 'physical expiry'].map(ix);
  const counted = c.rows.filter((r) => !/not counted/i.test(r[iP]));
  const vary = counted.filter((r) => num(r[iS]) !== num(r[iP]) || (r[iPE] && !/not counted/i.test(r[iPE]) && r[iPE] !== r[iSE]));
  const detail = vary.map((r) => `${r[iT]} (${r[iB]}): system ${r[iS]}, counted ${r[iP]}${r[iPE] && r[iPE] !== r[iSE] && !/not counted/i.test(r[iPE]) ? `, expiry ${r[iSE]} → ${r[iPE]}` : ''}`).join('; ');
  const id = 'rx-count-' + c.id;
  const rec = { id, date: meta[5] ? local(meta[5]) : NOW, user: 'Rxtera', action: 'Stock count (Rxtera)', branchId: 'main',
    details: `${meta[1] || 'Stock count ' + c.id}: ${c.rows.length} batches listed, ${counted.length} counted, ${vary.length} differed. Value before ${meta[2] || '-'}, after ${meta[3] || '-'}, variance ${meta[4] || '-'}${meta[6] ? ', finished ' + meta[6] : ' (not finished)'}.${detail ? ' Differences: ' + detail : ''}`.slice(0, 20000) };
  if (!same(curAudit.get(id), rec, ['details'])) { out.push({ t: 'audit', id, rec }); bump('stockCounts'); }
}

// ---------- mirror: remove whatever Rxtera doesn't have ----------
if (MIRROR) {
  const rxForms = new Set([...forms].map(norm));
  const rxCats = new Set((extra?.expenseCategories.rows || []).map((r) => norm(r[0])));
  const keep = {
    products: new Set(pid.values()),
    batches: new Set(target.keys()),
    suppliers: new Set(sid.values()),
    customers: new Set([...cid.values(), 'walk-in']),
    expenses: new Set((extra?.expenses.rows || []).map((r) => 'rx-exp-' + r[0])),
    banks: new Set(['cash-drawer', HIST_BANK]),
  };
  const drop = (t, id) => { if (!out.some((o) => o.t === t && o.id === id)) { out.push({ t, id, deleted: true }); bump(t + 'Removed'); } };
  for (const t of Object.keys(keep)) for (const r of cur[t] || (await loadTable(t))) if (!keep[t].has(r.id)) drop(t, r.id);
  for (const f of cur.formulations || []) if (!rxForms.has(norm(f.name))) drop('formulations', f.id);
  for (const c of cur.expenseCategories || []) if (!rxCats.has(norm(c.name))) drop('expenseCategories', c.id);
  // RxPOS's built-in defaults that Rxtera doesn't have
  const DEF_FORMS = ['Tablets', 'Capsules', 'Syrups', 'Suspensions', 'Injectables', 'Infusions', 'Creams', 'Ointments', 'Gels', 'Drops', 'Eye Drops', 'Ear Drops', 'Inhalers', 'Sachets', 'Suppositories', 'Pessaries', 'Lotions', 'Powders', 'Devices', 'Surgicals', 'Cosmetics', 'Supplements', 'Sundries', 'Others'];
  const DEF_CATS = ['Rent', 'Salaries', 'Electricity', 'Water', 'Transport', 'Airtime & Internet', 'Licenses & Fees', 'Repairs', 'Stationery', 'Other'];
  const curFormIds = new Set((cur.formulations || []).map((f) => f.id)), curCatIds = new Set((cur.expenseCategories || []).map((c) => c.id));
  if (!sent.defaultsRemoved) for (const n of DEF_FORMS) { const id = 'form-' + n.toLowerCase().replace(/W+/g, '-'); if (!rxForms.has(norm(n)) && !curFormIds.has(id) && !out.some((o) => o.id === id)) drop('formulations', id); }
  if (!sent.defaultsRemoved) for (const n of DEF_CATS) { const id = 'expcat-' + n.toLowerCase().replace(/W+/g, '-'); if (!rxCats.has(norm(n)) && !curCatIds.has(id) && !out.some((o) => o.id === id)) drop('expenseCategories', id); }
  // sales/purchases made in RxPOS (not from Rxtera)
  for (const t of ['sales', 'purchases']) for (const r of await loadTable(t)) if (!keepIds[t].has(r.id)) drop(t, r.id);
  // things Rxtera has none of
  for (const t of ['payments', 'loans', 'bankTx', 'proformas', 'purchaseOrders', 'prescriptions', 'transfers', 'catalogHidden']) for (const r of await loadTable(t)) drop(t, r.id);
}

// ---------- --new-only: only entries RxPOS doesn't have yet (owner's choice, 16 Oct 2026) ----------
// Nothing already in RxPOS is changed or removed: no edits to old sales/purchases/expenses, no stock corrections.
// New batches get their opening stock; existing batches keep the stock RxPOS has.
if (NEW_ONLY) {
  const known = (t) => {
    if (t === 'sales' || t === 'purchases') return (id) => id in sent[t];
    const ids = new Set((cur[t] || []).map((r) => r.id));
    return (id) => ids.has(id);
  };
  const isKnown = {};
  const newBatches = new Set(out.filter((o) => o.t === 'batches' && !curBatches.has(o.id)).map((o) => o.id));
  const kept = out.filter((o) => {
    if (o.deleted) return false;
    if (o.t === 'movements') return o.rec.type === 'Opening stock' && newBatches.has(o.rec.batchId);
    isKnown[o.t] = isKnown[o.t] || known(o.t);
    return !isKnown[o.t](o.id);
  });
  out.length = 0;
  out.push(...kept);
  for (const k of Object.keys(stats)) delete stats[k];
  for (const o of out) stats[o.t === 'movements' ? 'newBatchStock' : 'new ' + o.t] = (stats[o.t === 'movements' ? 'newBatchStock' : 'new ' + o.t] || 0) + 1;
}

// ---------- send ----------
const order =['payments', 'loans', 'bankTx', 'proformas', 'purchaseOrders', 'prescriptions', 'transfers', 'catalogHidden', 'formulations', 'products', 'batches', 'suppliers', 'customers', 'movements', 'expenseCategories', 'banks', 'expenses', 'audit', 'purchases', 'sales'];
out.sort((a, b) => order.indexOf(a.t) - order.indexOf(b.t));
console.log(JSON.stringify({ medicines: names.size, stockBatches: target.size, rxteraInvoices: inv.size, saleLines: saleLines.length, toWrite: stats }));
const unmatched = saleLines.filter((l) => l[4] && !pid.get(norm(l[4]))).length;
if (unmatched) console.log('sale lines without a medicine:', unmatched);
if (DRY) process.exit(0);
let done = 0;
for (let i = 0; i < out.length; i += 400) {
  const chunk = out.slice(i, i + 400);
  await api('/records', { method: 'POST', body: JSON.stringify({ records: chunk.map(({ t, id, rec, deleted }) => (deleted ? { t, id, deleted: true } : { t, id, rec })) }) });
  for (const o of chunk) if (o.t === 'sales' || o.t === 'purchases') { if (o.deleted) delete sent[o.t][o.id]; else sent[o.t][o.id] = o.hash; }
  fs.writeFileSync(SENT, JSON.stringify(sent));
  done += chunk.length;
  if (done % 4000 < 400 || done === out.length) console.log('written', done, '/', out.length);
}
if (MIRROR) { sent.defaultsRemoved = true; fs.writeFileSync(SENT, JSON.stringify(sent)); }
fs.writeFileSync(path.join(DIR, 'last-sync.json'), JSON.stringify({ at: NOW, stats }));

if (MIRROR) { // only Rxtera's medicines: switch off RxPOS's built-in standard catalog for this pharmacy
  const list = await call(BASE); const t = (list.tenants || []).find((x) => x.id === TENANT);
  if (t && t.features?.catalog !== false) { await call(API, { method: 'POST', body: JSON.stringify({ features: { catalog: false } }) }); console.log('built-in catalog switched off'); }
}
// Rxtera's logo is never copied into RxPOS (owner's decision, 16 Oct 2026): a logo.json in the folder is ignored.
console.log('done');

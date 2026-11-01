// Stock audit: checks a pharmacy's stock records for every way stock can go missing or be miscounted, and reconciles
// each day's opening/closing stock value with the cost of the day's sales. Read-only: it changes nothing.
//   RXPOS_API=https://api.rxposug.com OWNER_KEY=… node tools/stock-audit.mjs [tenant-slug…] [--days 30]
//   node tools/stock-audit.mjs --file decrypted-backup.json [tenant-slug…]     (a backup opened with restore.mjs --json)
// It prints stock figures only — receipt numbers, medicine names, quantities and values — never customer details.
// Runs in GitHub Actions (.github/workflows/stock-audit.yml) so pharmacy data never leaves your own infrastructure.
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import catalog from '../src/data/catalog.json' with { type: 'json' };
import { catalogCost } from '../worker/dailystock.js';

const EAT = 3 * 3600e3; // Uganda, UTC+3
export const ugDay = (iso) => new Date(new Date(iso).getTime() + EAT).toISOString().slice(0, 10);
const SALE = new Set(['Sale', 'Sale edit']);
const COUNTISH = new Set(['Stock count', 'Adjustment', 'Inventory edit']); // worked out as "what I counted − what this device shows"
const r0 = (x) => Math.round(x);

/**
 * Audit one pharmacy. Inputs are its live records, plus `dead` (ids of deleted records by table) and, for movements,
 * the server arrival order `seq` and sending device `origin` (from the backup rows). `today` is a Uganda YYYY-MM-DD.
 */
export function auditTenant({ products = [], batches = [], movements = [], sales = [], purchases = [], dead = {}, today, days = 30 }) {
  const P = new Map(products.map((p) => [p.id, p]));
  const B = new Map(batches.map((b) => [b.id, b]));
  const deadB = new Set(dead.batches || []), deadP = new Set(dead.products || []);
  const cost = (pid) => (P.has(pid) ? Number(P.get(pid).cost) || 0 : catalogCost(pid));
  const name = (pid) => P.get(pid)?.name || (/^cat-(\d+)$/.test(pid) ? catalog.rows[Number(pid.slice(4)) - 1]?.[0] : null) || pid;
  const known = (pid) => P.has(pid) || (/^cat-\d+$/.test(pid) && !deadP.has(pid));
  const out = { counts: {}, byType: {}, stock: {}, sales: {}, purchases: {}, duplicates: {}, stale: {}, daily: [], costs: {} };
  // Stock is only tracked from the first opening stock: older receipts/purchases (e.g. history copied from Rxtera) never
  // moved stock, so they are not checked. Records copied from Rxtera have ids starting "rx-".
  const opens = movements.filter((m) => /^Opening stock/.test(m.type)).map((m) => m.date).sort();
  const stockStart = opens[0] || '0000';
  out.stockStart = stockStart === '0000' ? null : stockStart;
  const copied = (r) => String(r.id || '').startsWith('rx-');

  // ---- movements by type ----
  for (const m of movements) {
    const t = (out.byType[m.type] ||= { n: 0, qty: 0, value: 0 });
    t.n++; t.qty += Number(m.qty) || 0; t.value += (Number(m.qty) || 0) * cost(m.productId);
  }
  Object.values(out.byType).forEach((t) => { t.value = r0(t.value); });
  out.counts = { products: products.length, batches: batches.length, movements: movements.length, sales: sales.length, purchases: purchases.length };

  // ---- current stock: per branch + batch (as the app builds it) ----
  const lot = new Map(); // branch|batchId-or-lb → { pid, qty }
  for (const m of movements) {
    const k = (m.branchId || 'main') + '|' + (m.batchId || 'lb-' + m.productId);
    const l = lot.get(k) || { pid: m.productId, batchId: m.batchId || null, qty: 0, key: k, mix: {} };
    l.qty += Number(m.qty) || 0; l.mix[m.type] = (l.mix[m.type] || 0) + (Number(m.qty) || 0); lot.set(k, l);
  }
  const hasBatches = new Set(batches.map((b) => b.productId));
  const st = { units: 0, value: 0, negative: { lots: 0, units: 0, value: 0, top: [] }, untracked: { lots: 0, units: 0, value: 0, top: [] },
    goneBatch: { lots: 0, units: 0, value: 0, top: [] }, goneProduct: { lots: 0, units: 0, value: 0, top: [] } };
  const add = (g, l) => { g.lots++; g.units += l.qty; g.value += l.qty * cost(l.pid); g.top.push({ medicine: name(l.pid), pid: l.pid, key: l.key, qty: r0(l.qty * 100) / 100, value: r0(l.qty * cost(l.pid)) }); };
  for (const l of lot.values()) {
    if (Math.abs(l.qty) < 1e-9) continue;
    if (!known(l.pid)) { add(st.goneProduct, l); continue; }
    if (l.batchId && !B.has(l.batchId)) { add(st.goneBatch, l); continue; } // the app shows no batch for it: stock and value vanish from view
    if (l.qty < 0) { add(st.negative, l); continue; }
    if (!l.batchId && hasBatches.has(l.pid)) add(st.untracked, l);
    st.units += l.qty; st.value += l.qty * cost(l.pid);
  }
  for (const g of [st.negative, st.untracked, st.goneBatch, st.goneProduct]) { g.value = r0(g.value); g.units = r0(g.units); g.top = g.top.sort((a, b) => Math.abs(b.value) - Math.abs(a.value)).slice(0, 15); }
  // for each negative lot: what drove it below zero, and how much stock the same medicine has in its other lots there
  for (const t of st.negative.top) {
    const l = lot.get(t.key); const br = t.key.split('|')[0];
    t.mix = Object.fromEntries(Object.entries(l.mix).map(([k, v]) => [k, r0(v * 100) / 100]));
    t.otherLots = r0([...lot.values()].filter((x) => x !== l && x.pid === l.pid && x.key.startsWith(br + '|') && x.qty > 0).reduce((a, x) => a + x.qty, 0) * 100) / 100;
  }
  st.units = r0(st.units); st.value = r0(st.value);
  out.stock = st;

  // ---- sales ↔ stock movements ----
  const moveBySale = new Map(); // receipt → pid → { sold (Sale+Sale edit, as +units out), refunded }
  for (const m of movements) {
    if (!SALE.has(m.type) && m.type !== 'Refund') continue;
    const per = moveBySale.get(m.ref) || new Map(); moveBySale.set(m.ref, per);
    const x = per.get(m.productId) || { out: 0, back: 0 }; per.set(m.productId, x);
    if (m.type === 'Refund') x.back += Number(m.qty) || 0; else x.out -= Number(m.qty) || 0;
  }
  const saleNos = new Set(sales.map((s) => s.number));
  const sx = { checked: 0, ok: 0, missing: { n: 0, units: 0, value: 0 }, extra: { n: 0, units: 0, value: 0 }, refundGap: { n: 0, units: 0, value: 0 }, top: [], orphan: { n: 0, units: 0, value: 0, top: [] }, noCost: 0, costVsNow: { lines: 0, recorded: 0, atNow: 0 } };
  for (const s of sales) {
    if (s.proforma || String(s.number).startsWith('PF')) continue;
    if (s.date < stockStart) { sx.beforeStock = (sx.beforeStock || 0) + 1; continue; }
    if (copied(s)) { sx.copiedAfter = (sx.copiedAfter || 0) + 1; }
    sx.checked++;
    const want = new Map();
    for (const i of s.items || []) { want.set(i.id, (want.get(i.id) || 0) + (Number(i.qty) || 0)); if (!(Number(i.cost) > 0)) sx.noCost++; sx.costVsNow.lines++; sx.costVsNow.recorded += (Number(i.cost) || 0) * (Number(i.qty) || 0); sx.costVsNow.atNow += cost(i.id) * (Number(i.qty) || 0); }
    const got = moveBySale.get(s.number) || new Map();
    let fine = true;
    for (const pid of new Set([...want.keys(), ...got.keys()])) {
      const w = want.get(pid) || 0, g = got.get(pid) || { out: 0, back: 0 };
      const diff = g.out - w; // + = more taken out of stock than the receipt sold; − = less
      if (Math.abs(diff) > 1e-6) {
        fine = false;
        const bucket = diff < 0 ? sx.missing : sx.extra;
        bucket.n++; bucket.units += Math.abs(diff); bucket.value += Math.abs(diff) * cost(pid);
        if (copied(s)) sx.copiedMissing = (sx.copiedMissing || 0) + Math.abs(diff) * cost(pid);
        sx.top.push({ receipt: s.number + (copied(s) ? ' (copied from Rxtera)' : ''), day: ugDay(s.date), medicine: name(pid), sold: w, stockOut: r0(g.out * 100) / 100, diff: r0(diff * 100) / 100, value: r0(diff * cost(pid)) });
      }
      if (s.status === 'refunded' && Math.abs(g.back - g.out) > 1e-6) { fine = false; sx.refundGap.n++; sx.refundGap.units += g.out - g.back; sx.refundGap.value += (g.out - g.back) * cost(pid); }
    }
    if (fine) sx.ok++;
  }
  for (const [ref, per] of moveBySale) {
    if (saleNos.has(ref)) continue;
    for (const [pid, g] of per) {
      const net = g.out - g.back; if (Math.abs(net) < 1e-6) continue;
      sx.orphan.n++; sx.orphan.units += net; sx.orphan.value += net * cost(pid); sx.orphan.top.push({ receipt: ref, medicine: name(pid), stockOut: net, value: r0(net * cost(pid)) });
    }
  }
  for (const k of ['missing', 'extra', 'refundGap', 'orphan']) { sx[k].units = r0(sx[k].units); sx[k].value = r0(sx[k].value); }
  sx.top = sx.top.sort((a, b) => Math.abs(b.value) - Math.abs(a.value)).slice(0, 15);
  sx.orphan.top = sx.orphan.top.sort((a, b) => Math.abs(b.value) - Math.abs(a.value)).slice(0, 10);
  sx.costVsNow.recorded = r0(sx.costVsNow.recorded); sx.costVsNow.atNow = r0(sx.costVsNow.atNow);
  out.sales = sx;

  // ---- purchases ↔ stock movements ----
  const pin = new Map();
  for (const m of movements) if (m.type === 'Purchase' || m.type === 'Purchase edit') { const k = m.ref + '|' + m.productId; pin.set(k, (pin.get(k) || 0) + (Number(m.qty) || 0)); }
  const px = { checked: 0, missing: { n: 0, units: 0, value: 0 }, top: [] };
  for (const p of purchases) {
    if (p.status === 'draft' || p.draft) continue;
    if (String(p.date) < stockStart.slice(0, 10)) { px.beforeStock = (px.beforeStock || 0) + 1; continue; }
    px.checked++;
    const ref = p.invoice || p.number;
    const want = new Map();
    for (const i of p.items || []) { const pid = i.productId || i.id; if (pid) want.set(pid, (want.get(pid) || 0) + (Number(i.qty) || 0)); }
    for (const [pid, w] of want) {
      const g = (pin.get(ref + '|' + pid) || 0) + (pin.get(p.number + '|' + pid) || 0) * (ref !== p.number ? 1 : 0);
      if (g + 1e-6 < w) { px.missing.n++; px.missing.units += w - g; px.missing.value += (w - g) * cost(pid); px.top.push({ purchase: ref + (copied(p) ? ' (copied from Rxtera)' : ''), day: ugDay(p.date), medicine: name(pid), bought: w, stockIn: g, value: r0((w - g) * cost(pid)) }); }
    }
  }
  px.missing.units = r0(px.missing.units); px.missing.value = r0(px.missing.value);
  px.top = px.top.sort((a, b) => b.value - a.value).slice(0, 12);
  out.purchases = px;

  // ---- duplicated movements (same change recorded twice within 2 minutes) ----
  const seen = new Map(); const dx = { n: 0, units: 0, value: 0, top: [] };
  for (const m of [...movements].sort((a, b) => (a.date < b.date ? -1 : 1))) {
    const k = [m.productId, m.batchId, m.branchId, m.type, m.ref, m.qty, m.note].join('|');
    const prev = seen.get(k);
    if (prev && Date.parse(m.date) - Date.parse(prev.date) < 120e3 && m.type !== 'Sale') { // sales are checked against receipts above
      dx.n++; dx.units += Number(m.qty) || 0; dx.value += (Number(m.qty) || 0) * cost(m.productId);
      dx.top.push({ type: m.type, day: ugDay(m.date), medicine: name(m.productId), qty: m.qty, ref: m.ref || '' });
    }
    seen.set(k, m);
  }
  dx.units = r0(dx.units); dx.value = r0(dx.value); dx.top = dx.top.slice(0, 10);
  out.duplicates = dx;

  // ---- stale counts / edits: a count worked out on a device that hadn't yet received earlier stock changes ----
  // A "Stock count", "Adjustment" or "Inventory edit" records (counted − what that device showed). Any change to the same
  // medicine at the same branch dated BEFORE it but reaching the cloud AFTER it, from another device, was not in what
  // that device showed, so it ends up applied twice (e.g. a sale subtracted again after the count already removed it).
  const byPB = new Map();
  for (const m of movements) { const k = (m.branchId || 'main') + '|' + m.productId; (byPB.get(k) || byPB.set(k, []).get(k)).push(m); }
  const sxs = { counts: 0, affected: 0, units: 0, value: 0, top: [] };
  for (const list of byPB.values()) {
    for (const c of list) {
      if (!COUNTISH.has(c.type) || c.seq == null) continue;
      sxs.counts++;
      let doubled = 0;
      for (const m of list) if (m !== c && m.seq != null && m.seq > c.seq && m.date < c.date && m.origin && c.origin && m.origin !== c.origin) doubled += Number(m.qty) || 0;
      if (Math.abs(doubled) > 1e-6) {
        sxs.affected++; sxs.units += doubled; sxs.value += doubled * cost(c.productId);
        sxs.top.push({ type: c.type, day: ugDay(c.date), medicine: name(c.productId), countedDiff: c.qty, appliedTwice: r0(doubled * 100) / 100, value: r0(doubled * cost(c.productId)) });
      }
    }
  }
  sxs.units = r0(sxs.units); sxs.value = r0(sxs.value); sxs.top = sxs.top.sort((a, b) => Math.abs(b.value) - Math.abs(a.value)).slice(0, 15);
  out.stale = sxs;

  // ---- daily reconciliation (Uganda days), stock at today's cost like the app ----
  const lotsD = new Map();
  const lotKey = (m) => (m.branchId || 'main') + '|' + (m.batchId || 'lb-' + m.productId);
  const expiryOf = (m) => (m.batchId ? B.get(m.batchId)?.expiry : P.get(m.productId)?.expiry) || '';
  const valueAt = (day) => { let v = 0; for (const [k, l] of lotsD) if (l.qty > 0 && !l.gone && !(l.exp && l.exp < day)) v += l.qty * cost(l.pid); return v; };
  const negValue = () => { let v = 0; for (const l of lotsD.values()) if (l.qty < 0 && !l.gone) v += l.qty * cost(l.pid); return v; }; // hidden from value
  const expValue = (day) => { let v = 0; for (const l of lotsD.values()) if (l.qty > 0 && !l.gone && l.exp && l.exp < day) v += l.qty * cost(l.pid); return v; };
  const noCostBy = new Map(); // day → value (at today's cost) of receipt lines saved with no cost
  const ms = movements.map((m) => ({ ...m, day: ugDay(m.date) })).sort((a, b) => (a.date < b.date ? -1 : 1));
  const from = new Date(Date.parse(today + 'T00:00:00Z') - (days - 1) * 864e5).toISOString().slice(0, 10);
  const saleCostBy = new Map(); // day → cost of goods sold as recorded on the receipts
  for (const s of sales) {
    if (s.status === 'refunded' || s.proforma) continue;
    const d = ugDay(s.date); saleCostBy.set(d, (saleCostBy.get(d) || 0) + (s.items || []).reduce((a, i) => a + (Number(i.cost) || 0) * (Number(i.qty) || 0), 0));
    noCostBy.set(d, (noCostBy.get(d) || 0) + (s.items || []).filter((i) => !(Number(i.cost) > 0)).reduce((a, i) => a + cost(i.id) * (Number(i.qty) || 0), 0));
  }
  let i = 0;
  const apply = (until) => { while (i < ms.length && ms[i].day <= until) { const m = ms[i++]; const k = lotKey(m); const l = lotsD.get(k) || { pid: m.productId, qty: 0, exp: expiryOf(m), gone: !!(m.batchId && !B.has(m.batchId)) || !known(m.productId) }; l.qty += Number(m.qty) || 0; lotsD.set(k, l); } };
  const prev = new Date(Date.parse(from + 'T00:00:00Z') - 864e5).toISOString().slice(0, 10);
  apply(prev);
  let opening = valueAt(prev);
  for (let day = from; day <= today; day = new Date(Date.parse(day + 'T00:00:00Z') + 864e5).toISOString().slice(0, 10)) {
    const t = {};
    for (let j = i; j < ms.length && ms[j].day === day; j++) { const m = ms[j]; t[m.type] = (t[m.type] || 0) + (Number(m.qty) || 0) * cost(m.productId); }
    apply(day);
    const closing = valueAt(day);
    const saleMoves = -((t.Sale || 0) + (t['Sale edit'] || 0) + (t.Refund || 0));
    const purchasesV = (t.Purchase || 0) + (t['Purchase edit'] || 0) + (t['Supplier return'] || 0);
    const countsV = (t['Stock count'] || 0) + (t.Adjustment || 0) + (t['Inventory edit'] || 0);
    const writeOff = t['Expired write-off'] || 0;
    const transfers = (t['Transfer in'] || 0) + (t['Transfer out'] || 0);
    const opening2 = (t['Opening stock'] || 0) + (t['Opening stock (import)'] || 0);
    const rxSync = t['Stock sync'] || 0;
    const explained = opening + purchasesV - saleMoves + countsV + writeOff + transfers + opening2 + rxSync;
    out.daily.push({ day, opening: r0(opening), closing: r0(closing), drop: r0(opening - closing), receiptCost: r0(saleCostBy.get(day) || 0), saleMoves: r0(saleMoves), purchases: r0(purchasesV),
      counts: r0(countsV), writeOff: r0(writeOff), transfers: r0(transfers), openingStock: r0(opening2), rxSync: r0(rxSync), expiredOrHidden: r0(explained - closing),
      negativeNow: r0(negValue()), expiredNow: r0(expValue(day)), receiptNoCost: r0(noCostBy.get(day) || 0) });
    opening = closing;
  }
  return out;
}

const money = (n) => (n < 0 ? '-' : '') + Math.abs(Math.round(n)).toLocaleString('en-US');
/** Human-readable report lines (stock figures only). */
export function formatReport(title, a) {
  const L = [];
  const h = (s) => L.push('', '== ' + s + ' ==');
  L.push('', '#'.repeat(80), `# ${title}`, '#'.repeat(80));
  L.push(`records: ${Object.entries(a.counts).map(([k, v]) => `${v} ${k}`).join(', ')}`);
  L.push(`stock tracked from: ${a.stockStart || 'never (no opening stock)'}`);
  h('Stock movements by type (value at each medicine\'s current cost)');
  for (const [t, x] of Object.entries(a.byType).sort((p, q) => q[1].n - p[1].n)) L.push(`  ${t.padEnd(24)} ${String(x.n).padStart(7)} moves  qty ${money(x.qty).padStart(10)}  value ${money(x.value).padStart(14)}`);
  const s = a.stock;
  h('Current stock');
  L.push(`  shown in the app: ${money(s.units)} units, value ${money(s.value)} (incl. expired)`);
  for (const [k, label] of [['negative', 'NEGATIVE batches (stock booked out that the system did not have — hidden from value)'], ['untracked', 'stock with no batch on medicines that have batches'], ['goneBatch', 'stock on DELETED batches (invisible in the app)'], ['goneProduct', 'stock on DELETED medicines (invisible in the app)']]) {
    const g = s[k]; L.push(`  ${label}: ${g.lots} lots, ${money(g.units)} units, ${money(g.value)}`);
    for (const x of g.top.slice(0, k === 'negative' ? 15 : 8)) L.push(`      ${x.medicine}: ${x.qty} (${money(x.value)})${x.mix ? `  made of ${JSON.stringify(x.mix)}; other batches of it: ${x.otherLots}` : ''}`);
  }
  const x = a.sales;
  h('Sales vs stock taken out');
  L.push(`  receipts before stock tracking began (not checked): ${x.beforeStock || 0}`);
  L.push(`  receipts checked: ${x.checked} (of which copied from Rxtera: ${x.copiedAfter || 0}); exactly right: ${x.ok}`);
  L.push(`  stock NOT taken out for sold items: ${x.missing.n} lines, ${money(x.missing.units)} units, ${money(x.missing.value)}`);
  L.push(`  MORE stock taken out than sold:       ${x.extra.n} lines, ${money(x.extra.units)} units, ${money(x.extra.value)}`);
  L.push(`  refunds not putting back what was taken: ${x.refundGap.n} lines, ${money(x.refundGap.units)} units, ${money(x.refundGap.value)}`);
  L.push(`  stock taken out for receipts that don't exist: ${x.orphan.n} lines, ${money(x.orphan.units)} units, ${money(x.orphan.value)}`);
  for (const t of x.top) L.push(`      ${t.receipt} ${t.day} ${t.medicine}: sold ${t.sold}, stock out ${t.stockOut} (${t.diff > 0 ? '+' : ''}${t.diff}, ${money(t.value)})`);
  for (const t of x.orphan.top) L.push(`      [no receipt] ${t.receipt} ${t.medicine}: ${t.stockOut} (${money(t.value)})`);
  L.push(`  receipt lines with no cost recorded: ${x.noCost}`);
  L.push(`  cost of all sold items as recorded on receipts: ${money(x.costVsNow.recorded)}; at today's costs: ${money(x.costVsNow.atNow)}`);
  const p = a.purchases;
  h('Purchases vs stock added');
  L.push(`  purchases before stock tracking began (not checked): ${p.beforeStock || 0}`);
  L.push(`  purchases checked: ${p.checked}; lines whose stock was not added: ${p.missing.n}, ${money(p.missing.units)} units, ${money(p.missing.value)}`);
  for (const t of p.top) L.push(`      ${t.purchase} ${t.day} ${t.medicine}: bought ${t.bought}, added ${t.stockIn} (${money(t.value)})`);
  const d = a.duplicates;
  h('Duplicated stock changes (same change twice within 2 minutes)');
  L.push(`  ${d.n} duplicates, ${money(d.units)} units, ${money(d.value)}`);
  for (const t of d.top) L.push(`      ${t.day} ${t.type} ${t.medicine} ${t.qty} ${t.ref}`);
  const z = a.stale;
  h('Counts / edits made on a device missing earlier changes (applied twice)');
  L.push(`  counts/adjustments/edits: ${z.counts}; affected: ${z.affected}; net effect ${money(z.units)} units, ${money(z.value)} (negative = stock lost)`);
  for (const t of z.top) L.push(`      ${t.day} ${t.type} ${t.medicine}: recorded ${t.countedDiff}, earlier change applied twice ${t.appliedTwice} (${money(t.value)})`);
  h(`Daily stock value (last ${a.daily.length} days, at today's costs)`);
  L.push('  drop = opening − closing; sales-moves = stock taken out by sales at today\'s cost; receipt-cost = cost saved on the receipts (no-cost = lines saved with none);');
  L.push('  hidden = change explained by batches passing expiry or going negative (both left out of the value); negative/expired = what is left out at day end');
  L.push('  day          opening     closing      drop  receipt-cost  no-cost  sales-moves  purchases   counts  writeoff  rx-sync  opening   hidden  negative   expired');
  for (const r of a.daily.filter((d) => d.opening || d.closing)) L.push(`  ${r.day} ${money(r.opening).padStart(11)} ${money(r.closing).padStart(11)} ${money(r.drop).padStart(9)} ${money(r.receiptCost).padStart(13)} ${money(r.receiptNoCost).padStart(8)} ${money(r.saleMoves).padStart(12)} ${money(r.purchases).padStart(10)} ${money(r.counts).padStart(8)} ${money(r.writeOff).padStart(9)} ${money(r.rxSync).padStart(8)} ${money(r.openingStock).padStart(8)} ${money(r.expiredOrHidden).padStart(8)} ${money(r.negativeNow).padStart(9)} ${money(r.expiredNow).padStart(9)}`);
  return L;
}

/** Split backup rows into one pharmacy's audit input. */
export function inputFor(rows, tenant) {
  const live = {}, dead = {};
  for (const r of rows) {
    if (r.tenant !== tenant) continue;
    if (r.deleted || r.rec == null) { (dead[r.t] ||= []).push(r.id); continue; }
    let rec; try { rec = typeof r.rec === 'string' ? JSON.parse(r.rec) : r.rec; } catch { continue; }
    if (!rec) continue;
    rec.id ??= r.id;
    if (r.t === 'movements' || r.t === 'sales') { rec.seq = r.seq; rec.origin = r.origin; }
    (live[r.t] ||= []).push(rec);
  }
  return { products: live.products || [], batches: live.batches || [], movements: live.movements || [], sales: live.sales || [], purchases: live.purchases || [], dead };
}

export async function fetchAll() {
  const API = (process.env.RXPOS_API || 'https://api.rxposug.com').replace(/\/+$/, '');
  const KEY = process.env.OWNER_KEY;
  if (!KEY) throw new Error('Set OWNER_KEY (or use --file)');
  const get = async (q) => {
    for (let n = 0; ; n++) {
      try { const r = await fetch(`${API}/api/owner/backup?${q}`, { headers: { Authorization: 'Bearer ' + KEY }, signal: AbortSignal.timeout(60000) }); const j = await r.json(); if (!r.ok) throw new Error(j.error || r.status); return j; }
      catch (e) { if (n >= 5) throw e; await new Promise((ok) => setTimeout(ok, 2000 * (n + 1))); }
    }
  };
  const meta = await get('part=meta');
  const rows = [];
  for (let after = 0; ;) { const pg = await get(`part=records&after=${after}`); rows.push(...pg.rows); after = pg.last; if (pg.done) break; }
  return { tenants: meta.tenants, rows };
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const args = process.argv.slice(2);
  const fi = args.indexOf('--file'), di = args.indexOf('--days');
  const days = di >= 0 ? Number(args[di + 1]) : 30;
  const only = args.filter((a, n) => !a.startsWith('--') && n !== fi + 1 && n !== di + 1);
  const data = fi >= 0 ? (() => { const j = JSON.parse(fs.readFileSync(args[fi + 1], 'utf8')); return { tenants: j.tenants, rows: j.records }; })() : await fetchAll();
  const today = ugDay(new Date().toISOString());
  for (const t of data.tenants) {
    if (only.length && !only.includes(t.slug) && !only.includes(t.id)) continue;
    const a = auditTenant({ ...inputFor(data.rows, t.id), today, days });
    console.log(formatReport(`${t.name} (/${t.slug || t.id})`, a).join('\n'));
  }
}

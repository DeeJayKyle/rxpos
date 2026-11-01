// Daily stock sheet: for each day (Uganda time), the figures a pharmacy keeps in its own daily sheet, worked out from
// the cloud's records so they are the same on every device and correct themselves when a till sends its sales late:
//   Sales · Opening stock value · Purchases (stock added at cost) · Closing stock value · Cost of stock sold · Profit ·
//   Expenses · Other stock changes
// Stock value is what the app shows as Inventory value (store.jsx → batchValue): every batch's stock (the sum of its
// stock movements) × the medicine's current cost (the batch's own cost only if the medicine has none), expired batches
// not included. Changing a medicine's cost therefore revalues all of its stock, on every day of the sheet.
// Opening = the day before's closing; Closing = Opening + Purchases − Cost of stock sold − Other stock changes, where
// Other is everything else that moved the value: write-offs, stock counts, adjustments, transfers, batches that
// expired, stock loaded at the start. A Google Sheet reads it with =IMPORTDATA(<link>) (Settings → Data & backup).
import catalog from '../src/data/catalog.json' with { type: 'json' };

const EAT = 3 * 3600e3; // Uganda is UTC+3 all year
const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thur', 'Fri', 'Sat']; // as the pharmacy's sheet writes them
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const PURCHASE = new Set(['Purchase', 'Purchase edit', 'Supplier return']);
const SOLD = new Set(['Sale', 'Sale edit', 'Refund']);

/** The local (Uganda) day of an ISO time or a plain YYYY-MM-DD date */
export const localDay = (d) => (/^\d{4}-\d{2}-\d{2}$/.test(String(d)) ? String(d) : new Date(new Date(d).getTime() + EAT).toISOString().slice(0, 10));
const nextDay = (day) => new Date(Date.parse(day + 'T00:00:00Z') + 864e5).toISOString().slice(0, 10);
/** "Thur 22nd Oct", the way the pharmacy's sheet labels a day (so a lookup on the label works) */
export function dayLabel(day) {
  const d = new Date(day + 'T00:00:00Z'), n = d.getUTCDate();
  const th = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th';
  return `${WEEKDAY[d.getUTCDay()]} ${n}${th} ${MONTH[d.getUTCMonth()]}`;
}

/** Cost of a medicine the pharmacy never changed: the built-in catalog's, worked out as the app does (store.jsx baseProduct) */
export function catalogCost(id) {
  const m = /^cat-(\d+)$/.exec(id || '');
  const row = m && catalog.rows[Number(m[1]) - 1];
  if (!row) return 0;
  const [, , , price, wholesale, cost] = row;
  return cost || Math.round((wholesale || price) * 0.8);
}

/**
 * Pure (also used by the tests): rows from `from` to `to` (YYYY-MM-DD, Uganda days) out of the pharmacy's movements,
 * batches, products (only stored ones are needed), sales and expenses of those days.
 */
export function dailyStock({ movements, batches, products, sales, expenses, from, to }) {
  const P = new Map(products.map((p) => [p.id, p]));
  const B = new Map(batches.map((b) => [b.id, b]));
  const productCost = (id) => (P.has(id) ? Number(P.get(id).cost) || 0 : catalogCost(id));
  // one lot per batch (or a medicine's stock from before batches), with its cost and expiry
  const lots = new Map();
  const lotOf = (m) => {
    const k = (m.branchId || 'main') + '|' + (m.batchId || 'lb-' + m.productId);
    let l = lots.get(k);
    if (!l) {
      const b = m.batchId ? B.get(m.batchId) : null;
      const gone = m.batchId ? !b : false; // the app shows no batch for it, so it is in no total
      l = { qty: 0, cost: productCost(m.productId) || (b && Number(b.cost)) || 0, expiry: (b ? b.expiry : P.get(m.productId)?.expiry) || '', gone };
      lots.set(k, l);
    }
    return l;
  };
  const valueAt = (day) => { // closing value of `day`: what the Inventory value shows that evening
    let v = 0;
    for (const l of lots.values()) if (!l.gone && l.qty > 0 && !(l.expiry && l.expiry < day)) v += l.qty * l.cost;
    return v;
  };
  const moves = movements.map((m) => ({ ...m, day: localDay(m.date) })).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  let i = 0;
  const apply = (until) => { while (i < moves.length && moves[i].day <= until) { const m = moves[i++]; lotOf(m).qty += Number(m.qty) || 0; } };
  // stock before the first day
  const before = new Date(Date.parse(from + 'T00:00:00Z') - 864e5).toISOString().slice(0, 10);
  apply(before);
  let opening = valueAt(before);
  const salesBy = new Map(), expBy = new Map();
  for (const s of sales) {
    if (s.status === 'refunded') continue;
    const d = localDay(s.date), r = salesBy.get(d) || { total: 0, n: 0 };
    r.total += Number(s.total) || 0; r.n++; salesBy.set(d, r);
  }
  for (const e of expenses) { const d = localDay(e.date); expBy.set(d, (expBy.get(d) || 0) + (Number(e.amount) || 0)); }
  const rows = [];
  for (let day = from; day <= to; day = nextDay(day)) {
    let purchases = 0, sold = 0;
    for (let j = i; j < moves.length && moves[j].day === day; j++) {
      const m = moves[j], l = lotOf(m), v = (Number(m.qty) || 0) * l.cost;
      if (l.gone) continue;
      if (PURCHASE.has(m.type)) purchases += v; else if (SOLD.has(m.type)) sold -= v;
    }
    apply(day);
    const closing = valueAt(day);
    const s = salesBy.get(day) || { total: 0, n: 0 };
    const r = (x) => Math.round(x);
    rows.push({ date: day, day: dayLabel(day), sales: r(s.total), opening: r(opening), purchases: r(purchases), closing: r(closing), cost: r(sold),
      profit: r(s.total - sold), expenses: r(expBy.get(day) || 0), other: r(opening + purchases - sold - closing), count: s.n });
    opening = closing;
  }
  return rows;
}

const HEAD = ['Date', 'Day', 'Sales', 'Opening stock value', 'Purchases (stock added at cost)', 'Closing stock value', 'Cost of stock sold', 'Profit', 'Expenses', 'Other stock changes', 'Number of sales'];
const cell = (v) => (/[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v));
export const toCsv = (rows) => [HEAD, ...rows.map((x) => [x.date, x.day, x.sales, x.opening, x.purchases, x.closing, x.cost, x.profit, x.expenses, x.other, x.count])].map((r) => r.map(cell).join(',')).join('\n') + '\n';

/** Read one pharmacy's records from the cloud and build the rows for the last `days` days up to today (Uganda) */
export async function dailyStockFor(db, tenant, { days = 62, today = localDay(new Date().toISOString()) } = {}) {
  const from = new Date(Date.parse(today + 'T00:00:00Z') - (days - 1) * 864e5).toISOString().slice(0, 10);
  const startIso = new Date(Date.parse(from + 'T00:00:00Z') - EAT).toISOString();
  const all = (t) => db.prepare("SELECT rec FROM records WHERE tenant = ?1 AND t = ?2 AND deleted = 0").bind(tenant, t).all();
  const since = (t, field, value) => db.prepare(`SELECT rec FROM records WHERE tenant = ?1 AND t = ?2 AND deleted = 0 AND json_extract(rec, '$.${field}') >= ?3`).bind(tenant, t, value).all();
  const [mv, bt, pr, sl, ex] = await Promise.all([all('movements'), all('batches'), all('products'), since('sales', 'date', startIso), since('expenses', 'date', from)]);
  const parse = (r) => (r.results || []).map((x) => { try { return JSON.parse(x.rec); } catch { return null; } }).filter(Boolean);
  return dailyStock({ movements: parse(mv), batches: parse(bt), products: parse(pr), sales: parse(sl), expenses: parse(ex), from, to: today });
}

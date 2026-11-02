// Reading a supplier invoice page (Scan invoice → delivery draft for review). Pure helpers, also used by the tests:
//   clean(parsed)         the model's answer → tidy lines (plain numbers, trimmed text)
//   reconcile(a, b)       two independent readings of the same page → one, each line marked with what to check
//   arithmetic(lines)     qty × unit cost = line total, else flag; fill the one missing value when the other two agree
import { normDate } from '../src/invoicedates.js';
// A line's `check` lists the fields a person must look at ("qty", "unitCost", "batch", "expiry", "name"), with the
// other reading in `alt`; `unclear` is true when anything needs checking (what older apps understand).

export const num = (v) => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const s = String(v ?? '').replace(/[^0-9.,-]/g, '');
  // "18,500" / "18.500" (thousands) vs "2.5" (decimal): a separator followed by exactly 3 digits at the end is thousands
  const n = /[.,]\d{3}$/.test(s) && !/[.,]\d{1,2}$/.test(s) ? s.replace(/[.,]/g, '') : s.replace(/,/g, '');
  return Number(n) || 0;
};
const text = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const words = (s) => String(s || '').toLowerCase().match(/[a-z]{3,}|\d+(\.\d+)?/g) || [];
const similar = (a, b) => { const w = words(a), h = new Set(words(b)); return w.length ? w.filter((x) => h.has(x)).length / w.length : 0; };

/** The model's JSON → { supplier, invoiceNo, date, total, items } with tidy lines */
export function clean(parsed) {
  const items = (Array.isArray(parsed?.items) ? parsed.items : []).filter((x) => x && text(x.name, 120)).slice(0, 80).map((x) => ({
    name: text(x.name, 120), batch: text(x.batch, 40).toUpperCase().replace(/\s+/g, ''), expiry: normDate(text(x.expiry, 20)) || text(x.expiry, 20), expiryWritten: text(x.expiry, 20),
    qty: num(x.qty), unitCost: num(x.unitCost), lineTotal: num(x.lineTotal),
    unclear: !!x.unclear, note: text(x.note, 120),
  }));
  return { supplier: text(parsed?.supplier, 120), invoiceNo: text(parsed?.invoiceNo, 40), date: normDate(text(parsed?.date, 20), { endOfMonth: false }) || text(parsed?.date, 20), total: num(parsed?.total), items };
}

const close = (a, b) => Math.abs(a - b) <= Math.max(1, Math.abs(b) * 0.01);
/** qty × unit cost = line total? Fill the one missing value when the other two are there; flag when they disagree. */
export function arithmetic(items) {
  return items.map((it) => {
    const l = { ...it, check: [...(it.check || [])] };
    if (!l.unitCost && l.qty && l.lineTotal) l.unitCost = Math.round((l.lineTotal / l.qty) * 100) / 100;
    else if (!l.lineTotal && l.qty && l.unitCost) l.lineTotal = l.qty * l.unitCost;
    else if (!l.qty && l.unitCost && l.lineTotal && Number.isInteger(Math.round((l.lineTotal / l.unitCost) * 1000) / 1000)) l.qty = l.lineTotal / l.unitCost;
    if (l.qty && l.unitCost && l.lineTotal && !close(l.qty * l.unitCost, l.lineTotal)) {
      for (const f of ['qty', 'unitCost']) if (!l.check.includes(f)) l.check.push(f);
      l.why = [...(l.why || []), `${l.qty} × ${l.unitCost} is not ${l.lineTotal}`];
    }
    if (!l.qty) l.check.includes('qty') || l.check.push('qty');
    if (!l.unitCost) l.check.includes('unitCost') || l.check.push('unitCost');
    if (it.unclear && !l.check.length) l.check.push('name');
    return { ...l, unclear: l.check.length > 0 };
  });
}

/** Two independent readings of one page → one reading; fields the readings disagree on are flagged with the other value */
export function reconcile(a, b) {
  if (!b || !b.items?.length) return { ...a, items: a.items.map((it) => ({ ...it, check: it.unclear ? ['name'] : [], readings: 1 })), readings: 1 };
  const used = new Set();
  const items = a.items.map((x) => {
    let best = -1, score = 0;
    b.items.forEach((y, k) => { if (used.has(k)) return; const s = Math.max(similar(x.name, y.name), similar(y.name, x.name)); if (s > score) { score = s; best = k; } });
    if (best < 0 || score < 0.5) return { ...x, check: ['name', 'qty', 'unitCost'], why: ['only one reading found this line'], readings: 1 };
    used.add(best);
    const y = b.items[best], check = [], alt = {};
    if (x.qty !== y.qty) { check.push('qty'); alt.qty = y.qty; }
    if (!close(x.unitCost || 0, y.unitCost || 0) && !(x.lineTotal && close(x.lineTotal, y.lineTotal) && x.qty === y.qty)) { check.push('unitCost'); alt.unitCost = y.unitCost; }
    if (norm(x.batch) !== norm(y.batch)) { check.push('batch'); alt.batch = y.batch; }
    if (norm(x.expiry) !== norm(y.expiry)) { check.push('expiry'); alt.expiry = y.expiry; }
    if (score < 0.8) { check.push('name'); alt.name = y.name; }
    if ((x.unclear || y.unclear) && !check.length) check.push('name');
    // a value one reading left empty is taken from the other
    const merged = { ...x, batch: x.batch || y.batch, expiry: x.expiry || y.expiry, unitCost: x.unitCost || y.unitCost, lineTotal: x.lineTotal || y.lineTotal, qty: x.qty || y.qty, note: x.note || y.note };
    return { ...merged, check, ...(check.length ? { alt } : {}), readings: 2 };
  });
  // lines only the second reading saw
  b.items.forEach((y, k) => { if (!used.has(k)) items.push({ ...y, check: ['name', 'qty', 'unitCost'], why: ['only one reading found this line'], readings: 1 }); });
  return { supplier: a.supplier || b.supplier, invoiceNo: a.invoiceNo || b.invoiceNo, date: a.date || b.date, total: a.total || b.total, items, readings: 2,
    disagree: { invoiceNo: !!(a.invoiceNo && b.invoiceNo && norm(a.invoiceNo) !== norm(b.invoiceNo)), date: !!(a.date && b.date && norm(a.date) !== norm(b.date)) } };
}

/** The whole page: reconcile, then check the arithmetic and whether the lines add up to the invoice total */
export function finish(a, b) {
  const r = reconcile(a, b);
  const items = arithmetic(r.items);
  const sum = items.reduce((s, it) => s + (it.lineTotal || it.qty * it.unitCost || 0), 0);
  return { ...r, items, linesTotal: Math.round(sum), totalMatches: !r.total || close(sum, r.total) };
}

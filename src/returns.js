// Returning part of a sale (Nov 2026 audit item 6: partial refunds). Used by the React app and the cloud (worker/).
//
// A whole sale is still refunded as before (its status becomes "refunded"). A return of SOME lines, or of part of a
// line, is a record of its own in `sales`, a credit note: `returnOf` (the sale's id), `returnOfNumber`, the lines given
// back with NEGATIVE quantities, and negative money (subtotal, discount, tax, total, paid, the insurer's share and, for
// a split sale, each tender). The sale itself is never changed, so a closed day stays closed, and every sum of sales
// (a day, a shift, a client's debt, an account, a medicine's sales) nets the return on the day it is made.
//
// Rules:
//  - quantities are in the medicine's stock unit; a line sold in packs (a strip, a box) is returned in whole packs,
//    a kit in whole kits;
//  - stock goes back to the batches the line was taken from, the last batch first, never more than each gave;
//  - money is the returned share of the sale, worked out on everything returned so far, so that returning the rest
//    later brings the sale back to exactly zero: the insurer's share comes off what it is billed, the client's share
//    first cancels what they still owe on the sale, and only the rest is paid back, the way the sale was paid.
import { tendersOf, isSplit, SPLIT } from './tenders.js';
import { round } from './money.js';

const num = (v) => Number(v) || 0;
const EPS = 1e-9;

/** The returns made of this sale, from a list of sale records */
export const returnsOf = (sale, sales) => (sales || []).filter((s) => s && s.returnOf && s.returnOf === sale?.id && !s.deleted);

/** What has been given back of each line so far: Map(line index → quantity, positive) */
export function returnedByLine(returns) {
  const m = new Map();
  for (const r of returns || []) for (const i of r.items || []) if (Number.isInteger(i.line)) m.set(i.line, (m.get(i.line) || 0) - num(i.qty));
  return m;
}

/** The step a line is returned in: its pack size (whole packs), else 1 (a kit: whole kits, a loose line: one unit) */
export const lineStep = (item) => (item?.pack && num(item.pack.size) > 1 ? num(item.pack.size) : 1);

/** The lines that can still be returned: [{ line, item, sold, returned, left, step }] (left > 0 only) */
export function returnable(sale, returns) {
  const done = returnedByLine(returns);
  return (sale?.items || []).map((item, line) => {
    const sold = num(item.qty), returned = done.get(line) || 0;
    return { line, item, sold, returned, left: Math.max(0, sold - returned), step: lineStep(item) };
  }).filter((x) => x.left > EPS);
}

/** Has everything been returned (by returns, or the whole sale refunded)? */
export const fullyReturned = (sale, returns) => sale?.status === 'refunded' || ((returns || []).length > 0 && returnable(sale, returns).length === 0);

// Batches a line took stock from, less what earlier returns already put back: [{ key, productId, batchId, batch, expiry, left }]
function sources(allocs, productId, back) {
  return (allocs?.length ? allocs : [{ batchId: null, qty: 0 }]).map((a) => {
    const key = productId + '|' + (a.batchId ?? '');
    return { key, productId, batchId: a.batchId ?? null, batch: a.batch, expiry: a.expiry, left: num(a.qty) };
  }).map((s) => { const b = Math.min(s.left, back.get(s.key) || 0); back.set(s.key, (back.get(s.key) || 0) - b); return { ...s, left: s.left - b }; });
}
// Take qty from the sources, the last batch first; → negative allocations for the return line
function giveBack(list, qty) {
  const out = [];
  let need = qty;
  for (const s of [...list].reverse()) {
    if (need <= EPS) break;
    const q = Math.min(need, s.left);
    if (q > EPS) { out.push({ batchId: s.batchId, ...(s.batch ? { batch: s.batch } : {}), ...(s.expiry ? { expiry: s.expiry } : {}), qty: -q }); need -= q; }
  }
  // a line with no batch record (stock from before batches): back as plain stock
  if (need > EPS) out.push({ batchId: list.at(-1)?.batchId ?? null, qty: -need });
  return out;
}
// What earlier returns put back per product|batch, for one line (and, for a kit, per component)
function backByBatch(returns, line) {
  const m = new Map();
  const add = (pid, allocs) => { for (const a of allocs || []) { const k = pid + '|' + (a.batchId ?? ''); m.set(k, (m.get(k) || 0) - num(a.qty)); } };
  for (const r of returns || []) for (const i of r.items || []) {
    if (i.line !== line) continue;
    if (i.kit?.components) for (const c of i.kit.components) add(String(c.id), c.alloc); else add(String(i.id), i.alloc);
  }
  return m;
}

/**
 * Plan a return. sale: the sale · returns: its earlier returns · picks: [{ line, qty }] (qty in stock units, a multiple
 * of the line's step) · decimals: money decimals. → { ok, error?, items, subtotal, discount, tax, total, insurer,
 * unpaid, back, tenders: [{ method, type, amount, bankId }], full } — amounts POSITIVE here (what this return is
 * worth); returnRecord() turns them into the stored, negative record. `full`: after it nothing is left to return.
 */
export function planReturn(sale, returns, picks, decimals = 0) {
  const r = (x) => round(x, decimals);
  const fail = (error) => ({ ok: false, error });
  const items = sale?.items || [];
  const open = new Map(returnable(sale, returns).map((x) => [x.line, x]));
  const want = new Map();
  for (const p of picks || []) {
    const q = num(p?.qty);
    if (!q) continue;
    const x = open.get(p.line);
    if (!x) return fail('That line has nothing left to return');
    if (q < 0) return fail('A quantity to return is less than 0');
    if (q > x.left + EPS) return fail(`${x.item.name}: only ${x.left} left to return`);
    if (Math.abs(q / x.step - Math.round(q / x.step)) > 1e-6) return fail(`${x.item.name} was sold by the ${String(x.item.pack?.name || 'pack').toLowerCase()} of ${x.step}: return whole ones`);
    want.set(p.line, (want.get(p.line) || 0) + q);
  }
  if (!want.size) return fail('Choose what is returned');
  if (sale?.status === 'refunded') return fail('This sale was already refunded');

  // the share of the sale returned so far (before) and with this return (after), by line value
  const done = returnedByLine(returns);
  const lineNet = (i) => num(i.price) * num(i.qty) - num(i.discount);
  const value = (qtyOf) => items.reduce((a, i, n) => a + (num(i.qty) ? lineNet(i) * Math.min(1, qtyOf(n) / num(i.qty)) : 0), 0);
  const before = value((n) => done.get(n) || 0);
  const after = value((n) => (done.get(n) || 0) + (want.get(n) || 0));
  const full = items.every((i, n) => (done.get(n) || 0) + (want.get(n) || 0) >= num(i.qty) - EPS);
  const subtotal = num(sale.subtotal), discount = num(sale.discount), tax = num(sale.tax), total = num(sale.total);
  const share = sale.insurance ? Math.max(0, num(sale.insurance.share)) : 0;
  const paid = num(sale.paid ?? sale.total);
  const owedOnSale = Math.max(0, total - paid - share);
  const tenders = tendersOf(sale);
  // cumulative figures at a returned line value v (all of the sale when everything is back)
  const cum = (v, all) => {
    if (all) return { sub: subtotal, disc: discount, tax, total, ins: share, unpaid: owedOnSale, back: paid, by: tenders.map((t) => t.amount) };
    const F = subtotal > 0 ? v / subtotal : 0;
    const sub = r(v), disc = r(discount * F), tx = r(tax * F), tot = r(sub - disc + tx);
    const ins = total > 0 ? Math.min(share, r(share * (tot / total))) : 0;
    const client = Math.max(0, tot - ins);
    const unpaid = Math.min(owedOnSale, client), back = r(client - unpaid);
    // paid back the way it was paid, in proportion; the last tender takes the rounding
    const by = tenders.map((t) => (paid ? r((t.amount * back) / paid) : 0));
    if (by.length) by[by.length - 1] = r(back - by.slice(0, -1).reduce((a, x) => a + x, 0));
    return { sub, disc, tax: tx, total: tot, ins, unpaid, back, by };
  };
  const A = cum(before, false), B = cum(after, full);
  const d = (k) => r(B[k] - A[k]);

  // the lines, with the batches their stock goes back to
  const out = [];
  for (const [line, q] of want) {
    const item = items[line];
    const back = backByBatch(returns, line);
    const sold = num(item.qty);
    const base = { ...item, line, qty: -q };
    delete base.alloc;
    if (item.pack) base.pack = { ...item.pack, count: -(q / num(item.pack.size)) };
    if (item.kit?.components) {
      base.kit = { ...item.kit, components: item.kit.components.map((c) => {
        const per = num(c.per) || (sold ? num(c.qty) / sold : 0);
        const cq = per * q;
        return { ...c, qty: -cq, alloc: giveBack(sources(c.alloc, String(c.id), back), cq) };
      }) };
      base.alloc = [];
    } else base.alloc = giveBack(sources(item.alloc, String(item.id), back), q);
    out.push(base);
  }
  return {
    ok: true, full, items: out.sort((a, b) => a.line - b.line),
    subtotal: d('sub'), discount: d('disc'), tax: d('tax'), total: d('total'), insurer: d('ins'), unpaid: d('unpaid'), back: d('back'),
    tenders: tenders.map((t, i) => ({ ...t, amount: r(B.by[i] - A.by[i]) })).filter((t) => t.amount),
  };
}

/**
 * The stored return (a credit note) from a plan: negative quantities and money. The caller adds id, number, date,
 * cashier (who made the return) and branchId.
 */
export function returnRecord(sale, plan, { reason = '', approvedBy = null } = {}) {
  const neg = (x) => (x ? -x : 0);
  const split = isSplit(sale) || plan.tenders.length > 1;
  const payments = split ? [
    ...plan.tenders.map((t) => ({ method: t.method, type: t.type, amount: neg(t.amount), bankId: t.bankId })),
    ...(plan.unpaid ? [{ method: 'Credit', type: 'credit', amount: neg(plan.unpaid) }] : []),
  ] : null;
  return {
    returnOf: sale.id, returnOfNumber: sale.number, type: sale.type || 'retail',
    customerId: sale.customerId, customerName: sale.customerName,
    items: plan.items, subtotal: neg(plan.subtotal), discount: neg(plan.discount), tax: neg(plan.tax), total: neg(plan.total),
    paid: neg(plan.back), tendered: neg(plan.back),
    payment: split ? SPLIT : sale.payment, ...(payments ? { payments } : {}), bankId: plan.tenders[0]?.bankId ?? sale.bankId,
    ...(sale.insurance ? { insurance: { ...sale.insurance, share: neg(plan.insurer) } } : {}),
    status: 'completed', ...(reason ? { refundReason: String(reason).slice(0, 240) } : {}), ...(approvedBy ? { refundApprovedBy: approvedBy } : {}),
  };
}

/**
 * The cloud's check of a return (worker/anomalies.js): against the sale it returns and that sale's other returns.
 * → [{ kind, detail, amount }]. Nothing is refused (as for every sale check): an owner looks at what is listed.
 */
export function returnFindings(ret, sale, others = []) {
  const out = [];
  const money = (n) => Math.round(num(n)).toLocaleString('en-US');
  const amount = Math.abs(num(ret.total));
  if (!sale) return [{ kind: 'return', detail: `A return of ${ret.returnOfNumber || 'a sale'} the cloud doesn't have`, amount }];
  if (sale.status === 'refunded') out.push({ kind: 'return', detail: `${sale.number} was refunded in full and also has this return`, amount });
  const items = Array.isArray(ret.items) ? ret.items : [];
  if (items.some((i) => !(num(i.qty) < 0)) || num(ret.total) > 0 || num(ret.paid) > 0)
    out.push({ kind: 'return', detail: 'A return with a quantity or amount that is not negative', amount });
  const done = returnedByLine([...others.filter((o) => o.id !== ret.id), ret]);
  for (const [line, q] of done) {
    const i = sale.items?.[line];
    if (!i) { out.push({ kind: 'return', detail: `A returned line that ${sale.number} doesn't have`, amount }); continue; }
    if (q > num(i.qty) + 1e-6) out.push({ kind: 'return', detail: `${i.name}: ${Math.round(q * 100) / 100} returned of ${sale.number}, but ${num(i.qty)} were sold`, amount });
  }
  for (const i of items) {
    const s = sale.items?.[i.line];
    if (s && (String(s.id) !== String(i.id) || Math.abs(num(s.price) - num(i.price)) > 0.005)) out.push({ kind: 'return', detail: `${i.name || i.id}: returned at ${money(i.price)}, sold at ${money(s.price)} as ${s.name}`, amount });
  }
  const back = [...others.filter((o) => o.id !== ret.id), ret].reduce((a, o) => a - num(o.paid), 0);
  if (back > num(sale.paid ?? sale.total) + 1) out.push({ kind: 'return', detail: `${money(back)} paid back on returns of ${sale.number}, which took ${money(sale.paid ?? sale.total)}`, amount: back - num(sale.paid ?? sale.total) });
  return out;
}

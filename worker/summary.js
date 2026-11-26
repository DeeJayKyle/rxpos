// Daily owner summary: every evening each pharmacy that set "Daily summary emails" (Settings → Alerts) gets the
// day's figures by email: sales and how they were paid, profit, expenses, refunds and discounts, per branch, the
// best sellers, and stock that needs attention. The same text is shown in the app (Weekly Summary → Today) with a
// WhatsApp share button. Sent through Brevo (BREVO_API_KEY), like password emails.

import { sumBreakdowns } from '../src/tax.js';

const EAT = 3 * 3600e3; // Uganda is UTC+3 all year
const pad = (n) => String(n).padStart(2, '0');
/** The local (EAT) day of a moment, YYYY-MM-DD, and that day's start / end as UTC ISO strings */
export function eatDay(now = new Date()) {
  const l = new Date(now.getTime() + EAT);
  const day = `${l.getUTCFullYear()}-${pad(l.getUTCMonth() + 1)}-${pad(l.getUTCDate())}`;
  const start = new Date(Date.parse(day + 'T00:00:00Z') - EAT);
  return { day, startIso: start.toISOString(), endIso: new Date(start.getTime() + 864e5).toISOString() };
}

/** When a refunded sale was refunded (records from before refundedAt was kept fall back to the sale's own date) */
export const refundedOn = (s) => s.refundedAt || s.date;
/** SQL for the refunds made in [?2, ?3): refunded sales whose refund (not the sale) falls in the period */
export const REFUNDS_SQL = "SELECT rec FROM records WHERE tenant = ?1 AND t = 'sales' AND deleted = 0 AND json_extract(rec, '$.status') = 'refunded' AND COALESCE(json_extract(rec, '$.refundedAt'), json_extract(rec, '$.date')) >= ?2 AND COALESCE(json_extract(rec, '$.refundedAt'), json_extract(rec, '$.date')) < ?3";

/**
 * Plain figures for a period (pure: also used by the tests). [sales] are the sales MADE in the period, refunded later
 * or not; [refunds] are the refunds MADE in the period, whenever their sale was (Nov 2026: a refund counts on the day
 * it happens, as in Finance and Shifts, not on its sale's day). Without [refunds], the refunded ones among [sales].
 */
export function summarise({ sales, refunds = sales.filter((s) => s.status === 'refunded'), expenses, branches = [], lowStock = [], expiring = [] }) {
  const sum = (a, f) => a.reduce((x, y) => x + (Number(f(y)) || 0), 0);
  const costOf = (s) => sum(s.items || [], (i) => (i.cost || 0) * i.qty);
  const gross = sum(sales, (s) => s.total), refundValue = sum(refunds, (s) => s.total);
  const total = gross - refundValue;
  const cost = sum(sales, costOf) - sum(refunds, costOf);
  const tax = sum(sales, (s) => s.tax) - sum(refunds, (s) => s.tax);
  // VAT by category (src/tax.js), after the refunds made in the period
  const vat = sumBreakdowns([...sales.map((s) => [s, 1]), ...refunds.map((s) => [s, -1])]).filter((r) => r.net || r.tax);
  // takings by payment and by branch, after the refunds paid back from them
  const net = (key) => { const m = {}; for (const [list, sign] of [[sales, 1], [refunds, -1]]) for (const s of list) { const k = key(s); m[k] = (m[k] || 0) + sign * (Number(s.total) || 0); } return m; };
  const byPay = net((s) => s.payment || 'Cash'), byBranch = net((s) => s.branchId || 'main');
  // still owed: the period's sales on credit that were not refunded
  const credit = sum(sales.filter((s) => s.status !== 'refunded'), (s) => s.total - (s.paid ?? s.total));
  const items = {};
  for (const [list, sign] of [[sales, 1], [refunds, -1]]) for (const s of list) for (const i of s.items || []) {
    const r = (items[i.name] ||= { name: i.name, qty: 0, value: 0 }); r.qty += sign * i.qty; r.value += sign * i.qty * i.price;
  }
  const exp = sum(expenses, (e) => e.amount);
  return {
    count: sales.length, gross, total, cost, profit: total - tax - cost, tax, vat, expenses: exp, net: total - tax - cost - exp,
    discounts: sum(sales, (s) => s.discount), refunds: refunds.length, refundValue, credit,
    byPay: Object.entries(byPay).filter(([, v]) => v).sort((a, b) => b[1] - a[1]),
    byBranch: Object.entries(byBranch).map(([id, v]) => [branches.find((b) => b.id === id)?.name || (id === 'main' ? 'Main branch' : id), v]).sort((a, b) => b[1] - a[1]),
    top: Object.values(items).filter((t) => t.qty > 0).sort((a, b) => b.value - a.value).slice(0, 5), lowStock, expiring,
  };
}

/** The message: short lines that read well in an email and on WhatsApp */
export function summaryText(name, day, f, money) {
  const L = [`${name}: daily summary for ${day}`, '',
    `Sales: ${money(f.gross ?? f.total)} (${f.count} sale${f.count === 1 ? '' : 's'})`,
    ...(f.refunds > 0 ? [`Refunds made today: ${f.refunds} (${money(f.refundValue)})`, `Sales after refunds: ${money(f.total)}`] : []),
    ...f.byPay.map(([k, v]) => `  ${k}: ${money(v)}`),
    ...(f.credit > 0 ? [`  of which on credit: ${money(f.credit)}`] : []),
    `Gross profit: ${money(f.profit)}`, `Expenses: ${money(f.expenses)}`, `Net for the day: ${money(f.net)}`];
  if (f.discounts > 0) L.push(`Discounts given: ${money(f.discounts)}`);
  if (f.byBranch.length > 1) L.push('', 'By branch:', ...f.byBranch.map(([k, v]) => `  ${k}: ${money(v)}`));
  if (f.top.length) L.push('', 'Best sellers:', ...f.top.map((t) => `  ${t.name}: ${t.qty} (${money(t.value)})`));
  if (f.expiring.length) L.push('', `Expiring within 30 days: ${f.expiring.length} batch${f.expiring.length === 1 ? '' : 'es'}`, ...f.expiring.slice(0, 5).map((e) => `  ${e}`));
  if (f.lowStock.length) L.push('', `Low stock: ${f.lowStock.length}`, ...f.lowStock.slice(0, 5).map((e) => `  ${e}`));
  L.push('', '— RxPOS');
  return L.join('\n');
}

/** Stock that needs attention on [day]: batches with stock expiring within 30 days, medicines at or below their reorder level */
export async function attention(db, tenant, day) {
  const rows = async (sql, ...args) => (await db.prepare(sql).bind(tenant, ...args).all()).results.map((r) => JSON.parse(r.rec || 'null')).filter(Boolean);
  const stock = (await db.prepare("SELECT json_extract(rec, '$.batchId') b, json_extract(rec, '$.productId') p, SUM(json_extract(rec, '$.qty')) q FROM records WHERE tenant = ?1 AND t = 'movements' AND deleted = 0 GROUP BY b, p").bind(tenant).all()).results;
  const byBatch = new Map(stock.filter((s) => s.q > 0 && s.b).map((s) => [s.b, s.q]));
  const byProduct = new Map(); for (const s of stock) byProduct.set(s.p, (byProduct.get(s.p) || 0) + s.q);
  const soon = new Date(Date.parse(day) + 30 * 864e5).toISOString().slice(0, 10);
  const batches = (await rows("SELECT rec FROM records WHERE tenant = ?1 AND t = 'batches' AND deleted = 0 AND json_extract(rec, '$.expiry') != '' AND json_extract(rec, '$.expiry') <= ?2", soon)).filter((b) => byBatch.get(b.id) > 0);
  const products = await rows("SELECT rec FROM records WHERE tenant = ?1 AND t = 'products' AND deleted = 0 AND json_extract(rec, '$.reorder') > 0");
  const name = new Map((await rows("SELECT rec FROM records WHERE tenant = ?1 AND t = 'products' AND deleted = 0")).map((p) => [p.id, p.name]));
  return {
    expiring: batches.sort((a, b) => a.expiry.localeCompare(b.expiry)).map((b) => ({ medicine: name.get(b.productId) || 'Medicine', batch: b.batch, left: byBatch.get(b.id), expiry: b.expiry })),
    // 2026-11-17 audit: out of stock (0 or less) is the most urgent kind of low, and used to be left out
    low: products.filter((p) => { const q = byProduct.get(p.id) || 0; return q <= p.reorder; }).map((p) => ({ medicine: p.name, left: byProduct.get(p.id) || 0, reorder: p.reorder })),
  };
}

const fmtMoney = (settings) => (n) => `${settings.currency || 'UGX'} ${Math.round(Number(n) || 0).toLocaleString('en-US')}`;

/** Build (and unless dry, email) today's summary for every pharmacy that asked for it */
export async function dailySummaries(env, { now = new Date(), dry = false, tenantId = null } = {}) {
  const db = env.DB;
  const { day, startIso, endIso } = eatDay(now);
  const tenants = (await db.prepare("SELECT id, name, status FROM tenants WHERE status IS NULL OR status = 'active'").all()).results.filter((t) => !tenantId || t.id === tenantId);
  const out = [];
  for (const t of tenants) {
    // 2026-11-17 audit: one pharmacy's bad record no longer stops every later pharmacy's email
    try {
    const rec = async (table, id) => { const r = await db.prepare('SELECT rec FROM records WHERE tenant = ?1 AND t = ?2 AND id = ?3 AND deleted = 0').bind(t.id, table, id).first(); return r ? JSON.parse(r.rec || 'null') : null; };
    const settings = (await rec('settings', 'settings')) || {};
    const to = String(settings.summaryEmails || '').split(/[,;\s]+/).map((x) => x.trim()).filter((x) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x)).slice(0, 5);
    if (!to.length && !tenantId) continue;
    const rows = async (sql, ...args) => (await db.prepare(sql).bind(t.id, ...args).all()).results.map((r) => JSON.parse(r.rec || 'null')).filter(Boolean);
    const sales = await rows("SELECT rec FROM records WHERE tenant = ?1 AND t = 'sales' AND deleted = 0 AND json_extract(rec, '$.date') >= ?2 AND json_extract(rec, '$.date') < ?3", startIso, endIso);
    const refunds = await rows(REFUNDS_SQL, startIso, endIso);
    const expenses = await rows("SELECT rec FROM records WHERE tenant = ?1 AND t = 'expenses' AND deleted = 0 AND substr(json_extract(rec, '$.date'), 1, 10) = ?2", day);
    const branches = await rows("SELECT rec FROM records WHERE tenant = ?1 AND t = 'branches' AND deleted = 0");
    const att = await attention(db, t.id, day);
    const expiring = att.expiring.map((b) => `${b.medicine} batch ${b.batch}: ${b.left} left, expires ${b.expiry}`);
    const lowStock = att.low.map((p) => `${p.medicine}: ${p.left} left (reorder at ${p.reorder})`);
    const f = summarise({ sales, refunds, expenses, branches, lowStock, expiring });
    const text = summaryText(settings.name || t.name, day, f, fmtMoney(settings));
    let sent = 0, error = '';
    if (!dry && to.length) {
      if (!env.BREVO_API_KEY || !env.BREVO_SENDER_EMAIL) error = 'email not set up';
      else for (const email of to) {
        const r = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST', headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ sender: { email: env.BREVO_SENDER_EMAIL, name: env.BREVO_SENDER_NAME || 'RxPOS' }, to: [{ email }], subject: `${settings.name || t.name}: ${fmtMoney(settings)(f.total)} sales on ${day}`, textContent: text }),
        }).catch((e) => ({ ok: false, status: e.message }));
        if (r.ok) sent++; else error = 'Brevo ' + r.status;
      }
    }
    out.push({ tenant: t.id, day, to, sent, error, figures: f, text });
      } catch (e) { console.warn('scheduled job skipped a pharmacy', t.id, e.message); out.push({ tenant: t.id, error: e.message }); }
  }
  return out;
}

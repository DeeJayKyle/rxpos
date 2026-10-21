// Daily owner summary: every evening each pharmacy that set "Daily summary emails" (Settings → Alerts) gets the
// day's figures by email: sales and how they were paid, profit, expenses, refunds and discounts, per branch, the
// best sellers, and stock that needs attention. The same text is shown in the app (Weekly Summary → Today) with a
// WhatsApp share button. Sent through Brevo (BREVO_API_KEY), like password emails.

const EAT = 3 * 3600e3; // Uganda is UTC+3 all year
const pad = (n) => String(n).padStart(2, '0');
/** The local (EAT) day of a moment, YYYY-MM-DD, and that day's start / end as UTC ISO strings */
export function eatDay(now = new Date()) {
  const l = new Date(now.getTime() + EAT);
  const day = `${l.getUTCFullYear()}-${pad(l.getUTCMonth() + 1)}-${pad(l.getUTCDate())}`;
  const start = new Date(Date.parse(day + 'T00:00:00Z') - EAT);
  return { day, startIso: start.toISOString(), endIso: new Date(start.getTime() + 864e5).toISOString() };
}

/** Plain figures for one day, from that day's sales and expenses (pure: also used by the tests) */
export function summarise({ sales, expenses, branches = [], lowStock = [], expiring = [] }) {
  const ok = sales.filter((s) => s.status !== 'refunded');
  const refunded = sales.filter((s) => s.status === 'refunded');
  const sum = (a, f) => a.reduce((x, y) => x + (Number(f(y)) || 0), 0);
  const total = sum(ok, (s) => s.total);
  const cost = sum(ok, (s) => sum(s.items || [], (i) => (i.cost || 0) * i.qty));
  const tax = sum(ok, (s) => s.tax);
  const byPay = {};
  for (const s of ok) byPay[s.payment || 'Cash'] = (byPay[s.payment || 'Cash'] || 0) + (Number(s.total) || 0);
  const credit = sum(ok, (s) => s.total - (s.paid ?? s.total));
  const byBranch = {};
  for (const s of ok) { const b = s.branchId || 'main'; byBranch[b] = (byBranch[b] || 0) + (Number(s.total) || 0); }
  const items = {};
  for (const s of ok) for (const i of s.items || []) { const r = (items[i.name] ||= { name: i.name, qty: 0, value: 0 }); r.qty += i.qty; r.value += i.qty * i.price; }
  const exp = sum(expenses, (e) => e.amount);
  return {
    count: ok.length, total, cost, profit: total - tax - cost, tax, expenses: exp, net: total - tax - cost - exp,
    discounts: sum(ok, (s) => s.discount), refunds: refunded.length, refundValue: sum(refunded, (s) => s.total), credit,
    byPay: Object.entries(byPay).sort((a, b) => b[1] - a[1]),
    byBranch: Object.entries(byBranch).map(([id, v]) => [branches.find((b) => b.id === id)?.name || (id === 'main' ? 'Main branch' : id), v]).sort((a, b) => b[1] - a[1]),
    top: Object.values(items).sort((a, b) => b.value - a.value).slice(0, 5), lowStock, expiring,
  };
}

/** The message: short lines that read well in an email and on WhatsApp */
export function summaryText(name, day, f, money) {
  const L = [`${name}: daily summary for ${day}`, '',
    `Sales: ${money(f.total)} (${f.count} sale${f.count === 1 ? '' : 's'})`,
    ...f.byPay.map(([k, v]) => `  ${k}: ${money(v)}`),
    ...(f.credit > 0 ? [`  of which on credit: ${money(f.credit)}`] : []),
    `Gross profit: ${money(f.profit)}`, `Expenses: ${money(f.expenses)}`, `Net for the day: ${money(f.net)}`];
  if (f.discounts > 0) L.push(`Discounts given: ${money(f.discounts)}`);
  if (f.refunds > 0) L.push(`Refunds: ${f.refunds} (${money(f.refundValue)})`);
  if (f.byBranch.length > 1) L.push('', 'By branch:', ...f.byBranch.map(([k, v]) => `  ${k}: ${money(v)}`));
  if (f.top.length) L.push('', 'Best sellers:', ...f.top.map((t) => `  ${t.name}: ${t.qty} (${money(t.value)})`));
  if (f.expiring.length) L.push('', `Expiring within 30 days: ${f.expiring.length} batch${f.expiring.length === 1 ? '' : 'es'}`, ...f.expiring.slice(0, 5).map((e) => `  ${e}`));
  if (f.lowStock.length) L.push('', `Low stock: ${f.lowStock.length}`, ...f.lowStock.slice(0, 5).map((e) => `  ${e}`));
  L.push('', '— RxPOS');
  return L.join('\n');
}

const fmtMoney = (settings) => (n) => `${settings.currency || 'UGX'} ${Math.round(Number(n) || 0).toLocaleString('en-US')}`;

/** Build (and unless dry, email) today's summary for every pharmacy that asked for it */
export async function dailySummaries(env, { now = new Date(), dry = false, tenantId = null } = {}) {
  const db = env.DB;
  const { day, startIso, endIso } = eatDay(now);
  const tenants = (await db.prepare("SELECT id, name, status FROM tenants WHERE status IS NULL OR status = 'active'").all()).results.filter((t) => !tenantId || t.id === tenantId);
  const out = [];
  for (const t of tenants) {
    const rec = async (table, id) => { const r = await db.prepare('SELECT rec FROM records WHERE tenant = ?1 AND t = ?2 AND id = ?3 AND deleted = 0').bind(t.id, table, id).first(); return r ? JSON.parse(r.rec || 'null') : null; };
    const settings = (await rec('settings', 'settings')) || {};
    const to = String(settings.summaryEmails || '').split(/[,;\s]+/).map((x) => x.trim()).filter((x) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x)).slice(0, 5);
    if (!to.length && !tenantId) continue;
    const rows = async (sql, ...args) => (await db.prepare(sql).bind(t.id, ...args).all()).results.map((r) => JSON.parse(r.rec || 'null')).filter(Boolean);
    const sales = await rows("SELECT rec FROM records WHERE tenant = ?1 AND t = 'sales' AND deleted = 0 AND json_extract(rec, '$.date') >= ?2 AND json_extract(rec, '$.date') < ?3", startIso, endIso);
    const expenses = await rows("SELECT rec FROM records WHERE tenant = ?1 AND t = 'expenses' AND deleted = 0 AND substr(json_extract(rec, '$.date'), 1, 10) = ?2", day);
    const branches = await rows("SELECT rec FROM records WHERE tenant = ?1 AND t = 'branches' AND deleted = 0");
    // stock needing attention: batches with stock expiring within 30 days, products at or below their reorder level
    const stock = (await db.prepare("SELECT json_extract(rec, '$.batchId') b, json_extract(rec, '$.productId') p, SUM(json_extract(rec, '$.qty')) q FROM records WHERE tenant = ?1 AND t = 'movements' AND deleted = 0 GROUP BY b, p").bind(t.id).all()).results;
    const byBatch = new Map(stock.filter((s) => s.q > 0 && s.b).map((s) => [s.b, s.q]));
    const byProduct = new Map(); for (const s of stock) byProduct.set(s.p, (byProduct.get(s.p) || 0) + s.q);
    const soon = new Date(Date.parse(day) + 30 * 864e5).toISOString().slice(0, 10);
    const batches = (await rows("SELECT rec FROM records WHERE tenant = ?1 AND t = 'batches' AND deleted = 0 AND json_extract(rec, '$.expiry') != '' AND json_extract(rec, '$.expiry') <= ?2", soon)).filter((b) => byBatch.get(b.id) > 0);
    const products = await rows("SELECT rec FROM records WHERE tenant = ?1 AND t = 'products' AND deleted = 0 AND json_extract(rec, '$.reorder') > 0");
    const name = new Map((await rows("SELECT rec FROM records WHERE tenant = ?1 AND t = 'products' AND deleted = 0")).map((p) => [p.id, p.name]));
    const expiring = batches.sort((a, b) => a.expiry.localeCompare(b.expiry)).map((b) => `${name.get(b.productId) || 'Medicine'} batch ${b.batch}: ${byBatch.get(b.id)} left, expires ${b.expiry}`);
    const lowStock = products.filter((p) => { const q = byProduct.get(p.id) || 0; return q > 0 && q <= p.reorder; }).map((p) => `${p.name}: ${byProduct.get(p.id)} left (reorder at ${p.reorder})`);
    const f = summarise({ sales, expenses, branches, lowStock, expiring });
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
  }
  return out;
}

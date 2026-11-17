// The Dashboard's figures (pure, so they can be unit-tested): the period chips, each tile's change against the period
// before, and the stock health score with what drives it. The owner's choice (2026-11-15): one clean dashboard, from
// the dashboard references: period chips, four figures with ↑ / ↓, one sales chart, a stock health gauge, the top
// medicines and the latest sales. Everything else is a widget that can be switched back on (Edit widgets).
import { localDate, dayOf } from './dates.js';
import { daysUntil } from './dates.js';

/** The period chips: Today, the last month (30 days), 6 months, 12 months and the year so far */
export const PERIODS = [['today', 'Today'], ['1m', '1M'], ['6m', '6M'], ['12m', '12M'], ['ytd', 'YTD']];
export const PERIOD_WORDS = { today: 'today', '1m': 'last 30 days', '6m': 'last 6 months', '12m': 'last 12 months', ytd: 'this year' };
export const VS_WORDS = { today: 'vs yesterday', '1m': 'vs the 30 days before', '6m': 'vs the 6 months before', '12m': 'vs the 12 months before', ytd: 'vs the same days last year' };

const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const addMonths = (d, n) => { const x = new Date(d); x.setMonth(x.getMonth() + n); return x; };

/** The days of a period and of the period before it, as [first, last] local dates (inclusive) */
export function periodRange(period, now = new Date()) {
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  let start, prevStart, prevEnd;
  if (period === 'ytd') {
    start = new Date(end.getFullYear(), 0, 1, 12);
    prevStart = new Date(end.getFullYear() - 1, 0, 1, 12);
    prevEnd = new Date(end.getFullYear() - 1, end.getMonth(), end.getDate(), 12);
  } else if (period === '6m' || period === '12m') {
    start = addDays(addMonths(end, period === '6m' ? -6 : -12), 1);
    prevEnd = addDays(start, -1);
    prevStart = addDays(addMonths(prevEnd, period === '6m' ? -6 : -12), 1);
  } else {
    const n = period === '1m' ? 30 : 1;
    start = addDays(end, -(n - 1));
    prevEnd = addDays(start, -1);
    prevStart = addDays(prevEnd, -(n - 1));
  }
  return { from: localDate(start), to: localDate(end), prevFrom: localDate(prevStart), prevTo: localDate(prevEnd) };
}

/** Totals of the day buckets ({ 'YYYY-MM-DD': { n, total, exp, gp } }) between two dates */
export function sumDays(byDay, from, to) {
  const out = { n: 0, total: 0, exp: 0, gp: 0 };
  for (const [k, v] of Object.entries(byDay)) {
    if (k < from || k > to) continue;
    out.n += v.n || 0; out.total += v.total || 0; out.exp += v.exp || 0; out.gp += v.gp || 0;
  }
  return out;
}

/** % change, or null when there is nothing to compare with */
export const change = (cur, prev) => (prev > 0 ? ((cur - prev) / prev) * 100 : null);

/**
 * The period's figures and their change against the period before: { cur, prev, delta: { total, gp, exp, n }, range }
 */
export function periodFigures(byDay, period, now) {
  const range = periodRange(period, now);
  const cur = sumDays(byDay, range.from, range.to), prev = sumDays(byDay, range.prevFrom, range.prevTo);
  return { range, cur, prev, delta: { total: change(cur.total, prev.total), gp: change(cur.gp, prev.gp), exp: change(cur.exp, prev.exp), n: change(cur.n, prev.n) } };
}

/** The best-selling medicines of a period (sales not refunded, this branch): [{ name, qty, amount, cost, profit }] */
export function topMedicines(sales, from, to, by = 'amount', limit = 5) {
  const top = {};
  for (const s of sales) {
    const d = dayOf(s.date); // the local day, not the UTC one (a sale after 9 pm in Kampala is the next UTC day)
    if (d < from || d > to) continue;
    for (const i of s.items || []) {
      const t = (top[i.name] ??= { name: i.name, qty: 0, amount: 0, cost: 0 });
      t.qty += i.qty; t.amount += i.qty * i.price; t.cost += i.qty * (i.cost || 0);
    }
  }
  return Object.values(top).map((x) => ({ ...x, profit: x.amount - x.cost })).sort((a, b) => b[by] - a[by]).slice(0, limit);
}

/**
 * Stock health, 0-100: the share of the stock's value that is not expired or expiring within `warn` days, lowered by
 * the share of re-ordered medicines (a reorder level is set) that are at or below it or out of stock. Returns the
 * score, what drives it and one plain sentence on the biggest problem.
 */
export function stockHealth(products, batchesOf, warn = 90) {
  let good = 0, soon = 0, expired = 0, tracked = 0, low = 0, out = 0;
  const soonBy = {}, lowList = [];
  for (const p of products) {
    if (p.reorder > 0) {
      tracked++;
      if (!(p.stock > 0)) out++;
      else if (p.stock <= p.reorder) { low++; lowList.push(p); }
    }
    if (!(p.stock > 0)) continue;
    for (const b of batchesOf(p.id)) {
      if (!(b.qty > 0)) continue;
      const v = b.qty * (Number(p.cost) || Number(b.cost) || 0);
      const days = b.expiry ? daysUntil(b.expiry) : Infinity;
      if (days < 0) expired += v;
      else if (days <= warn) { soon += v; soonBy[p.name] = (soonBy[p.name] || 0) + v; }
      else good += v;
    }
  }
  const all = good + soon + expired;
  const valueShare = all > 0 ? good / all : 1;
  const shortShare = tracked ? (low + out) / tracked : 0;
  const score = Math.max(0, Math.min(100, Math.round(valueShare * (1 - 0.5 * shortShare) * 100)));
  const pct = (v) => (all > 0 ? Math.round((v / all) * 100) : 0);
  const drivers = [
    expired > 0 && { key: 'expired', label: `Expired ${pct(expired)}%`, tone: 'danger', to: '/expiry', state: { tab: 'expired' } },
    soon > 0 && { key: 'expiring', label: `Expiring ${pct(soon)}%`, tone: 'warn', to: '/expiry' },
    out > 0 && { key: 'out', label: `${out} out of stock`, tone: 'warn', to: '/inventory', state: { filter: 'out' } },
    low > 0 && { key: 'low', label: `${low} low`, tone: 'warn', to: '/inventory', state: { filter: 'low' } },
  ].filter(Boolean);
  // the biggest leak, said plainly
  let insight;
  const topSoon = Object.entries(soonBy).sort((a, b) => b[1] - a[1]);
  if (expired > 0 && expired >= soon) insight = { title: 'Expired stock is the biggest loss', text: `${pct(expired)}% of the stock's value has expired. Return it to the supplier or write it off.`, to: '/expiry' };
  else if (soon > 0 && pct(soon) >= 5) {
    const three = topSoon.slice(0, 3), share = Math.round((three.reduce((a, [, v]) => a + v, 0) / soon) * 100);
    insight = { title: 'Expiring stock is the biggest risk', text: `${pct(soon)}% of the stock's value expires within ${warn} days; ${three.length === 1 ? three[0][0] + ' holds' : `${three.length} medicines hold`} ${share}% of it${three.length > 1 ? ` (${three.map(([n]) => n).join(', ')})` : ''}. Sell them first or return them.`, to: '/expiry' };
  } else if (low + out > 0) insight = { title: 'Running short', text: `${low + out} of the ${tracked} medicines with a reorder level are low or out of stock. Order them before customers are turned away.`, to: '/reorder' };
  else insight = { title: 'Stock is in good shape', text: 'Nothing expired, little expiring and nothing short.', to: '/inventory' };
  return { score, good, soon, expired, low, out, tracked, drivers, insight };
}

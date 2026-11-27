// Stock controls (stock review of 27 Nov 2026). Sales were taking stock out exactly right; what lost stock was the
// corrections: counts, adjustments, inventory edits and write-offs (about 7% of the cost of sales at one pharmacy and
// 26% at another, against the 1–2% a pharmacy should aim for). This module holds the rules both the app and the cloud
// use for them. Pure: no React, unit-tested in tests/unit-stock-control.mjs.
//
//  • a reason picked from a list for every adjustment and inventory edit (reports show losses by reason and person)
//  • a manager's approval for a loss over the pharmacy's limit (as refunds over a limit already need one)
//  • the cloud flags a loss over the limit, and a day's losses over the day limit, for the owner (worker/anomalies.js)
//  • shrinkage (losses ÷ cost of sales), deliveries against cost of sales, and nudges for a missing delivery, the
//    weekly order and stock takes entered as many adjustments

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** Why stock was changed by hand: [code, words]. The code is saved on the movement as `reason`. */
export const STOCK_REASONS = [
  ['damaged', 'Damaged or broken'],
  ['expired', 'Expired'],
  ['loss', 'Missing or stolen'],
  ['count', 'Count correction'],
  ['entry', 'Typing mistake'],
  ['sample', 'Sample or own use'],
  ['found', 'Found on the shelf'],
  ['other', 'Other'],
];
const REASON_WORDS = Object.fromEntries(STOCK_REASONS);
/** The words for a reason code; older movements have only a typed note */
export const reasonLabel = (code) => REASON_WORDS[code] || (code ? String(code) : 'No reason given');
/** The note saved with a hand change: the reason's words, then what was typed */
export const reasonNote = (code, note) => [code && code !== 'other' ? reasonLabel(code) : '', String(note || '').trim()].filter(Boolean).join(': ');
/** A reason is complete when one is picked, and "Other" says why */
export const reasonReady = (code, note) => !!code && (code !== 'other' || !!String(note || '').trim());

/** The stock changes made by hand (not stock coming in or going out through a sale, delivery, refund or transfer) */
export const CORRECTION_TYPES = new Set(['Adjustment', 'Inventory edit', 'Stock count', 'Expired write-off']);
const SOLD_TYPES = new Set(['Sale', 'Sale edit', 'Refund']);
const BOUGHT_TYPES = new Set(['Purchase', 'Purchase edit']);

/** Defaults (Settings → Stock controls). 0 turns each one off. */
export const LOSS_LIMIT = 50000; // one change losing more than this needs a manager, and the cloud flags it
export const LOSS_DAY_LIMIT = 200000; // a day's hand losses at a branch over this are flagged for the owner
export const DELIVERY_GAP_DAYS = 7; // selling this many days with no delivery recorded: remind the manager
export const BURST_ADJUSTMENTS = 10; // this many adjustments by one person within an hour look like a stock take
export const SHRINK_TARGET = 2; // % of the cost of sales; above it the dashboard shows the figure in red

const setting = (s, k, d) => { const v = s?.[k]; return v === '' || v == null || !Number.isFinite(Number(v)) ? d : Math.max(0, Number(v)); };
export const lossLimit = (s) => setting(s, 'stockLossLimit', LOSS_LIMIT);
export const lossDayLimit = (s) => setting(s, 'stockLossDayLimit', LOSS_DAY_LIMIT);
export const deliveryGapDays = (s) => setting(s, 'deliveryGapDays', DELIVERY_GAP_DAYS);

/** Managers and administrators approve (the same people who approve big refunds) */
export const isApprover = (u) => !!u && ['admin', 'manager'].includes(u.role);

/** Does a hand change that loses `lossValue` (at cost, ≥ 0) need a manager's approval from this person? */
export function needsApproval(lossValue, settings, user) {
  const limit = lossLimit(settings);
  return limit > 0 && num(lossValue) > limit && !isApprover(user);
}

/** The cost of one unit a movement moved: its batch's cost, else the medicine's */
export function costLookup(products, batches) {
  const P = new Map((products || []).map((p) => [p.id, num(p.cost)]));
  const B = new Map((batches || []).map((b) => [b.id, num(b.cost)]));
  return (m) => (m.batchId && B.get(m.batchId)) || P.get(m.productId) || 0;
}

/** Value lost (≥ 0) by a list of planned changes [{ qty, cost }] */
export const lossOf = (changes) => changes.reduce((a, c) => a + Math.max(0, -num(c.qty)) * num(c.cost), 0);

const inBranch = (m, branchId) => !branchId || (m.branchId || 'main') === branchId;

/**
 * Shrinkage between two moments (ISO strings, `to` not included): what hand changes lost (net of what they found),
 * against the cost of what was sold. → { lost, found, net, sold, pct, byType, byReason, byPerson }
 */
export function shrinkage(movements, { from = '', to = '￿', costOf, branchId = null } = {}) {
  const out = { lost: 0, found: 0, net: 0, sold: 0, pct: null, byType: {}, byReason: {}, byPerson: {} };
  for (const m of movements || []) {
    const d = String(m.date || '');
    if (d < from || d >= to || !inBranch(m, branchId)) continue;
    const v = num(m.qty) * costOf(m);
    if (CORRECTION_TYPES.has(m.type)) {
      if (v < 0) out.lost -= v; else out.found += v;
      out.byType[m.type] = (out.byType[m.type] || 0) + v;
      const why = m.type === 'Expired write-off' ? 'expired' : m.type === 'Stock count' ? 'count' : m.reason || 'none';
      out.byReason[why] = (out.byReason[why] || 0) + v;
      const who = m.user || '—';
      out.byPerson[who] = (out.byPerson[who] || 0) + v;
    } else if (SOLD_TYPES.has(m.type)) out.sold -= v;
  }
  out.net = out.lost - out.found;
  out.pct = out.sold > 0 ? Math.round((out.net / out.sold) * 1000) / 10 : null;
  return out;
}

/** Monday (YYYY-MM-DD) of the week of an ISO date, in the date's own calendar day */
export function weekStart(iso) {
  const d = new Date(String(iso).slice(0, 10) + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

/**
 * Deliveries against the cost of sales, week by week (the last `weeks` weeks to `today`, oldest first):
 * [{ week (Monday), bought, sold }]. Selling far more than is received means stock runs down, or deliveries are
 * not being entered.
 */
export function weeklyBuySell(movements, { costOf, today, weeks = 8, branchId = null }) {
  const last = weekStart(today);
  const list = [];
  for (let i = weeks - 1; i >= 0; i--) { const d = new Date(last + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - 7 * i); list.push({ week: d.toISOString().slice(0, 10), bought: 0, sold: 0 }); }
  const at = new Map(list.map((w) => [w.week, w]));
  for (const m of movements || []) {
    if (!inBranch(m, branchId)) continue;
    const isBuy = BOUGHT_TYPES.has(m.type), isSale = SOLD_TYPES.has(m.type);
    if (!isBuy && !isSale) continue;
    const w = at.get(weekStart(m.date));
    if (!w) continue;
    const v = num(m.qty) * costOf(m);
    if (isBuy) w.bought += v; else w.sold -= v;
  }
  for (const w of list) { w.bought = Math.round(w.bought); w.sold = Math.round(w.sold); }
  return list;
}

const dayMs = 864e5;
const dayNo = (iso) => Math.floor(Date.parse(String(iso).slice(0, 10) + 'T00:00:00Z') / dayMs);

/**
 * Selling with no delivery recorded: → null, or { days, since, sales, never } when `minDays` or more days have passed
 * since the branch's last delivery (or since its stock began, when it has had none) and it has sold since.
 */
export function deliveryGap(movements, { today, branchId = null, minDays = DELIVERY_GAP_DAYS }) {
  if (!(minDays > 0)) return null;
  let lastIn = '', first = '', sales = 0;
  for (const m of movements || []) {
    if (!inBranch(m, branchId)) continue;
    const d = String(m.date || '');
    if (!first || d < first) first = d;
    if (m.type === 'Purchase' && num(m.qty) > 0 && d > lastIn) lastIn = d;
  }
  const since = lastIn || first;
  if (!since) return null;
  for (const m of movements || []) if (inBranch(m, branchId) && m.type === 'Sale' && String(m.date) > since) sales++;
  const days = dayNo(today) - dayNo(since);
  return days >= minDays && sales > 0 ? { days, since: since.slice(0, 10), sales, never: !lastIn } : null;
}

/** How many adjustments this person made in the last `minutes` (a stock take typed as adjustments) */
export function adjustmentBurst(movements, userName, nowIso, minutes = 60) {
  const from = new Date(Date.parse(nowIso) - minutes * 60000).toISOString();
  let n = 0;
  for (const m of movements || []) if (m.type === 'Adjustment' && m.user === userName && String(m.date) >= from) n++;
  return n;
}

/** An expiry date's state on `today`: 'expired', 'soon' (within warnDays) or null. Month-only dates mean the month's end. */
export function expiryState(expiry, today, warnDays = 90) {
  const e = String(expiry || '').trim();
  if (!/^\d{4}-\d{2}(-\d{2})?$/.test(e)) return null;
  let end = e;
  if (e.length === 7) { const d = new Date(e + '-01T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() + 1); d.setUTCDate(0); end = d.toISOString().slice(0, 10); }
  const left = dayNo(end) - dayNo(today);
  if (left < 0) return 'expired';
  return left <= warnDays ? 'soon' : null;
}

/**
 * The weekly order (Settings → Stock controls → order day, 0 = Sunday … 6 = Saturday; '' = off): due from that day
 * until an order is drafted that week. → null, or { since } (the order day's date)
 */
export function orderDue(settings, today, orders = []) {
  const v = settings?.orderDay;
  if (v === '' || v == null || !(Number(v) >= 0 && Number(v) <= 6)) return null;
  const t = new Date(String(today).slice(0, 10) + 'T00:00:00Z');
  const back = (t.getUTCDay() - Number(v) + 7) % 7;
  t.setUTCDate(t.getUTCDate() - back);
  const since = t.toISOString().slice(0, 10);
  return (orders || []).some((o) => String(o.date || o.createdAt || '').slice(0, 10) >= since) ? null : { since };
}

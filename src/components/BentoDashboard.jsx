// The bento row of the Dashboard (2026-11-14, from the owner's dashboard references; slimmed in 1.16.0): a dark hero
// card with the last 7 days' sales against the 7 before, the best day, busiest hour, receipts and average sale, and
// the pharmacy's most useful next step. Reads the day totals the
// Dashboard already worked out (one pass over the sales), so it adds no work of its own beyond the last receipts.
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Sparkles } from 'lucide-react';
import { localDate, MAIN_BRANCH, today } from '../store.jsx';
import { featuredAction } from './NavMenus.jsx';
import { dateLocale } from '../showdate.js';

const keyFor = (offset) => { const d = new Date(); d.setDate(d.getDate() - offset); return localDate(d); };
const shortDay = (k) => new Date(k + 'T12:00').toLocaleDateString(dateLocale(), { weekday: 'short', day: 'numeric' });

/** The sale's status as a pill: paid, owing (on credit or part-paid), refunded */
export function saleStatus(s) {
  if (s.status === 'refunded') return ['Refunded', 'refunded'];
  if ((s.paid ?? s.total) < s.total - 0.5 && !s.insurance) return ['Owing', 'owing'];
  return ['Paid', 'paid'];
}

/** The busiest hour of the sales from day key `from` on: [hour, count] or null (UI batch 3, B4) */
export function busiestHour(sales, branchId, from) {
  const h = new Array(24).fill(0);
  for (const s of sales) {
    if (s.status === 'refunded' || (s.branchId || MAIN_BRANCH) !== branchId || localDate(new Date(s.date)) < from) continue;
    h[new Date(s.date).getHours()]++;
  }
  const best = h.reduce((b, v, i) => (v > h[b] ? i : b), 0);
  return h[best] ? [best, h[best]] : null;
}
const hourText = (h) => `${String(h).padStart(2, '0')}:00`;

export default function BentoDashboard({ byDay, db, branchId, fmt, fmtShort = fmt, can, counts }) {
  // 1.16.0 (the owner's clean-up): the week at a glance and the next step only; the period is the dashboard's own
  // (no chips here), and the daily chart and latest sales are the dashboard's (no copies here)
  const n = 7;
  const sum = (from, len) => { let total = 0, count = 0; for (let i = from; i < from + len; i++) { const d = byDay[keyFor(i)]; if (d) { total += d.total; count += d.n; } } return { total, count }; };
  const cur = sum(0, n), prev = sum(n, n);
  const delta = prev.total ? ((cur.total - prev.total) / prev.total) * 100 : null;
  // B4: the best day and the busiest hour of the week, in the hero card's middle
  const from = keyFor(n - 1);
  const bestDay = Array.from({ length: n }, (_, i) => keyFor(i)).reduce((b, k) => ((byDay[k]?.total || 0) > (byDay[b]?.total || 0) ? k : b), keyFor(0));
  const peak = useMemo(() => busiestHour(db.sales, branchId, from), [db.sales, branchId, from]);
  const f = featuredAction(counts, can);
  const avg = cur.count ? cur.total / cur.count : 0;

  return (
    <section className="bento-dash slim" aria-label="This week at a glance">
      <div className="bento-grid">
        <Link className="bento-hero" to="/sales" state={{ from: keyFor(n - 1), to: today() }}>
          <span className="micro">Sales · last 7 days</span>
          <strong className="bento-big num">{fmt(cur.total)}</strong>
          <span className="bento-delta-row">
            {delta != null && <span className={'bento-delta ' + (delta >= 0 ? 'up' : 'down')}>{delta >= 0 ? '▲ +' : '▼ −'}{Math.abs(delta).toFixed(1)}%</span>}
            <small>{delta != null ? 'vs the 7 days before' : 'nothing to compare with yet'}</small>
          </span>
          {cur.count > 0 && (
            <span className="bento-facts">
              {byDay[bestDay]?.total > 0 && <span><small>Best day</small><b>{shortDay(bestDay)} · <span className="num">{fmtShort(byDay[bestDay].total)}</span></b></span>}
              {peak && <span><small>Busiest hour</small><b>{hourText(peak[0])} · {peak[1]} sale{peak[1] === 1 ? '' : 's'}</b></span>}
              <span><small>Receipts</small><b className="num">{cur.count.toLocaleString()}</b></span>
              <span><small>Average sale</small><b className="num">{fmt(avg)}</b></span>
            </span>
          )}
        </Link>
        <Link className="bento-action" to={f.to}>
          <Sparkles size={18} aria-hidden="true" />
          <strong>{f.title}</strong>
          <small>{f.text}</small>
          <span className="mega-cta">{f.cta} <ArrowRight size={14} aria-hidden="true" /></span>
        </Link>
      </div>
    </section>
  );
}

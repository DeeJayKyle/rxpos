// The bento KPI row at the top of the Dashboard (2026-11-14, from the owner's dashboard references): period chips,
// a dark hero card with the period's sales against the period before, a bar chart with the current day picked out,
// the latest receipts with a status pill each, and the pharmacy's most useful next step. Reads the day totals the
// Dashboard already worked out (one pass over the sales), so it adds no work of its own beyond the last receipts.
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Sparkles, ReceiptText } from 'lucide-react';
import { localDate, MAIN_BRANCH, today } from '../store.jsx';
import { featuredAction } from './NavMenus.jsx';

const PERIODS = [['1', 'Today'], ['7', '7 days'], ['30', '30 days']];
const keyFor = (offset) => { const d = new Date(); d.setDate(d.getDate() - offset); return localDate(d); };
const shortDay = (k) => new Date(k + 'T12:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' });

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
  const [period, setPeriod] = useState('7');
  const navigate = useNavigate();
  const n = Number(period);
  const sum = (from, len) => { let total = 0, count = 0; for (let i = from; i < from + len; i++) { const d = byDay[keyFor(i)]; if (d) { total += d.total; count += d.n; } } return { total, count }; };
  const cur = sum(0, n), prev = sum(n, n);
  const delta = prev.total ? ((cur.total - prev.total) / prev.total) * 100 : null;
  // bars: the last 7 days for Today and 7 days, the last 30 for 30 days; today picked out
  const bars = Array.from({ length: n === 30 ? 30 : 7 }, (_, i) => { const k = keyFor((n === 30 ? 29 : 6) - i); return { k, v: byDay[k]?.total || 0 }; });
  const max = Math.max(1, ...bars.map((b) => b.v));
  // B1: a faint dashed line at the average of the bars shown (days with no sales count as nothing sold)
  const barAvg = bars.reduce((a, b) => a + b.v, 0) / bars.length;
  // B4: the best day and the busiest hour of the period, in the hero card's middle
  const from = keyFor(n - 1);
  const bestDay = Array.from({ length: n }, (_, i) => keyFor(i)).reduce((b, k) => ((byDay[k]?.total || 0) > (byDay[b]?.total || 0) ? k : b), keyFor(0));
  const peak = useMemo(() => busiestHour(db.sales, branchId, from), [db.sales, branchId, from]);
  const recent = useMemo(() => {
    const out = [];
    for (const s of db.sales) {
      if ((s.branchId || MAIN_BRANCH) !== branchId) continue;
      if (out.length < 5) { out.push(s); out.sort((a, b) => (a.date < b.date ? 1 : -1)); }
      else if (s.date > out[4].date) { out[4] = s; out.sort((a, b) => (a.date < b.date ? 1 : -1)); }
    }
    return out;
  }, [db.sales, branchId]);
  const f = featuredAction(counts, can);
  const avg = cur.count ? cur.total / cur.count : 0;
  const label = PERIODS.find(([k]) => k === period)[1];

  return (
    <section className="bento-dash" aria-label="Sales at a glance">
      <div className="bento-chips seg" role="radiogroup" aria-label="Period">
        {PERIODS.map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={period === k} className={period === k ? 'on' : ''} onClick={() => setPeriod(k)}>{l}</button>)}
      </div>
      <div className="bento-grid">
        <Link className="bento-hero" to="/sales" state={{ from: keyFor(n - 1), to: today() }}>
          <span className="micro">Sales · {label}</span>
          <strong className="bento-big num">{fmt(cur.total)}</strong>
          <span className="bento-delta-row">
            {delta != null && <span className={'bento-delta ' + (delta >= 0 ? 'up' : 'down')}>{delta >= 0 ? '▲ +' : '▼ −'}{Math.abs(delta).toFixed(1)}%</span>}
            <small>{delta != null ? `vs the ${n === 1 ? 'day' : n + ' days'} before` : 'nothing to compare with yet'}</small>
          </span>
          {cur.count > 0 && (
            <span className="bento-facts">
              {n > 1 && byDay[bestDay]?.total > 0 && <span><small>Best day</small><b>{shortDay(bestDay)} · <span className="num">{fmtShort(byDay[bestDay].total)}</span></b></span>}
              {peak && <span><small>Busiest hour</small><b>{hourText(peak[0])} · {peak[1]} sale{peak[1] === 1 ? '' : 's'}</b></span>}
            </span>
          )}
          <span className="bento-mini">
            <span><small>Receipts</small><b className="num">{cur.count.toLocaleString()}</b></span>
            <span><small>Average sale</small><b className="num">{fmt(avg)}</b></span>
          </span>
        </Link>
        <div className="bento-chart card" role="group" aria-label={`Daily sales, the last ${bars.length} days`}>
          <div className="card-head"><h3>Daily sales</h3><small className="muted">{shortDay(bars[0].k)} – today</small></div>
          <div className={'bento-bars' + (bars.length <= 7 ? ' labelled' : '')} style={{ '--avg': barAvg / max }}>
            {barAvg > 0 && <span className="bento-avg" aria-hidden="true" title={`Average ${fmt(barAvg)} a day`} />}
            {bars.map((b) => (
              <button key={b.k} type="button" className={'bento-bar' + (b.k === today() ? ' now' : '')} style={{ '--h': Math.max(0.03, b.v / max) }}
                onClick={() => navigate('/sales', { state: { from: b.k, to: b.k } })}>
                <i>{b.k === today() && b.v > 0 && <em className="bento-val num" aria-hidden="true">{fmtShort(b.v)}</em>}</i>
                <span className="bento-tip">{shortDay(b.k)} · {fmt(b.v)}</span>
                {bars.length <= 7 && <small aria-hidden="true">{new Date(b.k + 'T12:00').toLocaleDateString(undefined, { weekday: 'short' })}</small>}
              </button>
            ))}
          </div>
          {barAvg > 0 && <small className="muted bento-avg-key"><span aria-hidden="true" className="bento-avg-dash" />Average {fmt(barAvg)} a day</small>}
        </div>
        <div className="bento-recent card">
          <div className="card-head"><h3><ReceiptText size={16} />Latest sales</h3><Link to="/sales" className="link-btn small">All</Link></div>
          <ul>
            {recent.map((s) => { const [st, cls] = saleStatus(s); return (
              <li key={s.id}>
                <span className="bento-who"><strong title={s.customerName || 'Walk-in'}>{s.customerName || 'Walk-in'}</strong>{cls !== 'paid' && <span className={'status-pill ' + cls}>{st}</span>}</span>
                <b className="num bento-amt">{fmt(s.total)}</b>
                <small className="muted bento-when">{s.number} · {new Date(s.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small>
              </li>
            ); })}
            {!recent.length && <li className="muted">No sales yet</li>}
          </ul>
        </div>
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

// The bento KPI row at the top of the Dashboard (2026-11-14, from the owner's dashboard references): period chips,
// a dark hero card with the period's sales against the period before, a bar chart with the current day picked out,
// the latest receipts with a status pill each, and the pharmacy's most useful next step. Reads the day totals the
// Dashboard already worked out (one pass over the sales), so it adds no work of its own beyond the last receipts.
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowUpRight, ArrowDownRight, ArrowRight, Sparkles, ReceiptText } from 'lucide-react';
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

export default function BentoDashboard({ byDay, db, branchId, fmt, can, counts }) {
  const [period, setPeriod] = useState('7');
  const navigate = useNavigate();
  const n = Number(period);
  const sum = (from, len) => { let total = 0, count = 0; for (let i = from; i < from + len; i++) { const d = byDay[keyFor(i)]; if (d) { total += d.total; count += d.n; } } return { total, count }; };
  const cur = sum(0, n), prev = sum(n, n);
  const delta = prev.total ? ((cur.total - prev.total) / prev.total) * 100 : null;
  // bars: the last 7 days for Today and 7 days, the last 30 for 30 days; today picked out
  const bars = Array.from({ length: n === 30 ? 30 : 7 }, (_, i) => { const k = keyFor((n === 30 ? 29 : 6) - i); return { k, v: byDay[k]?.total || 0 }; });
  const max = Math.max(1, ...bars.map((b) => b.v));
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
            {delta != null && <span className={'bento-delta ' + (delta >= 0 ? 'up' : 'down')}>{delta >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}{Math.abs(delta).toFixed(1)}%</span>}
            <small>{delta != null ? `vs the ${n === 1 ? 'day' : n + ' days'} before` : 'nothing to compare with yet'}</small>
          </span>
          <span className="bento-mini">
            <span><small>Receipts</small><b className="num">{cur.count.toLocaleString()}</b></span>
            <span><small>Average sale</small><b className="num">{fmt(avg)}</b></span>
          </span>
        </Link>
        <div className="bento-chart card" role="group" aria-label={`Daily sales, the last ${bars.length} days`}>
          <div className="card-head"><h3>Daily sales</h3><small className="muted">{shortDay(bars[0].k)} – today</small></div>
          <div className="bento-bars">
            {bars.map((b) => (
              <button key={b.k} type="button" className={'bento-bar' + (b.k === today() ? ' now' : '')} title={`${shortDay(b.k)}: ${fmt(b.v)}`} aria-label={`${shortDay(b.k)}: ${fmt(b.v)}`}
                onClick={() => navigate('/sales', { state: { from: b.k, to: b.k } })}>
                <i style={{ height: `${Math.max(3, (b.v / max) * 100)}%` }} />
                {bars.length <= 7 && <small>{new Date(b.k + 'T12:00').toLocaleDateString(undefined, { weekday: 'short' })}</small>}
              </button>
            ))}
          </div>
        </div>
        <div className="bento-recent card">
          <div className="card-head"><h3><ReceiptText size={16} />Latest sales</h3><Link to="/sales" className="link-btn small">All</Link></div>
          <ul>
            {recent.map((s) => { const [st, cls] = saleStatus(s); return (
              <li key={s.id}>
                <span className="grow"><strong>{s.customerName || 'Walk-in'}</strong><small className="muted">{s.number} · {new Date(s.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small></span>
                <span className={'status-pill ' + cls}>{st}</span>
                <b className="num">{fmt(s.total)}</b>
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

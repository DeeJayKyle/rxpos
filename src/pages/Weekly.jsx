import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, TrendingUp, TrendingDown, Trophy, Star, BarChart3, Users, Receipt, Coins } from 'lucide-react';
import { useStore, MAIN_BRANCH } from '../store.jsx';
import { Stat, BarChart, Empty, PdfButton } from '../ui.jsx';
import { popup } from '../notify.jsx';

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
/** Monday of the week containing `date`, shifted by `weeks` */
export function weekStart(date = new Date(), weeks = 0) {
  const d = new Date(date); d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + weeks * 7);
  return d;
}
const DAY = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const pct = (a, b) => (b ? ((a - b) / b) * 100 : a ? 100 : 0);

/** Totals for a week (Mon–Sun) and the week before, items that stood out, staff performance */
export function weeklyStats(db, start, branch = 'all') {
  const s = iso(start), e = iso(new Date(start.getTime() + 7 * 864e5)), ps = iso(new Date(start.getTime() - 7 * 864e5));
  const inBranch = (x) => branch === 'all' || (x.branchId || MAIN_BRANCH) === branch;
  const sales = db.sales.filter((x) => x.status !== 'refunded' && inBranch(x));
  const cur = sales.filter((x) => x.date >= s && x.date < e), prev = sales.filter((x) => x.date >= ps && x.date < s);
  const sum = (list) => list.reduce((a, x) => a + x.total, 0);
  const profit = (list) => list.reduce((a, x) => a + x.items.reduce((b, i) => b + i.qty * (i.price - (i.cost || 0)), 0) - (x.discount || 0), 0);
  const byDay = DAY.map((label, i) => { const d = iso(new Date(start.getTime() + i * 864e5)); const pd = iso(new Date(start.getTime() + (i - 7) * 864e5)); return { label, values: [sum(cur.filter((x) => x.date.slice(0, 10) === d)), sum(prev.filter((x) => x.date.slice(0, 10) === pd))] }; });
  const items = (list) => { const m = new Map(); for (const x of list) for (const i of x.items) { const r = m.get(i.id) || { id: i.id, name: i.name, qty: 0, amount: 0 }; r.qty += i.qty; r.amount += i.qty * i.price; m.set(i.id, r); } return m; };
  const ci = items(cur), pi = items(prev);
  const top = [...ci.values()].sort((a, b) => b.amount - a.amount).slice(0, 8);
  const risers = [...ci.values()].map((r) => ({ ...r, before: pi.get(r.id)?.amount || 0 })).filter((r) => r.amount >= 1000).map((r) => ({ ...r, growth: pct(r.amount, r.before) }))
    .sort((a, b) => b.growth - a.growth).slice(0, 4);
  const fallers = [...pi.values()].map((r) => ({ ...r, now: ci.get(r.id)?.amount || 0 })).map((r) => ({ ...r, growth: pct(r.now, r.amount) })).filter((r) => r.growth < -30).sort((a, b) => a.growth - b.growth).slice(0, 4);
  const staff = new Map();
  for (const x of cur) { const k = x.cashier || x.createdBy || '—'; const r = staff.get(k) || { name: k, n: 0, amount: 0 }; r.n++; r.amount += x.total; staff.set(k, r); }
  const pay = new Map();
  for (const x of cur) pay.set(x.payment || 'Cash', (pay.get(x.payment || 'Cash') || 0) + x.total);
  const best = byDay.reduce((a, d) => (d.values[0] > a.values[0] ? d : a), byDay[0]);
  return {
    start: s, end: iso(new Date(start.getTime() + 6 * 864e5)), total: sum(cur), prevTotal: sum(prev), count: cur.length, prevCount: prev.length,
    basket: cur.length ? sum(cur) / cur.length : 0, profit: profit(cur), prevProfit: profit(prev), byDay, top, risers, fallers, best,
    staff: [...staff.values()].sort((a, b) => b.amount - a.amount), payments: [...pay.entries()].sort((a, b) => b[1] - a[1]),
  };
}

function HBars({ rows, fmt, value = (r) => r.amount, label = (r) => r.name, note }) {
  const max = Math.max(1, ...rows.map(value));
  return (
    <div className="hbars">
      {rows.map((r, i) => (
        <div key={i} className="hbar">
          <span className="hbar-label">{label(r)}</span>
          <span className="hbar-track"><i style={{ width: `${(value(r) / max) * 100}%` }} /></span>
          <span className="hbar-val">{fmt(value(r))}{note && <small className="muted"> {note(r)}</small>}</span>
        </div>
      ))}
    </div>
  );
}

/** Small summary used inside the Monday pop-up */
export function WeeklyMini({ w, fmt }) {
  return (
    <div className="weekly-mini">
      <div className="row between"><span className="muted small">{w.start} → {w.end}</span>
        <span className={'delta ' + (w.total >= w.prevTotal ? 'up' : 'down')}>{w.total >= w.prevTotal ? <TrendingUp size={13} /> : <TrendingDown size={13} />}{Math.abs(Math.round(pct(w.total, w.prevTotal)))}%</span></div>
      <strong className="weekly-total">{fmt(w.total)}</strong>
      <span className="muted small">{w.count} sales · best day {w.best?.label}</span>
      <div className="mini-bars">{w.byDay.map((d) => <i key={d.label} title={`${d.label} ${fmt(d.values[0])}`} style={{ height: `${Math.max(4, (d.values[0] / Math.max(1, ...w.byDay.map((x) => x.values[0]))) * 100)}%` }} />)}</div>
      {w.top[0] && <p className="popup-body"><Trophy size={13} /> Top seller: <b>{w.top[0].name}</b> ({fmt(w.top[0].amount)})</p>}
      {w.risers[0] && <p className="popup-body"><Star size={13} /> Stood out: <b>{w.risers[0].name}</b> {w.risers[0].before ? `up ${Math.round(w.risers[0].growth)}%` : 'new this week'}</p>}
    </div>
  );
}

/** At the start of each week (or the first time the app is opened that week): last week's summary pop-up */
export function WeeklyPopup() {
  const { db, fmt, can, features } = useStore();
  useEffect(() => {
    if (!can('reports') || features.reports === false) return;
    const start = weekStart(new Date(), -1);
    const key = 'rxpos-weekly-' + iso(start);
    try { if (localStorage.getItem(key)) return; } catch { return; }
    const t = setTimeout(() => {
      const w = weeklyStats(db, start);
      if (!w.count && !w.prevCount) return;
      try { localStorage.setItem(key, '1'); } catch {}
      popup({ id: 'weekly', tone: 'ok', icon: BarChart3, title: 'Last week at a glance', sound: 'report', wide: true, sticky: true,
        render: () => <WeeklyMini w={w} fmt={fmt} />, actions: [{ label: 'Full weekly report', primary: true, to: '/weekly' }] });
    }, 9000);
    return () => clearTimeout(t);
  }, [db.sales.length > 0]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

export default function WeeklyReport() {
  const { db, fmt, user, branchId } = useStore();
  const [offset, setOffset] = useState(-1);
  const [branch, setBranch] = useState(user.role === 'cashier' ? branchId : 'all');
  const start = weekStart(new Date(), offset);
  const w = useMemo(() => weeklyStats(db, start, branch), [db.sales, offset, branch]); // eslint-disable-line react-hooks/exhaustive-deps
  const weekRef = useRef(null);
  return (
    <div className="page" ref={weekRef}>
      <div className="page-head">
        <div><h1>Weekly summary</h1><div className="sub">{w.start} → {w.end} · compared with the week before</div></div>
        <div className="row gap">
          {db.branches.length > 1 && <select value={branch} onChange={(e) => setBranch(e.target.value)}><option value="all">All branches</option>{db.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>}
          <button className="btn ghost" onClick={() => setOffset(offset - 1)}><ChevronLeft size={16} />Earlier</button>
          <button className="btn ghost" disabled={offset >= 0} onClick={() => setOffset(offset + 1)}>Later<ChevronRight size={16} /></button>
          <PdfButton target={weekRef} title="Weekly summary" subtitle={`${w.start} → ${w.end}`} />
        </div>
      </div>
      <div className="stats">
        <Stat label="Sales" value={fmt(w.total)} delta={pct(w.total, w.prevTotal)} sub="vs week before" tone="teal" icon={Coins} />
        <Stat label="Transactions" value={w.count.toLocaleString()} delta={pct(w.count, w.prevCount)} sub="vs week before" tone="violet" icon={Receipt} />
        <Stat label="Average basket" value={fmt(w.basket)} sub="per sale" icon={Users} />
        <Stat label="Gross profit" value={fmt(w.profit)} delta={pct(w.profit, w.prevProfit)} sub="sales − cost − discounts" tone="amber" icon={TrendingUp} />
      </div>
      <div className="grid2">
        <div className="card"><h3>Sales by day</h3><BarChart data={w.byDay} fmt={fmt} series={[{ name: 'This week' }, { name: 'Week before' }]} height={190} /></div>
        <div className="card"><h3><Trophy size={17} />Top sellers</h3>{w.top.length ? <HBars rows={w.top} fmt={fmt} note={(r) => `· ${r.qty}`} /> : <Empty>No sales this week</Empty>}</div>
      </div>
      <div className="grid2">
        <div className="card"><h3><Star size={17} />Items that stood out</h3>
          {w.risers.length ? <HBars rows={w.risers} fmt={fmt} note={(r) => (r.before ? `↑ ${Math.round(r.growth)}%` : '· new')} /> : <Empty>Nothing stood out</Empty>}
          {w.fallers.length > 0 && <><h3 style={{ marginTop: 14 }}><TrendingDown size={17} />Slowed down</h3><HBars rows={w.fallers} fmt={fmt} value={(r) => r.now} note={(r) => `↓ ${Math.abs(Math.round(r.growth))}%`} /></>}
        </div>
        <div className="card"><h3><Users size={17} />Team performance</h3>
          {w.staff.length ? <HBars rows={w.staff} fmt={fmt} note={(r) => `· ${r.n} sales`} /> : <Empty>No sales</Empty>}
          {w.payments.length > 0 && <><h3 style={{ marginTop: 14 }}>Payment methods</h3><HBars rows={w.payments.map(([name, amount]) => ({ name, amount }))} fmt={fmt} /></>}
        </div>
      </div>
      <p className="muted small">The summary pops up at the start of each week. More detail in <Link to="/reports">Reports</Link>.</p>
    </div>
  );
}

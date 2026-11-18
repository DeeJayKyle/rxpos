import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Banknote, Wallet, CalendarClock, PackageX, Pill, Coins, Users, ShoppingCart, ReceiptText, Share2, Megaphone, Store, TrendingUp, ShieldAlert, PauseCircle, SearchCheck, CalendarDays, SlidersHorizontal, ArrowUp, ArrowDown, ArrowRight, Sparkles, X } from 'lucide-react';
import { draftsFor, seesAllDrafts, isOld, ageText } from '../drafts.js';
import { useStore, today, dayOf, isLowStock, expiryCounts, stockValue, MAIN_BRANCH, put, audit, now } from '../store.jsx';
import { Stat, Empty, Modal } from '../ui.jsx';
import { DailyTrend, MonthLines } from '../charts.jsx';
import { ProductArt } from '../idleart.jsx';
import { useInsights, shareText } from '../engage.jsx';
import { whatsappLink } from '../cloud.js';
import { WeatherCard } from './Storage.jsx';
import BentoDashboard, { saleStatus } from '../components/BentoDashboard.jsx';
import { deviceSettings, setDevice, onDevice } from '../device.js';
import { PERIODS, PERIOD_WORDS, VS_WORDS, periodFigures, topMedicines, stockHealth } from '../dashboard.js';
import { shortText } from '../kits.js';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const TOP_BY = [['amount', 'Amount'], ['qty', 'Quantity'], ['profit', 'Profit']];

// The dashboard's cards. The owner's choice (2026-11-15): a clean dashboard shows the figures, one sales chart, stock
// health, the top medicines and the latest sales; the rest are widgets that can be switched back on (Edit widgets).
// span: of 12 columns on wide screens
const WIDGETS = [
  { id: 'figures', name: 'Figures for the period', span: 12, on: true },
  // the bento row stays (the owner's request, 2026-11-15: "Maintain the bento UI")
  { id: 'bento', name: 'Sales at a glance (dark card, daily bars, latest receipts, next step)', span: 12, on: true },
  { id: 'chart', name: 'Sales chart', span: 8, on: true },
  { id: 'health', name: 'Stock health', span: 4, on: true },
  { id: 'top', name: 'Top medicines', span: 6, on: true },
  { id: 'recent', name: 'Latest sales', span: 6, on: true },
  { id: 'checks', name: 'Sales to check (when there are some)', span: 12, on: true },
  { id: 'alerts', name: 'Stock alert tiles', span: 12, on: false },
  { id: 'promote', name: 'Promote today', span: 6, on: false },
  { id: 'weather', name: 'Weather and storage', span: 6, on: false },
  { id: 'totals', name: 'Medicines, stock value, customers, this month', span: 12, on: false },
  { id: 'monthly', name: 'Monthly sales table', span: 6, on: false },
];
/** This device's dashboard: the period chip, the cards' order and which are hidden */
export function dashLayout(d = deviceSettings()) {
  const saved = d.dash || {};
  const ids = WIDGETS.map((w) => w.id);
  const order = [...(saved.order || []).filter((id) => ids.includes(id)), ...ids.filter((id) => !(saved.order || []).includes(id))];
  const shown = new Set(saved.shown || WIDGETS.filter((w) => w.on).map((w) => w.id));
  return { period: PERIODS.some(([k]) => k === saved.period) ? saved.period : 'today', order, shown };
}
const saveDash = (patch) => setDevice({ dash: { ...(deviceSettings().dash || {}), ...patch } });

export default function Dashboard() {
  const { db, products, kits, fmt, user, branchId, branch, features, batchesOf, day, can } = useStore();
  // recommendation 6 (1.10.0): kits that can be made 3 times or fewer, with the medicine that holds them back
  const lowKits = kits.filter((k) => k.active !== false && k.canMake != null && k.canMake <= 3);
  const [topBy, setTopBy] = useState('amount');
  const [layout, setLayout] = useState(dashLayout);
  useEffect(() => onDevice((d) => setLayout(dashLayout(d))), []);
  const [editing, setEditing] = useState(false);
  const [chart, setChart] = useState('daily');
  const navigate = useNavigate();
  const ins = useInsights();
  const promote = [ins.shortExpiry[0], ins.highMargin[0], ins.slow[0], ins.highMargin[1], ins.shortExpiry[1]].filter(Boolean).filter((x, i, a) => a.findIndex((y) => y.p.id === x.p.id) === i).slice(0, 4);
  const warn = db.settings.expiryWarnDays || 90;
  const period = layout.period;

  const m = useMemo(() => {
    const valid = db.sales.filter((s) => s.status !== 'refunded' && (s.branchId || MAIN_BRANCH) === branchId);
    // One pass to bucket sales and expenses by day and month
    const byDay = {}, byMonth = {};
    for (const s of valid) {
      const d = dayOf(s.date), mo = d.slice(0, 7);
      (byDay[d] ??= { n: 0, total: 0, exp: 0, gp: 0 }); byDay[d].n++; byDay[d].total += s.total;
      // gross profit as in Reports → Profit: sales less tax, less each line's cost
      const gp = s.total - (s.tax || 0) - s.items.reduce((a, i) => a + (i.cost || 0) * i.qty, 0);
      byDay[d].gp += gp;
      (byMonth[mo] ??= { n: 0, total: 0, exp: 0, gp: 0, purch: 0 }); byMonth[mo].n++; byMonth[mo].total += s.total; byMonth[mo].gp += gp;
    }
    for (const e of db.expenses) {
      const d = dayOf(e.date), mo = d.slice(0, 7);
      (byDay[d] ??= { n: 0, total: 0, exp: 0, gp: 0 }); byDay[d].exp += e.amount;
      (byMonth[mo] ??= { n: 0, total: 0, exp: 0, gp: 0, purch: 0 }); byMonth[mo].exp += e.amount;
    }
    for (const p of db.purchases) {
      if ((p.branchId || MAIN_BRANCH) !== branchId) continue;
      const mo = dayOf(p.date).slice(0, 7);
      (byMonth[mo] ??= { n: 0, total: 0, exp: 0, gp: 0, purch: 0 }); byMonth[mo].purch += p.total || 0;
    }
    return { byDay, byMonth, valid };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- day: today's figures start again at midnight
  }, [db.sales, db.expenses, db.purchases, branchId, day]);
  const fig = useMemo(() => periodFigures(m.byDay, period), [m.byDay, period, day]); // eslint-disable-line react-hooks/exhaustive-deps
  // the last 7 days of each figure, for the cards' small trend lines (2026-11-18)
  const spark = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - (6 - i)); return m.byDay[dayOf(d.toISOString())] || {}; });
    return Object.fromEntries(['total', 'gp', 'exp', 'n'].map((k) => [k, days.map((x) => x[k] || 0)]));
  }, [m.byDay, day]); // eslint-disable-line react-hooks/exhaustive-deps
  // the top medicines of the period (today's are few: this month's then)
  const topRange = period === 'today' ? { from: today().slice(0, 8) + '01', to: today(), words: 'this month' } : { from: fig.range.from, to: fig.range.to, words: PERIOD_WORDS[period] };
  const top = useMemo(() => topMedicines(m.valid, topRange.from, topRange.to, topBy, 5), [m.valid, topRange.from, topRange.to, topBy]);
  const topMax = Math.max(1, ...top.map((x) => x[topBy]));
  const perMonth = (f) => Object.fromEntries(Object.entries(m.byMonth).map(([k, v]) => [k, v[f]]));

  // only medicines in stock: every batch with stock left is checked, not just the next one to sell
  const exp = useMemo(() => expiryCounts(products, batchesOf, warn), [products, batchesOf, warn, day]); // eslint-disable-line react-hooks/exhaustive-deps
  const health = useMemo(() => stockHealth(products, batchesOf, warn), [products, batchesOf, warn, day]); // eslint-disable-line react-hooks/exhaustive-deps
  const lowStock = products.filter(isLowStock);
  const drafts = draftsFor(db, { user, branchId, all: seesAllDrafts(user) });
  const oldDrafts = drafts.filter((d) => isOld(d));
  const oldest = drafts.reduce((o, d) => (!o || Date.parse(d.startedAt) < Date.parse(o.startedAt) ? d : o), null);
  // at each batch's own cost, expired stock not included (shown apart)
  const sv = useMemo(() => stockValue(products, batchesOf), [products, batchesOf, day]); // eslint-disable-line react-hooks/exhaustive-deps
  const year = new Date().getFullYear();
  const monthRows = MONTHS.map((name, i) => ({ name, k: `${year}-${String(i + 1).padStart(2, '0')}` })).filter((r) => r.k <= today().slice(0, 7)).reverse();
  const monthMax = Math.max(1, ...monthRows.map(({ k }) => m.byMonth[k]?.total || 0));
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const isToday = period === 'today';
  const c = fig.cur, dl = fig.delta;
  const rangeState = { from: fig.range.from, to: fig.range.to };
  const salesTo = can('reports') || can('reports.lines') ? { to: '/reports', state: { tab: 'lines', ...rangeState } } : { to: '/sales', state: rangeState };

  const cards = {
    figures: () => (
      <div className="stats kpis">
        {/* sales open Reports → Sales lines for the period (every medicine sold); staff without it get the sales list */}
        <Stat {...salesTo} label={isToday ? "Today's sales" : 'Sales'} value={fmt(c.total)} sub={`${c.n} sale${c.n === 1 ? '' : 's'} · ${VS_WORDS[period]}`} delta={dl.total} spark={spark.total} tone="teal" icon={Banknote} />
        {can('reports') && <Stat to="/reports" state={{ tab: 'profit', ...rangeState }} label={isToday ? 'Gross profit today' : 'Gross profit'} value={fmt(c.gp)} sub={`after cost of goods · ${VS_WORDS[period]}`} delta={dl.gp} spark={spark.gp} tone="violet" icon={TrendingUp} />}
        {(can('finance') || can('reports')) && <Stat to="/expenses" label={isToday ? "Today's expenses" : 'Expenses'} value={fmt(c.exp)} sub={db.branches.length > 1 ? `Whole pharmacy (expenses have no branch) · sales here − expenses: ${fmt(c.total - c.exp)}` : `Sales − expenses: ${fmt(c.total - c.exp)}`} delta={dl.exp} spark={spark.exp} goodDown tone="orange" icon={Wallet} />}
        <Stat to="/sales" state={rangeState} label="Transactions" value={c.n.toLocaleString()} sub={`receipts ${isToday ? 'today' : PERIOD_WORDS[period]} · ${VS_WORDS[period]}`} delta={dl.n} spark={spark.n} tone="blue" icon={ReceiptText} />
      </div>
    ),
    chart: () => {
      const pick = (
        <div className="seg" role="radiogroup" aria-label="Chart">
          {[['daily', 'Daily'], ['monthly', 'Monthly']].map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={chart === k} className={chart === k ? 'on' : ''} onClick={() => setChart(k)}>{l}</button>)}
        </div>
      );
      return (
        <div className="card chart-card">
          {chart === 'daily'
            ? <DailyTrend byDay={m.byDay} fmt={fmt} extra={pick} onDay={(k) => navigate('/sales', { state: { from: k, to: k } })} />
            : <MonthLines fmt={fmt} extra={pick} series={[
              { name: 'Sales', cls: 'in', values: perMonth('total') },
              ...(can('reports') ? [{ name: 'Purchases', cls: 'purch', values: perMonth('purch') }] : []),
              ...((can('finance') || can('reports')) ? [{ name: 'Expenses', cls: 'exp', values: perMonth('exp') }] : []),
              ...(can('reports') ? [{ name: 'Gross profit', cls: 'profit', values: perMonth('gp') }] : []),
            ]} />}
        </div>
      );
    },
    health: () => <HealthCard health={health} fmt={fmt} value={sv.value} exp={exp} low={lowStock.length} drafts={drafts} oldDrafts={oldDrafts} warn={warn} />,
    top: () => (
      <div className="card">
        <div className="card-head">
          <h3>Top medicines · {topRange.words}</h3>
          <div className="seg" role="radiogroup" aria-label="Rank by">
            {TOP_BY.filter(([k]) => k !== 'profit' || can('reports')).map(([k, label]) => <button key={k} role="radio" aria-checked={topBy === k} className={topBy === k ? 'on' : ''} onClick={() => setTopBy(k)}>{label}</button>)}
          </div>
        </div>
        <table className="top-list">
          <tbody>
            {top.map((x, i) => (
              <tr key={x.name} className={can('reports') ? 'link' : ''} title={can('reports') ? 'Open the sales lines of this medicine' : undefined}
                onClick={can('reports') ? () => navigate('/reports', { state: { tab: 'lines', medicine: x.name, from: topRange.from, to: topRange.to } }) : undefined}>
                <td className="rank">{i + 1}</td>
                <td className="name"><strong>{x.name}</strong><small>{x.qty.toLocaleString()} sold{can('reports') && x.amount > 0 ? ` · profit ${fmt(x.profit)} (${Math.round((x.profit / x.amount) * 100)}%)` : ''}</small></td>
                <td style={{ width: '28%' }}><div className={'meter ' + topBy}><i style={{ width: `${Math.max(0, (x[topBy] / topMax) * 100)}%` }} /></div></td>
                <td className="num"><strong>{topBy === 'qty' ? x.qty.toLocaleString() : fmt(x[topBy])}</strong></td>
              </tr>
            ))}
            {!top.length && <Empty colSpan={4}>No sales {topRange.words} yet</Empty>}
          </tbody>
        </table>
        {can('reports') && <Link className="card-foot-link" to="/reports" state={{ tab: 'products', from: topRange.from, to: topRange.to }}>View all <ArrowRight size={14} /></Link>}
      </div>
    ),
    recent: () => <RecentSales sales={db.sales} branchId={branchId} fmt={fmt} />,
    checks: () => (can('audit') && (db.anomalies || []).some((a) => !a.reviewed) ? <SaleChecks /> : null),
    bento: () => <BentoDashboard byDay={m.byDay} db={db} branchId={branchId} fmt={fmt} can={can} counts={{ expiry: exp.soon + exp.expired, low: lowStock.length }} />,
    alerts: () => (
      <div className="stats alerts" aria-label="Stock alerts">
        <Stat to="/inventory" state={{ filter: 'low' }} label="Low stock" value={lowStock.length} sub="in stock, at or below reorder level" tone="amber alert" icon={PackageX} />
        <Stat to="/expiry" label="Soon expiring" value={exp.soon} sub={`within ${warn} days · ${exp.expired} already expired`} tone="amber alert" icon={CalendarClock} />
        {drafts.length > 0 && <Stat to={oldDrafts.some((d) => d.kind === 'delivery') || (!drafts.some((d) => d.kind === 'sale')) ? '/purchases' : '/sales'} state={{ tab: 'drafts' }} label="Open drafts" value={drafts.length}
          sub={oldDrafts.length ? `${oldDrafts.length} waiting too long · oldest ${ageText(oldest)}` : `held sales and unfinished deliveries · oldest ${ageText(oldest)}`} tone={oldDrafts.length ? 'red alert' : 'amber alert'} icon={PauseCircle} />}
        <Stat to="/expiry" label="Expired" value={exp.expired} sub={exp.expired ? 'in stock: return or write off' : 'nothing expired in stock'} tone={'alert ' + (exp.expired ? 'red' : 'ok')} icon={ShieldAlert} />
      </div>
    ),
    promote: () => (features.promos !== false && promote.length > 0 ? (
      <div className="card">
        <h3><Megaphone size={17} />Promote today</h3>
        <div className="promo-list">
          {promote.map((x) => (
            <div key={x.p.id} className={'promo-row promo-' + x.kind}>
              <span className="promo-art" aria-hidden="true"><ProductArt p={x.p} size={40} /></span>
              <div className="grow promo-body">
                <strong title={x.p.name}>{x.p.name}</strong>
                <small className="muted"><span className="promo-tag">{x.staff}</span>{x.note}</small>
              </div>
              <span className="num promo-price">{fmt(x.p.price)}</span>
              <a className="icon-btn promo-share" title="Share on WhatsApp" aria-label={`Share ${x.p.name} on WhatsApp`} target="_blank" rel="noreferrer" href={whatsappLink('', shareText(x.p, db.settings, fmt))}><Share2 size={16} /></a>
            </div>
          ))}
        </div>
      </div>
    ) : null),
    weather: () => (features.weather !== false ? <WeatherCard compact /> : null),
    totals: () => (
      <div className="stats">
        <Stat to="/medicines" label="Products" value={products.length.toLocaleString()} icon={Pill} />
        <Stat to="/inventory" label="Inventory value" value={fmt(sv.value)} sub={`at cost · expired ${fmt(sv.expired)} not included`} icon={Coins} />
        <Stat to="/customers" label="Customers" value={db.customers.length.toLocaleString()} icon={Users} />
        <Stat to="/sales" state={{ from: today().slice(0, 7) + '-01', to: today() }} label="This month" value={fmt(m.byMonth[today().slice(0, 7)]?.total)} sub={`${m.byMonth[today().slice(0, 7)]?.n || 0} sales`} icon={ReceiptText} />
      </div>
    ),
    monthly: () => (
      <div className="card">
        <h3>Monthly sales – {year}</h3>
        <table className="month-table">
          <thead><tr><th>Month</th><th className="num">Sales</th><th className="num">Total</th><th /></tr></thead>
          <tbody>
            {monthRows.map(({ name, k }) => <tr key={k}><td>{name}</td><td className="num">{(m.byMonth[k]?.n || 0).toLocaleString()}</td><td className="num">{fmt(m.byMonth[k]?.total)}</td><td style={{ width: '28%' }}><div className="meter"><i style={{ width: `${((m.byMonth[k]?.total || 0) / monthMax) * 100}%` }} /></div></td></tr>)}
          </tbody>
        </table>
      </div>
    ),
  };
  const spans = Object.fromEntries(WIDGETS.map((w) => [w.id, w.span]));
  let n = 0;

  return (
    <div className="page dash-page">
      <section className="page-head welcome" aria-label="Welcome">
        <div className="welcome-text">
          <span className="welcome-store"><Store size={14} />{db.settings.name}</span>
          <h1>{greet}, {user.name.split(' ')[0]}</h1>
          <div className="sub">Here&apos;s {db.branches.length > 1 ? (branch?.name || 'this branch') : 'your pharmacy'} {isToday ? 'today' : PERIOD_WORDS[period]} <span className="muted" title="Sales are completed receipts at this branch (refunds left out), including tax. Gross profit is sales less tax and the cost recorded on each line.">· sales incl. tax, refunds left out</span></div>
        </div>
        <div className="dash-tools">
          <Link className="date-pill" to="/calendar" title="Open the calendar"><CalendarDays size={16} />{new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</Link>
          <Link className="btn primary" to="/pos"><ShoppingCart size={18} />New sale</Link>
        </div>
      </section>

      <div className="dash-bar">
        <div className="seg period-chips" role="radiogroup" aria-label="Period">
          {PERIODS.map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={period === k} className={period === k ? 'on' : ''} onClick={() => saveDash({ period: k })}>{l}</button>)}
        </div>
        <button type="button" className="btn sm ghost" onClick={() => setEditing(true)}><SlidersHorizontal size={15} />Edit widgets</button>
      </div>

      {lowKits.length > 0 && (
        <div className="notice warn-notice kit-low-alert" role="status">
          <PackageX size={16} aria-hidden="true" /> <strong>Kits running low:</strong>{' '}
          {lowKits.slice(0, 4).map((k, i) => <span key={k.id}>{i ? '; ' : ''}{k.name}: {k.canMake === 0 ? 'none can be made' : `only ${k.canMake} can be made`}{shortText(k) ? `, ${shortText(k)}` : ''}</span>)}
          {lowKits.length > 4 && <span> and {lowKits.length - 4} more</span>} <Link to="/kits">Open kits</Link>
        </div>
      )}

      <div className="dash-grid">
        {layout.order.filter((id) => layout.shown.has(id)).map((id) => {
          const el = cards[id]();
          if (!el) return null;
          return <div key={id} className={'dash-cell span-' + spans[id]} data-widget={id} style={{ '--i': n++ }}>{el}</div>;
        })}
      </div>
      {editing && <EditWidgets layout={layout} onClose={() => setEditing(false)} />}
    </div>
  );
}

/** Stock health: a gauge (0-100), what drives it, the biggest problem said plainly, and the stock figures */
function HealthCard({ health, fmt, value, exp, low, drafts, oldDrafts, warn }) {
  const r = 52, len = Math.PI * r, k = health.score / 100;
  const tone = health.score >= 80 ? 'ok' : health.score >= 60 ? 'warn' : 'danger';
  const rows = [
    ['Stock value', fmt(value), '/inventory', null, 'at cost, expired not included'],
    ['Low stock', low, '/inventory', { filter: 'low' }, 'at or below the reorder level'],
    ['Soon expiring', exp.soon, '/expiry', null, `within ${warn} days`],
    ['Expired', exp.expired, '/expiry', { tab: 'expired' }, 'in stock: return or write off'],
    ...(drafts.length ? [['Open drafts', drafts.length, drafts.some((d) => d.kind === 'sale') ? '/sales' : '/purchases', { tab: 'drafts' }, oldDrafts.length ? `${oldDrafts.length} waiting too long` : 'held sales and deliveries']] : []),
  ];
  return (
    <div className={'card health-card ' + tone} aria-label="Stock health">
      <div className="card-head"><h3>Stock health</h3></div>
      <div className="health-top">
        <svg className="gauge" viewBox="0 0 128 72" role="img" aria-label={`Stock health ${health.score} out of 100`}>
          <path className="gauge-track" d={`M12,64 A${r},${r} 0 0 1 116,64`} />
          <path className="gauge-fill" d={`M12,64 A${r},${r} 0 0 1 116,64`} style={{ strokeDasharray: len, '--off': len * (1 - k), '--len': len }} />
          <text x="64" y="58" textAnchor="middle" className="gauge-num">{health.score}%</text>
        </svg>
        <div className="health-insight">
          <strong>{health.insight.title}</strong>
          <small>{health.insight.text}</small>
        </div>
      </div>
      {health.drivers.length > 0 && (
        <div className="driven-by"><small className="muted">Driven by</small>{health.drivers.map((d) => <Link key={d.key} to={d.to} state={d.state} className={'chip-pill ' + d.tone}>{d.label}</Link>)}</div>
      )}
      <ul className="health-rows">
        {rows.map(([label, v, to, state, hint]) => (
          <li key={label}><Link to={to} state={state || undefined}><span className="grow">{label}<small className="muted">{hint}</small></span><b className="num">{v}</b></Link></li>
        ))}
      </ul>
    </div>
  );
}

/** The latest five sales of this branch with a Paid / Owing / Refunded pill */
function RecentSales({ sales, branchId, fmt }) {
  const recent = useMemo(() => {
    const out = [];
    for (const s of sales) {
      if ((s.branchId || MAIN_BRANCH) !== branchId) continue;
      if (out.length < 5) { out.push(s); out.sort((a, b) => (a.date < b.date ? 1 : -1)); } else if (s.date > out[4].date) { out[4] = s; out.sort((a, b) => (a.date < b.date ? 1 : -1)); }
    }
    return out;
  }, [sales, branchId]);
  const ago = (d) => { const mins = Math.round((Date.now() - Date.parse(d)) / 60000); return mins < 1 ? 'just now' : mins < 60 ? `${mins} min ago` : mins < 1440 ? `${Math.round(mins / 60)} h ago` : new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }); };
  return (
    <div className="card recent-card">
      <div className="card-head"><h3>Latest sales</h3><Link to="/sales" className="card-head-link">View all <ArrowRight size={14} /></Link></div>
      <table className="recent-table">
        <thead><tr><th>Client</th><th>Receipt</th><th>Time</th><th>Status</th><th className="num">Total</th></tr></thead>
        <tbody>
          {recent.map((s) => { const [st, cls] = saleStatus(s); const who = s.customerName || 'Walk-in'; return (
            <tr key={s.id}>
              <td><span className="avatar-sm" aria-hidden="true">{who.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase()}</span>{who}</td>
              <td className="muted">{s.number}</td>
              <td className="muted">{ago(s.date)}</td>
              <td>{cls !== 'paid' && <span className={'status-pill ' + cls}>{st}</span>}</td>
              <td className="num"><b>{fmt(s.total)}</b></td>
            </tr>
          ); })}
          {!recent.length && <Empty colSpan={5}>No sales yet</Empty>}
        </tbody>
      </table>
    </div>
  );
}

/** Edit widgets: show or hide each card and move it up or down; kept on this device */
function EditWidgets({ layout, onClose }) {
  const move = (i, d) => { const o = [...layout.order]; [o[i], o[i + d]] = [o[i + d], o[i]]; saveDash({ order: o }); };
  const toggle = (id) => { const s = new Set(layout.shown); s.has(id) ? s.delete(id) : s.add(id); saveDash({ shown: [...s] }); };
  return (
    <Modal title="Edit widgets" onClose={onClose}>
      <p className="muted small">Choose the cards on your dashboard and their order. Only this device changes.</p>
      <ul className="widget-list">
        {layout.order.map((id, i) => { const w = WIDGETS.find((x) => x.id === id); return (
          <li key={id}>
            <label className="field check"><input type="checkbox" checked={layout.shown.has(id)} onChange={() => toggle(id)} /><span>{w.name}</span></label>
            <button type="button" className="icon-btn sm" aria-label={`Move ${w.name} up`} disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp size={15} /></button>
            <button type="button" className="icon-btn sm" aria-label={`Move ${w.name} down`} disabled={i === layout.order.length - 1} onClick={() => move(i, 1)}><ArrowDown size={15} /></button>
          </li>
        ); })}
      </ul>
      <div className="form-actions">
        <button type="button" className="btn ghost" onClick={() => saveDash({ order: undefined, shown: undefined })}><X size={15} />Back to the standard dashboard</button>
        <button type="button" className="btn primary" onClick={onClose}><Sparkles size={15} />Done</button>
      </div>
    </Modal>
  );
}

// Step 3: what the cloud found when it re-checked a sale (worker/anomalies.js). Only roles with the audit log receive
// these records; the sale itself was kept as it was sold. "Checked" keeps the finding, marked, in the audit trail.
const CHECK_KINDS = { proforma: 'Proforma doesn’t match', stock: 'Stock doesn’t match the sale', stale: 'Older change not applied', totals: 'Totals don’t add up', discount: 'Discount without permission', price: 'Sold below price', paid: 'Paid more than the total', invalid: 'Invalid amounts', credit: 'Over credit limit', late: 'Recorded after the day was closed', 'discount-limit': 'Discount above the role\'s limit', 'closed-refund': 'Refund from a closed day', insurance: 'Insurance split doesn’t add up' };
function SaleChecks() {
  const { db, fmt, user, update, branchId } = useStore();
  const open = (db.anomalies || []).filter((a) => !a.reviewed).sort((a, b) => String(b.saleDate).localeCompare(String(a.saleDate)));
  if (!open.length) return null;
  const here = open.filter((a) => (a.branchId || MAIN_BRANCH) === branchId);
  const list = (here.length ? here : open).slice(0, 8);
  const checked = (a) => update((d) => {
    put(d, 'anomalies', { ...a, reviewed: true, reviewedBy: user.name, reviewedAt: now() });
    audit(d, user, 'Sale check reviewed', `${a.saleNumber}: ${CHECK_KINDS[a.kind] || a.kind}`, a.branchId || branchId);
  });
  return (
    <div className="card sale-checks" aria-label="Sales to check">
      <h3><SearchCheck size={17} />Sales to check <span className="badge warn">{open.length}</span></h3>
      <small className="muted">The cloud re-checks every sale. These were kept as sold; look at each one and mark it checked.</small>
      <table className="compact"><tbody>
        {list.map((a) => (
          <tr key={a.id}>
            <td><strong>{a.saleNumber || '—'}</strong><br /><small className="muted">{String(a.saleDate).slice(0, 16).replace('T', ' ')} · {a.cashier || a.pushedBy}</small></td>
            <td><span className="badge warn">{CHECK_KINDS[a.kind] || a.kind}</span><br /><small>{a.detail}</small></td>
            <td className="num">{a.amount ? fmt(a.amount) : ''}</td>
            <td className="actions"><button className="btn sm ghost" onClick={() => checked(a)}>Checked</button></td>
          </tr>
        ))}
      </tbody></table>
      {open.length > list.length && <small className="muted">{open.length - list.length} more after these.</small>}
    </div>
  );
}

import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Banknote, Wallet, CalendarClock, PackageX, Pill, Coins, Users, ShoppingCart, ReceiptText, Share2, Megaphone, Store, TrendingUp, ShieldAlert, PauseCircle, SearchCheck } from 'lucide-react';
import { draftsFor, seesAllDrafts, isOld, ageText } from '../drafts.js';
import { useStore, today, localDate, dayOf, isLowStock, expiryCounts, stockValue, MAIN_BRANCH, put, audit, now } from '../store.jsx';
import { Stat, Empty } from '../ui.jsx';
import { DailyTrend, MonthLines } from '../charts.jsx';
import { ProductArt } from '../idleart.jsx';
import { useInsights, shareText } from '../engage.jsx';
import { whatsappLink } from '../cloud.js';
import { WeatherCard } from './Storage.jsx';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const TOP_BY = [['amount', 'Amount'], ['qty', 'Quantity'], ['profit', 'Profit']];
const dayKey = (offset) => { const d = new Date(); d.setDate(d.getDate() - offset); return localDate(d); };

export default function Dashboard() {
  const { db, products, fmt, user, branchId, features, batchesOf, day, can } = useStore();
  const [topBy, setTopBy] = useState('amount');
  const navigate = useNavigate();
  const ins = useInsights();
  const promote = [ins.shortExpiry[0], ins.highMargin[0], ins.slow[0], ins.highMargin[1], ins.shortExpiry[1]].filter(Boolean).filter((x, i, a) => a.findIndex((y) => y.p.id === x.p.id) === i).slice(0, 4);
  const warn = db.settings.expiryWarnDays || 90;

  const m = useMemo(() => {
    const valid = db.sales.filter((s) => s.status !== 'refunded' && (s.branchId || MAIN_BRANCH) === branchId);
    // One pass to bucket sales and expenses by day and month
    const byDay = {}, byMonth = {}, top = {};
    const thisMonth = today().slice(0, 7);
    for (const s of valid) {
      const d = dayOf(s.date), mo = d.slice(0, 7);
      (byDay[d] ??= { n: 0, total: 0, exp: 0, gp: 0 }); byDay[d].n++; byDay[d].total += s.total;
      // gross profit as in Reports → Profit: sales less tax, less each line's cost
      const gp = s.total - (s.tax || 0) - s.items.reduce((a, i) => a + (i.cost || 0) * i.qty, 0);
      byDay[d].gp += gp;
      (byMonth[mo] ??= { n: 0, total: 0, exp: 0, gp: 0, purch: 0 }); byMonth[mo].n++; byMonth[mo].total += s.total; byMonth[mo].gp += gp;
      if (mo === thisMonth) for (const i of s.items) { (top[i.name] ??= { name: i.name, qty: 0, amount: 0, cost: 0 }); top[i.name].qty += i.qty; top[i.name].amount += i.qty * i.price; top[i.name].cost += i.qty * (i.cost || 0); }
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
    return { byDay, byMonth, top: Object.values(top).map((x) => ({ ...x, profit: x.amount - x.cost })) };
  }, [db.sales, db.expenses, db.purchases, branchId, day]);
  const top = [...m.top].sort((a, b) => b[topBy] - a[topBy]).slice(0, 10);
  const topMax = Math.max(1, ...top.map((x) => x[topBy]));
  const perMonth = (f) => Object.fromEntries(Object.entries(m.byMonth).map(([k, v]) => [k, v[f]]));

  const t = m.byDay[today()] || { n: 0, total: 0, exp: 0, gp: 0 };
  const y = m.byDay[dayKey(1)] || { n: 0, total: 0, exp: 0, gp: 0 };
  const delta = y.total ? ((t.total - y.total) / y.total) * 100 : null;
  const nDelta = y.n ? ((t.n - y.n) / y.n) * 100 : null;
  const gpDelta = y.gp > 0 ? ((t.gp - y.gp) / y.gp) * 100 : null;
  // only medicines in stock: every batch with stock left is checked, not just the next one to sell
  const exp = useMemo(() => expiryCounts(products, batchesOf, warn), [products, batchesOf, warn, day]); // eslint-disable-line react-hooks/exhaustive-deps
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

  return (
    <div className="page">
      <section className="page-head welcome" aria-label="Welcome">
        <div className="welcome-text">
          <span className="welcome-store"><Store size={14} />{db.settings.name}</span>
          <h1>{greet}, {user.name.split(' ')[0]} 👋</h1>
          <div className="sub">{new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div>
        </div>
        <div className="row gap">
          <Link className="btn primary big" to="/pos"><ShoppingCart size={18} />New sale</Link>
        </div>
      </section>

      <div className="stats kpis">
        {/* today's sales open Reports → Sales lines for today (every medicine sold); staff without it get the sales list */}
        <Stat {...(can('reports') || can('reports.lines') ? { to: '/reports', state: { tab: 'lines', from: today(), to: today() } } : { to: '/sales', state: { from: today(), to: today() } })} label="Today's sales" value={fmt(t.total)} sub={`${t.n} sale${t.n === 1 ? '' : 's'} · vs yesterday`} delta={delta} tone="teal" icon={Banknote} />
        {can('reports') && <Stat to="/reports" label="Gross profit today" value={fmt(t.gp)} sub="after cost of goods, before expenses" delta={gpDelta} tone="violet" icon={TrendingUp} />}
        {(can('finance') || can('reports')) && <Stat to="/expenses" label="Today's expenses" value={fmt(t.exp)} sub={`Sales − expenses: ${fmt(t.total - t.exp)}`} tone="orange" icon={Wallet} />}
        <Stat to="/sales" state={{ from: today(), to: today() }} label="Transactions" value={t.n.toLocaleString()} sub="receipts today · vs yesterday" delta={nDelta} tone="blue" icon={ReceiptText} />
      </div>

      <div className="stats alerts" aria-label="Stock alerts">
        <Stat to="/inventory" state={{ filter: 'low' }} label="Low stock" value={lowStock.length} sub="in stock, at or below reorder level" tone="amber alert" icon={PackageX} />
        <Stat to="/expiry" label="Soon expiring" value={exp.soon} sub={`within ${warn} days · ${exp.expired} already expired`} tone="amber alert" icon={CalendarClock} />
        {drafts.length > 0 && <Stat to={oldDrafts.some((d) => d.kind === 'delivery') || (!drafts.some((d) => d.kind === 'sale')) ? '/purchases' : '/sales'} state={{ tab: 'drafts' }} label="Open drafts" value={drafts.length}
          sub={oldDrafts.length ? `${oldDrafts.length} waiting too long · oldest ${ageText(oldest)}` : `held sales and unfinished deliveries · oldest ${ageText(oldest)}`} tone={oldDrafts.length ? 'red alert' : 'amber alert'} icon={PauseCircle} />}
        <Stat to="/expiry" label="Expired" value={exp.expired} sub={exp.expired ? 'in stock: return or write off' : 'nothing expired in stock'} tone={'alert ' + (exp.expired ? 'red' : 'ok')} icon={ShieldAlert} />
      </div>

      {can('audit') && <SaleChecks />}

      {(features.weather !== false || (features.promos !== false && promote.length > 0)) && (
        <div className="grid2">
          {features.promos !== false && promote.length > 0 && (
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
          )}
          {features.weather !== false && <WeatherCard compact />}
        </div>
      )}

      <div className="grid2">
        <div className="card">
          <DailyTrend byDay={m.byDay} fmt={fmt} onDay={(k) => navigate('/sales', { state: { from: k, to: k } })} />
        </div>
        <div className="card">
          <MonthLines fmt={fmt} series={[
            { name: 'Sales', cls: 'in', values: perMonth('total') },
            ...(can('reports') ? [{ name: 'Purchases', cls: 'purch', values: perMonth('purch') }] : []),
            ...((can('finance') || can('reports')) ? [{ name: 'Expenses', cls: 'exp', values: perMonth('exp') }] : []),
            ...(can('reports') ? [{ name: 'Gross profit', cls: 'profit', values: perMonth('gp') }] : []),
          ]} />
        </div>
      </div>

      <div className="stats">
        <Stat to="/medicines" label="Products" value={products.length.toLocaleString()} icon={Pill} />
        <Stat to="/inventory" label="Inventory value" value={fmt(sv.value)} sub={`at cost · expired ${fmt(sv.expired)} not included`} icon={Coins} />
        <Stat to="/customers" label="Customers" value={db.customers.length.toLocaleString()} icon={Users} />
        <Stat to="/sales" state={{ from: today().slice(0, 7) + '-01', to: today() }} label="This month" value={fmt(m.byMonth[today().slice(0, 7)]?.total)} sub={`${m.byMonth[today().slice(0, 7)]?.n || 0} sales`} icon={ReceiptText} />
      </div>

      <div className="grid2">
        <div className="card">
          <div className="card-head">
            <h3>Top 10 medicines this month</h3>
            <div className="seg" role="radiogroup" aria-label="Rank by">
              {TOP_BY.filter(([k]) => k !== 'profit' || can('reports')).map(([k, label]) => <button key={k} role="radio" aria-checked={topBy === k} className={topBy === k ? 'on' : ''} onClick={() => setTopBy(k)}>{label}</button>)}
            </div>
          </div>
          <table className="top-list">
            <tbody>
              {top.map((x, i) => (
                <tr key={x.name} className={can('reports') ? 'link' : ''} title={can('reports') ? 'Open the sales lines of this medicine' : undefined}
                  onClick={can('reports') ? () => navigate('/reports', { state: { tab: 'lines', medicine: x.name, from: today().slice(0, 8) + '01', to: today() } }) : undefined}>
                  <td className="rank">{i + 1}</td>
                  <td className="name"><strong>{x.name}</strong><small>{x.qty.toLocaleString()} sold{can('reports') && x.amount > 0 ? ` · profit ${fmt(x.profit)} (${Math.round((x.profit / x.amount) * 100)}%)` : ''}</small></td>
                  <td style={{ width: '28%' }}><div className={'meter ' + topBy}><i style={{ width: `${Math.max(0, (x[topBy] / topMax) * 100)}%` }} /></div></td>
                  <td className="num"><strong>{topBy === 'qty' ? x.qty.toLocaleString() : fmt(x[topBy])}</strong></td>
                </tr>
              ))}
              {!top.length && <Empty colSpan={4}>No sales this month yet</Empty>}
            </tbody>
          </table>
        </div>
        <div className="card">
          <h3>Monthly sales – {year}</h3>
          <table>
            <thead><tr><th>Month</th><th className="num">Sales</th><th className="num">Total</th><th /></tr></thead>
            <tbody>
              {monthRows.map(({ name, k }) => <tr key={k}><td>{name}</td><td className="num">{(m.byMonth[k]?.n || 0).toLocaleString()}</td><td className="num">{fmt(m.byMonth[k]?.total)}</td><td style={{ width: '28%' }}><div className="meter"><i style={{ width: `${((m.byMonth[k]?.total || 0) / monthMax) * 100}%` }} /></div></td></tr>)}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// Step 3: what the cloud found when it re-checked a sale (worker/anomalies.js). Only roles with the audit log receive
// these records; the sale itself was kept as it was sold. "Checked" keeps the finding, marked, in the audit trail.
const CHECK_KINDS = { totals: 'Totals don’t add up', discount: 'Discount without permission', price: 'Sold below price', paid: 'Paid more than the total', invalid: 'Invalid amounts', credit: 'Over credit limit' };
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

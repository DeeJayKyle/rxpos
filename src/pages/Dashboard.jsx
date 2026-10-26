import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Banknote, Wallet, CalendarClock, PackageX, Pill, Coins, Users, ShoppingCart, ReceiptText, Share2, Megaphone, Store, TrendingUp, ShieldAlert } from 'lucide-react';
import { useStore, today, localDate, dayOf, isLowStock, expiryCounts, stockValue, MAIN_BRANCH } from '../store.jsx';
import { Stat, BarChart, AreaChart, Empty } from '../ui.jsx';
import { ProductArt } from '../idleart.jsx';
import { useInsights, shareText } from '../engage.jsx';
import { whatsappLink } from '../cloud.js';
import { WeatherCard } from './Storage.jsx';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const dayKey = (offset) => { const d = new Date(); d.setDate(d.getDate() - offset); return localDate(d); };

export default function Dashboard() {
  const { db, products, fmt, user, branchId, features, batchesOf, day, can } = useStore();
  const [range, setRange] = useState(30);
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
      byDay[d].gp += s.total - (s.tax || 0) - s.items.reduce((a, i) => a + (i.cost || 0) * i.qty, 0);
      (byMonth[mo] ??= { n: 0, total: 0, exp: 0 }); byMonth[mo].n++; byMonth[mo].total += s.total;
      if (mo === thisMonth) for (const i of s.items) { (top[i.name] ??= { name: i.name, qty: 0, amount: 0 }); top[i.name].qty += i.qty; top[i.name].amount += i.qty * i.price; }
    }
    for (const e of db.expenses) {
      const d = dayOf(e.date), mo = d.slice(0, 7);
      (byDay[d] ??= { n: 0, total: 0, exp: 0, gp: 0 }); byDay[d].exp += e.amount;
      (byMonth[mo] ??= { n: 0, total: 0, exp: 0 }); byMonth[mo].exp += e.amount;
    }
    return { byDay, byMonth, top: Object.values(top).sort((a, b) => b.amount - a.amount).slice(0, 10) };
  }, [db.sales, db.expenses, branchId, day]);

  const t = m.byDay[today()] || { n: 0, total: 0, exp: 0, gp: 0 };
  const y = m.byDay[dayKey(1)] || { n: 0, total: 0, exp: 0, gp: 0 };
  const delta = y.total ? ((t.total - y.total) / y.total) * 100 : null;
  const nDelta = y.n ? ((t.n - y.n) / y.n) * 100 : null;
  const gpDelta = y.gp > 0 ? ((t.gp - y.gp) / y.gp) * 100 : null;
  // only medicines in stock: every batch with stock left is checked, not just the next one to sell
  const exp = useMemo(() => expiryCounts(products, batchesOf, warn), [products, batchesOf, warn, day]); // eslint-disable-line react-hooks/exhaustive-deps
  const lowStock = products.filter(isLowStock);
  // at each batch's own cost, expired stock not included (shown apart)
  const sv = useMemo(() => stockValue(products, batchesOf), [products, batchesOf, day]); // eslint-disable-line react-hooks/exhaustive-deps
  const year = new Date().getFullYear();
  const monthRows = MONTHS.map((name, i) => ({ name, k: `${year}-${String(i + 1).padStart(2, '0')}` })).filter((r) => r.k <= today().slice(0, 7)).reverse();
  const last6 = Array.from({ length: 6 }, (_, i) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 5 + i); return localDate(d).slice(0, 7); });
  const trend = Array.from({ length: range }, (_, i) => { const k = dayKey(range - 1 - i); return { label: new Date(k).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }), value: m.byDay[k]?.total || 0 }; });
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
        <Stat to="/sales" state={{ from: today(), to: today() }} label="Today's sales" value={fmt(t.total)} sub={`${t.n} sale${t.n === 1 ? '' : 's'} · vs yesterday`} delta={delta} tone="teal" icon={Banknote} />
        {can('reports') && <Stat to="/reports" label="Gross profit today" value={fmt(t.gp)} sub="after cost of goods, before expenses" delta={gpDelta} tone="blue" icon={TrendingUp} />}
        {(can('finance') || can('reports')) && <Stat to="/expenses" label="Today's expenses" value={fmt(t.exp)} sub={`Sales − expenses: ${fmt(t.total - t.exp)}`} tone="red" icon={Wallet} />}
        <Stat to="/sales" state={{ from: today(), to: today() }} label="Transactions" value={t.n.toLocaleString()} sub="receipts today · vs yesterday" delta={nDelta} tone="violet" icon={ReceiptText} />
      </div>

      <div className="stats alerts" aria-label="Stock alerts">
        <Stat to="/inventory" state={{ filter: 'low' }} label="Low stock" value={lowStock.length} sub="in stock, at or below reorder level" tone="amber alert" icon={PackageX} />
        <Stat to="/expiry" label="Soon expiring" value={exp.soon} sub={`within ${warn} days · ${exp.expired} already expired`} tone="amber alert" icon={CalendarClock} />
        <Stat to="/expiry" label="Expired" value={exp.expired} sub={exp.expired ? 'in stock: return or write off' : 'nothing expired in stock'} tone={'alert ' + (exp.expired ? 'red' : 'ok')} icon={ShieldAlert} />
      </div>

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
          <div className="card-head">
            <h3>Sales – last {range} days</h3>
            <div className="seg" role="radiogroup" aria-label="Chart period">
              {[7, 30].map((n) => <button key={n} role="radio" aria-checked={range === n} className={range === n ? 'on' : ''} onClick={() => setRange(n)}>{n} days</button>)}
            </div>
          </div>
          <AreaChart key={range} data={trend} fmt={fmt} />
        </div>
        <div className="card">
          <h3>Sales vs expenses</h3>
          <BarChart fmt={fmt} series={[{ name: 'Sales' }, { name: 'Expenses' }]}
            data={last6.map((k) => ({ label: MONTHS[Number(k.slice(5)) - 1].slice(0, 3) + ' ' + k.slice(2, 4), values: [m.byMonth[k]?.total || 0, m.byMonth[k]?.exp || 0] }))} height={170} />
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
          <h3>Top 10 selling products this month</h3>
          <table>
            <thead><tr><th>#</th><th>Product</th><th className="num">Qty</th><th className="num">Amount</th></tr></thead>
            <tbody>
              {m.top.map((x, i) => <tr key={x.name}><td className="muted">{i + 1}</td><td>{x.name}</td><td className="num">{x.qty}</td><td className="num">{fmt(x.amount)}</td></tr>)}
              {!m.top.length && <Empty colSpan={4}>No sales this month yet</Empty>}
            </tbody>
          </table>
        </div>
        <div className="card">
          <h3>Monthly sales – {year}</h3>
          <table>
            <thead><tr><th>Month</th><th className="num">Sales</th><th className="num">Total</th></tr></thead>
            <tbody>
              {monthRows.map(({ name, k }) => <tr key={k}><td>{name}</td><td className="num">{(m.byMonth[k]?.n || 0).toLocaleString()}</td><td className="num">{fmt(m.byMonth[k]?.total)}</td></tr>)}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Banknote, Wallet, CalendarClock, PackageX, Pill, Coins, Users, ShoppingCart, PackagePlus, ReceiptText } from 'lucide-react';
import { useStore, today, daysUntil, MAIN_BRANCH } from '../store.jsx';
import { Stat, BarChart, AreaChart, Empty } from '../ui.jsx';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const dayKey = (offset) => new Date(Date.now() - offset * 864e5).toISOString().slice(0, 10);

export default function Dashboard() {
  const { db, products, fmt, user, branchId } = useStore();
  const warn = db.settings.expiryWarnDays || 90;

  const m = useMemo(() => {
    const valid = db.sales.filter((s) => s.status !== 'refunded' && (s.branchId || MAIN_BRANCH) === branchId);
    // One pass to bucket sales and expenses by day and month
    const byDay = {}, byMonth = {}, top = {};
    const thisMonth = today().slice(0, 7);
    for (const s of valid) {
      const d = String(s.date).slice(0, 10), mo = d.slice(0, 7);
      (byDay[d] ??= { n: 0, total: 0, exp: 0 }); byDay[d].n++; byDay[d].total += s.total;
      (byMonth[mo] ??= { n: 0, total: 0, exp: 0 }); byMonth[mo].n++; byMonth[mo].total += s.total;
      if (mo === thisMonth) for (const i of s.items) { (top[i.name] ??= { name: i.name, qty: 0, amount: 0 }); top[i.name].qty += i.qty; top[i.name].amount += i.qty * i.price; }
    }
    for (const e of db.expenses) {
      const d = String(e.date).slice(0, 10), mo = d.slice(0, 7);
      (byDay[d] ??= { n: 0, total: 0, exp: 0 }); byDay[d].exp += e.amount;
      (byMonth[mo] ??= { n: 0, total: 0, exp: 0 }); byMonth[mo].exp += e.amount;
    }
    return { byDay, byMonth, top: Object.values(top).sort((a, b) => b.amount - a.amount).slice(0, 10) };
  }, [db.sales, db.expenses, branchId]);

  const t = m.byDay[today()] || { n: 0, total: 0, exp: 0 };
  const y = m.byDay[dayKey(1)] || { n: 0, total: 0, exp: 0 };
  const delta = y.total ? ((t.total - y.total) / y.total) * 100 : null;
  const expiring = products.filter((p) => p.expiry && p.stock > 0 && daysUntil(p.expiry) >= 0 && daysUntil(p.expiry) <= warn);
  const expired = products.filter((p) => p.expiry && p.stock > 0 && daysUntil(p.expiry) < 0);
  const lowStock = products.filter((p) => p.stock <= (p.reorder || 0));
  const stockValue = products.reduce((a, p) => a + Math.max(p.stock, 0) * (p.cost || 0), 0);
  const year = new Date().getFullYear();
  const monthRows = MONTHS.map((name, i) => ({ name, k: `${year}-${String(i + 1).padStart(2, '0')}` })).filter((r) => r.k <= today().slice(0, 7)).reverse();
  const last6 = Array.from({ length: 6 }, (_, i) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 5 + i); return d.toISOString().slice(0, 7); });
  const trend = Array.from({ length: 30 }, (_, i) => { const k = dayKey(29 - i); return { label: new Date(k).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }), value: m.byDay[k]?.total || 0 }; });
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{greet}, {user.name.split(' ')[0]} 👋</h1>
          <div className="sub">{new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} · {db.settings.name}</div>
        </div>
        <div className="row gap">
          <Link className="btn ghost" to="/add-stock"><PackagePlus size={16} />Add stock</Link>
          <Link className="btn primary" to="/pos"><ShoppingCart size={16} />New sale</Link>
        </div>
      </div>

      <div className="stats">
        <Stat label="Today's sales" value={fmt(t.total)} sub={`${t.n} sale${t.n === 1 ? '' : 's'} · vs yesterday`} delta={delta} tone="teal" icon={Banknote} />
        <Stat label="Today's expenses" value={fmt(t.exp)} sub={`Net ${fmt(t.total - t.exp)}`} tone="red" icon={Wallet} />
        <Stat label="Soon expiring" value={<Link to="/expiry">{expiring.length}</Link>} sub={`${expired.length} already expired`} tone="amber" icon={CalendarClock} />
        <Stat label="Low stock" value={<Link to="/inventory">{lowStock.length}</Link>} sub="at or below reorder level" tone="violet" icon={PackageX} />
      </div>

      <div className="grid2">
        <div className="card">
          <h3>Sales – last 30 days</h3>
          <AreaChart data={trend} fmt={fmt} />
        </div>
        <div className="card">
          <h3>Sales vs expenses</h3>
          <BarChart fmt={fmt} series={[{ name: 'Sales', className: 'teal' }, { name: 'Expenses', className: 'red' }]}
            data={last6.map((k) => ({ label: MONTHS[Number(k.slice(5)) - 1].slice(0, 3) + ' ' + k.slice(2, 4), values: [m.byMonth[k]?.total || 0, m.byMonth[k]?.exp || 0] }))} height={170} />
        </div>
      </div>

      <div className="stats">
        <Stat label="Products" value={products.length.toLocaleString()} icon={Pill} />
        <Stat label="Inventory value" value={fmt(stockValue)} sub="at cost price" icon={Coins} />
        <Stat label="Customers" value={db.customers.length.toLocaleString()} icon={Users} />
        <Stat label="This month" value={fmt(m.byMonth[today().slice(0, 7)]?.total)} sub={`${m.byMonth[today().slice(0, 7)]?.n || 0} sales`} icon={ReceiptText} />
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

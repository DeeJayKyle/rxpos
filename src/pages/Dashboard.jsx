import { Link } from 'react-router-dom';
import { useStore, today, daysUntil } from '../store.jsx';
import { Stat, BarChart } from '../ui.jsx';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function Dashboard() {
  const { db, products, fmt } = useStore();
  const warn = db.settings.expiryWarnDays || 90;
  const valid = db.sales.filter((s) => s.status !== 'refunded');
  const sum = (arr, k = 'total') => arr.reduce((a, s) => a + (Number(s[k]) || 0), 0);
  const day = (x) => String(x.date).slice(0, 10);
  const todays = valid.filter((s) => day(s) === today());
  const todayExp = db.expenses.filter((e) => day(e) === today());
  const expiring = products.filter((p) => p.expiry && p.stock > 0 && daysUntil(p.expiry) >= 0 && daysUntil(p.expiry) <= warn);
  const expired = products.filter((p) => p.expiry && p.stock > 0 && daysUntil(p.expiry) < 0);
  const lowStock = products.filter((p) => p.stock <= (p.reorder || 0));
  const stockValue = products.reduce((a, p) => a + Math.max(p.stock, 0) * (p.cost || 0), 0);

  // Monthly table (this year) and sales vs expenses (last 6 months)
  const year = new Date().getFullYear();
  const byMonth = {};
  valid.forEach((s) => { const k = String(s.date).slice(0, 7); (byMonth[k] ??= { n: 0, total: 0, exp: 0 }); byMonth[k].n++; byMonth[k].total += s.total; });
  db.expenses.forEach((e) => { const k = String(e.date).slice(0, 7); (byMonth[k] ??= { n: 0, total: 0, exp: 0 }); byMonth[k].exp += e.amount; });
  const monthRows = MONTHS.map((m, i) => ({ m, k: `${year}-${String(i + 1).padStart(2, '0')}` })).filter((r) => r.k <= today().slice(0, 7));
  const last6 = Array.from({ length: 6 }, (_, i) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 5 + i); return d.toISOString().slice(0, 7); });

  const trend = Array.from({ length: 30 }, (_, i) => {
    const k = new Date(Date.now() - (29 - i) * 864e5).toISOString().slice(0, 10);
    return { label: k, values: [sum(valid.filter((s) => day(s) === k))] };
  });

  const top = {};
  valid.filter((s) => String(s.date).slice(0, 7) === today().slice(0, 7)).forEach((s) => s.items.forEach((i) => {
    top[i.name] ??= { name: i.name, qty: 0, amount: 0 };
    top[i.name].qty += i.qty; top[i.name].amount += i.qty * i.price;
  }));
  const top10 = Object.values(top).sort((a, b) => b.amount - a.amount).slice(0, 10);

  return (
    <div className="page">
      <div className="page-head">
        <h1>Dashboard</h1>
        <div className="row gap"><Link className="btn ghost" to="/add-stock">Add stock</Link><Link className="btn primary" to="/pos">New sale</Link></div>
      </div>
      <div className="stats">
        <Stat label="Today's total sales" value={fmt(sum(todays))} sub={`${todays.length} sales`} tone="teal" />
        <Stat label="Today's total expenses" value={fmt(sum(todayExp, 'amount'))} sub={`${todayExp.length} expenses`} tone="red" />
        <Stat label="Soon expiring" value={<Link to="/expiry">{expiring.length}</Link>} sub={`${expired.length} already expired`} tone="amber" />
        <Stat label="Low stock" value={<Link to="/inventory">{lowStock.length}</Link>} sub="at or below reorder level" tone="violet" />
      </div>
      <div className="stats">
        <Stat label="Total number of products" value={products.length.toLocaleString()} />
        <Stat label="Total amount in inventory" value={fmt(stockValue)} sub="at cost price" />
        <Stat label="Customers" value={db.customers.length.toLocaleString()} />
        <Stat label="Users" value={db.users.length} />
      </div>
      <div className="grid2">
        <div className="card">
          <h3>Total monthly sales – {year}</h3>
          <table>
            <thead><tr><th>Month</th><th className="num">No. of sales</th><th className="num">Total sales</th></tr></thead>
            <tbody>
              {monthRows.map(({ m, k }) => <tr key={k}><td>{m}</td><td className="num">{(byMonth[k]?.n || 0).toLocaleString()}</td><td className="num">{fmt(byMonth[k]?.total)}</td></tr>)}
            </tbody>
          </table>
        </div>
        <div className="stack">
          <div className="card">
            <h3>Sales vs expenses</h3>
            <BarChart fmt={fmt} series={[{ name: 'Sales', className: 'teal' }, { name: 'Expenses', className: 'red' }]}
              data={last6.map((k) => ({ label: MONTHS[Number(k.slice(5)) - 1].slice(0, 3) + ' ' + k.slice(2, 4), values: [byMonth[k]?.total || 0, byMonth[k]?.exp || 0] }))} />
          </div>
          <div className="card">
            <h3>Daily sales trend (last 30 days)</h3>
            <BarChart fmt={fmt} series={[{ name: 'Sales', className: 'teal' }]} data={trend} height={120} />
          </div>
        </div>
      </div>
      <div className="card">
        <h3>Top 10 selling products this month</h3>
        <table>
          <thead><tr><th>#</th><th>Product</th><th className="num">Qty</th><th className="num">Amount</th></tr></thead>
          <tbody>
            {top10.map((t, i) => <tr key={t.name}><td>{i + 1}</td><td>{t.name}</td><td className="num">{t.qty}</td><td className="num">{fmt(t.amount)}</td></tr>)}
            {!top10.length && <tr><td colSpan={4} className="empty">No sales this month yet</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

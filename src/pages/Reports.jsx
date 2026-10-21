import { useState, useRef } from 'react';
import { useStore, today, dayOf, localDate, downloadFile, toCSV, daysUntil, MAIN_BRANCH } from '../store.jsx';
import { Stat, Tabs, BarChart, PdfButton } from '../ui.jsx';

const sumBy = (arr, key, val) => {
  const m = {};
  arr.forEach((x) => { const k = key(x); m[k] = (m[k] || 0) + val(x); });
  return Object.entries(m).sort((a, b) => b[1] - a[1]);
};

export default function Reports() {
  const { db, products, fmt } = useStore();
  const [tab, setTab] = useState('sales');
  const pageRef = useRef(null);
  const TAB_NAMES = { sales: 'Sales Report', products: 'Sales by Product', purchases: 'Purchase Report', expenses: 'Expenses Report', stock: 'Stock Valuation', income: 'Income Statement' };
  const [from, setFrom] = useState(today().slice(0, 8) + '01');
  const [to, setTo] = useState(today());
  const [branch, setBranch] = useState('all');
  const inBranch = (x) => branch === 'all' || (x.branchId || MAIN_BRANCH) === branch;
  const inRange = (x) => dayOf(x.date) >= from && dayOf(x.date) <= to && inBranch(x);

  const sales = db.sales.filter((s) => s.status !== 'refunded' && inRange(s));
  const refunds = db.sales.filter((s) => s.status === 'refunded' && inRange(s));
  const purchases = db.purchases.filter(inRange);
  const expenses = db.expenses.filter(inRange);
  const revenue = sales.reduce((a, s) => a + s.total - s.tax, 0);
  const tax = sales.reduce((a, s) => a + s.tax, 0);
  const cogs = sales.reduce((a, s) => a + s.items.reduce((b, i) => b + (i.cost || 0) * i.qty, 0), 0);
  const expTotal = expenses.reduce((a, e) => a + e.amount, 0);
  const writeOffs = db.movements.filter((m) => inRange(m) && m.type === 'Expired write-off')
    .reduce((a, m) => a + -m.qty * (products.find((p) => p.id === m.productId)?.cost || 0), 0);

  const days = [];
  for (let d = new Date(from); d <= new Date(to) && days.length < 366; d = new Date(d.getTime() + 864e5)) {
    const key = localDate(d);
    days.push({ label: key, values: [sales.filter((s) => dayOf(s.date) === key).reduce((a, s) => a + s.total, 0)] });
  }

  const byProduct = {};
  sales.forEach((s) => s.items.forEach((i) => {
    byProduct[i.name] ??= { product: i.name, qty: 0, revenue: 0, cost: 0 };
    byProduct[i.name].qty += i.qty; byProduct[i.name].revenue += i.qty * i.price; byProduct[i.name].cost += i.qty * (i.cost || 0);
  }));
  const productRows = Object.values(byProduct).sort((a, b) => b.revenue - a.revenue).map((r) => ({ ...r, profit: r.revenue - r.cost }));

  const Range = (
    <div className="row gap">
      {db.branches.length > 1 && (
        <select value={branch} onChange={(e) => setBranch(e.target.value)} aria-label="Branch">
          <option value="all">All branches</option>
          {db.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      )}
      <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /><span>to</span><input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
    </div>
  );

  return (
    <div className="page" ref={pageRef}>
      <div className="page-head"><h1>Reports</h1><div className="row gap wrap">{tab !== 'stock' && Range}<PdfButton target={pageRef} title={TAB_NAMES[tab]} subtitle={tab === 'stock' ? `As at ${new Date().toLocaleDateString()}` : `${from} to ${to}`} /></div></div>
      <Tabs value={tab} onChange={setTab} tabs={[['sales', 'Sales Report'], ['products', 'Sales by Product'], ['purchases', 'Purchase Report'], ['expenses', 'Expenses Report'], ['stock', 'Stock Valuation'], ['income', 'Income Statement']]} />

      {tab === 'sales' && (
        <>
          <div className="stats">
            <Stat label="Sales" value={fmt(revenue + tax)} sub={`${sales.length} receipts`} />
            <Stat label="Average sale" value={fmt(sales.length ? (revenue + tax) / sales.length : 0)} />
            <Stat label="Discounts given" value={fmt(sales.reduce((a, s) => a + (s.discount || 0), 0))} />
            <Stat label="Refunds" value={fmt(refunds.reduce((a, s) => a + s.total, 0))} sub={`${refunds.length} receipts`} />
          </div>
          <div className="card"><h3>Daily sales</h3><BarChart fmt={fmt} data={days} series={[{ name: 'Sales' }]} /></div>
          <div className="grid2">
            <div className="card"><h3>By payment method</h3><table><tbody>
              {sumBy(sales, (s) => s.payment, (s) => s.total).map(([k, v]) => <tr key={k}><td>{k}</td><td className="num">{fmt(v)}</td></tr>)}
            </tbody></table></div>
            <div className="card"><h3>By cashier</h3><table><tbody>
              {sumBy(sales, (s) => s.cashier, (s) => s.total).map(([k, v]) => <tr key={k}><td>{k}</td><td className="num">{fmt(v)}</td></tr>)}
            </tbody></table>
            <h3 style={{ marginTop: 16 }}>Retail vs wholesale</h3><table><tbody>
              {sumBy(sales, (s) => s.type || 'retail', (s) => s.total).map(([k, v]) => <tr key={k}><td className="cap">{k}</td><td className="num">{fmt(v)}</td></tr>)}
            </tbody></table></div>
          </div>
        </>
      )}

      {tab === 'products' && (
        <div className="card table-wrap">
          <div className="row between pad"><h3>Sales by product</h3><button className="btn sm ghost" onClick={() => downloadFile('sales-by-product.csv', toCSV(productRows), 'text/csv')}>Export CSV</button></div>
          <table>
            <thead><tr><th>Product</th><th className="num">Qty</th><th className="num">Revenue</th><th className="num">Cost</th><th className="num">Profit</th></tr></thead>
            <tbody>
              {productRows.map((r) => <tr key={r.product}><td>{r.product}</td><td className="num">{r.qty}</td><td className="num">{fmt(r.revenue)}</td><td className="num">{fmt(r.cost)}</td><td className="num">{fmt(r.profit)}</td></tr>)}
              {!productRows.length && <tr><td colSpan={5} className="empty">No sales in this period</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'purchases' && (
        <>
          <div className="stats">
            <Stat label="Purchases" value={fmt(purchases.reduce((a, p) => a + p.total, 0))} sub={`${purchases.length} deliveries`} />
            <Stat label="Paid" value={fmt(purchases.reduce((a, p) => a + (p.paid ?? p.total), 0))} />
            <Stat label="On credit" value={fmt(purchases.reduce((a, p) => a + p.total - (p.paid ?? p.total), 0))} />
          </div>
          <div className="card"><h3>By supplier</h3><table><tbody>
            {sumBy(purchases, (p) => p.supplierName, (p) => p.total).map(([k, v]) => <tr key={k}><td>{k}</td><td className="num">{fmt(v)}</td></tr>)}
            {!purchases.length && <tr><td className="empty">No purchases in this period</td></tr>}
          </tbody></table></div>
        </>
      )}

      {tab === 'expenses' && (
        <div className="card">
          <h3>Expenses by category – total {fmt(expTotal)}</h3>
          <table><tbody>
            {sumBy(expenses, (e) => db.expenseCategories.find((c) => c.id === e.categoryId)?.name || 'Other', (e) => e.amount).map(([k, v]) => (
              <tr key={k}><td>{k}</td><td className="num">{fmt(v)}</td><td className="num muted">{Math.round((v / expTotal) * 100)}%</td></tr>
            ))}
            {!expenses.length && <tr><td className="empty">No expenses in this period</td></tr>}
          </tbody></table>
        </div>
      )}

      {tab === 'stock' && (() => {
        const inStock = products.filter((p) => p.stock > 0);
        const cost = inStock.reduce((a, p) => a + p.stock * p.cost, 0);
        const retail = inStock.reduce((a, p) => a + p.stock * p.price, 0);
        const expired = inStock.filter((p) => p.expiry && daysUntil(p.expiry) < 0);
        return (
          <>
            <div className="stats">
              <Stat label="Stock at cost" value={fmt(cost)} sub={`${inStock.length} items in stock`} />
              <Stat label="Stock at retail" value={fmt(retail)} />
              <Stat label="Potential profit" value={fmt(retail - cost)} />
              <Stat label="Expired stock (cost)" value={fmt(expired.reduce((a, p) => a + p.stock * p.cost, 0))} tone="red" />
            </div>
            <div className="card"><h3>By formulation</h3><table><tbody>
              {sumBy(inStock, (p) => p.form || '—', (p) => p.stock * p.cost).map(([k, v]) => <tr key={k}><td>{k}</td><td className="num">{fmt(v)}</td></tr>)}
            </tbody></table></div>
          </>
        );
      })()}

      {tab === 'income' && (
        <div className="card statement">
          <h3>Income statement · {from} to {to}</h3>
          <table><tbody>
            <tr><td>Sales (excluding tax)</td><td className="num">{fmt(revenue)}</td></tr>
            <tr><td>Less: cost of goods sold</td><td className="num">({fmt(cogs)})</td></tr>
            <tr className="sub"><td>Gross profit</td><td className="num">{fmt(revenue - cogs)}</td></tr>
            {sumBy(expenses, (e) => db.expenseCategories.find((c) => c.id === e.categoryId)?.name || 'Other', (e) => e.amount).map(([k, v]) => (
              <tr key={k}><td className="indent">{k}</td><td className="num">({fmt(v)})</td></tr>
            ))}
            {writeOffs > 0 && <tr><td className="indent">Expired stock written off</td><td className="num">({fmt(writeOffs)})</td></tr>}
            <tr className="sub"><td>Total operating expenses</td><td className="num">({fmt(expTotal + writeOffs)})</td></tr>
            <tr className="grand"><td>Net profit</td><td className="num">{fmt(revenue - cogs - expTotal - writeOffs)}</td></tr>
            <tr><td className="muted">Tax collected (not income)</td><td className="num muted">{fmt(tax)}</td></tr>
          </tbody></table>
        </div>
      )}
    </div>
  );
}

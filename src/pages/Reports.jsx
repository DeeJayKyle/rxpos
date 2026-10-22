import { useState, useRef, useMemo } from 'react';
import { AlertTriangle, Boxes, Crown, TrendingDown, PackageX } from 'lucide-react';
import { Empty, PageTip } from '../ui.jsx';
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
  const TAB_NAMES = { profit: 'Profit & Margins', sales: 'Sales Report', products: 'Sales by Product', consumption: 'Consumption (ABC)', purchases: 'Purchase Report', expenses: 'Expenses Report', stock: 'Stock Valuation', income: 'Income Statement' };
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
      <PageTip id="reports" title="Reading your figures">Pick the dates at the top right. Profit &amp; margins shows what each medicine earns and lists prices below your target margin; every table exports to PDF or CSV.</PageTip>
      <Tabs value={tab} onChange={setTab} tabs={[['sales', 'Sales Report'], ['products', 'Sales by Product'], ['consumption', 'Consumption (ABC)'], ['purchases', 'Purchase Report'], ['expenses', 'Expenses Report'], ['profit', 'Profit & margins'], ['stock', 'Stock Valuation'], ['income', 'Income Statement']]} />

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

      {tab === 'consumption' && <ConsumptionReport sales={sales} from={from} to={to} />}

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

      {tab === 'profit' && <ProfitReport sales={sales} />}
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

/** Profit per medicine and per category over the period, and a check of today's prices against the target margin */
function ProfitReport({ sales }) {
  const { db, products, fmt } = useStore();
  const [by, setBy] = useState('product');
  const target = Number(db.settings.minMargin ?? 20);
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const rows = useMemo(() => {
    const m = new Map();
    for (const s of sales) for (const i of s.items) {
      const p = byId.get(i.id);
      const key = by === 'product' ? i.id || i.name : (p?.category || p?.form || 'Other');
      const r = m.get(key) || { key, name: by === 'product' ? i.name : key, qty: 0, revenue: 0, cost: 0 };
      // the line's share of a sale discount comes off its revenue
      const share = s.subtotal > 0 ? (i.qty * i.price) / s.subtotal : 0;
      r.qty += i.qty; r.revenue += i.qty * i.price - (s.discount || 0) * share; r.cost += i.qty * (i.cost || 0);
      m.set(key, r);
    }
    return [...m.values()].map((r) => ({ ...r, profit: r.revenue - r.cost, margin: r.revenue > 0 ? ((r.revenue - r.cost) / r.revenue) * 100 : 0 })).sort((a, b) => b.profit - a.profit);
  }, [sales, byId, by]);
  const tot = rows.reduce((a, r) => ({ revenue: a.revenue + r.revenue, cost: a.cost + r.cost }), { revenue: 0, cost: 0 });
  // today's prices: in-stock medicines selling below cost or below the target margin
  const check = useMemo(() => products.filter((p) => p.stock > 0 && p.price > 0 && p.cost > 0)
    .map((p) => ({ p, margin: ((p.price - p.cost) / p.price) * 100 })).filter((r) => r.margin < target).sort((a, b) => a.margin - b.margin), [products, target]);
  const low = (m) => (m < 0 ? 'text-danger' : m < target ? 'text-warn' : '');
  return (
    <>
      <div className="stats">
        <Stat label="Gross profit" value={fmt(tot.revenue - tot.cost)} sub={`on ${fmt(tot.revenue)} sales`} />
        <Stat label="Gross margin" value={(tot.revenue ? Math.round(((tot.revenue - tot.cost) / tot.revenue) * 100) : 0) + '%'} sub={`target ${target}% (Settings)`} />
        <Stat label="Priced below cost" value={check.filter((r) => r.margin < 0).length} sub="in stock now" tone={check.some((r) => r.margin < 0) ? 'red' : ''} />
        <Stat label={`Below ${target}% margin`} value={check.filter((r) => r.margin >= 0).length} sub="in stock now" tone="amber" />
      </div>
      {check.length > 0 && (
        <div className="card table-wrap">
          <h3><AlertTriangle size={17} /> Price check: {check.length} medicine{check.length === 1 ? '' : 's'} below the {target}% margin</h3>
          <table>
            <thead><tr><th>Medicine</th><th className="num">Cost</th><th className="num">Retail</th><th className="num">Margin</th><th className="num">Price for {target}%</th><th className="num">In stock</th></tr></thead>
            <tbody>{check.slice(0, 100).map(({ p, margin }) => (
              <tr key={p.id}><td><strong>{p.name}</strong></td><td className="num">{fmt(p.cost)}</td><td className="num">{fmt(p.price)}</td>
                <td className={'num ' + low(margin)}><strong>{margin < 0 ? 'below cost' : Math.round(margin) + '%'}</strong></td>
                <td className="num">{fmt(Math.ceil(p.cost / (1 - target / 100)))}</td><td className="num">{p.stock}</td></tr>
            ))}</tbody>
          </table>
          <p className="muted small">Change prices in Quick Edit. The margin here is profit as a share of the selling price.</p>
        </div>
      )}
      <div className="card table-wrap">
        <div className="row between gap"><h3>Profit by {by === 'product' ? 'medicine' : 'category'}</h3>
          <div className="row gap"><Tabs tabs={[['product', 'Medicine'], ['category', 'Category']]} value={by} onChange={setBy} />
            <button className="btn sm ghost" onClick={() => downloadFile(`profit-by-${by}.csv`, toCSV(rows.map((r) => ({ [by]: r.name, qty: r.qty, revenue: Math.round(r.revenue), cost: Math.round(r.cost), profit: Math.round(r.profit), marginPct: r.margin.toFixed(1) }))), 'text/csv')}>Export CSV</button></div></div>
        <table>
          <thead><tr><th>{by === 'product' ? 'Medicine' : 'Category'}</th><th className="num">Qty</th><th className="num">Sales</th><th className="num">Cost</th><th className="num">Profit</th><th className="num">Margin</th></tr></thead>
          <tbody>
            {rows.slice(0, 300).map((r) => <tr key={r.key}><td>{r.name}</td><td className="num">{r.qty}</td><td className="num">{fmt(r.revenue)}</td><td className="num">{fmt(r.cost)}</td><td className={'num ' + (r.profit < 0 ? 'text-danger' : '')}>{fmt(r.profit)}</td><td className={'num ' + low(r.margin)}>{Math.round(r.margin)}%</td></tr>)}
            {!rows.length && <Empty colSpan={6}>No sales in this period</Empty>}
          </tbody>
        </table>
      </div>
    </>
  );
}

/** Consumption & ABC analysis: how much of each medicine was used in the period, ranked A/B/C by value, so the few
 *  items that tie up most of the money (class A) get the closest watch. Also flags fast movers about to run out and
 *  stock that didn't move at all. */
function ConsumptionReport({ sales, from, to }) {
  const { db, products, fmt } = useStore();
  const [showIdle, setShowIdle] = useState(false);
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const periodDays = Math.max(1, Math.round((new Date(to) - new Date(from)) / 864e5) + 1);

  const { rows, totalValue, idle } = useMemo(() => {
    const m = new Map();
    for (const s of sales) for (const i of s.items) {
      const p = byId.get(i.id);
      const key = i.id || i.name;
      const r = m.get(key) || { id: i.id, name: i.name, form: p?.form || '', qty: 0, revenue: 0, cost: p?.cost || i.cost || 0, stock: p?.stock ?? null };
      r.qty += i.qty; r.revenue += i.qty * i.price;
      if (p?.cost) r.cost = p.cost;
      m.set(key, r);
    }
    const list = [...m.values()].map((r) => ({ ...r, value: r.qty * r.cost, perDay: r.qty / periodDays }))
      .map((r) => ({ ...r, daysLeft: r.perDay > 0 && r.stock != null ? r.stock / r.perDay : null }))
      .sort((a, b) => b.value - a.value);
    const total = list.reduce((a, r) => a + r.value, 0) || 1;
    let cum = 0;
    // An item belongs to A/B by where it starts, so the single biggest item is always A even if it alone passes 80%.
    for (const r of list) { const before = (cum / total) * 100; cum += r.value; r.cumPct = (cum / total) * 100; r.cls = before < 80 ? 'A' : before < 95 ? 'B' : 'C'; }
    // medicines in stock that sold nothing this period
    const sold = new Set(list.map((r) => r.id));
    const idleRows = products.filter((p) => p.stock > 0 && !sold.has(p.id)).map((p) => ({ id: p.id, name: p.name, form: p.form || '', stock: p.stock, value: p.stock * (p.cost || 0) })).sort((a, b) => b.value - a.value);
    return { rows: list, totalValue: list.reduce((a, r) => a + r.value, 0), idle: idleRows };
  }, [sales, byId, products, periodDays]);

  const classCount = (c) => rows.filter((r) => r.cls === c).length;
  const classValue = (c) => rows.reduce((a, r) => (r.cls === c ? a + r.value : a), 0);
  const soonOut = rows.filter((r) => r.daysLeft != null && r.daysLeft < 14).sort((a, b) => a.daysLeft - b.daysLeft);
  const exportRows = rows.map((r) => ({ class: r.cls, medicine: r.name, form: r.form, usedInPeriod: r.qty, perDay: r.perDay.toFixed(2), costValue: Math.round(r.value), revenue: Math.round(r.revenue), shareOfValuePct: (r.value / (totalValue || 1) * 100).toFixed(1), inStock: r.stock ?? '', daysOfStockLeft: r.daysLeft == null ? '' : Math.round(r.daysLeft) }));

  return (
    <>
      <div className="stats">
        <Stat label="Consumption (at cost)" value={fmt(totalValue)} sub={`${rows.reduce((a, r) => a + r.qty, 0).toLocaleString()} units · ${periodDays} days`} icon={Boxes} />
        <Stat label="Class A" value={classCount('A')} sub={`${fmt(classValue('A'))} · the vital few`} tone="violet" icon={Crown} />
        <Stat label="Running out (<14 days)" value={soonOut.length} sub="at this rate" tone={soonOut.length ? 'amber' : ''} icon={TrendingDown} />
        <Stat label="Not sold (in stock)" value={idle.length} sub={`${fmt(idle.reduce((a, r) => a + r.value, 0))} tied up`} tone={idle.length ? 'red' : ''} icon={PackageX} />
      </div>

      {soonOut.length > 0 && (
        <div className="card table-wrap">
          <h3><TrendingDown size={17} /> Fast movers about to run out</h3>
          <table>
            <thead><tr><th>Medicine</th><th className="num">Used/day</th><th className="num">In stock</th><th className="num">Days left</th></tr></thead>
            <tbody>{soonOut.slice(0, 20).map((r) => (
              <tr key={r.id}><td><strong>{r.name}</strong>{r.cls === 'A' && <span className="abc a">A</span>}</td><td className="num">{r.perDay.toFixed(1)}</td><td className="num">{r.stock}</td>
                <td className="num"><strong className={r.daysLeft < 7 ? 'text-danger' : 'text-warn'}>{Math.round(r.daysLeft)}</strong></td></tr>
            ))}</tbody>
          </table>
          <p className="muted small">Based on how fast each item sold in this period. Reorder the class A items first.</p>
        </div>
      )}

      <div className="card table-wrap">
        <div className="row between pad gap wrap">
          <h3>Consumption by medicine (A/B/C by value)</h3>
          <button className="btn sm ghost" onClick={() => downloadFile(`consumption-abc-${from}-to-${to}.csv`, toCSV(exportRows), 'text/csv')}>Export CSV</button>
        </div>
        <table>
          <thead><tr><th>Class</th><th>Medicine</th><th className="num">Used</th><th className="num">Per day</th><th className="num">Value (cost)</th><th className="num">Share</th><th className="num">In stock</th><th className="num">Days left</th></tr></thead>
          <tbody>
            {rows.slice(0, 500).map((r) => (
              <tr key={r.id || r.name}>
                <td><span className={'abc ' + r.cls.toLowerCase()}>{r.cls}</span></td>
                <td><strong>{r.name}</strong>{r.form ? <><br /><small className="muted">{r.form}</small></> : null}</td>
                <td className="num">{r.qty}</td><td className="num">{r.perDay.toFixed(1)}</td>
                <td className="num">{fmt(r.value)}</td><td className="num muted">{(r.value / (totalValue || 1) * 100).toFixed(1)}%</td>
                <td className="num">{r.stock ?? '—'}</td>
                <td className="num">{r.daysLeft == null ? '—' : <span className={r.daysLeft < 14 ? 'text-warn' : ''}>{Math.round(r.daysLeft)}</span>}</td>
              </tr>
            ))}
            {!rows.length && <Empty colSpan={8}>Nothing was sold in this period</Empty>}
          </tbody>
        </table>
        <p className="muted small">Class <b>A</b> is the top 80% of consumption value — few items, most of the money, so watch them closely. <b>B</b> is the next 15%, <b>C</b> the last 5%. Value is units used × cost.</p>
      </div>

      {idle.length > 0 && (
        <div className="card table-wrap">
          <div className="row between pad gap"><h3><PackageX size={17} /> In stock but not sold this period ({idle.length})</h3>
            <button className="btn sm ghost" onClick={() => setShowIdle((v) => !v)}>{showIdle ? 'Hide' : 'Show'}</button></div>
          {showIdle && (
            <table>
              <thead><tr><th>Medicine</th><th className="num">In stock</th><th className="num">Tied up (cost)</th></tr></thead>
              <tbody>{idle.slice(0, 300).map((r) => <tr key={r.id}><td>{r.name}{r.form ? <> · <small className="muted">{r.form}</small></> : null}</td><td className="num">{r.stock}</td><td className="num">{fmt(r.value)}</td></tr>)}</tbody>
            </table>
          )}
        </div>
      )}
    </>
  );
}

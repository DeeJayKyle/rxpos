// Reports → Sales lines (1.7): every medicine sold, one row per line of a sale, with who sold it and what it earned.
// Filters combine and apply as they change. Amount is the line after its share of the sale's discount; profit is that
// amount less the cost saved with the sale (the cost at the moment it was sold, not today's).
import { useMemo, useRef, useState } from 'react';
import { payLabel } from '../tenders.js';
import { useNavigate } from 'react-router-dom';
import { Banknote, TrendingUp, Package, AlertTriangle, Download, Printer } from 'lucide-react';
import { useStore, dayOf, downloadFile, toCSV, MAIN_BRANCH } from '../store.jsx';
import { formatQty } from '../money.js';
import { Stat, PdfButton, PayChip, ExportMenu } from '../ui.jsx';
import { DataTable } from '../datatable.jsx';
import { dateLocale } from '../showdate.js';

const ALL = '';

/** Every sold line in the period (refunded sales left out), with its share of the sale's discount */
export function saleLines(sales, products) {
  const byId = new Map(products.map((p) => [p.id, p]));
  const out = [];
  for (const s of sales) {
    const gross = s.items.reduce((a, i) => a + i.qty * i.price, 0);
    const keep = gross > 0 ? Math.max(0, 1 - (s.discount || 0) / gross) : 1;
    s.items.forEach((i, n) => {
      const amount = i.qty * i.price * keep, cost = i.qty * (i.cost || 0);
      out.push({ key: s.id + ':' + n, saleId: s.id, number: s.number, date: s.date, customer: s.customerName || 'Walk-in', customerId: s.customerId || '',
        cashier: s.cashier || '', payment: payLabel(s), type: s.type || 'retail', name: i.name, generic: byId.get(i.id)?.generic || '',
        productId: i.id, qty: i.qty, amount, cost, profit: amount - cost });
    });
  }
  return out;
}

/** money: show profit, margin and below-cost (cost prices). Off for staff with the Sales lines report only. */
export default function SalesLines({ from, to, branch, initial = {}, money = true, db: given }) {
  const { db: own, products, fmt } = useStore();
  const db = given || own; // Reports passes its records (with older ones from the cloud, stage 4 of the faster sync)
  const navigate = useNavigate();
  const ref = useRef(null);
  const [f, setF] = useState({ cashier: ALL, type: ALL, payment: ALL, customer: ALL, medicine: initial.medicine || '' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const sales = useMemo(() => db.sales.filter((s) => s.status !== 'refunded' && dayOf(s.date) >= from && dayOf(s.date) <= to && (branch === 'all' || (s.branchId || MAIN_BRANCH) === branch)), [db.sales, from, to, branch]);
  const lines = useMemo(() => saleLines(sales, products), [sales, products]);
  const opts = (k) => [...new Set(lines.map((l) => l[k]).filter(Boolean))].sort();
  const med = f.medicine.trim().toLowerCase();
  const rows = lines.filter((l) => (!f.cashier || l.cashier === f.cashier) && (!f.type || l.type === f.type) && (!f.payment || l.payment === f.payment)
    && (!f.customer || l.customer === f.customer) && (!med || `${l.name} ${l.generic}`.toLowerCase().includes(med)));
  // the PDF and CSV list the lines newest first (the table sorts on its own)
  const s = { rows: [...rows].sort((a, b) => String(b.date).localeCompare(String(a.date))) };
  const sum = rows.reduce((a, l) => ({ qty: a.qty + l.qty, amount: a.amount + l.amount, profit: a.profit + l.profit }), { qty: 0, amount: 0, profit: 0 });
  const losses = rows.filter((l) => l.profit < 0 && l.cost > 0).length;
  const receipts = new Set(rows.map((l) => l.saleId)).size;
  const pct = (x, of) => (of ? Math.round((x / of) * 100) + '%' : '—');
  const when = (d) => new Date(d).toLocaleString(dateLocale(), { dateStyle: 'medium', timeStyle: 'short' });
  const title = `Sales lines from ${from} to ${to}`;
  const filtersText = [f.cashier && `dispenser ${f.cashier}`, f.type && f.type, f.payment && `paid by ${f.payment}`, f.customer && `customer ${f.customer}`, med && `medicine "${f.medicine}"`].filter(Boolean).join(' · ');
  const csv = () => downloadFile(`sales-lines-${from}-${to}.csv`, toCSV(s.rows.map((l) => ({ date: when(l.date), customer: l.customer, dispenser: l.cashier, receipt: l.number, trade_name: l.name, generic_name: l.generic, qty: l.qty, payment: l.payment, amount: Math.round(l.amount), ...(money ? { profit: Math.round(l.profit), margin: pct(l.profit, l.amount) } : {}) }))), 'text/csv');

  return (
    <div ref={ref}>
      <div className="report-filters no-print">
        <label>Dispenser<select value={f.cashier} onChange={set('cashier')}><option value={ALL}>All</option>{opts('cashier').map((x) => <option key={x}>{x}</option>)}</select></label>
        <label>Sales type<select value={f.type} onChange={set('type')}><option value={ALL}>All</option><option value="retail">Retail</option><option value="wholesale">Wholesale</option></select></label>
        <label>Payment<select value={f.payment} onChange={set('payment')}><option value={ALL}>All</option>{opts('payment').map((x) => <option key={x}>{x}</option>)}</select></label>
        <label>Customer<select value={f.customer} onChange={set('customer')}><option value={ALL}>All</option>{opts('customer').map((x) => <option key={x}>{x}</option>)}</select></label>
        <label>Medicine<input list="lines-meds" placeholder="Any (type to search)" value={f.medicine} onChange={set('medicine')} /></label>
        <datalist id="lines-meds">{opts('name').map((x) => <option key={x} value={x} />)}</datalist>
        <span className="grow" />
        <ExportMenu>
        <PdfButton title={title} subtitle={filtersText || 'All sales lines'} data={() => [{ head: ['Date & time', 'Customer', 'Dispenser', 'Receipt', 'Trade name', 'Generic name', 'Qty', 'Payment', 'Amount', ...(money ? ['Profit'] : [])], numeric: money ? [6, 8, 9] : [6, 8],
          body: s.rows.map((l) => [when(l.date), l.customer, l.cashier, l.number, l.name, l.generic, formatQty(l.qty), l.payment, fmt(l.amount), ...(money ? [fmt(l.profit)] : [])]),
          foot: ['Total', '', '', '', '', '', formatQty(sum.qty), '', fmt(sum.amount), ...(money ? [fmt(sum.profit)] : [])] }]} />
        <button className="btn ghost" onClick={csv}><Download size={16} />CSV</button>
        </ExportMenu>
        <button className="btn ghost" onClick={() => window.print()}><Printer size={16} />Print</button>
      </div>
      <div className="stats kpis">
        <Stat label="Amount" value={fmt(sum.amount)} sub={`${rows.length.toLocaleString()} lines · ${receipts.toLocaleString()} receipts`} tone="teal" icon={Banknote} />
        {money && <Stat label="Profit" value={fmt(sum.profit)} sub={`${pct(sum.profit, sum.amount)} margin`} tone="violet" icon={TrendingUp} />}
        <Stat label="Quantity sold" value={formatQty(sum.qty)} sub={`${new Set(rows.map((l) => l.name)).size} medicines`} tone="blue" icon={Package} />
        {money && <Stat label="Sold below cost" value={losses} sub={losses ? 'lines with a loss: check the price' : 'no line sold at a loss'} tone={losses ? 'red' : 'green'} icon={AlertTriangle} />}
      </div>
      <div className="report-title">{title}{filtersText && <small className="muted"> · {filtersText}</small>}</div>
      {/* the shared table (2026-11-26): 100 lines, then more as the list scrolls (no page buttons); the total is of every line */}
      <DataTable id="sales-lines" className="lines-table" rows={rows} rowKey={(l) => l.key} sort={['date', -1]} csv={false} resetKey={[from, to, branch, f.cashier, f.type, f.payment, f.customer, med].join('|')}
        empty="No sales lines match these filters in this period"
        foot={(id, all, i) => (i === 0 ? `Total · ${all.length.toLocaleString()} lines` : id === 'qty' ? formatQty(sum.qty) : id === 'amount' ? fmt(sum.amount) : id === 'profit' ? fmt(sum.profit) : id === 'margin' ? pct(sum.profit, sum.amount) : '')}
        columns={[
          { id: 'date', label: 'Date & time', sortBy: (l) => l.date, render: (l) => when(l.date) },
          { id: 'customer', label: 'Customer', key: 'customer' },
          { id: 'cashier', label: 'Dispenser', key: 'cashier' },
          { id: 'number', label: 'Receipt', sortBy: (l) => l.number, render: (l) => <button type="button" className="link-btn" title="Open this sale" onClick={() => navigate('/sales', { state: { q: l.number } })}>{l.number}</button> },
          { id: 'name', label: 'Trade name', sortBy: (l) => l.name, render: (l) => <strong>{l.name}</strong> },
          { id: 'generic', label: 'Generic name', sortBy: (l) => l.generic, className: 'muted', render: (l) => l.generic || '—' },
          { id: 'qty', label: 'Qty', num: true, sortBy: (l) => l.qty, render: (l) => formatQty(l.qty) },
          { id: 'payment', label: 'Payment', sortBy: (l) => l.payment, render: (l) => <PayChip name={l.payment} /> },
          { id: 'amount', label: 'Amount', num: true, sortBy: (l) => l.amount, render: (l) => fmt(l.amount) },
          ...(money ? [
            { id: 'profit', label: 'Profit', num: true, sortBy: (l) => l.profit, tdClass: (l) => (l.profit < 0 ? 'loss' : ''), render: (l) => fmt(l.profit) },
            { id: 'margin', label: 'Margin', num: true, sortBy: (l) => (l.amount ? l.profit / l.amount : 0), render: (l) => (l.profit < 0 && l.cost > 0 ? <span className="status danger"><i />loss</span> : pct(l.profit, l.amount)) },
          ] : []),
        ]} />
    </div>
  );
}

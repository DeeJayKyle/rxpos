import { useState } from 'react';
import { useStore, downloadFile, toCSV, put, move, now } from '../store.jsx';
import { Modal } from '../ui.jsx';

export function Receipt({ sale }) {
  const { db, fmt } = useStore();
  const s = db.settings;
  const isProforma = sale.proforma || String(sale.number).startsWith('PF');
  return (
    <div className="receipt print-area">
      <div className="center">
        <strong>{s.name}</strong>
        {s.address && <div>{s.address}</div>}
        {s.phone && <div>Tel: {s.phone}</div>}
        {isProforma && <div><strong>PROFORMA INVOICE</strong></div>}
        <div className="muted">{sale.number} · {new Date(sale.date).toLocaleString()}</div>
        <div className="muted">{isProforma ? 'Prepared by' : 'Cashier'}: {sale.cashier || sale.createdBy} · Customer: {sale.customerName}</div>
      </div>
      <table>
        <tbody>
          {sale.items.map((i) => (
            <tr key={i.id}><td>{i.name}<br /><small>{i.qty} × {fmt(i.price)}</small></td><td className="num">{fmt(i.qty * i.price)}</td></tr>
          ))}
        </tbody>
      </table>
      <div className="row between"><span>Subtotal</span><span>{fmt(sale.subtotal)}</span></div>
      {sale.discount > 0 && <div className="row between"><span>Discount</span><span>-{fmt(sale.discount)}</span></div>}
      {sale.tax > 0 && <div className="row between"><span>Tax</span><span>{fmt(sale.tax)}</span></div>}
      <div className="row between grand"><span>Total</span><span>{fmt(sale.total)}</span></div>
      {!isProforma && <div className="row between"><span>Paid ({sale.payment})</span><span>{fmt(sale.payment === 'Cash' ? sale.tendered : sale.paid ?? sale.total)}</span></div>}
      {!isProforma && sale.payment === 'Cash' && sale.tendered > sale.total && <div className="row between"><span>Change</span><span>{fmt(sale.tendered - sale.total)}</span></div>}
      {!isProforma && (sale.paid ?? sale.total) < sale.total && <div className="row between"><span>Balance on credit</span><span>{fmt(sale.total - sale.paid)}</span></div>}
      {sale.status === 'refunded' && <div className="center text-danger"><strong>REFUNDED</strong></div>}
      <p className="center muted">{isProforma ? 'Prices valid for 7 days.' : s.receiptFooter}</p>
    </div>
  );
}

export default function Sales() {
  const { db, update, fmt, user } = useStore();
  const [q, setQ] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [view, setView] = useState(null);

  const rows = db.sales.filter((s) =>
    (!q || [s.number, s.customerName, s.cashier, s.payment, s.type].join(' ').toLowerCase().includes(q.toLowerCase())) &&
    (!from || s.date.slice(0, 10) >= from) && (!to || s.date.slice(0, 10) <= to));
  const valid = rows.filter((s) => s.status !== 'refunded');

  const refund = (sale) => {
    if (!confirm(`Refund ${sale.number} and return items to stock?`)) return;
    update((d) => {
      put(d, 'sales', { ...sale, status: 'refunded', refundedBy: user.name, refundedAt: now() });
      sale.items.forEach((i) => move(d, { productId: i.id, qty: i.qty, type: 'Refund', ref: sale.number, user: user.name }));
    });
    setView(null);
  };

  const exportRows = rows.map((s) => ({ receipt: s.number, date: s.date, type: s.type || 'retail', customer: s.customerName, cashier: s.cashier, payment: s.payment, items: s.items.length, discount: s.discount, tax: s.tax, total: s.total, paid: s.paid ?? s.total, status: s.status }));

  return (
    <div className="page">
      <div className="page-head">
        <h1>Sales History</h1>
        <div className="row gap">
          <input className="search" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} title="From" />
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} title="To" />
          <button className="btn ghost" onClick={() => downloadFile('sales.csv', toCSV(exportRows), 'text/csv')}>Export CSV</button>
        </div>
      </div>
      <div className="muted">{valid.length} sales · {fmt(valid.reduce((a, s) => a + s.total, 0))}</div>
      <div className="card table-wrap">
        <table>
          <thead><tr><th>Receipt</th><th>Date</th><th>Type</th><th>Customer</th><th>Cashier</th><th>Payment</th><th>Status</th><th className="num">Total</th><th /></tr></thead>
          <tbody>
            {rows.slice(0, 500).map((s) => (
              <tr key={s.id} className={s.status === 'refunded' ? 'dim' : ''}>
                <td>{s.number}</td><td>{new Date(s.date).toLocaleString()}</td><td className="cap">{s.type || 'retail'}</td><td>{s.customerName}</td><td>{s.cashier}</td><td>{s.payment}</td>
                <td><span className={'badge ' + (s.status === 'refunded' ? 'danger' : 'ok')}>{s.status}</span></td>
                <td className="num">{fmt(s.total)}</td>
                <td className="actions"><button className="btn sm ghost" onClick={() => setView(s)}>View</button></td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={9} className="empty">No sales found</td></tr>}
          </tbody>
        </table>
      </div>
      {view && (
        <Modal title={`Receipt ${view.number}`} onClose={() => setView(null)}>
          <Receipt sale={view} />
          <div className="form-actions no-print">
            {view.status !== 'refunded' && user.role !== 'cashier' && <button className="btn danger" onClick={() => refund(view)}>Refund</button>}
            <button className="btn primary" onClick={() => window.print()}>Print</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

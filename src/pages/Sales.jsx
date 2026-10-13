import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Download, Printer, Undo2, Eye } from 'lucide-react';
import { useStore, downloadFile, toCSV, put, move, now, audit, MAIN_BRANCH } from '../store.jsx';
import { Modal, SearchBox, Empty } from '../ui.jsx';
import { ask, toast } from '../feedback.jsx';
import { Barcode } from '../barcode.jsx';

/** Thermal-printer friendly receipt (58 mm or 80 mm, set in Settings). */
export function Receipt({ sale }) {
  const { db, fmt } = useStore();
  const s = db.settings;
  const isProforma = sale.proforma || String(sale.number).startsWith('PF');
  const branch = db.branches.find((b) => b.id === (sale.branchId || MAIN_BRANCH));
  return (
    <div className={'receipt print-area paper-' + (s.paperWidth || 80)}>
      <div className="center">
        <strong className="receipt-title">{s.name}</strong>
        {db.branches.length > 1 && branch && <div>{branch.name}</div>}
        {(branch?.address || s.address) && <div>{branch?.address || s.address}</div>}
        {s.phone && <div>Tel: {s.phone}</div>}
        {s.tin && <div>TIN: {s.tin}</div>}
        {isProforma && <div className="receipt-tag">PROFORMA INVOICE</div>}
        <div>{sale.number} · {new Date(sale.date).toLocaleString()}</div>
        <div>{isProforma ? 'Prepared by' : 'Served by'}: {sale.cashier || sale.createdBy}</div>
        {sale.customerName && sale.customerName !== 'Walk-in Customer' && <div>Customer: {sale.customerName}</div>}
      </div>
      <div className="receipt-rule" />
      <table>
        <tbody>
          {sale.items.map((i) => (
            <tr key={i.id}>
              <td>{i.name}<br /><small>{i.qty} × {fmt(i.price)}{i.alloc?.length === 1 && i.alloc[0].batch ? ` · B/N ${i.alloc[0].batch}` : ''}{i.alloc?.[0]?.expiry ? ` · Exp ${i.alloc[0].expiry}` : ''}</small>{i.directions && <><br /><small className="receipt-dir">{[i.directions.dose, i.directions.freq, i.directions.days && `for ${i.directions.days} days`].filter(Boolean).join(' ')}{i.directions.notes?.length ? ` · ${i.directions.notes.join(', ')}` : ''}</small></>}</td>
              <td className="num">{fmt(i.qty * i.price)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="receipt-rule" />
      <div className="row between"><span>Subtotal</span><span>{fmt(sale.subtotal)}</span></div>
      {sale.discount > 0 && <div className="row between"><span>Discount</span><span>-{fmt(sale.discount)}</span></div>}
      {sale.tax > 0 && <div className="row between"><span>Tax</span><span>{fmt(sale.tax)}</span></div>}
      <div className="row between grand"><span>TOTAL</span><span>{fmt(sale.total)}</span></div>
      {!isProforma && <div className="row between"><span>Paid ({sale.payment})</span><span>{fmt(sale.payment === 'Cash' ? sale.tendered : sale.paid ?? sale.total)}</span></div>}
      {!isProforma && sale.payment === 'Cash' && sale.tendered > sale.total && <div className="row between"><span>Change</span><span>{fmt(sale.tendered - sale.total)}</span></div>}
      {!isProforma && (sale.paid ?? sale.total) < sale.total && <div className="row between"><span>Balance on credit</span><span>{fmt(sale.total - sale.paid)}</span></div>}
      {sale.momo?.txid && <div className="row between"><span>{sale.momo.provider === 'airtel' ? 'Airtel' : 'MoMo'} Ref</span><span>{sale.momo.txid}</span></div>}
      {sale.status === 'refunded' && <div className="center receipt-tag">REFUNDED</div>}
      <div className="receipt-barcode"><Barcode value={sale.number} height={34} module={1.6} /></div>
      <p className="center">{isProforma ? 'Prices valid for 7 days.' : s.receiptFooter}</p>
    </div>
  );
}

export default function Sales() {
  const { db, update, fmt, user, branchId } = useStore();
  const location = useLocation();
  const [q, setQ] = useState(location.state?.q || '');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [branch, setBranch] = useState(user.role === 'cashier' ? branchId : 'all');
  const [view, setView] = useState(null);

  const ql = q.toLowerCase();
  const rows = db.sales.filter((s) =>
    (branch === 'all' || (s.branchId || MAIN_BRANCH) === branch) &&
    (!q || [s.number, s.customerName, s.cashier, s.payment, s.type, s.momo?.txid].join(' ').toLowerCase().includes(ql)) &&
    (!from || s.date.slice(0, 10) >= from) && (!to || s.date.slice(0, 10) <= to));
  const valid = rows.filter((s) => s.status !== 'refunded');

  const refund = async (sale) => {
    if (!(await ask({ title: `Refund ${sale.number}?`, message: `${fmt(sale.total)} will be refunded and the items returned to stock (same batches).`, confirmText: 'Refund', danger: true }))) return;
    update((d) => {
      put(d, 'sales', { ...sale, status: 'refunded', refundedBy: user.name, refundedAt: now() });
      for (const i of sale.items) {
        const parts = i.alloc?.length ? i.alloc : [{ batchId: null, qty: i.qty }];
        for (const a of parts) move(d, { productId: i.id, qty: a.qty, type: 'Refund', ref: sale.number, user: user.name, batchId: a.batchId, branchId: sale.branchId || MAIN_BRANCH });
      }
      audit(d, user, 'Refund', `${sale.number} · ${fmt(sale.total)}`, sale.branchId || MAIN_BRANCH);
    });
    setView(null);
    toast(`${sale.number} refunded and items returned to stock`);
  };

  const branchName = (id) => db.branches.find((b) => b.id === (id || MAIN_BRANCH))?.name || '—';
  const exportRows = rows.map((s) => ({ receipt: s.number, date: s.date, branch: branchName(s.branchId), type: s.type || 'retail', customer: s.customerName, cashier: s.cashier, payment: s.payment, momoRef: s.momo?.txid || '', items: s.items.length, discount: s.discount, tax: s.tax, total: s.total, paid: s.paid ?? s.total, status: s.status }));

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Sales History</h1><div className="sub">{valid.length} sales · {fmt(valid.reduce((a, s) => a + s.total, 0))}</div></div>
        <div className="row gap">
          {db.branches.length > 1 && user.role !== 'cashier' && (
            <select value={branch} onChange={(e) => setBranch(e.target.value)} aria-label="Branch">
              <option value="all">All branches</option>
              {db.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          )}
          <SearchBox value={q} onChange={setQ} placeholder="Receipt, customer, cashier…" />
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} title="From" />
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} title="To" />
          <button className="btn ghost" onClick={() => downloadFile('sales.csv', toCSV(exportRows), 'text/csv')}><Download size={16} />CSV</button>
        </div>
      </div>
      <div className="card table-wrap">
        <table>
          <thead><tr><th>Receipt</th><th>Date</th>{db.branches.length > 1 && <th>Branch</th>}<th>Customer</th><th>Cashier</th><th>Payment</th><th>Status</th><th className="num">Total</th><th /></tr></thead>
          <tbody>
            {rows.slice(0, 500).map((s) => (
              <tr key={s.id} className={s.status === 'refunded' ? 'dim' : ''}>
                <td><strong>{s.number}</strong><br /><small className="muted cap">{s.type || 'retail'}</small></td>
                <td>{new Date(s.date).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</td>
                {db.branches.length > 1 && <td>{branchName(s.branchId)}</td>}
                <td>{s.customerName}</td><td>{s.cashier}</td><td>{s.payment}{s.momo?.txid ? <><br /><small className="muted">{s.momo.txid}</small></> : null}</td>
                <td><span className={'badge ' + (s.status === 'refunded' ? 'danger' : 'ok')}>{s.status}</span></td>
                <td className="num">{fmt(s.total)}</td>
                <td className="actions"><button className="btn sm ghost" onClick={() => setView(s)}><Eye size={14} />View</button></td>
              </tr>
            ))}
            {!rows.length && <Empty colSpan={9}>No sales found</Empty>}
          </tbody>
        </table>
      </div>
      {view && (
        <Modal title={`Receipt ${view.number}`} onClose={() => setView(null)}>
          <Receipt sale={view} />
          <div className="form-actions no-print">
            {view.status !== 'refunded' && user.role !== 'cashier' && <button className="btn danger" onClick={() => refund(view)}><Undo2 size={16} />Refund</button>}
            <button className="btn primary" onClick={() => window.print()}><Printer size={16} />Print</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

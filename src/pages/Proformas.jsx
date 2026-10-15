import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store.jsx';
import { Modal, ReceiptPdfButton } from '../ui.jsx';
import { Receipt } from './Sales.jsx';
import { ask } from '../feedback.jsx';

export default function Proformas() {
  const { db, remove, fmt } = useStore();
  const navigate = useNavigate();
  const [view, setView] = useState(null);
  const [q, setQ] = useState('');
  const rows = db.proformas.filter((p) => !q || [p.number, p.customerName].join(' ').toLowerCase().includes(q.toLowerCase()));

  const sell = (pf) => navigate(pf.type === 'wholesale' ? '/pos/wholesale' : '/pos', { state: { proforma: pf } });

  return (
    <div className="page">
      <div className="page-head">
        <h1>Proformas</h1>
        <input className="search" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <p className="muted">Create a proforma from the POS with the “Proforma” button (F10). Convert it to a sale when the customer pays.</p>
      <div className="card table-wrap">
        <table>
          <thead><tr><th>Number</th><th>Date</th><th>Customer</th><th>Items</th><th>Status</th><th className="num">Total</th><th /></tr></thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id}>
                <td>{p.number}</td><td>{new Date(p.date).toLocaleDateString()}</td><td>{p.customerName}</td><td>{p.items.length}</td>
                <td><span className={'badge ' + (p.status === 'Converted' ? 'ok' : 'warn')}>{p.status}{p.saleNumber ? ' → ' + p.saleNumber : ''}</span></td>
                <td className="num">{fmt(p.total)}</td>
                <td className="actions">
                  <button className="btn sm ghost" onClick={() => setView(p)}>View</button>
                  {p.status !== 'Converted' && <button className="btn sm primary" onClick={() => sell(p)}>Sell</button>}
                  <button className="btn sm danger" onClick={async () => (await ask({ title: 'Delete this proforma?', confirmText: 'Delete', danger: true })) && remove('proformas', p.id)}>Delete</button>
                </td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={7} className="empty">No proformas</td></tr>}
          </tbody>
        </table>
      </div>
      {view && (
        <Modal title={`Proforma ${view.number}`} onClose={() => setView(null)}>
          <Receipt sale={{ ...view, proforma: true }} />
          <div className="form-actions no-print"><ReceiptPdfButton sale={{ ...view, proforma: true }} /><button className="btn primary" onClick={() => window.print()}>Print</button></div>
        </Modal>
      )}
    </div>
  );
}

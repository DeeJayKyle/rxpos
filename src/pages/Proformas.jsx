import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DataTable } from '../datatable.jsx';
import { useStore } from '../store.jsx';
import { Modal, ReceiptPdfButton } from '../ui.jsx';
import { Receipt, useReceiptPrinter } from './Sales.jsx';
import { ask } from '../feedback.jsx';
import { showDate } from '../showdate.js';

export default function Proformas() {
  const { db, remove, fmt } = useStore();
  const printReceiptNow = useReceiptPrinter();
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
      <DataTable id="proformas" rows={rows} sort={['date', -1]} resetKey={q}
        empty={db.proformas.length ? 'No proformas match' : 'No proformas yet. Build a sale at the POS and press Proforma (F10) to give a customer a quotation; sell it later in one tap.'} columns={[
          { id: 'number', label: 'Number', key: 'number' },
          { id: 'date', label: 'Date', key: 'date', render: (p) => showDate(p.date) },
          { id: 'customer', label: 'Customer', key: 'customerName' },
          { id: 'items', label: 'Items', num: true, sortBy: (p) => p.items.length, render: (p) => p.items.length },
          { id: 'status', label: 'Status', key: 'status', render: (p) => <span className={'badge ' + (p.status === 'Converted' ? 'ok' : 'warn')}>{p.status}{p.saleNumber ? ' → ' + p.saleNumber : ''}</span> },
          { id: 'total', label: 'Total', num: true, sortBy: (p) => p.total || 0, render: (p) => fmt(p.total) },
          { id: 'actions', label: 'Actions', noExport: true, className: 'actions', render: (p) => <>
            <button className="btn sm ghost" onClick={() => setView(p)}>View</button>
            {p.status !== 'Converted' && <button className="btn sm primary" onClick={() => sell(p)}>Sell</button>}
            <button className="btn sm danger" onClick={async () => (await ask({ title: 'Delete this proforma?', confirmText: 'Delete', danger: true })) && remove('proformas', p.id)}>Delete</button>
          </> },
        ]} />
      {view && (
        <Modal title={`Proforma ${view.number}`} onClose={() => setView(null)}>
          <Receipt sale={{ ...view, proforma: true }} />
          <div className="form-actions no-print"><ReceiptPdfButton sale={{ ...view, proforma: true }} /><button className="btn primary" onClick={() => printReceiptNow({ ...view, proforma: true })}>Print</button></div>
        </Modal>
      )}
    </div>
  );
}

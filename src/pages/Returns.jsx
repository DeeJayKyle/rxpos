import { useState, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { Undo2, Plus, X, FileDown } from 'lucide-react';
import { useStore, uid, now, today, put, move, audit, downloadFile, toCSV, daysUntil } from '../store.jsx';
import { CASH } from '../finance.js';
import { Modal, Empty, PdfButton, SearchBox } from '../ui.jsx';
import { toast } from '../feedback.jsx';
import { docNumber } from './POS.jsx';

const REASONS = ['Expired', 'Short expiry', 'Damaged', 'Wrong item delivered', 'Recall', 'Other'];

/** Which supplier delivered a batch (from the purchase that received it) */
const supplierOfBatch = (db, batchId) => db.purchases.find((p) => p.items?.some((i) => i.batchId === batchId))?.supplierId || '';

/**
 * Returns to supplier: expired, damaged or wrong stock goes back; the supplier gives a credit note (we owe them less)
 * or refunds the money. Each line takes stock out of its batch at this branch.
 */
export default function Returns() {
  const { db, fmt } = useStore();
  const location = useLocation();
  const pre = location.state?.returnBatch; // from Expiring / Expired → Return
  const [open, setOpen] = useState(!!pre);
  const [view, setView] = useState(null);
  const [q, setQ] = useState('');
  const rows = db.supplierReturns.filter((r) => !q || [r.number, r.supplierName, r.creditNote, ...r.items.map((i) => i.name)].join(' ').toLowerCase().includes(q.toLowerCase()));
  const ref = useRef(null);
  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Returns to Supplier</h1><div className="sub">{db.supplierReturns.length} returns · {fmt(db.supplierReturns.reduce((a, r) => a + (r.total || 0), 0))} credited or refunded</div></div>
        <div className="row gap">
          <SearchBox value={q} onChange={setQ} />
          <button className="btn ghost" onClick={() => downloadFile('supplier-returns.csv', toCSV(rows.flatMap((r) => r.items.map((i) => ({ date: r.date, number: r.number, supplier: r.supplierName, creditNote: r.creditNote, settled: r.settle === 'cash' ? 'Refund' : 'Credit note', medicine: i.name, batch: i.batch, expiry: i.expiry, qty: i.qty, credit: i.credit, reason: i.reason })))), 'text/csv')}><FileDown size={16} />CSV</button>
          <button className="btn primary" onClick={() => setOpen(true)}><Plus size={16} />New return</button>
        </div>
      </div>
      <div className="card table-wrap" ref={ref}>
        <table>
          <thead><tr><th>Date</th><th>Return</th><th>Supplier</th><th>Items</th><th>Settled by</th><th className="num">Value</th><th /></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.date}</td><td>{r.number}</td><td>{r.supplierName}</td>
                <td>{r.items.map((i) => i.name).slice(0, 2).join(', ')}{r.items.length > 2 ? ` +${r.items.length - 2}` : ''}</td>
                <td>{r.settle === 'cash' ? <span className="badge ok">Refund</span> : <span className="badge">Credit note{r.creditNote ? ' ' + r.creditNote : ''}</span>}</td>
                <td className="num">{fmt(r.total)}</td>
                <td className="actions"><button className="btn sm ghost" onClick={() => setView(r)}>View</button></td>
              </tr>
            ))}
            {!rows.length && <Empty colSpan={7}>No returns yet. Expired or damaged stock can go back to the supplier for a credit note or refund.</Empty>}
          </tbody>
        </table>
      </div>
      {open && <ReturnForm pre={pre} onClose={() => { setOpen(false); window.history.replaceState({}, ''); }} />}
      {view && (
        <Modal title={`Return ${view.number}`} onClose={() => setView(null)} wide>
          <ReturnNote r={view} />
        </Modal>
      )}
    </div>
  );
}

function ReturnNote({ r }) {
  const { db, fmt } = useStore();
  const data = () => [{ heading: `Return ${r.number} to ${r.supplierName}`, head: ['Medicine', 'Batch', 'Expiry', 'Reason', 'Qty', 'Credit / unit', 'Total'], numeric: [4, 5, 6],
    body: r.items.map((i) => [i.name, i.batch || '', i.expiry || '', i.reason, String(i.qty), fmt(i.credit), fmt(i.qty * i.credit)]).concat([['', '', '', '', '', 'Total', fmt(r.total)]]) }];
  return (
    <>
      <p className="muted">{r.date} · {r.supplierName} · {r.settle === 'cash' ? `refund to ${db.banks.find((b) => b.id === r.bankId)?.name || 'Cash at hand'}` : `credit note ${r.creditNote || '(number to follow)'}`} · by {r.by}</p>
      <table>
        <thead><tr><th>Medicine</th><th>Batch</th><th>Expiry</th><th>Reason</th><th className="num">Qty</th><th className="num">Credit / unit</th><th className="num">Total</th></tr></thead>
        <tbody>{r.items.map((i, n) => <tr key={n}><td>{i.name}</td><td>{i.batch}</td><td>{i.expiry}</td><td>{i.reason}</td><td className="num">{i.qty}</td><td className="num">{fmt(i.credit)}</td><td className="num">{fmt(i.qty * i.credit)}</td></tr>)}</tbody>
      </table>
      {r.note && <p className="small">{r.note}</p>}
      <div className="form-actions"><span className="grow"><strong>Total {fmt(r.total)}</strong></span><PdfButton data={data} title={`Return note ${r.number}`} subtitle={`${db.settings.name} → ${r.supplierName} · ${r.date}`} label="Return note (PDF)" /></div>
    </>
  );
}

function ReturnForm({ pre, onClose }) {
  const { db, products, batchesOf, update, user, branchId, fmt } = useStore();
  const lineFor = (p, b, extra = {}) => ({ key: uid(), productId: p.id, name: p.name, batchId: b?.id || '', qty: b ? Math.max(1, b.qty) : 1, credit: b?.cost || p.cost || 0, reason: b?.expiry && daysUntil(b.expiry) < 0 ? 'Expired' : 'Damaged', ...extra });
  const [f, setF] = useState(() => {
    const base = { supplierId: '', date: today(), creditNote: '', settle: 'credit', bankId: CASH, note: '', lines: [] };
    if (!pre) return base;
    const p = products.find((x) => x.id === pre.productId);
    const b = p && batchesOf(p.id).find((x) => x.id === pre.batchId);
    return { ...base, supplierId: supplierOfBatch(db, pre.batchId), lines: p ? [lineFor(p, b, pre.reason ? { reason: pre.reason } : {})] : [] };
  });
  const [q, setQ] = useState('');
  const ql = q.trim().toLowerCase();
  const matches = ql ? products.filter((p) => p.stock > 0 && `${p.name} ${p.generic || ''} ${p.barcode || ''}`.toLowerCase().includes(ql)).slice(0, 8) : [];
  const setLine = (key, patch) => setF((x) => ({ ...x, lines: x.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)) }));
  const add = (p) => {
    const b = batchesOf(p.id).filter((x) => x.qty > 0)[0];
    setF((x) => ({ ...x, supplierId: x.supplierId || supplierOfBatch(db, b?.id), lines: [...x.lines, lineFor(p, b)] }));
    setQ('');
  };
  const total = f.lines.reduce((a, l) => a + (Number(l.qty) || 0) * (Number(l.credit) || 0), 0);
  const save = (e) => {
    e.preventDefault();
    const supplier = db.suppliers.find((s) => s.id === f.supplierId);
    if (!supplier) return toast('Choose the supplier the stock goes back to', 'warn');
    if (!f.lines.length) return toast('Add the medicines being returned', 'warn');
    for (const l of f.lines) {
      const b = batchesOf(l.productId).find((x) => x.id === l.batchId);
      if (!b) return toast(`${l.name}: choose the batch`, 'warn');
      if (!(Number(l.qty) > 0) || Number(l.qty) > b.qty) return toast(`${l.name}: return between 1 and ${b.qty} (in stock in batch ${b.batch})`, 'warn');
    }
    const items = f.lines.map((l) => { const b = batchesOf(l.productId).find((x) => x.id === l.batchId); return { productId: l.productId, name: l.name, batchId: b.legacy ? null : b.id, batch: b.batch, expiry: b.expiry || '', qty: Math.round(Number(l.qty)), credit: Number(l.credit) || 0, reason: l.reason }; });
    const rec = { id: uid(), number: docNumber('RT'), date: f.date || today(), supplierId: supplier.id, supplierName: supplier.name, creditNote: f.creditNote.trim(), settle: f.settle,
      ...(f.settle === 'cash' ? { bankId: f.bankId } : {}), note: f.note.trim(), items, total: items.reduce((a, i) => a + i.qty * i.credit, 0), branchId, by: user.name, at: now() };
    update((d) => {
      for (const i of items) move(d, { productId: i.productId, qty: -i.qty, type: 'Supplier return', ref: rec.number, note: i.reason, user: user.name, batchId: i.batchId, branchId });
      put(d, 'supplierReturns', rec);
      audit(d, user, 'Returned to supplier', `${rec.number} to ${supplier.name}: ${items.length} line${items.length > 1 ? 's' : ''}, ${fmt(rec.total)} (${f.settle === 'cash' ? 'refund' : 'credit note'})`, branchId);
    });
    toast(`Return ${rec.number} saved: stock taken out${f.settle === 'credit' ? `, ${fmt(rec.total)} off what you owe ${supplier.name}` : `, ${fmt(rec.total)} refunded`}`);
    onClose();
  };
  return (
    <Modal title={<><Undo2 size={18} /> Return stock to a supplier</>} onClose={onClose} wide>
      <form className="stack" onSubmit={save}>
        <div className="form-grid">
          <label className="field"><span>Supplier</span><select value={f.supplierId} onChange={(e) => setF({ ...f, supplierId: e.target.value })} required><option value="">—</option>{db.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
          <label className="field"><span>Date</span><input type="date" value={f.date} max={today()} onChange={(e) => setF({ ...f, date: e.target.value })} /></label>
          <label className="field"><span>Settled by</span><select value={f.settle} onChange={(e) => setF({ ...f, settle: e.target.value })}><option value="credit">Credit note (we owe them less)</option><option value="cash">Refund (money back)</option></select></label>
          {f.settle === 'credit'
            ? <label className="field"><span>Credit note no. (if you have it)</span><input value={f.creditNote} onChange={(e) => setF({ ...f, creditNote: e.target.value })} /></label>
            : <label className="field"><span>Refund received into</span><select value={f.bankId} onChange={(e) => setF({ ...f, bankId: e.target.value })}>{db.banks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>}
        </div>
        <div className="picker">
          <input className="search" placeholder="Search a medicine in stock to return…" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (matches[0]) add(matches[0]); } }} />
          {matches.length > 0 && <div className="picker-list">{matches.map((p) => <button type="button" key={p.id} onClick={() => add(p)}>{p.name} <small className="muted">{p.stock} in stock</small></button>)}</div>}
        </div>
        <div className="table-wrap">
          <table className="lines">
            <thead><tr><th>Medicine</th><th>Batch</th><th>Qty</th><th>Credit / unit</th><th>Reason</th><th className="num">Total</th><th /></tr></thead>
            <tbody>
              {f.lines.map((l) => {
                const bs = batchesOf(l.productId).filter((b) => b.qty > 0);
                return (
                  <tr key={l.key}>
                    <td><strong>{l.name}</strong></td>
                    <td><select value={l.batchId} onChange={(e) => { const b = bs.find((x) => x.id === e.target.value); setLine(l.key, { batchId: e.target.value, credit: b?.cost || l.credit, qty: Math.min(Number(l.qty) || 1, b?.qty || 1) }); }} aria-label="Batch">
                      {bs.map((b) => <option key={b.id} value={b.id}>{b.batch} · exp {b.expiry || '—'} · {b.qty} in stock</option>)}</select></td>
                    <td><input type="number" min="1" value={l.qty} onChange={(e) => setLine(l.key, { qty: e.target.value })} aria-label="Quantity returned" /></td>
                    <td><input type="number" min="0" step="any" value={l.credit} onChange={(e) => setLine(l.key, { credit: e.target.value })} aria-label="Credit per unit" /></td>
                    <td><select value={l.reason} onChange={(e) => setLine(l.key, { reason: e.target.value })} aria-label="Reason">{REASONS.map((r) => <option key={r}>{r}</option>)}</select></td>
                    <td className="num">{fmt((Number(l.qty) || 0) * (Number(l.credit) || 0))}</td>
                    <td><button type="button" className="icon-btn" aria-label="Remove line" onClick={() => setF((x) => ({ ...x, lines: x.lines.filter((y) => y.key !== l.key) }))}><X size={15} /></button></td>
                  </tr>
                );
              })}
              {!f.lines.length && <Empty colSpan={7}>Search above to add the medicines going back</Empty>}
            </tbody>
          </table>
        </div>
        <label className="field"><span>Note (optional)</span><input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="e.g. collected by the supplier's rep" /></label>
        <div className="form-actions">
          <strong className="grow">Total {fmt(total)}</strong>
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary"><Undo2 size={16} />Save return</button>
        </div>
      </form>
    </Modal>
  );
}

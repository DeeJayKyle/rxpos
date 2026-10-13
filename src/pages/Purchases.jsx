import { useState } from 'react';
import { useStore, uid, today, put, move, downloadFile, toCSV } from '../store.jsx';
import { CASH } from '../finance.js';
import { Modal } from '../ui.jsx';
import { toast } from '../feedback.jsx';

/** Receive stock from a supplier: logs stock-in movements and updates cost/prices/batch/expiry. */
export function AddStock() {
  const { db, products, update, fmt, user } = useStore();
  const blankLine = () => ({ key: uid(), productId: '', qty: 1, cost: 0, price: '', batch: '', expiry: '' });
  const blank = () => ({ supplierId: '', invoice: '', date: today(), paid: '', bankId: CASH, lines: [blankLine()] });
  const [form, setForm] = useState(blank);
  const [q, setQ] = useState('');
  const [saved, setSaved] = useState(null);

  const setLine = (key, patch) => setForm((f) => ({ ...f, lines: f.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)) }));
  const total = form.lines.reduce((a, l) => a + Number(l.qty) * Number(l.cost), 0);
  const matches = q ? products.filter((p) => [p.name, p.generic, p.barcode].join(' ').toLowerCase().includes(q.toLowerCase())).slice(0, 8) : [];

  const pick = (p) => {
    const empty = form.lines.find((l) => !l.productId);
    const line = { productId: p.id, cost: p.cost || 0, price: p.price || '', batch: '', expiry: '' };
    if (empty) setLine(empty.key, line);
    else setForm((f) => ({ ...f, lines: [...f.lines, { ...blankLine(), ...line }] }));
    setQ('');
  };

  const save = (e) => {
    e.preventDefault();
    const lines = form.lines.filter((l) => l.productId && Number(l.qty) > 0);
    if (!lines.length) return toast('Add at least one medicine', 'warn');
    const supplier = db.suppliers.find((s) => s.id === form.supplierId);
    const paid = form.paid === '' ? total : Math.min(Number(form.paid), total);
    const purchase = {
      id: uid(), number: 'GRN' + Date.now().toString(36).toUpperCase().slice(-6), supplierId: form.supplierId, supplierName: supplier?.name || '—',
      invoice: form.invoice, date: form.date, receivedBy: user.name, total, paid, bankId: form.bankId,
      items: lines.map((l) => ({ productId: l.productId, name: products.find((p) => p.id === l.productId)?.name, qty: Number(l.qty), cost: Number(l.cost), batch: l.batch, expiry: l.expiry })),
    };
    update((d) => {
      put(d, 'purchases', purchase);
      lines.forEach((l) => {
        const p = d.products.find((x) => x.id === l.productId);
        if (!p) return;
        move(d, { productId: p.id, qty: Number(l.qty), type: 'Purchase', ref: purchase.invoice || purchase.number, user: user.name });
        put(d, 'products', {
          ...p, cost: Number(l.cost) || p.cost, price: Number(l.price) || p.price,
          batch: l.batch || p.batch, expiry: l.expiry || p.expiry,
        });
      });
    });
    setSaved(purchase);
    setForm(blank());
  };

  return (
    <div className="page">
      <div className="page-head"><h1>Add Stock</h1></div>
      {saved && <div className="notice">Received {saved.items.length} item(s) worth {fmt(saved.total)} from {saved.supplierName}. {saved.paid < saved.total && `${fmt(saved.total - saved.paid)} added to creditors.`}</div>}
      <form className="card" onSubmit={save}>
        <div className="form-grid">
          <label className="field"><span>Supplier</span>
            <select value={form.supplierId} onChange={(e) => setForm({ ...form, supplierId: e.target.value })} required>
              <option value="">—</option>
              {db.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label className="field"><span>Invoice no.</span><input value={form.invoice} onChange={(e) => setForm({ ...form, invoice: e.target.value })} /></label>
          <label className="field"><span>Date</span><input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></label>
        </div>
        <div className="picker">
          <input className="search big" placeholder="Search medicine to add…" value={q} onChange={(e) => setQ(e.target.value)} />
          {matches.length > 0 && <div className="picker-list">{matches.map((p) => <button type="button" key={p.id} onClick={() => pick(p)}>{p.name} <small className="muted">{p.stock} in stock · cost {fmt(p.cost)}</small></button>)}</div>}
        </div>
        <div className="table-wrap">
          <table className="lines">
            <thead><tr><th>Medicine</th><th>Qty</th><th>Unit cost</th><th>New retail price</th><th>Batch</th><th>Expiry</th><th className="num">Line total</th><th /></tr></thead>
            <tbody>
              {form.lines.map((l) => (
                <tr key={l.key}>
                  <td>
                    <select value={l.productId} onChange={(e) => {
                      const p = products.find((x) => x.id === e.target.value);
                      setLine(l.key, { productId: e.target.value, cost: p?.cost || 0, price: p?.price || '' });
                    }}>
                      <option value="">Select medicine…</option>
                      {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </td>
                  <td><input type="number" min="1" value={l.qty} onChange={(e) => setLine(l.key, { qty: e.target.value })} /></td>
                  <td><input type="number" step="any" value={l.cost} onChange={(e) => setLine(l.key, { cost: e.target.value })} /></td>
                  <td><input type="number" step="any" value={l.price} onChange={(e) => setLine(l.key, { price: e.target.value })} /></td>
                  <td><input value={l.batch} onChange={(e) => setLine(l.key, { batch: e.target.value })} /></td>
                  <td><input type="date" value={l.expiry} onChange={(e) => setLine(l.key, { expiry: e.target.value })} /></td>
                  <td className="num">{fmt(Number(l.qty) * Number(l.cost))}</td>
                  <td><button type="button" className="icon-btn" onClick={() => setForm({ ...form, lines: form.lines.filter((x) => x.key !== l.key) })}>×</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button type="button" className="btn sm ghost" onClick={() => setForm({ ...form, lines: [...form.lines, blankLine()] })}>+ Add line</button>
        <div className="form-grid" style={{ marginTop: 16 }}>
          <label className="field"><span>Amount paid now (blank = paid in full)</span><input type="number" step="any" value={form.paid} onChange={(e) => setForm({ ...form, paid: e.target.value })} /></label>
          <label className="field"><span>Paid from</span>
            <select value={form.bankId} onChange={(e) => setForm({ ...form, bankId: e.target.value })}>{db.banks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
          </label>
        </div>
        <div className="form-actions">
          <strong className="grow">Total: {fmt(total)}</strong>
          <button className="btn primary">Receive stock</button>
        </div>
      </form>
    </div>
  );
}

export default function Purchases() {
  const { db, fmt } = useStore();
  const [view, setView] = useState(null);
  const [q, setQ] = useState('');
  const rows = db.purchases.filter((p) => !q || [p.supplierName, p.invoice, p.number].join(' ').toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="page">
      <div className="page-head">
        <h1>Purchase History</h1>
        <div className="row gap">
          <input className="search" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="btn ghost" onClick={() => downloadFile('purchases.csv', toCSV(rows.map((p) => ({ date: p.date, number: p.number, supplier: p.supplierName, invoice: p.invoice, items: p.items.length, total: p.total, paid: p.paid ?? p.total, receivedBy: p.receivedBy }))), 'text/csv')}>Export CSV</button>
        </div>
      </div>
      <div className="card table-wrap">
        <table>
          <thead><tr><th>Date</th><th>GRN</th><th>Supplier</th><th>Invoice</th><th>Items</th><th>Received by</th><th className="num">Total</th><th className="num">Unpaid</th><th /></tr></thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id}>
                <td>{p.date}</td><td>{p.number}</td><td>{p.supplierName}</td><td>{p.invoice}</td><td>{p.items.length}</td><td>{p.receivedBy}</td>
                <td className="num">{fmt(p.total)}</td><td className="num">{p.total - (p.paid ?? p.total) > 0 ? <span className="text-warn">{fmt(p.total - p.paid)}</span> : '—'}</td>
                <td className="actions"><button className="btn sm ghost" onClick={() => setView(p)}>View</button></td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={9} className="empty">No purchases recorded</td></tr>}
          </tbody>
        </table>
      </div>
      {view && (
        <Modal title={`Purchase ${view.number || ''}`} onClose={() => setView(null)} wide>
          <p className="muted">{view.supplierName} · invoice {view.invoice || '—'} · {view.date}</p>
          <table>
            <thead><tr><th>Medicine</th><th>Batch</th><th>Expiry</th><th className="num">Qty</th><th className="num">Cost</th><th className="num">Total</th></tr></thead>
            <tbody>{view.items.map((i, n) => <tr key={n}><td>{i.name}</td><td>{i.batch}</td><td>{i.expiry}</td><td className="num">{i.qty}</td><td className="num">{fmt(i.cost)}</td><td className="num">{fmt(i.qty * i.cost)}</td></tr>)}</tbody>
          </table>
        </Modal>
      )}
    </div>
  );
}

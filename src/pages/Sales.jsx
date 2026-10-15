import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Download, Printer, Undo2, Eye, Pencil, Trash2, Plus } from 'lucide-react';
import { useStore, downloadFile, toCSV, put, move, now, audit, allocate, MAIN_BRANCH, DEFAULT_PAYMENT_METHODS } from '../store.jsx';
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
        {db.license?.[0]?.branding?.logo && <img className="receipt-logo" src={db.license[0].branding.logo} alt="" />}
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
  const { db, update, fmt, user, branchId, can } = useStore();
  const location = useLocation();
  const [q, setQ] = useState(location.state?.q || '');
  const [from, setFrom] = useState(location.state?.from || '');
  const [to, setTo] = useState(location.state?.to || '');
  const [editing, setEditing] = useState(null);
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
                <td className="actions"><button className="btn sm ghost" onClick={() => setView(s)}><Eye size={14} />View</button>{s.status !== 'refunded' && !s.imported && can('sales.edit') && <button className="btn sm ghost" onClick={() => setEditing(s)}><Pencil size={14} />Edit</button>}{s.editedAt && <small className="muted" title={`Edited by ${s.editedBy} ${new Date(s.editedAt).toLocaleString()}`}> · edited</small>}</td>
              </tr>
            ))}
            {!rows.length && <Empty colSpan={9}>No sales found</Empty>}
          </tbody>
        </table>
      </div>
      {editing && <SaleEditor sale={editing} onClose={() => setEditing(null)} />}
      {view && (
        <Modal title={`Receipt ${view.number}`} onClose={() => setView(null)}>
          <Receipt sale={view} />
          <div className="form-actions no-print">
            {view.status !== 'refunded' && !view.imported && can('sales.edit') && <button className="btn ghost" onClick={() => { setEditing(view); setView(null); }}><Pencil size={16} />Edit sale</button>}
            {view.imported && <small className="muted">Copied from {view.imported} — view only</small>}
            {view.status !== 'refunded' && !view.imported && user.role !== 'cashier' && <button className="btn danger" onClick={() => refund(view)}><Undo2 size={16} />Refund</button>}
            <button className="btn primary" onClick={() => window.print()}><Printer size={16} />Print</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/** Admin, manager or pharmacist: correct a past sale. Stock is returned to / taken from the right batches. */
function SaleEditor({ sale, onClose }) {
  const { db, products, fmt, update, user, batchesOf } = useStore();
  const methods = db.settings.paymentMethods?.length ? db.settings.paymentMethods : DEFAULT_PAYMENT_METHODS;
  const rate = sale.tax > 0 && sale.subtotal - (sale.discount || 0) > 0 ? sale.tax / (sale.subtotal - (sale.discount || 0)) : 0;
  const [f, setF] = useState(() => ({ customerId: sale.customerId || 'walk-in', payment: sale.payment, discount: sale.discount || 0, paid: sale.paid ?? sale.total, reason: '', items: sale.items.map((i) => ({ ...i })) }));
  const [q, setQ] = useState('');
  const br = sale.branchId || MAIN_BRANCH;
  const subtotal = f.items.reduce((a, i) => a + Number(i.qty || 0) * Number(i.price || 0), 0);
  const disc = Math.min(Number(f.discount) || 0, subtotal);
  const tax = (subtotal - disc) * rate;
  const total = subtotal - disc + tax;
  const ptype = methods.find((m) => m.name === f.payment)?.type || (f.payment === 'Credit' ? 'credit' : 'cash');
  const setItem = (k, patch) => setF((x) => ({ ...x, items: x.items.map((i, n) => (n === k ? { ...i, ...patch } : i)) }));
  const matches = q.trim() ? products.filter((p) => p.stock > 0 && `${p.name} ${p.generic} ${p.barcode}`.toLowerCase().includes(q.toLowerCase()) && !f.items.some((i) => i.id === p.id)).slice(0, 8) : [];
  const save = (e) => {
    e.preventDefault();
    if (!f.items.some((i) => Number(i.qty) > 0)) return toast('A sale needs at least one item. To cancel the whole sale, refund it.', 'warn');
    if (!f.reason.trim()) return toast('Say why the sale is being changed', 'warn');
    for (const i of f.items) {
      const o = sale.items.find((x) => x.id === i.id);
      const extra = Number(i.qty) - (o?.qty || 0);
      const have = batchesOf(i.id, br).reduce((a, b) => a + Math.max(b.qty, 0), 0);
      if (extra > have) return toast(`Only ${have} more ${i.name} in stock`, 'error');
    }
    const customer = db.customers.find((c) => c.id === f.customerId);
    update((d) => {
      const old = new Map(sale.items.map((i) => [i.id, i]));
      const items = [];
      for (const it of f.items) {
        const o = old.get(it.id);
        const q0 = o?.qty || 0, q1 = Math.max(0, Math.round(Number(it.qty) || 0));
        let alloc = (o?.alloc || []).map((a) => ({ ...a }));
        if (q1 > q0) {
          for (const a of allocate(batchesOf(it.id, br), q1 - q0)) {
            move(d, { productId: it.id, qty: -a.qty, type: 'Sale edit', ref: sale.number, user: user.name, batchId: a.batchId, branchId: br });
            const same = alloc.find((x) => x.batchId === a.batchId);
            if (same) same.qty += a.qty; else alloc.push({ batchId: a.batchId, qty: a.qty, batch: a.batch, expiry: a.expiry });
          }
        } else if (q1 < q0) {
          let back = q0 - q1;
          if (!alloc.length) { move(d, { productId: it.id, qty: back, type: 'Sale edit', ref: sale.number, user: user.name, batchId: null, branchId: br }); back = 0; }
          for (const a of [...alloc].reverse()) {
            if (back <= 0) break;
            const take = Math.min(a.qty, back);
            move(d, { productId: it.id, qty: take, type: 'Sale edit', ref: sale.number, user: user.name, batchId: a.batchId, branchId: br });
            a.qty -= take; back -= take;
          }
          alloc = alloc.filter((a) => a.qty > 0);
        }
        if (q1 > 0) items.push({ ...it, qty: q1, price: Number(it.price) || 0, alloc });
        old.delete(it.id);
      }
      for (const o of old.values()) { // removed lines: everything back to stock
        const parts = o.alloc?.length ? o.alloc : [{ batchId: null, qty: o.qty }];
        for (const a of parts) move(d, { productId: o.id, qty: a.qty, type: 'Sale edit', ref: sale.number, user: user.name, batchId: a.batchId, branchId: br });
      }
      const paid = ptype === 'credit' ? Math.min(Number(f.paid) || 0, total) : total;
      put(d, 'sales', { ...sale, items, subtotal, discount: disc, tax, total, payment: f.payment, paid, tendered: ptype === 'cash' ? Math.max(sale.tendered || 0, total) : paid,
        customerId: f.customerId, customerName: customer?.name || 'Walk-in Customer', editedBy: user.name, editedAt: now(),
        edits: [...(sale.edits || []), { at: now(), by: user.name, reason: f.reason.trim(), before: { total: sale.total, items: sale.items.map((i) => `${i.qty}× ${i.name} @ ${i.price}`).join(', ') } }] });
      audit(d, user, 'Sale edited', `${sale.number}: ${fmt(sale.total)} → ${fmt(total)} (${f.reason.trim()})`, br);
    });
    toast(`${sale.number} updated; stock adjusted`);
    onClose();
  };
  return (
    <Modal title={`Edit sale ${sale.number}`} onClose={onClose} wide>
      <form onSubmit={save} className="stack">
        <div className="form-grid">
          <label className="field"><span>Customer</span><select value={f.customerId} onChange={(e) => setF({ ...f, customerId: e.target.value })}>{db.customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <label className="field"><span>Payment</span><select value={f.payment} onChange={(e) => setF({ ...f, payment: e.target.value })}>{[...new Set([...methods.map((m) => m.name), sale.payment])].map((m) => <option key={m}>{m}</option>)}</select></label>
        </div>
        <table className="lines">
          <thead><tr><th>Medicine</th><th>Qty</th><th>Unit price</th><th className="num">Line total</th><th /></tr></thead>
          <tbody>
            {f.items.map((i, k) => (
              <tr key={i.id}>
                <td>{i.name}</td>
                <td><input type="number" min="0" value={i.qty} onChange={(e) => setItem(k, { qty: e.target.value })} /></td>
                <td><input type="number" min="0" step="any" value={i.price} onChange={(e) => setItem(k, { price: e.target.value })} /></td>
                <td className="num">{fmt(Number(i.qty || 0) * Number(i.price || 0))}</td>
                <td><button type="button" className="icon-btn" title="Remove" onClick={() => setF({ ...f, items: f.items.filter((_, n) => n !== k) })}><Trash2 size={15} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="picker">
          <SearchBox value={q} onChange={setQ} placeholder="Add a medicine to this sale…" />
          {matches.length > 0 && <div className="picker-list">{matches.map((p) => <button type="button" key={p.id} onClick={() => { setF({ ...f, items: [...f.items, { id: p.id, name: p.name, price: p.price, cost: p.cost, qty: 1, alloc: [] }] }); setQ(''); }}><Plus size={13} /> {p.name} <small className="muted">{p.stock} in stock · {fmt(p.price)}</small></button>)}</div>}
        </div>
        <div className="form-grid">
          <label className="field"><span>Discount</span><input type="number" min="0" step="any" value={f.discount} onChange={(e) => setF({ ...f, discount: e.target.value })} /></label>
          {ptype === 'credit' && <label className="field"><span>Amount paid (rest on credit)</span><input type="number" min="0" step="any" value={f.paid} onChange={(e) => setF({ ...f, paid: e.target.value })} /></label>}
          <label className="field full"><span>Reason for the change (kept in the audit log)</span><input required value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} placeholder="e.g. wrong quantity entered, price correction" /></label>
        </div>
        <div className="totals"><div className="row between"><span className="muted">Was</span><span className="num">{fmt(sale.total)}</span></div><div className="row between grand"><span>New total</span><span className="num">{fmt(total)}</span></div></div>
        {sale.edits?.length > 0 && <details className="muted small"><summary>Earlier changes ({sale.edits.length})</summary>{sale.edits.map((x, n) => <p key={n}>{new Date(x.at).toLocaleString()} · {x.by}: {x.reason} (was {fmt(x.before.total)})</p>)}</details>}
        <div className="form-actions"><button type="button" className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary">Save changes</button></div>
      </form>
    </Modal>
  );
}

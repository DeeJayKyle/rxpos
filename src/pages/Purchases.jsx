import { useState, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { Pencil, Trash2, ScanText, Camera, FileUp, Loader2, AlertTriangle, CheckCircle2, X } from 'lucide-react';
import { useStore, uid, today, now, put, move, addBatch, audit, downloadFile, toCSV, MAIN_BRANCH } from '../store.jsx';
import { CASH } from '../finance.js';
import { Modal, PdfButton } from '../ui.jsx';
import { toast } from '../feedback.jsx';
import { invoicePages, readInvoice, matchProduct, matchSupplier, normDate } from '../invoiceScan.js';

/** Receive stock from a supplier: every line becomes a batch (number + expiry) at this branch. */
export function AddStock() {
  const { db, products, update, fmt, user, branchId, syncCfg } = useStore();
  const location = useLocation();
  const blankLine = () => ({ key: uid(), productId: '', qty: 1, cost: 0, price: '', batch: '', expiry: '' });
  const [scanOpen, setScanOpen] = useState(false);
  const [scanned, setScanned] = useState(null); // { pages, supplier, invoiceNo, total } after an invoice was read
  const [checked, setChecked] = useState(false); // the person confirms they checked the scanned lines
  // Put what was read off the invoice on the panel: nothing is saved until "Receive stock"
  const applyScan = (r, pages) => {
    const sup = matchSupplier(r.supplier, db.suppliers);
    const lines = r.items.map((it) => {
      const p = matchProduct(it.name, products);
      const qty = it.qty || 1;
      const cost = it.unitCost || (it.lineTotal && qty ? Math.round((it.lineTotal / qty) * 100) / 100 : 0);
      return { ...blankLine(), productId: p?.id || '', qty, cost, price: p?.price || '', batch: it.batch || '', expiry: normDate(it.expiry), read: { name: it.name, unclear: it.unclear, matched: !!p } };
    });
    setForm((f) => {
      const keep = f.lines.filter((l) => l.productId);
      return { ...f, supplierId: sup?.id || f.supplierId, invoice: r.invoiceNo || f.invoice, date: normDate(r.date, { endOfMonth: false }) || f.date, lines: keep.length || lines.length ? [...keep, ...lines] : [blankLine()] };
    });
    setScanned({ pages, supplier: r.supplier, supplierMatched: !!sup, invoiceNo: r.invoiceNo, total: r.total, lines: lines.length, unmatched: lines.filter((l) => !l.productId).length, unclear: lines.filter((l) => l.read.unclear).length });
    setChecked(false);
    setScanOpen(false);
  };
  const addScannedSupplier = () => {
    const id = uid();
    update((d) => { put(d, 'suppliers', { id, name: scanned.supplier, contact: '', phone: '', email: '', address: '' }); });
    setForm((f) => ({ ...f, supplierId: id }));
    setScanned((s) => ({ ...s, supplierMatched: true }));
    toast(`Supplier ${scanned.supplier} added`);
  };
  const blank = () => ({ supplierId: '', invoice: '', date: today(), paid: '', bankId: CASH, lines: [blankLine()] });
  // Pre-filled from a purchase order (Reorder → Receive)
  const [form, setForm] = useState(() => {
    const po = location.state?.po;
    if (!po) return blank();
    return { ...blank(), supplierId: po.supplierId || '', poId: po.id, lines: po.items.map((i) => ({ ...blankLine(), productId: i.productId, qty: i.qty, cost: i.cost || 0, price: products.find((p) => p.id === i.productId)?.price || '' })) };
  });
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
    const unpicked = form.lines.filter((l) => l.read && !l.productId && Number(l.qty) > 0);
    if (unpicked.length) return toast(`Choose the medicine for ${unpicked.length} line${unpicked.length > 1 ? 's' : ''} read from the invoice (or remove ${unpicked.length > 1 ? 'them' : 'it'})`, 'warn');
    if (scanned && !checked) return toast('Tick "I have checked every line against the invoice" before saving', 'warn');
    // lines read off the invoice that are new to this pharmacy become new medicines
    const fresh = new Map();
    for (const l of form.lines) if (l.productId === '__new__') fresh.set(l.key, uid());
    const lines = form.lines.map((l) => (l.productId === '__new__' ? { ...l, productId: fresh.get(l.key), newName: l.read?.name } : l)).filter((l) => l.productId && Number(l.qty) > 0);
    if (!lines.length) return toast('Add at least one medicine', 'warn');
    if (lines.some((l) => !l.expiry)) return toast('Enter the expiry date for every line (needed for first-expiry-first-out)', 'warn');
    const supplier = db.suppliers.find((s) => s.id === form.supplierId);
    const paid = form.paid === '' ? total : Math.min(Number(form.paid), total);
    const purchase = {
      id: uid(), number: 'GRN' + Date.now().toString(36).toUpperCase().slice(-6), supplierId: form.supplierId, supplierName: supplier?.name || '—',
      invoice: form.invoice, date: form.date, receivedBy: user.name, total, paid, bankId: form.bankId, branchId,
      items: lines.map((l) => ({ productId: l.productId, name: l.newName || products.find((p) => p.id === l.productId)?.name, qty: Number(l.qty), cost: Number(l.cost), batch: l.batch, expiry: l.expiry })),
      ...(scanned ? { scanned: true } : {}),
    };
    update((d) => {
      for (const l of lines) if (l.newName && !d.products.some((x) => x.id === l.productId)) put(d, 'products', { id: l.productId, name: l.newName, generic: '', form: 'Others', unit: 'Unit', price: Number(l.price) || 0, wholesale: Number(l.price) || 0, cost: Number(l.cost) || 0, reorder: 0 });
      lines.forEach((l, n) => {
        const p = d.products.find((x) => x.id === l.productId);
        if (!p) return;
        const b = addBatch(d, { productId: p.id, batch: l.batch, expiry: l.expiry, cost: l.cost });
        purchase.items[n].batchId = b.id;
        move(d, { productId: p.id, qty: Number(l.qty), type: 'Purchase', ref: purchase.invoice || purchase.number, user: user.name, batchId: b.id, branchId });
        const price = Number(l.price) || p.price;
        if (Number(l.cost) !== p.cost || price !== p.price) {
          put(d, 'products', { ...p, cost: Number(l.cost) || p.cost, price });
          if (price !== p.price) audit(d, user, 'Price changed', `${p.name}: ${fmt(p.price)} → ${fmt(price)} (on receiving)`, branchId);
        }
      });
      if (form.poId) {
        const po = d.purchaseOrders.find((x) => x.id === form.poId);
        if (po) put(d, 'purchaseOrders', { ...po, status: 'Received', receivedAt: today(), purchaseId: purchase.id });
      }
      put(d, 'purchases', purchase);
      audit(d, user, 'Stock received', `${purchase.number} from ${purchase.supplierName}: ${lines.length} lines, ${fmt(total)}${scanned ? ' (scanned invoice, checked by ' + user.name + ')' : ''}${fresh.size ? `, ${fresh.size} new medicine${fresh.size > 1 ? 's' : ''}` : ''}`, branchId);
    });
    setSaved(purchase);
    setForm(blank());
    setScanned(null); setChecked(false);
  };

  return (
    <div className="page">
      <div className="page-head"><h1>Add Stock</h1><button type="button" className="btn ghost" onClick={() => setScanOpen(true)}><ScanText size={16} />Scan invoice</button></div>
      {scanOpen && <InvoiceScanner cfg={syncCfg} onClose={() => setScanOpen(false)} onRead={applyScan} />}
      {scanned && (
        <div className="notice scan-notice">
          <div className="row between gap wrap">
            <strong><ScanText size={15} /> Filled from a scanned invoice{scanned.invoiceNo ? ` (no. ${scanned.invoiceNo})` : ''}: check every line before saving</strong>
            <button type="button" className="link-btn small" onClick={() => { setScanned(null); setChecked(false); setForm(blank()); }}>Discard</button>
          </div>
          <div className="small">
            {scanned.lines} line{scanned.lines === 1 ? '' : 's'} read{scanned.total ? ` · invoice total ${fmt(scanned.total)} (here ${fmt(total)})` : ''}
            {scanned.unmatched > 0 && <span className="text-warn"> · {scanned.unmatched} not matched to a medicine: choose one or add it as new</span>}
            {scanned.unclear > 0 && <span className="text-warn"> · {scanned.unclear} hard to read</span>}
          </div>
          {scanned.supplier && !scanned.supplierMatched && <div className="small">Supplier on the invoice: <strong>{scanned.supplier}</strong> (not in your list) <button type="button" className="btn sm ghost" onClick={addScannedSupplier}>Add this supplier</button></div>}
          <div className="scan-thumbs">{scanned.pages.map((src, n) => <a key={n} href={src} target="_blank" rel="noreferrer" title={`Page ${n + 1}: open to compare`}><img src={src} alt={`Invoice page ${n + 1}`} /></a>)}</div>
        </div>
      )}
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
                  <td className={l.read && (!l.productId || l.read.unclear) ? 'scan-check' : ''}>
                    <select value={l.productId} onChange={(e) => {
                      const p = products.find((x) => x.id === e.target.value);
                      setLine(l.key, p ? { productId: e.target.value, cost: l.read ? l.cost : p.cost || 0, price: p.price || '' } : { productId: e.target.value });
                    }}>
                      <option value="">Select medicine…</option>
                      {l.read && <option value="__new__">➕ Add as new medicine: {l.read.name}</option>}
                      {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    {l.read && <small className={'scan-read' + (!l.productId || l.read.unclear ? ' text-warn' : ' muted')}>{!l.productId ? <AlertTriangle size={11} /> : l.read.unclear ? <AlertTriangle size={11} /> : <CheckCircle2 size={11} />} Invoice: {l.read.name}{l.read.unclear ? ' (hard to read)' : ''}</small>}
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
        {scanned && <label className="field check scan-confirm"><input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} /><span>I have checked every line against the invoice (medicine, quantity, cost, batch and expiry)</span></label>}
        <div className="form-actions">
          <strong className="grow">Total: {fmt(total)}</strong>
          <button className="btn primary" disabled={!!scanned && !checked}>Receive stock</button>
        </div>
      </form>
    </div>
  );
}

export default function Purchases() {
  const { db, fmt, can } = useStore();
  const [view, setView] = useState(null);
  const [editing, setEditing] = useState(null);
  const [q, setQ] = useState('');
  const rows = db.purchases.filter((p) => !q || [p.supplierName, p.invoice, p.number].join(' ').toLowerCase().includes(q.toLowerCase()));
  const histRef = useRef(null);
  return (
    <div className="page">
      <div className="page-head">
        <h1>Purchase History</h1>
        <div className="row gap">
          <PdfButton target={histRef} title="Purchase history" subtitle={`${rows.length} deliveries · ${fmt(rows.reduce((a, p) => a + (p.total || 0), 0))}`} />
          <input className="search" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="btn ghost" onClick={() => downloadFile('purchases.csv', toCSV(rows.map((p) => ({ date: p.date, number: p.number, supplier: p.supplierName, invoice: p.invoice, items: p.items.length, total: p.total, paid: p.paid ?? p.total, receivedBy: p.receivedBy }))), 'text/csv')}>Export CSV</button>
        </div>
      </div>
      <div className="card table-wrap" ref={histRef}>
        <table>
          <thead><tr><th>Date</th><th>GRN</th><th>Supplier</th><th>Invoice</th><th>Items</th><th>Received by</th><th className="num">Total</th><th className="num">Unpaid</th><th /></tr></thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id}>
                <td>{p.date}</td><td>{p.number}</td><td>{p.supplierName}</td><td>{p.invoice}</td><td>{p.items.length}</td><td>{p.receivedBy}</td>
                <td className="num">{fmt(p.total)}</td><td className="num">{p.total - (p.paid ?? p.total) > 0 ? <span className="text-warn">{fmt(p.total - p.paid)}</span> : '—'}</td>
                <td className="actions"><button className="btn sm ghost" onClick={() => setView(p)}>View</button>{can('purchases.edit') && !p.imported && <button className="btn sm ghost" onClick={() => setEditing(p)}><Pencil size={14} />Edit</button>}{p.editedAt && <small className="muted"> · edited</small>}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={9} className="empty">No purchases recorded</td></tr>}
          </tbody>
        </table>
      </div>
      {editing && <PurchaseEditor purchase={editing} onClose={() => setEditing(null)} />}
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

/** Admin, manager or pharmacist: correct a past delivery. Quantity changes adjust that batch's stock; a corrected
 *  batch number or expiry moves the stock to the right batch. */
function PurchaseEditor({ purchase, onClose }) {
  const { db, fmt, update, user, batchesOf } = useStore();
  const br = purchase.branchId || MAIN_BRANCH;
  const [f, setF] = useState(() => ({ supplierId: purchase.supplierId || '', invoice: purchase.invoice || '', date: purchase.date, paid: purchase.paid ?? purchase.total, reason: '', items: purchase.items.map((i) => ({ ...i })) }));
  const total = f.items.reduce((a, i) => a + Number(i.qty || 0) * Number(i.cost || 0), 0);
  const setItem = (k, patch) => setF((x) => ({ ...x, items: x.items.map((i, n) => (n === k ? { ...i, ...patch } : i)) }));
  const findBatch = (d, i) => (i.batchId && d.batches.find((b) => b.id === i.batchId)) || d.batches.find((b) => b.productId === i.productId && b.batch === String(i.batch || '').trim() && (b.expiry || '') === (i.expiry || ''));
  const save = (e) => {
    e.preventDefault();
    if (!f.reason.trim()) return toast('Say why the delivery is being changed', 'warn');
    // can't take back more than is still in that batch
    for (const [n, o] of purchase.items.entries()) {
      const i = f.items[n];
      const less = o.qty - (i ? Number(i.qty) || 0 : 0);
      const moved = i && (i.batch !== o.batch || i.expiry !== o.expiry);
      const b = findBatch(db, o);
      const have = b ? (batchesOf(o.productId, br).find((x) => x.id === b.id)?.qty || 0) : 0;
      const need = moved ? o.qty : less;
      if (need > 0 && need > have) return toast(`${o.name}: only ${have} of batch ${o.batch} left (some was already sold). Reduce by at most ${have}.`, 'error');
    }
    const supplier = db.suppliers.find((x) => x.id === f.supplierId);
    update((d) => {
      const items = [];
      purchase.items.forEach((o, n) => {
        const i = f.items[n];
        const old = findBatch(d, o);
        if (!i) { if (old) move(d, { productId: o.productId, qty: -o.qty, type: 'Purchase edit', ref: purchase.number, user: user.name, batchId: old.id, branchId: br }); return; }
        const qty = Math.max(0, Math.round(Number(i.qty) || 0)), cost = Number(i.cost) || 0;
        let batchId = old?.id;
        if ((i.batch !== o.batch || i.expiry !== o.expiry) && old) {
          move(d, { productId: o.productId, qty: -o.qty, type: 'Purchase edit', ref: purchase.number, note: 'batch corrected', user: user.name, batchId: old.id, branchId: br });
          batchId = addBatch(d, { productId: o.productId, batch: i.batch, expiry: i.expiry, cost }).id;
          if (qty) move(d, { productId: o.productId, qty, type: 'Purchase edit', ref: purchase.number, note: 'batch corrected', user: user.name, batchId, branchId: br });
        } else if (qty !== o.qty) {
          if (!old) batchId = addBatch(d, { productId: o.productId, batch: i.batch, expiry: i.expiry, cost }).id;
          move(d, { productId: o.productId, qty: qty - o.qty, type: 'Purchase edit', ref: purchase.number, user: user.name, batchId, branchId: br });
        }
        if (batchId && cost !== o.cost) { const b = d.batches.find((x) => x.id === batchId); if (b) put(d, 'batches', { ...b, cost }); }
        if (qty > 0) items.push({ ...i, qty, cost, batchId });
      });
      const newTotal = items.reduce((a, i) => a + i.qty * i.cost, 0);
      put(d, 'purchases', { ...purchase, supplierId: f.supplierId, supplierName: supplier?.name || purchase.supplierName, invoice: f.invoice, date: f.date, items, total: newTotal,
        paid: Math.min(Number(f.paid) || 0, newTotal), editedBy: user.name, editedAt: now(),
        edits: [...(purchase.edits || []), { at: now(), by: user.name, reason: f.reason.trim(), before: { total: purchase.total } }] });
      audit(d, user, 'Purchase edited', `${purchase.number}: ${fmt(purchase.total)} → ${fmt(newTotal)} (${f.reason.trim()})`, br);
    });
    toast(`${purchase.number} updated; stock adjusted`);
    onClose();
  };
  return (
    <Modal title={`Edit purchase ${purchase.number}`} onClose={onClose} wide>
      <form onSubmit={save} className="stack">
        <div className="form-grid">
          <label className="field"><span>Supplier</span><select value={f.supplierId} onChange={(e) => setF({ ...f, supplierId: e.target.value })}><option value="">—</option>{db.suppliers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
          <label className="field"><span>Invoice no.</span><input value={f.invoice} onChange={(e) => setF({ ...f, invoice: e.target.value })} /></label>
          <label className="field"><span>Date</span><input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></label>
          <label className="field"><span>Amount paid</span><input type="number" min="0" step="any" value={f.paid} onChange={(e) => setF({ ...f, paid: e.target.value })} /></label>
        </div>
        <table className="lines">
          <thead><tr><th>Medicine</th><th>Batch</th><th>Expiry</th><th>Qty</th><th>Cost</th><th className="num">Total</th><th /></tr></thead>
          <tbody>
            {f.items.map((i, k) => (
              <tr key={k}>
                <td>{i.name}</td>
                <td><input value={i.batch || ''} onChange={(e) => setItem(k, { batch: e.target.value })} /></td>
                <td><input type="date" value={i.expiry || ''} onChange={(e) => setItem(k, { expiry: e.target.value })} /></td>
                <td><input type="number" min="0" value={i.qty} onChange={(e) => setItem(k, { qty: e.target.value })} /></td>
                <td><input type="number" min="0" step="any" value={i.cost} onChange={(e) => setItem(k, { cost: e.target.value })} /></td>
                <td className="num">{fmt(Number(i.qty || 0) * Number(i.cost || 0))}</td>
                <td><button type="button" className="icon-btn" title="Remove line" onClick={() => setItem(k, { qty: 0 })}><Trash2 size={15} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <label className="field"><span>Reason for the change (kept in the audit log)</span><input required value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} placeholder="e.g. invoice quantity was 50 not 60" /></label>
        <div className="totals"><div className="row between"><span className="muted">Was</span><span className="num">{fmt(purchase.total)}</span></div><div className="row between grand"><span>New total</span><span className="num">{fmt(total)}</span></div></div>
        <div className="form-actions"><button type="button" className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary">Save changes</button></div>
      </form>
    </Modal>
  );
}

/** Photo or PDF of a supplier invoice → read by AI → handed back for the person to check on the Add Stock panel */
function InvoiceScanner({ cfg, onClose, onRead }) {
  const [pages, setPages] = useState([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState('');
  const choose = async (file) => {
    if (!file) return;
    setBusy('Opening…');
    try {
      const r = await invoicePages(file);
      setPages(r.pages);
      setNote(r.total > r.pages.length ? `Only the first ${r.pages.length} of ${r.total} pages will be read.` : '');
    } catch (e) { toast(e.message || 'That file could not be opened', 'error'); }
    finally { setBusy(''); }
  };
  const read = async () => {
    if (!navigator.onLine) return toast('Reading an invoice needs the internet.', 'warn');
    try {
      const r = await readInvoice(cfg, pages, (n, of) => setBusy(of > 1 ? `Reading page ${n} of ${of}…` : 'Reading the invoice…'));
      if (!r.items.length) { toast('No medicine lines could be read. Try a sharper, straighter photo.', 'warn'); return; }
      onRead(r, pages);
    } catch (e) { toast(e.message || 'The invoice could not be read', 'error'); }
    finally { setBusy(''); }
  };
  return (
    <Modal title="Scan a supplier invoice" onClose={busy ? () => {} : onClose} wide>
      <p className="muted small">Take a photo of the invoice or delivery note, or choose an image or PDF. RxPOS reads the lines and fills in Add Stock for you to check. Nothing is saved until you press <strong>Receive stock</strong>.</p>
      <div className="row gap wrap">
        <label className="btn ghost"><Camera size={16} />Take photo<input hidden type="file" accept="image/*" capture="environment" onChange={(e) => choose(e.target.files[0])} /></label>
        <label className="btn ghost"><FileUp size={16} />Choose image or PDF<input hidden type="file" accept="image/*,application/pdf,.pdf" onChange={(e) => choose(e.target.files[0])} /></label>
        {pages.length > 0 && <button type="button" className="btn sm ghost" onClick={() => setPages([])} disabled={!!busy}><X size={14} />Clear</button>}
      </div>
      {note && <p className="small text-warn">{note}</p>}
      {pages.length > 0 && <div className="scan-thumbs big">{pages.map((src, n) => <img key={n} src={src} alt={`Page ${n + 1}`} />)}</div>}
      <div className="form-actions">
        <button type="button" className="btn ghost" onClick={onClose} disabled={!!busy}>Cancel</button>
        <button type="button" className="btn primary" disabled={!pages.length || !!busy} onClick={read}>{busy ? <><Loader2 size={16} className="spin" />{busy}</> : <><ScanText size={16} />Read invoice</>}</button>
      </div>
    </Modal>
  );
}

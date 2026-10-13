import { useState, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { Download, Barcode as BarcodeIcon, SlidersHorizontal, Save, Undo2 } from 'lucide-react';
import { CrudPage, Tabs, Modal, SearchBox, Empty } from '../ui.jsx';
import { useStore, daysUntil, put, move, addBatch, audit, downloadFile, toCSV, MAIN_BRANCH } from '../store.jsx';
import { ask, toast } from '../feedback.jsx';
import { newInternalBarcode } from '../barcode.jsx';

const expiryClass = (expiry, warn) => {
  if (!expiry) return '';
  const d = daysUntil(expiry);
  return d < 0 ? 'text-danger' : d <= warn ? 'text-warn' : '';
};
const UNITS = ['Piece', 'Tablet', 'Strip', 'Pack', 'Box', 'Bottle', 'Tube', 'Vial', 'Ampoule', 'Sachet', 'Unit'];

export function MedicineList() {
  const { db, products, update, fmt, user, branchId } = useStore();
  const s = db.settings;
  const fields = [
    { key: 'name', label: 'Medicine name', required: true },
    { key: 'generic', label: 'Generic name' },
    { key: 'category', label: 'Category / class' },
    { key: 'form', label: 'Formulation', type: 'select', options: db.formulations.map((f) => f.name) },
    { key: 'strength', label: 'Strength' },
    { key: 'unit', label: 'Selling unit', type: 'select', options: UNITS },
    { key: 'barcode', label: 'Barcode / SKU (blank = generate)' },
    { key: 'cost', label: 'Cost price', type: 'number', required: true },
    { key: 'price', label: `Retail price (blank = cost +${s.retailMarkup}%)`, type: 'number' },
    { key: 'wholesale', label: `Wholesale price (blank = cost +${s.wholesaleMarkup}%)`, type: 'number' },
    { key: 'reorder', label: 'Reorder level', type: 'number' },
    { key: 'shelf', label: 'Shelf / location' },
    { key: 'openingStock', label: 'Opening stock (quantity)', type: 'number', hidden: (r) => !r._new },
    { key: 'openingBatch', label: 'Opening stock batch no.', hidden: (r) => !r._new },
    { key: 'openingExpiry', label: 'Opening stock expiry', type: 'date', hidden: (r) => !r._new },
    { key: 'rx', label: 'Prescription only (Rx)', type: 'checkbox' },
    { key: 'chronic', label: 'Chronic medicine (refill reminders)', type: 'checkbox' },
  ];
  const onSave = (rec, isNew, before) => {
    const { openingStock, openingBatch, openingExpiry, totalStock, ...p } = rec;
    // batch/expiry shown in lists are derived from the batches; keep the product's own (legacy) values
    const orig = db.products.find((x) => x.id === p.id);
    p.batch = orig?.batch; p.expiry = orig?.expiry;
    if (!p.price) p.price = Math.round(p.cost * (1 + s.retailMarkup / 100));
    if (!p.wholesale) p.wholesale = Math.round(p.cost * (1 + s.wholesaleMarkup / 100));
    if (!p.barcode) p.barcode = newInternalBarcode(new Set(db.products.map((x) => x.barcode)));
    update((d) => {
      put(d, 'products', p);
      if (isNew && openingStock) {
        const b = addBatch(d, { productId: p.id, batch: openingBatch, expiry: openingExpiry, cost: p.cost });
        move(d, { productId: p.id, qty: openingStock, type: 'Opening stock', user: user.name, batchId: b.id, branchId });
      }
      if (!isNew && before && (before.price !== p.price || before.cost !== p.cost))
        audit(d, user, 'Price changed', `${p.name}: retail ${fmt(before.price)} → ${fmt(p.price)}, cost ${fmt(before.cost)} → ${fmt(p.cost)}`, branchId);
      if (isNew) audit(d, user, 'Medicine added', p.name, branchId);
    });
  };
  return (
    <CrudPage
      title="Medicine List" singular="Medicine" table="products" rows={products} fields={fields} onSave={onSave}
      subtitle={`${products.length.toLocaleString()} medicines and items`}
      blank={{ form: 'Tablets', unit: 'Piece', reorder: 10, rx: false }}
      columns={[
        { label: 'Medicine', render: (p) => <><strong>{p.name}</strong> {p.rx && <span className="badge">Rx</span>}{p.chronic && <span className="badge ok">Chronic</span>}<br /><small className="muted">{[p.generic, p.strength, p.barcode].filter(Boolean).join(' · ')}</small></> },
        { label: 'Formulation', key: 'form' },
        { label: 'Cost', num: true, render: (p) => fmt(p.cost) },
        { label: 'Wholesale', num: true, render: (p) => fmt(p.wholesale) },
        { label: 'Retail', num: true, render: (p) => fmt(p.price) },
        { label: 'Stock', num: true, render: (p) => <span className={p.stock <= 0 ? 'badge danger' : p.stock <= (p.reorder || 0) ? 'badge warn' : ''}>{p.stock}</span> },
      ]}
    />
  );
}

export function Formulations() {
  const { products } = useStore();
  const count = useMemo(() => { const m = {}; products.forEach((p) => (m[p.form] = (m[p.form] || 0) + 1)); return m; }, [products]);
  return (
    <CrudPage
      title="Formulations" singular="Formulation" table="formulations"
      fields={[{ key: 'name', label: 'Name', required: true }, { key: 'description', label: 'Description', full: true }]}
      columns={[{ label: 'Name', key: 'name' }, { label: 'Description', key: 'description' }, { label: 'Medicines', num: true, render: (f) => count[f.name] || 0 }]}
    />
  );
}

export function StockLevels() {
  const { db, products, fmt, batchesOf, branch } = useStore();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('instock');
  const [open, setOpen] = useState(null);
  const warn = db.settings.expiryWarnDays || 90;
  const multi = db.branches.length > 1;
  const ql = q.toLowerCase();
  const rows = products.filter((p) =>
    (!q || `${p.name} ${p.generic} ${p.barcode} ${p.category}`.toLowerCase().includes(ql)) &&
    (filter === 'all' || (filter === 'instock' && p.stock > 0) || (filter === 'low' && p.stock <= (p.reorder || 0) && p.stock > 0) || (filter === 'out' && p.stock <= 0)));
  const total = rows.reduce((a, p) => a + Math.max(p.stock, 0) * (p.cost || 0), 0);
  const retail = rows.reduce((a, p) => a + Math.max(p.stock, 0) * (p.price || 0), 0);
  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Inventory</h1><div className="sub">{branch?.name} · {rows.length.toLocaleString()} items · {fmt(total)} at cost · {fmt(retail)} at retail</div></div>
        <div className="row gap">
          <SearchBox value={q} onChange={setQ} />
          <button className="btn ghost" onClick={() => downloadFile('inventory.csv', toCSV(rows.flatMap((p) => batchesOf(p.id).filter((b) => b.qty).map((b) => ({ name: p.name, generic: p.generic, form: p.form, batch: b.batch, expiry: b.expiry, qty: b.qty, cost: b.cost || p.cost, price: p.price, value: b.qty * (b.cost || p.cost) })))), 'text/csv')}><Download size={16} />CSV</button>
        </div>
      </div>
      <Tabs tabs={[['instock', 'In stock'], ['low', 'Low stock'], ['out', 'Out of stock'], ['all', 'All']]} value={filter} onChange={setFilter} />
      <div className="card table-wrap">
        <table>
          <thead><tr><th>Medicine</th><th>Next batch</th><th>Expiry</th><th>Shelf</th><th className="num">Reorder at</th><th className="num">In stock</th>{multi && <th className="num">All branches</th>}<th className="num">Value (cost)</th></tr></thead>
          <tbody>
            {rows.slice(0, 500).map((p) => (
              <tr key={p.id} onClick={() => setOpen(p)} style={{ cursor: 'pointer' }}>
                <td><strong>{p.name}</strong><br /><small className="muted">{p.form}</small></td><td>{p.batch || '—'}</td>
                <td className={expiryClass(p.expiry, warn)}>{p.expiry || '—'}</td><td>{p.shelf}</td>
                <td className="num">{p.reorder}</td>
                <td className="num"><span className={p.stock <= 0 ? 'badge danger' : p.stock <= (p.reorder || 0) ? 'badge warn' : ''}>{p.stock}</span></td>
                {multi && <td className="num muted">{p.totalStock}</td>}
                <td className="num">{fmt(Math.max(p.stock, 0) * (p.cost || 0))}</td>
              </tr>
            ))}
            {!rows.length && <Empty colSpan={8}>Nothing here</Empty>}
          </tbody>
        </table>
      </div>
      {open && (
        <Modal title={`${open.name} – batches at ${branch?.name}`} onClose={() => setOpen(null)} wide>
          <table>
            <thead><tr><th>Batch</th><th>Expiry</th><th>Received</th><th className="num">Cost</th><th className="num">Qty</th></tr></thead>
            <tbody>
              {batchesOf(open.id).filter((b) => b.qty !== 0).map((b, i) => (
                <tr key={b.id}><td>{b.batch} {i === 0 && b.qty > 0 && <span className="badge ok">Sells next</span>}</td><td className={expiryClass(b.expiry, warn)}>{b.expiry || '—'}</td><td>{b.received || '—'}</td><td className="num">{fmt(b.cost || open.cost)}</td><td className="num">{b.qty}</td></tr>
              ))}
              {!batchesOf(open.id).some((b) => b.qty) && <Empty colSpan={5}>No stock at this branch</Empty>}
            </tbody>
          </table>
        </Modal>
      )}
    </div>
  );
}

/** Soon expiring / expired — per batch, so a medicine with several deliveries shows each lot separately. */
export function Expiry() {
  const { db, products, update, fmt, user, batchesOf, branchId } = useStore();
  const [tab, setTab] = useState('soon');
  const warn = db.settings.expiryWarnDays || 90;
  const rows = useMemo(() => products.filter((p) => p.stock > 0).flatMap((p) => batchesOf(p.id).filter((b) => b.qty > 0 && b.expiry).map((b) => ({ ...b, p, days: daysUntil(b.expiry) })))
    .filter((r) => (tab === 'expired' ? r.days < 0 : r.days >= 0 && r.days <= warn))
    .sort((a, b) => a.expiry.localeCompare(b.expiry)), [products, batchesOf, tab, warn]);
  const writeOff = async (r) => {
    if (!(await ask({ title: 'Write off expired stock?', message: `${r.qty} × ${r.p.name} (batch ${r.batch}) will be removed from stock.`, confirmText: 'Write off', danger: true }))) return;
    update((d) => {
      move(d, { productId: r.p.id, qty: -r.qty, type: 'Expired write-off', ref: r.batch, user: user.name, batchId: r.legacy ? null : r.id, branchId });
      audit(d, user, 'Expired write-off', `${r.p.name} batch ${r.batch}: ${r.qty} units (${fmt(r.qty * (r.cost || r.p.cost))})`, branchId);
    });
    toast(`${r.p.name} batch ${r.batch} written off`);
  };
  return (
    <div className="page">
      <div className="page-head"><div><h1>Expiring / Expired</h1><div className="sub">{rows.length} batches · {fmt(rows.reduce((a, r) => a + r.qty * (r.cost || r.p.cost), 0))} at cost</div></div></div>
      <Tabs tabs={[['soon', `Expiring within ${warn} days`], ['expired', 'Expired']]} value={tab} onChange={setTab} />
      <div className="card table-wrap">
        <table>
          <thead><tr><th>Medicine</th><th>Batch</th><th>Expiry</th><th>When</th><th className="num">Qty</th><th className="num">Value</th><th /></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.p.id + r.id}>
                <td><strong>{r.p.name}</strong></td><td>{r.batch}</td><td className={expiryClass(r.expiry, warn)}>{r.expiry}</td>
                <td className={expiryClass(r.expiry, warn)}>{r.days < 0 ? `${-r.days} days ago` : r.days === 0 ? 'today' : `in ${r.days} days`}</td>
                <td className="num">{r.qty}</td><td className="num">{fmt(r.qty * (r.cost || r.p.cost))}</td>
                <td className="actions">{tab === 'expired' && user.role !== 'cashier' && <button className="btn sm danger" onClick={() => writeOff(r)}>Write off</button>}</td>
              </tr>
            ))}
            {!rows.length && <Empty colSpan={7}>{tab === 'expired' ? 'No expired stock 🎉' : 'Nothing expiring soon 🎉'}</Empty>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Spreadsheet-style editing of prices, reorder levels, shelf and barcode. */
export function QuickEdit() {
  const { db, products, update, fmt, user, branchId } = useStore();
  const [q, setQ] = useState('');
  const [edits, setEdits] = useState({});
  const ql = q.toLowerCase();
  const rows = products.filter((p) => !q || `${p.name} ${p.generic} ${p.barcode}`.toLowerCase().includes(ql)).slice(0, 300);
  const val = (p, k) => edits[p.id]?.[k] ?? p[k] ?? '';
  const set = (p, k, v) => setEdits((e) => ({ ...e, [p.id]: { ...e[p.id], [k]: v } }));
  const count = Object.keys(edits).length;
  const save = () => {
    update((d) => {
      const changes = [];
      for (const [id, patch] of Object.entries(edits)) {
        const p = d.products.find((x) => x.id === id);
        if (!p) continue;
        const clean = { ...patch };
        ['cost', 'wholesale', 'price', 'reorder'].forEach((k) => k in clean && (clean[k] = Number(clean[k]) || 0));
        put(d, 'products', { ...p, ...clean });
        if ('price' in clean && clean.price !== p.price) changes.push(`${p.name}: ${fmt(p.price)} → ${fmt(clean.price)}`);
      }
      if (changes.length) audit(d, user, 'Price changed (quick edit)', changes.join('; ').slice(0, 1000), branchId);
    });
    toast(`${count} medicine${count === 1 ? '' : 's'} updated`);
    setEdits({});
  };
  const fillBarcodes = () => {
    const used = new Set(db.products.map((p) => p.barcode).filter(Boolean));
    const missing = db.products.filter((p) => !p.barcode);
    if (!missing.length) return toast('Every medicine already has a barcode', 'info');
    update((d) => { for (const p of missing) { const code = newInternalBarcode(used); used.add(code); put(d, 'products', { ...d.products.find((x) => x.id === p.id), barcode: code }); } });
    toast(`Generated ${missing.length} barcodes`);
  };
  const cols = [['cost', 'Cost', 'number'], ['wholesale', 'Wholesale', 'number'], ['price', 'Retail', 'number'], ['reorder', 'Reorder', 'number'], ['shelf', 'Shelf', 'text'], ['barcode', 'Barcode', 'text']];
  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Quick Edit</h1><div className="sub">Edit many prices at once, then save</div></div>
        <div className="row gap">
          <SearchBox value={q} onChange={setQ} />
          <button className="btn ghost" onClick={fillBarcodes}><BarcodeIcon size={16} />Generate missing barcodes</button>
          <button className="btn ghost" disabled={!count} onClick={() => setEdits({})}><Undo2 size={16} />Discard</button>
          <button className="btn primary" disabled={!count} onClick={save}><Save size={16} />Save {count || ''} change{count === 1 ? '' : 's'}</button>
        </div>
      </div>
      <div className="card table-wrap">
        <table className="lines">
          <thead><tr><th>Medicine</th>{cols.map(([k, l]) => <th key={k}>{l}</th>)}<th className="num">Margin</th></tr></thead>
          <tbody>
            {rows.map((p) => {
              const price = Number(val(p, 'price')), cost = Number(val(p, 'cost'));
              return (
                <tr key={p.id} className={edits[p.id] ? 'edited' : ''}>
                  <td>{p.name}<br /><small className="muted">{p.stock} in stock</small></td>
                  {cols.map(([k, , type]) => <td key={k}><input type={type} step="any" value={val(p, k)} onChange={(e) => set(p, k, e.target.value)} /></td>)}
                  <td className="num">{price ? Math.round(((price - cost) / price) * 100) + '%' : '—'}<br /><small className="muted">{fmt(price - cost)}</small></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Every stock movement for a medicine at this branch with running balance, plus counts/adjustments per batch. */
export function StockCard() {
  const { db, products, update, user, batchesOf, branchId, branch } = useStore();
  const location = useLocation();
  const [id, setId] = useState(location.state?.productId || products[0]?.id || '');
  const [q, setQ] = useState('');
  const [adjust, setAdjust] = useState(null);
  const p = products.find((x) => x.id === id);
  const batches = id ? batchesOf(id) : [];
  const batchName = useMemo(() => Object.fromEntries(db.batches.filter((b) => b.productId === id).map((b) => [b.id, b.batch])), [db.batches, id]);
  const lines = useMemo(() => {
    let bal = 0;
    return db.movements.filter((m) => m.productId === id && (m.branchId || MAIN_BRANCH) === branchId)
      .sort((a, b) => a.date.localeCompare(b.date)).map((m) => ({ ...m, bal: (bal += m.qty) }));
  }, [db.movements, id, branchId]);
  const ql = q.toLowerCase();
  const options = products.filter((x) => !q || x.name.toLowerCase().includes(ql)).slice(0, 300);

  const saveAdjust = (e) => {
    e.preventDefault();
    const b = batches.find((x) => x.id === adjust.batchId);
    let batchId = b && !b.legacy ? b.id : null;
    const counted = Number(adjust.counted);
    let diff = adjust.mode === 'count' ? counted - (b?.qty || 0) : Number(adjust.qty) * (adjust.mode === 'remove' ? -1 : 1);
    if (!diff) return setAdjust(null);
    update((d) => {
      if (adjust.mode === 'add' && adjust.batchId === 'new') batchId = addBatch(d, { productId: p.id, batch: adjust.newBatch, expiry: adjust.newExpiry, cost: p.cost }).id;
      move(d, { productId: p.id, qty: diff, type: adjust.mode === 'count' ? 'Stock count' : 'Adjustment', note: adjust.reason, user: user.name, batchId, branchId });
      audit(d, user, adjust.mode === 'count' ? 'Stock count' : 'Stock adjusted', `${p.name} ${b?.batch || adjust.newBatch || ''}: ${diff > 0 ? '+' : ''}${diff} (${adjust.reason})`, branchId);
    });
    toast('Stock updated');
    setAdjust(null);
  };

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Stock Card</h1><div className="sub">{branch?.name}</div></div>
        <div className="row gap">
          <SearchBox value={q} onChange={setQ} placeholder="Find medicine…" />
          <select value={id} onChange={(e) => setId(e.target.value)}>{options.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
          {p && user.role !== 'cashier' && <button className="btn primary" onClick={() => setAdjust({ mode: 'count', batchId: batches[0]?.id || 'new', counted: batches[0]?.qty || 0, qty: 1, reason: '', newBatch: '', newExpiry: '' })}><SlidersHorizontal size={16} />Count / adjust</button>}
        </div>
      </div>
      {p && (
        <div className="stats">
          <div className="card stat"><small>In stock here</small><strong>{p.stock}</strong><span className="muted small">{p.unit || 'units'}</span></div>
          {batches.filter((b) => b.qty).slice(0, 3).map((b) => (
            <div key={b.id} className="card stat"><small>Batch {b.batch}</small><strong>{b.qty}</strong><span className={'small ' + expiryClass(b.expiry, db.settings.expiryWarnDays || 90)}>Expires {b.expiry || '—'}</span></div>
          ))}
        </div>
      )}
      <div className="card table-wrap">
        <table>
          <thead><tr><th>Date</th><th>Type</th><th>Batch</th><th>Reference</th><th>By</th><th className="num">In</th><th className="num">Out</th><th className="num">Balance</th></tr></thead>
          <tbody>
            {lines.slice().reverse().slice(0, 500).map((m) => (
              <tr key={m.id}>
                <td>{new Date(m.date).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</td><td>{m.type}</td><td>{m.batchId ? batchName[m.batchId] || '—' : p?.batch || '—'}</td>
                <td>{m.ref}{m.note ? ` (${m.note})` : ''}</td><td>{m.user}</td>
                <td className="num text-ok">{m.qty > 0 ? m.qty : ''}</td><td className="num text-danger">{m.qty < 0 ? -m.qty : ''}</td><td className="num"><strong>{m.bal}</strong></td>
              </tr>
            ))}
            {!lines.length && <Empty colSpan={8}>No stock movements at this branch</Empty>}
          </tbody>
        </table>
      </div>
      {adjust && (
        <Modal title={`Count / adjust – ${p.name}`} onClose={() => setAdjust(null)}>
          <form onSubmit={saveAdjust} className="stack">
            <Tabs tabs={[['count', 'Physical count'], ['add', 'Add'], ['remove', 'Remove']]} value={adjust.mode} onChange={(mode) => setAdjust({ ...adjust, mode })} />
            <label className="field"><span>Batch</span>
              <select value={adjust.batchId} onChange={(e) => setAdjust({ ...adjust, batchId: e.target.value, counted: batches.find((b) => b.id === e.target.value)?.qty || 0 })}>
                {batches.map((b) => <option key={b.id} value={b.id}>{b.batch} · exp {b.expiry || '—'} · {b.qty} in stock</option>)}
                {adjust.mode === 'add' && <option value="new">+ New batch…</option>}
              </select>
            </label>
            {adjust.mode === 'add' && adjust.batchId === 'new' && (
              <div className="form-grid">
                <label className="field"><span>Batch no.</span><input value={adjust.newBatch} onChange={(e) => setAdjust({ ...adjust, newBatch: e.target.value })} required /></label>
                <label className="field"><span>Expiry</span><input type="date" value={adjust.newExpiry} onChange={(e) => setAdjust({ ...adjust, newExpiry: e.target.value })} required /></label>
              </div>
            )}
            {adjust.mode === 'count'
              ? <label className="field"><span>Counted quantity (system says {batches.find((b) => b.id === adjust.batchId)?.qty || 0})</span><input type="number" min="0" value={adjust.counted} onChange={(e) => setAdjust({ ...adjust, counted: e.target.value })} required /></label>
              : <label className="field"><span>Quantity to {adjust.mode}</span><input type="number" min="1" value={adjust.qty} onChange={(e) => setAdjust({ ...adjust, qty: e.target.value })} required /></label>}
            <label className="field"><span>Reason</span><input value={adjust.reason} onChange={(e) => setAdjust({ ...adjust, reason: e.target.value })} placeholder="e.g. damaged, stock take, sample" required /></label>
            <div className="form-actions"><button type="button" className="btn ghost" onClick={() => setAdjust(null)}>Cancel</button><button className="btn primary">Save</button></div>
          </form>
        </Modal>
      )}
    </div>
  );
}

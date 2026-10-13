import { useState, useMemo } from 'react';
import { CrudPage, Tabs, Modal } from '../ui.jsx';
import { useStore, daysUntil, put, move, downloadFile, toCSV } from '../store.jsx';

const expiryClass = (p, warn) => {
  if (!p.expiry) return '';
  const d = daysUntil(p.expiry);
  return d < 0 ? 'text-danger' : d <= warn ? 'text-warn' : '';
};

export function MedicineList() {
  const { db, products, update, fmt, user } = useStore();
  const s = db.settings;
  const fields = [
    { key: 'name', label: 'Medicine name', required: true },
    { key: 'generic', label: 'Generic name' },
    { key: 'category', label: 'Category / class' },
    { key: 'form', label: 'Formulation', type: 'select', options: db.formulations.map((f) => f.name) },
    { key: 'strength', label: 'Strength' },
    { key: 'unit', label: 'Selling unit', type: 'select', options: ['Piece', 'Tablet', 'Strip', 'Pack', 'Box', 'Bottle', 'Tube', 'Vial', 'Sachet'] },
    { key: 'barcode', label: 'Barcode / SKU' },
    { key: 'batch', label: 'Batch number' },
    { key: 'expiry', label: 'Expiry date', type: 'date' },
    { key: 'cost', label: 'Cost price', type: 'number', required: true },
    { key: 'price', label: `Retail price (blank = cost +${s.retailMarkup}%)`, type: 'number' },
    { key: 'wholesale', label: `Wholesale price (blank = cost +${s.wholesaleMarkup}%)`, type: 'number' },
    { key: 'reorder', label: 'Reorder level', type: 'number' },
    { key: 'openingStock', label: 'Opening stock', type: 'number', hidden: (r) => !r._new },
    { key: 'shelf', label: 'Shelf / location' },
    { key: 'rx', label: 'Prescription only (Rx)', type: 'checkbox' },
  ];
  const onSave = (rec, isNew) => {
    const { openingStock, ...p } = rec;
    if (!p.price) p.price = Math.round(p.cost * (1 + s.retailMarkup / 100));
    if (!p.wholesale) p.wholesale = Math.round(p.cost * (1 + s.wholesaleMarkup / 100));
    update((d) => {
      put(d, 'products', p);
      if (isNew && openingStock) move(d, { productId: p.id, qty: openingStock, type: 'Opening stock', user: user.name });
    });
  };
  return (
    <CrudPage
      title="Medicine List" singular="Medicine" table="products" rows={products} fields={fields} onSave={onSave}
      blank={{ form: 'Tablet', unit: 'Piece', reorder: 10, rx: false }}
      columns={[
        { label: 'Medicine', render: (p) => <><strong>{p.name}</strong> {p.rx && <span className="badge">Rx</span>}<br /><small className="muted">{[p.generic, p.strength].filter(Boolean).join(' · ')}</small></> },
        { label: 'Formulation', key: 'form' },
        { label: 'Category', key: 'category' },
        { label: 'Cost', num: true, render: (p) => fmt(p.cost) },
        { label: 'Wholesale', num: true, render: (p) => fmt(p.wholesale) },
        { label: 'Retail', num: true, render: (p) => fmt(p.price) },
        { label: 'Stock', num: true, render: (p) => <span className={p.stock <= (p.reorder || 0) ? 'badge warn' : ''}>{p.stock}</span> },
      ]}
    />
  );
}

export function Formulations() {
  const { products } = useStore();
  return (
    <CrudPage
      title="Formulations" singular="Formulation" table="formulations"
      fields={[{ key: 'name', label: 'Name', required: true }, { key: 'description', label: 'Description', full: true }]}
      columns={[{ label: 'Name', key: 'name' }, { label: 'Description', key: 'description' }, { label: 'Medicines', num: true, render: (f) => products.filter((p) => p.form === f.name).length }]}
    />
  );
}

export function StockLevels() {
  const { db, products, fmt } = useStore();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const warn = db.settings.expiryWarnDays || 90;
  const rows = products.filter((p) =>
    (!q || [p.name, p.generic, p.barcode, p.category].join(' ').toLowerCase().includes(q.toLowerCase())) &&
    (filter === 'all' || (filter === 'low' && p.stock <= (p.reorder || 0) && p.stock > 0) || (filter === 'out' && p.stock <= 0)));
  const total = rows.reduce((a, p) => a + Math.max(p.stock, 0) * (p.cost || 0), 0);
  const retail = rows.reduce((a, p) => a + Math.max(p.stock, 0) * (p.price || 0), 0);
  return (
    <div className="page">
      <div className="page-head">
        <h1>Inventory</h1>
        <div className="row gap">
          <input className="search" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="btn ghost" onClick={() => downloadFile('inventory.csv', toCSV(rows.map((p) => ({ name: p.name, generic: p.generic, form: p.form, batch: p.batch, expiry: p.expiry, stock: p.stock, cost: p.cost, price: p.price, value: p.stock * p.cost }))), 'text/csv')}>Export CSV</button>
        </div>
      </div>
      <Tabs tabs={[['all', 'All'], ['low', 'Low stock'], ['out', 'Out of stock']]} value={filter} onChange={setFilter} />
      <div className="muted">{rows.length} items · value at cost {fmt(total)} · at retail {fmt(retail)}</div>
      <div className="card table-wrap">
        <table>
          <thead><tr><th>Medicine</th><th>Formulation</th><th>Batch</th><th>Expiry</th><th>Shelf</th><th className="num">Reorder at</th><th className="num">In stock</th><th className="num">Value (cost)</th></tr></thead>
          <tbody>
            {rows.slice(0, 500).map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td><td>{p.form}</td><td>{p.batch}</td>
                <td className={expiryClass(p, warn)}>{p.expiry || '—'}</td><td>{p.shelf}</td>
                <td className="num">{p.reorder}</td>
                <td className="num"><span className={p.stock <= 0 ? 'badge danger' : p.stock <= (p.reorder || 0) ? 'badge warn' : ''}>{p.stock}</span></td>
                <td className="num">{fmt(Math.max(p.stock, 0) * (p.cost || 0))}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={8} className="empty">Nothing here</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function Expiry() {
  const { db, products, update, fmt, user } = useStore();
  const [tab, setTab] = useState('soon');
  const warn = db.settings.expiryWarnDays || 90;
  const rows = products
    .filter((p) => p.expiry && p.stock > 0)
    .filter((p) => (tab === 'expired' ? daysUntil(p.expiry) < 0 : daysUntil(p.expiry) >= 0 && daysUntil(p.expiry) <= warn))
    .sort((a, b) => a.expiry.localeCompare(b.expiry));
  const writeOff = (p) => {
    if (!confirm(`Write off ${p.stock} units of ${p.name} (batch ${p.batch}) as expired?`)) return;
    update((d) => { move(d, { productId: p.id, qty: -p.stock, type: 'Expired write-off', ref: p.batch, user: user.name }); });
  };
  return (
    <div className="page">
      <div className="page-head"><h1>Soon Expiring / Expired</h1></div>
      <Tabs tabs={[['soon', `Soon expiring (≤ ${warn} days)`], ['expired', 'Expired']]} value={tab} onChange={setTab} />
      <div className="muted">{rows.length} items · value at cost {fmt(rows.reduce((a, p) => a + p.stock * p.cost, 0))}</div>
      <div className="card table-wrap">
        <table>
          <thead><tr><th>Medicine</th><th>Batch</th><th>Expiry</th><th>Days</th><th className="num">Stock</th><th className="num">Value</th><th /></tr></thead>
          <tbody>
            {rows.map((p) => {
              const d = daysUntil(p.expiry);
              return (
                <tr key={p.id}>
                  <td>{p.name}</td><td>{p.batch}</td><td className={expiryClass(p, warn)}>{p.expiry}</td>
                  <td className={expiryClass(p, warn)}>{d < 0 ? `${-d} days ago` : `${d} days`}</td>
                  <td className="num">{p.stock}</td><td className="num">{fmt(p.stock * p.cost)}</td>
                  <td className="actions">{tab === 'expired' && user.role !== 'cashier' && <button className="btn sm danger" onClick={() => writeOff(p)}>Write off</button>}</td>
                </tr>
              );
            })}
            {!rows.length && <tr><td colSpan={7} className="empty">Nothing {tab === 'expired' ? 'expired' : 'expiring soon'} 🎉</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Spreadsheet-style editing of prices, reorder levels, batch and expiry. */
export function QuickEdit() {
  const { products, update, fmt } = useStore();
  const [q, setQ] = useState('');
  const [edits, setEdits] = useState({});
  const rows = products.filter((p) => !q || [p.name, p.generic, p.barcode].join(' ').toLowerCase().includes(q.toLowerCase())).slice(0, 300);
  const val = (p, k) => edits[p.id]?.[k] ?? p[k] ?? '';
  const set = (p, k, v) => setEdits((e) => ({ ...e, [p.id]: { ...e[p.id], [k]: v } }));
  const count = Object.keys(edits).length;
  const save = () => {
    update((d) => {
      for (const [id, patch] of Object.entries(edits)) {
        const p = d.products.find((x) => x.id === id);
        if (!p) continue;
        const clean = { ...patch };
        ['cost', 'wholesale', 'price', 'reorder'].forEach((k) => k in clean && (clean[k] = Number(clean[k]) || 0));
        put(d, 'products', { ...p, ...clean });
      }
    });
    setEdits({});
  };
  const cols = [['cost', 'Cost', 'number'], ['wholesale', 'Wholesale', 'number'], ['price', 'Retail', 'number'], ['reorder', 'Reorder', 'number'], ['batch', 'Batch', 'text'], ['expiry', 'Expiry', 'date'], ['shelf', 'Shelf', 'text']];
  return (
    <div className="page">
      <div className="page-head">
        <h1>Quick Edit</h1>
        <div className="row gap">
          <input className="search" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="btn ghost" disabled={!count} onClick={() => setEdits({})}>Discard</button>
          <button className="btn primary" disabled={!count} onClick={save}>Save {count || ''} change{count === 1 ? '' : 's'}</button>
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

/** Every stock movement for a medicine with running balance, plus manual adjustments (stock count). */
export function StockCard() {
  const { db, products, update, user } = useStore();
  const [id, setId] = useState(products[0]?.id || '');
  const [q, setQ] = useState('');
  const [adjust, setAdjust] = useState(null);
  const p = products.find((x) => x.id === id);
  const lines = useMemo(() => {
    let bal = 0;
    return db.movements.filter((m) => m.productId === id).sort((a, b) => a.date.localeCompare(b.date)).map((m) => ({ ...m, bal: (bal += m.qty) }));
  }, [db.movements, id]);
  const options = products.filter((x) => !q || x.name.toLowerCase().includes(q.toLowerCase())).slice(0, 200);

  const saveAdjust = (e) => {
    e.preventDefault();
    const counted = Number(adjust.counted);
    const diff = adjust.mode === 'count' ? counted - p.stock : Number(adjust.qty) * (adjust.mode === 'remove' ? -1 : 1);
    if (!diff) return setAdjust(null);
    update((d) => { move(d, { productId: p.id, qty: diff, type: adjust.mode === 'count' ? 'Stock count' : 'Adjustment', note: adjust.reason, user: user.name }); });
    setAdjust(null);
  };

  return (
    <div className="page">
      <div className="page-head">
        <h1>Stock Card</h1>
        <div className="row gap">
          <input className="search" placeholder="Find medicine…" value={q} onChange={(e) => setQ(e.target.value)} />
          <select value={id} onChange={(e) => setId(e.target.value)}>{options.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
          {p && user.role !== 'cashier' && <button className="btn primary" onClick={() => setAdjust({ mode: 'count', counted: p.stock, qty: 0, reason: '' })}>Adjust / count</button>}
        </div>
      </div>
      {p && <div className="muted">{p.name} · batch {p.batch || '—'} · expiry {p.expiry || '—'} · current stock <strong>{p.stock}</strong></div>}
      <div className="card table-wrap">
        <table>
          <thead><tr><th>Date</th><th>Type</th><th>Reference</th><th>By</th><th className="num">In</th><th className="num">Out</th><th className="num">Balance</th></tr></thead>
          <tbody>
            {lines.slice().reverse().map((m) => (
              <tr key={m.id}>
                <td>{new Date(m.date).toLocaleString()}</td><td>{m.type}</td><td>{m.ref}{m.note ? ` (${m.note})` : ''}</td><td>{m.user}</td>
                <td className="num text-ok">{m.qty > 0 ? m.qty : ''}</td><td className="num text-danger">{m.qty < 0 ? -m.qty : ''}</td><td className="num"><strong>{m.bal}</strong></td>
              </tr>
            ))}
            {!lines.length && <tr><td colSpan={7} className="empty">No stock movements</td></tr>}
          </tbody>
        </table>
      </div>
      {adjust && (
        <Modal title={`Adjust stock – ${p.name}`} onClose={() => setAdjust(null)}>
          <form onSubmit={saveAdjust} className="stack">
            <Tabs tabs={[['count', 'Physical count'], ['add', 'Add'], ['remove', 'Remove']]} value={adjust.mode} onChange={(mode) => setAdjust({ ...adjust, mode })} />
            {adjust.mode === 'count'
              ? <label className="field"><span>Counted quantity (system says {p.stock})</span><input type="number" value={adjust.counted} onChange={(e) => setAdjust({ ...adjust, counted: e.target.value })} required /></label>
              : <label className="field"><span>Quantity to {adjust.mode}</span><input type="number" min="1" value={adjust.qty} onChange={(e) => setAdjust({ ...adjust, qty: e.target.value })} required /></label>}
            <label className="field"><span>Reason</span><input value={adjust.reason} onChange={(e) => setAdjust({ ...adjust, reason: e.target.value })} placeholder="e.g. damaged, stock take, sample" required /></label>
            <div className="form-actions"><button type="button" className="btn ghost" onClick={() => setAdjust(null)}>Cancel</button><button className="btn primary">Save</button></div>
          </form>
        </Modal>
      )}
    </div>
  );
}

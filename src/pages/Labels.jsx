import { useState } from 'react';
import { Printer, Tag, Trash2 } from 'lucide-react';
import { useStore, put } from '../store.jsx';
import { SearchBox, Empty } from '../ui.jsx';
import { Barcode, newInternalBarcode } from '../barcode.jsx';
import { toast } from '../feedback.jsx';

const SIZES = { '38x25': { w: 38, h: 25, label: '38 × 25 mm (small)' }, '50x30': { w: 50, h: 30, label: '50 × 30 mm (standard)' }, '60x40': { w: 60, h: 40, label: '60 × 40 mm (large)' }, 'a4': { w: 63.5, h: 38.1, label: 'A4 sheet, 21 per page' } };

/** Print price & barcode labels for shelves and products (thermal label printer or A4 label sheets). */
export default function Labels() {
  const { db, products, fmt, update } = useStore();
  const [q, setQ] = useState('');
  const [items, setItems] = useState([]);
  const [size, setSize] = useState('50x30');
  const [show, setShow] = useState({ price: true, expiry: true, pharmacy: true });
  const ql = q.toLowerCase();
  const matches = q ? products.filter((p) => `${p.name} ${p.generic} ${p.barcode}`.toLowerCase().includes(ql)).slice(0, 10) : [];

  const add = (p, qty = 1) => {
    if (!p.barcode) {
      const code = newInternalBarcode(new Set(db.products.map((x) => x.barcode)));
      update((d) => { put(d, 'products', { ...d.products.find((x) => x.id === p.id), barcode: code }); });
      p = { ...p, barcode: code };
      toast(`Barcode ${code} created for ${p.name}`, 'info');
    }
    setItems((list) => (list.some((i) => i.p.id === p.id) ? list : [...list, { p, qty }]));
    setQ('');
  };
  const addLowStock = () => products.filter((p) => p.stock > 0).slice(0, 60).forEach((p) => add(p, 1));
  const labels = items.flatMap((i) => Array.from({ length: Math.max(0, Number(i.qty) || 0) }, () => i.p));
  const sz = SIZES[size];

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Barcode Labels</h1><div className="sub"><Tag size={14} /> Price and barcode labels for shelves and products</div></div>
        <div className="row gap">
          <select value={size} onChange={(e) => setSize(e.target.value)}>{Object.entries(SIZES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
          <button className="btn primary" disabled={!labels.length} onClick={() => window.print()}><Printer size={16} />Print {labels.length} label{labels.length === 1 ? '' : 's'}</button>
        </div>
      </div>
      <div className="grid2">
        <div className="card">
          <h3>Choose medicines</h3>
          <div className="picker">
            <SearchBox value={q} onChange={setQ} placeholder="Search medicine or scan barcode…" />
            {matches.length > 0 && <div className="picker-list">{matches.map((p) => <button key={p.id} onClick={() => add(p)}>{p.name} <small className="muted">{fmt(p.price)} · {p.barcode || 'no barcode yet'}</small></button>)}</div>}
          </div>
          <div className="row gap" style={{ marginBottom: 10 }}>
            <button className="btn sm ghost" onClick={addLowStock}>Add all in-stock items</button>
            {items.length > 0 && <button className="btn sm ghost" onClick={() => setItems([])}><Trash2 size={14} />Clear</button>}
          </div>
          <table className="lines">
            <thead><tr><th>Medicine</th><th>Barcode</th><th>Labels</th><th /></tr></thead>
            <tbody>
              {items.map((i, n) => (
                <tr key={i.p.id}><td>{i.p.name}</td><td className="muted small">{i.p.barcode}</td>
                  <td><input type="number" min="0" value={i.qty} onChange={(e) => setItems((l) => l.map((x, j) => (j === n ? { ...x, qty: e.target.value } : x)))} /></td>
                  <td><button className="icon-btn" onClick={() => setItems((l) => l.filter((_, j) => j !== n))}>×</button></td></tr>
              ))}
              {!items.length && <Empty colSpan={4}>Search above to add medicines</Empty>}
            </tbody>
          </table>
          <div className="row gap" style={{ marginTop: 14 }}>
            {[['price', 'Show price'], ['expiry', 'Show expiry'], ['pharmacy', 'Show pharmacy name']].map(([k, l]) => (
              <label key={k} className="field check"><input type="checkbox" checked={show[k]} onChange={(e) => setShow({ ...show, [k]: e.target.checked })} /><span>{l}</span></label>
            ))}
          </div>
        </div>
        <div className="card">
          <h3>Preview</h3>
          <div className={'label-sheet print-area labels-' + size} style={{ '--lw': sz.w + 'mm', '--lh': sz.h + 'mm' }}>
            {labels.slice(0, 200).map((p, n) => (
              <div key={n} className="label">
                {show.pharmacy && <div className="label-shop">{db.settings.name}</div>}
                <div className="label-name">{p.name}</div>
                <Barcode value={p.barcode} height={30} module={1.4} />
                <div className="label-foot">
                  {show.price && <strong>{fmt(p.price)}</strong>}
                  {show.expiry && p.expiry && <span>Exp {p.expiry}</span>}
                </div>
              </div>
            ))}
            {!labels.length && <p className="muted">Labels appear here.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

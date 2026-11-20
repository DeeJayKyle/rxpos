import { useState, useMemo, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Download, Barcode as BarcodeIcon, SlidersHorizontal, Save, Undo2, Pencil, ScrollText, Boxes, Tag, Wand2 } from 'lucide-react';
import { CrudPage, Tabs, Modal, SearchBox, Empty, PdfButton, FilterChips, ExportMenu } from '../ui.jsx';
import { useStore, today, daysUntil, put, move, addBatch, audit, downloadFile, toCSV, batchValue, stockValue, markupPrice, MAIN_BRANCH, putMany } from '../store.jsx';
import { ask, askText, toast } from '../feedback.jsx';
import { formatQty } from '../money.js';
import { removalSplit } from '../fefo.js';
import { newInternalBarcode } from '../barcode.jsx';
import { useHoverCard, useListControls } from '../listcontrols.jsx';
import { HELP } from '../forms.jsx';
import ExpiryCalendar from '../components/ExpiryCalendar.jsx';
import { deviceSettings, setDevice } from '../device.js';
import { useLoadMore, useColumns, BulkBar, useWide, DetailsPane, HealthBar } from '../tablekit.jsx';
import { ProductArt } from '../idleart.jsx';
import { useMedicineOrder, MedicineOrderPicker, groupedRows, useFolded, GroupHeadingRow } from '../medgroups.jsx';
import { BranchStockList } from '../components/BranchStock.jsx';
import { dateLocale } from '../showdate.js';
import { DateInput } from '../fields.jsx';
import NameCheck from '../components/NameCheck.jsx';
import { usePageMenu } from '../pagemenu.js';

const expiryClass = (expiry, warn) => {
  if (!expiry) return '';
  const d = daysUntil(expiry);
  return d < 0 ? 'text-danger' : d <= warn ? 'text-warn' : '';
};
/** Stock and expiry status in words (not colour alone), from the same rules as the stock and expiry columns */
const StockStatus = ({ p, warn }) => {
  const d = p.expiry ? daysUntil(p.expiry) : null;
  const tags = [
    // 1.16.0 (the owner's clean-up): only what needs a look gets a tag; a medicine in stock and in date has none
    p.stock <= 0 ? ['danger', 'Out of stock'] : p.stock <= (p.reorder || 0) ? ['warn', 'Low stock'] : null,
    d != null && p.stock > 0 && (d < 0 ? ['danger', 'Expired'] : d <= warn ? ['warn', 'Expiring soon'] : null),
  ].filter(Boolean);
  return <span className="status-tags">{tags.map(([tone, label]) => <span key={label} className={'status ' + tone}><i aria-hidden="true" />{label}</span>)}</span>;
};
const UNITS = ['Piece', 'Tablet', 'Strip', 'Pack', 'Box', 'Bottle', 'Tube', 'Vial', 'Ampoule', 'Sachet', 'Unit'];

/** Things worth a look in a medicine record (imported or legacy data). Read-only: nothing is changed automatically. */
const recordIssues = (p, dupBarcodes) => [
  !(Number(p.price) > 0) && 'No retail price',
  Number(p.price) > 0 && Number(p.cost) > Number(p.price) && 'Retail below cost',
  !(Number(p.cost) > 0) && 'No cost price',
  !p.form && 'No formulation',
  !p.unit && 'No selling unit',
  p.barcode && dupBarcodes.has(p.barcode) && 'Barcode used twice',
  p.name && p.name !== p.name.trim() && 'Spaces around the name',
].filter(Boolean);

/** A medicine's stock and batches, shown while the pointer rests on its name (the owner's request: mouse functions) */
function StockPeek({ p }) {
  const { db, fmt, batchesOf } = useStore();
  const bs = (batchesOf(p.id) || []).filter((b) => b.qty > 0).sort((a, b) => String(a.expiry).localeCompare(String(b.expiry)));
  return (<>
    <strong>{p.name}</strong><br />
    <span className="muted">{formatQty(p.stock)} {(p.unit || 'unit').toLowerCase()}s in stock · {fmt(p.price)} each</span>
    {bs.length ? <table><tbody>{bs.slice(0, 6).map((b) => <tr key={b.id}><td>{b.batch || '—'}</td><td>{b.expiry || '—'}{b.expiry && daysUntil(b.expiry) < 0 ? ' (expired)' : ''}</td><td className="num">{formatQty(b.qty)}</td></tr>)}</tbody></table> : <div className="muted small">No batches in stock</div>}
    {bs.length > 6 && <div className="muted small">+{bs.length - 6} more batches</div>}
    {/* G4: the same medicine in the other branches */}
    {db.branches.length > 1 && <><div className="muted small" style={{ marginTop: 6 }}>In each branch</div><BranchStockList p={p} /></>}
  </>);
}

export function MedicineList() {
  const { db, products, update, fmt, user, branchId, can } = useStore();
  const navigate = useNavigate();
  const peek = useHoverCard((p) => <StockPeek p={p} />);
  // the ticked medicines together (the owner's request: selection and bulk actions); every change is audited
  const bulkPrice = async (rows, done) => {
    const how = await askText({ title: `Change the retail price of ${rows.length} medicine${rows.length > 1 ? 's' : ''}`, message: 'Type +10% or -5% to raise or lower each price, or an amount (1500) for the same price on all.', placeholder: '+10%', confirmText: 'Change prices' });
    if (!how) return;
    const m = /^\s*([+-]?\d+(?:\.\d+)?)\s*(%?)\s*$/.exec(how);
    if (!m) return toast('Type +10%, -5% or an amount', 'warn');
    const n = Number(m[1]), pct = m[2] === '%';
    if (!pct && !(n > 0)) return toast('A price is above 0', 'warn');
    const priceOf = (p) => (pct ? markupPrice(p.price || 0, n, s.priceRound) : n);
    await update((d) => { for (const p of rows) { const price = priceOf(p); if (!(price > 0) || price === p.price) continue; put(d, 'products', { ...d.products.find((x) => x.id === p.id) || p, price }); audit(d, user, 'Price changed', `${p.name}: retail ${fmt(p.price)} → ${fmt(price)} (${rows.length} changed together)`, branchId); } });
    toast(`Prices changed for ${rows.length} medicine${rows.length > 1 ? 's' : ''}`); done();
  };
  const bulkField = (key, label) => async (rows, done) => {
    const v = await askText({ title: `${label} for ${rows.length} medicine${rows.length > 1 ? 's' : ''}`, message: `The same ${label.toLowerCase()} for all the ticked medicines.`, confirmText: 'Save' });
    if (v === null || v === undefined) return;
    const val = key === 'reorder' ? Number(v) : String(v).trim();
    if (key === 'reorder' && !(val >= 0)) return toast('A reorder level is 0 or more', 'warn');
    await update((d) => { const byId = new Map(d.products.map((x) => [x.id, x])); putMany(d, 'products', rows.map((p) => ({ ...byId.get(p.id) || p, [key]: val }))); audit(d, user, 'Medicines changed', `${label} set to "${val}" for ${rows.length}: ${rows.slice(0, 5).map((p) => p.name).join(', ')}${rows.length > 5 ? '…' : ''}`, branchId); });
    toast(`${label} saved for ${rows.length}`); done();
  };
  // the list is open to anyone who may see stock; changing it needs medicines.manage (the cloud enforces the same)
  const manage = can('medicines.manage');
  const [packsFor, setPacksFor] = useState(null);
  const [tidy, setTidy] = useState(false);
  usePageMenu([manage && { label: 'Tidy names and merge look-alikes…', Icon: Wand2, run: () => setTidy(true) }, { label: 'Stock card', Icon: ScrollText, run: () => navigate('/stock-card') }]); // Tidy names: suggestions approved one by one (components/NameCheck.jsx)
  const [review, setReview] = useState(false);
  const dupBarcodes = useMemo(() => { const seen = new Set(), dup = new Set(); for (const p of products) if (p.barcode) (seen.has(p.barcode) ? dup : seen).add(p.barcode); return dup; }, [products]);
  const issueCount = useMemo(() => products.filter((p) => recordIssues(p, dupBarcodes).length).length, [products, dupBarcodes]);
  const s = db.settings;
  const fields = [
    { key: 'name', label: 'Medicine name', required: true },
    { key: 'generic', label: 'Generic name' },
    { key: 'category', label: 'Category / class' },
    { key: 'form', label: 'Formulation', type: 'select', options: db.formulations.map((f) => f.name) },
    { key: 'strength', label: 'Strength' },
    { key: 'unit', label: 'Selling unit', type: 'select', options: UNITS },
    // D1: checked as each field is left: a barcode another medicine has, a price under the cost, an expiry gone by
    { key: 'barcode', label: 'Barcode / SKU (blank = generate)', validate: (v, r) => (v && db.products.some((x) => x.barcode === String(v).trim() && x.id !== r.id) ? `Another medicine has this barcode (${db.products.find((x) => x.barcode === String(v).trim() && x.id !== r.id).name})` : '') },
    { key: 'cost', label: 'Cost price', type: 'money', required: true },
    { key: 'price', label: `Retail price (blank = cost +${s.retailMarkup}%)`, type: 'money', validate: (v, r) => (Number(v) > 0 && Number(r.cost) > Number(v) ? 'The retail price is below the cost' : '') },
    { key: 'wholesale', label: `Wholesale price (blank = cost +${s.wholesaleMarkup}%)`, type: 'money', help: HELP.wholesale, validate: (v, r) => (Number(v) > 0 && Number(r.cost) > Number(v) ? 'The wholesale price is below the cost' : '') },
    { key: 'reorder', label: 'Reorder level', type: 'number', help: HELP.reorder },
    { key: 'shelf', label: 'Shelf / location' },
    { key: 'photo', label: 'Photo', type: 'photo', full: true },
    { key: 'openingStock', label: 'Opening stock (quantity)', type: 'number', hidden: (r) => !r._new },
    { key: 'openingBatch', label: 'Opening stock batch no.', hidden: (r) => !r._new },
    { key: 'openingExpiry', label: 'Opening stock expiry', type: 'date', hidden: (r) => !r._new, validate: (v) => (v && v < today() ? 'This expiry date has passed' : '') },
    { key: 'rx', label: 'Prescription only (Rx)', type: 'checkbox' },
    { key: 'chronic', label: 'Chronic medicine (refill reminders)', type: 'checkbox' },
    { key: 'controlled', label: 'Controlled drug (register: patient & prescriber recorded at sale)', type: 'checkbox' },
  ];
  const onSave = (rec, isNew, before) => {
    const { openingStock, openingBatch, openingExpiry, totalStock, ...p } = rec;
    // batch/expiry shown in lists are derived from the batches; keep the product's own (legacy) values
    const orig = db.products.find((x) => x.id === p.id);
    p.batch = orig?.batch; p.expiry = orig?.expiry;
    if (!p.price) p.price = markupPrice(p.cost, s.retailMarkup, s.priceRound);
    if (!p.wholesale) p.wholesale = markupPrice(p.cost, s.wholesaleMarkup, s.priceRound);
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
    <>
    {packsFor && <PacksEditor product={packsFor} onClose={() => setPacksFor(null)} />}
    {tidy && <NameCheck onClose={() => setTidy(false)} />}
    <CrudPage
      title="Medicine List" singular="Medicine" table="products" rows={products} fields={fields} onSave={onSave} readOnly={!manage}
      deleteEffects={(rs) => { const n = rs.reduce((a, p) => a + db.batches.filter((b) => b.productId === p.id).length, 0); return n ? [`${n} batch${n === 1 ? '' : 'es'} and their history no longer listed under ${rs.length === 1 ? 'it' : 'them'}`] : []; }}
      subtitle={review ? `${issueCount.toLocaleString()} records need a look. Open one to fix it; nothing is changed automatically.` : `${products.length.toLocaleString()} medicines and items`}
      filter={review ? (p) => recordIssues(p, dupBarcodes).length > 0 : undefined}
      headExtra={<>
        <button type="button" className={'btn ' + (review ? 'primary' : 'ghost')} aria-pressed={review} onClick={() => setReview((r) => !r)} title="Records with missing or inconsistent details">Needs review{issueCount ? ` (${issueCount})` : ''}</button>
        {manage && <button type="button" className="btn ghost" onClick={() => setTidy(true)} title="Suggestions for consistent names (house style and AI); nothing changes until you approve"><Wand2 size={16} />Tidy names</button>}
      </>}
      blank={{ form: 'Tablets', unit: 'Piece', reorder: 10, rx: false }}
      extraActions={(p) => manage && <button className="btn sm ghost" title="Sell or receive by strip, box…" onClick={() => setPacksFor(p)}>Packs{p.packs?.length ? ` (${p.packs.length})` : ''}</button>}
      bulk={manage ? () => [{ label: 'Change price…', run: bulkPrice }, { label: 'Set category…', run: bulkField('category', 'Category') }, { label: 'Set reorder level…', run: bulkField('reorder', 'Reorder level') }] : undefined}
      rowMenu={(p) => [
        { label: 'Stock card', Icon: ScrollText, run: () => navigate('/stock-card', { state: { productId: p.id } }) },
        manage && { label: 'Packs (strip, box…)', Icon: Boxes, run: () => setPacksFor(p) },
      ].filter(Boolean)}
      board={{ groups: [['out', 'Out of stock', 'danger'], ['low', 'Running low', 'warn'], ['ok', 'In stock', 'ok']], of: (p) => (p.stock <= 0 ? 'out' : p.stock <= (p.reorder || 0) ? 'low' : 'ok') }}
      card={(p) => ({ title: p.name, sub: [p.generic, p.strength, p.form].filter(Boolean).join(' · '), value: fmt(p.price), art: <ProductArt p={p} size={56} />,
        chips: [[`${formatQty(p.stock)} in stock`, p.stock <= 0 ? 'danger' : p.stock <= (p.reorder || 0) ? 'warn' : 'ok'], p.rx && ['Rx'], p.controlled && ['CD', 'danger'], p.shelf && ['Shelf ' + p.shelf]].filter(Boolean) })}
      columns={[
        { label: 'Medicine', render: (p) => <><strong {...peek.bind(p)}>{p.name}</strong> {p.rx && <span className="badge">Rx</span>}{p.chronic && <span className="badge ok">Chronic</span>}{p.controlled && <span className="badge danger">CD</span>}<br /><small className="muted">{[p.generic, p.barcode].filter(Boolean).join(' · ')}</small>
          {review && <span className="status-tags">{recordIssues(p, dupBarcodes).map((x) => <span key={x} className="status warn"><i aria-hidden="true" />{x}</span>)}</span>}</> },
        { label: 'Strength', empty: (p) => !p.strength, render: (p) => p.strength || <span className="muted">—</span> },
        { label: 'Formulation', key: 'form' },
        { label: 'Category / class', empty: (p) => !p.category, render: (p) => p.category || <span className="muted">—</span> },
        { label: 'Sold as', render: (p) => <>{p.unit || <span className="muted">—</span>}{p.packs?.filter((k) => k.name && Number(k.size) > 1).map((k) => <small key={k.name} className="muted nowrap"><br />1 {k.name.toLowerCase()} = {k.size}</small>)}</> },
        { label: 'Cost', num: true, render: (p) => fmt(p.cost) },
        { label: 'Wholesale', num: true, empty: (p) => !Number(p.wholesale), render: (p) => fmt(p.wholesale) },
        { label: 'Retail', num: true, render: (p) => fmt(p.price) },
        { label: 'Stock', num: true, render: (p) => <span className={p.stock <= 0 ? 'badge danger' : p.stock <= (p.reorder || 0) ? 'badge warn' : ''}>{formatQty(p.stock)}</span> },
      ]}
    />
    {peek.node}
    </>
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
  const { db, products, fmt, batchesOf, branch, branchId, can, update, user } = useStore();
  const location = useLocation();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState(location.state?.filter || 'instock');
  const listRef = useRef(null);
  const [open, setOpen] = useState(null);
  const [editing, setEditing] = useState(null);
  const warn = db.settings.expiryWarnDays || 90;
  const multi = db.branches.length > 1;
  const ql = q.toLowerCase();
  // the list and its totals are worked out once per change of medicines, search or filter (not on every redraw)
  const rows = useMemo(() => products.filter((p) =>
    (!q || `${p.name} ${p.generic} ${p.barcode} ${p.category}`.toLowerCase().includes(ql)) &&
    (filter === 'all' || (filter === 'instock' && p.stock > 0) || (filter === 'low' && p.stock <= (p.reorder || 0) && p.stock > 0) || (filter === 'out' && p.stock <= 0))), [products, q, ql, filter]);
  const sv = useMemo(() => stockValue(rows, batchesOf), [rows, batchesOf]); // physical stock × the medicine's current cost, expired apart
  const counts = useMemo(() => products.reduce((c, p) => { if (p.stock > 0) { c.instock++; if (p.stock <= (p.reorder || 0)) c.low++; } else c.out++; return c; }, { instock: 0, low: 0, out: 0 }), [products]);
  const total = sv.value;
  const retail = useMemo(() => rows.reduce((a, p) => a + Math.max(p.stock, 0) * (p.price || 0), 0), [rows]);
  // step 26 (from the Flutter app): sorted and grouped by class, therapeutic area, form or shelf, per device
  const [order, setOrder] = useMedicineOrder();
  const [folded, toggleFold] = useFolded();
  // UI batch 3 (C): 100 rows then more (C7), columns (C2), ticks and a bottom bar (C4), edit in place (C5), arrow
  // keys (C6), the batches beside the list on wide screens (C8), a stock bar (C9)
  const page = useLoadMore(rows, { resetKey: q + '|' + filter + '|' + order });
  const shownRows = useMemo(() => groupedRows(page.rows, order, folded), [page.rows, order, folded]);
  const flat = useMemo(() => shownRows.filter((r) => r.heading === undefined).map((r) => r.p), [shownRows]);
  const searchRef = useRef(null);
  const wide = useWide();
  const lc = useListControls({ rows: flat, onOpen: (p) => setOpen(p), onEdit: can('inventory.edit') ? (p) => setEditing(p) : null, searchRef, onClearSearch: () => setQ('') });
  const colsK = useColumns('inventory', [{ id: 'name', label: 'Medicine', fixed: true }, { id: 'batch', label: 'Next batch' }, { id: 'expiry', label: 'Expiry' }, { id: 'shelf', label: 'Shelf' },
    { id: 'reorder', label: 'Reorder at' }, { id: 'stock', label: 'In stock' }, ...(multi ? [{ id: 'all', label: 'All branches' }] : []), { id: 'price', label: 'Retail price' }, { id: 'value', label: 'Value (cost)' }]);
  const cols = colsK.shown.length + 2 + (can('inventory.edit') ? 1 : 0);
  // C5: price (medicines.manage) and reorder level (inventory.edit) edited in the table; Enter saves, Esc cancels;
  // audited like the form
  const [cellEdit, setCellEdit] = useState(null); // { id, k, v }
  const canCell = (k) => (k === 'price' ? can('medicines.manage') : can('inventory.edit'));
  const saveCell = () => {
    const c = cellEdit; setCellEdit(null);
    if (!c) return;
    const v = Number(String(c.v).replace(/,/g, ''));
    if (!isFinite(v) || v < 0) return toast('Type a number of 0 or more', 'warn');
    update((d) => {
      const cur = d.products.find((x) => x.id === c.id);
      if (!cur || Number(cur[c.k] || 0) === v) return;
      put(d, 'products', { ...cur, [c.k]: v });
      audit(d, user, c.k === 'price' ? 'Price changed' : 'Inventory edited', c.k === 'price' ? `${cur.name}: ${fmt(cur.price)} → ${fmt(v)} (in the table)` : `${cur.name}: reorder level ${cur.reorder || 0} → ${v} (in the table)`, branchId);
    });
  };
  const cellFor = (p, k, text) => {
    if (cellEdit?.id === p.id && cellEdit.k === k) return (
      <span className="cell-edit"><input autoFocus inputMode="decimal" aria-label={k === 'price' ? `Retail price of ${p.name}` : `Reorder level of ${p.name}`} value={cellEdit.v} onClick={(e) => e.stopPropagation()}
        onChange={(e) => setCellEdit({ ...cellEdit, v: e.target.value })} onBlur={() => setCellEdit(null)}
        onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); saveCell(); } else if (e.key === 'Escape') { e.preventDefault(); setCellEdit(null); } }} /></span>
    );
    if (!canCell(k)) return text;
    return <span className="cell-editable" role="button" tabIndex={0} title="Click to change (Enter saves, Esc cancels)" data-cell={k}
      onClick={(e) => { e.stopPropagation(); setCellEdit({ id: p.id, k, v: String(p[k] || 0) }); }}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); e.preventDefault(); setCellEdit({ id: p.id, k, v: String(p[k] || 0) }); } }}>{text}</span>;
  };
  // C4: ticked medicines: labels, export, a new price
  const navigate = useNavigate();
  const changePrices = async () => {
    const list = lc.tickedRows;
    const t = await askText({ title: `New retail price for ${list.length} medicine${list.length === 1 ? '' : 's'}`, message: 'An amount (e.g. 1500), or a change in percent (e.g. +10% or -5%).', placeholder: '+10%', confirmText: 'Change prices' });
    if (t == null || !String(t).trim()) return;
    const m = String(t).trim().match(/^([+-]?\d+(?:\.\d+)?)\s*%$/), amount = Number(String(t).replace(/,/g, ''));
    if (!m && !(isFinite(amount) && amount >= 0)) return toast('Type an amount or a percent like +10%', 'warn');
    const dec = Number(db.settings.decimals ?? 0), f10 = 10 ** dec;
    update((d) => {
      for (const x of list) {
        const cur = d.products.find((y) => y.id === x.id);
        if (!cur) continue;
        const next = m ? Math.round((cur.price || 0) * (1 + Number(m[1]) / 100) * f10) / f10 : amount;
        if (next === cur.price) continue;
        put(d, 'products', { ...cur, price: next });
        audit(d, user, 'Price changed', `${cur.name}: ${fmt(cur.price)} → ${fmt(next)} (several at once)`, branchId);
      }
    });
    lc.clear();
    toast(`Prices changed for ${list.length} medicine${list.length === 1 ? '' : 's'}`);
  };
  const csvOf = (list) => toCSV(list.flatMap((p) => batchesOf(p.id).filter((b) => b.qty).map((b) => ({ name: p.name, generic: p.generic, form: p.form, batch: b.batch, expiry: b.expiry, qty: b.qty, cost: b.cost || p.cost, price: p.price, value: b.qty * (b.cost || p.cost) }))));
  const cellOf = (p) => ({
    batch: <td key="batch" data-label="Next batch" className="batch-cell">{p.batch || '—'}</td>,
    expiry: <td key="expiry" data-label="Expiry" className={'nowrap ' + expiryClass(p.expiry, warn)}>{p.expiry || '—'}</td>,
    shelf: <td key="shelf" data-label="Shelf">{p.shelf}</td>,
    reorder: <td key="reorder" data-label="Reorder at" className="num">{cellFor(p, 'reorder', p.reorder || 0)}</td>,
    stock: <td key="stock" data-label="In stock" className="num"><span className={'stock-pill badge ' + (p.stock <= 0 ? 'danger' : p.stock <= (p.reorder || 0) ? 'warn' : 'ok')}>{formatQty(p.stock)}</span><HealthBar stock={p.stock} reorder={p.reorder} /></td>,
    all: <td key="all" data-label="All branches" className="num muted">{p.totalStock}</td>,
    price: <td key="price" data-label="Retail price" className="num">{cellFor(p, 'price', fmt(p.price))}</td>,
    value: <td key="value" data-label="Value (cost)" className="num">{(() => { const v = batchValue(p, batchesOf); return <>{fmt(v.value)}{v.expired > 0 && <><br /><small className="text-danger">+ {fmt(v.expired)} expired</small></>}</>; })()}</td>,
  });
  const batchesTable = open && (
    <table>
      <thead><tr><th>Batch</th><th>Expiry</th><th>Received</th><th className="num">Cost</th><th className="num">Qty</th></tr></thead>
      <tbody>
        {batchesOf(open.id).filter((b) => b.qty !== 0).map((b, i) => (
          <tr key={b.id}><td>{b.batch} {i === 0 && b.qty > 0 && <span className="badge ok">Sells next</span>}</td><td className={'nowrap ' + expiryClass(b.expiry, warn)}>{b.expiry || '—'}</td><td>{b.received || '—'}</td><td className="num">{fmt(b.cost || open.cost)}</td><td className="num">{formatQty(b.qty)}</td></tr>
        ))}
        {!batchesOf(open.id).some((b) => b.qty) && <Empty colSpan={5} action={can('stock.receive') ? { label: 'Add stock', to: '/add-stock' } : undefined}>No stock of this medicine at this branch. Receive it with Add Stock.</Empty>}
      </tbody>
    </table>
  );
  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Inventory</h1><div className="sub">{branch?.name} · {rows.length.toLocaleString()} items · {fmt(total)} at cost · {fmt(retail)} at retail{sv.expired > 0 && <> · <span className="text-danger">{fmt(sv.expired)} expired (not included)</span></>}</div></div>
        <div className="row gap">
          <MedicineOrderPicker value={order} onChange={setOrder} />
          <SearchBox value={q} onChange={setQ} inputRef={searchRef} />
          {colsK.button}
          <ExportMenu>
          <button className="btn ghost" onClick={() => downloadFile('inventory.csv', csvOf(rows), 'text/csv')}><Download size={16} />CSV</button>
          <PdfButton target={listRef} title={{ instock: 'Stock in hand', low: 'Low stock', out: 'Out of stock', all: 'All medicines' }[filter]} subtitle={`${branch?.name || ''} · ${rows.length} items · ${fmt(total)} at cost · ${fmt(retail)} at retail${sv.expired > 0 ? ` · ${fmt(sv.expired)} expired (not included)` : ''}`} />
          </ExportMenu>
        </div>
      </div>
      <div className="list-filters">
        <FilterChips label="Show" value={filter} onChange={setFilter} options={[['instock', 'In stock', counts.instock], ['low', 'Low stock', counts.low], ['out', 'Out of stock', counts.out], ['all', 'All', products.length]]} />
      </div>
      <div className={'list-and-details' + (open && wide ? ' with-details' : '')}>
      <div className="card table-wrap" ref={listRef}>
        <table className="phone-rows">
          <thead><tr><th className="tick"><input {...lc.allProps} /></th>{colsK.shown.map((id) => <th key={id} className={['reorder', 'stock', 'all', 'price', 'value'].includes(id) ? 'num' : ''}>{{ name: 'Medicine', batch: 'Next batch', expiry: 'Expiry', shelf: 'Shelf', reorder: 'Reorder at', stock: 'In stock', all: 'All branches', price: 'Retail price', value: 'Value (cost)' }[id]}</th>)}{can('inventory.edit') && <th />}</tr></thead>
          <tbody>
            {shownRows.map((r) => r.heading !== undefined ? <GroupHeadingRow key={'g:' + r.heading} row={r} colSpan={cols} onToggle={() => toggleFold(r.heading)} /> : (({ p }) => { const i = flat.indexOf(p); const rp = lc.rowProps(p, i); const c = cellOf(p); return (
              <tr key={p.id} {...rp} className={[rp.className, open?.id === p.id && wide ? 'row-open' : ''].filter(Boolean).join(' ')} onClick={(e) => { rp.onClick(e); if (!e.target.closest('button, a, input, select, label, .cell-editable')) setOpen(p); }} style={{ cursor: 'pointer' }}>
                <td className="tick" onClick={(e) => e.stopPropagation()}><input {...lc.tickProps(p, i)} /></td>
                <td className="row-title"><strong>{p.name}</strong><br /><small className="muted">{p.form}</small><StockStatus p={p} warn={warn} /></td>
                {colsK.shown.filter((id) => id !== 'name').map((id) => c[id])}
                {can('inventory.edit') && <td className="actions"><button className="btn sm ghost" onClick={(e) => { e.stopPropagation(); setEditing(p); }}><Pencil size={14} />Edit</button></td>}
              </tr>
            ); })(r))}
            {!rows.length && <Empty colSpan={cols} action={!products.length && can('medicines.manage') ? { label: 'Add a medicine', to: '/medicines' } : can('stock.receive') && filter !== 'low' ? { label: 'Add stock', to: '/add-stock' } : undefined}>
              {q ? `Nothing matches “${q}”. Try the generic name or the barcode.` : { instock: 'No medicines in stock yet. Stock you receive with Add Stock shows here with its batches and value.', low: 'Nothing is low on stock: every medicine is above its reorder level.', out: 'Nothing is out of stock.', all: 'No medicines yet. Add your medicines, then receive stock.' }[filter]}</Empty>}
          </tbody>
          {rows.length > 0 && colsK.has('value') && <tfoot><tr className="total-row"><td colSpan={colsK.shown.indexOf('value') + 1}>Inventory value · {rows.length.toLocaleString()} items</td><td className="num">{fmt(total)}</td><td colSpan={Math.max(1, cols - colsK.shown.indexOf('value') - 2)} /></tr></tfoot>}
        </table>
        {page.footer}
      </div>
      {open && wide && <DetailsPane wide title={`${open.name} – batches at ${branch?.name}`} onClose={() => setOpen(null)}>{batchesTable}</DetailsPane>}
      </div>
      <BulkBar count={lc.ticked.size} onClear={lc.clear} actions={[
        can('medicines.manage') && { label: 'Print labels', Icon: BarcodeIcon, run: () => navigate('/labels', { state: { productIds: lc.tickedRows.map((p) => p.id) } }) },
        { label: 'Export', Icon: Download, run: () => downloadFile('inventory.csv', csvOf(lc.tickedRows), 'text/csv') },
        can('medicines.manage') && { label: 'Change price', Icon: Tag, run: changePrices },
      ]} />
      {editing && <InventoryEditor product={editing} onClose={() => setEditing(null)} />}
      {open && !wide && <DetailsPane title={`${open.name} – batches at ${branch?.name}`} onClose={() => setOpen(null)}>{batchesTable}</DetailsPane>}
    </div>
  );
}

/** Soon expiring / expired — per batch, so a medicine with several deliveries shows each lot separately. */
export function Expiry() {
  const { db, products, update, fmt, user, batchesOf, branchId, can } = useStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [tab, setTab] = useState(location.state?.tab === 'expired' ? 'expired' : 'soon');
  const expRef = useRef(null);
  const warn = db.settings.expiryWarnDays || 90;
  const rows = useMemo(() => products.filter((p) => p.stock > 0).flatMap((p) => batchesOf(p.id).filter((b) => b.qty > 0 && b.expiry).map((b) => ({ ...b, p, days: daysUntil(b.expiry) })))
    .filter((r) => (tab === 'expired' ? r.days < 0 : r.days >= 0 && r.days <= warn))
    .sort((a, b) => a.expiry.localeCompare(b.expiry)), [products, batchesOf, tab, warn]);
  const [busy, setBusy] = useState(''); // the batch being written off (its button is disabled until it is saved)
  // F1: List | Calendar, kept on this device; the calendar shows every batch in stock with an expiry
  const [view, setViewState] = useState(() => deviceSettings().expiryView || 'list');
  const setView = (v) => { setViewState(v); setDevice({ expiryView: v }); };
  const allBatches = useMemo(() => products.filter((p) => p.stock > 0).flatMap((p) => batchesOf(p.id).filter((b) => b.qty > 0 && b.expiry).map((b) => ({ ...b, p, days: daysUntil(b.expiry) }))), [products, batchesOf]);
  const writeOff = async (r) => {
    if (busy) return;
    if (!(await ask({ title: 'Write off expired stock?', message: `${r.qty} × ${r.p.name} (batch ${r.batch}) will be removed from stock.`, effects: [`${r.qty} taken off batch ${r.batch}`, `a write-off of ${fmt(r.qty * (r.cost || r.p.cost || 0))} at cost in the stock card and the audit log`], confirmText: 'Write off', danger: true }))) return;
    setBusy(r.p.id + r.id);
    try {
      await update((d) => {
        move(d, { productId: r.p.id, qty: -r.qty, type: 'Expired write-off', ref: r.batch, user: user.name, batchId: r.legacy ? null : r.id, branchId });
        audit(d, user, 'Expired write-off', `${r.p.name} batch ${r.batch}: ${r.qty} units (${fmt(r.qty * (r.cost || r.p.cost))})`, branchId);
      });
    } catch (e) { return toast(`${r.p.name} batch ${r.batch} was NOT written off: ${e.message}`, 'error'); }
    finally { setBusy(''); }
    toast(`${r.p.name} batch ${r.batch} written off`);
  };
  return (
    <div className="page">
      <div className="page-head"><div><h1>Expiring / Expired</h1><div className="sub">{rows.length} batches · {fmt(rows.reduce((a, r) => a + r.qty * (r.cost || r.p.cost), 0))} at cost</div></div>
        <PdfButton target={expRef} title={tab === 'expired' ? 'Expired stock' : `Expiring within ${warn} days`} subtitle={`${rows.length} batches in stock · ${fmt(rows.reduce((a, r) => a + r.qty * (r.cost || r.p.cost), 0))} at cost`} /></div>
      <div className="list-filters">
        {view === 'list' && <FilterChips label="Show" value={tab} onChange={setTab} options={[['soon', `Expiring within ${warn} days`], ['expired', 'Expired']]} />}
        <div className="seg" role="radiogroup" aria-label="View">{[['list', 'List'], ['calendar', 'Calendar']].map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={view === k} className={view === k ? 'on' : ''} onClick={() => setView(k)}>{l}</button>)}</div>
      </div>
      {view === 'calendar' && <ExpiryCalendar batches={allBatches} warn={warn} onOpen={(b) => navigate('/stock-card', { state: { productId: b.p.id } })} />}
      {view === 'list' && <div className="card table-wrap" ref={expRef}>
        <table className="phone-rows">
          <thead><tr><th>Medicine</th><th>Batch</th><th>Expiry</th><th>When</th><th className="num">Qty</th><th className="num">Value</th><th /></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.p.id + r.id}>
                <td className="row-title"><strong>{r.p.name}</strong></td><td data-label="Batch" className="batch-cell">{r.batch}</td><td data-label="Expiry" className={'nowrap ' + expiryClass(r.expiry, warn)}>{r.expiry}</td>
                <td data-label="When" className={'nowrap ' + expiryClass(r.expiry, warn)}>{r.days < 0 ? `${-r.days} days ago` : r.days === 0 ? 'today' : `in ${r.days} days`}</td>
                <td data-label="Qty" className="num">{formatQty(r.qty)}</td><td data-label="Value" className="num">{fmt(r.qty * (r.cost || r.p.cost))}</td>
                <td className="actions">
                  {(can('stock.receive') || can('stock.adjust')) && <button className="btn sm ghost" title="Send it back to the supplier for a credit note or refund" onClick={() => navigate('/returns', { state: { returnBatch: { productId: r.p.id, batchId: r.id, reason: r.days < 0 ? 'Expired' : 'Short expiry' } } })}>Return</button>}
                  {tab === 'expired' && can('stock.adjust') && <button className="btn sm danger" disabled={!!busy} onClick={() => writeOff(r)}>{busy === r.p.id + r.id ? 'Writing off…' : 'Write off'}</button>}
                </td>
              </tr>
            ))}
            {!rows.length && <Empty colSpan={7}>{tab === 'expired' ? 'No expired stock 🎉' : 'Nothing expiring soon 🎉'}</Empty>}
          </tbody>
        </table>
      </div>}
    </div>
  );
}

/** Spreadsheet-style editing of prices, reorder levels, shelf and barcode. */
export function QuickEdit() {
  const { db, products, update, fmt, user, branchId } = useStore();
  const [q, setQ] = useState('');
  const [edits, setEdits] = useState({});
  const ql = q.toLowerCase();
  // Only medicines this pharmacy actually has (not the whole built-in catalog)
  const stocked = products.filter((p) => p.stock > 0 || p.totalStock > 0);
  const rows = stocked.filter((p) => !q || `${p.name} ${p.generic} ${p.barcode}`.toLowerCase().includes(ql)).slice(0, 300);
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
        <div><h1>Quick Edit</h1><div className="sub">{stocked.length.toLocaleString()} medicines in stock · edit many prices at once, then save</div></div>
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
            {!rows.length && <Empty colSpan={8}>{stocked.length ? 'Nothing matches' : 'No medicines in stock yet. Receive stock with Add Stock first.'}</Empty>}
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
  const { db, products, update, user, batchesOf, branchId, branch, can } = useStore();
  const location = useLocation();
  const stocked = useMemo(() => products.filter((x) => x.stock > 0 || x.totalStock > 0), [products]);
  const [id, setId] = useState(location.state?.productId || stocked[0]?.id || '');
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
  // Only medicines in stock (plus the one opened from elsewhere), not the whole built-in catalog
  const options = stocked.filter((x) => !q || `${x.name} ${x.generic || ''} ${x.barcode || ''}`.toLowerCase().includes(ql)).slice(0, 300);
  if (p && !options.some((x) => x.id === p.id)) options.unshift(p);

  const saving = useRef(false); // a second tap on Save while it is being saved must not record it twice
  const saveAdjust = (e) => {
    e.preventDefault();
    if (saving.current) return;
    const b = batches.find((x) => x.id === adjust.batchId);
    let batchId = b && !b.legacy ? b.id : null;
    const counted = Number(adjust.counted);
    const diff = adjust.mode === 'count' ? counted - (b?.qty || 0) : Number(adjust.qty) * (adjust.mode === 'remove' ? -1 : 1);
    if (!diff) return setAdjust(null);
    // Remove: never more than a batch holds (a batch going negative while others still have stock hides stock and value);
    // what the chosen batch doesn't have comes from the medicine's other batches, earliest expiry first
    let parts = null;
    if (adjust.mode === 'remove') {
      try { parts = removalSplit(batches, adjust.batchId, -diff); } catch (err) { toast(err.message, 'error'); return; }
    }
    saving.current = true;
    update((d) => {
      if (adjust.mode === 'add' && adjust.batchId === 'new') batchId = addBatch(d, { productId: p.id, batch: adjust.newBatch, expiry: adjust.newExpiry, cost: p.cost }).id;
      const type = adjust.mode === 'count' ? 'Stock count' : 'Adjustment';
      if (parts) for (const x of parts) move(d, { productId: p.id, qty: -x.qty, type, note: adjust.reason, user: user.name, batchId: x.batchId, branchId });
      else move(d, { productId: p.id, qty: diff, type, note: adjust.reason, user: user.name, batchId, branchId });
      const where = parts ? parts.map((x) => `${x.batch || '—'} −${x.qty}`).join(', ') : b?.batch || adjust.newBatch || '';
      audit(d, user, adjust.mode === 'count' ? 'Stock count' : 'Stock adjusted', `${p.name} ${where}: ${diff > 0 ? '+' : ''}${diff} (${adjust.reason})`, branchId);
    });
    toast('Stock updated');
    setAdjust(null);
    setTimeout(() => { saving.current = false; }, 800);
  };

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Stock Card</h1><div className="sub">{branch?.name} · {stocked.length.toLocaleString()} medicines in stock</div></div>
        <div className="row gap">
          <SearchBox value={q} onChange={setQ} placeholder="Find medicine…" />
          <select value={id} onChange={(e) => setId(e.target.value)}>{options.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
          {p && p.stock > 0 && can('stock.adjust') && <button className="btn primary" onClick={() => { const first = batches.find((x) => x.qty > 0) || batches[0]; setAdjust({ mode: 'count', batchId: first?.id || 'new', counted: first?.qty || 0, qty: 1, reason: '', newBatch: '', newExpiry: '' }); }}><SlidersHorizontal size={16} />Count / adjust</button>}
        </div>
      </div>
      {p && (
        <div className="stats">
          <div className="card stat"><small>In stock here</small><strong>{p.stock}</strong><span className="muted small">{p.unit || 'units'}</span></div>
          {batches.filter((b) => b.qty).slice(0, 3).map((b) => (
            <div key={b.id} className="card stat"><small>Batch {b.batch}</small><strong>{formatQty(b.qty)}</strong><span className={'small ' + expiryClass(b.expiry, db.settings.expiryWarnDays || 90)}>Expires {b.expiry || '—'}</span></div>
          ))}
        </div>
      )}
      <div className="card table-wrap">
        <table>
          <thead><tr><th>Date</th><th>Type</th><th>Batch</th><th>Reference</th><th>By</th><th className="num">In</th><th className="num">Out</th><th className="num">Balance</th></tr></thead>
          <tbody>
            {lines.slice().reverse().slice(0, 500).map((m) => (
              <tr key={m.id}>
                <td>{new Date(m.date).toLocaleString(dateLocale(), { dateStyle: 'medium', timeStyle: 'short' })}</td><td>{m.type}</td><td>{m.batchId ? batchName[m.batchId] || '—' : p?.batch || '—'}</td>
                <td>{m.ref}{m.note ? ` (${m.note})` : ''}</td><td>{m.user}</td>
                <td className="num text-ok">{m.qty > 0 ? formatQty(m.qty) : ''}</td><td className="num text-danger">{m.qty < 0 ? formatQty(-m.qty) : ''}</td><td className="num"><strong>{formatQty(m.bal)}</strong></td>
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
                {batches.filter((b) => b.qty > 0 || adjust.mode === 'add').map((b) => <option key={b.id} value={b.id}>{b.batch} · exp {b.expiry || '—'} · {b.qty} in stock</option>)}
                {adjust.mode === 'add' && <option value="new">+ New batch…</option>}
              </select>
            </label>
            {adjust.mode === 'add' && adjust.batchId === 'new' && (
              <div className="form-grid">
                <label className="field"><span>Batch no.</span><input value={adjust.newBatch} onChange={(e) => setAdjust({ ...adjust, newBatch: e.target.value })} required /></label>
                <label className="field"><span>Expiry</span><DateInput monthYear value={adjust.newExpiry} onChange={(v) => setAdjust({ ...adjust, newExpiry: v })} required /></label>
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

/** Admin & manager: edit an item's details and its batches (number, expiry, quantity) in one place */
function InventoryEditor({ product, onClose }) {
  const { fmt, update, user, batchesOf, branchId } = useStore();
  const [p, setP] = useState(() => ({ name: product.name, generic: product.generic || '', form: product.form || '', cost: product.cost || 0, wholesale: product.wholesale || 0, price: product.price || 0, reorder: product.reorder || 0, shelf: product.shelf || '' }));
  const [rows, setRows] = useState(() => batchesOf(product.id).filter((b) => b.qty !== 0).map((b) => ({ ...b, newQty: b.qty, newBatch: b.batch, newExpiry: b.expiry || '' })));
  const [reason, setReason] = useState('');
  const setRow = (k, patch) => setRows((r) => r.map((x, n) => (n === k ? { ...x, ...patch } : x)));
  const save = (e) => {
    e.preventDefault();
    const qtyChanges = rows.filter((r) => Number(r.newQty) !== r.qty);
    if (qtyChanges.length && !reason.trim()) return toast('Give a reason for the quantity change', 'warn');
    update((d) => {
      const cur = d.products.find((x) => x.id === product.id) || product;
      const num = (v) => Number(v) || 0;
      const next = { ...cur, ...p, cost: num(p.cost), wholesale: num(p.wholesale), price: num(p.price), reorder: num(p.reorder) };
      put(d, 'products', next);
      if (next.price !== cur.price) audit(d, user, 'Price changed', `${cur.name}: ${fmt(cur.price)} → ${fmt(next.price)} (inventory edit)`, branchId);
      for (const r of rows) {
        if (!r.legacy && (r.newBatch !== r.batch || r.newExpiry !== (r.expiry || ''))) {
          const b = d.batches.find((x) => x.id === r.id);
          if (b) put(d, 'batches', { ...b, batch: r.newBatch.trim() || b.batch, expiry: r.newExpiry });
        }
        const diff = Math.round(Number(r.newQty) || 0) - r.qty;
        if (diff) move(d, { productId: product.id, qty: diff, type: 'Inventory edit', note: reason.trim(), user: user.name, batchId: r.legacy ? null : r.id, branchId });
      }
      audit(d, user, 'Inventory edited', `${next.name}${qtyChanges.length ? `: ${qtyChanges.map((r) => `${r.batch} ${r.qty}→${r.newQty}`).join(', ')} (${reason.trim()})` : ''}`, branchId);
    });
    toast(`${p.name} saved`);
    onClose();
  };
  const f = (k, label, type = 'text') => <label className="field"><span>{label}</span><input type={type} step="any" value={p[k]} onChange={(e) => setP({ ...p, [k]: e.target.value })} /></label>;
  return (
    <Modal title={`Edit ${product.name}`} onClose={onClose} wide>
      <form onSubmit={save} className="stack">
        <div className="form-grid">
          {f('name', 'Name')}{f('generic', 'Generic name')}{f('form', 'Formulation')}{f('shelf', 'Shelf / location')}
          {f('cost', 'Cost price', 'number')}{f('wholesale', 'Wholesale price', 'number')}{f('price', 'Retail price', 'number')}{f('reorder', 'Reorder level', 'number')}
        </div>
        <h3>Batches at this branch</h3>
        <table className="lines">
          <thead><tr><th>Batch no.</th><th>Expiry</th><th className="num">System qty</th><th>Actual qty</th></tr></thead>
          <tbody>
            {rows.map((r, k) => (
              <tr key={r.id}>
                <td><input value={r.newBatch} disabled={r.legacy} onChange={(e) => setRow(k, { newBatch: e.target.value })} /></td>
                <td><DateInput monthYear value={r.newExpiry} disabled={r.legacy} onChange={(v) => setRow(k, { newExpiry: v })} /></td>
                <td className="num">{r.qty}</td>
                <td><input type="number" min="0" aria-label="Actual qty" value={r.newQty} onChange={(e) => setRow(k, { newQty: e.target.value })} /></td>
              </tr>
            ))}
            {!rows.length && <Empty colSpan={4}>No stock at this branch. Use Add Stock to receive it.</Empty>}
          </tbody>
        </table>
        <label className="field"><span>Reason for quantity changes (kept in the audit log)</span><input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. stock take, damaged, found extra" /></label>
        <div className="form-actions"><button type="button" className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary">Save</button></div>
      </form>
    </Modal>
  );
}

/**
 * Pack sizes for a medicine: stock is always kept in its smallest unit (e.g. tablets); a pack is a number of those
 * units with its own price (blank = unit price × size). The POS can sell, and Add Stock receive, by pack.
 */
export function PacksEditor({ product, onClose }) {
  const { update, user, branchId, fmt } = useStore();
  const [rows, setRows] = useState(() => (product.packs?.length ? product.packs : [{ name: 'Strip', size: 10, price: '' }]).map((k) => ({ ...k, price: k.price ?? '' })));
  const unit = product.unit || 'Unit';
  const set = (n, patch) => setRows((r) => r.map((x, i) => (i === n ? { ...x, ...patch } : x)));
  const save = (e) => {
    e.preventDefault();
    const packs = rows.filter((k) => k.name.trim() && Number(k.size) > 1).map((k) => ({ name: k.name.trim(), size: Math.round(Number(k.size)), price: k.price === '' ? null : Number(k.price) || null }));
    if (new Set(packs.map((k) => k.name.toLowerCase())).size !== packs.length) return toast('Each pack needs its own name', 'warn');
    update((d) => {
      const cur = d.products.find((x) => x.id === product.id) || product;
      const { stock, totalStock, ...rest } = cur;
      put(d, 'products', { ...rest, packs });
      audit(d, user, 'Pack sizes changed', `${product.name}: ${packs.map((k) => `${k.name} = ${k.size} ${unit}`).join(', ') || 'none'}`, branchId);
    });
    toast(`${product.name}: pack sizes saved`);
    onClose();
  };
  return (
    <Modal title={`Pack sizes – ${product.name}`} onClose={onClose}>
      <form className="stack" onSubmit={save}>
        <p className="muted small">Stock is counted in <strong>{unit}</strong>s ({fmt(product.price)} each). Add the packs you sell or receive, e.g. Strip = 10, Box = 100. Leave the price blank for {unit.toLowerCase()} price × size.</p>
        <table className="lines">
          <thead><tr><th>Pack name</th><th>{unit}s in it</th><th>Pack price</th><th /></tr></thead>
          <tbody>
            {rows.map((k, n) => (
              <tr key={n}>
                <td><input value={k.name} onChange={(e) => set(n, { name: e.target.value })} placeholder="Strip / Box / Bottle" aria-label="Pack name" /></td>
                <td><input type="number" min="2" value={k.size} onChange={(e) => set(n, { size: e.target.value })} aria-label="Units in the pack" /></td>
                <td><input type="number" min="0" step="any" value={k.price} placeholder={String((product.price || 0) * (Number(k.size) || 0))} onChange={(e) => set(n, { price: e.target.value })} aria-label="Pack price" /></td>
                <td><button type="button" className="icon-btn" aria-label="Remove pack" onClick={() => setRows((r) => r.filter((_, i) => i !== n))}>×</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <button type="button" className="btn sm ghost" onClick={() => setRows((r) => [...r, { name: '', size: '', price: '' }])}>+ Add pack</button>
        <div className="form-actions"><button type="button" className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary">Save packs</button></div>
      </form>
    </Modal>
  );
}

import { useState, useMemo, useRef, useEffect } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { Download, Barcode as BarcodeIcon, SlidersHorizontal, Save, Undo2, Pencil, ScrollText, Boxes, Tag, Wand2, AlertTriangle } from 'lucide-react';
import { CrudPage, Tabs, Modal, SearchBox, Empty, PdfButton, FilterChips, ExportMenu, useSort } from '../ui.jsx';
import { useStore, today, daysUntil, put, move, addBatch, audit, downloadFile, toCSV, batchValue, stockValue, markupPrice, MAIN_BRANCH, putMany, now } from '../store.jsx';
import { ask, askText, toast } from '../feedback.jsx';
import { formatQty } from '../money.js';
import { removalSplit } from '../fefo.js';
import { newInternalBarcode } from '../barcode.jsx';
import { useHoverCard, useListControls } from '../listcontrols.jsx';
import { HELP } from '../forms.jsx';
import ExpiryCalendar from '../components/ExpiryCalendar.jsx';
import { deviceSettings, setDevice } from '../device.js';
import { useLoadMore, useColumns, ColTh, BulkBar, useWide, DetailsPane, HealthBar } from '../tablekit.jsx';
import { DataTable } from '../datatable.jsx';
import { ProductArt } from '../idleart.jsx';
import { useMedicineOrder, MedicineOrderPicker, groupedRows, useFolded, GroupHeadingRow } from '../medgroups.jsx';
import { BranchStockList } from '../components/BranchStock.jsx';
import { dateLocale } from '../showdate.js';
import { DateInput } from '../fields.jsx';
import NameCheck from '../components/NameCheck.jsx';
import { usePageMenu } from '../pagemenu.js';
import { packsOf, soldLoose, unitPresets, unitChange } from '../packs.js';
import { packSlip, packText, lotChange } from '../stockcount.js';
import { useManagerApproval, useApprovalBox, ReasonFields } from '../components/ManagerApproval.jsx';
import { lossLimit, lossOf, needsApproval, reasonReady, reasonNote, adjustmentBurst, BURST_ADJUSTMENTS } from '../stockcontrol.js';

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
    // the unit stock is counted in; once there is stock, a different unit converts it (Selling units → Change unit of issue)
    { key: 'unit', label: 'Stock unit (smallest sold)', type: 'select', options: UNITS, validate: (v, r) => { const was = products.find((x) => x.id === r.id); return was && was.unit && v !== was.unit && (was.totalStock || 0) !== 0 ? `${was.name} has stock counted in ${was.unit}s. To count it in ${v}s, use Selling units → Change unit of issue (it converts the stock and prices)` : ''; } },
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
      extraActions={(p) => manage && <button className="btn sm ghost" title="Sell by tablet, pair, half strip, strip, box…" onClick={() => setPacksFor(p)}>Selling units{p.packs?.length ? ` (${p.packs.length})` : ''}</button>}
      bulk={manage ? () => [{ label: 'Change price…', run: bulkPrice }, { label: 'Set category…', run: bulkField('category', 'Category') }, { label: 'Set reorder level…', run: bulkField('reorder', 'Reorder level') }] : undefined}
      rowMenu={(p) => [
        { label: 'Stock card', Icon: ScrollText, run: () => navigate('/stock-card', { state: { productId: p.id } }) },
        manage && { label: 'Selling units (pair, strip, box…)', Icon: Boxes, run: () => setPacksFor(p) },
      ].filter(Boolean)}
      board={{ groups: [['out', 'Out of stock', 'danger'], ['low', 'Running low', 'warn'], ['ok', 'In stock', 'ok']], of: (p) => (p.stock <= 0 ? 'out' : p.stock <= (p.reorder || 0) ? 'low' : 'ok') }}
      card={(p) => ({ title: p.name, sub: [p.generic, p.strength, p.form].filter(Boolean).join(' · '), value: fmt(p.price), art: <ProductArt p={p} size={56} />,
        chips: [[`${formatQty(p.stock)} in stock`, p.stock <= 0 ? 'danger' : p.stock <= (p.reorder || 0) ? 'warn' : 'ok'], p.rx && ['Rx'], p.controlled && ['CD', 'danger'], p.shelf && ['Shelf ' + p.shelf]].filter(Boolean) })}
      columns={[
        { label: 'Medicine', sortBy: (p) => p.name, render: (p) => <><strong {...peek.bind(p)}>{p.name}</strong> {p.rx && <span className="badge">Rx</span>}{p.chronic && <span className="badge ok">Chronic</span>}{p.controlled && <span className="badge danger">CD</span>}<br /><small className="muted">{[p.generic, p.barcode].filter(Boolean).join(' · ')}</small>
          {review && <span className="status-tags">{recordIssues(p, dupBarcodes).map((x) => <span key={x} className="status warn"><i aria-hidden="true" />{x}</span>)}</span>}</> },
        { label: 'Strength', sortBy: (p) => p.strength, empty: (p) => !p.strength, render: (p) => p.strength || <span className="muted">—</span> },
        { label: 'Formulation', key: 'form' },
        { label: 'Category / class', sortBy: (p) => p.category, empty: (p) => !p.category, render: (p) => p.category || <span className="muted">—</span> },
        { label: 'Sold as', sortBy: (p) => p.unit, render: (p) => <>{p.unit || <span className="muted">—</span>}{p.loose === false && <small className="muted"> (not loose)</small>}{p.packs?.filter((k) => k.name && Number(k.size) > 1).map((k) => <small key={k.name} className="muted nowrap"><br />1 {k.name.toLowerCase()} = {k.size}</small>)}</> },
        { label: 'Cost', num: true, sortBy: (p) => Number(p.cost) || 0, render: (p) => fmt(p.cost) },
        { label: 'Wholesale', num: true, sortBy: (p) => Number(p.wholesale) || 0, empty: (p) => !Number(p.wholesale), render: (p) => fmt(p.wholesale) },
        { label: 'Retail', num: true, sortBy: (p) => Number(p.price) || 0, render: (p) => fmt(p.price) },
        { label: 'Stock', num: true, sortBy: (p) => Number(p.stock) || 0, render: (p) => <span className={p.stock <= 0 ? 'badge danger' : p.stock <= (p.reorder || 0) ? 'badge warn' : ''}>{formatQty(p.stock)}</span> },
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
      columns={[{ label: 'Name', key: 'name' }, { label: 'Description', key: 'description' }, { label: 'Medicines', num: true, sortBy: (f) => count[f.name] || 0, render: (f) => count[f.name] || 0 }]}
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
  const [unitsFor, setUnitsFor] = useState(null);
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
  // the shared table (2026-11-26): click a heading to sort by it (inside each group when grouped); kept on this device
  const sorted = useSort(rows, { name: (p) => p.name, batch: (p) => p.batch || '', expiry: (p) => p.expiry || '', shelf: (p) => p.shelf || '', reorder: (p) => Number(p.reorder) || 0,
    stock: (p) => Number(p.stock) || 0, all: (p) => Number(p.totalStock) || 0, price: (p) => Number(p.price) || 0, value: (p) => batchValue(p, batchesOf).value }, null, 1, 'inventory');
  const page = useLoadMore(sorted.rows, { resetKey: q + '|' + filter + '|' + order + '|' + sorted.by + '|' + sorted.dir });
  const shownRows = useMemo(() => groupedRows(page.rows, order, folded), [page.rows, order, folded]);
  const flat = useMemo(() => shownRows.filter((r) => r.heading === undefined).map((r) => r.p), [shownRows]);
  const searchRef = useRef(null);
  const wide = useWide();
  const lc = useListControls({ rows: flat, onOpen: (p) => setOpen(p), onEdit: can('inventory.edit') ? (p) => setEditing(p) : null, searchRef, onClearSearch: () => setQ('') });
  const colsK = useColumns('inventory', [{ id: 'name', label: 'Medicine', fixed: true }, { id: 'batch', label: 'Next batch' }, { id: 'expiry', label: 'Expiry' }, { id: 'shelf', label: 'Shelf' },
    { id: 'reorder', label: 'Reorder at' }, { id: 'stock', label: 'In stock' }, ...(multi ? [{ id: 'all', label: 'All branches' }] : []), { id: 'price', label: 'Retail price' }, { id: 'value', label: 'Value (cost)' }]);
  const cols = colsK.shown.length + 2 + (can('inventory.edit') || can('medicines.manage') ? 1 : 0);
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
          <thead><tr><th className="tick"><input {...lc.allProps} /></th>{colsK.shown.map((id) => <ColTh key={id} cols={colsK} id={id} sort={sorted} k={id} className={['reorder', 'stock', 'all', 'price', 'value'].includes(id) ? 'num' : ''}>{{ name: 'Medicine', batch: 'Next batch', expiry: 'Expiry', shelf: 'Shelf', reorder: 'Reorder at', stock: 'In stock', all: 'All branches', price: 'Retail price', value: 'Value (cost)' }[id]}</ColTh>)}{(can('inventory.edit') || can('medicines.manage')) && <th />}</tr></thead>
          <tbody>
            {shownRows.map((r) => r.heading !== undefined ? <GroupHeadingRow key={'g:' + r.heading} row={r} colSpan={cols} onToggle={() => toggleFold(r.heading)} /> : (({ p }) => { const i = flat.indexOf(p); const rp = lc.rowProps(p, i); const c = cellOf(p); return (
              <tr key={p.id} {...rp} className={[rp.className, open?.id === p.id && wide ? 'row-open' : ''].filter(Boolean).join(' ')} onClick={(e) => { rp.onClick(e); if (!e.target.closest('button, a, input, select, label, .cell-editable')) setOpen(p); }} style={{ cursor: 'pointer' }}>
                <td className="tick" onClick={(e) => e.stopPropagation()}><input {...lc.tickProps(p, i)} /></td>
                <td className="row-title"><strong>{p.name}</strong><br /><small className="muted">{p.form}</small><StockStatus p={p} warn={warn} /></td>
                {colsK.shown.filter((id) => id !== 'name').map((id) => c[id])}
                {(can('inventory.edit') || can('medicines.manage')) && <td className="actions">{can('inventory.edit') && <button className="btn sm ghost" onClick={(e) => { e.stopPropagation(); setEditing(p); }}><Pencil size={14} />Edit</button>}{can('medicines.manage') && <button className="btn sm ghost" title="Sell by tablet, pair, half strip, strip, box…" onClick={(e) => { e.stopPropagation(); setUnitsFor(p); }}><Boxes size={14} />Units</button>}</td>}
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
      {unitsFor && <PacksEditor product={unitsFor} onClose={() => setUnitsFor(null)} />}
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
  const warn = db.settings.expiryWarnDays || 90;
  const rows = useMemo(() => products.filter((p) => p.stock > 0).flatMap((p) => batchesOf(p.id).filter((b) => b.qty > 0 && b.expiry).map((b) => ({ ...b, p, days: daysUntil(b.expiry) })))
    .filter((r) => (tab === 'expired' ? r.days < 0 : r.days >= 0 && r.days <= warn))
    .sort((a, b) => a.expiry.localeCompare(b.expiry)), [products, batchesOf, tab, warn]);
  const [busy, setBusy] = useState(''); // the batch being written off (its button is disabled until it is saved)
  // F1: List | Calendar, kept on this device; the calendar shows every batch in stock with an expiry
  const [view, setViewState] = useState(() => deviceSettings().expiryView || 'list');
  const setView = (v) => { setViewState(v); setDevice({ expiryView: v }); };
  const allBatches = useMemo(() => products.filter((p) => p.stock > 0).flatMap((p) => batchesOf(p.id).filter((b) => b.qty > 0 && b.expiry).map((b) => ({ ...b, p, days: daysUntil(b.expiry) }))), [products, batchesOf]);
  // stock review (27 Nov 2026): the monthly expiry check writes off every expired batch in one step (or one batch), and
  // a write-off over the pharmacy's limit by someone who isn't a manager needs a manager's approval
  const [writing, setWriting] = useState(null); // the batches about to be written off
  const expiredRows = useMemo(() => allBatches.filter((r) => r.days < 0), [allBatches]);
  const writeOff = (r) => setWriting([r]);
  const doWriteOff = async (list, approvedBy) => {
    setBusy('all');
    let done = 0, gone = 0, value = 0;
    try {
      await update((d) => {
        for (const r of list) {
          // stock audit (26 Nov 2026): only what the batch still holds. Written off on two devices (or written off again
          // before the list caught up), a batch went below zero: Monticope 38 → −38. What changed on the batch since this
          // list was drawn is taken into account, and nothing is written off when it is already empty.
          const qty = Math.round((r.qty + lotChange(d.movements, db.movements, { branchId, productId: r.p.id, batchId: r.legacy ? null : r.id })) * 1e6) / 1e6;
          if (!(qty > 0)) { gone++; continue; }
          move(d, { productId: r.p.id, qty: -qty, type: 'Expired write-off', ref: r.batch, reason: 'expired', ...(approvedBy ? { approvedBy } : {}), user: user.name, batchId: r.legacy ? null : r.id, branchId });
          audit(d, user, 'Expired write-off', `${r.p.name} batch ${r.batch}: ${qty} units (${fmt(qty * (r.cost || r.p.cost))})${approvedBy ? ` · approved by ${approvedBy}` : ''}`, branchId);
          done++; value += qty * (r.cost || r.p.cost || 0);
        }
      });
    } catch (e) { return toast(`Nothing was written off: ${e.message}`, 'error'); }
    finally { setBusy(''); }
    setWriting(null);
    if (!done) return toast('Already written off; nothing was changed', 'warn');
    toast(`${done} batch${done === 1 ? '' : 'es'} written off (${fmt(value)} at cost)${gone ? `; ${gone} already empty` : ''}`);
  };
  return (
    <div className="page">
      <div className="page-head"><div><h1>Expiring / Expired</h1><div className="sub">{rows.length} batches · {fmt(rows.reduce((a, r) => a + r.qty * (r.cost || r.p.cost), 0))} at cost</div></div>
        {can('stock.adjust') && expiredRows.length > 0 && <div className="row gap"><button type="button" className="btn danger" disabled={!!busy} onClick={() => setWriting(expiredRows)} title="The monthly expiry check: every expired batch in stock here">Write off all expired ({expiredRows.length})</button></div>}
      </div>
      {writing && <WriteOffSheet rows={writing} busy={busy === 'all'} onCancel={() => setWriting(null)} onConfirm={doWriteOff} />}
      <div className="list-filters">
        {view === 'list' && <FilterChips label="Show" value={tab} onChange={setTab} options={[['soon', `Expiring within ${warn} days`], ['expired', 'Expired']]} />}
        <div className="seg" role="radiogroup" aria-label="View">{[['list', 'List'], ['calendar', 'Calendar']].map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={view === k} className={view === k ? 'on' : ''} onClick={() => setView(k)}>{l}</button>)}</div>
      </div>
      {view === 'calendar' && <ExpiryCalendar batches={allBatches} warn={warn} onOpen={(b) => navigate('/stock-card', { state: { productId: b.p.id } })} />}
      {view === 'list' && <DataTable id="expiry" className="phone-rows" rows={rows} rowKey={(r) => r.p.id + r.id} sort={['expiry', 1]} resetKey={tab}
        pdf={{ title: tab === 'expired' ? 'Expired stock' : `Expiring within ${warn} days`, subtitle: `${rows.length} batches in stock · ${fmt(rows.reduce((a, r) => a + r.qty * (r.cost || r.p.cost), 0))} at cost` }}
        empty={tab === 'expired' ? 'No expired stock 🎉' : 'Nothing expiring soon 🎉'} columns={[
          { id: 'name', label: 'Medicine', className: 'row-title', sortBy: (r) => r.p.name, render: (r) => <strong>{r.p.name}</strong> },
          { id: 'batch', label: 'Batch', key: 'batch', className: 'batch-cell' },
          { id: 'expiry', label: 'Expiry', key: 'expiry', tdClass: (r) => 'nowrap ' + expiryClass(r.expiry, warn) },
          { id: 'when', label: 'When', sortBy: (r) => r.days, csv: (r) => r.days, tdClass: (r) => 'nowrap ' + expiryClass(r.expiry, warn), render: (r) => (r.days < 0 ? `${-r.days} days ago` : r.days === 0 ? 'today' : `in ${r.days} days`) },
          { id: 'qty', label: 'Qty', num: true, sortBy: (r) => r.qty, render: (r) => formatQty(r.qty) },
          { id: 'value', label: 'Value', num: true, sortBy: (r) => r.qty * (r.cost || r.p.cost || 0), render: (r) => fmt(r.qty * (r.cost || r.p.cost)) },
          { id: 'actions', label: 'Actions', noExport: true, className: 'actions', render: (r) => <>
            {(can('stock.receive') || can('stock.adjust')) && <button className="btn sm ghost" title="Send it back to the supplier for a credit note or refund" onClick={() => navigate('/returns', { state: { returnBatch: { productId: r.p.id, batchId: r.id, reason: r.days < 0 ? 'Expired' : 'Short expiry' } } })}>Return</button>}
            {tab === 'expired' && can('stock.adjust') && <button className="btn sm danger" disabled={!!busy} onClick={() => writeOff(r)}>Write off</button>}
          </> },
        ]} />}
    </div>
  );
}

/** Writing off expired batches (one, or all of them in the monthly expiry check), with a manager's approval when the
 *  value is over the pharmacy's limit and someone else does it (stock review, 27 Nov 2026) */
function WriteOffSheet({ rows, busy, onCancel, onConfirm }) {
  const { db, fmt, user } = useStore();
  const value = rows.reduce((a, r) => a + r.qty * (Number(r.cost) || Number(r.p.cost) || 0), 0);
  const approvalWith = useManagerApproval();
  const approval = approvalWith(lossLimit(db.settings));
  const ap = useApprovalBox(approval, needsApproval(value, db.settings, user));
  const go = async (e) => {
    e.preventDefault();
    const by = ap.needed ? await ap.check() : null;
    if (ap.needed && !by) return;
    onConfirm(rows, by);
  };
  return (
    <Modal title={rows.length === 1 ? `Write off ${rows[0].p.name}?` : `Write off ${rows.length} expired batches?`} onClose={onCancel} wide={rows.length > 1}>
      <form className="stack" onSubmit={go}>
        <p>{rows.length === 1 ? `${formatQty(rows[0].qty)} of batch ${rows[0].batch} will be taken off stock.` : 'Every batch below will be taken off stock. A batch can also be sent back to its supplier instead (Return), for a credit note.'} The write-off is {fmt(value)} at cost, in the stock card and the audit log.</p>
        {rows.length > 1 && (
          <div className="table-wrap" style={{ maxHeight: 280, overflow: 'auto' }}>
            <table className="compact"><thead><tr><th>Medicine</th><th>Batch</th><th>Expired</th><th className="num">Qty</th><th className="num">Value</th></tr></thead><tbody>
              {rows.map((r) => <tr key={r.p.id + r.id}><td>{r.p.name}</td><td>{r.batch}</td><td>{r.expiry}</td><td className="num">{formatQty(r.qty)}</td><td className="num">{fmt(r.qty * (Number(r.cost) || Number(r.p.cost) || 0))}</td></tr>)}
            </tbody></table>
          </div>
        )}
        {ap.needed && ap.fields(`A manager must approve a write-off over ${fmt(approval.limit)}`)}
        <div className="form-actions"><button type="button" className="btn ghost" onClick={onCancel}>Cancel</button><button className="btn danger" disabled={busy || ap.blocked}>{busy ? 'Writing off…' : `Write off ${fmt(value)}`}</button></div>
      </form>
    </Modal>
  );
}

/** Spreadsheet-style editing of prices, reorder levels, shelf and barcode. */
export function QuickEdit() {
  const { db, products, update, fmt, user, branchId } = useStore();
  const [q, setQ] = useState('');
  const [edits, setEdits] = useState({});
  // the shared table (2026-11-26): every medicine, no limit (100 rows, then more as the list scrolls); "In stock" first
  const [show, setShow] = useState('instock');
  const ql = q.toLowerCase();
  const stocked = useMemo(() => products.filter((p) => p.stock > 0 || p.totalStock > 0), [products]);
  const base = show === 'instock' ? stocked : products;
  const rows = useMemo(() => base.filter((p) => !q || `${p.name} ${p.generic || ''} ${p.barcode || ''}`.toLowerCase().includes(ql)), [base, q, ql]);
  const val = (p, k) => edits[p.id]?.[k] ?? p[k] ?? '';
  const set = (p, k, v) => setEdits((e) => ({ ...e, [p.id]: { ...e[p.id], [k]: v } }));
  const count = Object.keys(edits).length;
  const save = async () => {
    // many changes at once are checked first: a slip in a long list must not change hundreds of prices
    if (count > 50 && !(await ask({ title: `Save ${count} changes?`, message: 'Prices, costs and reorder levels of these medicines change on every device.', effects: [`${count} medicines changed`], confirmText: 'Save' }))) return;
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
  const input = (k, type, label) => ({
    id: k, label, sortBy: (p) => (type === 'number' ? Number(p[k]) || 0 : String(p[k] ?? '')), csv: (p) => val(p, k),
    render: (p) => <input type={type} step="any" inputMode={type === 'number' ? 'decimal' : undefined} aria-label={`${label} of ${p.name}`} value={val(p, k)} onChange={(e) => set(p, k, e.target.value)} />,
  });
  const margin = (p) => { const price = Number(val(p, 'price')), cost = Number(val(p, 'cost')); return price ? (price - cost) / price : null; };
  const columns = [
    { id: 'name', label: 'Medicine', sortBy: (p) => p.name, csv: (p) => p.name, render: (p) => <>{p.name}<br /><small className="muted">{formatQty(p.stock)} in stock</small></> },
    { id: 'stock', label: 'In stock', num: true, sortBy: (p) => Number(p.stock) || 0, render: (p) => formatQty(p.stock) },
    input('cost', 'number', 'Cost'), input('wholesale', 'number', 'Wholesale'), input('price', 'number', 'Retail'), input('reorder', 'number', 'Reorder'),
    input('shelf', 'text', 'Shelf'), input('barcode', 'text', 'Barcode'),
    { id: 'margin', label: 'Margin', num: true, sortBy: (p) => margin(p) ?? -Infinity, csv: (p) => (margin(p) == null ? '' : Math.round(margin(p) * 100) + '%'),
      render: (p) => { const m = margin(p); return <>{m == null ? '—' : Math.round(m * 100) + '%'}<br /><small className="muted">{fmt(Number(val(p, 'price')) - Number(val(p, 'cost')))}</small></>; } },
  ];
  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Quick Edit</h1><div className="sub">{stocked.length.toLocaleString()} in stock · {products.length.toLocaleString()} medicines · edit many prices at once, then save</div></div>
        <div className="row gap">
          <SearchBox value={q} onChange={setQ} />
          <button className="btn ghost" onClick={fillBarcodes}><BarcodeIcon size={16} />Generate missing barcodes</button>
          <button className="btn ghost" disabled={!count} onClick={() => setEdits({})}><Undo2 size={16} />Discard</button>
          <button className="btn primary" disabled={!count} onClick={save}><Save size={16} />Save {count || ''} change{count === 1 ? '' : 's'}</button>
        </div>
      </div>
      <DataTable id="quick-edit" className="lines quick-edit" columns={columns} rows={rows} resetKey={q + '|' + show} sort={['name', 1]}
        caption={<FilterChips label="Show" value={show} onChange={setShow} options={[['instock', 'In stock', stocked.length], ['all', 'All medicines', products.length]]} />}
        rowProps={(p) => ({ className: edits[p.id] ? 'edited' : undefined })}
        empty={q ? `Nothing matches “${q}”.` : show === 'instock' ? 'No medicines in stock yet. Receive stock with Add Stock, or show all medicines.' : 'No medicines yet.'} />
    </div>
  );
}

/** Every stock movement for a medicine at this branch with running balance, plus counts/adjustments per batch. */
export function StockCard() {
  const { db, products, update, user, batchesOf, branchId, branch, can, fmt } = useStore();
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
  // Only medicines in stock (plus the one opened from elsewhere), not the whole built-in catalog; every one of them
  // (no longer cut at 300: the shared table, 2026-11-26)
  const options = stocked.filter((x) => !q || `${x.name} ${x.generic || ''} ${x.barcode || ''}`.toLowerCase().includes(ql));
  if (p && !options.some((x) => x.id === p.id)) options.unshift(p);

  const unitName = String(p?.unit || 'unit').toLowerCase();
  const saving = useRef(false); // a second tap on Save while it is being saved must not record it twice
  // stock review (27 Nov 2026, src/stockcontrol.js): a reason from a list, a manager's approval for a loss over the
  // pharmacy's limit, and a nudge to Stock Count when a stock take is being typed in as many adjustments
  const adjB = adjust ? batches.find((x) => x.id === adjust.batchId) : null;
  const adjDiff = !adjust ? 0 : adjust.mode === 'count' ? Number(adjust.counted) - (adjB?.qty || 0) : (Number(adjust.qty) || 0) * (adjust.mode === 'remove' ? -1 : 1);
  const adjLoss = Math.max(0, -adjDiff) * (Number(adjB?.cost) || Number(p?.cost) || 0);
  const approvalWith = useManagerApproval();
  const approval = approvalWith(lossLimit(db.settings));
  const ap = useApprovalBox(approval, needsApproval(adjLoss, db.settings, user));
  const [burst, setBurst] = useState(0);
  const saveAdjust = async (e) => {
    e.preventDefault();
    if (saving.current) return;
    const b = adjB;
    let batchId = b && !b.legacy ? b.id : null;
    const diff = adjDiff;
    if (!diff) return setAdjust(null);
    if (!reasonReady(adjust.reason, adjust.note)) return toast('Choose why the stock changed (and say why for “Other”)', 'warn');
    // Remove: never more than a batch holds (a batch going negative while others still have stock hides stock and value);
    // what the chosen batch doesn't have comes from the medicine's other batches, earliest expiry first
    let parts = null;
    if (adjust.mode === 'remove') {
      try { parts = removalSplit(batches, adjust.batchId, -diff); } catch (err) { toast(err.message, 'error'); return; }
    }
    saving.current = true;
    const approvedBy = ap.needed ? await ap.check() : null;
    if (ap.needed && !approvedBy) { saving.current = false; return; }
    const note = reasonNote(adjust.reason, adjust.note);
    const extra = { reason: adjust.reason, ...(approvedBy ? { approvedBy } : {}) };
    update((d) => {
      if (adjust.mode === 'add' && adjust.batchId === 'new') batchId = addBatch(d, { productId: p.id, batch: adjust.newBatch, expiry: adjust.newExpiry, cost: p.cost }).id;
      const type = adjust.mode === 'count' ? 'Stock count' : 'Adjustment';
      if (parts) for (const x of parts) move(d, { productId: p.id, qty: -x.qty, type, note, ...extra, user: user.name, batchId: x.batchId, branchId });
      else move(d, { productId: p.id, qty: diff, type, note, ...extra, user: user.name, batchId, branchId });
      const where = parts ? parts.map((x) => `${x.batch || '—'} −${x.qty}`).join(', ') : b?.batch || adjust.newBatch || '';
      audit(d, user, adjust.mode === 'count' ? 'Stock count' : 'Stock adjusted', `${p.name} ${where}: ${diff > 0 ? '+' : ''}${diff} (${note})${approvedBy ? ` · approved by ${approvedBy}` : ''}`, branchId);
    });
    toast('Stock updated');
    if (adjust.mode !== 'count') setBurst(adjustmentBurst(db.movements, user.name, now()) + 1);
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
          {p && p.stock > 0 && can('stock.adjust') && <button className="btn primary" onClick={() => { const first = batches.find((x) => x.qty > 0) || batches[0]; setAdjust({ mode: 'count', batchId: first?.id || 'new', counted: first?.qty || 0, qty: 1, reason: 'count', note: '', newBatch: '', newExpiry: '' }); }}><SlidersHorizontal size={16} />Count / adjust</button>}
        </div>
      </div>
      {burst >= BURST_ADJUSTMENTS && (
        <div className="notice warn-notice" role="status">
          <AlertTriangle size={15} /> You have made {burst} adjustments in the last hour. For a stock take, a <Link to="/stock-count">Stock count</Link> is safer:
          it gives a count sheet, can hide the system figures while counting, and shows every difference for review before anything changes.
          <button type="button" className="link-btn small" onClick={() => setBurst(0)}>Hide</button>
        </div>
      )}
      {p && (
        <div className="stats">
          <div className="card stat"><small>In stock here</small><strong>{p.stock}</strong><span className="muted small">{p.unit || 'units'}</span></div>
          {batches.filter((b) => b.qty).slice(0, 3).map((b) => (
            <div key={b.id} className="card stat"><small>Batch {b.batch}</small><strong>{formatQty(b.qty)}</strong><span className={'small ' + expiryClass(b.expiry, db.settings.expiryWarnDays || 90)}>Expires {b.expiry || '—'}</span></div>
          ))}
        </div>
      )}
      {/* the shared table (2026-11-26): every movement, newest first, 100 at a time (no longer cut at 500) */}
      <DataTable id="stock-card" rows={lines} sort={['date', -1]} resetKey={id + '|' + branchId} csv={`stock-card-${(p?.name || 'medicine').replace(/\W+/g, '-')}`}
        empty="No stock movements at this branch" columns={[
          { id: 'date', label: 'Date', sortBy: (m) => m.date, csv: (m) => m.date, render: (m) => new Date(m.date).toLocaleString(dateLocale(), { dateStyle: 'medium', timeStyle: 'short' }) },
          { id: 'type', label: 'Type', key: 'type' },
          { id: 'batch', label: 'Batch', sortBy: (m) => (m.batchId ? batchName[m.batchId] || '' : p?.batch || ''), render: (m) => (m.batchId ? batchName[m.batchId] || '—' : p?.batch || '—') },
          { id: 'ref', label: 'Reference', sortBy: (m) => `${m.ref || ''}${m.note ? ` (${m.note})` : ''}`, render: (m) => <>{m.ref}{m.note ? ` (${m.note})` : ''}</> },
          { id: 'user', label: 'By', key: 'user' },
          { id: 'in', label: 'In', num: true, className: 'text-ok', sortBy: (m) => (m.qty > 0 ? m.qty : 0), render: (m) => (m.qty > 0 ? formatQty(m.qty) : '') },
          { id: 'out', label: 'Out', num: true, className: 'text-danger', sortBy: (m) => (m.qty < 0 ? -m.qty : 0), render: (m) => (m.qty < 0 ? formatQty(-m.qty) : '') },
          { id: 'bal', label: 'Balance', num: true, sortBy: (m) => m.bal, render: (m) => <strong>{formatQty(m.bal)}</strong> },
        ]} />
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
              ? <label className="field"><span>Counted quantity in {unitName}s (system says {batches.find((b) => b.id === adjust.batchId)?.qty || 0})</span><input type="number" min="0" value={adjust.counted} onChange={(e) => setAdjust({ ...adjust, counted: e.target.value })} required />
                {(() => {
                  // stock audit (26 Nov 2026): stock is in single units; a count typed in boxes set 300 tablets to 3
                  const sys = batches.find((b) => b.id === adjust.batchId)?.qty || 0, slip = packSlip(p, adjust.counted, sys), txt = packText(p, adjust.counted);
                  if (slip) return <small className="text-warn">Counted by the {slip.pack.name.toLowerCase()}? {adjust.counted} × {slip.pack.size} = {slip.units} {unitName}s. <button type="button" className="link-btn small" onClick={() => setAdjust({ ...adjust, counted: String(slip.units) })}>Use {slip.units}</button></small>;
                  return txt ? <small className="muted">= {txt}</small> : null;
                })()}</label>
              : <label className="field"><span>Quantity to {adjust.mode} ({unitName}s)</span><input type="number" min="1" value={adjust.qty} onChange={(e) => setAdjust({ ...adjust, qty: e.target.value })} required />
                {packText(p, adjust.qty) && <small className="muted">= {packText(p, adjust.qty)}</small>}</label>}
            <ReasonFields reason={adjust.reason} note={adjust.note} onChange={(patch) => setAdjust({ ...adjust, ...patch })} />
            {adjLoss > 0 && <small className="muted">Takes {fmt(adjLoss)} of stock off, at cost.</small>}
            {ap.needed && ap.fields(`A manager must approve taking off more than ${fmt(approval.limit)}`)}
            <div className="form-actions"><button type="button" className="btn ghost" onClick={() => setAdjust(null)}>Cancel</button><button className="btn primary" disabled={ap.blocked}>Save</button></div>
          </form>
        </Modal>
      )}
    </div>
  );
}

/** Admin & manager: edit an item's details and its batches (number, expiry, quantity) in one place */
function InventoryEditor({ product, onClose }) {
  const { db, fmt, update, user, batchesOf, branchId, syncNow } = useStore();
  // stock audit (26 Nov 2026): the latest sales from the other tills first, and the "actual quantity" typed is what the
  // batch is set to, against its stock when saved (not when this was opened: a sale made meanwhile was counted twice)
  useEffect(() => { if (navigator.onLine) Promise.resolve(syncNow?.()).catch(() => {}); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const qtyNow = (r) => (batchesOf(product.id).find((b) => b.id === r.id)?.qty ?? r.qty);
  const [p, setP] = useState(() => ({ name: product.name, generic: product.generic || '', form: product.form || '', cost: product.cost || 0, wholesale: product.wholesale || 0, price: product.price || 0, reorder: product.reorder || 0, shelf: product.shelf || '' }));
  const [rows, setRows] = useState(() => batchesOf(product.id).filter((b) => b.qty !== 0).map((b) => ({ ...b, newQty: b.qty, newBatch: b.batch, newExpiry: b.expiry || '' })));
  // stock review (27 Nov 2026): the reason is picked from a list, and a loss over the limit needs a manager's approval
  const [why, setWhy] = useState({ reason: '', note: '' });
  const setRow = (k, patch) => setRows((r) => r.map((x, n) => (n === k ? { ...x, ...patch } : x)));
  const unitName = String(product.unit || 'unit').toLowerCase();
  const qtyChanges = rows.filter((r) => r.touched && Math.round(Number(r.newQty) || 0) !== qtyNow(r)).map((r) => ({ ...r, qty: qtyNow(r) }));
  const editLoss = lossOf(qtyChanges.map((r) => ({ qty: Math.round(Number(r.newQty) || 0) - r.qty, cost: Number(r.cost) || Number(product.cost) || 0 })));
  const approvalWith = useManagerApproval();
  const approval = approvalWith(lossLimit(db.settings));
  const ap = useApprovalBox(approval, needsApproval(editLoss, db.settings, user));
  const save = async (e) => {
    e.preventDefault();
    if (qtyChanges.length && !reasonReady(why.reason, why.note)) return toast('Choose why the quantity changed (and say why for “Other”)', 'warn');
    const approvedBy = qtyChanges.length && ap.needed ? await ap.check() : null;
    if (qtyChanges.length && ap.needed && !approvedBy) return;
    const reason = reasonNote(why.reason, why.note);
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
        const diff = r.touched ? Math.round(Number(r.newQty) || 0) - qtyNow(r) : 0;
        if (diff) move(d, { productId: product.id, qty: diff, type: 'Inventory edit', note: reason, reason: why.reason, ...(approvedBy ? { approvedBy } : {}), user: user.name, batchId: r.legacy ? null : r.id, branchId });
      }
      audit(d, user, 'Inventory edited', `${next.name}${qtyChanges.length ? `: ${qtyChanges.map((r) => `${r.batch} ${r.qty}→${r.newQty}`).join(', ')} (${reason})${approvedBy ? ` · approved by ${approvedBy}` : ''}` : ''}`, branchId);
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
                <td className="num">{formatQty(qtyNow(r))} <small className="muted">{unitName}s</small></td>
                <td><input type="number" min="0" aria-label="Actual qty" value={r.newQty} onChange={(e) => setRow(k, { newQty: e.target.value, touched: true })} />
                  {(() => {
                    // stock is in single units: catch a figure typed in boxes, and say what a figure is in packs
                    const slip = r.touched && packSlip(product, r.newQty, qtyNow(r)), txt = packText(product, r.newQty);
                    if (slip) return <small className="text-warn">Counted by the {slip.pack.name.toLowerCase()}? {r.newQty} × {slip.pack.size} = {slip.units} {unitName}s. <button type="button" className="link-btn small" onClick={() => setRow(k, { newQty: String(slip.units) })}>Use {slip.units}</button></small>;
                    return txt ? <small className="muted">= {txt}</small> : null;
                  })()}</td>
              </tr>
            ))}
            {!rows.length && <Empty colSpan={4}>No stock at this branch. Use Add Stock to receive it.</Empty>}
          </tbody>
        </table>
        {qtyChanges.length > 0 && <>
          <ReasonFields reason={why.reason} note={why.note} onChange={(patch) => setWhy({ ...why, ...patch })} />
          {editLoss > 0 && <small className="muted">The quantity changes take {fmt(editLoss)} of stock off, at cost. For a stock take, use Stock count instead: it shows every difference for review first.</small>}
          {ap.needed && ap.fields(`A manager must approve taking off more than ${fmt(approval.limit)}`)}
        </>}
        <div className="form-actions"><button type="button" className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" disabled={qtyChanges.length > 0 && ap.blocked}>Save</button></div>
      </form>
    </Modal>
  );
}

/**
 * Selling units for a medicine (Nov 2026, the owner's request): stock is always kept in its smallest unit (e.g.
 * tablets); a selling unit is a number of those (a pair, a half strip, a strip, a box) with its own retail and wholesale
 * price (blank = unit price × size). The admin also chooses which unit the till starts on and whether single units are
 * sold at all ("sold loose"). The till offers every unit set here; Add Stock can receive by them.
 */
export function PacksEditor({ product, onClose }) {
  const { update, user, branchId, fmt, can } = useStore();
  const [rows, setRows] = useState(() => (product.packs?.length ? product.packs : []).map((k) => ({ ...k, price: k.price ?? '', wholesale: k.wholesale ?? '' })));
  const [sellAs, setSellAs] = useState(product.sellAs ?? null); // null = as Settings → Receipts & stock says
  const [loose, setLoose] = useState(soldLoose(product));
  const [changing, setChanging] = useState(false);
  const unit = product.unit || 'Unit';
  const set = (n, patch) => setRows((r) => r.map((x, i) => (i === n ? { ...x, ...patch } : x)));
  const presets = unitPresets({ packs: rows });
  const addPreset = (k) => setRows((r) => (r.some((x) => x.name.trim().toLowerCase() === k.name.toLowerCase()) ? r : [...r, { name: k.name, size: k.size, price: '', wholesale: '' }]));
  const save = (e) => {
    e.preventDefault();
    const named = rows.filter((k) => String(k.name).trim());
    const bad = named.find((k) => !(Number(k.size) >= 2) || !Number.isInteger(Number(k.size)));
    if (bad) return toast(`${bad.name}: how many ${unit.toLowerCase()}s are in it? A whole number, 2 or more`, 'warn');
    const amt = (v) => (v === '' || v == null ? null : Number(v) || null);
    const packs = named.map((k) => ({ name: String(k.name).trim(), size: Number(k.size), price: amt(k.price), ...(amt(k.wholesale) ? { wholesale: amt(k.wholesale) } : {}) })).sort((a, b) => a.size - b.size); // smallest first, as the till lists them
    if (new Set(packs.map((k) => k.name.toLowerCase())).size !== packs.length) return toast('Each selling unit needs its own name', 'warn');
    if (packs.some((k) => k.name.toLowerCase() === unit.toLowerCase())) return toast(`"${unit}" is the stock unit itself; name the pack differently`, 'warn');
    const start = sellAs && !packs.some((k) => k.name === sellAs) ? null : sellAs;
    if (!loose && !packs.length) return toast(`Add the units it is sold in, or tick "Sold loose" so single ${unit.toLowerCase()}s can be sold`, 'warn');
    if (!loose && start === '') return toast(`It isn't sold as single ${unit.toLowerCase()}s, so the till can't start on one`, 'warn');
    update((d) => {
      const cur = d.products.find((x) => x.id === product.id) || product;
      const { stock, totalStock, ...rest } = cur;
      put(d, 'products', { ...rest, packs, sellAs: start, loose });
      const words = [...(loose ? [`${unit} (single)`] : []), ...packs.map((k) => `${k.name} = ${k.size} ${unit}`)].join(', ');
      audit(d, user, 'Selling units changed', `${product.name}: ${words || 'none'}; the till starts on ${start === null ? 'the settings default' : start || unit}${loose ? '' : '; not sold loose'}`, branchId);
    });
    toast(`${product.name}: selling units saved`);
    onClose();
  };
  if (changing) return <UnitChange product={product} onClose={onClose} />;
  return (
    <Modal title={`Selling units – ${product.name}`} onClose={onClose} size="lg">
      <form className="stack" onSubmit={save}>
        <p className="muted small">Stock is counted in <strong>{unit}s</strong> ({fmt(product.price)} each). Add every unit the till may sell it by: a pair, a half strip, a strip, a box. Leave a price blank for {unit.toLowerCase()} price × size.</p>
        <div className="row gap wrap" role="group" aria-label="Add a ready-made unit">
          {presets.map((k) => <button key={k.name} type="button" className="btn sm ghost" disabled={rows.some((x) => String(x.name).trim().toLowerCase() === k.name.toLowerCase())} title={k.note || (k.size ? `${k.size} ${unit.toLowerCase()}s` : 'Set the strip first')} onClick={() => addPreset(k)}>+ {k.name}{k.size ? ` (${k.size})` : ''}</button>)}
          <button type="button" className="btn sm ghost" onClick={() => setRows((r) => [...r, { name: '', size: '', price: '', wholesale: '' }])}>+ Other</button>
        </div>
        <table className="lines">
          <thead><tr><th>Till starts on</th><th>Unit</th><th>{unit}s in it</th><th>Retail price</th><th>Wholesale price</th><th /></tr></thead>
          <tbody>
            <tr>
              <td><input type="radio" name="sellAs" checked={sellAs === ''} disabled={!loose} onChange={() => setSellAs('')} aria-label={`Till starts on one ${unit}`} /></td>
              <td><label style={{ display: 'flex', alignItems: 'center', gap: 6 }}><input type="checkbox" checked={loose} onChange={(e) => { setLoose(e.target.checked); if (!e.target.checked && sellAs === '') setSellAs(null); }} />{unit} <span className="muted small">(sold loose)</span></label></td>
              <td>1</td><td>{fmt(product.price)}</td><td>{Number(product.wholesale) > 0 ? fmt(product.wholesale) : '—'}</td><td />
            </tr>
            {rows.map((k, n) => (
              <tr key={n}>
                <td><input type="radio" name="sellAs" checked={!!k.name && sellAs === String(k.name).trim()} disabled={!String(k.name).trim()} onChange={() => setSellAs(String(k.name).trim())} aria-label={`Till starts on ${k.name || 'this unit'}`} /></td>
                <td><input value={k.name} onChange={(e) => { if (sellAs && sellAs === String(k.name).trim()) setSellAs(e.target.value.trim()); set(n, { name: e.target.value }); }} placeholder="Strip / Pair / Box" aria-label="Unit name" /></td>
                <td><input type="number" min="2" step="1" value={k.size} onChange={(e) => set(n, { size: e.target.value })} aria-label={`${unit}s in it`} /></td>
                <td><input type="number" min="0" step="any" value={k.price} placeholder={String((product.price || 0) * (Number(k.size) || 0))} onChange={(e) => set(n, { price: e.target.value })} aria-label="Retail price" /></td>
                <td><input type="number" min="0" step="any" value={k.wholesale} placeholder={String((product.wholesale || product.price || 0) * (Number(k.size) || 0))} onChange={(e) => set(n, { wholesale: e.target.value })} aria-label="Wholesale price" /></td>
                <td><button type="button" className="icon-btn" aria-label={`Remove ${k.name || 'unit'}`} onClick={() => { if (sellAs === String(k.name).trim()) setSellAs(null); setRows((r) => r.filter((_, i) => i !== n)); }}>×</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <label className="row gap small"><input type="radio" name="sellAs" checked={sellAs === null} onChange={() => setSellAs(null)} />Till starts as Settings → Receipts & stock says (single units in retail, the largest pack in wholesale)</label>
        {can('stock.adjust') && <p className="muted small">Counted in the wrong unit (e.g. boxes when you sell tablets)? <button type="button" className="btn sm ghost" onClick={() => setChanging(true)}>Change unit of issue…</button></p>}
        <div className="form-actions"><button type="button" className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary">Save selling units</button></div>
      </form>
    </Modal>
  );
}

/**
 * Change the unit of issue (the unit stock is counted in), e.g. from Box to Tablet with 1 box = 100 tablets. Unlike
 * picking another "Stock unit" in the medicine form (a rename only), this converts: every batch in every branch gets
 * a "Unit change" movement, prices and cost are divided, the reorder level and pack sizes multiplied, the old unit is
 * kept as a pack at its old price, and the change is recorded so earlier sales count in the new unit (src/packs.js).
 * Needs Adjust stock (and Medicines); written to the audit log.
 */
export function UnitChange({ product, onClose }) {
  const { db, update, user, branchId, fmt, can, batchesOf } = useStore();
  const from = product.unit || 'Unit';
  const [to, setTo] = useState(from === 'Tablet' ? '' : 'Tablet');
  const [factor, setFactor] = useState('');
  const [busy, setBusy] = useState(false);
  const f = Number(factor);
  const okFactor = Number.isInteger(f) && f >= 2;
  const lots = useMemo(() => (db.branches || []).flatMap((b) => batchesOf(product.id, b.id).filter((x) => x.qty).map((x) => ({ branchId: b.id, branch: b.name, batchId: x.legacy ? null : x.id, batch: x.batch, qty: x.qty }))), [db.branches, batchesOf, product.id]);
  const held = lots.reduce((a, l) => a + l.qty, 0);
  const allowed = can('stock.adjust') && can('medicines.manage');
  const go = async (e) => {
    e.preventDefault();
    if (!allowed) return toast('Changing the unit of issue needs the Adjust stock and Medicines permissions', 'warn');
    if (!String(to).trim()) return toast('Name the new unit', 'warn');
    if (!okFactor) return toast(`How many ${to || 'new unit'}s are in one ${from}? A whole number, 2 or more`, 'warn');
    if (!(await ask({ title: `Count ${product.name} in ${to}s?`, message: `1 ${from} = ${f} ${to}s. Stock ${formatQty(held)} ${from.toLowerCase()}s becomes ${formatQty(held * f)} ${to.toLowerCase()}s in ${new Set(lots.map((l) => l.branchId)).size || 0} branch(es); the price ${fmt(product.price)} per ${from.toLowerCase()} becomes ${fmt(Number(product.price) / f)} per ${to.toLowerCase()}. Make sure every till has synced first: a sale still waiting on another device would be taken in the old unit.`, confirmText: 'Change unit' }))) return;
    setBusy(true);
    try {
      await update((d) => {
        const cur = d.products.find((x) => x.id === product.id) || product;
        const { stock, totalStock, ...rest } = cur;
        const at = new Date().toISOString();
        const r = unitChange(rest, { to: String(to).trim(), factor: f, lots, batches: d.batches, at, by: user.name, decimals: db.settings.decimals ?? 0 });
        put(d, 'products', r.product);
        for (const b of r.batches) put(d, 'batches', b);
        for (const m of r.moves) move(d, { ...m, ref: 'unit:' + product.id, user: user.name });
        audit(d, user, 'Unit of issue changed', `${product.name}: 1 ${from} = ${f} ${r.product.unit}; stock ${formatQty(held)} → ${formatQty(held * f)}; retail ${fmt(product.price)} → ${fmt(r.product.price)}; cost ${fmt(product.cost)} → ${fmt(r.product.cost)}; reorder ${product.reorder || 0} → ${r.product.reorder || 0}`, branchId);
      });
      toast(`${product.name} is now counted in ${to}s`, 'success', { sync: true });
      onClose();
    } catch (err) { toast(`Not changed: ${err.message}`, 'error'); } finally { setBusy(false); }
  };
  return (
    <Modal title={`Change unit of issue – ${product.name}`} onClose={onClose}>
      <form className="stack" onSubmit={go}>
        <p className="muted small">Now counted in <strong>{from}s</strong>: {formatQty(held)} in stock, {fmt(product.price)} each. To sell single {to ? to.toLowerCase() : 'tablet'}s, convert the stock: each batch is multiplied, the prices and cost divided, and the {from.toLowerCase()} stays on sale as a pack at its old price.</p>
        <div className="form-grid">
          <label className="field"><span>New unit</span><input value={to} onChange={(e) => setTo(e.target.value)} list="unit-names" placeholder="Tablet" required /></label>
          <label className="field"><span>{to || 'New unit'}s in one {from}</span><input type="number" min="2" step="1" value={factor} onChange={(e) => setFactor(e.target.value)} placeholder="e.g. 100" required /></label>
        </div>
        <datalist id="unit-names">{UNITS.map((u) => <option key={u} value={u} />)}</datalist>
        {okFactor && to && <div className="card small">
          <div>Stock: {formatQty(held)} {from.toLowerCase()}s → <strong>{formatQty(held * f)} {to.toLowerCase()}s</strong></div>
          <div>Retail: {fmt(product.price)} → <strong>{fmt(Number(product.price) / f)}</strong> per {to.toLowerCase()} · cost {fmt(product.cost)} → {fmt(Number(product.cost) / f)}</div>
          <div>Reorder level: {product.reorder || 0} → {(Number(product.reorder) || 0) * f} · packs: {[...packsOf(product).map((k) => `${k.name} ${k.size} → ${k.size * f}`), `${from} = ${f} (new)`].join(', ')}</div>
        </div>}
        {!allowed && <p className="text-warn small">Needs the Adjust stock and Medicines permissions.</p>}
        <div className="form-actions"><button type="button" className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy || !allowed}>{busy ? 'Changing…' : 'Change unit'}</button></div>
      </form>
    </Modal>
  );
}

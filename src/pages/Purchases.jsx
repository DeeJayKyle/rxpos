import { useState, useRef, useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { Pencil, Trash2, ScanText, Camera, FileUp, Loader2, AlertTriangle, CheckCircle2, X, Plus, RotateCcw, Sparkles } from 'lucide-react';
import { useStore, uid, today, now, put, move, addBatch, audit, downloadFile, toCSV, markupPrice, daysUntil, MAIN_BRANCH } from '../store.jsx';
import { CASH } from '../finance.js';
import { Modal, PdfButton } from '../ui.jsx';
import { ask, toast } from '../feedback.jsx';
import { newInternalBarcode } from '../barcode.jsx';
import { invoicePages, readInvoice, matchProduct, matchSupplier, normDate } from '../invoiceScan.js';

const NEW = '__new__'; // a line for a medicine that is not in the list yet
const FORMS = ['Tablets', 'Capsules', 'Syrups', 'Suspensions', 'Injectables', 'Creams', 'Ointments', 'Drops', 'Sachets', 'Devices', 'Surgicals', 'Others'];
const round2 = (n) => Math.round(n * 100) / 100;
const numOrBlank = (n) => (n === '' || n == null || !Number.isFinite(Number(n)) ? '' : String(round2(Number(n))));
/** Unit cost exactly as entered: a line typed as a total keeps total ÷ qty unrounded, so qty × cost = the invoice total */
const unitCost = (l) => (l.by === 'total' && l.total !== '' && Number(l.qty) > 0 ? Number(l.total) / Number(l.qty) : Number(l.cost) || 0);
const lineTotal = (l) => (l.by === 'total' && l.total !== '' ? Number(l.total) || 0 : (Number(l.qty) || 0) * (Number(l.cost) || 0));

/**
 * Apply an edit to a line. Quantity, unit cost and line total stay in step (type whichever the invoice shows), and the
 * retail price follows the cost at the chosen markup until the person types a price of their own.
 */
function editLine(l, patch, priceFor) {
  const n = { ...l, ...patch };
  const qty = Number(n.qty) || 0;
  if ('total' in patch) { n.by = 'total'; n.cost = patch.total !== '' && qty > 0 ? numOrBlank(Number(patch.total) / qty) : ''; }
  else if ('cost' in patch) { n.by = 'unit'; n.total = patch.cost !== '' ? numOrBlank(Number(patch.cost) * qty) : ''; }
  else if ('qty' in patch) {
    if (n.by === 'total' && n.total !== '') n.cost = qty > 0 ? numOrBlank(Number(n.total) / qty) : '';
    else if (n.cost !== '') n.total = numOrBlank(Number(n.cost) * qty);
  }
  if ('price' in patch) n.auto = patch.price === ''; // clearing the price hands it back to the markup
  const costChanged = 'cost' in patch || 'total' in patch || ('qty' in patch && n.by === 'total');
  // a medicine already in the list never gets a lower price on its own: the higher of today's price and cost + markup
  if (n.auto && (costChanged || patch.price === '' || patch.reprice) && unitCost(n) > 0) {
    const worked = priceFor(unitCost(n));
    n.kept = Number(n.basePrice) > worked;
    n.price = String(n.kept ? Number(n.basePrice) : worked); n.derived = true;
  }
  delete n.reprice;
  return n;
}

/** Receive stock from a supplier: every line becomes a batch (number + expiry) at this branch. */
export function AddStock() {
  const { db, products, update, fmt, user, branchId, syncCfg } = useStore();
  const location = useLocation();
  const s = db.settings;
  const draftKey = 'rxpos-addstock-draft:' + (syncCfg.tenant || 'device') + ':' + branchId;
  const blankLine = () => ({ key: uid(), productId: '', name: '', form: 'Tablets', qty: 1, cost: '', total: '', price: '', auto: true, by: 'unit', batch: '', expiry: '' });
  const [scanOpen, setScanOpen] = useState(false);
  const [scanned, setScanned] = useState(null); // { pages, supplier, invoiceNo, total } after an invoice was read
  const [checked, setChecked] = useState(false); // the person confirms they checked the scanned lines
  const blank = () => ({ supplierId: '', invoice: '', date: today(), paid: '', bankId: CASH, markup: s.retailMarkup ?? 50, lines: [blankLine()] });
  const priceAt = (markup) => (cost) => markupPrice(cost, markup, s.priceRound);
  // A line for a medicine already in the list: its current cost and price, with the totals worked out
  const lineFor = (p, extra = {}, markup = s.retailMarkup) => {
    const l = { ...blankLine(), productId: p.id, cost: numOrBlank(p.cost || ''), price: p.price ? String(p.price) : '', basePrice: p.price || 0, derived: false, ...extra };
    if (!l.price && unitCost(l) > 0) { l.price = String(priceAt(markup)(unitCost(l))); l.derived = true; }
    return { ...l, total: l.cost !== '' ? numOrBlank(Number(l.cost) * Number(l.qty || 0)) : '' };
  };
  // Put what was read off the invoice on the panel: nothing is saved until "Receive stock"
  const applyScan = (r, pages) => {
    const sup = matchSupplier(r.supplier, db.suppliers);
    const lines = r.items.map((it) => {
      const p = matchProduct(it.name, products);
      const qty = it.qty || 1;
      const base = { qty, batch: it.batch || '', expiry: normDate(it.expiry), read: { name: it.name, unclear: it.unclear, matched: !!p } };
      const cost = it.unitCost || (it.lineTotal && qty ? it.lineTotal / qty : 0);
      const l = p ? lineFor(p, base, form.markup) : { ...blankLine(), ...base, name: it.name || '' };
      return it.lineTotal && !it.unitCost ? editLine(l, { total: String(it.lineTotal) }, priceAt(form.markup)) : editLine(l, { cost: numOrBlank(cost) }, priceAt(form.markup));
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
    setScanned((x) => ({ ...x, supplierMatched: true }));
    toast(`Supplier ${scanned.supplier} added`);
  };
  // Pre-filled from a purchase order (Reorder → Receive), else an unfinished delivery left on this device
  const restoredDraft = useRef(false);
  const [form, setForm] = useState(() => {
    const po = location.state?.po;
    if (po) return { ...blank(), supplierId: po.supplierId || '', poId: po.id, lines: po.items.map((i) => { const p = products.find((x) => x.id === i.productId); return p ? lineFor(p, { qty: i.qty, ...(i.cost ? { cost: numOrBlank(i.cost), total: numOrBlank(i.cost * i.qty) } : {}) }) : null; }).filter(Boolean) };
    try {
      const d = JSON.parse(localStorage.getItem(draftKey));
      const lines = (d?.lines || []).filter((l) => l.productId === NEW || products.some((p) => p.id === l.productId));
      if (lines.length) { restoredDraft.current = true; return { ...blank(), ...d, lines }; }
    } catch { /* no draft */ }
    return blank();
  });
  // Keep the unfinished delivery on this device, so a reload, a power cut or a trip to another page loses nothing
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        if (form.lines.some((l) => l.productId)) localStorage.setItem(draftKey, JSON.stringify(form));
        else localStorage.removeItem(draftKey);
      } catch { /* storage full or blocked: the panel still works */ }
    }, 300);
    return () => clearTimeout(t);
  }, [form, draftKey]);
  const [restored, setRestored] = useState(restoredDraft.current);
  const [q, setQ] = useState('');
  const [saved, setSaved] = useState(null);
  const searchRef = useRef(null);
  const nameRefs = useRef({});

  const priceFor = priceAt(form.markup);
  // The line dropdowns list this pharmacy's own and stocked medicines only (the 9,710-item catalog in every dropdown
  // made typing slow on phones); anything in the catalog is still found with the search box above
  const ownList = useMemo(() => products.filter((p) => !p.fromCatalog || p.stock > 0 || p.totalStock > 0 || !p._base).sort((a, b) => a.name.localeCompare(b.name)), [products]);
  const setLine = (key, patch) => setForm((f) => ({ ...f, lines: f.lines.map((l) => (l.key === key ? editLine(l, patch, priceAt(f.markup)) : l)) }));
  const replaceLine = (key, line) => setForm((f) => ({ ...f, lines: f.lines.map((l) => (l.key === key ? { ...line, key } : l)) }));
  const setMarkup = (markup) => setForm((f) => ({ ...f, markup, lines: f.lines.map((l) => (l.auto && l.derived ? editLine(l, { reprice: true }, priceAt(markup)) : l)) }));
  const total = form.lines.reduce((a, l) => a + (l.productId ? lineTotal(l) : 0), 0);
  const ql = q.trim().toLowerCase();
  const matches = ql ? products.filter((p) => [p.name, p.generic, p.barcode].join(' ').toLowerCase().includes(ql)).sort((a, b) => (b.stock > 0) - (a.stock > 0)).slice(0, 8) : [];
  const exactName = ql && products.some((p) => p.name.trim().toLowerCase() === ql);

  const placeLine = (line) => {
    const empty = form.lines.find((l) => !l.productId);
    if (empty) replaceLine(empty.key, line);
    else setForm((f) => ({ ...f, lines: [...f.lines, line] }));
    setQ('');
    return empty?.key || line.key;
  };
  const pick = (p) => placeLine(lineFor(p, {}, form.markup));
  const addNew = (name) => {
    const key = placeLine({ ...blankLine(), productId: NEW, name: name.trim() });
    setTimeout(() => nameRefs.current[key]?.focus(), 30);
  };
  const onSearchKey = (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (!ql) return;
    const code = products.find((p) => p.barcode && p.barcode.toLowerCase() === ql);
    if (code || matches[0]) pick(code || matches[0]);
    else if (ql.length > 1) addNew(q);
  };
  const chooseProduct = (l, id) => {
    if (id === NEW) { replaceLine(l.key, { ...l, productId: NEW, name: l.name || l.read?.name || '', auto: true }); setTimeout(() => nameRefs.current[l.key]?.focus(), 30); return; }
    const p = products.find((x) => x.id === id);
    if (!p) return replaceLine(l.key, { ...l, productId: '' });
    // a scanned line keeps the cost read off the invoice
    const next = lineFor(p, { qty: l.qty, batch: l.batch, expiry: l.expiry, read: l.read }, form.markup);
    replaceLine(l.key, l.read && (l.cost !== '' || l.total !== '') ? editLine(next, l.by === 'total' ? { total: l.total } : { cost: l.cost }, priceFor) : next);
  };
  const discard = () => { setForm(blank()); setScanned(null); setChecked(false); setRestored(false); try { localStorage.removeItem(draftKey); } catch { /* ignore */ } };

  const save = async (e) => {
    e.preventDefault();
    const unpicked = form.lines.filter((l) => l.read && !l.productId && Number(l.qty) > 0);
    if (unpicked.length) return toast(`Choose the medicine for ${unpicked.length} line${unpicked.length > 1 ? 's' : ''} read from the invoice, add ${unpicked.length > 1 ? 'them' : 'it'} as new, or remove ${unpicked.length > 1 ? 'them' : 'it'}`, 'warn');
    if (scanned && !checked) return toast('Tick "I have checked every line against the invoice" before saving', 'warn');
    const lines = form.lines.filter((l) => l.productId && Number(l.qty) > 0);
    if (!lines.length) return toast('Add at least one medicine', 'warn');
    if (form.lines.some((l) => l.productId && !(Number(l.qty) > 0))) return toast('Every line needs a quantity above 0 (or remove the line)', 'warn');
    // new medicines: a name that isn't already in the list (the same new name on two lines is one medicine)
    const freshIds = new Map();
    for (const l of lines.filter((x) => x.productId === NEW)) {
      const name = l.name.trim().replace(/\s+/g, ' ');
      if (name.length < 2) return toast('Type the name of the new medicine', 'warn');
      const dup = products.find((p) => p.name.trim().toLowerCase() === name.toLowerCase());
      if (dup) return toast(`"${dup.name}" is already in your medicine list. Choose it from the list instead of adding it again.`, 'warn');
      if (!(Number(l.price) > 0)) return toast(`Enter a retail price for ${name} (or its cost, and the price is worked out)`, 'warn');
      if (!freshIds.has(name.toLowerCase())) freshIds.set(name.toLowerCase(), uid());
    }
    const nameOf = (l) => (l.productId === NEW ? l.name.trim().replace(/\s+/g, ' ') : products.find((p) => p.id === l.productId)?.name);
    const noExpiry = lines.find((l) => !l.expiry);
    if (noExpiry) return toast(`Enter the expiry date for ${nameOf(noExpiry)} (needed for first-expiry-first-out)`, 'warn');
    const expired = lines.find((l) => daysUntil(l.expiry) < 0);
    if (expired) return toast(`${nameOf(expired)}: the expiry date ${expired.expiry} has already passed. Check the date on the pack.`, 'error');
    const below = lines.filter((l) => Number(l.price) > 0 && Number(l.price) < unitCost(l));
    if (below.length && !(await ask({ title: 'Selling below cost?', message: `${below.map(nameOf).slice(0, 5).join(', ')}${below.length > 5 ? '…' : ''}: the retail price is lower than the cost. Receive anyway?`, confirmText: 'Receive anyway' }))) return;

    const supplier = db.suppliers.find((x) => x.id === form.supplierId);
    const paid = form.paid === '' ? total : Math.max(0, Math.min(Number(form.paid) || 0, total));
    const idOf = (l) => (l.productId === NEW ? freshIds.get(nameOf(l).toLowerCase()) : l.productId);
    const purchase = {
      id: uid(), number: 'GRN' + Date.now().toString(36).toUpperCase().slice(-6), supplierId: form.supplierId, supplierName: supplier?.name || '—',
      invoice: form.invoice.trim(), date: form.date || today(), receivedBy: user.name, total, paid, bankId: form.bankId, branchId,
      items: lines.map((l) => ({ productId: idOf(l), name: nameOf(l), qty: Number(l.qty), cost: unitCost(l), batch: l.batch.trim(), expiry: l.expiry, ...(l.productId === NEW ? { added: true } : {}) })),
      ...(scanned ? { scanned: true } : {}),
    };
    update((d) => {
      const used = new Set(d.products.map((x) => x.barcode).filter(Boolean));
      for (const l of lines) {
        if (l.productId !== NEW) continue;
        const id = idOf(l);
        if (d.products.some((x) => x.id === id)) continue;
        const cost = unitCost(l), barcode = newInternalBarcode(used);
        used.add(barcode);
        put(d, 'products', { id, name: nameOf(l), generic: '', form: l.form || 'Others', unit: 'Unit', price: Number(l.price), wholesale: markupPrice(cost, s.wholesaleMarkup, s.priceRound) || Number(l.price), cost, reorder: 0, barcode });
        audit(d, user, 'Medicine added', `${nameOf(l)} (on receiving ${purchase.number})`, branchId);
      }
      lines.forEach((l, n) => {
        const p = d.products.find((x) => x.id === idOf(l));
        if (!p) return;
        const cost = unitCost(l);
        const b = addBatch(d, { productId: p.id, batch: l.batch, expiry: l.expiry, cost });
        purchase.items[n].batchId = b.id;
        move(d, { productId: p.id, qty: Number(l.qty), type: 'Purchase', ref: purchase.invoice || purchase.number, user: user.name, batchId: b.id, branchId });
        const price = Number(l.price) || p.price;
        if (cost !== p.cost || price !== p.price) {
          put(d, 'products', { ...p, cost: cost || p.cost, price });
          if (price !== p.price && l.productId !== NEW) audit(d, user, 'Price changed', `${p.name}: ${fmt(p.price)} → ${fmt(price)} (on receiving)`, branchId);
        }
      });
      if (form.poId) {
        const po = d.purchaseOrders.find((x) => x.id === form.poId);
        if (po) put(d, 'purchaseOrders', { ...po, status: 'Received', receivedAt: today(), purchaseId: purchase.id });
      }
      put(d, 'purchases', purchase);
      audit(d, user, 'Stock received', `${purchase.number} from ${purchase.supplierName}: ${lines.length} lines, ${fmt(total)}${scanned ? ' (scanned invoice, checked by ' + user.name + ')' : ''}${freshIds.size ? `, ${freshIds.size} new medicine${freshIds.size > 1 ? 's' : ''}` : ''}`, branchId);
    });
    setSaved(purchase);
    discard();
    searchRef.current?.focus();
  };

  return (
    <div className="page">
      <div className="page-head"><h1>Add Stock</h1><button type="button" className="btn ghost" onClick={() => setScanOpen(true)}><ScanText size={16} />Scan invoice</button></div>
      {scanOpen && <InvoiceScanner cfg={syncCfg} onClose={() => setScanOpen(false)} onRead={applyScan} />}
      {restored && !scanned && (
        <div className="notice info-notice row between gap wrap">
          <span><RotateCcw size={15} /> Your unfinished delivery was kept on this device. Carry on, or start again.</span>
          <span className="row gap"><button type="button" className="btn sm ghost" onClick={() => setRestored(false)}>Carry on</button><button type="button" className="btn sm ghost" onClick={discard}>Start again</button></span>
        </div>
      )}
      {scanned && (
        <div className="notice scan-notice">
          <div className="row between gap wrap">
            <strong><ScanText size={15} /> Filled from a scanned invoice{scanned.invoiceNo ? ` (no. ${scanned.invoiceNo})` : ''}: check every line before saving</strong>
            <button type="button" className="link-btn small" onClick={discard}>Discard</button>
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
      {saved && <div className="notice">Received {saved.items.length} item(s) worth {fmt(saved.total)} from {saved.supplierName}{saved.items.some((i) => i.added) ? ` (${saved.items.filter((i) => i.added).length} new medicine${saved.items.filter((i) => i.added).length > 1 ? 's' : ''} added to the list)` : ''}. {saved.paid < saved.total && `${fmt(saved.total - saved.paid)} added to creditors.`}</div>}
      <form className="card" onSubmit={save}>
        <div className="form-grid">
          <label className="field"><span>Supplier</span>
            <select value={form.supplierId} onChange={(e) => setForm({ ...form, supplierId: e.target.value })} required>
              <option value="">—</option>
              {db.suppliers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </label>
          <label className="field"><span>Invoice no.</span><input value={form.invoice} onChange={(e) => setForm({ ...form, invoice: e.target.value })} /></label>
          <label className="field"><span>Date</span><input type="date" value={form.date} max={today()} onChange={(e) => setForm({ ...form, date: e.target.value })} /></label>
          <label className="field"><span>Retail markup for worked-out prices (%)</span><input type="number" min="0" step="any" value={form.markup} onChange={(e) => setMarkup(e.target.value)} /></label>
        </div>
        <div className="picker">
          <input ref={searchRef} className="search big" placeholder="Search or scan a medicine to add… (Enter adds the first match)" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onSearchKey} />
          {ql && (
            <div className="picker-list">
              {matches.map((p) => <button type="button" key={p.id} onClick={() => pick(p)}>{p.name} <small className="muted">{p.stock} in stock · cost {fmt(p.cost)} · retail {fmt(p.price)}</small></button>)}
              {!exactName && ql.length > 1 && <button type="button" className="picker-new" onClick={() => addNew(q)}><Plus size={14} /> Add <strong>“{q.trim()}”</strong> as a new medicine</button>}
            </div>
          )}
        </div>
        <div className="table-wrap">
          <table className="lines stock-lines">
            <thead><tr><th>Medicine</th><th>Qty</th><th>Unit cost</th><th>Line total</th><th>New retail price</th><th>Batch</th><th>Expiry</th><th /></tr></thead>
            <tbody>
              {form.lines.map((l) => {
                const p = l.productId && l.productId !== NEW ? products.find((x) => x.id === l.productId) : null;
                const cost = unitCost(l), price = Number(l.price) || 0;
                const markup = cost > 0 && price > 0 ? Math.round(((price - cost) / cost) * 100) : null;
                return (
                  <tr key={l.key} className={l.productId === NEW ? 'new-line' : ''}>
                    <td className={l.read && (!l.productId || l.read.unclear) ? 'scan-check' : ''}>
                      {l.productId === NEW ? (
                        <div className="new-med">
                          <div className="row gap"><span className="badge ok"><Sparkles size={11} />New</span><button type="button" className="link-btn small" onClick={() => replaceLine(l.key, { ...l, productId: '' })}>choose existing</button></div>
                          <input ref={(el) => (nameRefs.current[l.key] = el)} placeholder="New medicine name, e.g. Action Tabs 4s" value={l.name} onChange={(e) => replaceLine(l.key, { ...l, name: e.target.value })} aria-label="New medicine name" />
                          <select value={l.form} onChange={(e) => replaceLine(l.key, { ...l, form: e.target.value })} aria-label="Formulation">{FORMS.map((f) => <option key={f}>{f}</option>)}</select>
                        </div>
                      ) : (
                        <select value={l.productId} onChange={(e) => chooseProduct(l, e.target.value)}>
                          <option value="">Select medicine…</option>
                          <option value={NEW}>➕ New medicine (not in the list){l.read?.name ? `: ${l.read.name}` : ''}</option>
                          {p && !ownList.includes(p) && <option value={p.id}>{p.name}</option>}
                          {ownList.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                        </select>
                      )}
                      {l.read && <small className={'scan-read' + (!l.productId || l.read.unclear ? ' text-warn' : ' muted')}>{!l.productId || l.read.unclear ? <AlertTriangle size={11} /> : <CheckCircle2 size={11} />} Invoice: {l.read.name}{l.read.unclear ? ' (hard to read)' : ''}</small>}
                    </td>
                    <td><input type="number" min="1" step="any" inputMode="decimal" value={l.qty} onChange={(e) => setLine(l.key, { qty: e.target.value })} aria-label="Quantity" /></td>
                    <td><input type="number" min="0" step="any" inputMode="decimal" placeholder="0" value={l.cost} onChange={(e) => setLine(l.key, { cost: e.target.value })} aria-label="Unit cost" /></td>
                    <td><input type="number" min="0" step="any" inputMode="decimal" placeholder="Total amount" className={l.by === 'total' ? 'typed' : ''} value={l.total} onChange={(e) => setLine(l.key, { total: e.target.value })} aria-label="Line total" /></td>
                    <td>
                      <input type="number" min="0" step="any" inputMode="decimal" placeholder={cost > 0 ? String(priceFor(cost)) : ''} value={l.price} onChange={(e) => setLine(l.key, { price: e.target.value })} aria-label="New retail price" />
                      <small className="price-hint">
                        {l.auto && l.derived ? <span className="muted">{l.kept ? 'kept (higher than +' + (form.markup || 0) + '%)' : `auto · +${form.markup || 0}%`}</span> : !l.auto ? <button type="button" className="link-btn small" title="Work the price out from the cost again" onClick={() => setLine(l.key, { price: '' })}><RotateCcw size={10} /> auto</button> : null}
                        {markup !== null && <span className={markup < 0 ? 'text-danger' : 'muted'}> {markup < 0 ? 'below cost' : `margin ${markup}%`}</span>}
                        {p && price !== p.price && p.price > 0 && <span className="muted"> · was {fmt(p.price)}</span>}
                      </small>
                    </td>
                    <td><input value={l.batch} placeholder="Batch no." onChange={(e) => replaceLine(l.key, { ...l, batch: e.target.value })} aria-label="Batch number" /></td>
                    <td><input type="date" value={l.expiry} min={today()} onChange={(e) => replaceLine(l.key, { ...l, expiry: e.target.value })} aria-label="Expiry date" /></td>
                    <td><button type="button" className="icon-btn" title="Remove line" aria-label="Remove line" onClick={() => setForm((f) => ({ ...f, lines: f.lines.length > 1 ? f.lines.filter((x) => x.key !== l.key) : [blankLine()] }))}><X size={15} /></button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="row gap">
          <button type="button" className="btn sm ghost" onClick={() => setForm((f) => ({ ...f, lines: [...f.lines, blankLine()] }))}>+ Add line</button>
          <button type="button" className="btn sm ghost" onClick={() => addNew('')}><Sparkles size={14} />New medicine</button>
          <small className="muted grow">Type the unit cost or the line total from the invoice; the other is worked out. Retail prices follow the markup until you type your own.</small>
        </div>
        <div className="form-grid" style={{ marginTop: 16 }}>
          <label className="field"><span>Amount paid now (blank = paid in full)</span><input type="number" min="0" step="any" value={form.paid} onChange={(e) => setForm({ ...form, paid: e.target.value })} /></label>
          <label className="field"><span>Paid from</span>
            <select value={form.bankId} onChange={(e) => setForm({ ...form, bankId: e.target.value })}>{db.banks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
          </label>
        </div>
        {scanned && <label className="field check scan-confirm"><input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} /><span>I have checked every line against the invoice (medicine, quantity, cost, batch and expiry)</span></label>}
        <div className="form-actions">
          <div className="grow"><strong>Total: {fmt(total)}</strong>{form.paid !== '' && Number(form.paid) < total && <small className="text-warn"> · {fmt(total - Math.max(0, Number(form.paid) || 0))} on credit</small>}</div>
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

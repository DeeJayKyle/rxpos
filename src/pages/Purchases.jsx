import { useState, useRef, useEffect, useMemo, cloneElement } from 'react';
import { searchProducts } from '../search.js';
import { showDate } from '../showdate.js';
import { nextHue, lineStyle, COL_VARS as COL_HUES } from '../linecolors.js';
import { parseGs1, findByGtin } from '../gs1.js';
import { useLocation } from 'react-router-dom';
import { Pencil, Trash2, ScanText, Camera, FileUp, Loader2, AlertTriangle, CheckCircle2, X, Plus, RotateCcw, Sparkles, GripVertical, ChevronLeft, ChevronRight, PauseCircle, Tags, Save } from 'lucide-react';
import { DateInput, MedicinePicker, useDateFormat } from '../fields.jsx';
import { DATE_FORMATS } from '../dateformat.js';
import { mainPack, packsOf, receiveInPacks } from '../packs.js';
import { packText, repack } from '../stockcount.js';
import { deviceSettings, setDevice } from '../device.js';
import { isWeb } from '../platform.js';
import { useStore, useSyncState, uid, today, now, put, del, move, addBatch, audit, downloadFile, toCSV, markupPrice, daysUntil, supplierPrices, MAIN_BRANCH } from '../store.jsx';
import { CASH } from '../finance.js';
import { round } from '../money.js';
import { Modal, PdfButton, Empty, PageTip, useSort, SortTh, SubViews, WhoChanged, ExportMenu } from '../ui.jsx';
import { useLoadMore, useColumns, useWide } from '../tablekit.jsx';
import { DateRange } from '../forms.jsx';
import { useListControls } from '../listcontrols.jsx';
import { ask, toast } from '../feedback.jsx';
import { newInternalBarcode } from '../barcode.jsx';
import { invoicePages, readInvoice, rankProducts, learnedNames, matchSupplier, normDate, pageBlob, lastBatchOf, fillFromLast } from '../invoiceScan.js';
import { uploadAttachment } from '../attach.jsx';
import { safeFileUrl } from '../safeurl.js';
import { CameraButton, CameraScanner } from '../camscan.jsx';
import AiVisionScanner from '../components/AiVisionScanner.jsx';
import { deliveryDraft, draftsFor, isOld, toCheck, checkText, needsCheck } from '../drafts.js';
import DraftsList, { useDraftCount } from './Drafts.jsx';
import { Link, useNavigate } from 'react-router-dom';
import InvoiceView from '../components/InvoiceView.jsx';
import { deliveryReview } from '../deliverychecks.js';
import { emptyCheck, scanInto, checkSummary } from '../deliverycheck.js';
import { usePageMenu } from '../pagemenu.js';

const NEW = '__new__'; // a line for a medicine that is not in the list yet
const FORMS = ['Tablets', 'Capsules', 'Syrups', 'Suspensions', 'Injectables', 'Creams', 'Ointments', 'Drops', 'Sachets', 'Devices', 'Surgicals', 'Others'];
const round2 = (n) => Math.round(n * 100) / 100;
/** What a new medicine is sold by, from its formulation (it is received by the box and sold by these) */
const unitForForm = (form) => ({ Tablets: 'Tablet', Capsules: 'Capsule', Sachets: 'Sachet', Syrups: 'Bottle', Suspensions: 'Bottle', Injectables: 'Vial', Drops: 'Bottle', Creams: 'Tube', Ointments: 'Tube' })[form] || 'Unit';
const NEW_PACK = '__pack__'; // "New pack size…" in Received as
const numOrBlank = (n) => (n === '' || n == null || !Number.isFinite(Number(n)) ? '' : String(round2(Number(n))));
/** Unit cost exactly as entered: a line typed as a total keeps total ÷ qty unrounded, so qty × cost = the invoice total */
const unitCost = (l) => (l.by === 'total' && l.total !== '' && Number(l.qty) > 0 ? Number(l.total) / Number(l.qty) : Number(l.cost) || 0);
/** Cost of one selling unit: a line received by the box divides the box cost by the units in a box */
const baseCost = (l) => unitCost(l) / (Number(l.recvSize) || 1);
const lineTotal = (l) => (l.by === 'total' && l.total !== '' ? Number(l.total) || 0 : (Number(l.qty) || 0) * (Number(l.cost) || 0));

/**
 * Apply an edit to a line. The person types the line total; the unit cost is worked out from it (total ÷ quantity) and
 * can't be typed (the owner's choice, 2026-11-13). A line started from a medicine's last cost keeps that cost as the
 * quantity changes until a total is typed. The retail price is never set by the app: a medicine already in the list
 * keeps its price until the person types a new one, and a new medicine has none until typed ("Use" applies the
 * cost + markup price only when tapped).
 */
function editLine(l, patch) {
  const n = { ...l, ...patch };
  const qty = Number(n.qty) || 0;
  if ('total' in patch) { n.by = 'total'; n.cost = patch.total !== '' && qty > 0 ? numOrBlank(Number(patch.total) / qty) : ''; }
  else if ('cost' in patch) { n.by = 'unit'; n.total = patch.cost !== '' ? numOrBlank(Number(patch.cost) * qty) : ''; }
  else if ('qty' in patch) {
    if (n.by === 'total' && n.total !== '') n.cost = qty > 0 ? numOrBlank(Number(n.total) / qty) : '';
    else if (n.cost !== '') n.total = numOrBlank(Number(n.cost) * qty);
  }
  const priced = Number(n.basePrice) > 0; // a medicine already in the list, with its price
  // "undo": back to today's price (a new medicine: no price until one is typed)
  if ('price' in patch && patch.price === '' && priced) n.price = String(Number(n.basePrice));
  n.derived = false;
  return n;
}

// Add Stock's columns: their order can be changed (drag a heading, or its arrows) and is kept on this device
const COL_LABEL = { medicine: 'Medicine', qty: 'Qty', cost: 'Unit cost (worked out)', total: 'Line total', price: 'New retail price', batch: 'Batch', expiry: 'Expiry' };
const COLS = Object.keys(COL_LABEL);
const colOrder = (saved) => { const ok = (saved || []).filter((c) => COLS.includes(c)); return [...ok, ...COLS.filter((c) => !ok.includes(c))]; };
const NEW_SUPPLIER = '__new_supplier__';

/** "DD/MM/YYYY ▾": how dates are typed on this device (This device → Dates) */
function DateFormatChoice({ fmt }) {
  return (
    <select className="date-fmt" value={fmt} aria-label="Date format" title="How dates are typed on this device" onClick={(e) => e.stopPropagation()} onChange={(e) => setDevice({ dateFormat: e.target.value })}>
      {DATE_FORMATS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
    </select>
  );
}

/** Receive stock from a supplier: every line becomes a batch (number + expiry) at this branch. */
/** "Box" → "Boxes", "Strip" → "Strips" */
const plural = (w) => (/(s|x|z|ch|sh)$/i.test(w) ? w + 'es' : w + 's');

export function AddStock() {
  const { db, products, update, fmt, user, branchId, syncCfg, can, numberFor } = useStore();
  const { syncStatus } = useSyncState();
  const location = useLocation();
  const s = db.settings;
  const dateFmt = useDateFormat();
  const [cols, setCols] = useState(() => colOrder(deviceSettings().stockCols));
  const [dragCol, setDragCol] = useState(null);
  const [newSupplier, setNewSupplier] = useState(null); // the "New supplier" form, when open
  const [renaming, setRenaming] = useState(null); // { product, name } while renaming a medicine
  const draftKey = 'rxpos-addstock-draft:' + (syncCfg.tenant || 'device') + ':' + branchId;
  const blankLine = () => ({ key: uid(), hue: nextHue(), productId: '', name: '', form: 'Tablets', qty: 1, cost: '', total: '', price: '', auto: true, by: 'unit', batch: '', expiry: '' });
  const [scanOpen, setScanOpen] = useState(false);
  // a scanned delivery draft being reviewed brings its invoice pages (kept in the pharmacy's cloud) and what was read
  const resumed = useRef(location.state?.draftId ? (db.drafts || []).find((x) => x.id === location.state.draftId) : null).current;
  const pageUrls = (paths) => (paths || []).map((x) => safeFileUrl(syncCfg.url, x)).filter(Boolean);
  const [scanned, setScanned] = useState(() => (resumed?.scan ? { ...resumed.scan, pagePaths: resumed.scan.pages || [], pages: pageUrls(resumed.scan.pages) } : null)); // { pages, pagePaths, supplier, invoiceNo, total, … } after an invoice was read
  const [checked, setChecked] = useState(false); // the person confirms they checked the scanned lines
  const blank = () => ({ supplierId: '', invoice: '', invoiceTotal: '', date: today(), paid: '', bankId: CASH, notes: '', markup: s.retailMarkup ?? 50, lines: [blankLine()] });
  const priceAt = (markup) => (cost) => markupPrice(cost, markup, s.priceRound);
  // A line for a medicine already in the list: its current cost and price, with the totals worked out
  const lineFor = (p, extra = {}) => {
    // received in the medicine's largest pack by default (Settings → Receipts & stock): the cost is then per pack
    const k = receiveInPacks(s) && !('recvPack' in extra) ? mainPack(p) : null;
    const l = { ...blankLine(), productId: p.id, cost: numOrBlank(p.cost ? p.cost * (k ? Number(k.size) : 1) : ''), price: p.price ? String(p.price) : '', basePrice: p.price || 0, derived: false,
      ...(k ? { recvPack: k.name, recvSize: Number(k.size) } : {}), ...extra };
    return { ...l, total: l.cost !== '' ? numOrBlank(Number(l.cost) * Number(l.qty || 0)) : '' };
  };
  // A scanned line whose batch or expiry was missing or doubtful: the medicine's last delivery's batch and expiry, marked
  // for the person to check (the owner's rule, 2026-11-20); nothing is taken when they were read well
  const withLast = (x, productId) => {
    if (!x.read || !productId || productId === NEW) return x;
    const f = fillFromLast({ batch: x.batch, expiry: x.expiry, check: x.read.check || [] }, lastBatchOf(db.batches, productId), today());
    if (!f.used.length) return x;
    const check = [...new Set([...(x.read.check || []), ...f.used])];
    return { ...x, batch: f.batch, expiry: f.expiry, read: { ...x.read, check, fromLast: f.used, note: [x.read.note, `${f.used.join(' and ')} from the last delivery: check against the pack`].filter(Boolean).join(' · ') } };
  };
  // What was read off an invoice → Add Stock lines (medicines matched, costs and prices worked out) and a summary
  const fromScan = (r, markup) => {
    const sup = matchSupplier(r.supplier, db.suppliers);
    const learned = learnedNames(db.purchases);
    const lines = r.items.map((it) => {
      // the medicines it could be, best first: only a safe match is put on the line (same strength, nothing as likely,
      // or received as this before); the others are offered as "Is it …?" on the line
      const ranked = rankProducts(it.name, products, { learned, alt: it.alt?.name });
      const p = ranked[0]?.sure ? ranked[0].p : null;
      const suggest = ranked.filter((x) => x.p.id !== p?.id).slice(0, 3).map((x) => ({ id: x.p.id, why: x.why }));
      const qty = it.qty || 1;
      const read = { name: it.name, unclear: !!it.unclear, matched: !!p, ...(p ? { matchWhy: ranked[0].why } : {}), ...(suggest.length ? { suggest } : {}), ...(it.check?.length ? { check: it.check } : {}), ...(it.alt ? { alt: it.alt } : {}), ...(it.why ? { why: it.why } : {}), ...(it.note ? { note: it.note } : {}), ...(it.page ? { page: it.page } : {}) };
      // G1: where the line was on the invoice, when the reading gave it (page and x, y, w, h as fractions of the page)
      const box = it.box && [it.box.x, it.box.y, it.box.w, it.box.h].every((v) => Number.isFinite(v) && v >= 0 && v <= 1) ? { page: Number(it.box.page) || 0, x: it.box.x, y: it.box.y, w: it.box.w, h: it.box.h } : undefined;
      const base = withLast({ qty, batch: it.batch || '', expiry: normDate(it.expiry), read, ...(box ? { box } : {}) }, p?.id);
      const cost = it.unitCost || (it.lineTotal && qty ? it.lineTotal / qty : 0);
      // packs or single units? whichever makes the invoice's price nearest the medicine's known cost per unit
      const size = p && cost > 0 && p.cost > 0 ? [1, ...packsOf(p).map((k) => Number(k.size))].reduce((b, z) => (Math.abs(Math.log(cost / z / p.cost)) < Math.abs(Math.log(cost / b / p.cost)) ? z : b), 1) : 0;
      const k = size > 1 ? packsOf(p).find((x) => Number(x.size) === size) : null;
      const l = p ? lineFor(p, { ...base, ...(size ? (k ? { recvPack: k.name, recvSize: size } : { recvPack: '', recvSize: 1 }) : {}) }, markup) : { ...blankLine(), ...base, name: it.name || '' };
      return it.lineTotal && !it.unitCost ? editLine(l, { total: String(it.lineTotal) }, priceAt(markup)) : editLine(l, { cost: numOrBlank(cost) }, priceAt(markup));
    });
    const summary = { supplier: r.supplier, supplierMatched: !!sup, invoiceNo: r.invoiceNo, total: r.total, linesTotal: r.linesTotal || 0, totalMatches: r.totalMatches !== false,
      readings: r.readings || 1, lines: lines.length, unmatched: lines.filter((l) => !l.productId).length, unclear: toCheck(lines), readAt: now(), readBy: user.name };
    return { sup, lines, summary, invoice: r.invoiceNo || '', date: normDate(r.date, { endOfMonth: false }) || '' };
  };
  // Put what was read off the invoice on the panel: nothing is saved until "Receive stock"
  const applyScan = (r, pages, pagePaths = []) => {
    const { sup, lines, summary, invoice, date } = fromScan(r, form.markup);
    setForm((f) => {
      const keep = f.lines.filter((l) => l.productId);
      // the lines to check first (2026-11-20): the person sees what needs them before the lines read well
      const ordered = [...lines.filter(needsCheck), ...lines.filter((l) => !needsCheck(l))];
      return { ...f, supplierId: sup?.id || f.supplierId, invoice: invoice || f.invoice, date: date || f.date, ...(date ? { dateRead: true } : {}),
        ...(Number(r.total) > 0 ? { invoiceTotal: String(r.total) } : {}), lines: keep.length || ordered.length ? [...keep, ...ordered] : [blankLine()] };
    });
    setScanned({ ...summary, pages, pagePaths });
    setChecked(false);
    setScanOpen(false);
  };
  // Scan Invoice with AI (components/AiVisionScanner.jsx): the checked lines go on the panel like a scanned invoice,
  // in single units (boxes × units per box, the cost per unit), to be confirmed before "Receive stock"
  const [aiScan, setAiScan] = useState(false);
  const applyVision = (lines) => {
    const items = lines.map((l) => {
      const p = products.find((x) => x.id === l.productId);
      const qty = Math.max(1, (Number(l.boxes) || 1) * (Number(l.unitsPerBox) || 1));
      return { name: p ? p.name : l.name, batch: l.batch, expiry: l.expiry, qty, unitCost: Number(l.unitCostUGX) || 0, lineTotal: qty * (Number(l.unitCostUGX) || 0), unclear: !p };
    });
    applyScan({ supplier: '', invoiceNo: '', date: '', total: 0, linesTotal: items.reduce((a, x) => a + x.lineTotal, 0), totalMatches: true, readings: 1, items }, [], []);
  };
  // Several invoices read in one go: each becomes a delivery draft waiting for review (Purchase History → Drafts)
  const saveScanDrafts = async (results) => {
    const recs = results.map(({ r, pagePaths }) => {
      const { sup, lines, summary, invoice, date } = fromScan(r, s.retailMarkup ?? 50);
      const f = { ...blank(), supplierId: sup?.id || '', invoice, date: date || today(), ...(date ? { dateRead: true } : {}), ...(Number(r.total) > 0 ? { invoiceTotal: String(r.total) } : {}), lines };
      const sum = lines.reduce((a, l) => a + (l.productId ? lineTotal(l) : Number(l.total) || 0), 0);
      return deliveryDraft(f, { id: uid(), user, branchId, supplierName: sup?.name || r.supplier, total: sum, scan: { ...summary, pages: pagePaths } });
    });
    await update((d) => {
      for (const rec of recs) put(d, 'drafts', rec);
      audit(d, user, 'Invoices scanned', `${recs.length} invoice${recs.length > 1 ? 's' : ''} read into delivery drafts for review: ${recs.map((x) => `${x.title.replace(/^Scanned: /, '')}${x.invoice ? ' ' + x.invoice : ''} (${x.count} lines, ${x.scan.unclear} to check)`).join('; ')}`, branchId);
    });
    setScanOpen(false);
    return recs;
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
  const pendingDraft = useRef(null); // a draft whose medicines haven't arrived yet (the web version downloads afresh after a reload)
  const [form, setForm] = useState(() => {
    // a saved delivery draft being continued (Purchase History → Drafts → Continue)
    const dr = location.state?.draftId && (db.drafts || []).find((x) => x.id === location.state.draftId);
    if (dr) return { ...blank(), ...dr.data, draftId: dr.id, draftStartedAt: dr.startedAt, lines: dr.data.lines?.length ? dr.data.lines.map((l) => ({ ...l, key: l.key || uid() })) : [blankLine()] };
    const po = location.state?.po;
    if (po) return { ...blank(), supplierId: po.supplierId || '', poId: po.id, lines: po.items.map((i) => { const p = products.find((x) => x.id === i.productId); return p ? lineFor(p, { qty: i.qty, recvPack: '', recvSize: 1, ...(i.cost ? { cost: numOrBlank(i.cost), total: numOrBlank(i.cost * i.qty) } : {}) }) : null; }).filter(Boolean) };
    try {
      const d = JSON.parse(localStorage.getItem(draftKey));
      const known = (l) => l.productId === NEW || products.some((p) => p.id === l.productId);
      const lines = (d?.lines || []).filter(known);
      // the web version starts empty and downloads the pharmacy: wait until the draft's medicines are there
      const ready = !isWeb || (d?.lines || []).filter((l) => l.productId).every(known);
      if (lines.length && ready) { restoredDraft.current = true; return { ...blank(), ...d, lines }; }
      if (d?.lines?.some((l) => l.productId)) pendingDraft.current = d;
    } catch { /* no draft */ }
    return blank();
  });
  // …restored as soon as its medicines are known
  useEffect(() => {
    const d = pendingDraft.current;
    if (!d || form.lines.some((l) => l.productId)) return;
    const known = (l) => l.productId === NEW || products.some((p) => p.id === l.productId);
    // wait for every medicine on it, or for the download to finish (one that no longer exists is then left out)
    if (!d.lines.filter((l) => l.productId).every(known) && (syncStatus.state === 'syncing' || !syncStatus.lastSync)) return;
    const lines = d.lines.filter(known);
    if (lines.some((l) => l.productId !== NEW)) { pendingDraft.current = null; restoredDraft.current = true; setForm({ ...blank(), ...d, lines }); setRestored(true); }
  }, [products, syncStatus.state]); // eslint-disable-line react-hooks/exhaustive-deps
  // Keep the unfinished delivery on this device, so a reload, a power cut or a trip to another page loses nothing
  useEffect(() => {
    if (pendingDraft.current && !form.lines.some((l) => l.productId)) return; // still waiting for the medicines: keep the draft
    const t = setTimeout(() => {
      try {
        if (form.lines.some((l) => l.productId)) { localStorage.setItem(draftKey, JSON.stringify(form)); setDraftAt(new Date()); }
        else { localStorage.removeItem(draftKey); setDraftAt(null); }
      } catch { /* storage full or blocked: the panel still works */ }
    }, 300);
    return () => clearTimeout(t);
  }, [form, draftKey]);
  // D2: "Draft saved 10:42" under the title, each time the delivery is kept on this device
  const [draftAt, setDraftAt] = useState(null);
  const [restored, setRestored] = useState(restoredDraft.current);
  const [q, setQ] = useState('');
  const [saved, setSaved] = useState(null);
  const [cam, setCam] = useState(false);
  const searchRef = useRef(null);
  const nameRefs = useRef({});

  const priceFor = priceAt(form.markup);
  const moveCol = (c, to) => setCols((list) => {
    const next = list.filter((x) => x !== c); next.splice(Math.max(0, Math.min(next.length, to)), 0, c);
    setDevice({ stockCols: next });
    return next;
  });
  const resetCols = () => { setCols(COLS); setDevice({ stockCols: COLS }); };
  // Enter in a line goes on to the next line, and on the last one adds a new line: it never receives the delivery
  const tableRef = useRef(null);
  const [focusLine, setFocusLine] = useState(null);
  const [activeLine, setActiveLine] = useState(null); // G1: the line being edited, outlined on the invoice
  const [headOpen, setHeadOpen] = useState(null); // 2: the invoice details folded to one line once a supplier is chosen (null: automatic)
  const [moreOpen, setMoreOpen] = useState(() => new Set()); // 4: on a phone, the lines whose batch, expiry and price are shown
  // G2: an order checked by scanning each pack ({ counts, extra }, null until started) and the last scan's message
  const [dcheck, setDcheck] = useState(null);
  const [dmsg, setDmsg] = useState('');
  const dScan = (code) => { const r = scanInto(dcheck || emptyCheck(), form.lines, products, code); setDcheck(r.state); setDmsg(r.text); if (r.line) setActiveLine(r.line.key); };
  const wide = useWide(1280);
  const split = wide && scanned?.pages?.length > 0;
  useEffect(() => {
    if (!focusLine) return;
    tableRef.current?.querySelector(`tr[data-line="${focusLine}"] .med-pick input, tr[data-line="${focusLine}"] .new-med input`)?.focus();
    setFocusLine(null);
  }, [focusLine, form.lines.length]);
  const onLinesKey = (e) => {
    if (e.key !== 'Enter' || e.defaultPrevented || e.target.tagName !== 'INPUT' && e.target.tagName !== 'SELECT') return;
    e.preventDefault();
    const key = e.target.closest('tr[data-line]')?.dataset.line;
    const at = form.lines.findIndex((l) => l.key === key);
    if (at >= 0 && at < form.lines.length - 1) return setFocusLine(form.lines[at + 1].key);
    const line = blankLine();
    setForm((f) => ({ ...f, lines: [...f.lines, line] }));
    setFocusLine(line.key);
  };
  // a supplier added from here is chosen at once
  const saveSupplier = async (e) => {
    e.preventDefault();
    const name = newSupplier.name.trim().replace(/\s+/g, ' ');
    if (name.length < 2) return toast('Type the supplier\'s name', 'warn');
    const dup = db.suppliers.find((x) => x.name.trim().toLowerCase() === name.toLowerCase());
    if (dup) { setForm((f) => ({ ...f, supplierId: dup.id })); setNewSupplier(null); return toast(`${dup.name} is already in your suppliers: chosen`); }
    const id = uid();
    try { await update((d) => { put(d, 'suppliers', { id, name, contact: newSupplier.contact.trim(), phone: newSupplier.phone.trim(), email: newSupplier.email.trim(), address: '' }); audit(d, user, 'Supplier added', `${name} (from Add Stock)`, branchId); }); }
    catch (err) { return toast('The supplier was NOT saved: ' + err.message, 'error'); }
    setForm((f) => ({ ...f, supplierId: id })); setNewSupplier(null); toast(`Supplier ${name} added`);
  };
  // renaming a medicine changes it in the medicine list (every screen, every device), not only on this delivery
  const saveRename = async (e) => {
    e.preventDefault();
    const { product, name: typed } = renaming, name = typed.trim().replace(/\s+/g, ' ');
    if (name.length < 2) return toast('Type the medicine\'s name', 'warn');
    if (name === product.name) return setRenaming(null);
    const dup = products.find((x) => x.id !== product.id && x.name.trim().toLowerCase() === name.toLowerCase());
    if (dup) return toast(`"${dup.name}" is already in your medicine list`, 'warn');
    const base = db.products.find((x) => x.id === product.id) || product;
    const { stock, totalStock, batch, expiry, ...rec } = { ...base, ...{ batch: base.batch, expiry: base.expiry } };
    try { await update((d) => { put(d, 'products', { ...rec, batch: base.batch, expiry: base.expiry, name }); audit(d, user, 'Medicine renamed', `${product.name} → ${name}`, branchId); }); }
    catch (err) { return toast('The name was NOT changed: ' + err.message, 'error'); }
    setRenaming(null); toast(`Renamed to ${name}`);
  };
  const prices = useMemo(() => supplierPrices(db.purchases), [db.purchases]);
  const setLine = (key, patch) => setForm((f) => ({ ...f, lines: f.lines.map((l) => (l.key === key ? editLine(l, patch, priceAt(f.markup)) : l)) }));
  const replaceLine = (key, line) => setForm((f) => ({ ...f, lines: f.lines.map((l) => (l.key === key ? { ...line, key } : l)) }));
  // the markup only changes the suggested price ("Use …"); no price changes by itself
  const setMarkup = (markup) => setForm((f) => ({ ...f, markup }));
  // rounded once to the currency's precision (a pack-split cost leaves no floating tail on the stored total)
  const total = round(form.lines.reduce((a, l) => a + (l.productId ? lineTotal(l) : 0), 0), Number(s.decimals ?? 0));
  const ql = q.trim().toLowerCase();
  // ranked as the till's search (name starts with it first, spelling variants allowed), in stock first
  const matches = useMemo(() => (ql ? searchProducts(products, q).slice(0, 12) : []), [ql, products]); // eslint-disable-line react-hooks/exhaustive-deps
  const [hi, setHi] = useState(0); // the highlighted match (↑ ↓, Enter adds it)
  useEffect(() => setHi(0), [ql]);
  useEffect(() => { document.querySelector('.search-row .picker-list.drop .hi')?.scrollIntoView({ block: 'nearest' }); }, [hi]);
  const exactName = ql && products.some((p) => p.name.trim().toLowerCase() === ql);

  const placeLine = (line) => {
    const empty = form.lines.find((l) => !l.productId);
    if (empty) replaceLine(empty.key, line);
    else setForm((f) => ({ ...f, lines: [...f.lines, line] }));
    setQ('');
    return empty?.key || line.key;
  };
  // 5: what was done last time with this supplier: the pack this medicine came in, and the markup used
  const lastFrom = (supplierId, productId) => {
    for (const pu of db.purchases) { // newest first
      if (!supplierId || pu.supplierId !== supplierId) continue;
      const it = productId ? (pu.items || []).find((x) => x.productId === productId) : null;
      if (!productId || it) return { pack: it?.pack, markup: pu.markup };
    }
    return null;
  };
  const habitPack = (p) => {
    const k = lastFrom(form.supplierId, p.id)?.pack;
    // the cost then per pack too (the medicine's cost is per single unit)
    return k && Number(k.size) > 1 && (p.packs || []).some((x) => x.name === k.name && Number(x.size) === Number(k.size)) ? { recvPack: k.name, recvSize: Number(k.size), ...(p.cost ? { cost: numOrBlank(p.cost * Number(k.size)) } : {}) } : {};
  };
  const pick = (p) => placeLine(lineFor(p, habitPack(p), form.markup));
  usePageMenu([
    { label: 'Scan invoice', Icon: ScanText, run: () => setScanOpen(true) },
    { label: 'Scan invoice with AI', Icon: Sparkles, run: () => setAiScan(true) },
    { label: 'New medicine', Icon: Plus, run: () => addNew('') },
    { label: 'Save as draft', Icon: Save, run: () => saveDraft() },
    form.supplierId && { label: 'Change supplier, invoice no., date', Icon: Pencil, run: () => setHeadOpen(true) },
  ]);
  const addNew = (name, barcode = '') => {
    const key = placeLine({ ...blankLine(), productId: NEW, name: name.trim(), ...(barcode ? { barcode } : {}) });
    setTimeout(() => nameRefs.current[key]?.focus(), 30);
  };
  // step 21 (src/gs1.js): a pack's 2D code gives the medicine, its batch and expiry at once; an unknown product number
  // starts a new medicine with them filled in
  const receivePack = (g) => {
    const p = findByGtin(products, g.gtin);
    if (p) { placeLine(lineFor(p, { batch: g.batch, expiry: g.expiry }, form.markup)); return p; }
    const key = placeLine({ ...blankLine(), productId: NEW, name: '', barcode: g.gtin, batch: g.batch, expiry: g.expiry });
    setTimeout(() => nameRefs.current[key]?.focus(), 30);
    return null;
  };
  const onSearchKey = (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(0, Math.min(matches.length - (exactName || ql.length < 2 ? 1 : 0), h + (e.key === 'ArrowDown' ? 1 : -1)))); return; }
    if (e.key === 'Escape') { setQ(''); return; }
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (!ql) return;
    const g = parseGs1(q);
    if (g) { receivePack(g); return; }
    const code = products.find((p) => p.barcode && p.barcode.toLowerCase() === ql);
    if (code || matches[hi]) pick(code || matches[hi]);
    else if (ql.length > 1) addNew(q);
  };
  const chooseProduct = (l, id) => {
    if (id === NEW) { replaceLine(l.key, { ...l, productId: NEW, name: l.name || l.read?.name || '', auto: true }); setTimeout(() => nameRefs.current[l.key]?.focus(), 30); return; }
    const p = products.find((x) => x.id === id);
    if (!p) return replaceLine(l.key, { ...l, productId: '' });
    // a scanned line keeps the cost read off the invoice
    const next = lineFor(p, withLast({ qty: l.qty, batch: l.batch, expiry: l.expiry, read: l.read }, p.id), form.markup);
    replaceLine(l.key, l.read && (l.cost !== '' || l.total !== '') ? editLine(next, l.by === 'total' ? { total: l.total } : { cost: l.cost }, priceFor) : next);
  };
  const discard = () => { setForm(blank()); setScanned(null); setChecked(false); setRestored(false); try { localStorage.removeItem(draftKey); } catch { /* ignore */ } };

  // Keep this delivery as a draft (synced, so it can be finished later or on another device) and start a fresh one
  const saveDraft = async () => {
    if (!form.lines.some((l) => l.productId)) return toast('Add at least one medicine before saving a draft', 'warn');
    const supplier = db.suppliers.find((x) => x.id === form.supplierId);
    const { draftId, draftStartedAt, ...rest } = form;
    const scan = scanned ? (({ pages: _shown, pagePaths, ...meta }) => ({ ...meta, pages: pagePaths || [], unclear: toCheck(rest.lines) }))(scanned) : undefined;
    const rec = deliveryDraft(rest, { id: draftId || uid(), user, branchId, supplierName: supplier?.name, total, startedAt: draftStartedAt, scan });
    try { await update((d) => { put(d, 'drafts', rec); }); } catch (err) { return toast('The draft was NOT saved: ' + err.message, 'error'); }
    toast(`Delivery saved as a draft${scanned && !scan.pages.length ? ' (the invoice photos stay on this device only)' : ''}. Find it in Purchase History → Drafts.`);
    discard();
  };
  const myDrafts = draftsFor(db, { user, branchId, kind: 'delivery' }).filter((x) => x.id !== form.draftId);

  // one delivery per press: a second click (or Enter) while the first is still being saved is ignored, so stock is
  // never received twice
  const receivingRef = useRef(false);
  const [receiving, setReceiving] = useState(false);
  const save = async (e) => {
    e.preventDefault();
    if (receivingRef.current) return;
    receivingRef.current = true; setReceiving(true);
    try { await receive(e); } finally { receivingRef.current = false; setReceiving(false); }
  };
  const receive = async (e) => {
    const badDate = e.currentTarget.querySelector('.date-input.bad input[type=text]');
    if (badDate) { badDate.focus(); return toast(`${badDate.getAttribute('aria-label') || 'A date'}: ${badDate.title.replace(/^This date is in the past$/, 'that date has already passed')}. Fix the box marked in red; nothing was received.`, 'error'); }
    const unpicked = form.lines.filter((l) => l.read && !l.productId && Number(l.qty) > 0);
    if (unpicked.length) return toast(`Choose the medicine for ${unpicked.length} line${unpicked.length > 1 ? 's' : ''} read from the invoice, add ${unpicked.length > 1 ? 'them' : 'it'} as new, or remove ${unpicked.length > 1 ? 'them' : 'it'}`, 'warn');
    if (toCheck(form.lines) > 0) return toast(`${toCheck(form.lines)} line${toCheck(form.lines) === 1 ? '' : 's'} still to check: compare ${toCheck(form.lines) === 1 ? 'it' : 'each'} with the invoice and tap “Checked”`, 'warn');
    if (scanned && !checked) return toast('Tick "I have checked every line against the invoice" before saving', 'warn');
    const lines = form.lines.filter((l) => l.productId && Number(l.qty) > 0);
    if (!lines.length) return toast('Add at least one medicine', 'warn');
    if (form.lines.some((l) => l.productId && !(Number(l.qty) > 0))) return toast('Every line needs a quantity above 0 (or remove the line)', 'warn');
    // G2: a delivery checked by scan: what is missing or extra is said before anything is received
    if (dcheck) {
      const sum = checkSummary(dcheck, form.lines, (l) => products.find((p) => p.id === l.productId)?.name || l.name || 'A medicine');
      const effects = [...sum.missing.map((x) => `${x.name}: ${x.got} of ${x.want} scanned`), ...sum.over.map((x) => `${x.name}: ${x.got} scanned, ${x.want} on the order`), ...sum.extra.map((x) => `Extra: ${x.name || x.code}`)];
      if (effects.length && !(await ask({ title: 'Not everything matches the scan', message: 'Receive the quantities on the lines as they are? You can still change them first.', effects, confirmText: 'Receive stock' }))) return;
    }
    // new medicines: a name that isn't already in the list (the same new name on two lines is one medicine)
    const freshIds = new Map();
    for (const l of lines.filter((x) => x.productId === NEW)) {
      const name = l.name.trim().replace(/\s+/g, ' ');
      if (name.length < 2) return toast('Type the name of the new medicine', 'warn');
      const dup = products.find((p) => p.name.trim().toLowerCase() === name.toLowerCase());
      if (dup) return toast(`"${dup.name}" is already in your medicine list. Choose it from the list instead of adding it again.`, 'warn');
      if (!(Number(l.price) > 0)) return toast(`Enter a retail price for ${name}`, 'warn');
      if (!freshIds.has(name.toLowerCase())) freshIds.set(name.toLowerCase(), uid());
    }
    const nameOf = (l) => (l.productId === NEW ? l.name.trim().replace(/\s+/g, ' ') : products.find((p) => p.id === l.productId)?.name);
    // received by a pack: its size is whole units (2 or more); a new size is added to the medicine, under a name it doesn't use yet
    for (const l of lines.filter((x) => x.newPack || Number(x.recvSize) > 1)) {
      const size = Number(l.recvSize), name = String(l.recvPack || '').trim();
      if (!(Number.isInteger(size) && size >= 2)) return toast(`${nameOf(l)}: how many ${(products.find((x) => x.id === l.productId)?.unit || unitForForm(l.form)).toLowerCase()}s are in one ${name.toLowerCase() || 'pack'}? (2 or more)`, 'warn');
      if (!name) return toast(`${nameOf(l)}: give the pack a name (e.g. Box)`, 'warn');
      const same = packsOf(products.find((x) => x.id === l.productId)).find((k) => k.name.toLowerCase() === name.toLowerCase());
      if (same && Number(same.size) !== size) return toast(`${nameOf(l)} already has a ${same.name} of ${same.size}. Choose it, or call the new pack something else (e.g. "${same.name} of ${size}")`, 'warn');
    }
    const noExpiry = lines.find((l) => !l.expiry);
    if (noExpiry) return toast(`Enter the expiry date for ${nameOf(noExpiry)} (needed for first-expiry-first-out)`, 'warn');
    const expired = lines.find((l) => daysUntil(l.expiry) < 0);
    if (expired) return toast(`${nameOf(expired)}: the expiry date ${expired.expiry} has already passed. Check the date on the pack.`, 'error');
    // the review before receiving (src/deliverychecks.js, the owner's request 2026-11-22): what is about to go in, and
    // anything worth a second look (the date, the same invoice again, the invoice total, costs, quantities, expiry, price)
    const review = deliveryReview({
      lines: lines.map((l) => ({ productId: l.productId === NEW ? null : l.productId, name: nameOf(l), qty: Number(l.qty) * (Number(l.recvSize) || 1), cost: baseCost(l), price: Number(l.price) || 0, expiry: l.expiry })),
      products: new Map(products.map((p) => [p.id, p])), purchases: db.purchases, supplierId: form.supplierId, supplierName: db.suppliers.find((x) => x.id === form.supplierId)?.name || '',
      invoice: form.invoice, date: form.date || today(), today: today(), total, invoiceTotal: form.invoiceTotal, dateRead: !!form.dateRead,
    }, { money: fmt, date: showDate });
    const n = review.warnings.length;
    if (!(await ask({ title: n ? `Check before receiving: ${n} thing${n === 1 ? '' : 's'} to look at` : 'Receive this delivery?', message: review.summary.join('\n'),
      effects: review.warnings, confirmText: n ? 'Receive anyway' : 'Yes, receive', cancelText: 'Go back and fix' }))) return;

    const supplier = db.suppliers.find((x) => x.id === form.supplierId);
    const paid = form.paid === '' ? total : Math.max(0, Math.min(Number(form.paid) || 0, total));
    const idOf = (l) => (l.productId === NEW ? freshIds.get(nameOf(l).toLowerCase()) : l.productId);
    const purchase = {
      id: uid(), number: '', supplierId: form.supplierId, supplierName: supplier?.name || '—',
      invoice: form.invoice.trim(), notes: (form.notes || '').trim(), date: form.date || today(), receivedBy: user.name, total, paid, bankId: form.bankId, branchId,
      // invoiceName: the words on the supplier's invoice, so the next invoice with them is matched at once (invoiceMatch.js)
      items: lines.map((l) => ({ productId: idOf(l), name: nameOf(l), ...(l.read?.name ? { invoiceName: l.read.name } : {}), qty: Number(l.qty) * (Number(l.recvSize) || 1), cost: baseCost(l), batch: l.batch.trim(), expiry: l.expiry, ...(l.productId === NEW ? { added: true } : {}),
        ...(Number(l.recvSize) > 1 ? { pack: { name: l.recvPack, size: Number(l.recvSize), count: Number(l.qty), cost: unitCost(l) } } : {}) })),
      ...(scanned ? { scanned: true } : {}),
      markup: Number(form.markup) || 0, // 5: offered again next time with this supplier
    };
    try { await update((d) => {
      purchase.number = numberFor(d, 'GRN'); // step 7: counted with the delivery
      if (form.draftId && d.drafts.some((x) => x.id === form.draftId)) del(d, 'drafts', form.draftId); // the draft is done: it became this delivery
      const used = new Set(d.products.map((x) => x.barcode).filter(Boolean));
      for (const l of lines) {
        if (l.productId !== NEW) continue;
        const id = idOf(l);
        if (d.products.some((x) => x.id === id)) continue;
        const cost = baseCost(l), barcode = l.barcode && !used.has(l.barcode) ? l.barcode : newInternalBarcode(used);
        used.add(barcode);
        // received by the box: the medicine is sold by the unit (tablets, capsules…) and keeps the box as its pack
        const pack = Number(l.recvSize) > 1 ? [{ name: String(l.recvPack || 'Box').trim(), size: Number(l.recvSize) }] : [];
        put(d, 'products', { id, name: nameOf(l), generic: '', form: l.form || 'Others', unit: unitForForm(l.form), price: Number(l.price), wholesale: markupPrice(cost, s.wholesaleMarkup, s.priceRound) || Number(l.price), cost, reorder: 0, barcode, ...(pack.length ? { packs: pack } : {}) });
        audit(d, user, 'Medicine added', `${nameOf(l)} (on receiving ${purchase.number})`, branchId);
      }
      lines.forEach((l, n) => {
        const p = d.products.find((x) => x.id === idOf(l));
        if (!p) return;
        const cost = baseCost(l);
        const b = addBatch(d, { productId: p.id, batch: l.batch, expiry: l.expiry, cost });
        purchase.items[n].batchId = b.id;
        move(d, { productId: p.id, qty: purchase.items[n].qty, type: 'Purchase', ref: purchase.invoice || purchase.number, user: user.name, batchId: b.id, branchId });
        const price = Number(l.price) || p.price;
        // a pack size the medicine didn't have: it is added, so it can be received (and sold) by it again
        const packName = String(l.recvPack || '').trim(), size = Number(l.recvSize);
        const newPack = l.productId !== NEW && size > 1 && packName && !packsOf(p).some((k) => k.name.toLowerCase() === packName.toLowerCase());
        if (cost !== p.cost || price !== p.price || newPack) {
          put(d, 'products', { ...p, cost: cost || p.cost, price, ...(newPack ? { packs: [...(p.packs || []), { name: packName, size }] } : {}) });
          if (newPack) audit(d, user, 'Pack added', `${p.name}: ${packName} of ${size} (on receiving)`, branchId);
          if (price !== p.price && l.productId !== NEW) audit(d, user, 'Price changed', `${p.name}: ${fmt(p.price)} → ${fmt(price)} (on receiving)`, branchId);
        }
      });
      if (form.poId) {
        const po = d.purchaseOrders.find((x) => x.id === form.poId);
        if (po) put(d, 'purchaseOrders', { ...po, status: 'Received', receivedAt: today(), purchaseId: purchase.id });
      }
      put(d, 'purchases', purchase);
      audit(d, user, 'Stock received', `${purchase.number} from ${purchase.supplierName}: ${lines.length} lines, ${fmt(total)}${scanned ? ' (scanned invoice, checked by ' + user.name + ')' : ''}${freshIds.size ? `, ${freshIds.size} new medicine${freshIds.size > 1 ? 's' : ''}` : ''}`, branchId);
    }); } catch (err) { return toast('The delivery was NOT received: ' + err.message + ' Nothing was added to stock; the lines are still here to try again.', 'error'); }
    setSaved(purchase);
    discard();
    searchRef.current?.focus();
  };

  return (
    <div className="page">
      <div className="page-head"><div><h1>Add Stock</h1>{draftAt && <div className="sub draft-saved" role="status" title="This delivery is kept on this device while you work; Save as draft keeps it for other devices too">Draft saved {draftAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>}</div><div className="row gap wrap">
        <button type="button" className="btn primary" onClick={() => setAiScan(true)}><Sparkles size={16} />Scan Invoice with AI</button>
        <button type="button" className="btn ghost" onClick={() => setScanOpen(true)}><ScanText size={16} />Scan invoice</button>
      </div></div>
      {cam && <CameraScanner title="Scan medicines into the delivery" onClose={() => setCam(false)} onCode={(code) => {
        const g = parseGs1(code);
        if (g) { const gp = receivePack(g); if (!gp) setCam(false); return gp ? `${gp.name} added (batch ${g.batch || '—'}, expiry ${g.expiry || '—'})` : 'New product number: type the medicine name'; }
        const p = products.find((x) => x.barcode && x.barcode === code);
        if (p) { pick(p); return `${p.name} added`; }
        addNew('', code); setCam(false);
        return 'New barcode: type the medicine name';
      }} />}
      {form.poId && (
        // G2: receiving an order: scan each pack; its line ticks and counts up, anything not on the order is listed
        <div className="card dcheck">
          <div className="row between gap wrap">
            <strong><ScanText size={15} /> Check the delivery by scan</strong>
            {!dcheck ? <button type="button" className="btn sm ghost" onClick={() => { setDcheck(emptyCheck()); setDmsg('Scan each pack (or type its barcode and press Enter)'); }}>Start checking</button>
              : <button type="button" className="link-btn small" onClick={() => { setDcheck(null); setDmsg(''); }}>Stop checking</button>}
          </div>
          {dcheck && <>
            <input className="dcheck-input" aria-label="Scan a pack" placeholder="Scan a pack…" autoFocus onKeyDown={(e) => { if (e.key === 'Enter' && e.currentTarget.value.trim()) { e.preventDefault(); dScan(e.currentTarget.value); e.currentTarget.value = ''; } }} />
            {dmsg && <div className="small" role="status">{dmsg}</div>}
            {(() => { const sum = checkSummary(dcheck, form.lines, (l) => products.find((p) => p.id === l.productId)?.name || l.name); return (sum.missing.length > 0 || sum.extra.length > 0) && (
              <div className="small muted dcheck-left">{sum.missing.length > 0 && <>Still to scan: {sum.missing.map((x) => `${x.name} (${x.want - x.got})`).join(', ')}. </>}{sum.extra.length > 0 && <span className="text-warn">Extra: {sum.extra.map((x) => x.name || x.code).join(', ')}</span>}</div>
            ); })()}
          </>}
        </div>
      )}
      {form.draftId && <div className="notice info-notice">Continuing a saved draft. Receiving it removes it from Drafts; "Save as draft" keeps your changes in it.</div>}
      {myDrafts.length > 0 && <div className="notice info-notice row gap wrap">You have {myDrafts.length} saved deliver{myDrafts.length === 1 ? 'y' : 'ies'}{myDrafts.some((x) => isOld(x)) ? ', one waiting over a day' : ''}.<Link to="/purchases" state={{ tab: 'drafts' }}>Open drafts</Link></div>}
      <PageTip id="add-stock" title="Receiving a delivery">Search or scan each medicine (not in the list? type its name and choose “Add as a new medicine”). Type the line total from the invoice: the unit cost is worked out from it. The retail price changes only when you type a new one (tap “Use” for cost + markup). Scan invoice reads a photo for you.</PageTip>
      {newSupplier && (
        <Modal title="New supplier" onClose={() => setNewSupplier(null)}>
          <form onSubmit={saveSupplier}>
            <label className="field"><span>Supplier name</span><input autoFocus value={newSupplier.name} onChange={(e) => setNewSupplier({ ...newSupplier, name: e.target.value })} placeholder="e.g. Aim Pharmaceuticals Ltd" required /></label>
            <div className="form-grid">
              <label className="field"><span>Phone</span><input value={newSupplier.phone} inputMode="tel" onChange={(e) => setNewSupplier({ ...newSupplier, phone: e.target.value })} /></label>
              <label className="field"><span>Contact person</span><input value={newSupplier.contact} onChange={(e) => setNewSupplier({ ...newSupplier, contact: e.target.value })} /></label>
              <label className="field"><span>Email</span><input type="email" value={newSupplier.email} onChange={(e) => setNewSupplier({ ...newSupplier, email: e.target.value })} /></label>
            </div>
            <div className="form-actions"><button type="button" className="btn ghost" onClick={() => setNewSupplier(null)}>Cancel</button><button className="btn primary"><Plus size={16} />Add supplier</button></div>
          </form>
        </Modal>
      )}
      {renaming && (
        <Modal title="Rename medicine" onClose={() => setRenaming(null)}>
          <form onSubmit={saveRename}>
            <p className="muted small">The new name is used everywhere: the medicine list, the till, reports and every device. Its stock, prices and history stay as they are.</p>
            <label className="field"><span>Medicine name</span><input autoFocus value={renaming.name} onChange={(e) => setRenaming({ ...renaming, name: e.target.value })} required /></label>
            <div className="form-actions"><button type="button" className="btn ghost" onClick={() => setRenaming(null)}>Cancel</button><button className="btn primary"><Pencil size={16} />Save name</button></div>
          </form>
        </Modal>
      )}
      {aiScan && <AiVisionScanner mode="invoice" onClose={() => setAiScan(false)} onConfirm={applyVision} />}
      {scanOpen && <InvoiceScanner cfg={syncCfg} onClose={() => setScanOpen(false)} onRead={applyScan} onDrafts={saveScanDrafts} />}
      {/* 1 (2026-11-20): start with the supplier's invoice; typing the lines is the other way */}
      {!scanned && !form.poId && !form.lines.some((l) => l.productId) && (
        <div className="card scan-first" data-testid="scan-first">
          <div className="grow"><strong><ScanText size={18} /> Start with the supplier's invoice</strong><div className="small">Take a photo or choose a PDF: the lines are read and matched to your medicines for you to check. Or search below to type them.</div></div>
          <div className="row gap wrap">
            <button type="button" className="btn primary big" onClick={() => setScanOpen(true)}><ScanText size={18} />Scan invoice</button>
            <button type="button" className="btn ghost" onClick={() => setAiScan(true)}><Sparkles size={16} />Scan with AI</button>
          </div>
        </div>
      )}
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
            {scanned.lines} line{scanned.lines === 1 ? '' : 's'} read{scanned.readings > 1 ? ' and cross-checked by two AI readings' : ''}{scanned.readBy ? ` · scanned by ${scanned.readBy}` : ''}{scanned.total ? ` · invoice total ${fmt(scanned.total)} (here ${fmt(total)})` : ''}
            {scanned.total > 0 && scanned.totalMatches === false && <span className="text-warn"> · the lines read add up to {fmt(scanned.linesTotal)}, not the invoice total: a line may be missing or misread</span>}
            {scanned.unmatched > 0 && <span className="text-warn"> · {scanned.unmatched} not matched to a medicine: choose one or add it as new</span>}
            {toCheck(form.lines) > 0 && <span className="text-warn"> · {toCheck(form.lines)} line{toCheck(form.lines) === 1 ? '' : 's'} to check (marked below)</span>}
          </div>
          {scanned.supplier && !scanned.supplierMatched && <div className="small">Supplier on the invoice: <strong>{scanned.supplier}</strong> (not in your list) <button type="button" className="btn sm ghost" onClick={addScannedSupplier}>Add this supplier</button></div>}
          <div className="scan-thumbs">{scanned.pages.map((src, n) => <a key={n} href={src} target="_blank" rel="noreferrer" title={`Page ${n + 1}: open to compare`}><img src={src} alt={`Invoice page ${n + 1}`} /></a>)}</div>
        </div>
      )}
      {saved && <div className="notice">Received {saved.items.length} item(s) worth {fmt(saved.total)} from {saved.supplierName}{saved.items.some((i) => i.added) ? ` (${saved.items.filter((i) => i.added).length} new medicine${saved.items.filter((i) => i.added).length > 1 ? 's' : ''} added to the list)` : ''}. {saved.paid < saved.total && `${fmt(saved.total - saved.paid)} added to creditors.`}</div>}
      {/* G1: the invoice beside the form on a wide screen, the line being edited outlined on it */}
      <div className={'addstock-split' + (split ? ' on' : '')}>
      {split && <InvoiceView pages={scanned.pages} active={form.lines.find((l) => l.key === activeLine)} />}
      <form className="card invoice-sheet" onSubmit={save} onFocus={(e) => { const k = e.target.closest?.('tr[data-line]')?.dataset.line; if (k) setActiveLine(k); }}>
        {(() => {
          const open = headOpen ?? !form.supplierId;
          const sup = db.suppliers.find((x) => x.id === form.supplierId);
          return !open && (
            <button type="button" className="invoice-summary" data-testid="invoice-summary" onClick={() => setHeadOpen(true)} title="Change the supplier, invoice number, date or markup">
              <strong>{sup?.name || 'No supplier'}</strong>
              <span>{form.invoice ? `Invoice ${form.invoice}` : 'no invoice number'}</span>
              <span>{showDate(form.date)}</span>
              <span>markup {form.markup || 0}%</span>
              <span className="link-btn small"><Pencil size={12} /> Change</span>
            </button>
          );
        })()}
        <div className="invoice-head" style={headOpen ?? !form.supplierId ? undefined : { display: 'none' }}>
          <div className="invoice-from">
          <label className="field"><span className="invoice-caption">Supplier</span>
            <select value={form.supplierId} onChange={(e) => { if (e.target.value === NEW_SUPPLIER) return setNewSupplier({ name: '', phone: '', contact: '', email: '' }); const m = lastFrom(e.target.value)?.markup; setForm({ ...form, supplierId: e.target.value, ...(m != null && m !== '' ? { markup: m } : {}) }); }} required>
              <option value="">—</option>
              {[...db.suppliers].sort((a, b) => a.name.localeCompare(b.name)).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              {(can('suppliers') || can('stock.receive')) && <option value={NEW_SUPPLIER}>➕ New supplier…</option>}
            </select>
          </label>
          {(() => { const sup = db.suppliers.find((x) => x.id === form.supplierId); const bits = sup ? [sup.contact, sup.phone, sup.email, sup.address].filter(Boolean) : []; return bits.length ? <div className="invoice-party muted small">{bits.join(' · ')}</div> : null; })()}
          <div className="invoice-to">
            <span className="invoice-caption">Delivered to</span>
            <strong>{s.name}</strong>
            <span className="muted small">{[s.address, s.phone].filter(Boolean).join(' · ') || ' '}</span>
          </div>
          </div>
          <div className="invoice-meta">
            <div className="invoice-title">Purchase invoice<small>Goods received{branchId !== MAIN_BRANCH ? ` · ${db.branches.find((x) => x.id === branchId)?.name || ''}` : ''}</small></div>
            <label className="invoice-meta-row"><span>Invoice no.</span><input value={form.invoice} placeholder="as on the invoice" onChange={(e) => setForm({ ...form, invoice: e.target.value })} aria-label="Invoice number" /></label>
            <label className="invoice-meta-row"><span>Invoice total</span><input type="number" min="0" step="any" value={form.invoiceTotal ?? ''} placeholder="as printed on the invoice" onChange={(e) => setForm({ ...form, invoiceTotal: e.target.value })} aria-label="Invoice total" /></label>
            {Number(form.invoiceTotal) > 0 && Math.abs(Number(form.invoiceTotal) - total) >= 1 && <div className="invoice-meta-note small text-warn" data-testid="invoice-total-diff">The lines add up to {fmt(total)}: {fmt(Math.abs(Number(form.invoiceTotal) - total))} {Number(form.invoiceTotal) > total ? 'short of' : 'over'} the invoice</div>}
            <label className="invoice-meta-row"><span>Date <DateFormatChoice fmt={dateFmt} /></span><DateInput value={form.date} max={today()} onChange={(v) => setForm((f) => ({ ...f, date: v || today(), dateRead: false }))} aria-label="Delivery date" /></label>
            {form.date && form.date !== today() && <div className="invoice-meta-note small" data-testid="date-note"><span className={form.dateRead ? 'text-warn' : 'muted'}>{form.dateRead ? 'Read from the invoice: check it' : 'Not today'}</span> <button type="button" className="link-btn small" onClick={() => setForm((f) => ({ ...f, date: today(), dateRead: false }))}>Use today</button></div>}
            {form.supplierId && <button type="button" className="link-btn small invoice-fold" onClick={() => setHeadOpen(false)}>Done: fold these details</button>}
            <label className="invoice-meta-row"><span>Retail markup %</span><input type="number" min="0" step="any" value={form.markup} onChange={(e) => setMarkup(e.target.value)} aria-label="Retail markup for worked-out prices (%)" title="Only for the suggested price (tap “Use” on a line); no price changes by itself" /></label>
          </div>
        </div>
        <div className="picker row gap search-row">
          <CameraButton className="btn ghost cam-btn" onClick={() => setCam(true)} />
          <input ref={searchRef} className="search big" role="combobox" aria-expanded={!!ql} aria-autocomplete="list" placeholder="Search or scan a medicine to add… (↑ ↓ to choose, Enter adds it)" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onSearchKey} />
          {/* drops down from the search line itself, over the page (scrolls inside; never pushes the lines down) */}
          {ql && (
            <div className="picker-list drop" role="listbox">
              {matches.map((p, i) => <button type="button" role="option" aria-selected={i === hi} className={i === hi ? 'hi' : ''} key={p.id} onMouseEnter={() => setHi(i)} onClick={() => pick(p)}><span className="pick-name">{p.name}</span> <small className={p.stock > 0 ? 'stock-in' : 'muted'}>{p.stock > 0 ? `${p.stock} in stock` : 'none in stock'} · cost {fmt(p.cost)} · retail {fmt(p.price)}</small></button>)}
              {!matches.length && <div className="med-pick-empty muted small">No medicine matches “{q.trim()}”.</div>}
              {!exactName && ql.length > 1 && <button type="button" className={'picker-new' + (hi === matches.length ? ' hi' : '')} onClick={() => addNew(q)}><Plus size={14} /> Add <strong>“{q.trim()}”</strong> as a new medicine</button>}
            </div>
          )}
        </div>
        <div className="table-wrap">
          <table className="lines stock-lines" ref={tableRef} onKeyDown={onLinesKey}>
            <thead><tr><th className="line-no">#</th>{cols.map((c, i) => (
              <th key={c} className={`col-move col-${c}` + (dragCol === c ? ' dragging' : '')} style={{ '--col': COL_HUES[c] }} draggable onDragStart={(e) => { setDragCol(c); e.dataTransfer.effectAllowed = 'move'; }} onDragEnd={() => setDragCol(null)}
                onDragOver={(e) => { if (dragCol && dragCol !== c) e.preventDefault(); }} onDrop={(e) => { e.preventDefault(); if (dragCol) moveCol(dragCol, i); setDragCol(null); }} title="Drag to move this column">
                <span className="col-head"><GripVertical size={12} className="col-grip" aria-hidden="true" />{COL_LABEL[c]}
                  <span className="col-arrows"><button type="button" className="icon-btn xs" disabled={i === 0} aria-label={`Move ${COL_LABEL[c]} left`} onClick={() => moveCol(c, i - 1)}><ChevronLeft size={12} /></button><button type="button" className="icon-btn xs" disabled={i === cols.length - 1} aria-label={`Move ${COL_LABEL[c]} right`} onClick={() => moveCol(c, i + 1)}><ChevronRight size={12} /></button></span></span>
              </th>))}<th /></tr></thead>
            <tbody>
              {form.lines.map((l, lineIndex) => {
                const p = l.productId && l.productId !== NEW ? products.find((x) => x.id === l.productId) : null;
                const cost = baseCost(l), price = Number(l.price) || 0;
                const packs = (p?.packs || []).filter((k) => k.name && Number(k.size) > 1);
                const markup = cost > 0 && price > 0 ? Math.round(((price - cost) / cost) * 100) : null;
                  const cells = {
                    medicine: (
                    <td key="medicine" data-label="Medicine" className={'line-med' + (l.read && (!l.productId || l.read.unclear) ? ' scan-check' : '')}>
                      {l.productId === NEW ? (
                        <div className="new-med">
                          <div className="row gap"><span className="badge ok"><Sparkles size={11} />New</span><button type="button" className="link-btn small" onClick={() => replaceLine(l.key, { ...l, productId: '' })}>choose existing</button></div>
                          <input ref={(el) => (nameRefs.current[l.key] = el)} placeholder="New medicine name, e.g. Action Tabs 4s" value={l.name} onChange={(e) => replaceLine(l.key, { ...l, name: e.target.value })} aria-label="New medicine name" />
                          <select value={l.form} onChange={(e) => replaceLine(l.key, { ...l, form: e.target.value })} aria-label="Formulation">{FORMS.map((f) => <option key={f}>{f}</option>)}</select>
                        </div>
                      ) : (
                        <div className="row gap nowrap">
                          <MedicinePicker products={products} value={l.productId} onPick={(id) => chooseProduct(l, id)} placeholder={l.read?.name ? `Search: ${l.read.name}` : 'Search medicine…'}
                            onNew={(typed) => { chooseProduct({ ...l, name: typed || l.name || l.read?.name || '' }, NEW); }} newLabel={(typed) => `New medicine (not in the list)${typed || l.read?.name ? `: ${typed || l.read.name}` : ''}`} />
                          {p && can('medicines.manage') && <button type="button" className="icon-btn" title="Edit this medicine's name in the medicine list" aria-label="Rename medicine" onClick={() => setRenaming({ product: p, name: p.name })}><Pencil size={14} /></button>}
                        </div>
                      )}
                      {l.read && <small className={'scan-read' + (!l.productId || l.read.unclear ? ' text-warn' : ' muted')}>{!l.productId || l.read.unclear ? <AlertTriangle size={11} /> : <CheckCircle2 size={11} />} Invoice{l.read.page > 1 ? ` p.${l.read.page}` : ''}: {l.read.name}{checkText(l.read) ? ` · check ${checkText(l.read)}` : ''}{l.read.note ? ` · ${l.read.note}` : ''}</small>}
                      {l.read && l.productId !== NEW && (() => {
                        const opts = (l.read.suggest || []).filter((x) => x.id !== l.productId).map((x) => ({ ...x, p: products.find((y) => y.id === x.id) })).filter((x) => x.p);
                        return opts.length > 0 && (!l.productId || l.read.unclear) ? (
                          <span className="scan-suggest small" role="group" aria-label="Medicines it could be">{l.productId ? 'Or is it' : 'Is it'}: {opts.map((x) => <button key={x.id} type="button" className="chip-btn" title={x.why} onClick={() => chooseProduct(l, x.id)}>{x.p.name}</button>)}</span>
                        ) : null;
                      })()}
                      {needsCheck(l) && l.productId && <button type="button" className="btn sm ghost line-checked" onClick={() => replaceLine(l.key, { ...l, read: { ...l.read, ok: true } })} title="I compared this line with the invoice">✓ Checked</button>}
                      {l.read?.ok && <small className="muted"> · checked</small>}
                      {l.productId && <button type="button" className="link-btn small more-toggle" aria-expanded={moreOpen.has(l.key)} onClick={() => setMoreOpen((m) => { const n = new Set(m); n.has(l.key) ? n.delete(l.key) : n.add(l.key); return n; })}>{moreOpen.has(l.key) ? 'Fewer details' : 'Batch, expiry, price…'}</button>}
                    </td>
                    ),
                    qty: (
                    <td key="qty" data-label="Qty"><input type="number" min="1" step="any" inputMode="decimal" value={l.qty} onChange={(e) => setLine(l.key, { qty: e.target.value })} aria-label="Quantity" />
                      {l.productId && (() => {
                        // step: received by the box (or any pack), sold by the unit; a pack size the medicine doesn't have yet is added to it
                        const unit = p?.unit || unitForForm(l.form);
                        const known = packs.some((k) => k.name === l.recvPack && Number(k.size) === Number(l.recvSize));
                        const choice = l.newPack ? NEW_PACK : Number(l.recvSize) > 1 && known ? l.recvPack : Number(l.recvSize) > 1 ? NEW_PACK : '';
                        return (<>
                          <select className="pack-select" value={choice} aria-label="Received as" onChange={(e) => {
                            if (e.target.value === NEW_PACK) return replaceLine(l.key, { ...l, newPack: true, recvPack: l.recvPack || 'Box', recvSize: Number(l.recvSize) > 1 ? l.recvSize : '' });
                            const k = packs.find((x) => x.name === e.target.value), size = k ? Number(k.size) : 1;
                            setLine(l.key, { newPack: false, recvPack: k?.name || '', recvSize: size, ...(baseCost(l) > 0 ? { cost: numOrBlank(baseCost(l) * size) } : {}) });
                          }}>
                            <option value="">{unit}s</option>
                            {packs.map((k) => <option key={k.name} value={k.name}>{plural(k.name)} of {k.size}</option>)}
                            <option value={NEW_PACK}>{packs.length ? 'Other pack size…' : 'Boxes / packs of…'}</option>
                          </select>
                          {choice === NEW_PACK && (
                            <span className="row gap new-pack">
                              <input className="small-input" aria-label="Pack name" placeholder="Box" value={l.recvPack || ''} onChange={(e) => replaceLine(l.key, { ...l, recvPack: e.target.value })} />
                              <span className="muted small">of</span>
                              <input className="small-input" type="number" min="2" step="1" inputMode="numeric" aria-label="Units per pack" placeholder="100" value={l.recvSize || ''} onChange={(e) => setLine(l.key, { recvSize: e.target.value })} />
                              <span className="muted small">{unit.toLowerCase()}s</span>
                            </span>
                          )}
                        </>);
                      })()}
                      {Number(l.recvSize) > 1 && <small className="price-hint muted">= {(Number(l.qty) || 0) * l.recvSize} {(p?.unit || unitForForm(l.form)).toLowerCase()}s</small>}
                    </td>
                    ),
                    cost: (
                    <td key="cost" data-label="Unit cost">{/* worked out from the line total (total ÷ quantity): not typed */}
                      <output className="unit-cost num" aria-label="Unit cost" title="Line total ÷ quantity">{unitCost(l) > 0 ? fmt(unitCost(l)) : '—'}</output>
                      {Number(l.recvSize) > 1 && <small className="price-hint muted">per {String(l.recvPack || 'pack').toLowerCase()}</small>}
                      {(() => { const best = (prices.get(l.productId) || []).find((o) => o.supplierId !== form.supplierId); return best && cost > 0 && best.cost < cost ? <small className="price-hint text-warn" title={`Last bought from ${best.supplierName} on ${best.date}`}>{best.supplierName}: {fmt(best.cost)}</small> : null; })()}
                    </td>
                    ),
                    total: (
                    <td key="total" data-label="Line total"><input type="number" min="0" step="any" inputMode="decimal" placeholder="Total amount" className={l.by === 'total' ? 'typed' : ''} value={l.total} onChange={(e) => setLine(l.key, { total: e.target.value })} aria-label="Line total" /></td>
                    ),
                    price: (
                    <td key="price" data-label="Retail price">
                      <input type="number" min="0" step="any" inputMode="decimal" placeholder={p?.price > 0 ? `keeps ${p.price}` : 'retail price'} value={l.price} onChange={(e) => setLine(l.key, { price: e.target.value })} aria-label="New retail price" />
                      <small className="price-hint">
                        {p?.price > 0 && String(l.price) !== String(p.price) && <button type="button" className="link-btn small" title="Back to today's price" onClick={() => setLine(l.key, { price: '' })}><RotateCcw size={10} /> undo</button>}
                        {/* the owner's choice: the price is only what the person types; cost + markup is offered, not applied */}
                        {cost > 0 && priceFor(cost) !== price && <button type="button" className="link-btn small" title={`Cost + ${form.markup || 0}% markup`} onClick={() => setLine(l.key, { price: String(priceFor(cost)) })}>Use {fmt(priceFor(cost))}</button>}
                        {markup !== null && <span className={markup < 0 ? 'field-error inline' : 'muted'} role={markup < 0 ? 'alert' : undefined}> {markup < 0 ? 'below the cost' : `margin ${markup}%`}</span>}
                        {p && price !== p.price && p.price > 0 && <span className="muted"> · was {fmt(p.price)}</span>}
                      </small>
                    </td>
                    ),
                    batch: (
                    <td key="batch" data-label="Batch"><input value={l.batch} placeholder="Batch no." onChange={(e) => replaceLine(l.key, { ...l, batch: e.target.value })} aria-label="Batch number" /></td>
                    ),
                    expiry: (
                    <td key="expiry" data-label="Expiry" className={l.expiry && daysUntil(l.expiry) < 0 ? 'has-error' : ''}><DateInput value={l.expiry} min={today()} monthYear onChange={(v) => replaceLine(l.key, { ...l, expiry: v })} aria-label="Expiry date" />
                      {/* D1: said at once, not only when receiving */}
                      {l.expiry && daysUntil(l.expiry) < 0 && <small className="field-error" role="alert">This date has passed</small>}</td>
                    ),
                  };
                  // 7 (2026-11-20): on the line being worked on, the next box to fill is outlined
                  const nextField = l.productId && (activeLine ? l.key === activeLine : lineIndex === form.lines.length - 1)
                    ? ['qty', 'total', 'batch', 'expiry'].find((f) => (f === 'total' ? l.total === '' && l.cost === '' : !String(l[f] ?? '').trim()))
                    : null;
                  return (
                  <tr key={l.key} data-line={l.key} className={'hued' + (l.productId === NEW ? ' new-line' : '') + (moreOpen.has(l.key) ? ' show-more' : '') + (needsCheck(l) ? ' to-check' : '')} style={lineStyle(l, lineIndex)}>
                    <td className="line-no" aria-hidden="true"><span className="line-badge">{lineIndex + 1}</span>
                      {dcheck && l.productId && <span className={'dcheck-count' + ((dcheck.counts[l.productId] || 0) >= Number(l.qty) ? ' done' : '')} data-testid="dcheck-count">{(dcheck.counts[l.productId] || 0) >= Number(l.qty) ? '✓ ' : ''}{dcheck.counts[l.productId] || 0}/{Number(l.qty) || 0}</span>}</td>
                    {cols.map((c) => cloneElement(cells[c], { className: `${cells[c].props.className || ''} col-${c}${c === nextField ? ' next-field' : ''}${['batch', 'expiry', 'price', 'cost'].includes(c) ? ' more-cell' : ''}`.trim(), style: { '--col': COL_HUES[c] } }))}
                    <td key="x" className="line-x"><button type="button" className="icon-btn" title="Remove line" aria-label="Remove line" onClick={() => setForm((f) => ({ ...f, lines: f.lines.length > 1 ? f.lines.filter((x) => x.key !== l.key) : [blankLine()] }))}><X size={15} /></button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="row gap">
          <button type="button" className="btn sm ghost" onClick={() => setForm((f) => ({ ...f, lines: [...f.lines, blankLine()] }))}>+ Add line</button>
          <button type="button" className="btn sm ghost" onClick={() => addNew('')}><Sparkles size={14} />New medicine</button>
          <small className="muted grow line-help">Quantity and line total from the invoice; the unit cost is worked out. Enter: next line.{cols.join() !== COLS.join() ? <> · <button type="button" className="link-btn small" onClick={resetCols}>reset column order</button></> : null}</small>
        </div>
        <div className="invoice-foot">
          <div className="invoice-notes">
            <label className="field"><span className="invoice-caption">Remarks</span><textarea rows={3} value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="e.g. 2 cartons short, supplier to deliver Friday" aria-label="Notes (optional)" /></label>
            <div className="form-grid">
              <label className="field"><span>Amount paid now (blank = paid in full)</span><input type="number" min="0" step="any" value={form.paid} onChange={(e) => setForm({ ...form, paid: e.target.value })} /></label>
              <label className="field"><span>Paid from</span>
                <select value={form.bankId} onChange={(e) => setForm({ ...form, bankId: e.target.value })}>{db.banks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
              </label>
            </div>
          </div>
          {(() => {
            const n = form.lines.filter((l) => l.productId).length, paidNow = form.paid === '' ? total : Math.max(0, Number(form.paid) || 0);
            return (
              <table className="invoice-totals">
                <tbody>
                  <tr><td>Lines</td><td className="num">{n}</td></tr>
                  <tr><td>Sub-total</td><td className="num">{fmt(total)}</td></tr>
                  <tr className="grand"><td>Total</td><td className="num">{fmt(total)}</td></tr>
                  <tr><td>Amount paid</td><td className="num">{fmt(Math.min(paidNow, total))}</td></tr>
                  <tr className={paidNow < total ? 'due' : ''}><td>Balance (on credit)</td><td className="num">{fmt(Math.max(0, total - paidNow))}</td></tr>
                </tbody>
              </table>
            );
          })()}
        </div>
        {scanned && <label className="field check scan-confirm"><input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} /><span>I have checked every line against the invoice (medicine, quantity, cost, batch and expiry)</span></label>}
        <div className="form-actions">
          <div className="grow muted small">{form.lines.some((l) => l.productId) ? 'Check the lines against the supplier\'s invoice, then receive.' : 'Add the medicines on the invoice.'}</div>
          <button type="button" className="btn ghost" onClick={saveDraft} title="Keep this delivery to finish later (also from another device)">Save as draft</button>
          <button className="btn primary" disabled={(!!scanned && !checked) || toCheck(form.lines) > 0 || receiving} title={toCheck(form.lines) > 0 ? 'Check the marked lines first' : undefined}>{receiving ? <><Loader2 size={16} className="spin" />Receiving…</> : toCheck(form.lines) > 0 ? `Receive stock · ${toCheck(form.lines)} of ${form.lines.filter((l) => l.read).length} to check` : 'Receive stock'}</button>
        </div>
      </form>
      </div>
    </div>
  );
}

export default function Purchases() {
  const { db, fmt, can } = useStore();
  const location = useLocation();
  const [tab, setTab] = useState(location.state?.tab || 'history');
  const draftCount = useDraftCount('delivery');
  const [view, setView] = useState(null);
  const [editing, setEditing] = useState(null);
  const [q, setQ] = useState('');
  const [pf, setPf] = useState({ from: '', to: '', supplier: '' });
  const payType = (p) => { const paid = p.paid ?? p.total; return paid <= 0 ? 'Credit' : (db.banks.find((b) => b.id === p.bankId)?.name || 'Cash') + (paid < p.total ? ' + credit' : ''); };
  const suppliers = [...new Set(db.purchases.map((p) => p.supplierName).filter(Boolean))].sort();
  const rows = db.purchases.filter((p) => (!q || [p.supplierName, p.invoice, p.number, p.notes, p.receivedBy].join(' ').toLowerCase().includes(q.toLowerCase()))
    && (!pf.from || p.date >= pf.from) && (!pf.to || p.date <= pf.to) && (!pf.supplier || p.supplierName === pf.supplier));
  const sorted = useSort(rows, { date: (p) => p.date + (p.number || ''), number: (p) => p.number || '', supplier: (p) => p.supplierName || '', invoice: (p) => p.invoice || '', total: (p) => p.total, by: (p) => p.receivedBy || '' }, 'date');
  // UI batch 3: 100 rows then more (C7), columns (C2), arrow keys / Enter (C6)
  const page = useLoadMore(sorted.rows, { resetKey: [q, pf.from, pf.to, pf.supplier, sorted.by, sorted.dir].join('|') });
  const histRef = useRef(null);
  const searchRef = useRef(null);
  const lc = useListControls({ rows: page.rows, onOpen: (p) => setView(p), onEdit: can('purchases.edit') ? (p) => !p.imported && setEditing(p) : null, searchRef, onClearSearch: () => setQ(''), enabled: tab === 'history' });
  const colsK = useColumns('purchases', [{ id: 'date', label: 'Date', fixed: true }, { id: 'number', label: 'GRN' }, { id: 'supplier', label: 'Supplier' }, { id: 'pay', label: 'Payment type' }, { id: 'invoice', label: 'Invoice' }, { id: 'items', label: 'Items' }, { id: 'by', label: 'Received by' }, { id: 'notes', label: 'Notes' }, { id: 'total', label: 'Total' }, { id: 'unpaid', label: 'Unpaid' }]);
  return (
    <div className="page">
      <div className="page-head">
        <h1>Purchase History</h1>
        <div className="row gap">
          <input className="search" placeholder="Search…" value={q} ref={searchRef} onChange={(e) => setQ(e.target.value)} />
          {tab === 'history' && colsK.button}
          <ExportMenu>
          <PdfButton target={histRef} title="Purchase history" subtitle={`${rows.length} deliveries · ${fmt(rows.reduce((a, p) => a + (p.total || 0), 0))}`} />
          <button className="btn ghost" onClick={() => downloadFile('purchases.csv', toCSV(rows.map((p) => ({ date: p.date, number: p.number, supplier: p.supplierName, invoice: p.invoice, paymentType: payType(p), items: p.items.length, total: p.total, paid: p.paid ?? p.total, receivedBy: p.receivedBy, notes: p.notes || '' }))), 'text/csv')}>Export CSV</button>
          </ExportMenu>
        </div>
      </div>
      <SubViews value={tab} onChange={setTab} main="history" mainLabel="All deliveries" views={[['drafts', 'Drafts', draftCount, PauseCircle], ['prices', 'Supplier prices', 0, Tags]]} />
      {tab === 'drafts' && <DraftsList kind="delivery" />}
      {tab === 'prices' && <SupplierPrices q={q} />}
      {tab === 'history' && <div className="report-filters">
        <DateRange from={pf.from} to={pf.to} onChange={(r) => setPf({ ...pf, ...r })} />
        <label>Supplier<select value={pf.supplier} onChange={(e) => setPf({ ...pf, supplier: e.target.value })}><option value="">All</option>{suppliers.map((x) => <option key={x}>{x}</option>)}</select></label>
      </div>}
      {tab === 'history' && <div className="card table-wrap" ref={histRef}>
        <table>
          <thead><tr>{colsK.shown.map((id) => ({ date: <SortTh key={id} s={sorted} k="date">Date</SortTh>, number: <SortTh key={id} s={sorted} k="number">GRN</SortTh>, supplier: <SortTh key={id} s={sorted} k="supplier">Supplier</SortTh>, pay: <th key={id}>Payment type</th>,
            invoice: <SortTh key={id} s={sorted} k="invoice">Invoice</SortTh>, items: <th key={id}>Items</th>, by: <SortTh key={id} s={sorted} k="by">Received by</SortTh>, notes: <th key={id}>Notes</th>, total: <SortTh key={id} s={sorted} k="total" className="num">Total</SortTh>, unpaid: <th key={id} className="num">Unpaid</th> }[id]))}<th /></tr></thead>
          <tbody>
            {page.rows.map((p, i) => { const c = {
              date: <td key="date">{p.date}</td>, number: <td key="number">{p.number}</td>, supplier: <td key="supplier">{p.supplierName}</td>, pay: <td key="pay">{payType(p)}</td>, invoice: <td key="invoice">{p.invoice}</td>, items: <td key="items">{p.items.length}</td>, by: <td key="by">{p.receivedBy}</td>,
              notes: <td key="notes" className="muted notes-cell" title={p.notes || undefined}>{p.notes || '—'}</td>,
              total: <td key="total" className="num"><strong>{fmt(p.total)}</strong></td>, unpaid: <td key="unpaid" className="num">{p.total - (p.paid ?? p.total) > 0 ? <span className="text-warn">{fmt(p.total - p.paid)}</span> : '—'}</td>,
            }; return (
              <tr key={p.id} {...lc.rowProps(p, i)}>
                {colsK.shown.map((id) => c[id])}
                <td className="actions"><div className="row-acts"><button className="btn sm ghost" onClick={() => setView(p)}>View</button>{can('purchases.edit') && !p.imported && <button className="btn sm ghost act-edit" onClick={() => setEditing(p)}><Pencil size={14} />Edit</button>}</div></td>
              </tr>
            ); })}
            {!rows.length && (db.purchases.length ? <Empty colSpan={colsK.shown.length + 1}>No deliveries match. Try another supplier, invoice number or dates.</Empty> : <Empty colSpan={colsK.shown.length + 1} action={{ label: 'Add stock', to: '/add-stock' }}>No deliveries yet. Each delivery you receive in Add Stock is kept here with its invoice, to view, correct or pay.</Empty>)}
          </tbody>
          {rows.length > 0 && <tfoot><tr className="total-row">{colsK.shown.map((id, k) => (id === 'total' ? <td key={id} className="num">{fmt(rows.reduce((a, p) => a + (p.total || 0), 0))}</td>
            : id === 'unpaid' ? <td key={id} className="num">{fmt(rows.reduce((a, p) => a + Math.max(0, (p.total || 0) - (p.paid ?? p.total)), 0))}</td>
              : <td key={id}>{k === 0 ? `Total · ${rows.length.toLocaleString()} deliveries` : ''}</td>))}<td /></tr></tfoot>}
        </table>
        {page.footer}
      </div>}
      {editing && <PurchaseEditor purchase={editing} onClose={() => setEditing(null)} />}
      {view && (
        <Modal title={`Purchase ${view.number || ''}`} onClose={() => setView(null)} wide>
          <WhoChanged keyText={view.number} />
          <p className="muted">{view.supplierName} · invoice {view.invoice || '—'} · {view.date} · {payType(view)}</p>
          {view.notes && <p><strong>Notes:</strong> {view.notes}</p>}
          <table>
            <thead><tr><th>Medicine</th><th>Batch</th><th>Expiry</th><th className="num">Qty</th><th className="num">Cost</th><th className="num">Total</th></tr></thead>
            <tbody>{view.items.map((i, n) => <tr key={n}><td>{i.name}</td><td>{i.batch}</td><td>{i.expiry}</td><td className="num">{i.qty}</td><td className="num">{fmt(i.cost)}</td><td className="num">{fmt(i.qty * i.cost)}</td></tr>)}</tbody>
          </table>
        </Modal>
      )}
    </div>
  );
}

/** Admin, manager or pharmacist: correct a past delivery: change any line (medicine, batch, expiry, quantity, line
 *  total), remove lines and add lines that were missed. As in Add Stock (the owner's choice, 2026-11-14), the unit cost
 *  is not typed: it is the line total ÷ quantity. A line keeps its unit cost when only the quantity changes, until a
 *  new total is typed (then the total stays and the cost follows the quantity). Every change moves stock with a "Purchase edit" movement on the right
 *  batch, so stock and history stay true; stock that was already sold can't be taken back. */
function PurchaseEditor({ purchase, onClose }) {
  const { db, products, fmt, update, user, batchesOf } = useStore();
  const br = purchase.branchId || MAIN_BRANCH;
  const dateFmt = useDateFormat();
  const [f, setF] = useState(() => ({ supplierId: purchase.supplierId || '', invoice: purchase.invoice || '', notes: purchase.notes || '', date: purchase.date, paid: purchase.paid ?? purchase.total, reason: '',
    items: purchase.items.map((i, n) => ({ ...i, key: uid(), hue: n % 8, orig: n, total: numOrBlank((Number(i.qty) || 0) * (Number(i.cost) || 0)), by: 'unit' })) }));
  const live = f.items.filter((i) => !i.removed);
  const unitOf = (i) => String(products.find((x) => x.id === i.productId)?.unit || 'unit').toLowerCase();
  /** the line's cost: total ÷ quantity once a total was typed (unrounded, so quantity × cost = the invoice total) */
  const costOf = (i) => (i.by === 'total' && i.total !== '' && Number(i.qty) > 0 ? Number(i.total) / Number(i.qty) : Number(i.cost) || 0);
  const totalOf = (i) => (i.by === 'total' && i.total !== '' ? Number(i.total) || 0 : (Number(i.qty) || 0) * (Number(i.cost) || 0));
  const total = live.reduce((a, i) => a + totalOf(i), 0);
  // the same rule as Add Stock's editLine: a typed total stays and the cost follows; otherwise the total follows qty × cost
  const setItem = (key, patch) => setF((x) => ({ ...x, items: x.items.map((i) => {
    if (i.key !== key) return i;
    const n = { ...i, ...patch };
    const qty = Number(n.qty) || 0;
    if ('total' in patch) { n.by = 'total'; n.cost = patch.total !== '' && qty > 0 ? Number(patch.total) / qty : ''; }
    else if ('cost' in patch) { n.by = 'unit'; n.total = patch.cost !== '' ? numOrBlank(Number(patch.cost) * qty) : ''; }
    else if ('qty' in patch) {
      if (n.by === 'total' && n.total !== '') n.cost = qty > 0 ? Number(n.total) / qty : '';
      else if (n.cost !== '') n.total = numOrBlank(Number(n.cost) * qty);
    }
    return n;
  }) }));
  const addItem = () => setF((x) => ({ ...x, items: [...x.items, { key: uid(), hue: nextHue(), productId: '', name: '', batch: '', expiry: '', qty: 1, cost: '', total: '', by: 'unit' }] }));
  // a line added (or its medicine changed) starts from that medicine's last cost, until its total is typed
  const pickMedicine = (i, id) => { const p = products.find((x) => x.id === id); if (p) setItem(i.key, { productId: p.id, name: p.name, ...(i.cost === '' || i.orig == null ? { cost: p.cost || '' } : {}) }); };
  const findBatch = (d, i) => (i.batchId && d.batches.find((b) => b.id === i.batchId)) || d.batches.find((b) => b.productId === i.productId && b.batch === String(i.batch || '').trim() && (b.expiry || '') === (i.expiry || ''));
  // what happens to each original line: kept (maybe changed), or taken out (removed, quantity 0, or another medicine)
  const plan = () => purchase.items.map((o, n) => {
    const i = f.items.find((x) => x.orig === n);
    const out = !i || i.removed || !(Number(i.qty) > 0) || i.productId !== o.productId;
    return { o, i, out };
  });
  const save = async (e) => {
    e.preventDefault();
    const badDate = e.currentTarget.querySelector('.date-input.bad input[type=text]');
    if (badDate) { badDate.focus(); return toast(`${badDate.getAttribute('aria-label') || 'A date'}: ${badDate.title}. Fix the box marked in red.`, 'error'); }
    if (!f.reason.trim()) return toast('Say why the delivery is being changed', 'warn');
    const added = f.items.filter((i) => !i.removed && (i.orig == null || i.productId !== purchase.items[i.orig].productId) && (i.productId || Number(i.qty) > 0));
    for (const i of added) {
      if (!i.productId) return toast('Choose the medicine for every added line (or remove the line)', 'warn');
      if (!(Number(i.qty) > 0)) return toast(`${i.name}: type the quantity received`, 'warn');
    }
    if (!live.some((i) => i.productId && Number(i.qty) > 0)) return toast('A delivery needs at least one line. To cancel it completely, remove the lines one by one is not possible: return the stock to the supplier instead.', 'warn');
    // can't take back more than is still in that batch
    for (const { o, i, out } of plan()) {
      const moved = !out && (i.batch !== o.batch || i.expiry !== o.expiry);
      const less = out ? o.qty : o.qty - (Number(i.qty) || 0);
      const b = findBatch(db, o);
      const have = b ? (batchesOf(o.productId, br).find((x) => x.id === b.id)?.qty || 0) : 0;
      const need = moved ? o.qty : less;
      if (need > 0 && need > have) return toast(`${o.name}: only ${have} of batch ${o.batch} left (some was already sold), so it can't be ${out ? 'removed' : 'reduced by more than ' + have}.`, 'error');
    }
    const supplier = db.suppliers.find((x) => x.id === f.supplierId);
    // stock audit (26 Nov 2026): the stock moves below are worked out from the delivery as it was opened. Saved twice (a
    // second press) or edited on another device since, they were applied twice; now nothing is saved and it is reopened.
    let stale = false;
    try { await update((d) => {
      const cur = d.purchases.find((x) => x.id === purchase.id);
      if (!cur || (cur.updatedAt || '') !== (purchase.updatedAt || '')) { stale = true; return; }
      const items = [];
      const mv = (productId, qty, batchId, note) => move(d, { productId, qty, type: 'Purchase edit', ref: purchase.number, ...(note ? { note } : {}), user: user.name, batchId, branchId: br });
      for (const { o, i, out } of plan()) {
        const old = findBatch(d, o);
        if (out) { if (old) mv(o.productId, -o.qty, old.id, i && !i.removed && Number(i.qty) > 0 ? 'medicine corrected' : 'line removed'); continue; }
        const qty = Math.max(0, Math.round(Number(i.qty) || 0)), cost = costOf(i);
        let batchId = old?.id;
        if ((i.batch !== o.batch || i.expiry !== o.expiry) && old) {
          mv(o.productId, -o.qty, old.id, 'batch corrected');
          batchId = addBatch(d, { productId: o.productId, batch: i.batch, expiry: i.expiry, cost }).id;
          if (qty) mv(o.productId, qty, batchId, 'batch corrected');
        } else if (qty !== o.qty) {
          if (!old) batchId = addBatch(d, { productId: o.productId, batch: i.batch, expiry: i.expiry, cost }).id;
          mv(o.productId, qty - o.qty, batchId);
        }
        if (batchId && cost !== o.cost) { const b = d.batches.find((x) => x.id === batchId); if (b) put(d, 'batches', { ...b, cost }); }
        const { key, orig, removed, hue: _h, total: _t, by: _b, ...rest } = i;
        items.push(repack({ ...rest, qty, cost, batchId }, qty)); // "received as 5 Boxes" follows the new quantity
      }
      // lines added on this edit (or a line whose medicine was corrected): new stock into their batch
      for (const i of added) {
        const qty = Math.max(0, Math.round(Number(i.qty) || 0)), cost = costOf(i);
        const b = addBatch(d, { productId: i.productId, batch: i.batch, expiry: i.expiry, cost });
        mv(i.productId, qty, b.id, i.orig == null ? 'line added' : 'medicine corrected');
        const { key, orig, removed, hue: _h, total: _t, by: _b, ...rest } = i;
        items.push({ ...rest, name: products.find((x) => x.id === i.productId)?.name || i.name, qty, cost, batchId: b.id });
      }
      const newTotal = items.reduce((a, i) => a + i.qty * i.cost, 0);
      put(d, 'purchases', { ...purchase, supplierId: f.supplierId, supplierName: supplier?.name || purchase.supplierName, invoice: f.invoice, notes: f.notes.trim(), date: f.date, items, total: newTotal,
        paid: Math.min(Number(f.paid) || 0, newTotal), editedBy: user.name, editedAt: now(),
        edits: [...(purchase.edits || []), { at: now(), by: user.name, reason: f.reason.trim(), before: { total: purchase.total, lines: purchase.items.length } }] });
      const changes = [];
      const removedN = plan().filter((x) => x.out && !(x.i && !x.i.removed && Number(x.i.qty) > 0)).length, addedN = added.filter((i) => i.orig == null).length, swapped = added.length - addedN;
      if (removedN) changes.push(`${removedN} line${removedN > 1 ? 's' : ''} removed`);
      if (addedN) changes.push(`${addedN} added`);
      if (swapped) changes.push(`${swapped} medicine${swapped > 1 ? 's' : ''} corrected`);
      audit(d, user, 'Purchase edited', `${purchase.number}: ${fmt(purchase.total)} → ${fmt(newTotal)}${changes.length ? ', ' + changes.join(', ') : ''} (${f.reason.trim()})`, br);
    }); } catch (err) { return toast(`${purchase.number} was NOT changed: ${err.message}`, 'error'); }
    if (stale) { onClose(); return toast(`${purchase.number} was changed since it was opened; nothing was saved. Open it again to edit it.`, 'warn'); }
    toast(`${purchase.number} updated; stock adjusted`);
    onClose();
  };
  return (
    <Modal title={`Edit purchase ${purchase.number}`} onClose={onClose} wide>
      <form onSubmit={save} className="stack">
        <div className="form-grid">
          <label className="field"><span>Supplier</span><select value={f.supplierId} onChange={(e) => setF({ ...f, supplierId: e.target.value })}><option value="">—</option>{[...db.suppliers].sort((a, b) => a.name.localeCompare(b.name)).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
          <label className="field"><span>Invoice no.</span><input value={f.invoice} onChange={(e) => setF({ ...f, invoice: e.target.value })} /></label>
          <label className="field"><span>Notes</span><input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></label>
          <label className="field"><span>Date <DateFormatChoice fmt={dateFmt} /></span><DateInput value={f.date} max={today()} onChange={(v) => setF((x) => ({ ...x, date: v || x.date }))} aria-label="Delivery date" /></label>
          <label className="field"><span>Amount paid</span><input type="number" min="0" step="any" value={f.paid} onChange={(e) => setF({ ...f, paid: e.target.value })} /></label>
        </div>
        <div className="table-wrap invoice-sheet flat">
        <table className="lines stock-lines edit-lines">
          <thead><tr><th className="line-no">#</th>{[['medicine', 'Medicine'], ['batch', 'Batch'], ['expiry', 'Expiry'], ['qty', 'Qty'], ['cost', 'Unit cost'], ['total', 'Line total']].map(([k, t]) => <th key={k} className={`col-${k}${k === 'cost' ? ' num' : ''}`} style={{ '--col': COL_HUES[k] }}>{t}</th>)}<th /></tr></thead>
          <tbody>
            {f.items.map((i, n) => (
              <tr key={i.key} className={'hued' + (i.removed ? ' line-removed' : i.orig == null ? ' new-line' : '')} style={lineStyle(i, n)}>
                <td className="line-no" aria-hidden="true"><span className="line-badge">{n + 1}</span></td>
                <td data-label="Medicine" className="line-med col-medicine">{i.removed ? <s>{i.name}</s> : <MedicinePicker products={products} value={i.productId} onPick={(id) => pickMedicine(i, id)} placeholder="Search medicine…" />}
                  {!i.removed && i.orig != null && i.productId !== purchase.items[i.orig].productId && <small className="text-warn">was {purchase.items[i.orig].name}: its stock is taken back, this one is added</small>}
                  {!i.removed && i.orig == null && <small className="muted">added on this edit</small>}</td>
                <td data-label="Batch" className="col-batch"><input value={i.batch || ''} disabled={i.removed} onChange={(e) => setItem(i.key, { batch: e.target.value })} aria-label="Batch" /></td>
                <td data-label="Expiry" className="col-expiry"><DateInput value={i.expiry || ''} monthYear disabled={i.removed} onChange={(v) => setItem(i.key, { expiry: v })} aria-label="Expiry" /></td>
                <td data-label="Qty" className="col-qty"><input type="number" min="0" value={i.qty} disabled={i.removed} onChange={(e) => setItem(i.key, { qty: e.target.value })} aria-label="Quantity" />
                  {/* stock audit: the quantity is in single units (tablets), not the boxes on the invoice */}
                  {!i.removed && <small className="muted qty-unit">{unitOf(i)}s{packText(products.find((x) => x.id === i.productId), i.qty) ? ` = ${packText(products.find((x) => x.id === i.productId), i.qty)}` : ''}</small>}</td>
                <td data-label="Unit cost" className="num col-cost">{/* worked out from the line total (total ÷ quantity): not typed, as in Add Stock */}
                  {i.removed ? <span className="muted">removed</span> : <output className="unit-cost num" aria-label="Unit cost" title="Line total ÷ quantity">{costOf(i) > 0 ? fmt(costOf(i)) : '—'}</output>}</td>
                <td data-label="Line total" className="col-total"><input type="number" min="0" step="any" inputMode="decimal" placeholder="Total amount" className={i.by === 'total' ? 'typed' : ''} value={i.total} disabled={i.removed} onChange={(e) => setItem(i.key, { total: e.target.value })} aria-label="Line total" /></td>
                <td className="line-x">{i.removed
                  ? <button type="button" className="btn sm ghost nowrap" onClick={() => setItem(i.key, { removed: false })}><RotateCcw size={13} />Undo</button>
                  : <button type="button" className="icon-btn" title="Remove this line" aria-label="Remove line" onClick={() => (i.orig == null ? setF((x) => ({ ...x, items: x.items.filter((y) => y.key !== i.key) })) : setItem(i.key, { removed: true }))}><Trash2 size={15} /></button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        <div><button type="button" className="btn sm ghost" onClick={addItem}><Plus size={14} />Add an item</button> <small className="muted">A removed line takes its stock back out; an added line puts stock in. Stock already sold can't be taken back.</small></div>
        <label className="field"><span>Reason for the change (kept in the audit log)</span><input required value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} placeholder="e.g. invoice quantity was 50 not 60; 2 items were missed" /></label>
        <div className="totals"><div className="row between"><span className="muted">Was</span><span className="num">{fmt(purchase.total)}</span></div><div className="row between grand"><span>New total</span><span className="num">{fmt(total)}</span></div></div>
        <div className="form-actions"><button type="button" className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary">Save changes</button></div>
      </form>
    </Modal>
  );
}

/** Photo or PDF of a supplier invoice → read by AI → handed back for the person to check on the Add Stock panel */
function InvoiceScanner({ cfg, onClose, onRead, onDrafts }) {
  const navigate = useNavigate();
  // one or more invoices, each with its pages (photos or a PDF): every invoice becomes one delivery draft
  const [invoices, setInvoices] = useState([]); // [{ id, pages: [dataUrl], note, status, error }]
  const [cur, setCur] = useState(0);
  const [busy, setBusy] = useState('');
  const addFiles = async (files, asNew = false) => {
    files = [...(files || [])];
    if (!files.length) return;
    setBusy('Opening…');
    try {
      const pdfs = files.filter((f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name)), photos = files.filter((f) => !pdfs.includes(f));
      const next = [...invoices];
      // a PDF is one invoice; photos chosen together are the pages of one invoice (added to the open one, if any)
      for (const f of pdfs) { const r = await invoicePages(f); next.push({ id: uid(), pages: r.pages, texts: r.texts || [], note: r.total > r.pages.length ? `Only the first ${r.pages.length} of ${r.total} pages will be read.` : '' }); }
      if (photos.length) {
        const pages = []; for (const f of photos) pages.push(...(await invoicePages(f)).pages);
        if (!asNew && next[cur] && !pdfs.length) next[cur] = { ...next[cur], pages: [...next[cur].pages, ...pages] };
        else next.push({ id: uid(), pages, note: '' });
      }
      setInvoices(next);
      setCur(pdfs.length || asNew || !next[cur] ? next.length - 1 : cur);
    } catch (e) { toast(e.message || 'That file could not be opened', 'error'); }
    finally { setBusy(''); }
  };
  const removeInvoice = (id) => { setInvoices((l) => l.filter((x) => x.id !== id)); setCur(0); };
  const removePage = (inv, n) => setInvoices((l) => l.map((x) => (x.id === inv.id ? { ...x, pages: x.pages.filter((_, k) => k !== n), texts: (x.texts || []).filter((_, k) => k !== n) } : x)).filter((x) => x.pages.length));
  const pageCount = invoices.reduce((a, x) => a + x.pages.length, 0);
  const setStatus = (id, patch) => setInvoices((l) => l.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  // Keep the pages in the pharmacy's cloud (whoever reviews the draft compares with them), then read them
  const readOne = async (inv, k) => {
    const label = invoices.length > 1 ? `Invoice ${k + 1} of ${invoices.length}: ` : '';
    setBusy(label + 'reading with two AI readings…');
    // the pages are kept in the cloud while they are read (side by side, not one after the other)
    const saving = Promise.all(inv.pages.map(async (pg, n) => (await uploadAttachment(cfg, pageBlob(pg), `invoice-${today()}-${n + 1}.jpg`)).path));
    const [pagePaths, r] = await Promise.all([saving, readInvoice(cfg, inv.pages, (n, of) => setBusy(`${label}reading${of > 1 ? ` page ${n} of ${of}` : ''} with two AI readings…`), inv.texts)]);
    if (!r.items.length) throw new Error('No medicine lines could be read. Try a sharper, straighter photo in good light.');
    return { r, pagePaths, pages: inv.pages };
  };
  const toDrafts = async () => {
    if (!navigator.onLine) return toast('Reading invoices needs the internet.', 'warn');
    const done = [];
    for (let k = 0; k < invoices.length; k++) {
      const inv = invoices[k];
      if (inv.status === 'saved') continue;
      try { done.push(await readOne(inv, k)); setStatus(inv.id, { status: 'read', error: '' }); }
      catch (e) { setStatus(inv.id, { status: 'failed', error: e.message || 'Could not be read' }); }
    }
    setBusy('');
    if (!done.length) return toast('No invoice could be read. See the reason under each one.', 'error');
    try {
      const recs = await onDrafts(done);
      const lines = recs.reduce((a, x) => a + x.scan.unclear, 0);
      toast(`${recs.length} invoice${recs.length > 1 ? 's' : ''} read and saved as draft${recs.length > 1 ? 's' : ''} for review${lines ? ` (${lines} line${lines > 1 ? 's' : ''} to check)` : ''}. Purchase History → Drafts.`, 'success');
      if (invoices.length > done.length) toast(`${invoices.length - done.length} invoice(s) could not be read: scan them again.`, 'warn');
      navigate('/purchases', { state: { tab: 'drafts' } });
    } catch (e) { toast('The drafts were NOT saved: ' + e.message, 'error'); }
  };
  const fillNow = async () => {
    if (!navigator.onLine) return toast('Reading an invoice needs the internet.', 'warn');
    try { const { r, pagePaths, pages } = await readOne(invoices[0], 0); onRead(r, pages, pagePaths); }
    catch (e) { toast(e.message || 'The invoice could not be read', 'error'); }
    finally { setBusy(''); }
  };
  return (
    <Modal title="Scan supplier invoices" onClose={busy ? () => {} : onClose} wide>
      <p className="muted small">Photograph each invoice or delivery note (typed or handwritten), or choose images or PDFs. Two AI models read every page and are cross-checked: each invoice is saved as a <strong>delivery draft waiting for review</strong>, with the lines to check marked. Nothing goes into stock until someone checks it and presses <strong>Receive stock</strong>.</p>
      <div className="row gap wrap">
        <label className="btn ghost"><Camera size={16} />{invoices[cur] ? 'Add a page (photo)' : 'Take photo'}<input hidden type="file" accept="image/*" capture="environment" onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} /></label>
        <label className="btn ghost"><FileUp size={16} />Choose images or PDFs<input hidden type="file" multiple accept="image/*,application/pdf,.pdf" onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} /></label>
        {invoices.length > 0 && <label className="btn ghost"><Plus size={16} />Another invoice<input hidden type="file" multiple accept="image/*,application/pdf,.pdf" capture="environment" onChange={(e) => { addFiles(e.target.files, true); e.target.value = ''; }} /></label>}
      </div>
      <p className="muted small">Photos taken one after another are pages of the same invoice; use <strong>Another invoice</strong> to start the next one. Flat, straight, in good light, the whole page in the picture.</p>
      {invoices.map((inv, k) => (
        <div key={inv.id} className={'scan-invoice' + (k === cur ? ' on' : '')} onClick={() => setCur(k)}>
          <div className="row between gap">
            <strong>Invoice {k + 1} · {inv.pages.length} page{inv.pages.length > 1 ? 's' : ''}</strong>
            <span className="row gap">
              {inv.status === 'failed' && <span className="badge danger"><AlertTriangle size={11} /> {inv.error}</span>}
              {inv.status === 'read' && <span className="badge ok"><CheckCircle2 size={11} /> read</span>}
              <button type="button" className="btn sm ghost" disabled={!!busy} onClick={(e) => { e.stopPropagation(); removeInvoice(inv.id); }}><X size={14} />Remove</button>
            </span>
          </div>
          {inv.note && <p className="small text-warn">{inv.note}</p>}
          <div className="scan-thumbs big">{inv.pages.map((src, n) => <span key={n} className="scan-page"><img src={src} alt={`Invoice ${k + 1} page ${n + 1}`} /><button type="button" className="icon-btn sm" title="Remove this page" disabled={!!busy} onClick={(e) => { e.stopPropagation(); removePage(inv, n); }}><X size={12} /></button></span>)}</div>
        </div>
      ))}
      <div className="form-actions">
        <button type="button" className="btn ghost" onClick={onClose} disabled={!!busy}>Cancel</button>
        {invoices.length === 1 && <button type="button" className="btn ghost" disabled={!pageCount || !!busy} onClick={fillNow}><ScanText size={16} />Read and fill in now</button>}
        <button type="button" className="btn primary" disabled={!pageCount || !!busy} onClick={toDrafts}>{busy ? <><Loader2 size={16} className="spin" />{busy}</> : <><ScanText size={16} />Read {invoices.length > 1 ? `${invoices.length} invoices` : 'invoice'} into draft{invoices.length > 1 ? 's' : ''} for review</>}</button>
      </div>
    </Modal>
  );
}

/** Each medicine bought from more than one supplier: what each charged last time, cheapest first */
function SupplierPrices({ q }) {
  const { db, fmt } = useStore();
  const ref = useRef(null);
  const names = useMemo(() => new Map(db.products.map((p) => [p.id, p.name])), [db.products]);
  const rows = useMemo(() => [...supplierPrices(db.purchases)].filter(([, list]) => list.length > 1)
    .map(([pid, list]) => ({ pid, name: names.get(pid) || '—', list, gap: list[list.length - 1].cost - list[0].cost, pct: Math.round(((list[list.length - 1].cost - list[0].cost) / list[0].cost) * 100) }))
    .filter((r) => !q || r.name.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => b.pct - a.pct), [db.purchases, names, q]);
  return (
    <div className="card table-wrap" ref={ref}>
      <div className="row between gap"><p className="muted small">Medicines you have bought from more than one supplier, with the price each charged last time. Reorder buys from the cheapest by default.</p>
        <PdfButton target={ref} title="Supplier prices" subtitle={`${rows.length} medicines with more than one supplier`} /></div>
      <table>
        <thead><tr><th>Medicine</th><th>Cheapest</th><th>Others (last price)</th><th className="num">Price gap</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.pid}>
              <td><strong>{r.name}</strong></td>
              <td><span className="badge ok">{r.list[0].supplierName}</span> {fmt(r.list[0].cost)}<br /><small className="muted">{r.list[0].date}</small></td>
              <td>{r.list.slice(1).map((o) => <div key={o.supplierId} className="small">{o.supplierName}: <strong>{fmt(o.cost)}</strong> <span className="muted">({o.date})</span></div>)}</td>
              <td className="num"><strong className={r.pct >= 10 ? 'text-warn' : ''}>{r.pct}%</strong><br /><small className="muted">{fmt(r.gap)} per unit</small></td>
            </tr>
          ))}
          {!rows.length && <Empty colSpan={4}>Buy the same medicine from two suppliers and their prices are compared here.</Empty>}
        </tbody>
      </table>
    </div>
  );
}

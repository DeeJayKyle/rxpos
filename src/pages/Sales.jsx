import { useState, useEffect, useMemo, useRef } from 'react';
import { closedSet, inClosedDay } from '../dayclose.js';
import { useLocation } from 'react-router-dom';
import { Download, Printer, Undo2, Eye, Pencil, Trash2, Plus, History, FileText, PauseCircle, SlidersHorizontal, Ellipsis } from 'lucide-react';
import { useStore, dayOf, downloadFile, toCSV, put, move, now, audit, allocate, MAIN_BRANCH, DEFAULT_PAYMENT_METHODS } from '../store.jsx';
import { useOlderHistory, olderNote } from '../history.js';
import { ViewSwitch, BoardView, GalleryView, savedView, saveView } from '../components/DataViews.jsx';
import { saleStatus } from '../components/BentoDashboard.jsx';
import { Modal, SearchBox, Empty, PdfButton, ReceiptPdfButton, PayChip, useSort, SortTh, SubViews, WhoChanged, ExportMenu, moneyCell } from '../ui.jsx';
import { useLoadMore, useColumns, BulkBar, useSwipe, useWide, DetailsPane } from '../tablekit.jsx';
import { DateRange } from '../forms.jsx';
import { toast } from '../feedback.jsx';
import { Barcode } from '../barcode.jsx';
import { stockParts, kitContents } from '../kits.js';
import { unitScaleAt, unitChangedSince } from '../packs.js';
import RefundSheet, { refundMoney, REFUND_APPROVE_ABOVE, isApprover } from '../components/RefundSheet.jsx';
import { hasPin, verifyPin, verifyOffline } from '../offline.js';
import { cloudLogin, cloudLogout } from '../cloud.js';
import { cartSubtotal, lineTotal, taxOf, round } from '../money.js';
// step 22: what the client still owes on a sale (an insurer's share is billed to the insurer); shown on the receipt
// even after a refund, as before
const billed = (s) => (s.insurance ? Math.max(0, Number(s.insurance.share) || 0) : 0);
const unpaid = (s) => s.total - (s.paid ?? s.total) - billed(s);
import DraftsList, { useDraftCount } from './Drafts.jsx';
import { useListControls, useContextMenu } from '../listcontrols.jsx';
import { Copy } from 'lucide-react';
import { pharmacyLogo } from '../logo.jsx';
import { showDateTime, dateLocale } from '../showdate.js';
import { printReceipt, isDirect } from '../printer.js';

/** Thermal-printer friendly receipt (58 mm or 80 mm, set in Settings). */
export function Receipt({ sale }) {
  const { db, fmt } = useStore();
  const s = db.settings;
  const isProforma = sale.proforma || String(sale.number).startsWith('PF');
  const branch = db.branches.find((b) => b.id === (sale.branchId || MAIN_BRANCH));
  return (
    <div className={'receipt print-area paper-' + (s.paperWidth || 80)}>
      <div className="center">
        {pharmacyLogo(db) && <img className="receipt-logo" src={pharmacyLogo(db)} alt="" />}
        <strong className="receipt-title">{s.name}</strong>
        {db.branches.length > 1 && branch && <div>{branch.name}</div>}
        {((db.branches.length > 1 && branch?.address) ? branch.address : s.address) && <div>{(db.branches.length > 1 && branch?.address) ? branch.address : s.address}</div>}
        {s.phone && <div>Tel: {s.phone}</div>}
        {s.tin && <div>TIN: {s.tin}</div>}
        {isProforma && <div className="receipt-tag">PROFORMA INVOICE</div>}
        {sale.training && <div className="receipt-tag">TRAINING – NOT A SALE</div>}
        <div>{sale.number} · {showDateTime(sale.date)}</div>
        <div>{isProforma ? 'Prepared by' : 'Served by'}: {sale.cashier || sale.createdBy}</div>
        {sale.customerName && sale.customerName !== 'Walk-in Customer' && <div>Customer: {sale.customerName}</div>}
      </div>
      <div className="receipt-rule" />
      <table>
        <tbody>
          {sale.items.map((i) => (
            <tr key={i.id}>
              <td>{i.name}<br /><small>{i.pack ? `${i.pack.count} × ${i.pack.name} (${i.pack.size}) @ ${fmt(i.pack.price)}` : `${i.qty} × ${fmt(i.price)}`}{i.alloc?.length === 1 && i.alloc[0].batch ? ` · B/N ${i.alloc[0].batch}` : ''}{i.alloc?.[0]?.expiry ? ` · Exp ${i.alloc[0].expiry}` : ''}</small>{i.kit && <><br /><small className="receipt-kit">KIT · {kitContents(i)}</small></>}{i.directions && <><br /><small className="receipt-dir">{[i.directions.dose, i.directions.freq, i.directions.days && `for ${i.directions.days} days`].filter(Boolean).join(' ')}{i.directions.notes?.length ? ` · ${i.directions.notes.join(', ')}` : ''}</small></>}</td>
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
      {!isProforma && sale.payment === 'Cash' && sale.tendered > (sale.paid ?? sale.total) && <div className="row between"><span>Change</span><span>{fmt(sale.tendered - (sale.paid ?? sale.total))}</span></div>}
      {!isProforma && sale.insurance && <div className="row between"><span>{sale.insurance.insurer} ({sale.insurance.scheme})</span><span>{fmt(billed(sale))}</span></div>}
      {!isProforma && sale.insurance && <div className="small">Member no. {sale.insurance.memberNo}</div>}
      {!isProforma && unpaid(sale) > 0.005 && <div className="row between"><span>Balance on credit</span><span>{fmt(unpaid(sale))}</span></div>}
      {sale.momo?.txid && <div className="row between"><span>{sale.momo.provider === 'airtel' ? 'Airtel' : 'MoMo'} Ref</span><span>{sale.momo.txid}</span></div>}
      {sale.momo && <div className="small muted">{sale.momo.confirmed ? 'Payment confirmed by the mobile network' : sale.momo.manual ? 'Payment recorded by staff (transaction ID from the customer; not confirmed by the network)' : ''}</div>}
      {sale.status === 'refunded' && <div className="center receipt-tag">REFUNDED</div>}
      {sale.status === 'refunded' && (sale.refundedAt || sale.refundReason) && <div className="center small muted no-print">{[sale.refundedAt && `On ${new Date(sale.refundedAt).toLocaleString(dateLocale(), { dateStyle: 'medium', timeStyle: 'short' })}`, sale.refundedBy && `by ${sale.refundedBy}`, sale.refundReason].filter(Boolean).join(' · ')}</div>}
      <div className="receipt-barcode"><Barcode value={sale.number} height={34} module={1.6} /></div>
      <p className="center">{isProforma ? 'Prices valid for 7 days.' : s.receiptFooter}</p>
    </div>
  );
}

/** Print a receipt the way This device → Receipt printer says: straight to the thermal printer (and the cash drawer on
 * a cash sale), or the print dialog. A failed direct print opens the dialog instead, with a note why. */
export function useReceiptPrinter() {
  const { db, fmt } = useStore();
  return (sale, { cash = false, dialog } = {}) => {
    const s = db.settings;
    const branch = db.branches.find((b) => b.id === (sale.branchId || MAIN_BRANCH));
    const multi = db.branches.length > 1;
    const sl = sale.proforma || String(sale.number).startsWith('PF') ? { ...sale, proforma: true } : sale;
    return printReceipt(sl, {
      settings: s, fmt, when: showDateTime(sale.date), cash,
      branchName: multi && branch ? branch.name : '',
      address: (multi && branch?.address ? branch.address : s.address) || '',
    }, { dialog, onFallback: (e) => toast(`Receipt printer: ${e.message}. The print dialog opened instead.`, 'warn') });
  };
}

/** Full-page (A4) invoice for a sale: for insurers, companies and anyone who needs more than a till slip */
export function SaleInvoice({ sale }) {
  const { db, fmt } = useStore();
  const s = db.settings;
  const branch = db.branches.find((b) => b.id === (sale.branchId || MAIN_BRANCH));
  const cust = db.customers.find((c) => c.id === sale.customerId);
  const due = unpaid(sale); // step 22: an insurer's share is billed to the insurer, not due from the client
  return (
    <div className="invoice-doc print-area paper-210">
      <div className="invoice-head">
        <div>
          {pharmacyLogo(db) && <img className="receipt-logo" src={pharmacyLogo(db)} alt="" />}
          <strong className="invoice-name">{s.name}</strong>
          {db.branches.length > 1 && branch && <div>{branch.name}</div>}
          {((db.branches.length > 1 && branch?.address) ? branch.address : s.address) && <div>{(db.branches.length > 1 && branch?.address) ? branch.address : s.address}</div>}
          {s.phone && <div>Tel: {s.phone}</div>}
          {s.tin && <div>TIN: {s.tin}</div>}
        </div>
        <div className="invoice-meta">
          <h2>INVOICE</h2>
          <div>No. <b>{sale.number}</b></div>
          <div>Date: {new Date(sale.date).toLocaleString(dateLocale(), { dateStyle: 'long', timeStyle: 'short' })}</div>
          <div>Served by: {sale.cashier}</div>
          {sale.status === 'refunded' && <div className="receipt-tag">REFUNDED</div>}
        </div>
      </div>
      <div className="invoice-to"><small>Bill to</small><b>{sale.customerName || 'Walk-in customer'}</b>{cust?.phone && <span>Tel: {cust.phone}</span>}{cust?.address && <span>{cust.address}</span>}</div>
      <table className="invoice-lines">
        <thead><tr><th>#</th><th>Description</th><th>Batch / expiry</th><th className="num">Qty</th><th className="num">Unit price</th><th className="num">Amount</th></tr></thead>
        <tbody>{sale.items.map((i, n) => (
          <tr key={n}><td>{n + 1}</td><td>{i.name}{i.kit && <><br /><small>{kitContents(i)}</small></>}</td><td>{(i.kit ? i.kit.components.flatMap((c) => c.alloc || []) : i.alloc || []).map((a) => [a.batch, a.expiry].filter(Boolean).join(' · ')).filter(Boolean).join(', ') || '—'}</td><td className="num">{i.qty}</td><td className="num">{fmt(i.price)}</td><td className="num">{fmt(i.qty * i.price)}</td></tr>
        ))}</tbody>
      </table>
      <div className="invoice-totals">
        <div><span>Subtotal</span><span>{fmt(sale.subtotal)}</span></div>
        {sale.discount > 0 && <div><span>Discount</span><span>-{fmt(sale.discount)}</span></div>}
        {sale.tax > 0 && <div><span>Tax</span><span>{fmt(sale.tax)}</span></div>}
        <div className="grand"><span>Total</span><span>{fmt(sale.total)}</span></div>
        <div><span>Paid ({sale.payment}{sale.momo?.txid ? ` · ref ${sale.momo.txid}` : ''})</span><span>{fmt(sale.paid ?? sale.total)}</span></div>
        {sale.insurance && <div><span>Billed to {sale.insurance.insurer} ({sale.insurance.scheme} · member {sale.insurance.memberNo})</span><span>{fmt(billed(sale))}</span></div>}
        {due > 0 && <div className="grand"><span>Balance due</span><span>{fmt(due)}</span></div>}
      </div>
      {sale.momo && <p className="small">{sale.momo.confirmed ? 'Payment confirmed by the mobile network.' : 'Payment recorded by staff (not confirmed by the mobile network).'}</p>}
      <div className="invoice-sign"><span>Received by ____________________</span><span>Signature &amp; stamp ____________________</span></div>
      {s.receiptFooter && <p className="center small">{s.receiptFooter}</p>}
    </div>
  );
}

/** Print a receipt or an invoice straight from a list row: render it off screen, print, then remove it */
export function usePrintSale() {
  const [job, setJob] = useState(null);
  useEffect(() => {
    if (!job) return;
    // only this document prints (not a receipt open in a dialog behind it)
    document.body.classList.add('printing-job');
    const t = setTimeout(() => { window.print(); setJob(null); }, 60);
    return () => { clearTimeout(t); document.body.classList.remove('printing-job'); };
  }, [job]);
  const node = job ? <div className="print-stage">{job.kind === 'invoice' ? <SaleInvoice sale={job.sale} /> : <Receipt sale={job.sale} />}</div> : null;
  const direct = useReceiptPrinter();
  return [node, (sale, kind) => (kind !== 'invoice' && isDirect() ? direct(sale, { dialog: () => setJob({ sale, kind }) }) : setJob({ sale, kind }))];
}

const STATUSES = [['', 'All statuses'], ['completed', 'Completed'], ['refunded', 'Refunded'], ['edited', 'Edited']];

export default function Sales() {
  const { db: localDb, syncCfg, update, fmt, user, branchId, can } = useStore();
  // step 18: a closed day's sales can't be edited (a refund still can, and the owner is told)
  const location = useLocation();
  const [q, setQ] = useState(location.state?.q || '');
  const [from, setFrom] = useState(location.state?.from || '');
  const [to, setTo] = useState(location.state?.to || '');
  // stage 4 of the faster sync: a 'From' date before this device's window brings those sales from the cloud
  // (src/history.js); with no 'From' date the list is what this device holds
  const older = useOlderHistory(localDb, syncCfg, from || localDb?._window?.W || '', ['sales']);
  const db = older.db;
  const closed = useMemo(() => closedSet(db.dayCloses), [db.dayCloses]);
  const locked = (s) => inClosedDay(s, closed, dayOf);
  const [editing, setEditing] = useState(null);
  const [branch, setBranch] = useState(user.role === 'cashier' ? branchId : 'all');
  const [view, setView] = useState(null);
  const [tab, setTab] = useState(location.state?.tab || 'sales');
  const draftCount = useDraftCount('sale');
  const [f, setF] = useState({ cashier: '', payment: '', customer: '', status: '' });
  const setFilter = (k) => (e) => setF({ ...f, [k]: e.target.value });
  // 1.16.0 (the owner's clean-up): cashier, payment, customer and status behind one Filters button
  const [showFilters, setShowFilters] = useState(false);
  const cur = db.settings?.currency || '';
  const activeFilters = Object.values(f).filter(Boolean).length;
  const onlyEdited = f.status === 'edited';
  const [printNode, printSale] = usePrintSale();
  const printReceiptNow = useReceiptPrinter();
  const phoneOf = (s) => db.customers.find((c) => c.id === s.customerId)?.phone || '';

  const ql = q.toLowerCase();
  const inScope = db.sales.filter((s) => (branch === 'all' || (s.branchId || MAIN_BRANCH) === branch) && (!from || dayOf(s.date) >= from) && (!to || dayOf(s.date) <= to));
  const opts = (k) => [...new Set(inScope.map((s) => s[k]).filter(Boolean))].sort();
  const rows = inScope.filter((s) =>
    (!q || [s.number, s.customerName, s.cashier, s.payment, s.type, s.momo?.txid, ...s.items.map((i) => i.name)].join(' ').toLowerCase().includes(ql)) &&
    (!f.cashier || s.cashier === f.cashier) && (!f.payment || s.payment === f.payment) && (!f.customer || s.customerName === f.customer) &&
    (!f.status || (f.status === 'edited' ? s.edits?.length > 0 : f.status === 'refunded' ? s.status === 'refunded' : s.status !== 'refunded')));
  const valid = rows.filter((s) => s.status !== 'refunded');
  const sorted = useSort(rows, { number: (s) => s.number, date: (s) => s.date, customer: (s) => s.customerName || '', cashier: (s) => s.cashier || '', payment: (s) => s.payment || '', total: (s) => s.total }, 'date');
  // UI batch 3: 100 rows then more as the list scrolls (C7), columns chosen and ordered on this device (C2)
  const page = useLoadMore(sorted.rows, { resetKey: [q, from, to, branch, f.cashier, f.payment, f.customer, f.status, sorted.by, sorted.dir].join('|') });
  const colsK = useColumns('sales', [{ id: 'number', label: 'Receipt', fixed: true }, { id: 'date', label: 'Date' }, ...(db.branches.length > 1 ? [{ id: 'branch', label: 'Branch' }] : []), { id: 'customer', label: 'Customer' }, { id: 'phone', label: 'Phone' }, { id: 'payment', label: 'Payment' }, { id: 'status', label: 'Status' }, { id: 'total', label: 'Total' }, { id: 'cashier', label: 'Cashier' }]);
  const wide = useWide(); // C8: the receipt beside the list on wide screens
  const swipe = useSwipe(); // C10: phones: swipe a sale for Print / Refund
  // the owner's request: keys, double-click and right-click on the sales too (src/listcontrols.jsx)
  const searchRef = useRef(null);
  const canEditSale = (x) => x.status !== 'refunded' && can('sales.edit') && !locked(x);
  const canRefund = (x) => x.status !== 'refunded' && !x.imported && user.role !== 'cashier' && can('sales.refund');
  const lc = useListControls({ rows: page.rows, onOpen: (x) => setView(x), onEdit: (x) => canEditSale(x) && setEditing(x), searchRef, onClearSearch: () => setQ(''), enabled: tab === 'sales' });
  const menu = useContextMenu();
  const [dv, setDv] = useState(() => savedView('sales'));
  const pickView = (v) => { setDv(v); saveView('sales', v); };
  const saleCard = (s) => { const [st, cls] = saleStatus(s); return { title: s.number + ' · ' + (s.customerName || 'Walk-in'), sub: `${new Date(s.date).toLocaleString(dateLocale(), { dateStyle: 'medium', timeStyle: 'short' })} · ${s.cashier || ''}`, value: fmt(s.total),
    chips: [cls !== 'paid' && [st, cls === 'owing' ? 'warn' : 'danger'], s.payment && [s.payment], s.edits?.length && ['Edited', 'warn'], [`${s.items.length} item${s.items.length === 1 ? '' : 's'}`]].filter(Boolean) }; };
  const saleMenu = (e, x) => menu.open(e, [
    { label: 'View', Icon: Eye, keyId: 'list:open', run: () => setView(x) },
    { label: 'Print the receipt', Icon: Printer, run: () => printSale(x, 'receipt') },
    { label: 'Print an invoice (A4)', Icon: FileText, run: () => printSale(x, 'invoice') },
    canEditSale(x) && { label: 'Edit', Icon: Pencil, keyId: 'list:edit', run: () => setEditing(x) },
    { label: 'Copy the receipt number', Icon: Copy, run: () => navigator.clipboard?.writeText(x.number).then(() => toast('Copied'), () => toast('Could not copy', 'warn')) },
    canRefund(x) && '-',
    canRefund(x) && { label: 'Refund…', Icon: Undo2, danger: true, run: () => refund(x) },
  ]);

  // the refund sheet (src/components/RefundSheet.jsx) shows what goes back and asks why; doRefund does it
  const [refunding, setRefunding] = useState(null);
  const refund = (sale) => setRefunding(sale);
  // safer refunds (2026-11-18): over the limit, someone who isn't a manager needs a manager's PIN or password (checked on
  // this device, as at sign-in); the approver is kept on the sale and in the audit log
  const approvalFor = (sale) => {
    const limit = Number(localDb.settings.refundApproveAbove ?? REFUND_APPROVE_ABOVE) || 0;
    if (!limit || isApprover(user) || refundMoney(sale).back <= limit) return null;
    const approvers = localDb.users.filter((u) => isApprover(u) && u.id !== user.id && u.active !== false).map((u) => ({ id: u.id, name: u.name }));
    return { limit, approvers, verify: async (id, secret) => {
      // this device first (a quick PIN, or a password remembered by the Windows / Android app), then the cloud: a
      // sign-in as the manager that is closed again at once
      if (hasPin(syncCfg.tenant, id) && /^\d{4,8}$/.test(secret) && (await verifyPin(syncCfg.tenant, id, secret)).ok) return true;
      if (await verifyOffline(syncCfg.tenant, id, secret).catch(() => false)) return true;
      const email = localDb.users.find((u) => u.id === id)?.email;
      if (!email || !syncCfg.url || !navigator.onLine) return false;
      try { const r = await cloudLogin(syncCfg.url, email, secret, syncCfg.tenant); cloudLogout({ url: syncCfg.url, key: r.token }).catch(() => {}); return !!r.token; } catch { return false; }
    } };
  };
  const doRefund = async (sale, why, approvedBy = null) => {
    // the sale as it is now (another device, or a second click, may have refunded or edited it since this list was
    // drawn): refunded once only, and what goes back to stock is what the sale holds now
    let already = false;
    try {
      await update((d) => {
        const cur = d.sales.find((x) => x.id === sale.id);
        if (!cur || cur.status === 'refunded') { already = true; return; }
        put(d, 'sales', { ...cur, status: 'refunded', refundedBy: user.name, refundedAt: now(), ...(why ? { refundReason: String(why).slice(0, 240) } : {}), ...(approvedBy ? { refundApprovedBy: approvedBy } : {}) });
        for (const i of cur.items) {
          // a kit line returns each of its medicines to the batches they came from (src/kits.js)
          // a medicine whose unit of issue changed since the sale goes back in its new unit (src/packs.js)
          for (const a of stockParts(i)) move(d, { productId: a.productId, qty: a.qty * unitScaleAt(d.products.find((x) => x.id === a.productId), cur.date), type: 'Refund', ref: cur.number, user: user.name, batchId: a.batchId, branchId: cur.branchId || MAIN_BRANCH });
        }
        audit(d, user, 'Refund', `${cur.number} · ${fmt(cur.total)}${why ? ' · ' + why : ''}${approvedBy ? ' · approved by ' + approvedBy : ''}`, cur.branchId || MAIN_BRANCH);
      });
    } catch (e) { return toast(`${sale.number} was NOT refunded: ${e.message}`, 'error'); }
    setView(null); setRefunding(null);
    if (already) return toast(`${sale.number} was already refunded; nothing was changed`, 'warn');
    toast(`${sale.number} refunded and items returned to stock`);
  };

  const branchName = (id) => db.branches.find((b) => b.id === (id || MAIN_BRANCH))?.name || '—';
  const exportRows = rows.map((s) => ({ receipt: s.number, date: s.date, branch: branchName(s.branchId), type: s.type || 'retail', customer: s.customerName, cashier: s.cashier, payment: s.payment, momoRef: s.momo?.txid || '', items: s.items.length, discount: s.discount, tax: s.tax, total: s.total, paid: s.paid ?? s.total, status: s.status }));

  // C8: the receipt and its actions, beside the list on wide screens or as a pop-up
  const saleDetails = () => (
    <DetailsPane title={`Receipt ${view.number}`} onClose={() => setView(null)} wide={wide && dv === 'table' && tab === 'sales'}>
          <WhoChanged keyText={view.number} by={view.editedBy || view.refundedBy} at={view.edits?.at(-1)?.at || view.refundedAt} />
          <Receipt sale={view} />
          <EditHistory sale={view} />
          <div className="form-actions no-print">
            {view.status !== 'refunded' && can('sales.edit') && !locked(view) && <button className="btn ghost" onClick={() => { setEditing(view); setView(null); }}><Pencil size={16} />Edit sale</button>}
            {view.imported && <small className="muted">Copied from {view.imported}</small>}
            {view.status !== 'refunded' && !view.imported && user.role !== 'cashier' && can('sales.refund') && <button className="btn danger" onClick={() => refund(view)}><Undo2 size={16} />Refund</button>}
            <ReceiptPdfButton sale={view} />
            <button className="btn ghost act-invoice" onClick={() => { printSale(view, 'invoice'); }}><FileText size={16} />Invoice</button>
            <button className="btn primary" onClick={() => printReceiptNow(view)}><Printer size={16} />Print</button>
          </div>
    </DetailsPane>
  );

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Sales History</h1><div className="sub">{valid.length} sales · {fmt(valid.reduce((a, s) => a + s.total, 0))}{older.W && !from ? ` · this device keeps sales from ${older.W}; choose an earlier "From" date for older ones` : olderNote(older) ? ' · ' + olderNote(older) : ''}</div></div>
        <div className="row gap">
          {db.branches.length > 1 && user.role !== 'cashier' && (
            <select value={branch} onChange={(e) => setBranch(e.target.value)} aria-label="Branch">
              <option value="all">All branches</option>
              {db.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          )}
          <ViewSwitch value={dv} onChange={pickView} />
          {dv === 'table' && colsK.button}
          <SearchBox value={q} onChange={setQ} placeholder="Receipt, customer, medicine…" inputRef={searchRef} />
          <DateRange from={from} to={to} onChange={(r) => { setFrom(r.from); setTo(r.to); }} />
          {tab === 'sales' && <button type="button" className={'btn ghost filters-btn' + (activeFilters ? ' on' : '')} aria-expanded={showFilters} onClick={() => setShowFilters((x) => !x)}><SlidersHorizontal size={16} />Filters{activeFilters > 0 && <span className="badge-count">{activeFilters}</span>}</button>}
          <ExportMenu>
          <button className="btn ghost" onClick={() => downloadFile('sales.csv', toCSV(exportRows), 'text/csv')}><Download size={16} />CSV</button>
          <PdfButton title="Sales history" subtitle={[from || to ? `${from || 'start'} to ${to || 'today'}` : 'All dates', q && `search "${q}"`, onlyEdited && 'edited sales only', `${valid.length} sales · ${fmt(valid.reduce((a, s) => a + s.total, 0))}`].filter(Boolean).join(' · ')}
            data={() => [{ head: ['Receipt', 'Date', 'Customer', 'Cashier', 'Payment', 'Status', 'Total'], numeric: [6],
              body: rows.map((s) => [s.number, new Date(s.date).toLocaleString(dateLocale(), { dateStyle: 'medium', timeStyle: 'short' }), s.customerName, s.cashier, s.payment, s.status + (s.edits?.length ? ' (edited)' : ''), fmt(s.total)]),
              foot: ['', '', '', '', '', 'Total (excl. refunds)', fmt(valid.reduce((a, s) => a + s.total, 0))] }]} />
          </ExportMenu>
        </div>
      </div>
      <SubViews value={tab} onChange={setTab} main="sales" mainLabel="All sales" views={[['drafts', 'Held sales', draftCount, PauseCircle]]} />
      {tab === 'drafts' && <DraftsList kind="sale" />}
      {tab === 'sales' && <>
      <div className="report-filters" hidden={!showFilters}>
        <label>Cashier<select value={f.cashier} onChange={setFilter('cashier')}><option value="">All</option>{opts('cashier').map((x) => <option key={x}>{x}</option>)}</select></label>
        <label>Payment<select value={f.payment} onChange={setFilter('payment')}><option value="">All</option>{opts('payment').map((x) => <option key={x}>{x}</option>)}</select></label>
        <label>Customer<select value={f.customer} onChange={setFilter('customer')}><option value="">All</option>{opts('customerName').map((x) => <option key={x}>{x}</option>)}</select></label>
        <label>Status<select value={f.status} onChange={setFilter('status')}>{STATUSES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
      </div>
      {dv === 'board' && <BoardView rows={sorted.rows} board={{ groups: [['paid', 'Paid', 'ok'], ['owing', 'Owing', 'warn'], ['refunded', 'Refunded', 'danger']], of: (x) => saleStatus(x)[1] }} card={saleCard} onOpen={setView} onMenu={saleMenu} />}
      {dv === 'gallery' && <GalleryView rows={sorted.rows} card={saleCard} onOpen={setView} onMenu={saleMenu} />}
      {dv !== 'table' && menu.node}
      {dv === 'table' && <div className={'list-and-details' + (view && wide ? ' with-details' : '')}><div className="card table-wrap">
        <table className="phone-rows">
          <thead><tr><th className="tick"><input {...lc.allProps} /></th>{colsK.shown.map((id) => ({
            number: <SortTh key={id} s={sorted} k="number">Receipt</SortTh>, date: <SortTh key={id} s={sorted} k="date">Date</SortTh>, branch: <th key={id}>Branch</th>,
            customer: <SortTh key={id} s={sorted} k="customer">Customer</SortTh>, phone: <th key={id}>Phone</th>, payment: <SortTh key={id} s={sorted} k="payment">Payment</SortTh>,
            status: <th key={id}>Status</th>, total: <SortTh key={id} s={sorted} k="total" className="num">Total{cur && <small className="th-cur"> ({cur})</small>}</SortTh>, cashier: <SortTh key={id} s={sorted} k="cashier">Cashier</SortTh> }[id]))}<th /></tr></thead>
          <tbody>
            {page.rows.map((s, i) => { const rp = lc.rowProps(s, i, saleMenu); const cell = {
              number: <td key="number" className="row-title"><strong>{s.number}</strong> <small className="muted cap">{s.type || 'retail'}</small></td>,
              date: <td key="date" data-label="Date" className="nowrap">{new Date(s.date).toLocaleDateString(dateLocale(), { dateStyle: 'medium' })}<br /><small className="muted">{new Date(s.date).toLocaleTimeString([], { timeStyle: 'short' })}</small></td>,
              branch: <td key="branch" data-label="Branch">{branchName(s.branchId)}</td>,
              customer: <td key="customer" data-label="Customer">{s.customerName}</td>,
              phone: <td key="phone" data-label="Phone" className="muted">{phoneOf(s) || '—'}</td>,
              payment: <td key="payment" data-label="Payment"><PayChip name={s.payment} />{s.momo?.txid ? <><br /><small className="muted">{s.momo.txid}</small></> : null}</td>,
              status: <td key="status" data-label="Status">{s.status === 'refunded' ? <span className="badge danger">refunded</span> : <span className="muted small status-plain">{s.status}</span>}{s.edits?.length > 0 && <><br /><button type="button" className="badge warn edited-badge" onClick={() => setView(s)} title="See what was changed and by whom"><History size={11} /> Edited{s.edits.length > 1 ? ` ×${s.edits.length}` : ''}</button></>}</td>,
              total: <td key="total" data-label="Total" className="num"><strong>{moneyCell(fmt(s.total), cur)}</strong></td>,
              cashier: <td key="cashier" data-label="Cashier">{s.cashier}</td>,
            }; return (
              <tr key={s.id} {...rp} {...swipe.props(s.id)} className={[(s.status === 'refunded' ? 'dim' : ''), (s.edits?.length ? 'edited-row' : ''), (view?.id === s.id && wide ? 'row-open' : ''), rp.className].filter(Boolean).join(' ')} title={s.edits?.length ? `Edited ${s.edits.length}× · last by ${s.editedBy || s.edits.at(-1).by}` : undefined}>
                <td className="tick"><input {...lc.tickProps(s, i)} /></td>
                {colsK.shown.map((id) => cell[id])}
                <td className="actions"><div className="row-acts">
                  <button className="btn sm ghost" onClick={() => setView(s)}><Eye size={14} />View</button>
                  <button className="btn sm ghost act-print" onClick={() => printSale(s, 'receipt')} title="Print the till receipt"><Printer size={14} />Receipt</button>
                  <button className="btn sm ghost act-invoice" onClick={() => printSale(s, 'invoice')} title="Print a full-page invoice"><FileText size={14} />Invoice</button>
                  {s.status !== 'refunded' && can('sales.edit') && !locked(s) && <button className="btn sm ghost act-edit" onClick={() => setEditing(s)}><Pencil size={14} />Edit</button>}
                  <button type="button" className="icon-btn sm row-more" title="More actions" aria-label="More actions" onClick={(e) => saleMenu(e, s)}><Ellipsis size={16} /></button>
                </div>
                {swipe.openId === s.id && <div className="swipe-acts">
                  <button type="button" className="btn sm" onClick={() => { swipe.close(); printSale(s, 'receipt'); }}><Printer size={14} />Print</button>
                  {canRefund(s) && <button type="button" className="btn sm danger" onClick={() => { swipe.close(); refund(s); }}><Undo2 size={14} />Refund</button>}
                </div>}</td>
              </tr>
            ); })}
            {!rows.length && (db.sales.length ? <Empty colSpan={colsK.shown.length + 2}>No sales match. Try another receipt number, customer, filter or date.</Empty> : <Empty colSpan={colsK.shown.length + 2} action={{ label: 'Open the POS', to: '/pos' }}>No sales yet. Every sale rung up at the POS appears here with its receipt, to reprint, refund or correct.</Empty>)}
          </tbody>
          {rows.length > 0 && <tfoot><tr className="total-row"><td colSpan={Math.max(1, colsK.shown.indexOf('total') + 1)}>Total (excl. refunds) · {valid.length.toLocaleString()} sales</td>{colsK.has('total') && <td className="num">{fmt(valid.reduce((a, s) => a + s.total, 0))}</td>}<td colSpan={Math.max(1, colsK.shown.length - colsK.shown.indexOf('total'))} /></tr></tfoot>}
        </table>
        {menu.node}
        {page.footer}
      </div>
      {view && wide && saleDetails()}
      </div>}
      <BulkBar count={lc.ticked.size} onClear={lc.clear} actions={[
        { label: 'Print receipts', Icon: Printer, run: () => { for (const x of lc.tickedRows) printSale(x, 'receipt'); } },
        { label: 'Export', Icon: Download, run: () => downloadFile('sales.csv', toCSV(exportRows.filter((r) => lc.tickedRows.some((x) => x.number === r.receipt))), 'text/csv') },
      ]} />
      </>}
      {printNode}
      {editing && <SaleEditor sale={editing} onClose={() => setEditing(null)} />}
      {refunding && <RefundSheet sale={refunding} fmt={fmt} batches={db.batches} closedDay={locked(refunding)} onCancel={() => setRefunding(null)} approval={approvalFor(refunding)} onConfirm={(why, by) => doRefund(refunding, why, by)} />}
      {view && !(wide && dv === 'table' && tab === 'sales') && saleDetails()}
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
  // the same money rules as the till (src/money.js): each line rounds to the currency's precision, tax rounds once
  const money = Number(db.settings.decimals ?? 0);
  const subtotal = cartSubtotal(f.items, money);
  const disc = Math.max(0, Math.min(round(Number(f.discount) || 0, money), subtotal));
  const tax = taxOf(subtotal - disc, rate * 100, { decimals: money });
  const total = round(subtotal - disc + tax, money);
  const ptype = methods.find((m) => m.name === f.payment)?.type || (f.payment === 'Credit' ? 'credit' : 'cash');
  const setItem = (k, patch) => setF((x) => ({ ...x, items: x.items.map((i, n) => (n === k ? { ...i, ...patch } : i)) }));
  const matches = q.trim() ? products.filter((p) => p.stock > 0 && `${p.name} ${p.generic} ${p.barcode}`.toLowerCase().includes(q.toLowerCase()) && !f.items.some((i) => i.id === p.id)).slice(0, 8) : [];
  const recordOnly = !!sale.imported; // copied from another system: correct the record, today's stock is not touched
  const save = async (e) => {
    e.preventDefault();
    if (!f.items.some((i) => Number(i.qty) > 0)) return toast('A sale needs at least one item. To cancel the whole sale, refund it.', 'warn');
    if (!f.reason.trim()) return toast('Say why the sale is being changed', 'warn');
    // a medicine counted in another unit since this sale (Change unit of issue): its old quantities can't be moved
    // line by line; refund the sale and sell it again instead
    const changed = recordOnly ? null : sale.items.find((i) => stockParts(i).some((a) => unitChangedSince(db.products.find((x) => x.id === a.productId), sale.date)));
    if (changed) return toast(`${changed.name} has been counted in another unit since this sale. Refund the sale and sell it again instead of editing it.`, 'warn');
    if (!recordOnly) for (const i of f.items) {
      const o = sale.items.find((x) => x.id === i.id);
      const extra = Number(i.qty) - (o?.qty || 0);
      const have = batchesOf(i.id, br).reduce((a, b) => a + Math.max(b.qty, 0), 0);
      if (extra > have) return toast(`Only ${have} more ${i.name} in stock`, 'error');
    }
    const customer = db.customers.find((c) => c.id === f.customerId);
    // the stock moves below are worked out from the sale as it was opened: if it was refunded or changed since (on
    // another device, say), nothing is saved and the editor asks for the sale to be opened again
    let stale = false;
    try { await update((d) => {
      const cur = d.sales.find((x) => x.id === sale.id);
      if (!cur || cur.status === 'refunded' || (cur.updatedAt || '') !== (sale.updatedAt || '')) { stale = true; return; }
      const old = new Map(sale.items.map((i) => [i.id, i]));
      const items = [];
      for (const it of f.items) {
        const o = old.get(it.id);
        const q0 = o?.qty || 0, q1 = it.kit && o ? q0 : Math.max(0, Math.round(Number(it.qty) || 0)); // a kit's count is not changed here
        let alloc = (o?.alloc || []).map((a) => ({ ...a }));
        if (recordOnly) { /* history only */ } else if (q1 > q0) {
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
      if (!recordOnly) for (const o of old.values()) { // removed lines: everything back to stock
        for (const a of stockParts(o)) move(d, { productId: a.productId, qty: a.qty, type: 'Sale edit', ref: sale.number, user: user.name, batchId: a.batchId, branchId: br });
      }
      const paid = ptype === 'credit' ? Math.min(Number(f.paid) || 0, total) : total;
      put(d, 'sales', { ...sale, items, subtotal, discount: disc, tax, total, payment: f.payment, paid, tendered: ptype === 'cash' ? Math.max(sale.tendered || 0, total) : paid,
        customerId: f.customerId, customerName: customer?.name || 'Walk-in Customer', editedBy: user.name, editedAt: now(),
        edits: [...(sale.edits || []), { at: now(), by: user.name, role: user.role, reason: f.reason.trim(), recordOnly, before: saleSnapshot(sale), after: saleSnapshot({ items, total, payment: f.payment, discount: disc, customerName: customer?.name || 'Walk-in Customer', paid }) }] });
      audit(d, user, 'Sale edited', `${sale.number}: ${fmt(sale.total)} → ${fmt(total)} (${f.reason.trim()})`, br);
    }); } catch (err) { return toast(`${sale.number} was NOT changed: ${err.message}`, 'error'); }
    if (stale) { onClose(); return toast(`${sale.number} was refunded or changed since it was opened; nothing was saved. Open it again to edit it.`, 'warn'); }
    toast(recordOnly ? `${sale.number} corrected (record only)` : `${sale.number} updated; stock adjusted`);
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
                <td>{i.name}{i.kit && <><br /><small className="muted">KIT · {kitContents(i)}</small></>}</td>
                <td><input type="number" min="0" value={i.qty} disabled={!!i.kit} title={i.kit ? 'A kit\'s count can\'t be changed here: remove the line (its medicines go back to stock) or refund the sale' : undefined} onChange={(e) => setItem(k, { qty: e.target.value })} /></td>
                <td><input type="number" min="0" step="any" value={i.price} onChange={(e) => setItem(k, { price: e.target.value })} /></td>
                <td className="num">{fmt(lineTotal(i, money))}</td>
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
        {recordOnly && <div className="notice small">This sale was copied from {sale.imported}. Changes correct the record only; stock is not moved.</div>}
        {sale.edits?.length > 0 && <details className="small"><summary className="muted">Earlier changes ({sale.edits.length})</summary><EditHistory sale={sale} bare /></details>}
        <div className="form-actions"><button type="button" className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary">Save changes</button></div>
      </form>
    </Modal>
  );
}

/** What a sale looked like, for the edit history */
export const saleSnapshot = (s) => ({
  total: Number(s.total) || 0, payment: s.payment || '', discount: Number(s.discount) || 0, customer: s.customerName || '',
  items: (s.items || []).map((i) => `${i.qty}× ${i.name} @ ${i.price}`).join(', '),
});

/** Who changed a sale, when, why, and what it was before and after */
export function EditHistory({ sale, bare }) {
  const { fmt } = useStore();
  const edits = sale.edits || [];
  if (!edits.length) return null;
  const rows = edits.map((x, n) => {
    const before = x.before || (x.oldTotal != null ? { total: x.oldTotal } : null);
    const after = x.after || edits[n + 1]?.before || (x.newTotal != null ? { total: x.newTotal } : n === edits.length - 1 ? saleSnapshot(sale) : null);
    return { ...x, before, after };
  }).reverse();
  const diff = (b, a, k) => b && a && b[k] !== undefined && a[k] !== undefined && String(b[k]) !== String(a[k]);
  const body = (
    <ol className="edit-history">
      {rows.map((x, n) => (
        <li key={n}>
          <div className="row between gap wrap"><strong>{x.by || 'Unknown'}{x.role ? <small className="muted cap"> · {x.role}</small> : null}</strong><small className="muted">{new Date(x.at).toLocaleString(dateLocale(), { dateStyle: 'medium', timeStyle: 'short' })}</small></div>
          {x.reason && <div className="small">Reason: {x.reason}</div>}
          {x.recordOnly && <div className="small muted">Record only (stock not moved)</div>}
          <table className="small edit-diff"><tbody>
            <tr><th>Total</th><td>{x.before ? fmt(x.before.total) : '—'}</td><td>→</td><td className={diff(x.before, x.after, 'total') ? 'changed' : ''}>{x.after ? fmt(x.after.total) : '—'}</td></tr>
            {(x.before?.items || x.after?.items) && <tr><th>Items</th><td>{x.before?.items || '—'}</td><td>→</td><td className={diff(x.before, x.after, 'items') ? 'changed' : ''}>{x.after?.items || '—'}</td></tr>}
            {diff(x.before, x.after, 'payment') && <tr><th>Payment</th><td>{x.before.payment}</td><td>→</td><td className="changed">{x.after.payment}</td></tr>}
            {diff(x.before, x.after, 'customer') && <tr><th>Customer</th><td>{x.before.customer}</td><td>→</td><td className="changed">{x.after.customer}</td></tr>}
            {diff(x.before, x.after, 'discount') && <tr><th>Discount</th><td>{fmt(x.before.discount)}</td><td>→</td><td className="changed">{fmt(x.after.discount)}</td></tr>}
          </tbody></table>
        </li>
      ))}
    </ol>
  );
  return bare ? body : <div className="card edit-card no-print"><h4><History size={15} /> Edit history ({edits.length})</h4>{body}</div>;
}

/** A plain-text receipt for sending to the customer on WhatsApp or SMS */
export function receiptText(sale, s, fmt) {
  const L = [];
  L.push(`*${s.name || 'Pharmacy'}*`);
  if (s.address) L.push(s.address);
  if (s.phone) L.push('Tel: ' + s.phone);
  L.push(`Receipt ${sale.number} · ${showDateTime(sale.date)}`);
  if (sale.customerName && sale.customerName !== 'Walk-in Customer') L.push('Customer: ' + sale.customerName);
  L.push('--------------------------------');
  for (const i of sale.items) { L.push(`${i.qty} × ${i.name} — ${fmt(i.qty * i.price)}`); if (i.kit) L.push('  ' + kitContents(i)); }
  L.push('--------------------------------');
  if (sale.discount > 0) L.push(`Subtotal: ${fmt(sale.subtotal)}`);
  if (sale.discount > 0) L.push(`Discount: -${fmt(sale.discount)}`);
  if (sale.tax > 0) L.push(`Tax: ${fmt(sale.tax)}`);
  L.push(`*TOTAL: ${fmt(sale.total)}*`);
  L.push(`Paid (${sale.payment}): ${fmt(sale.paid ?? sale.total)}`);
  if (sale.insurance) L.push(`${sale.insurance.insurer} (${sale.insurance.scheme}, member ${sale.insurance.memberNo}): ${fmt(billed(sale))}`);
  if (unpaid(sale) > 0.005) L.push(`Balance: ${fmt(unpaid(sale))}`);
  L.push('');
  L.push(s.receiptFooter || 'Thank you. Get well soon!');
  return L.join('\n');
}

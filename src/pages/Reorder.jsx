import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShoppingBag, PackageX, ClipboardList, MessageCircle, Printer, PackageCheck, Download, Wand2 } from 'lucide-react';
import { DataTable } from '../datatable.jsx';
import { useStore, daysSince, uid, now, put, del, audit, downloadFile, toCSV, normalizePhone, supplierPrices, MAIN_BRANCH } from '../store.jsx';
import { Tabs, Empty, Modal, Stat, StatusPill } from '../ui.jsx';
import { toast, ask } from '../feedback.jsx';
import { whatsappLink } from '../cloud.js';
import { computeReorderLevels, applyReorderLevels, reorderSettings } from '../reorder.js';
import { validQty, roundToPack, supplierRule, planOrders, nextStatus } from '../poPlan.js';
import { mainPack } from '../packs.js';
import { unitsUsed } from '../kits.js';
import { showDate, showDateTime } from '../showdate.js';

/** '3 boxes of 10' */
const packCount = (q, pk) => { const n = Math.ceil(q / pk.size), w = pk.name.toLowerCase(); return `${n} ${n === 1 ? w : /(s|x|ch|sh)$/.test(w) ? w + 'es' : w + 's'} of ${pk.size}`; };

/** Smart reorder suggestions, dead stock and purchase orders. */
export default function Reorder() {
  const { db, products, fmt, update, user, branchId, branch, can, numberFor } = useStore();
  const navigate = useNavigate();
  const s = db.settings;
  const [tab, setTab] = useState('reorder');
  const [window_, setWindow] = useState(30);
  const [lead, setLead] = useState(s.leadDays || 7);
  const [cover, setCover] = useState(s.coverDays || 30);
  const [deadDays, setDeadDays] = useState(s.deadDays || 90);
  const [picked, setPicked] = useState({});
  const [viewPo, setViewPo] = useState(null);
  const [levels, setLevels] = useState(null); // preview of automatic reorder levels
  const [from, setFrom] = useState('cheapest'); // buy each medicine from its cheapest or its last supplier
  const [chosenSup, setChosenSup] = useState({}); // productId → supplierId picked by hand
  const [qtyEdit, setQtyEdit] = useState({}); // productId → quantity typed by hand (text, checked before use)
  const [roundPacks, setRoundPacks] = useState(false); // round order quantities up to whole packs
  const [plan, setPlan] = useState(null); // the orders about to be created, shown before anything is saved

  // Sales velocity per product at this branch, and last sale date
  const velocity = useMemo(() => {
    const since = Date.now() - window_ * 864e5;
    const sold = new Map(), lastSale = new Map();
    for (const sale of db.sales) {
      if (sale.status === 'refunded' || (sale.branchId || MAIN_BRANCH) !== branchId) continue;
      const t = new Date(sale.date).getTime();
      for (const [id, qty] of sale.items.flatMap(unitsUsed)) { // a kit counts the medicines it used (src/kits.js)
        if (t >= since) sold.set(id, (sold.get(id) || 0) + qty);
        if (!lastSale.has(id) || lastSale.get(id) < sale.date) lastSale.set(id, sale.date);
      }
    }
    return { sold, lastSale };
  }, [db.sales, branchId, window_]);

  // Last supplier & cost for each product (from purchases)
  const lastBuy = useMemo(() => {
    const m = new Map();
    for (const p of [...db.purchases].sort((a, b) => String(a.date).localeCompare(String(b.date))))
      for (const i of p.items) m.set(i.productId, { supplierId: p.supplierId, supplierName: p.supplierName, cost: i.cost, date: p.date });
    return m;
  }, [db.purchases]);
  const prices = useMemo(() => supplierPrices(db.purchases), [db.purchases]);
  /** Where to buy a medicine: picked by hand, else its cheapest (or last) supplier */
  const buyFor = (pid) => {
    const list = prices.get(pid) || [];
    const hand = chosenSup[pid] && list.find((x) => x.supplierId === chosenSup[pid]);
    return hand || (from === 'cheapest' ? list[0] : null) || lastBuy.get(pid);
  };

  const suggestions = useMemo(() => products.map((p) => {
    const perDay = (velocity.sold.get(p.id) || 0) / window_;
    const daysLeft = perDay > 0 ? p.stock / perDay : Infinity;
    const target = Math.ceil(perDay * (Number(lead) + Number(cover)));
    const qty = Math.max(0, target - Math.max(p.stock, 0), p.stock <= (p.reorder || 0) && perDay === 0 && p.reorder ? p.reorder * 2 - p.stock : 0);
    return { p, perDay, daysLeft, qty, buy: buyFor(p.id), options: prices.get(p.id) || [] };
  }).filter((r) => r.qty > 0 && (r.p.stock > 0 || r.perDay > 0) && (r.daysLeft <= Number(lead) + Number(cover) || r.p.stock <= (r.p.reorder || 0)))
    .sort((a, b) => a.daysLeft - b.daysLeft), [products, velocity, window_, lead, cover, lastBuy, prices, from, chosenSup]); // eslint-disable-line react-hooks/exhaustive-deps

  const dead = useMemo(() => products.filter((p) => p.stock > 0).map((p) => {
    const last = velocity.lastSale.get(p.id);
    return { p, last, idle: last ? daysSince(last) : Infinity, value: p.stock * (p.cost || 0) };
  }).filter((r) => r.idle >= deadDays).sort((a, b) => b.value - a.value), [products, velocity, deadDays]);

  /** The quantity to order: the suggestion, or what was typed (null when what was typed is not a whole number ≥ 1) */
  const qtyOf = (r) => {
    const q = qtyEdit[r.p.id] !== undefined ? validQty(qtyEdit[r.p.id]) : r.qty;
    return q == null ? null : roundPacks ? roundToPack(q, mainPack(r.p)?.size) : q;
  };
  const chosen = suggestions.filter((r) => picked[r.p.id] ?? true);
  const badQty = chosen.filter((r) => qtyOf(r) == null);
  const handPicked = chosen.filter((r) => chosenSup[r.p.id]).length;

  // Show the orders first, grouped by the supplier actually chosen for each medicine; nothing is saved until Create
  const reviewPOs = () => {
    if (!chosen.length) return;
    if (badQty.length) { toast(`Fix the order quantity for ${badQty[0].p.name}${badQty.length > 1 ? ` and ${badQty.length - 1} more` : ''}`, 'error'); return; }
    setPlan(planOrders(chosen.map((r) => ({ ...r, qty: qtyOf(r) })), db.suppliers));
  };
  const createPOs = () => {
    if (!plan?.length) return;
    const lines = plan.reduce((a, o) => a + o.lines.length, 0);
    update((d) => {
      for (const o of plan) {
        put(d, 'purchaseOrders', {
          id: uid(), number: numberFor(d, 'PO'), date: now(), status: 'Draft', branchId,
          supplierId: o.supplierId, supplierName: db.suppliers.find((x) => x.id === o.supplierId)?.name || 'Any supplier', createdBy: user.name,
          items: o.lines.map((l) => ({ productId: l.productId, name: l.name, qty: l.qty, cost: l.cost })),
        });
      }
      audit(d, user, 'Purchase orders created', `${plan.length} order(s), ${lines} lines`, branchId);
    });
    setPlan(null);
    toast(`${plan.length} draft purchase order${plan.length === 1 ? '' : 's'} created. Nothing was sent to suppliers.`);
    setTab('orders');
  };

  const poText = (po) => `Purchase order ${po.number} from ${s.name}${branch && db.branches.length > 1 ? ' – ' + branch.name : ''}\n` +
    po.items.map((i) => `• ${i.name} × ${i.qty}`).join('\n') + `\nPlease confirm availability and prices. Thank you.`;
  const orders = db.purchaseOrders.filter((po) => (po.branchId || MAIN_BRANCH) === branchId);
  const deadValue = dead.reduce((a, r) => a + r.value, 0);

  return (
    <div className="page">
      <div className="page-head"><div><h1>Reorder & dead stock</h1><div className="sub">{branch?.name} · based on how fast each item really sells</div></div></div>
      <div className="stats">
        <Stat label="Need reordering" value={suggestions.length} icon={ShoppingBag} tone="amber" sub={`cover ${Number(lead) + Number(cover)} days`} />
        <Stat label="Est. order value" value={fmt(chosen.reduce((a, r) => a + (qtyOf(r) || 0) * (r.buy?.cost || r.p.cost || 0), 0))} sub={`${chosen.length} picked · estimate`} />
        <Stat label="Dead stock" value={dead.length} icon={PackageX} tone="red" sub={`${fmt(deadValue)} tied up`} />
        <Stat label="Open purchase orders" value={orders.filter((o) => o.status !== 'Received').length} icon={ClipboardList} tone="violet" />
      </div>
      <Tabs tabs={[['reorder', 'Reorder suggestions'], ['dead', 'Dead stock'], ['orders', 'Purchase orders']]} value={tab} onChange={setTab} />

      {tab === 'reorder' && (
        <>
          <div className="card row gap">
            <label className="field"><span>Sales history</span><select value={window_} onChange={(e) => setWindow(Number(e.target.value))}><option value={30}>Last 30 days</option><option value={60}>Last 60 days</option><option value={90}>Last 90 days</option></select></label>
            <label className="field"><span>Supplier lead time (days)</span><input type="number" min="0" value={lead} onChange={(e) => setLead(e.target.value)} /></label>
            <label className="field"><span>Order enough for (days)</span><input type="number" min="1" value={cover} onChange={(e) => setCover(e.target.value)} /></label>
            <div className="grow" />
            <button className="btn ghost" onClick={() => downloadFile('reorder.csv', toCSV(chosen.map((r) => ({ medicine: r.p.name, inStock: r.p.stock, soldPerDay: r.perDay.toFixed(2), daysLeft: isFinite(r.daysLeft) ? Math.floor(r.daysLeft) : '', orderQty: qtyOf(r) ?? '', supplier: r.buy?.supplierName || '', lastCost: r.buy?.cost || r.p.cost }))), 'text/csv')}><Download size={16} />CSV</button>
            {can('medicines.manage') && <button className="btn ghost" onClick={() => setLevels(computeReorderLevels(db, products, db.settings, branchId))}><Wand2 size={16} />Set reorder levels from sales</button>}
            <button className="btn primary" disabled={!chosen.length} onClick={reviewPOs}><ClipboardList size={16} />Review orders ({chosen.length})</button>
          </div>
          {levels && (() => { const c = reorderSettings(db.settings); return (
            <Modal title="Reorder levels from sales" onClose={() => setLevels(null)} wide>
              <p className="muted small">Level = average daily sales over the last {c.days} days × (lead time {c.lead} + safety {c.safety} days). Only medicines that sold are changed. {c.on ? 'RxPOS also does this automatically every week.' : 'Weekly automatic updates are off (Settings → Receipts & stock).'}</p>
              <div className="table-wrap max-h-50">
                <table>
                  <thead><tr><th>Medicine</th><th className="num">Sold ({c.days} d)</th><th className="num">Per day</th><th className="num">Now</th><th className="num">New level</th></tr></thead>
                  <tbody>
                    {levels.map((r) => <tr key={r.p.id}><td>{r.p.name}</td><td className="num">{r.sold}</td><td className="num">{r.perDay.toFixed(1)}</td><td className="num">{r.p.reorder || 0}</td><td className="num"><strong>{r.level}</strong></td></tr>)}
                    {!levels.length && <Empty colSpan={5}>All reorder levels already match recent sales.</Empty>}
                  </tbody>
                </table>
              </div>
              <div className="form-actions"><button className="btn ghost" onClick={() => setLevels(null)}>Cancel</button>
                <button className="btn primary" disabled={!levels.length} onClick={() => { applyReorderLevels(update, user, branchId, levels); toast(`${levels.length} reorder levels updated`); setLevels(null); }}>Apply {levels.length} change{levels.length === 1 ? '' : 's'}</button></div>
            </Modal>); })()}
          {plan && (
            <Modal title={`Review ${plan.length} purchase order${plan.length === 1 ? '' : 's'}`} onClose={() => setPlan(null)} wide>
              <p className="muted small">Grouped by {supplierRule(from, handPicked)}. Costs are estimates from past purchases; confirm prices with each supplier. The orders are saved as drafts and are not sent to anyone.</p>
              <div className="po-plan scroll-55">
                {plan.map((o) => (
                  <section key={o.supplierId || 'none'} className="card po-plan-group" aria-label={`Order for ${o.supplierName}`}>
                    <div className="row gap"><strong className="grow">{o.supplierName}</strong><span className="muted small">{o.lines.length} line{o.lines.length === 1 ? '' : 's'}</span><strong>{fmt(o.total)}</strong></div>
                    {!o.supplierId && <p className="text-warn small">⚠ These medicines have no past supplier. Choose a supplier on the order before sending it.</p>}
                    <table><thead><tr><th>Medicine</th><th className="num">Qty</th><th className="num">Est. cost</th><th className="num">Line total</th></tr></thead>
                      <tbody>{o.lines.map((l) => <tr key={l.productId}><td>{l.name}</td><td className="num">{l.qty}</td><td className="num">{l.priced ? fmt(l.cost) : <span className="text-warn">No price yet</span>}</td><td className="num">{fmt(l.qty * l.cost)}</td></tr>)}</tbody>
                    </table>
                    {o.unpriced > 0 && <small className="text-warn">⚠ {o.unpriced} line{o.unpriced === 1 ? ' has' : 's have'} no known price; the total leaves {o.unpriced === 1 ? 'it' : 'them'} out.</small>}
                  </section>
                ))}
              </div>
              <p className="num"><strong>Estimated total {fmt(plan.reduce((a, o) => a + o.total, 0))}</strong></p>
              <div className="form-actions"><button className="btn ghost" onClick={() => setPlan(null)}>Back</button>
                <button className="btn primary" onClick={createPOs}><ClipboardList size={16} />Create {plan.length} draft order{plan.length === 1 ? '' : 's'}</button></div>
            </Modal>
          )}
          <details className="explain">
            <summary>How the order quantity is worked out</summary>
            <p>Two different signals: the <b>reorder level</b> is a fixed number set on each medicine (Medicine list or "Set reorder levels from sales"); it drives the
              "Low stock" alerts. The <b>suggestion</b> here is a forecast from real sales at this branch:</p>
            <p><b>Order qty</b> = sells per day (last {window_} days) × (lead time {Number(lead) || 0} + cover {Number(cover) || 0} days) − in stock, rounded up.
              A medicine with no sales in that window but at or below its reorder level is suggested at 2 × reorder level − in stock. Listed when the stock lasts
              {' '}{Number(lead) + Number(cover)} days or less, or is at or below the reorder level.</p>
          </details>
          <div className="row gap">
            <span className="muted small">Order each medicine from</span>
            <Tabs tabs={[['cheapest', 'Cheapest supplier'], ['last', 'Last supplier']]} value={from} onChange={(v) => { setFrom(v); setChosenSup({}); }} />
            <label className="check small"><input type="checkbox" checked={roundPacks} onChange={(e) => setRoundPacks(e.target.checked)} /> Round up to whole packs</label>
          </div>
          <div className="card table-wrap">
            <DataTable id="reorder" wrapClass="dt-inner" rows={suggestions} rowKey={(r) => r.p.id} csv={false} empty="Stock levels look healthy. Nothing needs ordering." columns={[
              { id: 'pick', label: 'Order', fixed: true, noExport: true, render: (r) => <input type="checkbox" aria-label={`Order ${r.p.name}`} checked={picked[r.p.id] ?? true} onChange={(e) => setPicked({ ...picked, [r.p.id]: e.target.checked })} /> },
              { id: 'name', label: 'Medicine', sortBy: (r) => r.p.name, render: (r) => <strong>{r.p.name}</strong> },
              { id: 'stock', label: 'In stock', num: true, sortBy: (r) => r.p.stock, render: (r) => r.p.stock },
              { id: 'perDay', label: 'Sells / day', num: true, sortBy: (r) => r.perDay, render: (r) => r.perDay.toFixed(1) },
              { id: 'daysLeft', label: 'Days left', num: true, sortBy: (r) => (isFinite(r.daysLeft) ? r.daysLeft : 1e9), tdClass: (r) => (r.daysLeft <= Number(lead) ? 'text-danger' : 'text-warn'), render: (r) => (isFinite(r.daysLeft) ? Math.floor(r.daysLeft) : '—') },
              { id: 'buy', label: 'Buy from', sortBy: (r) => r.buy?.supplierName || '', render: (r) => <>
                      {/* G3: each supplier's last price as a chip, the cheapest marked; a tap uses that supplier and price */}
                      {r.options.length > 1 ? (
                        <div className="price-chips" role="radiogroup" aria-label={`Supplier for ${r.p.name}`}>
                          {r.options.map((o, n) => (
                            <button key={o.supplierId} type="button" role="radio" aria-checked={r.buy?.supplierId === o.supplierId} className={'price-chip' + (r.buy?.supplierId === o.supplierId ? ' on' : '') + (n === 0 ? ' cheapest' : '')}
                              title={`Last bought ${String(o.date || '').slice(0, 10)}`} onClick={() => setChosenSup({ ...chosenSup, [r.p.id]: o.supplierId })}>
                              <span>{o.supplierName}</span><b className="num">{fmt(o.cost)}</b>{n === 0 && <small>Cheapest</small>}
                            </button>
                          ))}
                        </div>
                      ) : r.buy?.supplierName || <span className="muted">—</span>}
                      {r.options.length > 1 && r.buy && r.buy.cost > r.options[0].cost && <small className="text-warn"> {fmt(r.buy.cost - r.options[0].cost)} more than {r.options[0].supplierName}</small>}
              </> },
              { id: 'qty', label: 'Order qty', num: true, sortBy: (r) => qtyOf(r) ?? 0, render: (r) => (() => { const q = qtyOf(r), pk = mainPack(r.p); return (<>
                      <input type="number" inputMode="numeric" min="1" step="1" className={'qty-input' + (q == null ? ' invalid' : '')} aria-invalid={q == null} aria-label={`Order quantity for ${r.p.name}`}
                        value={qtyEdit[r.p.id] ?? r.qty} onChange={(e) => setQtyEdit({ ...qtyEdit, [r.p.id]: e.target.value })} />
                      {q == null ? <small className="text-danger block">Whole number, 1 or more</small>
                        : <small className="muted block">{q !== r.qty ? `suggested ${r.qty}` : ''}{pk && q !== r.qty ? ' · ' : ''}{pk ? packCount(q, pk) : ''}</small>}
                    </>); })() },
              { id: 'cost', label: 'Est. cost', num: true, sortBy: (r) => (qtyOf(r) ?? 0) * (r.buy?.cost || r.p.cost || 0), render: (r) => (qtyOf(r) == null ? '—' : fmt(qtyOf(r) * (r.buy?.cost || r.p.cost || 0))) },
            ]} />
          </div>
        </>
      )}

      {tab === 'dead' && (
        <>
          <div className="card row gap">
            <label className="field"><span>Not sold for at least (days)</span><input type="number" min="7" value={deadDays} onChange={(e) => setDeadDays(Number(e.target.value) || 90)} /></label>
            <p className="muted grow">Consider returning these to the supplier, discounting them, or moving them to a branch where they sell.</p>
          </div>
          <div className="card table-wrap">
            <DataTable id="dead-stock" wrapClass="dt-inner" rows={dead} rowKey={(r) => r.p.id} csv="dead-stock" empty="No dead stock. Everything is moving." columns={[
              { id: 'name', label: 'Medicine', sortBy: (r) => r.p.name, render: (r) => <strong>{r.p.name}</strong> },
              { id: 'last', label: 'Last sold', sortBy: (r) => r.last || '', csv: (r) => r.last || 'Never', render: (r) => (r.last ? `${showDate(r.last)} (${r.idle} days)` : 'Never') },
              { id: 'stock', label: 'In stock', num: true, sortBy: (r) => r.p.stock, render: (r) => r.p.stock },
              { id: 'expiry', label: 'Next expiry', sortBy: (r) => r.p.expiry || '', render: (r) => r.p.expiry || '—' },
              { id: 'value', label: 'Value (cost)', num: true, sortBy: (r) => r.value, render: (r) => fmt(r.value) },
            ]} />
          </div>
        </>
      )}

      {tab === 'orders' && (
        <div className="card table-wrap">
          <DataTable id="purchase-orders" wrapClass="dt-inner" rows={orders} csv="purchase-orders"
            empty={<>No purchase orders yet. Create them from the reorder suggestions and send them to your suppliers. <button type="button" className="link-btn" onClick={() => setTab('reorder')}>See what to reorder</button></>} columns={[
              { id: 'number', label: 'Order', key: 'number', render: (po) => <strong>{po.number}</strong> },
              { id: 'date', label: 'Date', key: 'date', render: (po) => showDate(po.date) },
              { id: 'supplier', label: 'Supplier', key: 'supplierName' },
              { id: 'lines', label: 'Lines', num: true, sortBy: (po) => po.items.length, render: (po) => po.items.length },
              { id: 'status', label: 'Status', key: 'status', render: (po) => <StatusPill status={po.status} /> },
              { id: 'value', label: 'Est. value', num: true, sortBy: (po) => po.items.reduce((a, i) => a + i.qty * (i.cost || 0), 0), render: (po) => fmt(po.items.reduce((a, i) => a + i.qty * (i.cost || 0), 0)) },
              { id: 'actions', label: 'Actions', noExport: true, className: 'actions', render: (po) => <>
                <button className="btn sm ghost" onClick={() => setViewPo(po)}>Open</button>
                {po.status !== 'Received' && <button className="btn sm primary" onClick={() => navigate('/add-stock', { state: { po } })}><PackageCheck size={14} />Receive</button>}
              </> },
            ]} />
        </div>
      )}

      {viewPo && (() => {
        const supplier = db.suppliers.find((x) => x.id === viewPo.supplierId);
        const phone = normalizePhone(supplier?.phone);
        // Printing or opening WhatsApp does not mean the order reached the supplier: marking it sent is a separate, deliberate step
        const next = nextStatus(viewPo.status);
        const markSent = async () => {
          if (!next || !(await ask({ title: `Mark ${viewPo.number} as sent?`, message: `Only do this once ${viewPo.supplierName} has the order.`, confirmText: 'Mark as sent' }))) return;
          const po = { ...viewPo, status: next, sentAt: now(), sentBy: user.name };
          update((d) => { put(d, 'purchaseOrders', po); audit(d, user, 'Purchase order marked sent', `${viewPo.number} to ${viewPo.supplierName}`, branchId); });
          setViewPo(po);
          toast(`${viewPo.number} marked as sent`);
        };
        return (
          <Modal title={`Purchase order ${viewPo.number}`} onClose={() => setViewPo(null)} wide>
            <div className="print-area po-doc">
              <h2>{s.name}</h2>
              <p>Purchase order <strong>{viewPo.number}</strong> · {showDate(viewPo.date)}<br />To: {viewPo.supplierName}</p>
              <table>
                <thead><tr><th>#</th><th>Medicine</th><th className="num">Qty</th><th className="num">Last cost</th><th className="num">Total</th></tr></thead>
                <tbody>{viewPo.items.map((i, n) => <tr key={n}><td>{n + 1}</td><td>{i.name}</td><td className="num">{i.qty}</td><td className="num">{fmt(i.cost)}</td><td className="num">{fmt(i.qty * i.cost)}</td></tr>)}</tbody>
              </table>
              <p className="num"><strong>Estimated total {fmt(viewPo.items.reduce((a, i) => a + i.qty * i.cost, 0))}</strong></p>
            </div>
            <p className="muted small no-print">Status: <StatusPill status={viewPo.status} />{viewPo.sentAt ? ` · marked sent ${showDateTime(viewPo.sentAt)}${viewPo.sentBy ? ' by ' + viewPo.sentBy : ''}` : ''}. Printing or opening WhatsApp does not change the status.</p>
            <div className="form-actions no-print">
              {viewPo.status !== 'Received' && <button className="btn danger" onClick={async () => (await ask({ title: 'Delete this purchase order?', danger: true, confirmText: 'Delete' })) && (update((d) => del(d, 'purchaseOrders', viewPo.id)), setViewPo(null))}>Delete</button>}
              <a className={'btn ghost' + (phone.length < 12 ? ' disabled-link' : '')} href={phone.length >= 12 ? whatsappLink(phone, poText(viewPo)) : undefined} target="_blank" rel="noreferrer" title={phone.length < 12 ? 'Add the supplier’s phone number first' : ''}><MessageCircle size={16} />WhatsApp to supplier</a>
              <button className="btn ghost" onClick={() => window.print()}><Printer size={16} />Print</button>
              {next && <button className="btn primary" onClick={markSent}>Mark as sent</button>}
            </div>
          </Modal>
        );
      })()}
    </div>
  );
}

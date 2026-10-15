import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShoppingBag, PackageX, ClipboardList, MessageCircle, Printer, PackageCheck, Download, Wand2 } from 'lucide-react';
import { useStore, daysSince, uid, now, put, del, audit, downloadFile, toCSV, normalizePhone, MAIN_BRANCH } from '../store.jsx';
import { Tabs, Empty, Modal, Stat } from '../ui.jsx';
import { toast, ask } from '../feedback.jsx';
import { whatsappLink } from '../cloud.js';
import { computeReorderLevels, applyReorderLevels, reorderSettings } from '../reorder.js';

/** Smart reorder suggestions, dead stock and purchase orders. */
export default function Reorder() {
  const { db, products, fmt, update, user, branchId, branch, can } = useStore();
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

  // Sales velocity per product at this branch, and last sale date
  const velocity = useMemo(() => {
    const since = Date.now() - window_ * 864e5;
    const sold = new Map(), lastSale = new Map();
    for (const sale of db.sales) {
      if (sale.status === 'refunded' || (sale.branchId || MAIN_BRANCH) !== branchId) continue;
      const t = new Date(sale.date).getTime();
      for (const i of sale.items) {
        if (t >= since) sold.set(i.id, (sold.get(i.id) || 0) + i.qty);
        if (!lastSale.has(i.id) || lastSale.get(i.id) < sale.date) lastSale.set(i.id, sale.date);
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

  const suggestions = useMemo(() => products.map((p) => {
    const perDay = (velocity.sold.get(p.id) || 0) / window_;
    const daysLeft = perDay > 0 ? p.stock / perDay : Infinity;
    const target = Math.ceil(perDay * (Number(lead) + Number(cover)));
    const qty = Math.max(0, target - Math.max(p.stock, 0), p.stock <= (p.reorder || 0) && perDay === 0 && p.reorder ? p.reorder * 2 - p.stock : 0);
    return { p, perDay, daysLeft, qty, buy: lastBuy.get(p.id) };
  }).filter((r) => r.qty > 0 && (r.p.stock > 0 || r.perDay > 0) && (r.daysLeft <= Number(lead) + Number(cover) || r.p.stock <= (r.p.reorder || 0)))
    .sort((a, b) => a.daysLeft - b.daysLeft), [products, velocity, window_, lead, cover, lastBuy]);

  const dead = useMemo(() => products.filter((p) => p.stock > 0).map((p) => {
    const last = velocity.lastSale.get(p.id);
    return { p, last, idle: last ? daysSince(last) : Infinity, value: p.stock * (p.cost || 0) };
  }).filter((r) => r.idle >= deadDays).sort((a, b) => b.value - a.value), [products, velocity, deadDays]);

  const chosen = suggestions.filter((r) => picked[r.p.id] ?? true);
  const bySupplier = useMemo(() => {
    const g = new Map();
    for (const r of chosen) {
      const k = r.buy?.supplierId || '';
      if (!g.has(k)) g.set(k, []);
      g.get(k).push(r);
    }
    return g;
  }, [chosen]);

  const createPOs = async () => {
    if (!chosen.length) return;
    if (!(await ask({ title: `Create ${bySupplier.size} purchase order${bySupplier.size === 1 ? '' : 's'}?`, message: `${chosen.length} medicines, grouped by the supplier you last bought each from.`, confirmText: 'Create' }))) return;
    update((d) => {
      for (const [supplierId, list] of bySupplier) {
        put(d, 'purchaseOrders', {
          id: uid(), number: 'PO' + Date.now().toString(36).toUpperCase().slice(-6) + Math.floor(Math.random() * 9), date: now(), status: 'Draft', branchId,
          supplierId, supplierName: db.suppliers.find((x) => x.id === supplierId)?.name || 'Any supplier', createdBy: user.name,
          items: list.map((r) => ({ productId: r.p.id, name: r.p.name, qty: r.qty, cost: r.buy?.cost || r.p.cost })),
        });
      }
      audit(d, user, 'Purchase orders created', `${bySupplier.size} order(s), ${chosen.length} lines`, branchId);
    });
    toast('Purchase orders created');
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
        <Stat label="Est. order value" value={fmt(suggestions.reduce((a, r) => a + r.qty * (r.buy?.cost || r.p.cost || 0), 0))} />
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
            <button className="btn ghost" onClick={() => downloadFile('reorder.csv', toCSV(chosen.map((r) => ({ medicine: r.p.name, inStock: r.p.stock, soldPerDay: r.perDay.toFixed(2), daysLeft: isFinite(r.daysLeft) ? Math.floor(r.daysLeft) : '', orderQty: r.qty, supplier: r.buy?.supplierName || '', lastCost: r.buy?.cost || r.p.cost }))), 'text/csv')}><Download size={16} />CSV</button>
            {can('medicines.manage') && <button className="btn ghost" onClick={() => setLevels(computeReorderLevels(db, products, db.settings, branchId))}><Wand2 size={16} />Set reorder levels from sales</button>}
            <button className="btn primary" disabled={!chosen.length} onClick={createPOs}><ClipboardList size={16} />Create purchase orders ({chosen.length})</button>
          </div>
          {levels && (() => { const c = reorderSettings(db.settings); return (
            <Modal title="Reorder levels from sales" onClose={() => setLevels(null)} wide>
              <p className="muted small">Level = average daily sales over the last {c.days} days × (lead time {c.lead} + safety {c.safety} days). Only medicines that sold are changed. {c.on ? 'RxPOS also does this automatically every week.' : 'Weekly automatic updates are off (Settings → Receipts & stock).'}</p>
              <div className="table-wrap" style={{ maxHeight: '50vh' }}>
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
          <div className="card table-wrap">
            <table>
              <thead><tr><th /><th>Medicine</th><th className="num">In stock</th><th className="num">Sells / day</th><th className="num">Days left</th><th>Last supplier</th><th className="num">Order qty</th><th className="num">Est. cost</th></tr></thead>
              <tbody>
                {suggestions.map((r) => (
                  <tr key={r.p.id}>
                    <td><input type="checkbox" checked={picked[r.p.id] ?? true} onChange={(e) => setPicked({ ...picked, [r.p.id]: e.target.checked })} /></td>
                    <td><strong>{r.p.name}</strong></td><td className="num">{r.p.stock}</td><td className="num">{r.perDay.toFixed(1)}</td>
                    <td className={'num ' + (r.daysLeft <= Number(lead) ? 'text-danger' : 'text-warn')}>{isFinite(r.daysLeft) ? Math.floor(r.daysLeft) : '—'}</td>
                    <td>{r.buy?.supplierName || <span className="muted">—</span>}</td>
                    <td className="num"><strong>{r.qty}</strong></td><td className="num">{fmt(r.qty * (r.buy?.cost || r.p.cost || 0))}</td>
                  </tr>
                ))}
                {!suggestions.length && <Empty colSpan={8}>Stock levels look healthy. Nothing needs ordering.</Empty>}
              </tbody>
            </table>
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
            <table>
              <thead><tr><th>Medicine</th><th>Last sold</th><th className="num">In stock</th><th>Next expiry</th><th className="num">Value (cost)</th></tr></thead>
              <tbody>
                {dead.map((r) => (
                  <tr key={r.p.id}><td><strong>{r.p.name}</strong></td><td>{r.last ? `${new Date(r.last).toLocaleDateString()} (${r.idle} days)` : 'Never'}</td><td className="num">{r.p.stock}</td><td>{r.p.expiry || '—'}</td><td className="num">{fmt(r.value)}</td></tr>
                ))}
                {!dead.length && <Empty colSpan={5}>No dead stock. Everything is moving.</Empty>}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'orders' && (
        <div className="card table-wrap">
          <table>
            <thead><tr><th>Order</th><th>Date</th><th>Supplier</th><th>Lines</th><th>Status</th><th className="num">Est. value</th><th /></tr></thead>
            <tbody>
              {orders.map((po) => (
                <tr key={po.id}>
                  <td><strong>{po.number}</strong></td><td>{new Date(po.date).toLocaleDateString()}</td><td>{po.supplierName}</td><td>{po.items.length}</td>
                  <td><span className={'badge ' + (po.status === 'Received' ? 'ok' : po.status === 'Sent' ? '' : 'warn')}>{po.status}</span></td>
                  <td className="num">{fmt(po.items.reduce((a, i) => a + i.qty * (i.cost || 0), 0))}</td>
                  <td className="actions">
                    <button className="btn sm ghost" onClick={() => setViewPo(po)}>Open</button>
                    {po.status !== 'Received' && <button className="btn sm primary" onClick={() => navigate('/add-stock', { state: { po } })}><PackageCheck size={14} />Receive</button>}
                  </td>
                </tr>
              ))}
              {!orders.length && <Empty colSpan={7}>No purchase orders yet. Create them from Reorder suggestions.</Empty>}
            </tbody>
          </table>
        </div>
      )}

      {viewPo && (() => {
        const supplier = db.suppliers.find((x) => x.id === viewPo.supplierId);
        const phone = normalizePhone(supplier?.phone);
        const markSent = () => { update((d) => { put(d, 'purchaseOrders', { ...viewPo, status: viewPo.status === 'Draft' ? 'Sent' : viewPo.status }); }); };
        return (
          <Modal title={`Purchase order ${viewPo.number}`} onClose={() => setViewPo(null)} wide>
            <div className="print-area po-doc">
              <h2>{s.name}</h2>
              <p>Purchase order <strong>{viewPo.number}</strong> · {new Date(viewPo.date).toLocaleDateString()}<br />To: {viewPo.supplierName}</p>
              <table>
                <thead><tr><th>#</th><th>Medicine</th><th className="num">Qty</th><th className="num">Last cost</th><th className="num">Total</th></tr></thead>
                <tbody>{viewPo.items.map((i, n) => <tr key={n}><td>{n + 1}</td><td>{i.name}</td><td className="num">{i.qty}</td><td className="num">{fmt(i.cost)}</td><td className="num">{fmt(i.qty * i.cost)}</td></tr>)}</tbody>
              </table>
              <p className="num"><strong>Estimated total {fmt(viewPo.items.reduce((a, i) => a + i.qty * i.cost, 0))}</strong></p>
            </div>
            <div className="form-actions no-print">
              {viewPo.status !== 'Received' && <button className="btn danger" onClick={async () => (await ask({ title: 'Delete this purchase order?', danger: true, confirmText: 'Delete' })) && (update((d) => del(d, 'purchaseOrders', viewPo.id)), setViewPo(null))}>Delete</button>}
              <a className={'btn ghost' + (phone.length < 12 ? ' disabled-link' : '')} href={phone.length >= 12 ? whatsappLink(phone, poText(viewPo)) : undefined} target="_blank" rel="noreferrer" onClick={markSent} title={phone.length < 12 ? 'Add the supplier’s phone number first' : ''}><MessageCircle size={16} />WhatsApp to supplier</a>
              <button className="btn primary" onClick={() => { markSent(); window.print(); }}><Printer size={16} />Print</button>
            </div>
          </Modal>
        );
      })()}
    </div>
  );
}

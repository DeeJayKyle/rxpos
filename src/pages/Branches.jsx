import { useMemo, useState } from 'react';
import { Building2, Plus, Truck, PackageCheck, Send, Pencil, MapPin, Trash2 } from 'lucide-react';
import { useStore, today, uid, now, put, del, move, audit, allocate, MAIN_BRANCH } from '../store.jsx';
import { Modal, RecordForm, Tabs, Empty, SearchBox, Stat } from '../ui.jsx';
import { toast, ask } from '../feedback.jsx';

/** Owner view: every branch side by side, plus branch management. */
export default function Branches() {
  const { db, stockIndex, fmt, upsert, update, branchId, setBranchId, user, can } = useStore();
  const admin = can('settings.manage');
  const removeBranch = async (b) => {
    const stock = db.products.reduce((a, p) => a + Math.max(stockIndex.product.get(b.id + '|' + p.id) || 0, 0), 0);
    if (stock > 0) return toast(`${b.name} still has ${stock} items in stock. Transfer them to another branch first.`, 'warn');
    if (db.transfers.some((t) => t.status === 'In transit' && (t.toId === b.id || t.fromId === b.id))) return toast('There are transfers in transit to or from this branch', 'warn');
    if (!(await ask({ title: `Delete ${b.name}?`, message: 'Its past sales stay in your reports. Devices set to this branch switch to the main branch.', confirmText: 'Delete branch', danger: true }))) return;
    update((d) => { del(d, 'branches', b.id); audit(d, user, 'Branch deleted', b.name, branchId); });
    if (branchId === b.id) setBranchId('main');
    toast(`${b.name} deleted`);
  };
  const [edit, setEdit] = useState(null);
  const month = today().slice(0, 7);

  const stats = useMemo(() => {
    const cost = new Map(db.products.map((p) => [p.id, p.cost || 0]));
    const reorder = new Map(db.products.map((p) => [p.id, p.reorder || 0]));
    return db.branches.map((b) => {
      let stockValue = 0, low = 0;
      for (const p of db.products) {
        const q = stockIndex.product.get(b.id + '|' + p.id) || 0;
        stockValue += Math.max(q, 0) * cost.get(p.id);
        if (q <= reorder.get(p.id)) low++;
      }
      const sales = db.sales.filter((s) => s.status !== 'refunded' && (s.branchId || MAIN_BRANCH) === b.id);
      const todays = sales.filter((s) => s.date.slice(0, 10) === today());
      const monthly = sales.filter((s) => s.date.slice(0, 7) === month);
      return { ...b, stockValue, low, today: todays.reduce((a, s) => a + s.total, 0), todayN: todays.length, month: monthly.reduce((a, s) => a + s.total, 0) };
    });
  }, [db.branches, db.products, db.sales, stockIndex, month]);

  const totals = stats.reduce((a, b) => ({ today: a.today + b.today, month: a.month + b.month, stock: a.stock + b.stockValue }), { today: 0, month: 0, stock: 0 });

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Branches</h1><div className="sub">All branches at a glance · this device works as <strong>{db.branches.find((b) => b.id === branchId)?.name}</strong></div></div>
        {admin && <button className="btn primary" onClick={() => setEdit({ id: uid(), _new: true })}><Plus size={16} />Add branch</button>}
      </div>
      <div className="stats">
        <Stat label="Sales today – all branches" value={fmt(totals.today)} icon={Building2} tone="teal" />
        <Stat label="Sales this month" value={fmt(totals.month)} tone="violet" />
        <Stat label="Stock value – all branches" value={fmt(totals.stock)} sub="at cost" />
      </div>
      <div className="branch-grid">
        {stats.map((b) => (
          <div key={b.id} className={'card branch-card' + (b.id === branchId ? ' current' : '')}>
            <div className="row between">
              <h3><Building2 size={18} />{b.name}</h3>
              {admin && <span><button className="icon-btn" title="Edit" onClick={() => setEdit(b)}><Pencil size={15} /></button>{b.id !== 'main' && <button className="icon-btn" title="Delete branch" onClick={() => removeBranch(b)}><Trash2 size={15} /></button>}</span>}
            </div>
            {b.address && <p className="muted small"><MapPin size={12} /> {b.address}</p>}
            <div className="kv"><span>Today</span><strong>{fmt(b.today)}</strong><small className="muted">{b.todayN} sales</small></div>
            <div className="kv"><span>This month</span><strong>{fmt(b.month)}</strong></div>
            <div className="kv"><span>Stock value</span><strong>{fmt(b.stockValue)}</strong></div>
            <div className="kv"><span>Low / out of stock</span><strong className={b.low ? 'text-warn' : ''}>{b.low}</strong></div>
            {b.id === branchId ? <span className="badge ok">This device</span>
              : <button className="btn sm ghost" onClick={async () => (await ask({ title: `Switch this device to ${b.name}?`, message: 'Sales, stock and receipts on this device will be recorded for that branch.', confirmText: 'Switch' })) && (setBranchId(b.id), toast(`This device now works as ${b.name}`))}>Use on this device</button>}
          </div>
        ))}
      </div>
      {edit && (
        <Modal title={edit._new ? 'Add branch' : 'Edit branch'} onClose={() => setEdit(null)}>
          <RecordForm initial={edit} onCancel={() => setEdit(null)}
            fields={[{ key: 'name', label: 'Branch name', required: true }, { key: 'address', label: 'Address / town' }, { key: 'phone', label: 'Phone' }, { key: 'manager', label: 'Manager' }]}
            onSave={({ _new, ...b }) => { upsert('branches', b); toast(_new ? `${b.name} added` : 'Branch saved'); setEdit(null); }} />
        </Modal>
      )}
    </div>
  );
}

/** Send stock to another branch (leaves now, "in transit"), and receive incoming transfers. */
export function Transfers() {
  const { db, products, update, user, branchId, batchesOf, stockIndex } = useStore();
  const [tab, setTab] = useState('incoming');
  const [creating, setCreating] = useState(null);
  const [q, setQ] = useState('');
  const others = db.branches.filter((b) => b.id !== branchId);
  const name = (id) => db.branches.find((b) => b.id === id)?.name || '—';
  const incoming = db.transfers.filter((t) => t.toId === branchId);
  const outgoing = db.transfers.filter((t) => t.fromId === branchId);
  const list = tab === 'incoming' ? incoming : outgoing;

  const send = async () => {
    const lines = creating.lines.filter((l) => Number(l.qty) > 0);
    if (!creating.toId) return toast('Choose the branch to send to', 'warn');
    if (!lines.length) return toast('Add at least one medicine', 'warn');
    for (const l of lines) {
      const have = products.find((p) => p.id === l.productId)?.stock || 0;
      if (Number(l.qty) > have) return toast(`Only ${have} ${l.name} in stock`, 'error');
    }
    const t = { id: uid(), number: 'TR' + Date.now().toString(36).toUpperCase().slice(-6), date: now(), fromId: branchId, toId: creating.toId, status: 'In transit', sentBy: user.name, note: creating.note, items: [] };
    update((d) => {
      for (const l of lines) {
        const alloc = allocate(batchesOf(l.productId), Number(l.qty), { allowExpired: false });
        t.items.push({ productId: l.productId, name: l.name, qty: Number(l.qty), alloc });
        for (const a of alloc) move(d, { productId: l.productId, qty: -a.qty, type: 'Transfer out', ref: `${t.number} → ${name(t.toId)}`, user: user.name, batchId: a.batchId, branchId });
      }
      put(d, 'transfers', t);
      audit(d, user, 'Stock transfer sent', `${t.number} to ${name(t.toId)}: ${lines.length} lines`, branchId);
    });
    toast(`${t.number} sent to ${name(t.toId)}`);
    setCreating(null);
    setTab('outgoing');
  };

  const receive = async (t) => {
    const received = await new Promise((resolve) => setReceiving({ t, qty: Object.fromEntries(t.items.map((i, n) => [n, i.qty])), resolve }));
    if (!received) return;
    update((d) => {
      t.items.forEach((i, n) => {
        let left = Number(received[n]) || 0;
        for (const a of i.alloc) { // receive into the same batches that were sent (same expiry)
          const qty = Math.min(a.qty, left);
          if (qty > 0) move(d, { productId: i.productId, qty, type: 'Transfer in', ref: `${t.number} ← ${name(t.fromId)}`, user: user.name, batchId: a.batchId, branchId });
          left -= qty;
        }
      });
      const short = t.items.map((i, n) => i.qty - (Number(received[n]) || 0)).reduce((a, b) => a + b, 0);
      put(d, 'transfers', { ...t, status: short > 0 ? 'Received (short)' : 'Received', receivedBy: user.name, receivedAt: now(), receivedQty: received });
      audit(d, user, 'Stock transfer received', `${t.number} from ${name(t.fromId)}${short > 0 ? ` – ${short} units short` : ''}`, branchId);
    });
    toast(`${t.number} received into stock`);
  };
  const [receiving, setReceiving] = useState(null);

  const matches = q ? products.filter((p) => p.stock > 0 && `${p.name} ${p.barcode}`.toLowerCase().includes(q.toLowerCase())).slice(0, 8) : [];

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Stock Transfers</h1><div className="sub">{incoming.filter((t) => t.status === 'In transit').length} incoming waiting to be received</div></div>
        <button className="btn primary" disabled={!others.length} onClick={() => setCreating({ toId: others[0]?.id || '', note: '', lines: [] })}><Send size={16} />New transfer</button>
      </div>
      {!others.length && <div className="notice">Add another branch first (Branches → Add branch).</div>}
      <Tabs tabs={[['incoming', 'Incoming'], ['outgoing', 'Sent']]} value={tab} onChange={setTab} />
      <div className="card table-wrap">
        <table>
          <thead><tr><th>Transfer</th><th>Date</th><th>{tab === 'incoming' ? 'From' : 'To'}</th><th>Items</th><th>Status</th><th /></tr></thead>
          <tbody>
            {list.map((t) => (
              <tr key={t.id}>
                <td><strong>{t.number}</strong><br /><small className="muted">by {t.sentBy}</small></td>
                <td>{new Date(t.date).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</td>
                <td>{name(tab === 'incoming' ? t.fromId : t.toId)}</td>
                <td>{t.items.map((i) => `${i.name} ×${i.qty}`).join(', ')}</td>
                <td><span className={'badge ' + (t.status === 'In transit' ? 'warn' : t.status === 'Received' ? 'ok' : 'danger')}>{t.status}</span></td>
                <td className="actions">{tab === 'incoming' && t.status === 'In transit' && <button className="btn sm primary" onClick={() => receive(t)}><PackageCheck size={14} />Receive</button>}</td>
              </tr>
            ))}
            {!list.length && <Empty colSpan={6}>No {tab} transfers</Empty>}
          </tbody>
        </table>
      </div>

      {creating && (
        <Modal title={<><Truck size={18} /> New stock transfer</>} onClose={() => setCreating(null)} wide>
          <div className="form-grid">
            <label className="field"><span>From</span><input value={name(branchId)} disabled /></label>
            <label className="field"><span>To branch</span>
              <select value={creating.toId} onChange={(e) => setCreating({ ...creating, toId: e.target.value })}>{others.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
            <label className="field"><span>Note</span><input value={creating.note} onChange={(e) => setCreating({ ...creating, note: e.target.value })} /></label>
          </div>
          <div className="picker">
            <SearchBox value={q} onChange={setQ} placeholder="Search medicine to send…" />
            {matches.length > 0 && <div className="picker-list">{matches.map((p) => (
              <button key={p.id} type="button" onClick={() => { setCreating((c) => ({ ...c, lines: c.lines.some((l) => l.productId === p.id) ? c.lines : [...c.lines, { productId: p.id, name: p.name, qty: 1 }] })); setQ(''); }}>
                {p.name} <small className="muted">{p.stock} here · {stockIndex.product.get(creating.toId + '|' + p.id) || 0} at {name(creating.toId)}</small>
              </button>))}</div>}
          </div>
          <table className="lines">
            <thead><tr><th>Medicine</th><th>Available</th><th>Send</th><th /></tr></thead>
            <tbody>
              {creating.lines.map((l, i) => (
                <tr key={l.productId}><td>{l.name}</td><td>{products.find((p) => p.id === l.productId)?.stock}</td>
                  <td><input type="number" min="1" value={l.qty} onChange={(e) => setCreating((c) => ({ ...c, lines: c.lines.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)) }))} /></td>
                  <td><button className="icon-btn" onClick={() => setCreating((c) => ({ ...c, lines: c.lines.filter((_, j) => j !== i) }))}>×</button></td></tr>
              ))}
              {!creating.lines.length && <Empty colSpan={4}>Search above to add medicines</Empty>}
            </tbody>
          </table>
          <div className="form-actions"><button className="btn ghost" onClick={() => setCreating(null)}>Cancel</button><button className="btn primary" onClick={send}><Send size={16} />Send stock</button></div>
        </Modal>
      )}

      {receiving && (
        <Modal title={`Receive ${receiving.t.number}`} onClose={() => { receiving.resolve(null); setReceiving(null); }}>
          <p className="muted">Enter what actually arrived. Any shortage is recorded.</p>
          <table className="lines">
            <thead><tr><th>Medicine</th><th className="num">Sent</th><th>Received</th></tr></thead>
            <tbody>{receiving.t.items.map((i, n) => (
              <tr key={n}><td>{i.name}</td><td className="num">{i.qty}</td>
                <td><input type="number" min="0" max={i.qty} value={receiving.qty[n]} onChange={(e) => setReceiving((r) => ({ ...r, qty: { ...r.qty, [n]: e.target.value } }))} /></td></tr>
            ))}</tbody>
          </table>
          <div className="form-actions">
            <button className="btn ghost" onClick={() => { receiving.resolve(null); setReceiving(null); }}>Cancel</button>
            <button className="btn primary" onClick={() => { receiving.resolve(receiving.qty); setReceiving(null); }}><PackageCheck size={16} />Receive into stock</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

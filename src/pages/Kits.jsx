// Kits (1.10.0, src/kits.js): build a kit from medicines in stock (and service lines such as a testing fee) and sell
// it at the till as one item. A kit is a recipe: it has no stock of its own; each sale takes its medicines from their
// own batches. Its cost is the live sum of what it holds, its price the sum of their retail prices unless a fixed
// price is set. Each kit has an icon, a colour and a warning (that the cashier may have to tick before charging), so
// it looks different from other stock at the till. Ready-made kits (HIV test, malaria RDT…) are matched to this
// pharmacy's own medicines by name.
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Pencil, Trash2, Tag, Sparkles, AlertTriangle, Power, Wrench } from 'lucide-react';
import { useStore, uid, put, del, audit, now } from '../store.jsx';
import { Modal, Empty, PageTip } from '../ui.jsx';
import { MedicinePicker } from '../fields.jsx';
import { ask, toast } from '../feedback.jsx';
import { newInternalBarcode } from '../barcode.jsx';
import { KIT_ICONS, KIT_COLORS, KIT_TEMPLATES, kitView, shortText, matchTemplate } from '../kits.js';
import KitIcon, { KitGlyph } from '../components/KitIcon.jsx';

const blankKit = () => ({ id: '', name: '', barcode: '', active: true, icon: 'test-tube', color: KIT_COLORS[0], warning: '', ack: false, price: '', wholesale: '',
  items: [{ key: uid(), productId: '', qty: 1 }] });

export default function Kits() {
  const { db, products, kits, fmt, update, user, branchId, can } = useStore();
  const navigate = useNavigate();
  const edit = can('medicines.manage');
  const [editing, setEditing] = useState(null);
  const [pick, setPick] = useState(false);
  const [days, setDays] = useState(30);

  // kit sales over the chosen days (step 5): kits sold, takings and profit from the components' costs
  const sold = useMemo(() => {
    const since = new Date(Date.now() - days * 864e5).toISOString();
    const m = new Map();
    for (const s of db.sales) {
      if (s.status === 'refunded' || String(s.date) < since) continue;
      for (const i of s.items) {
        if (!i.kit) continue;
        const x = m.get(i.id) || { n: 0, takings: 0, profit: 0, swaps: 0 };
        x.n += i.qty; x.takings += i.qty * i.price; x.profit += i.qty * (i.price - (i.cost || 0));
        x.swaps += (i.kit.components || []).filter((c) => c.swappedFrom).length ? 1 : 0;
        m.set(i.id, x);
      }
    }
    return m;
  }, [db.sales, days]);
  const totals = [...sold.values()].reduce((a, x) => ({ n: a.n + x.n, takings: a.takings + x.takings, profit: a.profit + x.profit }), { n: 0, takings: 0, profit: 0 });

  const open = (k) => setEditing(k ? {
    id: k.id, name: k.name, barcode: k.barcode || '', active: k.active !== false, icon: k.kit.icon || 'package', color: k.kit.color || KIT_COLORS[0], warning: k.kit.warning || '', ack: !!k.kit.ack,
    price: k.kit.price > 0 ? String(k.kit.price) : '', wholesale: k.kit.wholesale > 0 ? String(k.kit.wholesale) : '',
    items: (k.kit.items || []).map((x) => ({ key: uid(), ...x })),
  } : blankKit());
  const fromTemplate = (t) => {
    setPick(false);
    const lines = matchTemplate(t, products);
    const missing = lines.filter((x) => !x.productId).map((x) => x.looking);
    setEditing({ ...blankKit(), name: t.name, icon: t.icon, color: t.color, warning: t.warning, ack: t.ack, items: lines.map((x) => ({ key: uid(), productId: x.productId, qty: x.qty, ...(x.productId ? {} : { looking: x.looking }) })) });
    if (missing.length) toast(`Not found in your medicines: ${missing.join(', ')}. Choose them, or remove those lines.`, 'warn');
  };
  const toggle = async (k) => {
    await update((d) => { const r = d.products.find((x) => x.id === k.id); if (r) put(d, 'products', { ...r, active: k.active === false }); audit(d, user, k.active === false ? 'Kit switched on' : 'Kit switched off', k.name, branchId); });
  };
  const remove = async (k) => {
    if (!(await ask({ title: `Delete ${k.name}?`, message: 'The kit is no longer sold. Its past sales, and the stock its medicines used, stay as they are.', confirmText: 'Delete kit', danger: true }))) return;
    await update((d) => { del(d, 'products', k.id); audit(d, user, 'Kit deleted', k.name, branchId); });
    toast(`${k.name} deleted`);
  };

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Kits</h1><div className="sub">{kits.length} kit{kits.length === 1 ? '' : 's'} · sold at the till as one item, from their medicines' stock</div></div>
        {edit && <div className="row gap">
          <button className="btn ghost" onClick={() => setPick(true)}><Sparkles size={16} />Ready-made kit</button>
          <button className="btn primary" onClick={() => open(null)}><Plus size={16} />New kit</button>
        </div>}
      </div>
      <PageTip id="kits" title="How kits work">A kit is a list of medicines (and services such as a testing fee) sold together, e.g. an HIV test kit: test strip, lancet, swab and water for injection. It has no stock of its own: the till shows how many can be made from what is on the shelf, and each sale takes every medicine from its own batches. Its cost is what its medicines cost; its price is their retail prices added up, unless you set a price for the kit.</PageTip>
      <div className="kit-grid">
        {kits.map((k) => {
          const s = sold.get(k.id);
          return (
            <div key={k.id} className={'card kit-card' + (k.active === false ? ' off' : '')} style={{ '--kit': k.kit.color }}>
              <div className="kit-card-head">
                <KitIcon icon={k.kit.icon} color={k.kit.color} size={20} />
                <h3>{k.name}<span className="kit-badge">KIT</span></h3>
                {k.active === false && <span className="badge">Off</span>}
              </div>
              <ul className="small">
                {k.components.map((c) => <li key={c.productId}>{c.qty} × {c.missing ? <span className="text-danger">a deleted medicine</span> : c.name} <span className="muted">({c.have} in stock)</span></li>)}
                {k.services.map((x) => <li key={x.name}><em>{x.name}</em> <span className="muted">{fmt(x.price)}</span></li>)}
              </ul>
              <div className="kit-figures">
                <div><small className="muted">Can make</small><b className={k.canMake === 0 ? 'text-danger' : k.canMake != null && k.canMake <= 3 ? 'text-warn' : ''}>{k.canMake == null ? 'any' : k.canMake}</b></div>
                <div><small className="muted">Cost</small><b>{fmt(k.cost)}</b></div>
                <div><small className="muted">Price{k.kit.price > 0 ? ' (fixed)' : ''}</small><b>{fmt(k.price)}</b></div>
                <div><small className="muted">Margin</small><b className={k.margin < 0 ? 'text-danger' : ''}>{k.margin == null ? '—' : k.margin + '%'}</b></div>
              </div>
              {shortText(k) && k.canMake != null && k.canMake <= 3 && <p className="small text-warn kit-alert"><AlertTriangle size={14} aria-hidden="true" /> {shortText(k)}</p>}
              {k.kit.warning && <p className="small"><AlertTriangle size={13} aria-hidden="true" /> {k.kit.warning}{k.kit.ack ? ' (the cashier ticks it before charging)' : ''}</p>}
              <p className="small muted">{s ? `Last ${days} days: ${s.n} sold · ${fmt(s.takings)} · profit ${fmt(s.profit)}${s.swaps ? ` · ${s.swaps} with a swap` : ''}` : `None sold in the last ${days} days`}{k.expiry ? ` · earliest expiry ${k.expiry}` : ''}</p>
              {edit && <div className="row gap wrap">
                <button className="btn sm ghost" onClick={() => open(k)}><Pencil size={14} />Edit</button>
                <button className="btn sm ghost" onClick={() => navigate('/labels', { state: { kitId: k.id } })}><Tag size={14} />Label</button>
                <button className="btn sm ghost" onClick={() => toggle(k)}><Power size={14} />{k.active === false ? 'Switch on' : 'Switch off'}</button>
                <button className="btn sm ghost danger" onClick={() => remove(k)} aria-label={`Delete ${k.name}`}><Trash2 size={14} /></button>
              </div>}
            </div>
          );
        })}
      </div>
      {!kits.length && <div className="card"><table><tbody><Empty colSpan={1} action={edit ? { label: 'New kit', onClick: () => open(null) } : undefined}>No kits yet. Build one from medicines in stock, or start from a ready-made kit.</Empty></tbody></table></div>}
      {kits.length > 0 && (
        <div className="card">
          <div className="row between gap wrap"><h3>Kit sales</h3>
            <select value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Period">{[7, 30, 90, 365].map((n) => <option key={n} value={n}>Last {n} days</option>)}</select></div>
          <table>
            <thead><tr><th>Kit</th><th className="num">Sold</th><th className="num">Takings</th><th className="num">Profit</th></tr></thead>
            <tbody>
              {kits.filter((k) => sold.has(k.id)).map((k) => { const s = sold.get(k.id); return <tr key={k.id}><td>{k.name}</td><td className="num">{s.n}</td><td className="num">{fmt(s.takings)}</td><td className="num">{fmt(s.profit)}</td></tr>; })}
              {!sold.size && <Empty colSpan={4}>No kits sold in this period</Empty>}
              {sold.size > 0 && <tr className="total-row"><td>Total</td><td className="num">{totals.n}</td><td className="num">{fmt(totals.takings)}</td><td className="num">{fmt(totals.profit)}</td></tr>}
            </tbody>
          </table>
          <small className="muted">Profit is the kit's price less what its medicines cost when it was sold.</small>
        </div>
      )}
      {pick && (
        <Modal title={<><Sparkles size={18} /> Start from a ready-made kit</>} onClose={() => setPick(false)}>
          <p className="muted">Each line is matched to your own medicines by name; check them before saving.</p>
          <div className="stack">
            {KIT_TEMPLATES.map((t) => (
              <button key={t.key} className="product kit-tile" style={{ '--kit': t.color }} onClick={() => fromTemplate(t)}>
                <span className="kit-tile-head"><KitIcon icon={t.icon} color={t.color} size={16} /><strong>{t.name}</strong><span className="kit-badge">KIT</span></span>
                <small className="muted">{t.items.map((x) => `${x.qty} × ${x.find[0]}`).join(' · ')}</small>
              </button>
            ))}
          </div>
        </Modal>
      )}
      {editing && <KitEditor draft={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function KitEditor({ draft, onClose }) {
  const { db, products, fmt, update, user, branchId, batchesOf } = useStore();
  const [f, setF] = useState(draft);
  const set = (patch) => setF((x) => ({ ...x, ...patch }));
  const setItem = (key, patch) => setF((x) => ({ ...x, items: x.items.map((i) => (i.key === key ? { ...i, ...patch } : i)) }));
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const rec = (x) => ({ kit: { items: x.items.map(({ key: _k, looking: _l, ...i }) => (i.service ? { service: true, name: String(i.name || '').trim(), price: Number(i.price) || 0, cost: Number(i.cost) || 0 } : { productId: i.productId, qty: Number(i.qty) || 0 })),
    icon: x.icon, color: x.color, warning: x.warning.trim(), ack: !!x.ack && !!x.warning.trim(), price: Number(x.price) || 0, wholesale: Number(x.wholesale) || 0 } });
  const sellable = (pid) => batchesOf(pid).reduce((a, b) => a + (b.qty > 0 ? b.qty : 0), 0);
  const v = kitView({ id: f.id || 'new', name: f.name, ...rec(f) }, byId, { stockOf: sellable });

  const save = async (e) => {
    e.preventDefault();
    const name = f.name.trim();
    if (!name) return toast('Give the kit a name', 'warn');
    const stock = f.items.filter((i) => !i.service);
    if (stock.some((i) => !i.productId)) return toast('Choose the medicine on every line, or remove the empty lines', 'warn');
    if (stock.some((i) => !(Number(i.qty) > 0))) return toast('Every medicine needs a quantity of at least 1', 'warn');
    if (f.items.some((i) => i.service && !String(i.name || '').trim())) return toast('Name every service line (e.g. Testing fee)', 'warn');
    if (!stock.length && !f.items.some((i) => i.service)) return toast('A kit needs at least one medicine', 'warn');
    if (new Set(stock.map((i) => i.productId)).size < stock.length) return toast('A medicine is on two lines: put the whole quantity on one line', 'warn');
    if (db.products.some((p) => p.id !== f.id && p.name.trim().toLowerCase() === name.toLowerCase())) return toast(`There is already a medicine or kit called ${name}`, 'warn');
    if (f.barcode && db.products.some((p) => p.id !== f.id && p.barcode === f.barcode.trim())) return toast(`The barcode ${f.barcode} is already used`, 'warn');
    if (v.price < v.cost && !(await ask({ title: 'Below cost', message: `The kit's price ${fmt(v.price)} is less than what its medicines cost (${fmt(v.cost)}). Save it anyway?`, confirmText: 'Save' }))) return;
    const id = f.id || uid();
    const old = db.products.find((p) => p.id === id);
    const barcode = f.barcode.trim() || old?.barcode || newInternalBarcode(new Set(db.products.map((p) => p.barcode)));
    await update((d) => {
      const cur = d.products.find((p) => p.id === id) || {};
      // price, cost and wholesale are kept on the record too (as worked out now) for anything that reads a product plainly
      put(d, 'products', { ...cur, id, name, ...rec(f), active: f.active, barcode, form: 'Kit', unit: 'Kit', generic: v.generic, price: v.price, wholesale: v.wholesale, cost: v.cost, reorder: 0, rx: v.rx, ...(cur.createdAt ? {} : { createdAt: now() }) });
      audit(d, user, old ? 'Kit changed' : 'Kit created', `${name}: ${[...v.components.map((c) => `${c.qty} × ${c.name}`), ...v.services.map((s) => s.name)].join(', ')} · price ${fmt(v.price)}${f.price ? ' (fixed)' : ''}`, branchId);
    });
    toast(`${name} saved`);
    onClose();
  };

  return (
    <Modal title={f.id ? `Edit kit ${draft.name}` : 'New kit'} onClose={onClose} wide>
      <form onSubmit={save} className="stack" style={{ '--kit': f.color }}>
        <div className="form-grid">
          <label className="field"><span>Kit name</span><input autoFocus value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. HIV Test Kit" required /></label>
          <label className="field"><span>Barcode (blank = made for you)</span><input value={f.barcode} onChange={(e) => set({ barcode: e.target.value })} /></label>
        </div>
        <div className="form-grid">
          <div className="field"><span>Icon</span><div className="kit-icons" role="group" aria-label="Icon">{KIT_ICONS.map((ic) => <button key={ic} type="button" aria-pressed={f.icon === ic} aria-label={ic.replace('-', ' ')} title={ic.replace('-', ' ')} onClick={() => set({ icon: ic })}><KitGlyph icon={ic} size={18} /></button>)}</div></div>
          <div className="field"><span>Colour</span><div className="kit-swatches" role="group" aria-label="Colour">{KIT_COLORS.map((c) => <button key={c} type="button" className="kit-swatch" style={{ '--kit': c }} aria-pressed={f.color === c} aria-label={`Colour ${c}`} onClick={() => set({ color: c })} />)}</div></div>
        </div>
        <table className="lines kit-items">
          <thead><tr><th>In the kit</th><th className="num">Qty / price</th><th className="num">In stock</th><th className="num">Cost</th><th /></tr></thead>
          <tbody>
            {f.items.map((i) => {
              const p = byId.get(i.productId);
              return i.service ? (
                <tr key={i.key}>
                  <td><span className="row gap"><Wrench size={14} aria-hidden="true" /><input value={i.name || ''} placeholder="Service, e.g. Testing fee" aria-label="Service name" onChange={(e) => setItem(i.key, { name: e.target.value })} /></span></td>
                  <td><input type="number" min="0" step="any" value={i.price ?? ''} placeholder="Price" aria-label="Service price" onChange={(e) => setItem(i.key, { price: e.target.value })} /></td>
                  <td className="num muted">service</td>
                  <td><input type="number" min="0" step="any" value={i.cost ?? ''} placeholder="Cost (optional)" aria-label="Service cost" onChange={(e) => setItem(i.key, { cost: e.target.value })} /></td>
                  <td><button type="button" className="icon-btn" aria-label="Remove line" onClick={() => setF((x) => ({ ...x, items: x.items.filter((y) => y.key !== i.key) }))}><Trash2 size={15} /></button></td>
                </tr>
              ) : (
                <tr key={i.key}>
                  <td><MedicinePicker products={products} value={i.productId} onPick={(id) => setItem(i.key, { productId: id, looking: undefined })} placeholder={i.looking ? `Choose: ${i.looking}` : 'Search medicine…'} />
                    {i.looking && !i.productId && <small className="text-warn">Not found: “{i.looking}”</small>}</td>
                  <td><input type="number" min="1" step="1" value={i.qty} aria-label="Quantity per kit" onChange={(e) => setItem(i.key, { qty: e.target.value })} /></td>
                  <td className="num">{p ? sellable(p.id) : '—'}</td>
                  <td className="num">{p ? fmt((p.cost || 0) * (Number(i.qty) || 0)) : '—'}</td>
                  <td><button type="button" className="icon-btn" aria-label="Remove line" onClick={() => setF((x) => ({ ...x, items: x.items.filter((y) => y.key !== i.key) }))}><Trash2 size={15} /></button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="row gap">
          <button type="button" className="btn sm ghost" onClick={() => setF((x) => ({ ...x, items: [...x.items, { key: uid(), productId: '', qty: 1 }] }))}><Plus size={14} />Add a medicine</button>
          <button type="button" className="btn sm ghost" onClick={() => setF((x) => ({ ...x, items: [...x.items, { key: uid(), service: true, name: '', price: '', cost: '' }] }))}><Wrench size={14} />Add a service (not stock)</button>
        </div>
        <div className="kit-figures">
          <div><small className="muted">Can make now</small><b>{v.canMake == null ? 'any' : v.canMake}</b></div>
          <div><small className="muted">Cost (live)</small><b>{fmt(v.cost)}</b></div>
          <div><small className="muted">Retail prices added up</small><b>{fmt(v.listPrice)}</b></div>
          <div><small className="muted">Margin</small><b className={v.margin < 0 ? 'text-danger' : ''}>{v.margin == null ? '—' : v.margin + '%'}</b></div>
        </div>
        <div className="form-grid">
          <label className="field"><span>Kit price (blank = the prices added up, kept up to date)</span><input type="number" min="0" step="any" value={f.price} placeholder={String(v.listPrice)} onChange={(e) => set({ price: e.target.value })} /></label>
          <label className="field"><span>Wholesale price (blank = as retail)</span><input type="number" min="0" step="any" value={f.wholesale} onChange={(e) => set({ wholesale: e.target.value })} /></label>
        </div>
        <label className="field"><span>Warning shown at the till (optional)</span><textarea rows={2} value={f.warning} onChange={(e) => set({ warning: e.target.value })} placeholder="e.g. Pre-test counselling first; give the result in private" /></label>
        <label className="field check"><input type="checkbox" checked={f.ack} disabled={!f.warning.trim()} onChange={(e) => set({ ack: e.target.checked })} /><span>The cashier must tick that the client was told before charging (written to the audit log)</span></label>
        <label className="field check"><input type="checkbox" checked={f.active} onChange={(e) => set({ active: e.target.checked })} /><span>Sold at the till</span></label>
        {(v.rx || v.controlled) && <p className="small"><AlertTriangle size={13} aria-hidden="true" /> Holds {v.controlled ? 'a controlled drug: the register is filled in at the till' : 'a prescription-only medicine: the till asks for the prescription'}.</p>}
        <div className="form-actions"><button type="button" className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary">Save kit</button></div>
      </form>
    </Modal>
  );
}

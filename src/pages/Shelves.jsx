// Shelves (step 26, copied from the Flutter app's features/inventory/presentation/shelves_screen.dart): which medicines
// sit on which shelf, so they are quick to find when dispensing (the shelf shows on the till). Medicines are ticked
// one by one or a whole group at a time (a pharmacological class, a therapeutic area or a dosage form) and put on a
// shelf. It writes each medicine's "Shelf / location", the same field in both apps.
import { useMemo, useState } from 'react';
import { Archive, CheckCheck, Download } from 'lucide-react';
import { Modal, SearchBox, useProgressive } from '../ui.jsx';
import { useStore, putMany, audit, isUntouchedBase, downloadFile, toCSV } from '../store.jsx';
import { toast } from '../feedback.jsx';
import { searchProducts } from '../search.js';
import { drugClassOf, groupMedicines, shelfOf, UNCLASSIFIED } from '../drugclass.js';
import { formatQty } from '../money.js';
import { useMedicineOrder, MedicineOrderPicker, groupedRows, useFolded, GroupHeadingRow } from '../medgroups.jsx';

export default function Shelves() {
  const { products, update, user, branchId, can } = useStore();
  const edit = can('medicines.manage');
  const [q, setQ] = useState('');
  const [shelf, setShelf] = useState('');
  const [all, setAll] = useState(false);
  const [picked, setPicked] = useState(() => new Set());
  const [folded, toggleFold] = useFolded();
  const [order, setOrder] = useMedicineOrder();
  const [ask, setAsk] = useState(null); // { ps, what }
  const [name, setName] = useState('');
  const by = order === 'name' ? 'shelf' : order;

  // the pharmacy's own medicines and any with stock (the standard catalogue's 9,000+ others only when asked)
  const mine = useMemo(() => products.filter((p) => all || !isUntouchedBase(p) || p.stock > 0 || shelfOf(p)), [products, all]);
  const shelves = useMemo(() => { const m = new Map(); for (const p of mine) { const s = shelfOf(p); if (s) m.set(s, (m.get(s) || 0) + 1); } return m; }, [mine]);
  const names = [...shelves.keys()].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  const unshelved = mine.filter((p) => !shelfOf(p)).length;
  let list = q.trim() ? searchProducts(mine, q) : mine;
  if (shelf === '-') list = list.filter((p) => !shelfOf(p)); else if (shelf) list = list.filter((p) => shelfOf(p) === shelf);
  const drawn = useProgressive(Math.min(list.length, 1500));
  const rows = groupedRows(list.slice(0, drawn), by, folded);
  const tickedList = list.filter((p) => picked.has(p.id));

  const save = async (ps, to, what = '') => {
    const s = to.trim();
    const change = ps.filter((p) => shelfOf(p) !== s);
    if (!change.length) { setPicked(new Set()); return; }
    await update((d) => {
      const byId = new Map(d.products.map((x) => [x.id, x]));
      putMany(d, 'products', change.map((p) => ({ ...(byId.get(p.id) || p), shelf: s })));
      const who = what || (change.length <= 5 ? change.map((p) => p.name).join(', ') : `${change.length} medicines`);
      audit(d, user, 'Shelf assigned', s ? `${who} → shelf ${s}` : `${who}: taken off their shelf`, branchId);
    });
    setPicked(new Set());
    toast(s ? `${change.length} put on shelf ${s}` : `${change.length} taken off their shelf`);
  };
  const exportList = () => downloadFile('shelves.csv', toCSV(groupMedicines(list, 'shelf').flatMap(([g, ps]) => ps.map((p) => ({ shelf: g, medicine: p.name, generic: p.generic || '', form: p.form || '', class: drugClassOf(p).cls, inStock: p.stock })))), 'text/csv');

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Shelves</h1><div className="sub">{names.length} shelves · {unshelved} medicines without a shelf · the shelf shows on the till to find a medicine fast</div></div>
        <div className="row gap">
          <SearchBox value={q} onChange={setQ} placeholder="Medicine, generic, barcode…" />
          <button className="btn ghost" onClick={exportList}><Download size={16} />CSV</button>
        </div>
      </div>
      <div className="row gap wrap chips">
        <button type="button" className={'chip' + (!shelf ? ' active' : '')} onClick={() => setShelf('')}>All ({mine.length})</button>
        <button type="button" className={'chip' + (shelf === '-' ? ' active' : '')} onClick={() => setShelf('-')}>No shelf ({unshelved})</button>
        {names.map((s) => <button type="button" key={s} className={'chip' + (shelf === s ? ' active' : '')} onClick={() => setShelf(s)}><Archive size={13} /> {s} ({shelves.get(s)})</button>)}
        <MedicineOrderPicker value={order} onChange={setOrder} />
        <label className="field check inline"><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /><span>Include the whole catalogue</span></label>
      </div>
      {edit && (tickedList.length ? (
        <div className="bulk-bar" role="region" aria-label="Ticked medicines">
          <strong>{tickedList.length} ticked</strong>
          <button className="btn sm primary" onClick={() => { setName(''); setAsk({ ps: tickedList }); }}><Archive size={14} />Put on a shelf…</button>
          <button className="btn sm" onClick={() => save(tickedList, '')}>Take off the shelf</button>
          <button className="btn sm ghost" onClick={() => setPicked(new Set())}>Untick all</button>
        </div>
      ) : <p className="muted small">Tick medicines, or use the shelf button on a group, to put them on a shelf.</p>)}
      <div className="card table-wrap">
        <table>
          <thead><tr>{edit && <th className="tick" />}<th>Medicine</th><th>Form · class · area</th><th>Shelf</th><th className="num">In stock</th></tr></thead>
          <tbody>
            {rows.map((r) => r.heading !== undefined ? (
              <GroupHeadingRow key={'g:' + r.heading} row={r} colSpan={edit ? 5 : 4} onToggle={() => toggleFold(r.heading)}>
                {edit && <span className="row gap">
                  <button type="button" className="btn sm ghost" title={`Tick all in ${r.heading}`} onClick={() => setPicked((s) => new Set([...s, ...r.members.map((p) => p.id)]))}><CheckCheck size={14} />Tick all</button>
                  {by !== 'shelf' && <button type="button" className="btn sm" title={`Put all of ${r.heading} on a shelf`} onClick={() => { setName(''); setAsk({ ps: r.members, what: r.heading }); }}><Archive size={14} />Shelf all</button>}
                </span>}
              </GroupHeadingRow>
            ) : (() => {
              const p = r.p, c = drugClassOf(p), sh = shelfOf(p);
              return (
                <tr key={p.id} className={picked.has(p.id) ? 'row-ticked' : ''}>
                  {edit && <td className="tick"><input type="checkbox" aria-label={`Tick ${p.name}`} checked={picked.has(p.id)} onChange={(e) => setPicked((s) => { const n = new Set(s); e.target.checked ? n.add(p.id) : n.delete(p.id); return n; })} /></td>}
                  <td>{p.name}</td>
                  <td className="muted">{[p.form, c.cls !== UNCLASSIFIED && c.cls, c.area].filter(Boolean).join(' · ')}</td>
                  <td>{sh ? <span className="badge"><Archive size={11} /> {sh}</span> : <span className="muted">—</span>}</td>
                  <td className="num">{formatQty(p.stock)}</td>
                </tr>
              );
            })())}
            {!rows.length && <tr><td colSpan={5} className="empty">No medicines here</td></tr>}
          </tbody>
        </table>
      </div>
      {ask && (
        <Modal title={`Put ${ask.what ? `all of ${ask.what}` : `${ask.ps.length} medicine${ask.ps.length === 1 ? '' : 's'}`} on a shelf`} onClose={() => setAsk(null)}>
          <label className="field"><span>Shelf</span><input autoFocus aria-label="Shelf" value={name} placeholder="e.g. A1, Fridge, Antibiotics bay" onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) { e.preventDefault(); save(ask.ps, name, ask.what); setAsk(null); } }} /></label>
          {names.length > 0 && <><p className="muted small">Or one already in use:</p><div className="row gap wrap">{names.map((n) => <button type="button" key={n} className="chip" onClick={() => { save(ask.ps, n, ask.what); setAsk(null); }}>{n}</button>)}</div></>}
          <div className="form-actions"><button className="btn" onClick={() => setAsk(null)}>Cancel</button><button className="btn primary" disabled={!name.trim()} onClick={() => { save(ask.ps, name, ask.what); setAsk(null); }}>Put on shelf</button></div>
        </Modal>
      )}
    </div>
  );
}

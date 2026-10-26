// The Drafts tab of Sales History (held sales) and Purchase History (unfinished deliveries), 1.7 (src/drafts.js).
// Everyone sees their own; supervisors can switch to every open draft at the branch, see who started it and how long
// ago, and take it over or discard it (a discard asks first and goes in the audit log).
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, Eye, Trash2, PauseCircle, PackageOpen } from 'lucide-react';
import { useStore, del, audit } from '../store.jsx';
import { Modal } from '../ui.jsx';
import { ask, toast } from '../feedback.jsx';
import { draftsFor, seesAllDrafts, ageText, isOld, isMine } from '../drafts.js';

export function useDraftCount(kind) {
  const { db, user, branchId } = useStore();
  return draftsFor(db, { user, branchId, kind, all: seesAllDrafts(user) }).length;
}

export default function DraftsList({ kind }) {
  const { db, user, branchId, fmt, update } = useStore();
  const navigate = useNavigate();
  const [all, setAll] = useState(seesAllDrafts(user));
  const [view, setView] = useState(null);
  const list = draftsFor(db, { user, branchId, kind, all });
  const Icon = kind === 'sale' ? PauseCircle : PackageOpen;
  const lines = (d) => (kind === 'sale' ? d.data.cart || [] : d.data.lines || []);
  const lineName = (l) => l.name || db.products.find((p) => p.id === l.productId)?.name || '—';

  const carryOn = (d) => (kind === 'sale' ? navigate('/pos', { state: { resumeDraft: d.id } }) : navigate('/add-stock', { state: { draftId: d.id } }));
  const discard = async (d) => {
    if (!(await ask({ title: `Discard this ${kind === 'sale' ? 'held sale' : 'delivery draft'}?`, message: `${d.title} · ${d.count} item(s) · ${fmt(d.total)}${isMine(d, user) ? '' : ` · started by ${d.userName}`}. Nothing in stock changes.`, confirmText: 'Discard', danger: true }))) return;
    try {
      await update((x) => { del(x, 'drafts', d.id); audit(x, user, 'Draft discarded', `${kind === 'sale' ? 'Held sale' : 'Delivery'} "${d.title}" (${d.count} items, ${fmt(d.total)}) started by ${d.userName} ${ageText(d)}`, branchId); });
      toast('Draft discarded');
    } catch (e) { toast(e.message, 'error'); }
  };

  return (
    <div>
      {seesAllDrafts(user) && (
        <div className="seg" role="radiogroup" aria-label="Whose drafts" style={{ marginBottom: 12 }}>
          <button role="radio" aria-checked={!all} className={!all ? 'on' : ''} onClick={() => setAll(false)}>Mine</button>
          <button role="radio" aria-checked={all} className={all ? 'on' : ''} onClick={() => setAll(true)}>Everyone at this branch</button>
        </div>
      )}
      {!list.length && <div className="card empty-card"><p className="muted">{kind === 'sale' ? 'No held sales. Put a sale on hold at the till (Alt+H) to serve the next customer; it waits here.' : 'No delivery drafts. In Add Stock, "Save as draft" keeps a delivery to finish later or on another device.'}</p></div>}
      <div className="draft-grid">
        {list.map((d) => (
          <div key={d.id} className={'draft-card' + (isOld(d) ? ' old' : '')}>
            <div className="row between"><strong><Icon size={15} /> {d.title}</strong><strong className="num">{fmt(d.total)}</strong></div>
            <div className="muted small">{d.count} item{d.count === 1 ? '' : 's'}{d.invoice ? ` · invoice ${d.invoice}` : ''} · {isMine(d, user) ? 'started by you' : `started by ${d.userName}`} · <span className={isOld(d) ? 'text-danger' : ''}>{ageText(d)}</span>{kind === 'sale' && d.mode === 'wholesale' ? ' · wholesale' : ''}</div>
            <div className="row-acts" style={{ justifyContent: 'flex-start', marginTop: 10 }}>
              <button className="btn sm primary act-edit" onClick={() => carryOn(d)}><Play size={14} />{isMine(d, user) ? 'Continue' : 'Take over'}</button>
              <button className="btn sm ghost" onClick={() => setView(d)}><Eye size={14} />View</button>
              <button className="btn sm ghost act-danger" onClick={() => discard(d)}><Trash2 size={14} />Discard</button>
            </div>
          </div>
        ))}
      </div>
      {view && (
        <Modal title={view.title} onClose={() => setView(null)}>
          <p className="muted">{view.userName} · {ageText(view)} · {fmt(view.total)}</p>
          <table><thead><tr><th>Medicine</th><th className="num">Qty</th></tr></thead>
            <tbody>{lines(view).map((l, i) => <tr key={i}><td>{lineName(l)}</td><td className="num">{l.qty}</td></tr>)}</tbody></table>
          <div className="form-actions"><button className="btn primary" onClick={() => { carryOn(view); setView(null); }}><Play size={16} />{isMine(view, user) ? 'Continue' : 'Take over'}</button></div>
        </Modal>
      )}
    </div>
  );
}

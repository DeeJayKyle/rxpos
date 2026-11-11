// Insurers and their schemes (workplan step 22, src/insurance.js): what each scheme's patient pays at the till, what each
// insurer owes for the sales billed to it, and its payments. Same screen in Flutter: features/insurance.
import { useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Modal } from '../ui.jsx';
import { useStore, uid, put, audit } from '../store.jsx';
import { toast } from '../feedback.jsx';
import { insurerBalance, insurerShare } from '../insurance.js';
import { windowSums } from '../balances.js';
import { PaymentModal } from './Finance.jsx';

const blankScheme = () => ({ id: uid(), name: '', copayPct: 10, copayFixed: 0, limit: 0 });
const describe = (s, fmt) => [s.copayPct > 0 && `${s.copayPct}%`, s.copayFixed > 0 && `at least ${fmt(s.copayFixed)}`].filter(Boolean).join(', ') || 'no co-pay';

export default function Insurers() {
  const { db, update, user, fmt, can, branchId } = useStore();
  const [edit, setEdit] = useState(null);
  const [pay, setPay] = useState(null);
  const [show, setShow] = useState('');
  const insurers = useMemo(() => db.insurers || [], [db.insurers]);
  const rows = useMemo(() => insurers.map((i) => ({ ...i, owed: insurerBalance(db.sales, db.payments, i.id, windowSums(db)) })).sort((a, b) => (a.archived ? 1 : 0) - (b.archived ? 1 : 0) || b.owed - a.owed || String(a.name).localeCompare(b.name)), [insurers, db]);
  const billed = useMemo(() => db.sales.filter((s) => s.insurance && (!show || s.insurance.insurerId === show)).sort((a, b) => String(b.date).localeCompare(a.date)).slice(0, 200), [db.sales, show]);
  const editable = can('customers') || can('finance');

  const save = async () => {
    const name = edit.name.trim();
    if (!name) return toast('Give the insurer a name', 'warn');
    const schemes = edit.schemes.map((s) => ({ ...s, name: String(s.name || '').trim(), copayPct: Number(s.copayPct) || 0, copayFixed: Number(s.copayFixed) || 0, limit: Number(s.limit) || 0 })).filter((s) => s.name);
    if (!schemes.length) return toast('Add at least one scheme (e.g. "Gold" or "Corporate")', 'warn');
    if (schemes.some((s) => s.copayPct < 0 || s.copayPct > 100)) return toast('A co-pay is between 0 and 100%', 'warn');
    const { _new, ...rec } = edit;
    await update((d) => {
      put(d, 'insurers', { ...rec, name, schemes });
      audit(d, user, _new ? 'Insurer added' : 'Insurer changed', `${name}: ${schemes.map((s) => `${s.name} (${describe(s, fmt)}${s.limit > 0 ? `, cover up to ${fmt(s.limit)}` : ''})`).join('; ')}`, branchId);
    });
    setEdit(null);
    toast(`${name} saved`);
  };
  const setScheme = (id, patch) => setEdit((e) => ({ ...e, schemes: e.schemes.map((s) => (s.id === id ? { ...s, ...patch } : s)) }));

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Insurers</h1><div className="sub">Insurers and their schemes. At the till the patient pays the co-pay; the rest is owed by the insurer until it pays.</div></div>
        {editable && <button className="btn primary" onClick={() => setEdit({ _new: true, id: uid(), name: '', phone: '', email: '', schemes: [blankScheme()] })}><Plus size={16} />Add insurer</button>}
      </div>
      <div className="card table-wrap">
        <table>
          <thead><tr><th>Insurer</th><th>Schemes</th><th className="num">Owes</th><th /></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={r.archived ? 'muted' : ''}>
                <td><strong>{r.name}</strong>{r.archived && <small> · archived</small>}<br /><small className="muted">{[r.phone, r.email].filter(Boolean).join(' · ')}</small></td>
                <td>{(r.schemes || []).map((s) => <div key={s.id}>{s.name}: <span className="muted">{describe(s, fmt)}{s.limit > 0 ? ` · cover up to ${fmt(s.limit)}` : ''}</span></div>)}</td>
                <td className="num"><strong className={r.owed > 0.5 ? 'text-warn' : ''}>{fmt(r.owed)}</strong></td>
                <td className="actions">
                  <button className="btn sm" onClick={() => setShow(show === r.id ? '' : r.id)}>{show === r.id ? 'All sales' : 'Sales'}</button>
                  {editable && <button className="btn sm" onClick={() => setEdit({ ...r, schemes: (r.schemes || []).map((s) => ({ ...s })) })}>Edit</button>}
                  {r.owed > 0.5 && (can('finance') || can('customers')) && <button className="btn sm primary" onClick={() => setPay(r)}>Receive payment</button>}
                </td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={4} className="empty">No insurers yet. Add one to bill insured clients at the till.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="card table-wrap">
        <h3 className="pad">Sales billed to {show ? insurers.find((i) => i.id === show)?.name : 'insurers'}</h3>
        <table>
          <thead><tr><th>Date</th><th>Receipt</th><th>Client</th><th>Scheme · member</th><th className="num">Patient paid</th><th className="num">Insurer</th></tr></thead>
          <tbody>
            {billed.map((s) => (
              <tr key={s.id} className={s.status === 'refunded' ? 'muted' : ''}>
                <td>{String(s.date).slice(0, 10)}</td><td>{s.number}{s.status === 'refunded' && <small> · refunded</small>}</td><td>{s.customerName}</td>
                <td>{s.insurance.insurer} · {s.insurance.scheme} · {s.insurance.memberNo}</td>
                <td className="num">{fmt(s.paid ?? 0)}</td><td className="num">{fmt(insurerShare(s))}</td>
              </tr>
            ))}
            {!billed.length && <tr><td colSpan={6} className="empty">No insured sales yet</td></tr>}
          </tbody>
        </table>
      </div>
      {pay && <PaymentModal title={`Payment from ${pay.name}`} kind="insurer" partyId={pay.id} max={pay.owed} onClose={() => setPay(null)} />}
      {edit && (
        <Modal title={edit._new ? 'Add insurer' : `Edit ${edit.name}`} onClose={() => setEdit(null)} wide>
          <div className="form-grid">
            <label className="field"><span>Name <b className="text-danger">*</b></span><input autoFocus aria-label="Insurer name" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="e.g. Jubilee Health" /></label>
            <label className="field"><span>Phone</span><input value={edit.phone || ''} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} /></label>
            <label className="field"><span>Email (for claims)</span><input type="email" value={edit.email || ''} onChange={(e) => setEdit({ ...edit, email: e.target.value })} /></label>
            {!edit._new && <label className="field check"><input type="checkbox" checked={!!edit.archived} onChange={(e) => setEdit({ ...edit, archived: e.target.checked })} /><span>Archived (not offered at the till)</span></label>}
          </div>
          <h4>Schemes</h4>
          <p className="muted">The patient pays the co-pay (the percentage, or the fixed amount if that is more). Above the cover limit per sale, the patient pays the rest. 0 = no limit.</p>
          <div className="table-wrap"><table>
            <thead><tr><th>Scheme</th><th>Co-pay %</th><th>Fixed co-pay</th><th>Cover limit per sale</th><th /></tr></thead>
            <tbody>
              {edit.schemes.map((s) => (
                <tr key={s.id}>
                  <td><input aria-label="Scheme name" value={s.name} onChange={(e) => setScheme(s.id, { name: e.target.value })} placeholder="e.g. Gold" /></td>
                  <td><input aria-label="Co-pay %" type="number" min="0" max="100" step="any" value={s.copayPct} onChange={(e) => setScheme(s.id, { copayPct: e.target.value })} /></td>
                  <td><input aria-label="Fixed co-pay" type="number" min="0" step="any" value={s.copayFixed} onChange={(e) => setScheme(s.id, { copayFixed: e.target.value })} /></td>
                  <td><input aria-label="Cover limit" type="number" min="0" step="any" value={s.limit} onChange={(e) => setScheme(s.id, { limit: e.target.value })} /></td>
                  <td><button className="icon-btn" aria-label="Remove scheme" onClick={() => setEdit({ ...edit, schemes: edit.schemes.filter((x) => x.id !== s.id) })}><Trash2 size={16} /></button></td>
                </tr>
              ))}
            </tbody>
          </table></div>
          <button className="btn sm" onClick={() => setEdit({ ...edit, schemes: [...edit.schemes, blankScheme()] })}><Plus size={14} />Add scheme</button>
          <div className="form-actions">
            <button className="btn" onClick={() => setEdit(null)}>Cancel</button>
            <button className="btn primary" onClick={save}>Save</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

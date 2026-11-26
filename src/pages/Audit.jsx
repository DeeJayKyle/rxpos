import { DateRange } from '../forms.jsx';
import { useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { auditSentence, auditKind, AUDIT_KINDS } from '../auditText.js';
import { Download, ShieldCheck } from 'lucide-react';
import { useStore, dayOf, downloadFile, toCSV, MAIN_BRANCH } from '../store.jsx';
import { SearchBox, Empty } from '../ui.jsx';
import { useLoadMore } from '../tablekit.jsx';
import { dateLocale } from '../showdate.js';

/** Who did what, when and where. Entries sync from every device and cannot be edited in the app. */
export default function Audit() {
  const { db } = useStore();
  const location = useLocation();
  const [q, setQ] = useState(location.state?.q || ''); // F5: "Edited by …" on a record opens its entries
  const [kind, setKind] = useState('');
  const [who, setWho] = useState('');
  const [action, setAction] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const users = useMemo(() => [...new Set(db.audit.map((a) => a.user).filter(Boolean))].sort(), [db.audit]);
  const actions = useMemo(() => [...new Set(db.audit.map((a) => a.action))].sort(), [db.audit]);
  const branch = (id) => db.branches.find((b) => b.id === (id || MAIN_BRANCH))?.name || '';
  const ql = q.toLowerCase();
  const rows = db.audit.filter((a) => (!who || a.user === who) && (!action || a.action === action) && (!kind || auditKind(a) === kind) && (!from || dayOf(a.date) >= from) && (!to || dayOf(a.date) <= to) &&
    (!q || `${a.user} ${a.action} ${a.details}`.toLowerCase().includes(ql)));
  // every entry, 100 at a time as the list scrolls (no longer cut at 1,000: the shared table, 2026-11-26)
  const more = useLoadMore(rows, { resetKey: [q, who, action, kind, from, to].join('|') });

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Audit Log</h1><div className="sub"><ShieldCheck size={14} /> Sign-ins, refunds, discounts, price changes, stock adjustments, write-offs, transfers and user changes</div></div>
        <div className="row gap">
          <select value={who} onChange={(e) => setWho(e.target.value)}><option value="">Everyone</option>{users.map((u) => <option key={u}>{u}</option>)}</select>
          <select value={action} onChange={(e) => setAction(e.target.value)}><option value="">All actions</option>{actions.map((a) => <option key={a}>{a}</option>)}</select>
          <DateRange from={from} to={to} onChange={(r) => { setFrom(r.from); setTo(r.to); }} />
          <SearchBox value={q} onChange={setQ} />
          <button className="btn ghost" onClick={() => downloadFile('audit-log.csv', toCSV(rows.map(({ date, user, action, details, branchId }) => ({ date, user, action, details, branch: branch(branchId) }))), 'text/csv')}><Download size={16} />CSV</button>
        </div>
      </div>
      {/* F6: chips by person and by kind of action; each entry as a sentence */}
      <div className="list-filters audit-chips">
        <div className="chips-row" role="group" aria-label="Person">
          <button type="button" className={'chip' + (!who ? ' active' : '')} onClick={() => setWho('')}>Everyone</button>
          {users.slice(0, 8).map((u) => <button key={u} type="button" className={'chip' + (who === u ? ' active' : '')} aria-pressed={who === u} onClick={() => setWho(who === u ? '' : u)}>{u}</button>)}
        </div>
        <div className="chips-row" role="group" aria-label="Kind of action">
          <button type="button" className={'chip' + (!kind ? ' active' : '')} onClick={() => setKind('')}>Everything</button>
          {AUDIT_KINDS.map(([k, l]) => <button key={k} type="button" className={'chip' + (kind === k ? ' active' : '')} aria-pressed={kind === k} onClick={() => setKind(kind === k ? '' : k)}>{l}</button>)}
        </div>
      </div>
      <div className="card audit-list">
        <ul>
          {more.rows.map((a) => (
            <li key={a.id} className={'audit-row kind-' + auditKind(a)}>
              <span className="audit-sentence">{auditSentence(a)}</span>
              <small className="muted"><span className="badge">{a.action}</span> {new Date(a.date).toLocaleString(dateLocale(), { dateStyle: 'medium', timeStyle: 'short' })}{db.branches.length > 1 && branch(a.branchId) ? ' · ' + branch(a.branchId) : ''}</small>
            </li>
          ))}
        </ul>
        {more.footer}
        {!rows.length && <Empty>Nothing recorded yet. Sign-ins, refunds, price changes and other changes are listed here as they happen.</Empty>}
      </div>
    </div>
  );
}

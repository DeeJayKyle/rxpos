import { useMemo, useState } from 'react';
import { Download, ShieldCheck } from 'lucide-react';
import { useStore, dayOf, downloadFile, toCSV, MAIN_BRANCH } from '../store.jsx';
import { SearchBox, Empty } from '../ui.jsx';

/** Who did what, when and where. Entries sync from every device and cannot be edited in the app. */
export default function Audit() {
  const { db } = useStore();
  const [q, setQ] = useState('');
  const [who, setWho] = useState('');
  const [action, setAction] = useState('');
  const [from, setFrom] = useState('');
  const users = useMemo(() => [...new Set(db.audit.map((a) => a.user).filter(Boolean))].sort(), [db.audit]);
  const actions = useMemo(() => [...new Set(db.audit.map((a) => a.action))].sort(), [db.audit]);
  const branch = (id) => db.branches.find((b) => b.id === (id || MAIN_BRANCH))?.name || '';
  const ql = q.toLowerCase();
  const rows = db.audit.filter((a) => (!who || a.user === who) && (!action || a.action === action) && (!from || dayOf(a.date) >= from) &&
    (!q || `${a.user} ${a.action} ${a.details}`.toLowerCase().includes(ql)));

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Audit Log</h1><div className="sub"><ShieldCheck size={14} /> Sign-ins, refunds, discounts, price changes, stock adjustments, write-offs, transfers and user changes</div></div>
        <div className="row gap">
          <select value={who} onChange={(e) => setWho(e.target.value)}><option value="">Everyone</option>{users.map((u) => <option key={u}>{u}</option>)}</select>
          <select value={action} onChange={(e) => setAction(e.target.value)}><option value="">All actions</option>{actions.map((a) => <option key={a}>{a}</option>)}</select>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} title="From date" />
          <SearchBox value={q} onChange={setQ} />
          <button className="btn ghost" onClick={() => downloadFile('audit-log.csv', toCSV(rows.map(({ date, user, action, details, branchId }) => ({ date, user, action, details, branch: branch(branchId) }))), 'text/csv')}><Download size={16} />CSV</button>
        </div>
      </div>
      <div className="card table-wrap">
        <table>
          <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Details</th>{db.branches.length > 1 && <th>Branch</th>}</tr></thead>
          <tbody>
            {rows.slice(0, 1000).map((a) => (
              <tr key={a.id}>
                <td className="nowrap">{new Date(a.date).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</td>
                <td>{a.user}</td><td><span className="badge">{a.action}</span></td><td>{a.details}</td>
                {db.branches.length > 1 && <td>{branch(a.branchId)}</td>}
              </tr>
            ))}
            {!rows.length && <Empty colSpan={5}>No activity recorded yet</Empty>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

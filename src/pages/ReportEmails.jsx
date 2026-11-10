// Scheduled report emails (Settings → Alerts & storage), copied from the Flutter app (step 26; its
// features/settings/presentation/report_schedules.dart, the same records): each schedule emails an Excel workbook at
// 9 pm every evening, on Sundays for the week, or on the last day of the month, built by the cloud (worker/reports.js).
// A schedule can be previewed or sent at once. Only people who manage settings change them (the cloud checks too).
import { useState } from 'react';
import { MailPlus, Plus } from 'lucide-react';
import { Modal } from '../ui.jsx';
import { useStore, uid, put, del, audit } from '../store.jsx';
import { toast, ask } from '../feedback.jsx';
import { reportSend } from '../cloud.js';

export const REPORT_KINDS = [['summary', 'Summary (sales, profit, expenses, net)'], ['sales', 'Every sale'], ['items', 'Sales by medicine'], ['expenses', 'Expenses'], ['stock', 'Expiring and low stock']];
export const REPORT_FREQUENCIES = [['daily', 'Every evening (that day)'], ['weekly', 'Sundays (the last 7 days)'], ['monthly', 'Last day of the month (the month)']];
const when = (f) => REPORT_FREQUENCIES.find(([k]) => k === f)?.[1] || f;

export default function ReportEmails() {
  const { db, update, user, branchId, syncCfg } = useStore();
  const [edit, setEdit] = useState(null);
  const [busy, setBusy] = useState('');
  const rows = [...(db.reportSchedules || [])].sort((a, b) => String(a.name).localeCompare(b.name));

  const save = async () => {
    const name = edit.name.trim(), emails = edit.emails.trim();
    if (!name) return toast('Give the report email a name', 'warn');
    if (!/\S+@\S+\.\S+/.test(emails)) return toast('Type at least one email address', 'warn');
    if (!edit.reports.length) return toast('Choose at least one report', 'warn');
    const { _new, ...rec } = edit;
    await update((d) => {
      put(d, 'reportSchedules', { ...rec, name, emails, reports: REPORT_KINDS.map(([k]) => k).filter((k) => edit.reports.includes(k)) });
      audit(d, user, _new ? 'Report email added' : 'Report email changed', `${name}: ${edit.frequency} to ${emails}`, branchId);
    });
    setEdit(null);
    toast(`${name} saved`);
  };
  const remove = async (s) => {
    if (!(await ask({ title: `Remove ${s.name}?`, message: 'No more emails are sent for it.', confirmText: 'Remove', danger: true }))) return;
    await update((d) => { del(d, 'reportSchedules', s.id); audit(d, user, 'Report email removed', s.name, branchId); });
    setEdit(null);
  };
  // the schedule must have reached the cloud first (it syncs within seconds)
  const send = async (s, now) => {
    if (!syncCfg?.url) return toast('Connect this device to the cloud first (the cloud builds and sends the reports)', 'warn');
    setBusy(s.id);
    try {
      const r = await reportSend(syncCfg, s.id, now);
      const sheets = (r.sheets || []).map((x) => `${x.name} (${x.rows})`).join(', ');
      if (now) toast(r.sent > 0 ? `${r.file} emailed to ${r.sent} address${r.sent > 1 ? 'es' : ''}` : r.error || 'Not sent', r.sent > 0 ? 'ok' : 'warn');
      else toast(`${r.period}: ${sheets} → ${(r.to || []).join(', ')}`);
    } catch (e) { toast(String(e.message || e), 'error'); } finally { setBusy(''); }
  };

  return (
    <section className="card" id="report-emails">
      <div className="row between"><h3><MailPlus size={18} />Scheduled report emails (Excel)</h3>
        <button type="button" className="btn sm" onClick={() => setEdit({ _new: true, id: uid(), name: '', emails: '', frequency: 'weekly', reports: REPORT_KINDS.map(([k]) => k), active: true })}><Plus size={14} />Add</button></div>
      <p className="muted small">An Excel workbook by email, at 9 pm: every evening, every Sunday for the week, or on the last day of the month for the month.</p>
      <table className="keys-table"><tbody>
        {rows.map((s) => (
          <tr key={s.id}>
            <td><button type="button" className="link-btn" onClick={() => setEdit({ ...s, reports: s.reports || [] })}><strong>{s.name}</strong></button>{s.active === false && <span className="muted"> (paused)</span>}<br /><small className="muted">{when(s.frequency)} → {s.emails}</small></td>
            <td className="actions">
              <button type="button" className="btn sm ghost" disabled={!!busy} onClick={() => send(s, false)}>Preview</button>
              <button type="button" className="btn sm" disabled={!!busy} onClick={() => send(s, true)}>{busy === s.id ? 'Sending…' : 'Send now'}</button>
            </td>
          </tr>
        ))}
        {!rows.length && <tr><td className="empty">No report emails yet.</td></tr>}
      </tbody></table>
      {edit && (
        <Modal title={edit._new ? 'New report email' : `Edit ${edit.name}`} onClose={() => setEdit(null)}>
          <div className="form-grid">
            <label className="field"><span>Name <b className="text-danger">*</b></span><input autoFocus aria-label="Report name" value={edit.name} placeholder="Weekly report" onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></label>
            <label className="field"><span>Email it to (separated by commas) <b className="text-danger">*</b></span><input aria-label="Email it to" value={edit.emails} placeholder="owner@example.com, accountant@example.com" onChange={(e) => setEdit({ ...edit, emails: e.target.value })} /></label>
            <label className="field"><span>When</span><select aria-label="When" value={edit.frequency} onChange={(e) => setEdit({ ...edit, frequency: e.target.value })}>{REPORT_FREQUENCIES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
          </div>
          {REPORT_KINDS.map(([k, l]) => <label key={k} className="field check"><input type="checkbox" checked={edit.reports.includes(k)} onChange={(e) => setEdit({ ...edit, reports: e.target.checked ? [...edit.reports, k] : edit.reports.filter((x) => x !== k) })} /><span>{l}</span></label>)}
          <label className="field check"><input type="checkbox" checked={edit.active !== false} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} /><span>Send it</span></label>
          <div className="form-actions">
            {!edit._new && <button type="button" className="btn danger" onClick={() => remove(edit)}>Remove</button>}
            <button type="button" className="btn" onClick={() => setEdit(null)}>Cancel</button>
            <button type="button" className="btn primary" onClick={save}>Save</button>
          </div>
        </Modal>
      )}
    </section>
  );
}

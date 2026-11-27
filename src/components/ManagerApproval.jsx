// A manager's approval on this device (safer refunds 2026-11-18; stock review 27 Nov 2026): over a limit, someone who
// isn't a manager needs a manager's PIN or password, checked as at sign-in (this device first, then the cloud). The
// approver's name is kept on the record and in the audit log.
import { useCallback, useState } from 'react';
import { useStore } from '../store.jsx';
import { hasPin, verifyPin, verifyOffline } from '../offline.js';
import { cloudLogin, cloudLogout } from '../cloud.js';
import { isApprover, STOCK_REASONS } from '../stockcontrol.js';

/** → (limit) => null (no approval needed: no limit, or a manager is signed in) | { limit, approvers, verify(id, secret) } */
export function useManagerApproval() {
  const { db, user, syncCfg } = useStore();
  return useCallback((limit) => {
    if (!(Number(limit) > 0) || isApprover(user)) return null;
    const approvers = db.users.filter((u) => isApprover(u) && u.id !== user.id && u.active !== false).map((u) => ({ id: u.id, name: u.name }));
    return { limit: Number(limit), approvers, verify: async (id, secret) => {
      if (hasPin(syncCfg.tenant, id) && /^\d{4,8}$/.test(secret) && (await verifyPin(syncCfg.tenant, id, secret)).ok) return true;
      if (await verifyOffline(syncCfg.tenant, id, secret).catch(() => false)) return true;
      const email = db.users.find((u) => u.id === id)?.email;
      if (!email || !syncCfg.url || !navigator.onLine) return false;
      try { const r = await cloudLogin(syncCfg.url, email, secret, syncCfg.tenant); cloudLogout({ url: syncCfg.url, key: r.token }).catch(() => {}); return !!r.token; } catch { return false; }
    } };
  }, [db.users, user, syncCfg]);
}

/**
 * The approval fields, and check(): → the approver's name, or null (with the reason shown) when it isn't approved.
 * Use: const ap = useApprovalBox(approval); … {ap.needed && ap.fields(legend)} … const by = await ap.check(); if (ap.needed && !by) return;
 */
export function useApprovalBox(approval, needed) {
  const [approver, setApprover] = useState('');
  const [secret, setSecret] = useState('');
  const [err, setErr] = useState('');
  const on = !!approval && !!needed;
  const check = async () => {
    if (!on) return null;
    const a = approval.approvers.find((x) => x.id === approver);
    if (!a || !secret) { setErr('Choose the manager and enter their PIN or password.'); return null; }
    if (!(await approval.verify(a.id, secret).catch(() => false))) { setErr(`That PIN or password is not right for ${a.name}.`); setSecret(''); return null; }
    return a.name;
  };
  const fields = (legend) => (
    <fieldset className="refund-approve">
      <legend>{legend}</legend>
      {approval.approvers.length ? <>
        <label className="field"><span>Manager</span>
          <select value={approver} onChange={(e) => { setApprover(e.target.value); setErr(''); }} required>
            <option value="">Choose…</option>
            {approval.approvers.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select></label>
        <label className="field"><span>Their PIN or password</span>
          <input type="password" autoComplete="off" value={secret} onChange={(e) => { setSecret(e.target.value); setErr(''); }} required /></label>
      </> : <p className="small">This pharmacy has no other manager to approve it. Ask a manager to make this change.</p>}
      {err && <p className="small text-danger" role="alert">{err}</p>}
    </fieldset>
  );
  return { needed: on, blocked: on && !approval.approvers.length, check, fields };
}

/** Why stock was changed by hand: a reason from the list (src/stockcontrol.js), and a note ("Other" needs one) */
export function ReasonFields({ reason, note, onChange, codes = STOCK_REASONS }) {
  return (
    <div className="form-grid">
      <label className="field"><span>Why?</span>
        <select value={reason || ''} onChange={(e) => onChange({ reason: e.target.value })} required>
          <option value="">Choose a reason…</option>
          {codes.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
        </select></label>
      <label className="field"><span>{reason === 'other' ? 'Say why' : 'Note (optional)'}</span>
        <input value={note || ''} maxLength={200} onChange={(e) => onChange({ note: e.target.value })} required={reason === 'other'} placeholder={reason === 'damaged' ? 'e.g. bottle broken on the shelf' : ''} /></label>
    </div>
  );
}

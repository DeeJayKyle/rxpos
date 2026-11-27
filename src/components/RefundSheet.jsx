// The refund sheet (UX review, Nov 2026): before a refund, one sheet shows exactly what happens. It lists each line
// and the batch its stock goes back to (a kit: each of its medicines), how much money goes back and how (cash from the
// drawer, Mobile Money sent by hand, a debt cancelled, the insurer's share), whether the sale is in a closed day, and
// it asks why (kept on the sale and in the audit log). It replaced a one-line "Refund R123?" question.
// Nov 2026: it also returns PART of a sale: a quantity per line (whole packs and kits), money worked out by src/returns.js.
import { useState } from 'react';
import { Undo2, AlertTriangle, PackageCheck } from 'lucide-react';
import { Modal } from '../ui.jsx';
import { stockParts } from '../kits.js';
import { returnable, planReturn } from '../returns.js';
import { dateLocale } from '../showdate.js';

export const REFUND_REASONS = ['Customer returned it', 'Wrong medicine or strength', 'Wrong price or quantity', 'Side effect or reaction', 'Sold twice by mistake', 'Other'];

const num = (v) => Number(v) || 0;
/** What goes back to the customer, what debt is cancelled, what the insurer is no longer billed */
export function refundMoney(sale) {
  const insurer = sale.insurance ? Math.max(0, num(sale.insurance.share)) : 0;
  const paid = num(sale.paid ?? sale.total);
  return { back: paid, insurer, unpaid: Math.max(0, num(sale.total) - paid - insurer) };
}

/** How the money goes back, in the cashier's words */
export function refundHow(sale, back, fmt) {
  if (back <= 0) return 'Nothing was paid, so no money goes back.';
  const p = String(sale.payment || 'Cash');
  if (/mobile|momo|airtel|mtn/i.test(p)) return `Send ${fmt(back)} back to the customer by Mobile Money. RxPOS records the refund; it does not send the money.`;
  if (/cash/i.test(p)) return `Give ${fmt(back)} back from the cash drawer.`;
  return `Pay ${fmt(back)} back the way it was paid (${p}).`;
}

/** How money goes back to several tenders (a split sale) */
export function howBack(tenders, fmt) {
  const parts = tenders.filter((t) => t.amount > 0).map((t) => `${fmt(t.amount)} ${/cash/i.test(t.type) ? 'in cash from the drawer' : `by ${t.method}`}`);
  return parts.length ? `Give back ${parts.join(' and ')}. RxPOS records it; money other than cash is paid back by hand.` : 'Nothing was paid, so no money goes back.';
}

/** Refunds above this need a manager's approval (Settings: refundApproveAbove; 0 turns it off) unless a manager refunds */
export const REFUND_APPROVE_ABOVE = 100000;
export { isApprover } from '../stockcontrol.js';

export default function RefundSheet({ sale, returns = [], decimals = 0, fmt, batches = [], closedDay = false, onCancel, onConfirm, approval = null }) {
  // approval: { limit, approvers: [{ id, name }], verify(userId, secret) → Promise<boolean> } when a manager must approve
  // a refund over the limit (asked only when this refund's money back is over it)
  const [approver, setApprover] = useState('');
  const [secret, setSecret] = useState('');
  const [approveErr, setApproveErr] = useState('');
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  // Nov 2026 audit item 6 (src/returns.js): how much of each line goes back, in whole packs / kits; all of it at first
  const open = returnable(sale, returns);
  const [take, setTake] = useState(() => Object.fromEntries(open.map((x) => [x.line, x.left / x.step])));
  const picks = open.map((x) => ({ line: x.line, qty: (Number(take[x.line]) || 0) * x.step })).filter((p) => p.qty > 0);
  // a sale with no lines left to pick (an old record without items) is refunded whole, as before
  const plan = !returns.length && !open.length ? { ok: true, full: true, items: [], tenders: [], total: num(sale.total), ...refundMoney(sale) } : planReturn(sale, returns, picks, decimals);
  const whole = !returns.length && plan.ok && plan.full; // everything, and nothing returned before: the whole sale is refunded
  const batchNo = (id) => (id ? batches.find((b) => b.id === id)?.batch || 'batch' : 'no batch');
  const { back, insurer, unpaid } = plan.ok ? plan : { back: 0, insurer: 0, unpaid: 0 };
  const needApproval = approval && back > approval.limit;
  const why = reason === 'Other' ? note.trim() : [reason, note.trim()].filter(Boolean).join(': ');
  const ready = plan.ok && reason && (reason !== 'Other' || note.trim());
  const go = async (e) => {
    e.preventDefault(); if (!ready || busy) return;
    setBusy(true);
    try {
      let by = null;
      if (needApproval) {
        const a = approval.approvers.find((x) => x.id === approver);
        if (!a || !secret) { setApproveErr('Choose the manager and enter their PIN or password.'); return; }
        if (!(await approval.verify(a.id, secret).catch(() => false))) { setApproveErr(`That PIN or password is not right for ${a.name}.`); setSecret(''); return; }
        by = a.name;
      }
      await onConfirm(why, by, whole ? null : picks);
    } finally { setBusy(false); }
  };
  const unitWord = (x) => (x.item.kit ? 'kit' : x.item.pack ? String(x.item.pack.name).toLowerCase() : '');
  const planned = new Map(plan.ok ? plan.items.map((i) => [i.line, i]) : []);
  return (
    <Modal title={`Refund ${sale.number}`} onClose={onCancel} wide>
      <form className="stack refund-sheet" onSubmit={go}>
        <div className="muted small">{new Date(sale.date).toLocaleString(dateLocale(), { dateStyle: 'medium', timeStyle: 'short' })} · {sale.customerName || 'Walk-in'} · sold by {sale.cashier || '—'}</div>
        {closedDay && <div className="notice warn" role="alert"><AlertTriangle size={16} /> This sale is in a closed day. The refund counts today, and the owner sees it among the sales to check.</div>}
        {returns.length > 0 && <div className="notice info-notice small">Returned before: {returns.map((r) => `${r.number} (${fmt(-r.total)})`).join(', ')}. What is left can be returned now.</div>}
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Medicine</th><th className="num">Sold</th><th className="num">Return</th><th className="num">Amount</th><th>Back to stock</th></tr></thead>
            <tbody>
              {open.map((x) => {
                const i = x.item, p = planned.get(x.line), max = x.left / x.step;
                return (
                  <tr key={x.line}>
                    <td data-label="Medicine">{i.name}{i.kit && <div className="small muted">{(i.kit.components || []).map((c) => c.name).join(', ')}</div>}</td>
                    <td data-label="Sold" className="num">{x.step > 1 ? `${i.qty / x.step} ${unitWord(x)}` : i.qty}{x.returned > 0 && <div className="small muted">{x.returned / x.step} back already</div>}</td>
                    <td data-label="Return" className="num"><input type="number" className="small-input" aria-label={`Return how many of ${i.name}`} min="0" max={max} step="1" value={take[x.line] ?? ''} onChange={(e) => setTake({ ...take, [x.line]: e.target.value === '' ? '' : Math.max(0, Math.min(max, Math.floor(Number(e.target.value) || 0))) })} />{unitWord(x) && <small className="muted"> {unitWord(x)}{max === 1 ? '' : 's'} of {max}</small>}</td>
                    <td data-label="Amount" className="num">{fmt(num(i.qty) ? ((num(i.qty) * num(i.price) - num(i.discount)) * ((Number(take[x.line]) || 0) * x.step)) / num(i.qty) : 0)}</td>
                    <td data-label="Back to stock" className="small">{p ? stockParts(p).map((a, k) => <div key={k}>{i.kit ? `${-a.qty} × ${(i.kit.components || []).find((c) => String(c.id) === a.productId)?.name || 'item'} · ` : `${-a.qty} · `}{batchNo(a.batchId)}</div>) : <span className="muted">—</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!plan.ok && <p className="small text-warn" role="alert">{plan.error}</p>}
        <div className="refund-money">
          <div className="row between"><span>Sale total</span><strong>{fmt(sale.total)}</strong></div>
          {!whole && plan.ok && <div className="row between"><span>{plan.full ? 'The rest of the sale' : 'Part of the sale'} returned</span><strong>{fmt(plan.total)}</strong></div>}
          <div className="row between grand refund-amount"><span>Money back to the customer</span><strong className="num">{fmt(back)}</strong></div>
          {unpaid > 0.005 && <div className="row between"><span>Unpaid balance cancelled</span><span>{fmt(unpaid)}</span></div>}
          {insurer > 0.005 && <div className="row between"><span>No longer billed to {sale.insurance.insurer || 'the insurer'}</span><span>{fmt(insurer)}</span></div>}
          <p className="small">{plan.ok && plan.tenders.length > 1 ? howBack(plan.tenders, fmt) : refundHow(sale, back, fmt)}</p>
          <p className="small muted"><PackageCheck size={14} /> {whole ? 'Every item goes back into stock, in the batch it came from.' : 'What is returned goes back into stock, in the batch it came from. A credit note is printed for it; the sale stays as it was.'}</p>
        </div>
        <label className="field"><span>Why is it refunded?</span>
          <select value={reason} onChange={(e) => setReason(e.target.value)} required autoFocus>
            <option value="">Choose a reason…</option>
            {REFUND_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </label>
        <label className="field"><span>{reason === 'Other' ? 'Say why' : 'Note (optional)'}</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} required={reason === 'Other'} placeholder={reason === 'Side effect or reaction' ? 'What happened (also record it on the customer)' : ''} /></label>
        {needApproval && (
          <fieldset className="refund-approve">
            <legend>A manager must approve a refund over {fmt(approval.limit)}</legend>
            {approval.approvers.length ? <>
              <label className="field"><span>Manager</span>
                <select value={approver} onChange={(e) => { setApprover(e.target.value); setApproveErr(''); }} required>
                  <option value="">Choose…</option>
                  {approval.approvers.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select></label>
              <label className="field"><span>Their PIN or password</span>
                <input type="password" autoComplete="off" value={secret} onChange={(e) => { setSecret(e.target.value); setApproveErr(''); }} required /></label>
            </> : <p className="small">This pharmacy has no other manager to approve it. Ask a manager to do the refund.</p>}
            {approveErr && <p className="small text-danger" role="alert">{approveErr}</p>}
          </fieldset>
        )}
        <div className="form-actions">
          <button type="button" className="btn ghost" onClick={onCancel}>Keep the sale</button>
          <button type="submit" className="btn danger" disabled={!ready || busy || (needApproval && !approval.approvers.length)}><Undo2 size={16} />{whole ? `Refund ${fmt(back)}` : `Return and give back ${fmt(back)}`}</button>
        </div>
      </form>
    </Modal>
  );
}

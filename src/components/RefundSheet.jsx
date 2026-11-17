// The refund sheet (UX review, Nov 2026): before a refund, one sheet shows exactly what happens. It lists each line
// and the batch its stock goes back to (a kit: each of its medicines), how much money goes back and how (cash from the
// drawer, Mobile Money sent by hand, a debt cancelled, the insurer's share), whether the sale is in a closed day, and
// it asks why (kept on the sale and in the audit log). It replaced a one-line "Refund R123?" question.
import { useState } from 'react';
import { Undo2, AlertTriangle, PackageCheck } from 'lucide-react';
import { Modal } from '../ui.jsx';
import { stockParts } from '../kits.js';

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

export default function RefundSheet({ sale, fmt, batches = [], closedDay = false, onCancel, onConfirm }) {
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const batchNo = (id) => (id ? batches.find((b) => b.id === id)?.batch || 'batch' : 'no batch');
  const { back, insurer, unpaid } = refundMoney(sale);
  const why = reason === 'Other' ? note.trim() : [reason, note.trim()].filter(Boolean).join(': ');
  const ready = reason && (reason !== 'Other' || note.trim());
  const go = async (e) => { e.preventDefault(); if (!ready || busy) return; setBusy(true); try { await onConfirm(why); } finally { setBusy(false); } };
  return (
    <Modal title={`Refund ${sale.number}`} onClose={onCancel} wide>
      <form className="stack refund-sheet" onSubmit={go}>
        <div className="muted small">{new Date(sale.date).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })} · {sale.customerName || 'Walk-in'} · sold by {sale.cashier || '—'}</div>
        {closedDay && <div className="notice warn" role="alert"><AlertTriangle size={16} /> This sale is in a closed day. The refund counts today, and the owner sees it among the sales to check.</div>}
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Medicine</th><th className="num">Qty</th><th className="num">Amount</th><th>Back to stock</th></tr></thead>
            <tbody>
              {(sale.items || []).map((i, n) => (
                <tr key={n}>
                  <td data-label="Medicine">{i.name}{i.kit && <div className="small muted">{(i.kit.components || []).map((c) => c.name).join(', ')}</div>}</td>
                  <td data-label="Qty" className="num">{i.qty}</td>
                  <td data-label="Amount" className="num">{fmt(num(i.qty) * num(i.price))}</td>
                  <td data-label="Back to stock" className="small">{stockParts(i).map((a, k) => <div key={k}>{i.kit ? `${a.qty} × ${(i.kit.components || []).find((c) => String(c.id) === a.productId)?.name || 'item'} · ` : `${a.qty} · `}{batchNo(a.batchId)}</div>)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="refund-money">
          <div className="row between"><span>Sale total</span><strong>{fmt(sale.total)}</strong></div>
          <div className="row between grand"><span>Money back to the customer</span><strong>{fmt(back)}</strong></div>
          {unpaid > 0.005 && <div className="row between"><span>Unpaid balance cancelled</span><span>{fmt(unpaid)}</span></div>}
          {insurer > 0.005 && <div className="row between"><span>No longer billed to {sale.insurance.insurer || 'the insurer'}</span><span>{fmt(insurer)}</span></div>}
          <p className="small">{refundHow(sale, back, fmt)}</p>
          <p className="small muted"><PackageCheck size={14} /> Every item goes back into stock, in the batch it came from.</p>
        </div>
        <label className="field"><span>Why is it refunded?</span>
          <select value={reason} onChange={(e) => setReason(e.target.value)} required autoFocus>
            <option value="">Choose a reason…</option>
            {REFUND_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </label>
        <label className="field"><span>{reason === 'Other' ? 'Say why' : 'Note (optional)'}</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} required={reason === 'Other'} placeholder={reason === 'Side effect or reaction' ? 'What happened (also record it on the customer)' : ''} /></label>
        <div className="form-actions">
          <button type="button" className="btn ghost" onClick={onCancel}>Keep the sale</button>
          <button type="submit" className="btn danger" disabled={!ready || busy}><Undo2 size={16} />Refund {fmt(back)}</button>
        </div>
      </form>
    </Modal>
  );
}

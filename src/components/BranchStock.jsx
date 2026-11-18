// G4 (1.13): a medicine's stock in each branch, from the balances every device keeps per branch (src/stockindex.js),
// shown on the medicine (Medicine List hover card) and on an out-of-stock till tile.
import { useEffect, useRef, useState } from 'react';
import { Building2 } from 'lucide-react';
import { useStore } from '../store.jsx';
import { formatQty } from '../money.js';

/** [{ id, name, qty, here }] for every branch, this one first */
export function branchStocks(stockIndex, branches, productId, here) {
  const rows = branches.map((b) => ({ id: b.id, name: b.name, qty: stockIndex?.product?.get(b.id + '|' + productId) || 0, here: b.id === here }));
  return rows.sort((a, b) => (b.here - a.here) || (b.qty - a.qty));
}

export function BranchStockList({ p }) {
  const { db, stockIndex, branchId } = useStore();
  const rows = branchStocks(stockIndex, db.branches, p.id, branchId);
  return (
    <table className="branch-stock" aria-label={`${p.name} in each branch`}><tbody>
      {rows.map((r) => <tr key={r.id} className={r.here ? 'here' : ''}><td>{r.name}{r.here ? ' (here)' : ''}</td><td className={'num' + (r.qty <= 0 ? ' muted' : '')}>{r.qty > 0 ? formatQty(r.qty) : 'none'}</td></tr>)}
    </tbody></table>
  );
}

/** The till: an out-of-stock medicine's "Other branches" button and its pop-over */
export function BranchStockButton({ p }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);
  return (
    <span className="branch-stock-wrap" ref={ref}>
      <button type="button" className="branch-btn" aria-expanded={open} aria-label={`${p.name} in other branches`} title="Stock in other branches" onClick={() => setOpen((o) => !o)}><Building2 size={14} /> Other branches</button>
      {open && <div className="branch-pop" role="dialog" aria-label={`${p.name} in each branch`}><strong>{p.name}</strong><BranchStockList p={p} /></div>}
    </span>
  );
}

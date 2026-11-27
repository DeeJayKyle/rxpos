// Dashboard cards from the stock review (27 Nov 2026, src/stockcontrol.js):
//  • Stock controls: this month's shrinkage (hand losses ÷ cost of sales) by reason and person, deliveries against the
//    cost of sales for the last 8 weeks, and the reminders that need someone: no delivery recorded for a while, the
//    weekly order, the monthly expiry check
//  • Sell these first: the batches in stock that expire soonest, with their shelf, for the counter staff
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ShieldAlert, Truck, ClipboardList, CalendarClock, ArrowRight, PackageX } from 'lucide-react';
import { today, useStore } from '../store.jsx';
import { oversold, soldByText } from '../oversold.js';
import { isApprover, shrinkage, weeklyBuySell, deliveryGap, deliveryGapDays, orderDue, costLookup, reasonLabel, SHRINK_TARGET } from '../stockcontrol.js';
import { showDate } from '../showdate.js';
import { formatQty } from '../money.js';

const EXPIRY_CHECK_DAYS = 30; // a month with expired stock in hand and nothing written off or returned: remind
const OVERSOLD_DAYS = 14; // a batch sold below zero in the last two weeks (src/oversold.js): ask for a count

export function StockControlsCard({ db, branchId, fmt, exp, lowCount }) {
  const day = today();
  const { stockIndex, user } = useStore();
  const requests = isApprover(user) ? (db.purchaseOrders || []).filter((o) => o.status === 'Requested' && (o.branchId || 'main') === branchId) : [];
  const short = useMemo(() => {
    const since = new Date(Date.now() - OVERSOLD_DAYS * 864e5).toISOString();
    const names = new Map(db.products.map((p) => [p.id, p.name])), lots = new Map(db.batches.map((b) => [b.id, b.batch]));
    return oversold(db.movements, { branchId, since, balance: (k) => stockIndex?.batch.get(branchId + '|' + k) || 0 })
      .map((o) => ({ ...o, name: names.get(o.productId) || 'A medicine', lot: o.batchId ? lots.get(o.batchId) : '' }));
  }, [db.movements, db.products, db.batches, branchId, stockIndex]);
  const costOf = useMemo(() => costLookup(db.products, db.batches), [db.products, db.batches]);
  const month = day.slice(0, 7) + '-01';
  const sh = useMemo(() => shrinkage(db.movements, { from: month, costOf, branchId }), [db.movements, month, costOf, branchId]);
  const weeks = useMemo(() => weeklyBuySell(db.movements, { costOf, today: day, weeks: 8, branchId }), [db.movements, costOf, day, branchId]);
  const gap = useMemo(() => deliveryGap(db.movements, { today: day, branchId, minDays: deliveryGapDays(db.settings) }), [db.movements, day, branchId, db.settings]);
  const order = lowCount > 0 ? orderDue(db.settings, day, (db.purchaseOrders || []).filter((o) => (o.branchId || 'main') === branchId)) : null;
  const since = new Date(Date.now() - EXPIRY_CHECK_DAYS * 864e5).toISOString();
  const expiryDue = exp.expired > 0 && !db.movements.some((m) => (m.type === 'Expired write-off' || m.type === 'Supplier return') && String(m.date) >= since && (m.branchId || 'main') === branchId);
  const max = Math.max(1, ...weeks.flatMap((w) => [w.bought, w.sold]));
  const reasons = Object.entries(sh.byReason).filter(([, v]) => v < 0).sort((a, b) => a[1] - b[1]).slice(0, 3);
  const people = Object.entries(sh.byPerson).filter(([, v]) => v < 0).sort((a, b) => a[1] - b[1]).slice(0, 3);
  const bought8 = weeks.reduce((a, w) => a + w.bought, 0), sold8 = weeks.reduce((a, w) => a + w.sold, 0);
  const high = sh.pct != null && sh.pct > SHRINK_TARGET;
  return (
    <div className="card stock-controls" aria-label="Stock controls">
      <div className="card-head"><h3><ShieldAlert size={17} />Stock controls</h3><Link to="/stock-card" className="card-head-link">Stock card <ArrowRight size={14} /></Link></div>
      {short.length > 0 && (
        <div className="notice warn-notice small oversold" role="status">
          <PackageX size={15} /> <span><strong>Sold more than was in stock</strong> ({short.length} batch{short.length === 1 ? '' : 'es'}). This happens when two devices sell the last packs while one of them is offline. Count {short.length === 1 ? 'it' : 'them'} to put the stock right.
            <ul className="oversold-list">
              {short.slice(0, 5).map((o) => <li key={o.productId + (o.batchId || '')}><strong>{o.name}</strong>{o.lot ? ` batch ${o.lot}` : ''} is at {formatQty(o.balance)}: {soldByText(o.sales)}</li>)}
            </ul>
            <Link to="/stock-count">Count stock</Link></span>
        </div>
      )}
      {requests.length > 0 && <div className="notice info-notice small" role="status"><ClipboardList size={15} /> {requests.length} stock request{requests.length === 1 ? '' : 's'} waiting for your approval ({[...new Set(requests.map((r) => r.requestedBy).filter(Boolean))].join(', ') || 'staff'}). <Link to="/reorder" state={{ tab: 'orders' }}>Review</Link></div>}
      {gap && <div className="notice warn-notice small" role="status"><Truck size={15} /> {gap.never ? 'No delivery has been recorded' : `No delivery recorded since ${showDate(gap.since)}`} ({gap.days} days, {gap.sales} items sold since). Have all deliveries been entered? <Link to="/add-stock">Add Stock</Link></div>}
      {order && <div className="notice info-notice small" role="status"><ClipboardList size={15} /> This week's order is due: {lowCount} medicine{lowCount === 1 ? ' is' : 's are'} at or below the reorder level. <Link to="/reorder">Review and draft the orders</Link> (nothing is sent until you send it).</div>}
      {expiryDue && <div className="notice warn-notice small" role="status"><CalendarClock size={15} /> Monthly expiry check: {exp.expired} medicine{exp.expired === 1 ? ' has' : 's have'} expired stock on the shelf, and nothing was written off or returned in the last {EXPIRY_CHECK_DAYS} days. <Link to="/expiry" state={{ tab: 'expired' }}>Write off or return it</Link></div>}
      <div className="row between gap">
        <div>
          <small className="muted">Shrinkage this month</small>
          <div><strong className={high ? 'text-danger' : 'text-ok'} style={{ fontSize: '1.6em' }}>{sh.pct == null ? '—' : sh.pct + '%'}</strong> <small className="muted">of the cost of sales · aim for {SHRINK_TARGET}% or less</small></div>
          <small>{fmt(sh.lost)} taken off by counts, adjustments, edits and write-offs{sh.found > 0 ? `, ${fmt(sh.found)} found` : ''}; {fmt(sh.sold)} sold at cost</small>
        </div>
      </div>
      {(reasons.length > 0 || people.length > 0) && (
        <div className="small" style={{ marginTop: 6 }}>
          {reasons.length > 0 && <div><span className="muted">Why: </span>{reasons.map(([k, v]) => `${reasonLabel(k === 'none' ? '' : k)} ${fmt(-v)}`).join(' · ')}</div>}
          {people.length > 0 && <div><span className="muted">By: </span>{people.map(([k, v]) => `${k} ${fmt(-v)}`).join(' · ')}</div>}
        </div>
      )}
      <div style={{ marginTop: 10 }}>
        <small className="muted">Deliveries against the cost of sales, last 8 weeks: {fmt(bought8)} received, {fmt(sold8)} sold{sold8 > 0 && bought8 < sold8 * 0.6 ? '. Much less is coming in than going out: is every delivery entered?' : ''}</small>
        <div className="bars" role="img" aria-label="Weekly deliveries and cost of sales">
          {weeks.map((w) => (
            <div key={w.week} className="wk" title={`Week of ${showDate(w.week)}: received ${fmt(w.bought)}, sold ${fmt(w.sold)} at cost`}>
              <i className="in" style={{ height: `${(Math.max(0, w.bought) / max) * 100}%` }} />
              <i className="out" style={{ height: `${(Math.max(0, w.sold) / max) * 100}%` }} />
            </div>
          ))}
        </div>
        <div className="legend"><span><b style={{ background: 'var(--ok)' }} />Received</span><span><b style={{ background: 'var(--warn)' }} />Sold (at cost)</span></div>
      </div>
    </div>
  );
}

/** The batches in stock that expire soonest (within the warning days), with their shelf: sell these first */
export function SellFirstCard({ exp, warn, fmt }) {
  const list = exp.soonBatches.slice(0, 8);
  return (
    <div className="card" aria-label="Sell these first">
      <div className="card-head"><h3><CalendarClock size={17} />Sell these first</h3><Link to="/expiry" className="card-head-link">All <ArrowRight size={14} /></Link></div>
      <small className="muted">Expiring within {warn} days: put them at the front of the shelf and offer them first.</small>
      <table className="compact sell-first"><tbody>
        {list.map((b) => (
          <tr key={b.p.id + b.id}>
            <td><strong>{b.p.name}</strong><br /><small className="muted">batch {b.batch || '—'}{b.p.shelf ? ` · shelf ${b.p.shelf}` : ''}</small></td>
            <td className="num">{formatQty(b.qty)}<br /><small className="muted">{fmt(b.qty * (Number(b.cost) || Number(b.p.cost) || 0))}</small></td>
            <td className="num"><span className={b.days <= 30 ? 'text-danger' : 'text-warn'}>{b.days === 0 ? 'today' : `${b.days} days`}</span></td>
          </tr>
        ))}
        {!list.length && <tr><td className="muted">Nothing expires within {warn} days.</td></tr>}
      </tbody></table>
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { shiftsFromSales, rebuiltShift } from '../shiftsfromsales.js';
import { startShift, openShiftOf } from '../shiftstart.js';
import { clientOwes, insurerShare } from '../insurance.js';
import { Clock, PlayCircle, StopCircle, Printer, Coins, Lock, LockOpen } from 'lucide-react';
import { useStore, uid, now, put, audit, MAIN_BRANCH, today, dayOf } from '../store.jsx';
import { closeId, daySnapshot } from '../dayclose.js';
import { byMethod } from '../tenders.js';
import { shiftCash, PAY_IN_REASONS, PAY_OUT_REASONS } from '../cashmoves.js';
import { Modal, Stat, Empty, Tabs } from '../ui.jsx';
import { toast, ask, askText } from '../feedback.jsx';
import { showDateTime, dateLocale } from '../showdate.js';
import { usePageMenu } from '../pagemenu.js';

const NOTES = [50000, 20000, 10000, 5000, 2000, 1000, 500, 200, 100, 50];

/** What happened during a shift: sales by payment method, refunds, discounts, expected cash. */
export function shiftSummary(db, shift) {
  const end = shift.closedAt || now();
  const inShift = (x) => x.date >= shift.openedAt && x.date <= end && (x.branchId || MAIN_BRANCH) === (shift.branchId || MAIN_BRANCH) && (x.cashier === shift.user || x.refundedBy === shift.user);
  const all = db.sales.filter((s) => s.cashier === shift.user && inShift(s));
  const sales = all.filter((s) => !s.returnOf);
  const returns = all.filter((s) => s.returnOf); // Nov 2026: returns of part of a sale (src/returns.js), negative
  const valid = sales.filter((s) => s.status !== 'refunded');
  const refunds = db.sales.filter((s) => s.status === 'refunded' && s.refundedBy === shift.user && s.refundedAt >= shift.openedAt && s.refundedAt <= end);
  const insured = [...valid, ...returns].reduce((a, s) => a + insurerShare(s), 0);
  // Nov 2026 audit item 7 (src/cashmoves.js): cash in and out of the drawer for anything, not only sales
  const cash = shiftCash(db, shift, end, dayOf);
  return {
    count: valid.length, total: valid.reduce((a, s) => a + s.total, 0), byMethod: byMethod([...valid, ...returns]), // a split sale under each method
    discounts: valid.reduce((a, s) => a + (s.discount || 0), 0), refunds: refunds.length + returns.length, refundTotal: refunds.reduce((a, s) => a + s.total, 0) - returns.reduce((a, s) => a + s.total, 0),
    expectedCash: cash.expected, cash, credit: [...valid, ...returns].reduce((a, s) => a + clientOwes(s), 0),
    ...(insured > 0 ? { insured } : {}), // step 22: billed to insurers (owed by them, not the clients)
  };
}

export default function Shifts() {
  const { db, update, user, fmt, branchId, can } = useStore();
  const [tab, setTab] = useState('mine');
  const [closing, setClosing] = useState(null);
  const [report, setReport] = useState(null);
  const [cashMove, setCashMove] = useState(null); // { kind: 'in' | 'out', amount, reason, note } while paying in or out
  const open = openShiftOf(db, user, branchId);
  const location = useLocation(), navigate = useNavigate();
  usePageMenu([open ? { label: 'Close shift and count cash', Icon: StopCircle, run: () => setClosing({ mode: 'close', counts: {}, note: '' }) } : { label: 'Start my shift', Icon: PlayCircle, run: () => openShift() }]);
  // signing out with a shift open: "End shift" brings the person here to count the cash, then signs them out
  const thenSignOut = location.state?.close === 'signout';
  useEffect(() => {
    if (location.state?.close && open && !closing) setClosing({ mode: 'close', counts: {}, note: '' });
  }, [location.state?.close, open?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const live = useMemo(() => (open ? shiftSummary(db, open) : null), [db, open]);
  // step 20: blind cash-up (Settings): staff count the cash before they see what the drawer should hold, so while a
  // shift is open its money figures are hidden from whoever may not see everyone's shifts
  const blind = !!db.settings.blindCashUp;
  const hideMoney = blind && !can('shifts.all');
  const list = db.shifts.filter((s) => (tab === 'all' ? true : s.userId === user.id)).sort((a, b) => b.openedAt.localeCompare(a.openedAt));

  const openShift = async () => {
    const f = await new Promise((resolve) => setClosing({ mode: 'open', float: '', resolve }));
    if (f == null) return;
    startShift(update, user, branchId, f, fmt);
    toast('Shift started');
  };

  // Nov 2026 audit item 7: cash paid into or out of the drawer during the shift (src/cashmoves.js)
  const saveCashMove = async (e) => {
    e.preventDefault();
    const m = cashMove, amount = Number(m.amount) || 0;
    if (!(amount > 0)) return toast('Enter an amount more than 0', 'warn');
    if (!m.reason) return toast('Choose a reason', 'warn');
    if (m.reason === 'Other' && !m.note.trim()) return toast('Say what the cash was for', 'warn');
    try {
      await update((d) => {
        put(d, 'cashMoves', { id: uid(), date: now(), branchId, shiftId: open.id, user: user.name, kind: m.kind, amount, reason: m.reason, note: m.note.trim().slice(0, 200) });
        audit(d, user, m.kind === 'out' ? 'Cash paid out' : 'Cash paid in', `${fmt(amount)} · ${m.reason}${m.note.trim() ? ' · ' + m.note.trim() : ''}`, branchId);
      });
    } catch (err) { return toast('Nothing was recorded: ' + err.message, 'error'); }
    toast(m.kind === 'out' ? `${fmt(amount)} paid out of the drawer` : `${fmt(amount)} paid into the drawer`);
    setCashMove(null);
  };
  const cashRows = (c) => [
    ['Opening float', c.float], ['Cash sales', c.sales], ['Cash refunds and returns', -(c.refunds + c.returns)],
    ['Debts paid in cash', c.debts], ['Paid in', c.paidIn], ['Paid out', -c.paidOut], ['Expenses and payments in cash', -c.spent],
  ].filter(([, v], i) => i < 2 || v);

  const closeShift = (counts, note) => {
    const counted = NOTES.reduce((a, n) => a + n * (Number(counts[n]) || 0), 0) + (Number(counts.coins) || 0);
    const summary = shiftSummary(db, open);
    const blindCount = !!db.settings.blindCashUp; // step 20: counted before the expected cash was shown
    const closed = { ...open, closedAt: now(), counts, counted, expected: summary.expectedCash, variance: counted - summary.expectedCash, note, summary, ...(blindCount ? { blind: true } : {}) };
    update((d) => {
      put(d, 'shifts', closed);
      audit(d, user, blindCount ? 'Shift closed (blind count)' : 'Shift closed', `Expected ${fmt(summary.expectedCash)}, counted ${fmt(counted)}, ${counted - summary.expectedCash >= 0 ? 'over' : 'short'} ${fmt(Math.abs(counted - summary.expectedCash))}`, branchId);
    });
    setClosing(null);
    if (thenSignOut) { navigate('.', { replace: true, state: null }); window.dispatchEvent(new Event('rxpos:signout')); return; }
    setReport(closed);
  };
  // the owner's request (2026-11-20): past sales made outside any shift become their people's shifts, but only once
  // the owner has looked at the list and approved it (the owner's law: no change to the data without their approval)
  const isOwner = user.role === 'admin';
  const [backfill, setBackfill] = useState(null); // the planned shifts, while the owner reviews them
  const missing = useMemo(() => (isOwner ? shiftsFromSales(db.sales, db.shifts, db.users) : []), [isOwner, db.sales, db.shifts, db.users]);
  const approveBackfill = async () => {
    const plan = backfill;
    if (!(await ask({ title: `Create ${plan.length} shift${plan.length === 1 ? '' : 's'} from past sales?`, message: 'Each person\'s sales on each day become one shift (no float, no cash count: shown as "rebuilt"). No sale changes. You can see each one under All staff.', confirmText: 'Approve and create' }))) return;
    try {
      await update((d) => {
        for (const g of plan) { const rec = rebuiltShift(g, uid()); const summary = shiftSummary(d, rec); put(d, 'shifts', { ...rec, summary, expected: summary.expectedCash }); }
        audit(d, user, 'Shifts rebuilt from past sales (approved by the owner)', `${plan.length} shift(s): ${plan.slice(0, 20).map((g) => `${g.user} ${g.day}`).join('; ')}${plan.length > 20 ? '…' : ''}`, branchId);
      });
      toast(`${plan.length} shift${plan.length === 1 ? '' : 's'} created from past sales`, 'success');
      setBackfill(null); setTab('all');
    } catch (e) { toast('Nothing was changed: ' + e.message, 'error'); }
  };

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Shifts & Cash-up</h1><div className="sub"><Clock size={14} /> Open a shift with your float, then count the cash at the end</div></div>
        {open
          ? <button className="btn primary" onClick={() => setClosing({ mode: 'close', counts: {}, note: '' })}><StopCircle size={16} />Close shift & count cash</button>
          : <button className="btn primary" onClick={openShift}><PlayCircle size={16} />Start my shift</button>}
      </div>
      {open && live && (
        <>
          <div className="notice info-notice">Shift open since {new Date(open.openedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · float {fmt(open.float)}</div>
          {hideMoney ? <div className="notice">Blind cash-up: count the cash when you close the shift; what the drawer should hold is shown after you count. {live.count} sale{live.count === 1 ? '' : 's'} so far.</div> : <>
          <div className="stats">
            <Stat label="Sales this shift" value={fmt(live.total)} sub={`${live.count} sales`} tone="teal" icon={Coins} />
            <Stat label="Cash expected in drawer" value={fmt(live.expectedCash)} sub="float + cash in − cash out" />
            <Stat label="Refunds" value={fmt(live.refundTotal)} sub={`${live.refunds} receipts`} tone="red" />
            <Stat label="Discounts given" value={fmt(live.discounts)} tone="amber" />
          </div>
          <div className="card"><h3>By payment method</h3><table><tbody>
            {Object.entries(live.byMethod).map(([k, v]) => <tr key={k}><td>{k}</td><td className="num">{fmt(v)}</td></tr>)}
            {!Object.keys(live.byMethod).length && <Empty colSpan={2}>No sales yet this shift</Empty>}
          </tbody></table></div>
          <div className="card" data-testid="drawer-cash"><h3>Cash in the drawer</h3><table><tbody>
            {cashRows(live.cash).map(([k, v]) => <tr key={k}><td>{k}</td><td className="num">{fmt(v)}</td></tr>)}
            <tr className="total-row"><td>Expected in the drawer</td><td className="num">{fmt(live.expectedCash)}</td></tr>
          </tbody></table></div>
          </>}
          <div className="row gap">
            <button type="button" className="btn ghost" onClick={() => setCashMove({ kind: 'in', amount: '', reason: '', note: '' })}><Coins size={16} />Pay cash in</button>
            <button type="button" className="btn ghost" onClick={() => setCashMove({ kind: 'out', amount: '', reason: '', note: '' })}><Coins size={16} />Pay cash out</button>
          </div>
        </>
      )}
      {(can('day.close') || user.role === 'admin') && <DayClose />}
      {isOwner && missing.length > 0 && (
        <div className="notice info-notice row between gap wrap" data-testid="shift-backfill">
          <span>{missing.reduce((a, g) => a + g.sales, 0)} past sale{missing.length === 1 && missing[0].sales === 1 ? ' was' : 's were'} made outside any shift ({missing.length} day{missing.length === 1 ? '' : 's'} of work by {new Set(missing.map((g) => g.user)).size} {new Set(missing.map((g) => g.user)).size === 1 ? 'person' : 'people'}). Nothing changes until you approve.</span>
          <button type="button" className="btn sm" onClick={() => setBackfill(missing)}>Review and turn into shifts</button>
        </div>
      )}
      {backfill && (
        <Modal wide title="Past sales → shifts (needs your approval)" onClose={() => setBackfill(null)}>
          <p className="muted small">One shift per person, branch and day, from their first sale to their last. These shifts have no float and no cash count, so they never show as balanced or short. Sales are not changed.</p>
          <div className="table-wrap scroll-50"><table><thead><tr><th>Day</th><th>Cashier</th>{db.branches.length > 1 && <th>Branch</th>}<th>From – to</th><th className="num">Sales</th><th className="num">Total</th></tr></thead><tbody>
            {backfill.map((g) => <tr key={g.key}><td>{g.day}</td><td>{g.user}{!g.userId && <small className="muted"> (no longer a user)</small>}</td>{db.branches.length > 1 && <td>{db.branches.find((b) => b.id === g.branchId)?.name || g.branchId}</td>}<td>{new Date(g.openedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} – {new Date(g.closedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td><td className="num">{g.sales}</td><td className="num">{fmt(g.total)}</td></tr>)}
          </tbody></table></div>
          <div className="form-actions"><button type="button" className="btn ghost" onClick={() => setBackfill(null)}>Not now</button><button type="button" className="btn primary" onClick={approveBackfill}>Approve and create {backfill.length} shift{backfill.length === 1 ? '' : 's'}</button></div>
        </Modal>
      )}
      {can('shifts.all') && <Tabs tabs={[['mine', 'My shifts'], ['all', 'All staff']]} value={tab} onChange={setTab} />}
      <div className="card table-wrap">
        <table>
          <thead><tr><th>Cashier</th><th>Opened</th><th>Closed</th>{db.branches.length > 1 && <th>Branch</th>}<th className="num">Sales</th><th className="num">Expected cash</th><th className="num">Counted</th><th className="num">Over / short</th><th /></tr></thead>
          <tbody>
            {list.map((s) => (
              <tr key={s.id}>
                <td>{s.user}</td><td>{new Date(s.openedAt).toLocaleString(dateLocale(), { dateStyle: 'medium', timeStyle: 'short' })}</td>
                <td>{s.closedAt ? new Date(s.closedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : <span className="badge warn">open</span>}</td>
                {db.branches.length > 1 && <td>{db.branches.find((b) => b.id === s.branchId)?.name}</td>}
                <td className="num">{s.summary ? fmt(s.summary.total) : '—'}</td>
                <td className="num">{s.closedAt ? fmt(s.expected) : '—'}</td><td className="num">{s.closedAt && !s.rebuilt ? fmt(s.counted) : '—'}</td>
                {s.rebuilt ? <td className="num muted small" title={s.note}>rebuilt from sales</td>
                  : <td className={'num ' + (s.variance < 0 ? 'text-danger' : s.variance > 0 ? 'text-warn' : 'text-ok')}>{s.closedAt ? (s.variance === 0 ? 'Balanced' : (s.variance > 0 ? '+' : '') + fmt(s.variance)) : '—'}</td>}
                <td className="actions">{s.closedAt && <button className="btn sm ghost" onClick={() => setReport(s)}><Printer size={14} />Report</button>}</td>
              </tr>
            ))}
            {!list.length && <Empty colSpan={9}>No shifts yet. Open a shift at the start of the day; closing it counts the cash against the sales.</Empty>}
          </tbody>
        </table>
      </div>

      {closing?.mode === 'open' && (
        <Modal title="Start shift" onClose={() => { closing.resolve(null); setClosing(null); }}>
          <form onSubmit={(e) => { e.preventDefault(); closing.resolve(closing.float); setClosing(null); }} className="stack">
            <label className="field"><span>Opening float (cash already in the drawer)</span><input autoFocus type="number" min="0" value={closing.float} onChange={(e) => setClosing({ ...closing, float: e.target.value })} /></label>
            <div className="form-actions"><button type="button" className="btn ghost" onClick={() => { closing.resolve(null); setClosing(null); }}>Cancel</button><button className="btn primary">Start shift</button></div>
          </form>
        </Modal>
      )}
      {closing?.mode === 'close' && (() => {
        const counted = NOTES.reduce((a, n) => a + n * (Number(closing.counts[n]) || 0), 0) + (Number(closing.counts.coins) || 0);
        const diff = counted - live.expectedCash;
        const shown = !blind || closing.revealed; // blind: the expected cash appears only once the count is in
        return (
          <Modal title="Close shift – count the cash" onClose={() => setClosing(null)} wide>
            <div className="cash-count">
              {NOTES.map((n) => (
                <label key={n} className="field"><span>{fmt(n)} ×</span>
                  <input type="number" min="0" inputMode="numeric" disabled={blind && closing.revealed} value={closing.counts[n] || ''} onChange={(e) => setClosing({ ...closing, counts: { ...closing.counts, [n]: e.target.value } })} /></label>
              ))}
              <label className="field"><span>Other coins (total)</span><input type="number" min="0" disabled={blind && closing.revealed} value={closing.counts.coins || ''} onChange={(e) => setClosing({ ...closing, counts: { ...closing.counts, coins: e.target.value } })} /></label>
            </div>
            <div className="totals mt-3">
              {shown && <div className="row between"><span className="muted">Expected cash</span><span className="num">{fmt(live.expectedCash)}</span></div>}
              <div className="row between"><span className="muted">Counted</span><span className="num">{fmt(counted)}</span></div>
              {shown && <div className={'row between grand ' + (diff < 0 ? 'text-danger' : diff > 0 ? 'text-warn' : 'text-ok')}><span>{diff === 0 ? 'Balanced' : diff > 0 ? 'Over' : 'Short'}</span><span className="num">{fmt(Math.abs(diff))}</span></div>}
              {!shown && <small className="muted">Blind cash-up: enter what you counted, then see what the drawer should hold. The count can't be changed after that.</small>}
            </div>
            <label className="field mt-3"><span>Note (explain any difference)</span><input value={closing.note} onChange={(e) => setClosing({ ...closing, note: e.target.value })} /></label>
            <div className="form-actions">
              <button className="btn ghost" onClick={() => setClosing(null)}>Cancel</button>
              {!shown ? <button className="btn primary" onClick={() => setClosing({ ...closing, revealed: true })}>Show the difference</button> : <>
              <button className="btn primary" onClick={async () => { if (diff !== 0 && !closing.note.trim() && !(await ask({ title: `Cash is ${diff > 0 ? 'over' : 'short'} by ${fmt(Math.abs(diff))}`, message: 'Close the shift without a note?', confirmText: 'Close anyway' }))) return; closeShift(closing.counts, closing.note); }}>Close shift</button>
              </>}
            </div>
          </Modal>
        );
      })()}
      {cashMove && (
        <Modal title={cashMove.kind === 'out' ? 'Pay cash out of the drawer' : 'Pay cash into the drawer'} onClose={() => setCashMove(null)}>
          <form className="stack" onSubmit={saveCashMove}>
            <label className="field"><span>Amount</span><input autoFocus type="number" min="0" step="any" value={cashMove.amount} onChange={(e) => setCashMove({ ...cashMove, amount: e.target.value })} required /></label>
            <label className="field"><span>Reason</span><select value={cashMove.reason} onChange={(e) => setCashMove({ ...cashMove, reason: e.target.value })} required>
              <option value="">Choose…</option>{(cashMove.kind === 'out' ? PAY_OUT_REASONS : PAY_IN_REASONS).map((r) => <option key={r}>{r}</option>)}</select></label>
            <label className="field"><span>{cashMove.reason === 'Other' ? 'What was it for?' : 'Note (optional)'}</span><input value={cashMove.note} maxLength={200} onChange={(e) => setCashMove({ ...cashMove, note: e.target.value })} required={cashMove.reason === 'Other'} /></label>
            <small className="muted">Counted in the cash this drawer should hold, and in Cash at hand. An expense or a supplier payment recorded in Finance from Cash at hand is counted too, so record each one only once.</small>
            <div className="form-actions"><button type="button" className="btn ghost" onClick={() => setCashMove(null)}>Cancel</button><button className="btn primary">{cashMove.kind === 'out' ? 'Pay out' : 'Pay in'}</button></div>
          </form>
        </Modal>
      )}
      {report && (
        <Modal title="Close-of-day report" onClose={() => setReport(null)}>
          <div className="receipt print-area paper-80">
            <div className="center"><strong className="receipt-title">{db.settings.name}</strong><div>SHIFT REPORT (Z)</div><div>{report.user}</div>
              <div>{showDateTime(report.openedAt)} – {new Date(report.closedAt).toLocaleTimeString()}</div></div>
            <div className="receipt-rule" />
            <div className="row between"><span>Sales ({report.summary.count})</span><span>{fmt(report.summary.total)}</span></div>
            {Object.entries(report.summary.byMethod).map(([k, v]) => <div key={k} className="row between"><span>  {k}</span><span>{fmt(v)}</span></div>)}
            <div className="row between"><span>On credit</span><span>{fmt(report.summary.credit)}</span></div>
            {report.summary.insured > 0 && <div className="row between"><span>Billed to insurers</span><span>{fmt(report.summary.insured)}</span></div>}
            <div className="row between"><span>Discounts</span><span>{fmt(report.summary.discounts)}</span></div>
            <div className="row between"><span>Refunds ({report.summary.refunds})</span><span>{fmt(report.summary.refundTotal)}</span></div>
            <div className="receipt-rule" />
            {report.summary.cash ? cashRows(report.summary.cash).map(([k, v]) => <div key={k} className="row between"><span>{k}</span><span>{fmt(v)}</span></div>)
              : <div className="row between"><span>Opening float</span><span>{fmt(report.float)}</span></div>}
            <div className="row between"><span>Expected cash</span><span>{fmt(report.expected)}</span></div>
            {report.rebuilt ? <div className="row between"><span>Cash count</span><span>none (rebuilt from sales)</span></div> : <>
            <div className="row between"><span>Counted cash</span><span>{fmt(report.counted)}</span></div>
            <div className="row between grand"><span>{report.variance === 0 ? 'BALANCED' : report.variance > 0 ? 'OVER' : 'SHORT'}</span><span>{fmt(Math.abs(report.variance))}</span></div>
            </>}
            {report.note && <p>Note: {report.note}</p>}
            <p className="center">Cashier signature ____________<br /><br />Supervisor ____________</p>
          </div>
          <div className="form-actions no-print"><button className="btn primary" onClick={() => window.print()}><Printer size={16} />Print</button></div>
        </Modal>
      )}
    </div>
  );
}

// Step 18 (src/dayclose.js): close a day for this branch. After that its sales, expenses, payments and stock can't be
// changed or deleted from any device (the cloud refuses it); a refund, or something recorded late, is flagged in
// "Sales to check". The close keeps the day's totals as they were. Reopening needs an administrator and a reason.
function DayClose() {
  const { db, update, user, fmt, branchId } = useStore();
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - i); return dayOf(d.toISOString()); });
  const closes = new Map((db.dayCloses || []).filter((c) => (c.branchId || MAIN_BRANCH) === branchId).map((c) => [c.day, c]));
  const close = async (day) => {
    const snap = daySnapshot(db, branchId, day, dayOf);
    if (!(await ask({ title: `Close ${day}?`, message: `${snap.sales} sale${snap.sales === 1 ? '' : 's'}, ${fmt(snap.total)}${snap.expenses ? `, expenses ${fmt(snap.expenses)}` : ''}. Cash in the drawers on top of the floats: ${fmt(snap.cash.net)} (cash sales ${fmt(snap.cash.sales)}${snap.cash.refunds + snap.cash.returns ? `, refunds ${fmt(snap.cash.refunds + snap.cash.returns)}` : ''}${snap.cash.debts ? `, debts paid ${fmt(snap.cash.debts)}` : ''}${snap.cash.paidIn ? `, paid in ${fmt(snap.cash.paidIn)}` : ''}${snap.cash.paidOut + snap.cash.spent ? `, paid out ${fmt(snap.cash.paidOut + snap.cash.spent)}` : ''}). After closing, this day's sales, expenses, payments and stock can't be changed on any device. Anything recorded for it later is shown to the owner.`, confirmText: 'Close the day' }))) return;
    await update((d) => {
      put(d, 'dayCloses', { id: closeId(branchId, day), branchId, day, open: false, closedBy: user.name, closedAt: now(), snapshot: snap });
      audit(d, user, 'Day closed', `${day}: ${snap.sales} sales, ${fmt(snap.total)}`, branchId);
    });
    toast(`${day} is closed`);
  };
  const reopen = async (c) => {
    const reason = await askText({ title: `Reopen ${c.day}?`, message: 'Its records can be changed again until it is closed once more. Why reopen it? This is written to the audit log.', confirmText: 'Reopen', minLength: 3 });
    if (!reason) return;
    await update((d) => {
      put(d, 'dayCloses', { ...c, open: true, reopenedBy: user.name, reopenedAt: now(), reason });
      audit(d, user, 'Day reopened', `${c.day}: ${reason}`, branchId);
    });
    toast(`${c.day} is open again`);
  };
  return (
    <div className="card day-close" aria-label="Close the day">
      <h3><Lock size={17} />Close the day</h3>
      <small className="muted">A closed day's sales, expenses, payments and stock can't be changed any more. Refunds and anything recorded late are shown in "Sales to check".</small>
      <table className="compact"><tbody>
        {days.map((day) => {
          const c = closes.get(day), shut = c && !c.open;
          return (
            <tr key={day} className={shut ? 'closed-day' : ''}>
              <td><strong>{day}</strong>{day === today() && <small className="muted"> · today</small>}</td>
              <td>{shut ? <><span className="badge ok"><Lock size={12} /> Closed</span> <small className="muted">by {c.closedBy} · {String(c.closedAt).slice(11, 16)}</small></> : c?.open ? <small className="muted">Reopened by {c.reopenedBy}: {c.reason}</small> : <small className="muted">Open</small>}</td>
              <td className="num">{shut && c.snapshot ? <small>{c.snapshot.sales} sales · {fmt(c.snapshot.total)}{c.snapshot.cash ? ` · cash ${fmt(c.snapshot.cash.net)}` : ''}</small> : ''}</td>
              <td className="actions">
                {!shut && <button className="btn sm" onClick={() => close(day)}><Lock size={14} />Close</button>}
                {shut && user.role === 'admin' && <button className="btn sm ghost" onClick={() => reopen(c)}><LockOpen size={14} />Reopen</button>}
              </td>
            </tr>
          );
        })}
      </tbody></table>
    </div>
  );
}

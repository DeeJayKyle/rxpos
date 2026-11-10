import { useMemo, useState } from 'react';
import { clientOwes, insurerShare } from '../insurance.js';
import { Clock, PlayCircle, StopCircle, Printer, Coins, Lock, LockOpen } from 'lucide-react';
import { useStore, uid, now, put, audit, MAIN_BRANCH, today, dayOf } from '../store.jsx';
import { closeId, daySnapshot } from '../dayclose.js';
import { Modal, Stat, Empty, Tabs } from '../ui.jsx';
import { toast, ask, askText } from '../feedback.jsx';

const NOTES = [50000, 20000, 10000, 5000, 2000, 1000, 500, 200, 100, 50];

/** What happened during a shift: sales by payment method, refunds, discounts, expected cash. */
export function shiftSummary(db, shift) {
  const end = shift.closedAt || now();
  const inShift = (x) => x.date >= shift.openedAt && x.date <= end && (x.branchId || MAIN_BRANCH) === (shift.branchId || MAIN_BRANCH) && (x.cashier === shift.user || x.refundedBy === shift.user);
  const sales = db.sales.filter((s) => s.cashier === shift.user && inShift(s));
  const valid = sales.filter((s) => s.status !== 'refunded');
  const byMethod = {};
  for (const s of valid) byMethod[s.payment] = (byMethod[s.payment] || 0) + (s.paid ?? s.total);
  const refunds = db.sales.filter((s) => s.status === 'refunded' && s.refundedBy === shift.user && s.refundedAt >= shift.openedAt && s.refundedAt <= end);
  const cashRefunds = refunds.filter((s) => s.payment === 'Cash').reduce((a, s) => a + (s.paid ?? s.total), 0);
  const cashSales = valid.filter((s) => s.payment === 'Cash').reduce((a, s) => a + (s.paid ?? s.total), 0);
  const insured = valid.reduce((a, s) => a + insurerShare(s), 0);
  return {
    count: valid.length, total: valid.reduce((a, s) => a + s.total, 0), byMethod,
    discounts: valid.reduce((a, s) => a + (s.discount || 0), 0), refunds: refunds.length, refundTotal: refunds.reduce((a, s) => a + s.total, 0),
    expectedCash: Number(shift.float || 0) + cashSales - cashRefunds, credit: valid.reduce((a, s) => a + clientOwes(s), 0),
    ...(insured > 0 ? { insured } : {}), // step 22: billed to insurers (owed by them, not the clients)
  };
}

export default function Shifts() {
  const { db, update, user, fmt, branchId, can } = useStore();
  const [tab, setTab] = useState('mine');
  const [closing, setClosing] = useState(null);
  const [report, setReport] = useState(null);
  const open = db.shifts.find((s) => s.userId === user.id && !s.closedAt && (s.branchId || MAIN_BRANCH) === branchId);
  const live = useMemo(() => (open ? shiftSummary(db, open) : null), [db, open]);
  // step 20: blind cash-up (Settings): staff count the cash before they see what the drawer should hold, so while a
  // shift is open its money figures are hidden from whoever may not see everyone's shifts
  const blind = !!db.settings.blindCashUp;
  const hideMoney = blind && !can('shifts.all');
  const list = db.shifts.filter((s) => (tab === 'all' ? true : s.userId === user.id)).sort((a, b) => b.openedAt.localeCompare(a.openedAt));

  const openShift = async () => {
    const f = await new Promise((resolve) => setClosing({ mode: 'open', float: '', resolve }));
    if (f == null) return;
    update((d) => {
      put(d, 'shifts', { id: uid(), userId: user.id, user: user.name, branchId, openedAt: now(), float: Number(f) || 0, date: now() });
      audit(d, user, 'Shift opened', `Float ${fmt(Number(f) || 0)}`, branchId);
    });
    toast('Shift started');
  };

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
    setReport(closed);
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
            <Stat label="Cash expected in drawer" value={fmt(live.expectedCash)} sub="float + cash sales − cash refunds" />
            <Stat label="Refunds" value={fmt(live.refundTotal)} sub={`${live.refunds} receipts`} tone="red" />
            <Stat label="Discounts given" value={fmt(live.discounts)} tone="amber" />
          </div>
          <div className="card"><h3>By payment method</h3><table><tbody>
            {Object.entries(live.byMethod).map(([k, v]) => <tr key={k}><td>{k}</td><td className="num">{fmt(v)}</td></tr>)}
            {!Object.keys(live.byMethod).length && <Empty colSpan={2}>No sales yet this shift</Empty>}
          </tbody></table></div>
          </>}
        </>
      )}
      {(can('day.close') || user.role === 'admin') && <DayClose />}
      {can('shifts.all') && <Tabs tabs={[['mine', 'My shifts'], ['all', 'All staff']]} value={tab} onChange={setTab} />}
      <div className="card table-wrap">
        <table>
          <thead><tr><th>Cashier</th><th>Opened</th><th>Closed</th>{db.branches.length > 1 && <th>Branch</th>}<th className="num">Sales</th><th className="num">Expected cash</th><th className="num">Counted</th><th className="num">Over / short</th><th /></tr></thead>
          <tbody>
            {list.map((s) => (
              <tr key={s.id}>
                <td>{s.user}</td><td>{new Date(s.openedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</td>
                <td>{s.closedAt ? new Date(s.closedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : <span className="badge warn">open</span>}</td>
                {db.branches.length > 1 && <td>{db.branches.find((b) => b.id === s.branchId)?.name}</td>}
                <td className="num">{s.summary ? fmt(s.summary.total) : '—'}</td>
                <td className="num">{s.closedAt ? fmt(s.expected) : '—'}</td><td className="num">{s.closedAt ? fmt(s.counted) : '—'}</td>
                <td className={'num ' + (s.variance < 0 ? 'text-danger' : s.variance > 0 ? 'text-warn' : 'text-ok')}>{s.closedAt ? (s.variance === 0 ? 'Balanced' : (s.variance > 0 ? '+' : '') + fmt(s.variance)) : '—'}</td>
                <td className="actions">{s.closedAt && <button className="btn sm ghost" onClick={() => setReport(s)}><Printer size={14} />Report</button>}</td>
              </tr>
            ))}
            {!list.length && <Empty colSpan={9}>No shifts yet</Empty>}
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
            <div className="totals" style={{ marginTop: 12 }}>
              {shown && <div className="row between"><span className="muted">Expected cash</span><span className="num">{fmt(live.expectedCash)}</span></div>}
              <div className="row between"><span className="muted">Counted</span><span className="num">{fmt(counted)}</span></div>
              {shown && <div className={'row between grand ' + (diff < 0 ? 'text-danger' : diff > 0 ? 'text-warn' : 'text-ok')}><span>{diff === 0 ? 'Balanced' : diff > 0 ? 'Over' : 'Short'}</span><span className="num">{fmt(Math.abs(diff))}</span></div>}
              {!shown && <small className="muted">Blind cash-up: enter what you counted, then see what the drawer should hold. The count can't be changed after that.</small>}
            </div>
            <label className="field" style={{ marginTop: 12 }}><span>Note (explain any difference)</span><input value={closing.note} onChange={(e) => setClosing({ ...closing, note: e.target.value })} /></label>
            <div className="form-actions">
              <button className="btn ghost" onClick={() => setClosing(null)}>Cancel</button>
              {!shown ? <button className="btn primary" onClick={() => setClosing({ ...closing, revealed: true })}>Show the difference</button> : <>
              <button className="btn primary" onClick={async () => { if (diff !== 0 && !closing.note.trim() && !(await ask({ title: `Cash is ${diff > 0 ? 'over' : 'short'} by ${fmt(Math.abs(diff))}`, message: 'Close the shift without a note?', confirmText: 'Close anyway' }))) return; closeShift(closing.counts, closing.note); }}>Close shift</button>
              </>}
            </div>
          </Modal>
        );
      })()}
      {report && (
        <Modal title="Close-of-day report" onClose={() => setReport(null)}>
          <div className="receipt print-area paper-80">
            <div className="center"><strong className="receipt-title">{db.settings.name}</strong><div>SHIFT REPORT (Z)</div><div>{report.user}</div>
              <div>{new Date(report.openedAt).toLocaleString()} – {new Date(report.closedAt).toLocaleTimeString()}</div></div>
            <div className="receipt-rule" />
            <div className="row between"><span>Sales ({report.summary.count})</span><span>{fmt(report.summary.total)}</span></div>
            {Object.entries(report.summary.byMethod).map(([k, v]) => <div key={k} className="row between"><span>  {k}</span><span>{fmt(v)}</span></div>)}
            <div className="row between"><span>On credit</span><span>{fmt(report.summary.credit)}</span></div>
            {report.summary.insured > 0 && <div className="row between"><span>Billed to insurers</span><span>{fmt(report.summary.insured)}</span></div>}
            <div className="row between"><span>Discounts</span><span>{fmt(report.summary.discounts)}</span></div>
            <div className="row between"><span>Refunds ({report.summary.refunds})</span><span>{fmt(report.summary.refundTotal)}</span></div>
            <div className="receipt-rule" />
            <div className="row between"><span>Opening float</span><span>{fmt(report.float)}</span></div>
            <div className="row between"><span>Expected cash</span><span>{fmt(report.expected)}</span></div>
            <div className="row between"><span>Counted cash</span><span>{fmt(report.counted)}</span></div>
            <div className="row between grand"><span>{report.variance === 0 ? 'BALANCED' : report.variance > 0 ? 'OVER' : 'SHORT'}</span><span>{fmt(Math.abs(report.variance))}</span></div>
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
    if (!(await ask({ title: `Close ${day}?`, message: `${snap.sales} sale${snap.sales === 1 ? '' : 's'}, ${fmt(snap.total)}${snap.expenses ? `, expenses ${fmt(snap.expenses)}` : ''}. After closing, this day's sales, expenses, payments and stock can't be changed on any device. Anything recorded for it later is shown to the owner.`, confirmText: 'Close the day' }))) return;
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
              <td className="num">{shut && c.snapshot ? <small>{c.snapshot.sales} sales · {fmt(c.snapshot.total)}</small> : ''}</td>
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

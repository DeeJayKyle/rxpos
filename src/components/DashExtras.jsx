// Dashboard additions of UI batch 3: the busy-hours heatmap (B5), the setup checklist for a new pharmacy (B7) and the
// What's new card after an update (B8). The Flutter app has the same three in
// rxpos_flutter/lib/features/dashboard/presentation/dash_extras.dart.
import { useMemo, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Circle, Sparkles, X, ArrowRight, ListChecks } from 'lucide-react';
import { MAIN_BRANCH, localDate, DEFAULT_PAYMENT_METHODS } from '../store.jsx';
import { deviceSettings, setDevice } from '../device.js';
import { WHATS_NEW, whatsNewDue } from '../whatsnew.js';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Sales counted by weekday (Mon = 0) and hour from day key `from` on, and the hours to show: the usual opening
 *  hours (8:00 to 20:00) widened to any hour that had a sale */
export function busyGrid(sales, branchId, from) {
  const grid = DAYS.map(() => new Array(24).fill(0));
  let lo = 8, hi = 19, max = 0;
  for (const s of sales) {
    if (s.status === 'refunded' || (s.branchId || MAIN_BRANCH) !== branchId) continue;
    const d = new Date(s.date);
    if (localDate(d) < from) continue;
    const h = d.getHours(), w = (d.getDay() + 6) % 7;
    const v = ++grid[w][h];
    if (v > max) max = v;
    if (h < lo) lo = h;
    if (h > hi) hi = h;
  }
  return { grid, hours: Array.from({ length: hi - lo + 1 }, (_, i) => lo + i), max };
}

/** B5: when the pharmacy sells: 7 days × opening hours, shaded by how many sales */
export function BusyHours({ sales, branchId, from, words }) {
  const { grid, hours, max } = useMemo(() => busyGrid(sales, branchId, from), [sales, branchId, from]);
  const hh = (h) => String(h).padStart(2, '0') + ':00';
  return (
    <div className="card busy-card">
      <div className="card-head"><h3>Busy hours</h3><small className="muted">sales {words}</small></div>
      {max === 0 ? <p className="muted small">No sales {words} yet: the busy hours show here once you sell.</p> : (
        <div className="busy-scroll">
          <table className="busy-grid" aria-label={`Sales by day and hour, ${words}`}>
            <thead><tr><th scope="col"><span className="sr-only">Day</span></th>{hours.map((h) => <th key={h} scope="col">{h % 2 === 0 ? String(h).padStart(2, '0') : ''}<span className="sr-only">{h % 2 ? hh(h) : ':00'}</span></th>)}</tr></thead>
            <tbody>
              {DAYS.map((d, w) => (
                <tr key={d}>
                  <th scope="row">{d}</th>
                  {hours.map((h) => { const v = grid[w][h]; const tip = `${d} ${hh(h)} · ${v} sale${v === 1 ? '' : 's'}`; return (
                    <td key={h} title={tip} aria-label={tip} data-v={v} style={{ '--k': v ? 0.15 + 0.85 * (v / max) : 0 }} />
                  ); })}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="busy-key muted small" aria-hidden="true"><span>Fewer</span><i style={{ '--k': 0.15 }} /><i style={{ '--k': 0.5 }} /><i style={{ '--k': 1 }} /><span>More</span></div>
        </div>
      )}
    </div>
  );
}

/** The setup steps of a new pharmacy, each ticked from the data */
export function setupSteps(db, products = db.products || []) {
  const s = db.settings || {};
  const pm = JSON.stringify((s.paymentMethods || []).map((m) => [m.id, m.name, m.type, m.number || '', m.off ? 1 : 0]));
  const pmDefault = JSON.stringify(DEFAULT_PAYMENT_METHODS.map((m) => [m.id, m.name, m.type, m.number || '', m.off ? 1 : 0]));
  return [
    { id: 'medicines', label: 'Add your medicines', done: (db.products || []).length > 0, to: '/medicines', state: { create: true } },
    { id: 'stock', label: 'Add stock', done: products.some((p) => p.stock > 0), to: '/add-stock' },
    { id: 'staff', label: 'Add your staff', done: (db.users || []).length > 1, to: '/users' },
    { id: 'payments', label: 'Set your payment methods', done: !!s.paymentsChecked || pm !== pmDefault, to: '/settings', state: { tab: 'payments' } },
    { id: 'receipt', label: 'Receipt details (phone and address)', done: !!(s.phone && s.address), to: '/settings', state: { tab: 'general' } },
    { id: 'device', label: 'Sign in on a second device', done: (db.counters || []).length >= 2, to: '/device' },
  ];
}

/** B7: a new pharmacy's checklist at the top of the dashboard; Hide puts it away on this device; gone once all done */
export function SetupChecklist({ db, products, can }) {
  const steps = setupSteps(db, products);
  const left = steps.filter((x) => !x.done).length;
  // a new pharmacy only: one that already sold a lot has set itself up its own way
  // 1.16.0 (the owner's clean-up): once half is done it folds to one slim line; Continue opens the steps
  const [open, setOpen] = useState(() => left > steps.length / 2);
  if (!can('settings.manage') || !left || deviceSettings().setupHidden || (db.sales || []).length >= 100) return null;
  const next = steps.find((x) => !x.done);
  return (
    <section className={'card setup-card' + (open ? '' : ' folded')} aria-label="Set up your pharmacy">
      <div className="card-head">
        <h3><ListChecks size={17} />Set up your pharmacy <small className="muted">{steps.length - left} of {steps.length} done</small></h3>
        {!open && <div className="setup-meter inline" aria-hidden="true"><i style={{ width: `${((steps.length - left) / steps.length) * 100}%` }} /></div>}
        {!open && next && <Link className="btn sm" to={next.to} state={next.state}>Continue: {next.label} <ArrowRight size={13} aria-hidden="true" /></Link>}
        <button type="button" className="btn sm ghost" aria-expanded={open} onClick={() => setOpen((o) => !o)}>{open ? 'Fewer' : 'All steps'}</button>
        <button type="button" className="btn sm ghost" onClick={() => { setDevice({ setupHidden: true }); }}><X size={15} />Hide</button>
      </div>
      {open && <div className="setup-meter" aria-hidden="true"><i style={{ width: `${((steps.length - left) / steps.length) * 100}%` }} /></div>}
      <ul className="setup-steps" hidden={!open}>
        {steps.map((x) => (
          <li key={x.id} className={x.done ? 'done' : ''} data-step={x.id}>
            {x.done ? <CheckCircle2 size={18} aria-hidden="true" /> : <Circle size={18} aria-hidden="true" />}
            {x.done ? <span>{x.label}<span className="sr-only"> (done)</span></span> : <Link to={x.to} state={x.state}>{x.label} <ArrowRight size={13} aria-hidden="true" /></Link>}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** B8: after an update, the release's highlights once on this device, with "Show me" links */
let shownThisVisit = null; // decided once per visit: the dashboard opening again (after a sync, a page) keeps the answer
export function WhatsNewCard({ db }) {
  // decided once when the app opens, and this device marks the release seen at once: shown on this visit only
  const [show, setShow] = useState(() => shownThisVisit ??= whatsNewDue(deviceSettings().whatsNewSeen, { usedBefore: (db.sales || []).some((s) => localDate(new Date(s.date)) < localDate(new Date())) }));
  useEffect(() => { if (deviceSettings().whatsNewSeen !== WHATS_NEW.version) setDevice({ whatsNewSeen: WHATS_NEW.version }); }, []);
  if (!show) return null;
  const seen = () => { shownThisVisit = false; setShow(false); };
  return (
    <section className="card whats-new" aria-label="What's new">
      <div className="card-head">
        <h3><Sparkles size={17} />What&apos;s new in {WHATS_NEW.version}</h3>
        <button type="button" className="icon-btn sm" aria-label="Close what's new" onClick={seen}><X size={16} /></button>
      </div>
      <ul>
        {WHATS_NEW.items.map((x) => (
          <li key={x.text}><span className="grow">{x.text}</span>{x.to && <Link className="link-btn small" to={x.to} onClick={seen}>Show me</Link>}</li>
        ))}
      </ul>
    </section>
  );
}

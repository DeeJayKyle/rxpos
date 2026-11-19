// The expiry calendar (UI batch 3, F1): a month grid with each batch in stock on its expiry date, shaded by how soon
// it expires; a batch opens its medicine's stock card. The Flutter app has the same in
// rxpos_flutter/lib/features/inventory/presentation/expiry_calendar.dart.
import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { formatQty } from '../money.js';
import { dateLocale } from '../showdate.js';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const pad = (n) => String(n).padStart(2, '0');
/** How urgent a batch is from its days left: expired, within 30 days, within the warning, later */
export const urgency = (days, warn) => (days < 0 ? 'expired' : days <= 30 ? 'urgent' : days <= warn ? 'soon' : 'later');

/** The weeks of a month (Monday first), each day as 'YYYY-MM-DD' or null outside the month */
export function monthGrid(year, month) {
  const first = new Date(year, month, 1), days = new Date(year, month + 1, 0).getDate();
  const lead = (first.getDay() + 6) % 7;
  const cells = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => `${year}-${pad(month + 1)}-${pad(i + 1)}`)];
  while (cells.length % 7) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7));
}

/** batches: [{ id, batch, expiry, qty, days, p }] (every batch in stock with an expiry); onOpen(batch) */
export default function ExpiryCalendar({ batches, warn, onOpen }) {
  const now = new Date();
  const [ym, setYm] = useState(() => {
    // start on the month of the next batch to expire (or this month)
    const next = batches.filter((b) => b.days >= 0).sort((a, b) => a.expiry.localeCompare(b.expiry))[0];
    return next ? [Number(next.expiry.slice(0, 4)), Number(next.expiry.slice(5, 7)) - 1] : [now.getFullYear(), now.getMonth()];
  });
  const [y, m] = ym;
  const byDay = useMemo(() => {
    const out = {};
    for (const b of batches) { const d = b.expiry.length === 7 ? b.expiry + '-01' : b.expiry.slice(0, 10); (out[d] ??= []).push(b); }
    return out;
  }, [batches]);
  const go = (k) => setYm(([yy, mm]) => { const d = new Date(yy, mm + k, 1); return [d.getFullYear(), d.getMonth()]; });
  const title = new Date(y, m, 1).toLocaleDateString(dateLocale(), { month: 'long', year: 'numeric' });
  const inMonth = batches.filter((b) => b.expiry.slice(0, 7) === `${y}-${pad(m + 1)}`).length;
  return (
    <div className="card exp-cal" aria-label="Expiry calendar">
      <div className="card-head">
        <button type="button" className="icon-btn" aria-label="Previous month" onClick={() => go(-1)}><ChevronLeft size={18} /></button>
        <h3 aria-live="polite">{title} <small className="muted">· {inMonth} batch{inMonth === 1 ? '' : 'es'}</small></h3>
        <button type="button" className="icon-btn" aria-label="Next month" onClick={() => go(1)}><ChevronRight size={18} /></button>
      </div>
      <div className="exp-cal-grid" role="grid">
        <div role="row" className="exp-cal-row head">{DAYS.map((d) => <div key={d} role="columnheader">{d}</div>)}</div>
        {monthGrid(y, m).map((week, w) => (
          <div key={w} role="row" className="exp-cal-row">
            {week.map((d, i) => (
              <div key={i} role="gridcell" className={'exp-cal-day' + (d ? '' : ' empty')} data-day={d || undefined}>
                {d && <span className="exp-cal-num">{Number(d.slice(8))}</span>}
                {(byDay[d] || []).slice(0, 3).map((b) => (
                  <button key={b.p.id + b.id} type="button" className={'exp-chip ' + urgency(b.days, warn)} onClick={() => onOpen(b)}
                    title={`${b.p.name} · batch ${b.batch} · ${formatQty(b.qty)} in stock · ${b.days < 0 ? `expired ${-b.days} days ago` : `expires in ${b.days} days`}`}>
                    {b.p.name}
                  </button>
                ))}
                {(byDay[d] || []).length > 3 && <small className="muted">+{byDay[d].length - 3} more</small>}
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="exp-cal-key muted small" aria-hidden="true">
        <span><i className="exp-chip expired" />Expired</span><span><i className="exp-chip urgent" />Within 30 days</span><span><i className="exp-chip soon" />Within {warn} days</span><span><i className="exp-chip later" />Later</span>
      </div>
    </div>
  );
}

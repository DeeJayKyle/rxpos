import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, CalendarPlus, Copy, Download, Repeat, CalendarClock, Trash2, Link2 } from 'lucide-react';
import { useStore, today, uid, put, del, audit, downloadFile } from '../store.jsx';
import { Modal, Empty } from '../ui.jsx';
import { toast, ask } from '../feedback.jsx';
import { calendarLink } from '../cloud.js';

const WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (date, n) => { const d = new Date(date + 'T00:00'); d.setDate(d.getDate() + n); return iso(d); };
const KINDS = { event: ['Event', 'teal'], refill: ['Refill due', 'violet'], expiry: ['Expiry', 'amber'] };

/** Does a (possibly repeating) event fall on this day? */
function occurs(e, day) {
  if (day < e.date) return false;
  if (e.until && day > e.until) return false;
  if (!e.repeat || e.repeat === 'none') return day === e.date;
  const a = new Date(e.date + 'T00:00'), b = new Date(day + 'T00:00');
  if (e.repeat === 'daily') return true;
  if (e.repeat === 'weekly') return Math.round((b - a) / 864e5) % 7 === 0;
  if (e.repeat === 'monthly') return a.getDate() === b.getDate();
  if (e.repeat === 'yearly') return a.getDate() === b.getDate() && a.getMonth() === b.getMonth();
  return false;
}

const googleLink = (e) => {
  const d = e.date.replace(/-/g, '');
  const dates = e.time ? `${d}T${e.time.replace(':', '')}00/${d}T${(e.endTime || e.time).replace(':', '')}00` : `${d}/${addDays(e.date, 1).replace(/-/g, '')}`;
  const rec = e.repeat && e.repeat !== 'none' ? `&recur=RRULE:FREQ=${e.repeat.toUpperCase()}` : '';
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(e.title)}&dates=${dates}&details=${encodeURIComponent(e.notes || '')}${rec}`;
};

function icsFile(events, name) {
  const esc = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//RxPOS//EN', `X-WR-CALNAME:${esc(name)}`];
  for (const e of events) {
    const d = e.date.replace(/-/g, '');
    L.push('BEGIN:VEVENT', `UID:${e.id}@rxpos`, `DTSTAMP:${stamp}`);
    if (e.time) L.push(`DTSTART:${d}T${e.time.replace(':', '')}00`, `DTEND:${d}T${(e.endTime && e.endTime > e.time ? e.endTime : e.time).replace(':', '')}00`);
    else L.push(`DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${addDays(e.date, 1).replace(/-/g, '')}`);
    if (e.repeat && e.repeat !== 'none') L.push(`RRULE:FREQ=${e.repeat.toUpperCase()}`);
    L.push(`SUMMARY:${esc(e.title)}`);
    if (e.notes) L.push(`DESCRIPTION:${esc(e.notes)}`);
    L.push('END:VEVENT');
  }
  L.push('END:VCALENDAR');
  return L.join('\r\n');
}

export default function Calendar() {
  const { db, update, user, branchId, batchesOf, products, syncCfg } = useStore();
  const [month, setMonth] = useState(() => today().slice(0, 7));
  const [day, setDay] = useState(today());
  const [edit, setEdit] = useState(null);
  const [link, setLink] = useState(null);

  useEffect(() => {
    if (!syncCfg.url || !syncCfg.key || !navigator.onLine) return;
    calendarLink(syncCfg).then((j) => setLink(j.url)).catch(() => setLink(null));
  }, [syncCfg.url, syncCfg.key]); // eslint-disable-line react-hooks/exhaustive-deps

  // Things RxPOS knows are coming: refills due and stock expiring
  const auto = useMemo(() => {
    const out = [];
    const names = new Map(db.customers.map((c) => [c.id, c.name]));
    for (const p of db.prescriptions) {
      if (p.status !== 'Dispensed' || !p.refillDays) continue;
      const due = addDays(p.dispensedOn || p.date, Number(p.refillDays));
      out.push({ id: 'rx-' + p.id, kind: 'refill', date: due, title: `Refill due: ${names.get(p.customerId) || 'patient'}`, notes: p.medications });
    }
    const limit = addDays(today(), 400);
    for (const p of products) {
      if (p.stock <= 0) continue;
      for (const b of batchesOf(p.id)) if (b.qty > 0 && b.expiry && b.expiry <= limit) out.push({ id: 'exp-' + b.id, kind: 'expiry', date: b.expiry, title: `Expires: ${p.name} (${b.qty} left, batch ${b.batch})` });
    }
    return out;
  }, [db.prescriptions, db.customers, products, batchesOf]);

  const onDay = (d) => [...db.events.filter((e) => occurs(e, d)).map((e) => ({ ...e, kind: 'event' })), ...auto.filter((e) => e.date === d)]
    .sort((a, b) => (a.time || '').localeCompare(b.time || ''));

  const first = new Date(month + '-01T00:00');
  const offset = (first.getDay() + 6) % 7;
  const start = addDays(month + '-01', -offset);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const shift = (n) => { const d = new Date(month + '-01T00:00'); d.setMonth(d.getMonth() + n); setMonth(iso(d).slice(0, 7)); };

  const save = (e) => {
    e.preventDefault();
    const { _new, kind, ...rec } = edit; // eslint-disable-line no-unused-vars
    update((d) => { put(d, 'events', { ...rec, title: rec.title.trim(), createdBy: rec.createdBy || user.name }); audit(d, user, _new ? 'Calendar event added' : 'Calendar event changed', `${rec.title} · ${rec.date}`, branchId); });
    toast(_new ? 'Event added. It syncs to every device and subscribed calendars.' : 'Event saved');
    setDay(rec.date); setEdit(null);
  };
  const remove = async (e) => {
    if (!(await ask({ title: `Delete "${e.title}"?`, danger: true, confirmText: 'Delete' }))) return;
    update((d) => { del(d, 'events', e.id); audit(d, user, 'Calendar event deleted', e.title, branchId); });
    setEdit(null);
  };
  const copy = (t) => navigator.clipboard?.writeText(t).then(() => toast('Link copied'), () => {});
  const agenda = onDay(day);

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Calendar</h1><div className="sub">Team events, refills due and expiring stock, synced to every device and to Google / Outlook / phone calendars</div></div>
        <button className="btn primary" onClick={() => setEdit({ _new: true, id: uid(), title: '', date: day, time: '', endTime: '', repeat: 'none', notes: '' })}><Plus size={16} />Add event</button>
      </div>
      <div className="cal-layout">
        <div className="card cal">
          <div className="row between cal-nav">
            <button className="icon-btn" onClick={() => shift(-1)} aria-label="Previous month"><ChevronLeft size={18} /></button>
            <h3>{first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h3>
            <div className="row gap"><button className="btn sm ghost" onClick={() => { setMonth(today().slice(0, 7)); setDay(today()); }}>Today</button>
              <button className="icon-btn" onClick={() => shift(1)} aria-label="Next month"><ChevronRight size={18} /></button></div>
          </div>
          <div className="cal-grid">
            {WEEK.map((w) => <div key={w} className="cal-head">{w}</div>)}
            {cells.map((c) => {
              const evs = onDay(c);
              return (
                <button key={c} className={'cal-day' + (c.slice(0, 7) !== month ? ' out' : '') + (c === today() ? ' today' : '') + (c === day ? ' sel' : '')} onClick={() => setDay(c)}>
                  <span className="cal-num">{Number(c.slice(8))}</span>
                  {evs.slice(0, 3).map((e) => <span key={e.id} className={'cal-ev ' + KINDS[e.kind][1]}>{e.time ? e.time + ' ' : ''}{e.title}</span>)}
                  {evs.length > 3 && <span className="cal-more">+{evs.length - 3} more</span>}
                </button>
              );
            })}
          </div>
        </div>
        <div className="stack">
          <div className="card">
            <h3>{new Date(day + 'T00:00').toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</h3>
            <div className="agenda">
              {agenda.map((e) => (
                <div key={e.id} className={'agenda-item ' + KINDS[e.kind][1]}>
                  <div className="grow">
                    <strong>{e.time ? `${e.time}${e.endTime ? '–' + e.endTime : ''} · ` : ''}{e.title}</strong>
                    <small className="muted">{KINDS[e.kind][0]}{e.repeat && e.repeat !== 'none' ? <> · <Repeat size={11} /> {e.repeat}</> : ''}{e.notes ? ' · ' + e.notes : ''}</small>
                  </div>
                  <a className="icon-btn" title="Add to Google Calendar" target="_blank" rel="noreferrer" href={googleLink(e)}><CalendarPlus size={16} /></a>
                  {e.kind === 'event' && <button className="btn sm ghost" onClick={() => setEdit(db.events.find((x) => x.id === e.id))}>Edit</button>}
                </div>
              ))}
              {!agenda.length && <Empty>Nothing on this day</Empty>}
            </div>
          </div>
          <div className="card">
            <h3><Link2 size={17} />Sync with your calendar</h3>
            {link ? (
              <>
                <p className="muted small">Subscribe once and all events, refills and expiries appear in your calendar and update by themselves (Google checks every few hours).</p>
                <div className="row gap"><code className="keybox grow">{link}</code><button className="btn ghost" onClick={() => copy(link)}><Copy size={16} />Copy</button></div>
                <div className="row gap" style={{ marginTop: 10 }}>
                  <a className="btn sm primary" target="_blank" rel="noreferrer" href={`https://calendar.google.com/calendar/render?cid=${encodeURIComponent(link.replace(/^https:/, 'webcal:'))}`}><CalendarPlus size={14} />Add to Google Calendar</a>
                  <a className="btn sm ghost" href={link.replace(/^https:/, 'webcal:')}>Apple / Outlook / phone</a>
                </div>
                <p className="muted small">Outlook: Add calendar → Subscribe from web → paste the link. Keep the link private: anyone with it can see these events.</p>
              </>
            ) : <p className="muted small">{navigator.onLine ? 'Connecting to the cloud…' : 'Go online to get your calendar subscription link.'}</p>}
            <button className="btn sm ghost" onClick={() => downloadFile(`rxpos-calendar-${today()}.ics`, icsFile([...db.events, ...auto.filter((e) => e.date >= today())], db.settings.name + ' · RxPOS'), 'text/calendar')}><Download size={14} />Download .ics file</button>
          </div>
          <div className="legend row gap small"><span className="cal-ev teal">Event</span><span className="cal-ev violet">Refill due</span><span className="cal-ev amber"><CalendarClock size={11} /> Expiry</span></div>
        </div>
      </div>

      {edit && (
        <Modal title={edit._new ? 'Add event' : 'Edit event'} onClose={() => setEdit(null)}>
          <form onSubmit={save}>
            <div className="form-grid">
              <label className="field full"><span>What</span><input required autoFocus value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} placeholder="e.g. NDA inspection, supplier delivery, staff meeting" /></label>
              <label className="field"><span>Date</span><input type="date" required value={edit.date} onChange={(e) => setEdit({ ...edit, date: e.target.value })} /></label>
              <label className="field"><span>Repeats</span><select value={edit.repeat || 'none'} onChange={(e) => setEdit({ ...edit, repeat: e.target.value })}>
                <option value="none">Does not repeat</option><option value="daily">Every day</option><option value="weekly">Every week</option><option value="monthly">Every month</option><option value="yearly">Every year</option></select></label>
              <label className="field"><span>Starts (optional)</span><input type="time" value={edit.time || ''} onChange={(e) => setEdit({ ...edit, time: e.target.value })} /></label>
              <label className="field"><span>Ends</span><input type="time" value={edit.endTime || ''} onChange={(e) => setEdit({ ...edit, endTime: e.target.value })} /></label>
              <label className="field full"><span>Notes</span><textarea rows={2} value={edit.notes || ''} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} /></label>
            </div>
            <div className="form-actions">
              {!edit._new && <button type="button" className="btn danger" onClick={() => remove(edit)}><Trash2 size={16} />Delete</button>}
              <button type="button" className="btn ghost" onClick={() => setEdit(null)}>Cancel</button><button className="btn primary">Save</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

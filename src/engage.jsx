// Things that help the pharmacy sell and stay on top of the day, without getting in the way:
//  • Spotlight: when nobody has touched the app for a while, a slideshow of items worth pushing (short expiry,
//    slow moving, high value, best margin) with a one-tap WhatsApp share for customers. Any touch closes it.
//  • Hourly reminder: a soft chime and a short card at the top of each hour with what needs doing.
//  • Notification bell: today's alerts in one place.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CalendarClock, PackageX, Repeat, CalendarDays, Thermometer, X, Share2, ChevronRight, ChevronLeft, Clock, Pill, Syringe, Droplet, FlaskConical, Sparkles, Tablets, Bandage, TrendingUp, Hourglass, Gem, Timer } from 'lucide-react';
import { useStore, daysUntil, daysSince, today } from './store.jsx';
import { whatsappLink } from './cloud.js';
import { storageLimits } from './weather.js';

const addDays = (date, n) => new Date(new Date(date).getTime() + n * 864e5).toISOString().slice(0, 10);

// ---------- what to promote ----------
export function useInsights() {
  const { db, products } = useStore();
  return useMemo(() => {
    const warn = db.settings.expiryWarnDays || 90;
    const inStock = products.filter((p) => p.stock > 0 && p.price > 0);
    const lastSold = new Map();
    let oldest = today();
    for (const s of db.sales) {
      if (s.status === 'refunded') continue;
      const d = String(s.date).slice(0, 10);
      if (d < oldest) oldest = d;
      for (const i of s.items) if ((lastSold.get(i.id) || '') < d) lastSold.set(i.id, d);
    }
    const slowAfter = Math.min(db.settings.deadDays || 90, 60);
    const haveHistory = daysSince(oldest) >= slowAfter; // only call items "slow" once there is enough sales history
    const margin = (p) => (p.price > 0 && p.cost > 0 ? (p.price - p.cost) / p.price : 0);
    const shortExpiry = inStock.filter((p) => p.expiry && daysUntil(p.expiry) >= 0 && daysUntil(p.expiry) <= warn)
      .sort((a, b) => a.expiry.localeCompare(b.expiry)).slice(0, 10).map((p) => ({ kind: 'expiry', p, note: `Expires in ${daysUntil(p.expiry)} days · ${p.stock} in stock`, staff: 'Short expiry' }));
    const slow = haveHistory ? inStock.filter((p) => { const l = lastSold.get(p.id); return !l || daysSince(l) >= slowAfter; })
      .sort((a, b) => b.stock * (b.cost || b.price) - a.stock * (a.cost || a.price)).slice(0, 10)
      .map((p) => ({ kind: 'slow', p, note: lastSold.get(p.id) ? `No sale for ${daysSince(lastSold.get(p.id))} days · ${p.stock} in stock` : `Not sold yet · ${p.stock} in stock`, staff: 'Recommend it' })) : [];
    const highValue = [...inStock].sort((a, b) => b.price - a.price).slice(0, 8).map((p) => ({ kind: 'value', p, note: `${p.stock} in stock`, staff: 'High value' }));
    const highMargin = inStock.filter((p) => margin(p) >= 0.25).sort((a, b) => margin(b) - margin(a)).slice(0, 10)
      .map((p) => ({ kind: 'margin', p, note: `${Math.round(margin(p) * 100)}% margin · ${p.stock} in stock`, staff: 'Suggest it' }));
    return { shortExpiry, slow, highValue, highMargin };
  }, [db.sales, db.settings.expiryWarnDays, db.settings.deadDays, products]);
}

const KIND = {
  expiry: { label: 'Sell first', Icon: Hourglass, tone: 'amber' },
  slow: { label: 'Slow mover', Icon: Timer, tone: 'violet' },
  value: { label: 'Premium', Icon: Gem, tone: 'teal' },
  margin: { label: 'Top margin', Icon: TrendingUp, tone: 'green' },
};
const formIcon = (form = '') => {
  const f = form.toLowerCase();
  if (/inject|infusion|vaccine/.test(f)) return Syringe;
  if (/syrup|suspension|drop|lotion|liquid/.test(f)) return Droplet;
  if (/cream|ointment|gel|cosmetic/.test(f)) return Sparkles;
  if (/capsule|tablet/.test(f)) return Pill;
  if (/surgical|device|sundr/.test(f)) return Bandage;
  if (/powder|sachet/.test(f)) return FlaskConical;
  if (/tablet/.test(f)) return Tablets;
  return Pill;
};

export function shareText(p, settings, fmt) {
  const where = [settings.name, settings.address].filter(Boolean).join(', ');
  return `💊 *${p.name}*${p.generic && p.generic !== p.name ? ` (${p.generic})` : ''} is available at ${where || 'our pharmacy'} for ${fmt(p.price)}.` +
    `${settings.phone ? ` Call or WhatsApp ${settings.phone}.` : ''} Ask our pharmacist for advice. Get well soon!`;
}

function useIdle(ms, enabled) {
  const [idle, setIdle] = useState(false);
  const idleRef = useRef(false);
  const armRef = useRef(() => {});
  useEffect(() => {
    if (!enabled) { idleRef.current = false; setIdle(false); return; }
    let t;
    const arm = () => {
      clearTimeout(t);
      t = setTimeout(() => { if (document.visibilityState === 'visible') { idleRef.current = true; setIdle(true); } else arm(); }, ms);
    };
    const onActivity = (e) => {
      if (!idleRef.current) return arm();
      if (e.type === 'pointermove' || e.type === 'wheel') return; // looking is fine; a tap or a key closes it
      // close just after the tap ends, so the tap lands on the overlay and never clicks what is underneath
      setTimeout(() => { idleRef.current = false; setIdle(false); arm(); }, 250);
    };
    armRef.current = () => { idleRef.current = false; setIdle(false); arm(); };
    const evs = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'];
    evs.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    arm();
    return () => { clearTimeout(t); evs.forEach((e) => window.removeEventListener(e, onActivity)); };
  }, [ms, enabled]);
  return [idle, () => armRef.current()];
}

/** Idle-screen promotions */
export function Spotlight() {
  const { db, fmt, features } = useStore();
  const minutes = Number(db.settings.idleMinutes ?? 3);
  const [idle, wake] = useIdle(Math.max(minutes, 0.5) * 60000, features.promos !== false && minutes > 0);
  const ins = useInsights();
  const slides = useMemo(() => {
    // interleave the lists so the slideshow mixes kinds
    const lists = [ins.shortExpiry, ins.highMargin, ins.slow, ins.highValue];
    const out = [], seen = new Set();
    for (let i = 0; i < 10; i++) for (const l of lists) if (l[i] && !seen.has(l[i].p.id)) { seen.add(l[i].p.id); out.push(l[i]); }
    return out;
  }, [ins]);
  const [i, setI] = useState(0);
  useEffect(() => { if (!idle) return; setI(0); const t = setInterval(() => setI((x) => x + 1), 7000); return () => clearInterval(t); }, [idle]);
  if (!idle || !slides.length) return null;
  const s = slides[i % slides.length];
  const k = KIND[s.kind];
  const FormIcon = formIcon(s.p.form);
  const stop = (e) => e.stopPropagation();
  return (
    <div className="spotlight" onClick={wake} role="dialog" aria-label="Product spotlight">
      <div className={'spot-card tone-' + k.tone} key={s.p.id} onPointerDown={stop} onClick={stop}>
        <div className="spot-art" aria-hidden="true">
          <span className="bubble b1" /><span className="bubble b2" /><span className="bubble b3" />
          <FormIcon size={120} strokeWidth={1.3} />
        </div>
        <div className="spot-body">
          <span className="spot-kind"><k.Icon size={15} />{k.label} · {s.staff}</span>
          <h2>{s.p.name}</h2>
          {s.p.generic && s.p.generic !== s.p.name && <p className="spot-generic">{s.p.generic}{s.p.form ? ` · ${s.p.form}` : ''}</p>}
          <div className="spot-price">{fmt(s.p.price)}</div>
          <p className="spot-note">{s.note}</p>
          <div className="row gap">
            <a className="btn primary" target="_blank" rel="noreferrer" href={whatsappLink('', shareText(s.p, db.settings, fmt))}><Share2 size={16} />Share on WhatsApp</a>
            <button className="btn ghost" onClick={() => setI((x) => x + slides.length - 1)}><ChevronLeft size={16} /></button>
            <button className="btn ghost" onClick={() => setI((x) => x + 1)}><ChevronRight size={16} /></button>
            <button className="btn ghost" onClick={wake}><X size={16} />Close</button>
          </div>
        </div>
        <div className="spot-dots">{slides.slice(0, 12).map((x, j) => <i key={x.p.id} className={j === i % slides.length ? 'on' : ''} />)}</div>
      </div>
      <p className="spot-hint">{db.settings.name} · touch anywhere to continue working</p>
    </div>
  );
}

// ---------- today's alerts ----------
export function useAlerts() {
  const { db, products, can } = useStore();
  return useMemo(() => {
    const t = today();
    const warn = db.settings.expiryWarnDays || 90;
    const out = [];
    const expired = products.filter((p) => p.stock > 0 && p.expiry && daysUntil(p.expiry) < 0).length;
    const expSoon = products.filter((p) => p.stock > 0 && p.expiry && daysUntil(p.expiry) >= 0 && daysUntil(p.expiry) <= Math.min(warn, 30)).length;
    const low = products.filter((p) => p.reorder > 0 && p.stock <= p.reorder).length;
    const refills = db.prescriptions.filter((r) => r.status === 'Dispensed' && r.refillDays && addDays(r.dispensedOn || r.date, Number(r.refillDays)) <= t).length;
    const events = db.events.filter((e) => e.date === t);
    const lim = storageLimits(db.settings);
    const lastReading = [...db.tempLogs].sort((a, b) => String(b.at).localeCompare(String(a.at)))[0];
    const badReading = lastReading && ((lastReading.place === 'Fridge' && (lastReading.temp < lim.fridgeMin || lastReading.temp > lim.fridgeMax)) || (lastReading.place !== 'Fridge' && lastReading.temp > lim.roomMax));
    if (expired && can('inventory.view')) out.push({ tone: 'danger', Icon: CalendarClock, text: `${expired} item${expired > 1 ? 's' : ''} expired but still in stock`, to: '/expiry' });
    if (expSoon && can('inventory.view')) out.push({ tone: 'warn', Icon: CalendarClock, text: `${expSoon} item${expSoon > 1 ? 's' : ''} expire within 30 days: sell first`, to: '/expiry' });
    if (low && can('inventory.view')) out.push({ tone: 'warn', Icon: PackageX, text: `${low} item${low > 1 ? 's' : ''} at or below reorder level`, to: '/reorder' });
    if (refills && can('prescriptions')) out.push({ tone: 'info', Icon: Repeat, text: `${refills} refill${refills > 1 ? 's' : ''} due: remind the patients`, to: '/reminders' });
    for (const e of events) out.push({ tone: 'info', Icon: CalendarDays, text: `${e.time ? e.time + ' · ' : ''}${e.title}`, to: '/calendar' });
    if (badReading) out.push({ tone: 'danger', Icon: Thermometer, text: `${lastReading.place} reading ${lastReading.temp}°C is out of range`, to: '/storage' });
    return out;
  }, [db.prescriptions, db.events, db.tempLogs, db.settings, products, can]);
}

export function NotificationBell() {
  const alerts = useAlerts();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const ref = useRef();
  useEffect(() => {
    if (!open) return;
    const off = (e) => !ref.current?.contains(e.target) && setOpen(false);
    window.addEventListener('pointerdown', off);
    return () => window.removeEventListener('pointerdown', off);
  }, [open]);
  const urgent = alerts.filter((a) => a.tone === 'danger').length;
  return (
    <div className="bell" ref={ref}>
      <button className="icon-btn" title="Notifications" onClick={() => setOpen((o) => !o)}>
        <Bell size={19} />{alerts.length > 0 && <span className={'bell-dot' + (urgent ? ' danger' : '')}>{alerts.length}</span>}
      </button>
      {open && (
        <div className="bell-menu">
          <div className="bell-head">Today</div>
          {alerts.map((a, i) => (
            <button key={i} className={'bell-item ' + a.tone} onClick={() => { setOpen(false); navigate(a.to); }}><a.Icon size={16} /><span>{a.text}</span><ChevronRight size={14} /></button>
          ))}
          {!alerts.length && <div className="empty">All clear. Nothing needs attention.</div>}
        </div>
      )}
    </div>
  );
}

// ---------- hourly reminder ----------
function chime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [[880, 0], [1318.5, 0.18]].forEach(([f, at]) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + at);
      g.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + 0.9);
      o.connect(g).connect(ctx.destination); o.start(ctx.currentTime + at); o.stop(ctx.currentTime + at + 1);
    });
    setTimeout(() => ctx.close(), 1500);
  } catch {}
}

export function HourlyReminder() {
  const { db, features } = useStore();
  const alerts = useAlerts();
  const alertsRef = useRef(alerts);
  alertsRef.current = alerts;
  const [card, setCard] = useState(null);
  const on = features.hourly !== false && db.settings.hourlyChime !== false;
  const quietFrom = Number(db.settings.quietFrom ?? 21), quietTo = Number(db.settings.quietTo ?? 7);
  const sound = db.settings.hourlySound !== false;

  useEffect(() => {
    if (!on) return;
    let t;
    const arm = () => {
      const now = new Date();
      const next = new Date(now); next.setMinutes(0, 0, 0); next.setHours(now.getHours() + 1);
      t = setTimeout(fire, next - now + 500);
    };
    const fire = () => {
      const h = new Date().getHours();
      const quiet = quietFrom > quietTo ? h >= quietFrom || h < quietTo : h >= quietFrom && h < quietTo;
      if (!quiet) {
        const time = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
        const extra = [];
        if (h === 9 || h === 15) extra.push({ tone: 'info', Icon: Thermometer, text: 'Record the fridge and room temperature', to: '/storage' });
        const items = [...alertsRef.current.slice(0, 3), ...extra];
        setCard({ time, items, at: Date.now() });
        if (sound) chime();
        if (document.visibilityState === 'hidden' && 'Notification' in window && Notification.permission === 'granted') {
          try { new Notification(`RxPOS · ${time}`, { body: items.map((x) => x.text).join('\n') || 'All clear. Have a good hour!', icon: './favicon.svg', tag: 'rxpos-hourly' }); } catch {}
        }
      }
      arm();
    };
    arm();
    return () => clearTimeout(t);
  }, [on, quietFrom, quietTo, sound]);

  useEffect(() => { if (!card) return; const t = setTimeout(() => setCard(null), 20000); return () => clearTimeout(t); }, [card]);
  const navigate = useNavigate();
  if (!card) return null;
  return (
    <div className="hour-card" role="status">
      <div className="hour-head"><Clock size={18} /><strong>It's {card.time}</strong><button className="icon-btn" onClick={() => setCard(null)} aria-label="Dismiss"><X size={16} /></button></div>
      {card.items.length ? card.items.map((a, i) => <button key={i} className={'bell-item ' + a.tone} onClick={() => { setCard(null); navigate(a.to); }}><a.Icon size={15} /><span>{a.text}</span></button>)
        : <p className="muted small">All clear. Have a good hour!</p>}
    </div>
  );
}

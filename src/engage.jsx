// Things that help the pharmacy sell and stay on top of the day, without getting in the way:
//  • Spotlight: when nobody has touched the app for a while, a slideshow of items worth pushing (short expiry,
//    slow moving, high value, best margin) with a one-tap WhatsApp share for customers. Any touch closes it.
//  • Hourly reminder: a soft chime and a short card at the top of each hour with what needs doing.
//  • Notification bell: today's alerts in one place.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { Bell, CalendarClock, PackageX, Repeat, CalendarDays, Thermometer, X, Share2, ChevronRight, ChevronLeft, Clock, TrendingUp, Hourglass, Gem, Timer, ThermometerSun, CloudRain, MessagesSquare, HeartPulse, Users, PhoneMissed, Play, Pause } from 'lucide-react';
import { useStore, daysUntil, daysSince, today, dayOf, put, isLowStock, expiryCounts } from './store.jsx';
import { whatsappLink } from './cloud.js';
import { storageLimits, useWeather, sixHourReadings } from './weather.js';
import { popup, systemNotify, soundsOn, setSounds } from './notify.jsx';
import { tipFor, HEALTH_TIPS } from './data/health-tips.js';
import { isFeaturable } from './promote.js';
import { ProductArt, TipArt } from './idleart.jsx';
import { messagePreview } from './pages/Chat.jsx';

const addDays = (date, n) => new Date(new Date(date).getTime() + n * 864e5).toISOString().slice(0, 10); // plain dates: UTC arithmetic is exact

// ---------- what to promote ----------
export function useInsights() {
  const { db, products } = useStore();
  return useMemo(() => {
    const warn = db.settings.expiryWarnDays || 90;
    // The idle screen faces customers, so never feature prescription-only or controlled medicines.
    const inStock = products.filter(isFeaturable);
    const lastSold = new Map();
    let oldest = today();
    for (const s of db.sales) {
      if (s.status === 'refunded') continue;
      const d = dayOf(s.date);
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
      if (e.type === 'pointermove' || e.type === 'wheel') return; // looking is fine
      // browsing the slides (arrows, swipes, the thumbnails, keys ← → space) keeps it open; outside taps and other keys close it
      if (e.target?.closest?.('.spot-stage') || (e.type === 'keydown' && ['ArrowLeft', 'ArrowRight', ' ', 'Tab', 'Enter'].includes(e.key))) return;
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

/** Idle screen: the pharmacy's own "shop window". Medicines worth recommending, mixed with health tips, each with a
 *  picture. Browse with the arrows, a swipe, the thumbnails or the keyboard; it moves on by itself every 8 seconds. */
export function Spotlight() {
  const { db, fmt, features } = useStore();
  const minutes = Number(db.settings.idleMinutes ?? 3);
  const [idle, wake] = useIdle(Math.max(minutes, 0.5) * 60000, features.promos !== false && minutes > 0);
  const ins = useInsights();
  const slides = useMemo(() => {
    // interleave the lists so the slideshow mixes kinds, with a health tip after every third medicine
    const lists = [ins.shortExpiry, ins.highMargin, ins.slow, ins.highValue];
    const items = [], seen = new Set();
    for (let i = 0; i < 10; i++) for (const l of lists) if (l[i] && !seen.has(l[i].p.id)) { seen.add(l[i].p.id); items.push({ ...l[i], id: l[i].p.id }); }
    const start = Math.floor(Date.now() / 864e5) * 3;
    const tips = Array.from({ length: 5 }, (_, i) => HEALTH_TIPS[(start + i) % HEALTH_TIPS.length]).map(([text, source], i) => ({ kind: 'tip', id: 'tip' + i, text, source }));
    const out = [];
    items.slice(0, 18).forEach((x, i) => { out.push(x); if (i % 3 === 2 && tips.length) out.push(tips.shift()); });
    if (tips.length === 5) out.push(...tips.slice(0, items.length ? 2 : 5)); // few medicines to show: still mix in some tips
    return out;
  }, [ins]);
  const [i, setI] = useState(0);
  const [dir, setDir] = useState(1);
  const [paused, setPaused] = useState(false);
  const swipe = useRef(null), strip = useRef(null);
  const go = (n, d = n > i ? 1 : -1) => { setDir(d); setI((n + slides.length) % slides.length); };
  const next = () => go(i + 1, 1), prev = () => go(i - 1, -1);
  useEffect(() => { if (idle) { setI(0); setPaused(false); } }, [idle]);
  useEffect(() => { if (!idle || paused || slides.length < 2) return; const t = setTimeout(next, 8000); return () => clearTimeout(t); }); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!idle) return;
    const onKey = (e) => { if (e.key === 'ArrowRight') next(); else if (e.key === 'ArrowLeft') prev(); else if (e.key === ' ') { e.preventDefault(); setPaused((v) => !v); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  useEffect(() => { strip.current?.querySelector('.on')?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' }); }, [i]);
  if (!idle || !slides.length) return null;
  const s = slides[i % slides.length];
  const tone = s.kind === 'tip' ? 'sky' : KIND[s.kind].tone;
  const hour = new Date().getHours();
  return (
    <div className="spotlight" role="dialog" aria-label="Shop window" onClick={(e) => e.target === e.currentTarget && wake()}>
      <div className="spot-stage">
        <div className="spot-top">
          <div className="spot-progress">{slides.map((x, j) => <i key={x.id} className={j < i ? 'done' : j === i ? 'on' + (paused ? ' paused' : '') : ''} onClick={() => go(j)} />)}</div>
          <span className="spot-count">{i + 1} / {slides.length}</span>
          <button className="spot-icon" onClick={() => setPaused((v) => !v)} aria-label={paused ? 'Play' : 'Pause'} title={paused ? 'Play' : 'Pause'}>{paused ? <Play size={18} /> : <Pause size={18} />}</button>
          <button className="spot-icon spot-close" onClick={wake} aria-label="Close" title="Close (Esc)"><X size={20} /><span>Close</span></button>
        </div>
        <div className="spot-row">
          <button className="spot-arrow" onClick={prev} aria-label="Previous"><ChevronLeft size={26} /></button>
          <div className={'spot-card tone-' + tone + (dir > 0 ? ' from-right' : ' from-left')} key={s.id}
            onPointerDown={(e) => { swipe.current = e.clientX; }} onPointerUp={(e) => { const dx = e.clientX - (swipe.current ?? e.clientX); swipe.current = null; if (Math.abs(dx) > 50) (dx < 0 ? next : prev)(); }}>
            <div className="spot-art" aria-hidden="true">
              <span className="orb o1" /><span className="orb o2" /><span className="orb o3" />
              {s.kind === 'tip' ? <TipArt text={s.text} /> : <ProductArt p={s.p} />}
            </div>
            {s.kind === 'tip' ? (
              <div className="spot-body">
                <span className="spot-kind"><HeartPulse size={15} />{hour < 12 ? 'Morning' : hour < 17 ? 'Afternoon' : 'Evening'} health tip</span>
                <h2 className="spot-tip">{s.text}</h2>
                <p className="spot-note">Source: {s.source}. Ask the pharmacist if you have questions.</p>
                <div className="row gap"><a className="btn primary" target="_blank" rel="noreferrer" href={whatsappLink('', `💚 Health tip from ${db.settings.name || 'your pharmacy'}: ${s.text} (${s.source})`)}><Share2 size={16} />Share this tip</a></div>
              </div>
            ) : (() => { const k = KIND[s.kind]; return (
              <div className="spot-body">
                <span className="spot-kind"><k.Icon size={15} />Available now</span>
                <h2>{s.p.name}</h2>
                {s.p.generic && s.p.generic !== s.p.name && <p className="spot-generic">{s.p.generic}{s.p.form ? ` · ${s.p.form}` : ''}</p>}
                <div className="spot-price">{fmt(s.p.price)}</div>
                <p className="spot-note">In stock at {db.settings.name || 'our pharmacy'} — ask our pharmacist for advice.</p>
                <div className="row gap"><a className="btn primary" target="_blank" rel="noreferrer" href={whatsappLink('', shareText(s.p, db.settings, fmt))}><Share2 size={16} />Share on WhatsApp</a></div>
              </div>
            ); })()}
          </div>
          <button className="spot-arrow" onClick={next} aria-label="Next"><ChevronRight size={26} /></button>
        </div>
        <div className="spot-strip" ref={strip}>
          {slides.map((x, j) => (
            <button key={x.id} className={'spot-thumb tone-' + (x.kind === 'tip' ? 'sky' : KIND[x.kind].tone) + (j === i ? ' on' : '')} onClick={() => go(j)} title={x.kind === 'tip' ? 'Health tip' : x.p.name}>
              <span className="thumb-art">{x.kind === 'tip' ? <TipArt text={x.text} size={34} /> : <ProductArt p={x.p} size={34} />}</span>
              <span className="thumb-name">{x.kind === 'tip' ? 'Health tip' : x.p.name}</span>
            </button>
          ))}
        </div>
      </div>
      <p className="spot-hint">{db.settings.name} · tap outside or press Esc to get back to work</p>
    </div>
  );
}

// ---------- today's alerts ----------
export function useAlerts() {
  const { db, products, can, features, batchesOf, day } = useStore();
  const ins = useInsights();
  const [{ data: wx }] = useWeather(db.settings);
  return useMemo(() => {
    const t = today();
    const warn = db.settings.expiryWarnDays || 90;
    const out = [];
    const ec = expiryCounts(products, batchesOf, Math.min(warn, 30));
    const expired = ec.expired, expSoon = ec.soon;
    const low = products.filter(isLowStock).length;
    const refills = db.prescriptions.filter((r) => r.status === 'Dispensed' && r.refillDays && addDays(r.dispensedOn || r.date, Number(r.refillDays)) <= t).length;
    const events = db.events.filter((e) => e.date === t);
    const lim = storageLimits(db.settings);
    const lastReading = [...db.tempLogs].filter((r) => r.place !== 'Outside').sort((a, b) => String(b.at).localeCompare(String(a.at)))[0];
    const badReading = lastReading && ((lastReading.place === 'Fridge' && (lastReading.temp < lim.fridgeMin || lastReading.temp > lim.fridgeMax)) || (lastReading.place !== 'Fridge' && lastReading.temp > lim.roomMax));
    const inv = can('inventory.view');
    if (expired && inv) out.push({ key: 'expired', tone: 'danger', Icon: CalendarClock, text: `${expired} item${expired > 1 ? 's' : ''} expired but still in stock`, to: '/expiry', n: expired });
    if (expSoon && inv) out.push({ key: 'expiring', tone: 'warn', Icon: CalendarClock, text: `${expSoon} item${expSoon > 1 ? 's expire' : ' expires'} within 30 days: sell first`, to: '/expiry', n: expSoon });
    if (low && inv) out.push({ key: 'low', tone: 'warn', Icon: PackageX, text: `${low} item${low > 1 ? 's' : ''} at or below reorder level`, to: '/reorder', n: low });
    if (ins.slow.length && inv) out.push({ key: 'slow', tone: 'info', Icon: Timer, text: `${ins.slow.length}${ins.slow.length >= 10 ? '+' : ''} slow-moving items: recommend or promote them`, to: '/reorder', n: ins.slow.length });
    if (refills && can('prescriptions')) out.push({ key: 'refills', tone: 'info', Icon: Repeat, text: `${refills} refill${refills > 1 ? 's' : ''} due: remind the patients`, to: '/reminders', n: refills });
    for (const e of events) out.push({ key: 'ev-' + e.id, tone: 'info', Icon: CalendarDays, text: `${e.time ? e.time + ' · ' : ''}${e.title}`, to: '/calendar', n: 1 });
    if (badReading) out.push({ key: 'reading-' + lastReading.id, tone: 'danger', Icon: Thermometer, text: `${lastReading.place} reading ${lastReading.temp}°C is out of range`, to: '/storage', n: 1 });
    if (wx && features.weather !== false) {
      const now = wx.current?.temperature_2m, max = wx.daily?.temperature_2m_max?.[1];
      if (now >= lim.hotAlert || max >= lim.hotAlert) out.push({ key: 'hot', tone: 'danger', Icon: ThermometerSun, text: now >= lim.hotAlert ? `It's ${Math.round(now)}°C outside: keep medicines cool and check the room thermometer` : `Up to ${Math.round(max)}°C expected today: keep medicines cool`, to: '/storage', n: 1 });
      const rainToday = wx.daily?.precipitation_probability_max?.[1], rainTomorrow = wx.daily?.precipitation_probability_max?.[2];
      if (rainToday >= 60) out.push({ key: 'rain', tone: 'info', Icon: CloudRain, text: `Rain likely today (${rainToday}%): protect deliveries and keep stock off the floor`, to: '/storage', n: 1 });
      else if (rainTomorrow >= 60) out.push({ key: 'rain-tomorrow', tone: 'info', Icon: CloudRain, text: `Rain likely tomorrow (${rainTomorrow}%)`, to: '/storage', n: 1 });
    }
    return out;
  }, [db.prescriptions, db.events, db.tempLogs, db.settings, products, batchesOf, day, can, ins.slow, wx, features.weather]);
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
          {!alerts.length && <div className="empty">All quiet. Nothing needs you right now.</div>}
          <label className="bell-sound"><input type="checkbox" defaultChecked={soundsOn()} onChange={(e) => setSounds(e.target.checked)} /> Sounds on this device</label>
        </div>
      )}
    </div>
  );
}

const quietNow = (s) => {
  const h = new Date().getHours(), from = Number(s.quietFrom ?? 21), to = Number(s.quietTo ?? 7);
  return from > to ? h >= from || h < to : h >= from && h < to;
};
const seenKey = 'rxpos-announced';
const announced = () => { try { const j = JSON.parse(localStorage.getItem(seenKey) || '{}'); return j.day === today() ? j : { day: today(), keys: {} }; } catch { return { day: today(), keys: {} }; } };

/** Pop-up + sound when an alert appears (or grows), at most once per kind per day */
export function AlertWatcher() {
  const { db } = useStore();
  const alerts = useAlerts();
  useEffect(() => {
    if (quietNow(db.settings) || !alerts.length) return;
    const seen = announced();
    const fresh = alerts.filter((a) => (seen.keys[a.key] ?? -1) < a.n);
    if (!fresh.length) return;
    const t = setTimeout(() => {
      for (const a of fresh) seen.keys[a.key] = a.n;
      try { localStorage.setItem(seenKey, JSON.stringify(seen)); } catch {}
      const top = fresh.slice(0, 3);
      popup({ id: 'alerts', tone: top.some((a) => a.tone === 'danger') ? 'danger' : 'warn', icon: Bell, title: fresh.length === 1 ? 'Needs attention' : `${fresh.length} things need attention`, sound: 'alert',
        render: (close) => <div className="popup-list">{top.map((a) => <Link key={a.key} className={'bell-item ' + a.tone} to={a.to} onClick={close}><a.Icon size={15} /><span>{a.text}</span></Link>)}</div> });
      systemNotify('RxPOS', top.map((a) => a.text).join('\n'));
    }, 4000); // let the first sync settle
    return () => clearTimeout(t);
  }, [alerts, db.settings]);
  return null;
}

/** Pop-up + sound for new team messages (and client replies logged by colleagues) */
export function MessageWatcher() {
  const { db, user } = useStore();
  const location = useLocation();
  const since = useRef(null);
  useEffect(() => {
    const mine = (m) => !m.auto && !m.deleted && m.call?.status !== 'done' && m.fromId !== user.id && (m.conv === 'team' || (m.conv.startsWith('dm:') && m.conv.includes(user.id)) || (m.conv.startsWith('client:') && m.channel === 'reply'));
    const latest = db.messages.reduce((a, m) => (m.date > a ? m.date : a), '');
    if (since.current === null) { since.current = latest; return; } // don't announce old messages on start
    const fresh = db.messages.filter((m) => m.date > since.current && mine(m)).sort((a, b) => a.date.localeCompare(b.date));
    since.current = latest > since.current ? latest : since.current;
    if (!fresh.length || location.pathname === '/chat') return;
    const m = fresh[fresh.length - 1];
    const where = m.conv === 'team' ? 'General' : m.conv.startsWith('dm:') ? 'Private' : 'Client reply';
    const body = (fresh.length > 1 ? `(${fresh.length} new) ` : '') + messagePreview(m).slice(0, 180);
    popup({ id: 'msg', tone: m.call ? 'warn' : 'info', icon: m.call ? PhoneMissed : MessagesSquare, title: m.call ? `${m.fromName} tried to call you` : `${m.fromName || 'Message'} · ${where}`, body: m.call ? 'Missed voice call' : body, to: '/chat', sound: 'message' });
    systemNotify(m.call ? `Missed call from ${m.fromName}` : `${m.fromName} · ${where}`, m.call ? 'Open RxPOS to call back' : messagePreview(m).slice(0, 120), { tag: 'msg' });
  }, [db.messages]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

/** Outside temperature & humidity logged automatically every 6 hours (from the weather service; no gaps when the app was closed) */
export function WeatherLogger() {
  const { db, update, branchId, features } = useStore();
  const [{ data, place }] = useWeather(db.settings);
  useEffect(() => {
    if (!data || features.weather === false) return;
    const have = new Set(db.tempLogs.map((r) => r.id));
    const add = sixHourReadings(data).map((r) => ({ id: `wx-${branchId}-${r.time.slice(0, 13)}`, ...r }))
      .filter((r) => !have.has(r.id));
    if (!add.length) return;
    update((d) => { for (const r of add) put(d, 'tempLogs', { id: r.id, at: r.time + ':00', place: 'Outside', temp: Math.round(r.temp * 10) / 10, humidity: Math.round(r.humidity), by: 'Automatic (weather)', note: place?.name || '', auto: true, branchId }); });
  }, [data, branchId]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

// ---------- hourly reminder, room/fridge readings (06, 12, 18), daily greetings (08, 14, 16) ----------
const GREET_SLOTS = { 8: 'morning', 14: 'afternoon', 16: 'afternoon' };
let healthAlertCache = null;
async function whoAlerts(cfg) {
  if (healthAlertCache && Date.now() - healthAlertCache.at < 3 * 3600e3) return healthAlertCache.items;
  try {
    const base = cfg?.url || (location.protocol.startsWith('http') ? location.origin : '');
    const r = await fetch(base + '/api/health-alerts', { signal: AbortSignal.timeout(8000) });
    const j = await r.json();
    healthAlertCache = { at: Date.now(), items: j.items || [] };
    return healthAlertCache.items;
  } catch { return healthAlertCache?.items || []; }
}

export function greetingMessage(settings, slot, date = today()) {
  const tip = tipFor(date, slot);
  const hello = slot === 8 ? 'Good morning' : 'Good afternoon';
  return { tip, text: `${hello} from ${settings.name || 'your pharmacy'}! 💚\n\nHealth tip: ${tip.text} (Source: ${tip.source})\n\n${settings.phone ? `Questions? Call or WhatsApp us on ${settings.phone}. ` : ''}Get well, stay well.` };
}

export function HourlyReminder() {
  const { db, features, update, user, branchId, syncCfg } = useStore();
  const alerts = useAlerts();
  const ref = useRef({});
  ref.current = { alerts, db, user, branchId, syncCfg };
  const hourlyOn = features.hourly !== false && db.settings.hourlyChime !== false;
  const greetOn = db.settings.dailyGreetings !== false;
  const quietFrom = db.settings.quietFrom, quietTo = db.settings.quietTo;

  useEffect(() => {
    let t;
    const arm = () => {
      const now = new Date(), next = new Date(now);
      next.setMinutes(0, 0, 0); next.setHours(now.getHours() + 1);
      t = setTimeout(fire, next - now + 800);
    };
    const fire = async () => {
      arm();
      const { db: d0, alerts: al } = ref.current;
      const h = new Date().getHours();
      if (quietNow(d0.settings)) return;
      const time = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      if (greetOn && GREET_SLOTS[h]) return greet(h, time);
      if (!hourlyOn) return;
      const items = al.slice(0, 3);
      if ([6, 12, 18].includes(h) && features.weather !== false) items.unshift({ key: 'read', tone: 'info', Icon: Thermometer, text: 'Time to record the room and fridge temperature & humidity', to: '/storage' });
      popup({ id: 'hour', tone: 'info', icon: Clock, title: `It's ${time}`, sound: 'chime', ttl: 20000,
        render: (close) => items.length ? <div className="popup-list">{items.map((a, i) => <Link key={i} className={'bell-item ' + a.tone} to={a.to} onClick={close}><a.Icon size={15} /><span>{a.text}</span></Link>)}</div> : <p className="popup-body">Nothing waiting on you. Enjoy the next hour.</p> });
      systemNotify(`RxPOS · ${time}`, items.map((x) => x.text).join('\n') || 'All clear.');
    };
    const greet = async (h, time) => {
      const { db: d0, user: u, branchId: br, syncCfg: cfg } = ref.current;
      const g = greetingMessage(d0.settings, h);
      const who = (await whoAlerts(cfg)).filter((x) => x.near).slice(0, 2);
      const alertText = who.length ? `\n\n⚠️ Health alert (WHO): ${who.map((x) => x.title).join('; ')}` : '';
      // One shared team post per pharmacy and slot (same id on every device)
      update((d) => { put(d, 'messages', { id: `auto-${today()}-${h}`, date: new Date().toISOString(), fromId: 'rxpos', fromName: 'RxPOS', conv: 'team', branchId: br, channel: 'team', auto: true, text: g.text.replace(/\n\n(Questions\?.*)$/s, '') + alertText }); });
      popup({ id: 'greet', tone: 'ok', icon: HeartPulse, wide: true, sticky: true, sound: 'chime', title: `${h === 8 ? 'Good morning' : 'Good afternoon'}, ${u.name.split(' ')[0]} · ${time}`,
        render: () => (
          <div className="greet">
            <p className="popup-body"><b>Health tip</b> · {g.tip.text} <small className="muted">Source: {g.tip.source}</small></p>
            {who.map((x) => <p key={x.url} className="popup-body warn-text"><b>WHO alert</b> · <a href={x.url} target="_blank" rel="noreferrer">{x.title}</a> <small className="muted">{x.date}</small></p>)}
            <p className="muted small">Share today's message with clients (one tap, free):</p>
          </div>),
        actions: [{ label: 'Share on WhatsApp', icon: Share2, primary: true, href: whatsappLink('', g.text), keep: true }, { label: 'Send to client list', icon: Users, to: '/messages' }] });
    };
    arm();
    return () => clearTimeout(t);
  }, [hourlyOn, greetOn, quietFrom, quietTo, features.weather]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

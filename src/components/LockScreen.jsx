// 1.18.0 Till lock screen (the owner's choice, iPhone-style): the till locks from Control Centre, with Ctrl+L, or by
// itself after the idle minutes chosen (Control Centre → Lock by itself after). The work behind it stays as it is (a
// sale in progress waits). It shows the time, the date and what is waiting (messages, expiring stock), and opens with
// the person's quick PIN on this device, else their password (checked on this device, or by the cloud on the web).
// Someone else can sign out here instead. A reload keeps it locked (the flag is kept with the sign-in).
import { useEffect, useRef, useState } from 'react';
import { LockKeyhole, LogOut, Delete, MessagesSquare, CalendarClock, PackageX } from 'lucide-react';
import { hasPin, verifyPin, hasOffline, verifyOffline } from '../offline.js';
import { cloudLogin } from '../cloud.js';
import { useFocusTrap } from '../focustrap.js';
import { dateLocale } from '../showdate.js';

const KEY = 'rxpos-locked';
export const lockedFor = () => { try { return localStorage.getItem(KEY) || ''; } catch { return ''; } };
export const setLocked = (userId) => { try { if (userId) localStorage.setItem(KEY, userId); else localStorage.removeItem(KEY); } catch { /* storage blocked */ } };

/** Lock after `minutes` without a touch, a click or a key (0: never) */
export function useAutoLock(minutes, lock) {
  const fire = useRef(lock);
  fire.current = lock;
  useEffect(() => {
    if (!minutes) return undefined;
    let t;
    const arm = () => { clearTimeout(t); t = setTimeout(() => fire.current(), minutes * 60000); };
    const evs = ['pointerdown', 'keydown', 'wheel', 'touchstart'];
    for (const e of evs) window.addEventListener(e, arm, { passive: true, capture: true });
    arm();
    return () => { clearTimeout(t); for (const e of evs) window.removeEventListener(e, arm, { capture: true }); };
  }, [minutes]);
}

function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(id); }, []);
  return now;
}

export function LockScreen({ user, pharmacy, syncCfg, counts, onUnlock, onSignOut }) {
  const ref = useRef(null);
  useFocusTrap(ref); // no Escape: it stays until opened
  const now = useNow();
  const tenant = syncCfg?.tenant;
  const [usePin, setUsePin] = useState(() => hasPin(tenant, user.id));
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const input = useRef(null);
  useEffect(() => { input.current?.focus(); }, [usePin]);

  const check = async (secret) => {
    if (usePin) {
      const r = await verifyPin(tenant, user.id, secret);
      if (!r.ok && r.left <= 0) { setUsePin(false); throw new Error('Too many wrong PINs: use your password.'); }
      if (!r.ok) throw new Error(`Wrong PIN. ${r.left} ${r.left === 1 ? 'try' : 'tries'} left.`);
      return;
    }
    if (hasOffline(tenant, user.id)) { if (await verifyOffline(tenant, user.id, secret)) return; throw new Error('Wrong password.'); }
    // the web keeps nothing on the computer: the cloud checks the password
    if (!syncCfg?.url || !user.email) throw new Error('This device cannot check your password. Sign out and sign in again.');
    try { await cloudLogin(syncCfg.url, user.email, secret, tenant); } catch (e) {
      if (/code|two-step|otp/i.test(e.message || '')) throw new Error('You use two-step sign-in: sign out and sign in again to open the till.', { cause: e });
      throw new Error(e.message || 'Could not check the password.', { cause: e }); // the cloud's own words (wrong password, tries left)
    }
  };
  const submit = async (e) => {
    e?.preventDefault();
    if (!value || busy) return;
    setBusy(true); setErr('');
    try { await check(value); setLocked(''); onUnlock(); } catch (x) { setErr(x.message); setValue(''); input.current?.focus(); } finally { setBusy(false); }
  };
  const digit = (d) => setValue((v) => (v.length < 8 ? v + d : v));
  const waiting = [
    counts.chat > 0 && [MessagesSquare, `${counts.chat} unread message${counts.chat === 1 ? '' : 's'}`],
    counts.expiry > 0 && [CalendarClock, `${counts.expiry} batch${counts.expiry === 1 ? '' : 'es'} expiring or expired`],
    counts.low > 0 && [PackageX, `${counts.low} medicine${counts.low === 1 ? '' : 's'} low on stock`],
  ].filter(Boolean);

  return (
    <div className="modal-bg lock-screen" onKeyDown={(e) => e.stopPropagation()} onKeyUp={(e) => e.stopPropagation()}>
      <div ref={ref} tabIndex={-1} className="lock-card" role="dialog" aria-modal="true" aria-labelledby="lock-time">
        <LockKeyhole size={22} className="lock-icon" aria-hidden="true" />
        <div className="lock-date">{now.toLocaleDateString(dateLocale(), { weekday: 'long', day: 'numeric', month: 'long' })}</div>
        <div className="lock-time" id="lock-time" aria-label={`Locked. ${now.toLocaleTimeString(dateLocale(), { hour: '2-digit', minute: '2-digit' })}`}>{now.toLocaleTimeString(dateLocale(), { hour: '2-digit', minute: '2-digit' })}</div>
        <div className="lock-who">{pharmacy} · locked by {user.name}</div>
        {waiting.length > 0 && (
          <ul className="lock-notes" aria-label="Waiting">
            {waiting.map(([I, t]) => <li key={t}><I size={16} aria-hidden="true" />{t}</li>)}
          </ul>
        )}
        <form className="lock-form" onSubmit={submit}>
          <label className="sr-only" htmlFor="lock-secret">{usePin ? 'Your quick PIN' : 'Your password'}</label>
          <input id="lock-secret" ref={input} type="password" inputMode={usePin ? 'numeric' : undefined} autoComplete="current-password" placeholder={usePin ? 'PIN' : 'Password'}
            value={value} onChange={(e) => setValue(usePin ? e.target.value.replace(/\D/g, '').slice(0, 8) : e.target.value)} disabled={busy} />
          {err && <p className="lock-err" role="alert">{err}</p>}
          {usePin && (
            <div className="pin-pad" aria-label="PIN pad">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => <button key={d} type="button" onClick={() => digit(d)}>{d}</button>)}
              <button type="button" aria-label="Delete" onClick={() => setValue((v) => v.slice(0, -1))}><Delete size={18} /></button>
              <button type="button" onClick={() => digit('0')}>0</button>
              <button type="submit" className="pin-ok" disabled={!value || busy}>OK</button>
            </div>
          )}
          {!usePin && <button type="submit" className="btn primary" disabled={!value || busy}>{busy ? 'Checking…' : 'Unlock'}</button>}
        </form>
        <div className="lock-foot">
          {hasPin(tenant, user.id) && <button type="button" className="link-btn" onClick={() => { setUsePin((p) => !p); setValue(''); setErr(''); }}>{usePin ? 'Use my password' : 'Use my PIN'}</button>}
          <button type="button" className="link-btn" onClick={onSignOut}><LogOut size={14} />Not {user.name.split(' ')[0]}? Sign out</button>
        </div>
      </div>
    </div>
  );
}

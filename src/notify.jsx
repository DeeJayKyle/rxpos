// Pop-up cards with a sound, used for stock/weather alerts, new messages, daily greetings, weekly reports and calls.
// popup({ id, tone, title, body, icon, to, actions, sound, sticky, render })  — same id replaces an open pop-up.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';

let listener = null;
export function popup(p) { listener?.({ ...p, at: Date.now() }); if (p.sound) playSound(p.sound); }
export function closePopup(id) { listener?.({ id, close: true }); }

// ---------- sounds (generated, no audio files) ----------
const SOUNDS = {
  alert: [[880, 0, .25], [660, .22, .35]],
  message: [[1046.5, 0, .12], [1318.5, .1, .25]],
  chime: [[880, 0, .9], [1318.5, .18, .9]],
  ring: [[740, 0, .35], [880, .38, .35], [740, 1.2, .35], [880, 1.58, .35]],
  report: [[523.3, 0, .2], [659.3, .15, .2], [784, .3, .4]],
};
let ctx = null;
export function playSound(kind = 'alert') {
  try {
    if (localStorage.getItem('rxpos-sound') === 'off') return;
    ctx ??= new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    for (const [f, at, len] of SOUNDS[kind] || SOUNDS.alert) {
      const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime + at;
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.2, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + len + 0.05);
    }
  } catch {}
}
export const soundsOn = () => { try { return localStorage.getItem('rxpos-sound') !== 'off'; } catch { return true; } };
export const setSounds = (on) => { try { localStorage.setItem('rxpos-sound', on ? 'on' : 'off'); } catch {} };

/** Also show a system notification when RxPOS is in the background (if the user allowed it) */
export function systemNotify(title, body) {
  if (document.visibilityState !== 'hidden' || !('Notification' in window) || Notification.permission !== 'granted') return;
  try { new Notification(title, { body, icon: './favicon.svg', tag: 'rxpos-' + title }); } catch {}
}

export function PopupHost() {
  const [items, setItems] = useState([]);
  const navigate = useNavigate();
  useEffect(() => {
    listener = (p) => setItems((list) => (p.close ? list.filter((x) => x.id !== p.id) : [...list.filter((x) => x.id !== p.id), p].slice(-4)));
    return () => { listener = null; };
  }, []);
  useEffect(() => {
    const timers = items.filter((p) => !p.sticky).map((p) => setTimeout(() => setItems((l) => l.filter((x) => x !== p)), Math.max(1000, (p.ttl || 15000) - (Date.now() - p.at))));
    return () => timers.forEach(clearTimeout);
  }, [items]);
  const close = (p) => setItems((l) => l.filter((x) => x !== p));
  if (!items.length) return null;
  return (
    <div className="popups" role="status" aria-live="polite">
      {items.map((p) => (
        <div key={p.id + p.at} className={'popup ' + (p.tone || 'info') + (p.wide ? ' wide' : '')}>
          <div className="popup-head">
            {p.icon && <p.icon size={18} />}<strong>{p.title}</strong>
            <button className="icon-btn" aria-label="Close" onClick={() => close(p)}><X size={15} /></button>
          </div>
          {p.render ? p.render(() => close(p)) : p.body && <p className="popup-body">{p.body}</p>}
          {(p.to || p.actions?.length) && (
            <div className="popup-actions">
              {p.actions?.map((a, i) => a.href
                ? <a key={i} className={'btn sm ' + (a.primary ? 'primary' : 'ghost')} href={a.href} target="_blank" rel="noreferrer" onClick={() => !a.keep && close(p)}>{a.icon && <a.icon size={14} />}{a.label}</a>
                : <button key={i} className={'btn sm ' + (a.primary ? 'primary' : 'ghost')} onClick={() => { a.onClick?.(); if (a.to) navigate(a.to); if (!a.keep) close(p); }}>{a.icon && <a.icon size={14} />}{a.label}</button>)}
              {p.to && <button className="btn sm ghost" onClick={() => { navigate(p.to); close(p); }}>Open</button>}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

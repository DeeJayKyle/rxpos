// Pop-up cards with a sound, used for stock/weather alerts, new messages, daily greetings, weekly reports and calls.
// popup({ id, tone, title, body, icon, to, actions, sound, sticky, render })  — same id replaces an open pop-up.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import { notifyOS } from './badges.js';

let listener = null;
export function popup(p) { listener?.({ ...p, at: Date.now() }); if (p.sound) playSound(p.sound); }
export function closePopup(id) { listener?.({ id, close: true }); }

// ---------- sounds (made on the device, no audio files; or your own file per kind, chosen in This device) ----------
// Each tone: [frequency Hz, start s, length s, wave]
const TONES = {
  duo: { name: 'Two-note', notes: [[1046.5, 0, .12], [1318.5, .1, .25]] },
  pop: { name: 'Pop', notes: [[620, 0, .07, 'triangle'], [930, .05, .12, 'triangle']] },
  marimba: { name: 'Marimba', notes: [[784, 0, .35, 'triangle'], [988, .12, .35, 'triangle'], [1175, .24, .5, 'triangle']] },
  bell: { name: 'Bell', notes: [[1318.5, 0, 1.2], [2637, 0, .5], [1975.5, .02, .8]] },
  chime: { name: 'Soft chime', notes: [[880, 0, .9], [1318.5, .18, .9]] },
  drop: { name: 'Water drop', notes: [[1400, 0, .08], [900, .05, .18]] },
  alert: { name: 'Alert', notes: [[880, 0, .25], [660, .22, .35]] },
  pulse: { name: 'Pulse', notes: [[523.3, 0, .1, 'square'], [523.3, .16, .1, 'square'], [523.3, .32, .1, 'square']] },
  report: { name: 'Fanfare', notes: [[523.3, 0, .2], [659.3, .15, .2], [784, .3, .4]] },
  ring: { name: 'Classic ring', notes: [[740, 0, .35], [880, .38, .35], [740, 1.2, .35], [880, 1.58, .35]] },
  trill: { name: 'Old phone', notes: Array.from({ length: 12 }, (_, i) => [i % 2 ? 1200 : 960, i * .07, .06, 'square']) },
  ringback: { name: 'Ringback', notes: [[425, 0, 1], [440, 0, 1]] },
  harp: { name: 'Harp', notes: [[523.3, 0, .6, 'triangle'], [659.3, .08, .6, 'triangle'], [784, .16, .6, 'triangle'], [1046.5, .24, .8, 'triangle']] },
};
/** What each kind of notice plays unless this device chose otherwise */
export const SOUND_KINDS = [
  ['message', 'New message', 'duo'],
  ['alert', 'Stock & storage alerts', 'alert'],
  ['chime', 'Hourly reminder & greetings', 'chime'],
  ['ring', 'Incoming call', 'ring'],
  ['report', 'Weekly report', 'report'],
];
export const TONE_CHOICES = Object.entries(TONES).map(([id, t]) => [id, t.name]);
const DEFAULT_TONE = Object.fromEntries(SOUND_KINDS.map(([k, , t]) => [k, t]));

const devSound = () => { try { const d = JSON.parse(localStorage.getItem('rxpos-device') || '{}'); return { sounds: d.sounds || {}, volume: d.volume ?? 0.7 }; } catch { return { sounds: {}, volume: 0.7 }; } };
let ctx = null;
const custom = new Map(); // kind → decoded AudioBuffer of the device's own file
const audio = () => { ctx ??= new (window.AudioContext || window.webkitAudioContext)(); if (ctx.state === 'suspended') ctx.resume(); return ctx; };

/** Use a sound file (mp3, wav, ogg, m4a…) for one kind of notice on this device; null goes back to a built-in tone */
export async function setCustomSound(kind, file) {
  const { idbSet } = await import('./idb.js');
  if (!file) { custom.delete(kind); await idbSet('sound:' + kind, null); return; }
  if (file.size > 1.5e6) throw new Error('Choose a sound under 1.5 MB (a short clip works best)');
  const buf = await file.arrayBuffer();
  custom.set(kind, await audio().decodeAudioData(buf.slice(0)));
  await idbSet('sound:' + kind, { name: file.name, data: buf });
}
async function loadCustom(kind) {
  if (custom.has(kind)) return custom.get(kind);
  const { idbGet } = await import('./idb.js');
  const rec = await idbGet('sound:' + kind).catch(() => null);
  if (!rec?.data) return null;
  const b = await audio().decodeAudioData(rec.data.slice(0));
  custom.set(kind, b);
  return b;
}

/** Play the sound for a kind of notice (or preview a tone with { tone }) */
export function playSound(kind = 'alert', { tone, volume } = {}) {
  try {
    if (!tone && localStorage.getItem('rxpos-sound') === 'off') return;
    const d = devSound();
    const choice = tone || d.sounds[kind] || DEFAULT_TONE[kind] || kind;
    const vol = Math.max(0, Math.min(1, volume ?? d.volume));
    if (choice === 'off' || vol === 0) return;
    const c = audio();
    if (choice === 'custom') {
      loadCustom(kind).then((b) => {
        if (!b) return playSound(kind, { tone: DEFAULT_TONE[kind] || 'alert', volume: vol });
        const src = c.createBufferSource(), g = c.createGain();
        src.buffer = b; g.gain.value = vol;
        src.connect(g).connect(c.destination); src.start();
        setTimeout(() => { try { src.stop(); } catch { /* finished */ } }, 4000); // long files are cut to 4 s
      }).catch(() => {});
      return;
    }
    for (const [f, at, len, wave = 'sine'] of (TONES[choice] || TONES.alert).notes) {
      const o = c.createOscillator(), g = c.createGain(), t = c.currentTime + at;
      o.type = wave; o.frequency.value = f;
      const peak = (wave === 'square' ? 0.06 : 0.25) * vol + 0.0002;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      o.connect(g).connect(c.destination); o.start(t); o.stop(t + len + 0.05);
    }
  } catch { /* no audio on this device */ }
}
export const soundsOn = () => { try { return localStorage.getItem('rxpos-sound') !== 'off'; } catch { return true; } };
export const setSounds = (on) => { try { localStorage.setItem('rxpos-sound', on ? 'on' : 'off'); } catch {} };

/** Also show a system notification when RxPOS is in the background (if the user allowed it) */
export function systemNotify(title, body, opts) { notifyOS(title, body, opts); }

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

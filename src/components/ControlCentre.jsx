// 1.18.0 Control Centre (the owner's choice, iPhone-style): the device's quick switches in one panel from the top bar:
// dark mode, the gradient, the 1.18.0 behaviours, the compact menu, sync, the App Library, lock the till and auto-lock.
// Everything here is per device (it changes nothing for the pharmacy) and is also in the theme menu or This device.
import { useEffect, useRef, useState } from 'react';
import { Moon, Sun, Rows3, MessageSquareDot, LayoutGrid, Columns2, PanelLeftClose, RefreshCw, LockKeyhole, Blend, X, SlidersHorizontal } from 'lucide-react';
import { BEHAVIOURS, LOCK_AFTER, savedBehaviour, saveBehaviour, onBehaviour, idleLockMinutes } from '../behaviour.js';
import { useStore } from '../store.jsx';
import { GRADIENT_BACKGROUNDS, savedGradient, saveGradient, applyGradient } from '../gradients.js';
import { useFocusTrap } from '../focustrap.js';

const ICONS = { sheets: Rows3, island: MessageSquareDot, home: LayoutGrid, tiling: Columns2 };

/** The behaviours as live state (this tab and others) */
export function useBehaviour() {
  const [b, setB] = useState(savedBehaviour);
  useEffect(() => onBehaviour(setB), []);
  return b;
}

/** The top-bar button and its panel */
export function ControlCentre({ dark, onDark, rail, onRail, onSync, onLock, onLibrary }) {
  const [open, setOpen] = useState(false);
  const b = useBehaviour();
  if (!b.cc) return null; // 1.22.0: off until switched on in This device → Extras
  return (
    <>
      <button type="button" className="icon-btn cc-btn" aria-label="Control Centre" title="Control Centre" aria-expanded={open} onClick={() => setOpen(true)}><SlidersHorizontal size={18} /></button>
      {open && <ControlPanel onClose={() => setOpen(false)} {...{ dark, onDark, rail, onRail, onSync, onLock, onLibrary }} />}
    </>
  );
}

function ControlPanel({ onClose, dark, onDark, rail, onRail, onSync, onLock, onLibrary }) {
  const ref = useRef(null);
  useFocusTrap(ref, onClose);
  const b = useBehaviour();
  const { db } = useStore();
  const lockNow = idleLockMinutes(db?.settings, b), lockOff = lockNow === 0; // the pharmacy's Till lock (Settings)
  const [g, setG] = useState(savedGradient);
  const nextGrad = () => {
    const ids = GRADIENT_BACKGROUNDS.map(([id]) => id);
    const n = { ...g, background: ids[(ids.indexOf(g.background) + 1) % ids.length] };
    setG(n); applyGradient(n); saveGradient(n);
  };
  const gradName = GRADIENT_BACKGROUNDS.find(([id]) => id === g.background)?.[1] || 'Off';
  const then = (fn) => () => { onClose(); fn(); };
  return (
    <div className="cc-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} tabIndex={-1} className="cc-panel" role="dialog" aria-modal="true" aria-label="Control Centre">
        <div className="cc-head"><strong>Control Centre</strong><button type="button" className="icon-btn" aria-label="Close" onClick={onClose}><X size={18} /></button></div>
        <div className="cc-grid">
          <button type="button" className={'cc-tile cc-big' + (dark ? ' on' : '')} aria-pressed={dark} onClick={() => onDark(!dark)}>
            {dark ? <Moon size={22} /> : <Sun size={22} />}<span><strong>Dark mode</strong><small>{dark ? 'On' : 'Off'}</small></span>
          </button>
          <button type="button" className={'cc-tile cc-big' + (g.background !== 'off' ? ' on' : '')} onClick={nextGrad} aria-label={`Gradient background: ${gradName}`}>
            <Blend size={22} /><span><strong>Gradient</strong><small>{gradName}</small></span>
          </button>
          {BEHAVIOURS.map(([id, name, hint]) => { const I = ICONS[id]; return (
            <button key={id} type="button" className={'cc-tile' + (b[id] ? ' on' : '')} aria-pressed={!!b[id]} title={hint} data-cc={id} onClick={() => saveBehaviour({ [id]: !b[id] })}>
              <I size={20} /><small>{name}</small>
            </button>
          ); })}
          <button type="button" className={'cc-tile' + (rail ? ' on' : '')} aria-pressed={rail} title="The menu as icons only" onClick={onRail}><PanelLeftClose size={20} /><small>Compact menu</small></button>
          <button type="button" className="cc-tile" onClick={then(onSync)}><RefreshCw size={20} /><small>Sync now</small></button>
          {b.library && <button type="button" className="cc-tile" onClick={then(onLibrary)}><LayoutGrid size={20} /><small>App Library</small></button>}
          <button type="button" className="cc-tile cc-lock" onClick={then(onLock)}><LockKeyhole size={20} /><small>Lock the till</small></button>
        </div>
        <div className="cc-row">
          <span className="small">Lock by itself after</span>
          {lockOff
            ? <span className="small muted">Off for this pharmacy (Settings → Alerts &amp; storage → Till lock)</span>
            : <div className="seg" role="radiogroup" aria-label="Lock by itself after">
              {LOCK_AFTER.map(([m, l]) => <button key={m} type="button" role="radio" aria-checked={lockNow === m} className={lockNow === m ? 'on' : ''} onClick={() => saveBehaviour({ lock: m })}>{l}</button>)}
            </div>}
        </div>
      </div>
    </div>
  );
}

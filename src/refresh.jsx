// Refreshing the data the way each version of RxPOS expects:
//   Android app (and phones/tablets): pull down from the top of the page, let go → syncs and shows the result
//   Windows app: F5 or Ctrl+R (also File → Refresh) → syncs without reloading; Ctrl+Shift+R reloads the whole app
//   Web: the browser's own refresh reloads the page as usual (and on phones the browser's pull-to-refresh)
// A refresh pushes this device's changes and pulls everyone else's straight away; the page updates in place.
import { useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { isAndroid, isElectron, isTouch } from './platform.js';
import { toast } from './feedback.jsx';

const PULL_MAX = 110; // px the indicator can travel
const PULL_TRIGGER = 72; // px to pull before letting go refreshes

function result(r) {
  if (!r || r.state === 'off') return toast('This device is not linked to the cloud', 'warn');
  if (r.state === 'offline') return toast('Offline: your work is saved and goes up when the internet is back', 'warn');
  if (r.state === 'error') return toast(r.error || 'Could not reach the cloud', 'error');
  const n = (r.pulled || 0) + (r.pushed || 0);
  toast(n ? `Up to date · ${r.pulled || 0} in, ${r.pushed || 0} out` : 'Up to date', 'success');
}

/** <RefreshHost refresh={syncNow} />: adds pull-to-refresh (touch apps) and F5 / Ctrl+R (Windows app) */
export default function RefreshHost({ refresh }) {
  const [pull, setPull] = useState(0); // current pull distance
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const doRef = useRef(null);

  doRef.current = async () => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true);
    try { result(await refresh()); } finally { busyRef.current = false; setBusy(false); setPull(0); }
  };

  // Keyboard (Windows app) and the File → Refresh menu
  useEffect(() => {
    const onKey = (e) => {
      if (!isElectron) return;
      const r = e.key === 'F5' || ((e.ctrlKey || e.metaKey) && (e.key === 'r' || e.key === 'R'));
      if (!r) return;
      e.preventDefault();
      if (e.shiftKey || (e.ctrlKey && e.key === 'F5')) { location.reload(); return; }
      doRef.current();
    };
    const onMenu = () => doRef.current();
    window.addEventListener('keydown', onKey);
    window.addEventListener('rxpos-refresh', onMenu);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('rxpos-refresh', onMenu); };
  }, []);

  // Pull-to-refresh: only in the Android app and on touch screens, starting from the very top of the page
  useEffect(() => {
    if (!isAndroid && !(isTouch && isElectron)) return;
    let startY = null, dist = 0, active = false;
    const atTop = () => (document.scrollingElement || document.documentElement).scrollTop <= 0;
    const blocked = (el) => el?.closest?.('input, textarea, select, .modal, .drawer-open .sidebar, [data-no-pull]');
    const onStart = (e) => {
      if (e.touches.length !== 1 || busyRef.current || !atTop() || blocked(e.target)) { startY = null; return; }
      startY = e.touches[0].clientY; dist = 0; active = false;
    };
    const onMove = (e) => {
      if (startY == null) return;
      const dy = e.touches[0].clientY - startY;
      if (dy <= 0 || !atTop()) { if (active) { active = false; setPull(0); } return; }
      active = true;
      dist = Math.min(PULL_MAX, dy * 0.5); // resistance, like native lists
      setPull(dist);
      if (e.cancelable && dy > 8) e.preventDefault(); // keep the page from bouncing while pulling
    };
    const onEnd = () => {
      if (startY == null) return;
      startY = null;
      if (active && dist >= PULL_TRIGGER) { setPull(PULL_TRIGGER); doRef.current(); }
      else setPull(0);
      active = false;
    };
    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd, { passive: true });
    document.addEventListener('touchcancel', onEnd, { passive: true });
    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
      document.removeEventListener('touchcancel', onEnd);
    };
  }, []);

  const shown = busy || pull > 0;
  if (!shown) return null;
  const ready = pull >= PULL_TRIGGER;
  return (
    <div className="ptr" style={{ transform: `translate(-50%, ${busy ? PULL_TRIGGER : pull}px)`, opacity: busy ? 1 : Math.min(1, pull / PULL_TRIGGER) }} role="status" aria-live="polite">
      <RefreshCw size={20} className={busy ? 'spin' : ''} style={busy ? undefined : { transform: `rotate(${pull * 3}deg)` }} />
      <span className="sr-only">{busy ? 'Refreshing…' : ready ? 'Release to refresh' : 'Pull to refresh'}</span>
      {ready && !busy && <span className="ptr-hint">Release</span>}
    </div>
  );
}

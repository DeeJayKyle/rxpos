// A short guided tour (UI batch 3, 2026-11-18): a card beside each part of a page, Next / Skip, shown once per person on
// this device. It never covers the page or takes the cursor (a barcode scanner still types into the search), and Esc
// closes it. Steps whose part isn't on the screen (another till layout, a phone) are left out.
import { useEffect, useLayoutEffect, useState } from 'react';
import { X } from 'lucide-react';

const seenKey = (id, user) => `rxpos-tour:${id}:${user || ''}`;
export const tourSeen = (id, user) => { try { return !!localStorage.getItem(seenKey(id, user)); } catch { return true; } };
// which pages' tips had been seen before this visit (a tip marks itself seen as it shows, so this is read once, at load)
const tipsSeenBefore = new Set((() => { try { return Object.keys(localStorage).filter((k) => k.startsWith('rxpos-tip:')).map((k) => k.slice(10)); } catch { return []; } })());
/** true when this device already showed the page's tip before this visit: its people know the page */
export const knewPage = (id) => tipsSeenBefore.has(id);

export default function Tour({ id, user, steps, skipIf = false }) {
  const [on, setOn] = useState(() => !skipIf && !tourSeen(id, user));
  const [i, setI] = useState(0);
  const [box, setBox] = useState(null);
  const [, setMounted] = useState(0);
  useEffect(() => { const t = setTimeout(() => setMounted(1), 250); return () => clearTimeout(t); }, []); // the page's parts exist now
  const shown = steps.filter((s) => document.querySelector(s.sel));
  const step = shown[i];
  const close = () => { try { localStorage.setItem(seenKey(id, user), '1'); } catch { /* blocked */ } setOn(false); };
  useLayoutEffect(() => {
    if (!on || !step) return undefined;
    const el = document.querySelector(step.sel);
    if (!el) return undefined;
    el.classList.add('tour-lit');
    const place = () => setBox(el.getBoundingClientRect());
    place();
    window.addEventListener('resize', place); window.addEventListener('scroll', place, true);
    return () => { el.classList.remove('tour-lit'); window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [on, step?.sel]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!on) return undefined;
    const k = (e) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [on]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!on || !step || !box) return null;
  // below the part when there is room, else above it; kept inside the window
  const w = Math.min(320, innerWidth - 24);
  const left = Math.max(12, Math.min(box.left, innerWidth - w - 12));
  const below = box.bottom + 170 < innerHeight;
  const style = { width: w, left, ...(below ? { top: box.bottom + 10 } : { bottom: innerHeight - box.top + 10 }) };
  const last = i === shown.length - 1;
  return (
    <div className="tour-card" role="dialog" aria-modal="false" aria-label={`Tour, step ${i + 1} of ${shown.length}`} style={style}>
      <button type="button" className="icon-btn tour-x" aria-label="Skip the tour" onClick={close}><X size={15} /></button>
      <small className="muted">{i + 1} of {shown.length}</small>
      <strong>{step.title}</strong>
      <p className="small">{step.text}</p>
      <div className="row gap">
        <button type="button" className="btn sm ghost" onClick={close}>Skip</button>
        <button type="button" className="btn sm primary" onClick={() => (last ? close() : setI(i + 1))}>{last ? 'Done' : 'Next'}</button>
      </div>
    </div>
  );
}

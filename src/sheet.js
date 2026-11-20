// 1.18.0 Sheets & gestures (src/behaviour.js): with sheets on, a pop-up rises from the bottom with a grab handle, and
// dragging the handle or the title bar down closes it (past a third of its height, or with a quick flick); otherwise it
// springs back. Off, the handle is hidden (CSS) and nothing here runs.
import { useEffect, useRef } from 'react';

const sheetsOn = () => document.documentElement.dataset.sheets === 'on';

/** Drag the sheet `ref` down by its handle or title bar to close it (onClose) */
export function useSheetDrag(ref, onClose) {
  const closer = useRef(onClose);
  closer.current = onClose;
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    let s = null;
    const start = (e) => {
      if (!sheetsOn() || e.button > 0 || !e.target.closest('.sheet-grab, .modal-head') || e.target.closest('button, a, input, select, textarea')) return;
      s = { y: e.clientY, t: e.timeStamp, dy: 0, id: e.pointerId };
      el.setPointerCapture?.(e.pointerId);
      el.classList.add('sheet-dragging');
    };
    const move = (e) => {
      if (!s || e.pointerId !== s.id) return;
      s.dy = Math.max(0, e.clientY - s.y);
      el.style.transform = `translateY(${s.dy}px)`;
      const bg = el.parentElement; if (bg) bg.style.setProperty('--sheet-fade', String(Math.max(0.2, 1 - s.dy / Math.max(1, el.offsetHeight))));
    };
    const end = (e) => {
      if (!s || e.pointerId !== s.id) return;
      const g = s; s = null;
      el.classList.remove('sheet-dragging');
      const v = g.dy / Math.max(1, e.timeStamp - g.t);
      const close = e.type === 'pointerup' && (g.dy > el.offsetHeight / 3 || (v > 0.5 && g.dy > 40));
      el.parentElement?.style.removeProperty('--sheet-fade');
      if (close) { el.style.transform = `translateY(${el.offsetHeight + 40}px)`; el.style.transition = 'transform .18s ease-in'; setTimeout(() => closer.current?.(), 170); }
      else { el.style.transition = 'transform .22s cubic-bezier(.2,.9,.3,1.2)'; el.style.transform = ''; setTimeout(() => { el.style.transition = ''; }, 240); }
    };
    el.addEventListener('pointerdown', start);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    return () => { el.removeEventListener('pointerdown', start); el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', end); el.removeEventListener('pointercancel', end); };
  }, [ref]);
}

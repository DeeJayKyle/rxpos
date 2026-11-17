// Dialogs (ui.jsx Modal and the feedback.jsx confirm box) share one focus rule: while open, Tab stays inside the top
// dialog, Escape closes only that one, and when it closes the focus goes back to where it was (the button that
// opened it), so a keyboard or screen-reader user is never left on the page behind.
import { useEffect, useRef } from 'react';

const open = []; // the dialogs on screen, the top one last
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const shown = (el) => el.getClientRects().length > 0;

/** ref: the dialog's element; onClose: what Escape does (left out, Escape does nothing) */
export function useFocusTrap(ref, onClose) {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const me = {};
    open.push(me);
    const back = document.activeElement;
    // an autoFocus field inside has the focus already; otherwise the first control (or the dialog itself) gets it
    const t = setTimeout(() => {
      if (el.contains(document.activeElement)) return;
      const first = [...el.querySelectorAll(FOCUSABLE)].find(shown);
      (first || el).focus?.();
    }, 0);
    const onKey = (e) => {
      if (open[open.length - 1] !== me) return; // a dialog opened over this one owns the keys
      if (e.key === 'Escape' && close.current) { e.preventDefault(); e.stopPropagation(); close.current(); return; }
      if (e.key !== 'Tab') return;
      const list = [...el.querySelectorAll(FOCUSABLE)].filter(shown);
      if (!list.length) { e.preventDefault(); el.focus?.(); return; }
      const first = list[0], last = list[list.length - 1], at = document.activeElement;
      if (e.shiftKey && (at === first || !el.contains(at))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (at === last || !el.contains(at))) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener('keydown', onKey);
      const i = open.indexOf(me);
      if (i >= 0) open.splice(i, 1);
      if (back && back.isConnected && typeof back.focus === 'function') back.focus();
    };
  }, [ref]);
}

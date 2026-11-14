// Navigation feel (2026-11 owner's request): a Back button on every page (phones), swipe from the left edge to go
// back with the page following the finger, and gliding page transitions: forward slides the new page in from the
// right (iOS push), back from the left, the bottom tabs cross-fade. Layout and motion only: nothing here changes what
// a page does, and every animation is skipped when the device asks for reduced motion.
//
// The animations run on <main class="content"> with the Web Animations API. They move the page with `left` (on a
// relatively positioned box) rather than `transform`, so the till's docked sale and other fixed bars keep to the
// screen while the page glides, and they never block a click: the page is usable from the first frame.
import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';

const EASE = 'cubic-bezier(0.32, 0.72, 0, 1)'; // iOS navigation curve
const EDGE = 24; // px from the left edge where a swipe-back may start
let pending = null; // how the next route change was asked for: 'tab', 'back' or 'swipe' (and when)

/** Say how the next navigation was started (the bottom tabs cross-fade; Back always slides from the left) */
export const markNav = (kind) => { pending = kind && { kind, at: Date.now() }; };
const takeNav = () => { const p = pending; pending = null; return p && Date.now() - p.at < 1500 ? p.kind : null; };

const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const phone = () => window.innerWidth <= 900;
const historyIdx = () => { const i = window.history.state?.idx; return typeof i === 'number' ? i : 0; };

/** Back: one step back in the app's history, or the dashboard when this page was opened directly */
export function useGoBack() {
  const navigate = useNavigate();
  return useCallback(() => {
    markNav('back');
    if (historyIdx() > 0) navigate(-1);
    else navigate('/');
  }, [navigate]);
}

/** The top bar's Back button (phones and tablets; the dashboard has the menu button instead) */
export function BackButton() {
  const goBack = useGoBack();
  return (
    <button type="button" className="icon-btn back-btn" onClick={goBack} aria-label="Back" title="Back">
      <ChevronLeft size={24} strokeWidth={2.4} aria-hidden="true" /><span className="back-label">Back</span>
    </button>
  );
}

// the page's running glide (kept here: asking the browser for an element's animations forces a style recalculation
// of the new page right when it is being drawn, which made page changes slower)
let running = null;
function stopMotion(el) {
  if (!el) return;
  if (running) { const a = running; running = null; a.cancel(); }
  el.style.left = ''; el.style.position = ''; el.style.opacity = '';
  document.documentElement.classList.remove('page-swiping', 'page-gliding');
}

function glide(el, kind) {
  stopMotion(el);
  if (!el || reduced() || typeof el.animate !== 'function') return;
  const small = phone();
  let frames;
  if (kind === 'tab' || kind === 'replace') frames = [{ opacity: 0 }, { opacity: 1 }];
  else {
    const dx = small ? Math.round(window.innerWidth * (kind === 'back' || kind === 'swipe' ? 0.3 : 0.4)) : 20;
    const from = kind === 'back' || kind === 'swipe' ? -dx : dx;
    frames = [{ left: from + 'px', opacity: small ? 0.35 : 0 }, { left: '0px', opacity: 1 }];
    el.style.position = 'relative';
    document.documentElement.classList.add('page-gliding'); // the page never scrolls sideways while it glides in
  }
  // short and light: the new page is usable at once, the motion only eases it in
  const a = el.animate(frames, { duration: kind === 'tab' || kind === 'replace' ? 120 : small ? 200 : 140, easing: EASE });
  running = a;
  const done = () => {
    if (running !== a && running?.playState === 'running') return;
    if (running === a) running = null;
    el.style.position = ''; document.documentElement.classList.remove('page-gliding');
  };
  a.onfinish = done; a.oncancel = done;
}

/** Runs the right transition on <main> each time the page (not just its state) changes */
export function usePageMotion(ref) {
  const { pathname } = useLocation();
  const type = useNavigationType();
  const last = useRef({ pathname, idx: historyIdx() });
  useLayoutEffect(() => {
    const prev = last.current, idx = historyIdx();
    last.current = { pathname, idx };
    if (prev.pathname === pathname) return;
    const asked = takeNav();
    const kind = asked || (type === 'POP' ? (idx < prev.idx ? 'back' : 'forward') : type === 'REPLACE' ? 'replace' : 'forward');
    glide(ref.current, kind);
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** A finger that started on something that scrolls sideways (a table, chart, chip row) and isn't at its start yet */
function scrollsSideways(el) {
  for (let e = el; e && e !== document.body; e = e.parentElement) {
    if (e.scrollWidth > e.clientWidth + 1 && e.scrollLeft > 0) {
      const o = getComputedStyle(e).overflowX;
      if (o === 'auto' || o === 'scroll') return true;
    }
  }
  return false;
}

/**
 * Swipe from the left edge to go back (touch only). The page follows the finger; let go past a third of the screen
 * (or with a quick flick) and it slides away and the previous page glides in from the left; otherwise it springs
 * back. Never starts in a dialog, the open menu, a text box, a text selection or a sideways-scrolled table.
 */
export function useEdgeSwipeBack(ref) {
  const goBack = useGoBack();
  const { pathname } = useLocation();
  const live = useRef({ goBack, pathname });
  live.current = { goBack, pathname };
  useEffect(() => {
    let s = null; // the gesture in progress
    const canGoBack = () => live.current.pathname !== '/' || historyIdx() > 0;
    const blocked = (t) => !!(document.querySelector('.modal-bg, .shell.drawer-open, .palette-bg') ||
      t?.closest?.('input, textarea, select, [contenteditable=""], [contenteditable="true"], [data-no-swipe], .sidebar') ||
      String(window.getSelection?.() || '').length);
    const onStart = (e) => {
      s = null;
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      if (t.clientX > EDGE || !canGoBack() || blocked(e.target) || scrollsSideways(e.target)) return;
      s = { x: t.clientX, y: t.clientY, t: e.timeStamp, on: false, dx: 0 };
    };
    const onMove = (e) => {
      if (!s) return;
      const t = e.touches[0], dx = t.clientX - s.x, dy = t.clientY - s.y;
      if (!s.on) {
        if (Math.abs(dy) > 12 && Math.abs(dy) > dx) { s = null; return; } // a scroll, not a swipe
        if (dx < 10 || dx < Math.abs(dy) * 1.2) { if (dx > Math.abs(dy) && e.cancelable) e.preventDefault(); return; } // keep the browser's own edge gesture out of it
        s.on = true;
        stopMotion(ref.current);
        document.documentElement.classList.add('page-swiping', 'page-gliding');
      }
      if (e.cancelable) e.preventDefault();
      s.dx = Math.max(0, dx);
      const el = ref.current;
      if (el) { el.style.position = 'relative'; el.style.left = s.dx + 'px'; el.style.opacity = String(1 - Math.min(0.25, s.dx / window.innerWidth / 3)); }
    };
    const onEnd = (e) => {
      const g = s; s = null;
      if (!g?.on) return;
      const el = ref.current, w = window.innerWidth;
      const v = g.dx / Math.max(1, e.timeStamp - g.t); // px per ms
      const go = e.type === 'touchend' && (g.dx > w * 0.33 || (v > 0.45 && g.dx > 40)); // a cancelled touch never goes back
      if (!el || reduced()) { stopMotion(el); if (go) { markNav('swipe'); live.current.goBack(); } return; }
      const from = { left: g.dx + 'px', opacity: el.style.opacity || '1' };
      if (go) {
        const a = el.animate([from, { left: w + 'px', opacity: 0.6 }], { duration: 180, easing: EASE, fill: 'forwards' });
        running = a;
        el.style.left = ''; el.style.opacity = '';
        a.onfinish = () => {
          markNav('swipe'); live.current.goBack();
          // the page did not change (only its state did): put it back. A new page cancels this animation itself.
          setTimeout(() => { if (a.playState === 'finished') { pending = null; stopMotion(el); } }, 450);
        };
      } else {
        const a = el.animate([from, { left: '0px', opacity: 1 }], { duration: 220, easing: EASE });
        running = a;
        el.style.left = ''; el.style.opacity = '';
        a.onfinish = a.oncancel = () => stopMotion(el);
      }
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
  }, [ref]);
}

/**
 * The on-screen keyboard: while it is up (touch screens), the bottom tab bar steps aside so the form has the room,
 * and the box being typed in is scrolled into view if the keyboard covers it.
 */
export function useKeyboardFit() {
  useEffect(() => {
    if (typeof matchMedia === 'undefined' || !matchMedia('(pointer: coarse)').matches) return;
    let tallest = window.innerHeight, width = window.innerWidth, timer = 0;
    const field = (el) => el?.matches?.('input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=button]):not([type=submit]), textarea, select, [contenteditable="true"]');
    const vh = () => window.visualViewport?.height || window.innerHeight;
    const update = () => {
      if (window.innerWidth !== width) { width = window.innerWidth; tallest = window.innerHeight; }
      tallest = Math.max(tallest, window.innerHeight);
      const up = field(document.activeElement) && vh() < tallest * 0.78;
      document.documentElement.classList.toggle('kb-open', up);
    };
    const reveal = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        update();
        const el = document.activeElement;
        if (!field(el)) return;
        const r = el.getBoundingClientRect(), bottom = vh();
        if (r.bottom > bottom - 12 || r.top < 0) el.scrollIntoView({ block: 'center', behavior: reduced() ? 'auto' : 'smooth' });
      }, 320);
    };
    const onOut = () => setTimeout(update, 60);
    window.addEventListener('resize', update);
    window.visualViewport?.addEventListener('resize', reveal);
    document.addEventListener('focusin', reveal);
    document.addEventListener('focusout', onOut);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('resize', reveal);
      document.removeEventListener('focusin', reveal);
      document.removeEventListener('focusout', onOut);
      document.documentElement.classList.remove('kb-open');
    };
  }, []);
}

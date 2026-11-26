// 1.18.0 (the owner's choice): how the app behaves on this device, the iPhone and Linux way. Each is a per-device
// switch (Control Centre and This device → Look), kept with the other appearance preferences (webpolicy PREFS):
//   sheets   pop-ups rise from the bottom as sheets with a grab handle; drag one down to close it
//   island   messages appear in a Dynamic Island: a black pill at the top that grows to show them
//   home     the dashboard as a home screen: widgets in three sizes, a dock of pages, long-press to arrange
//   tiling   a second page tiled beside the one you work on (wide screens), like a tiling window manager
//   lock     the till locks itself after this many idle minutes (0: never); the lock screen asks for the PIN or password
// 1.22.0 (the owner's clean-up): the extras are off on a new device and switched on in This device → Extras:
//   cc       the Control Centre button in the top bar (the switches above, sync, lock)
//   library  the App Library tile in Control Centre
const KEY = 'rxpos-behaviour';
export const LOCK_AFTER = [[0, 'Never'], [2, '2 min'], [5, '5 min'], [15, '15 min']];
export const DEFAULTS = { sheets: false, island: false, home: false, tiling: false, tile: '', lock: 0, cc: false, library: false };
export const BEHAVIOURS = [
  ['sheets', 'Sheets & gestures', 'Pop-ups rise from the bottom; drag them down to close'],
  ['island', 'Dynamic Island', 'Messages in a black pill at the top that grows to show them'],
  ['home', 'Home screen', 'The dashboard as widgets in three sizes, with a dock of pages'],
  ['tiling', 'Tiling', 'A second page tiled beside this one (wide screens)'],
];
/** The extras in This device → Extras: off until someone switches them on */
export const EXTRAS = [
  ['cc', 'Control Centre', 'A button in the top bar with quick switches, sync and lock'],
  ['library', 'App Library', 'Every page as app icons, opened from Control Centre'],
  ['home', 'Home screen', 'The dashboard as widgets in three sizes, with a dock of pages'],
];

export function savedBehaviour() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY)) || {};
    const lock = LOCK_AFTER.some(([m]) => m === v.lock) ? v.lock : 0;
    return { ...DEFAULTS, ...Object.fromEntries(Object.entries(v).filter(([k]) => k in DEFAULTS)), lock };
  } catch { return { ...DEFAULTS }; }
}

const listeners = new Set();
/** Be told when this device's behaviour changes (from Control Centre, This device, another tab) */
export function onBehaviour(fn) { listeners.add(fn); return () => listeners.delete(fn); }

/** The switches as data attributes on <html> (CSS does the look) */
export function applyBehaviour(b = savedBehaviour()) {
  const el = document.documentElement;
  for (const k of ['sheets', 'island', 'home', 'tiling']) { if (b[k]) el.dataset[k] = 'on'; else delete el.dataset[k]; }
}

export function saveBehaviour(patch) {
  const next = { ...savedBehaviour(), ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* storage blocked */ }
  applyBehaviour(next);
  for (const fn of listeners) fn(next);
  return next;
}

if (typeof window !== 'undefined') window.addEventListener('storage', (e) => { if (e.key === KEY) { const b = savedBehaviour(); applyBehaviour(b); for (const fn of listeners) fn(b); } });

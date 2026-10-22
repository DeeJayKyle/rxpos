// Settings that belong to this device only (not shared with the pharmacy): screen layout, text size, double-tap zoom,
// screen rotation, sounds, badges and keeping the Windows app in the tray. Stored in localStorage.
import { isAndroid, isElectron, isTouch } from './platform.js';

const KEY = 'rxpos-device';
const DEFAULTS = { view: 'auto', zoom: 1, doubleTap: true, rotation: 'auto', badges: true, tray: true, volume: 0.7, sounds: {} };
let cache = null;
const listeners = new Set();

export function deviceSettings() {
  if (cache) return cache;
  try { cache = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { cache = { ...DEFAULTS }; }
  return cache;
}
export function setDevice(patch) {
  cache = { ...deviceSettings(), ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch { /* private window: works until closed */ }
  applyDevice();
  listeners.forEach((f) => f(cache));
}
export const onDevice = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

/** Layout widths for the view switch. Desktop view lays the page out like a PC screen; pinch or double-tap to read. */
const VIEWPORT = {
  auto: 'width=device-width, initial-scale=1.0, viewport-fit=cover',
  phone: 'width=430, viewport-fit=cover',
  desktop: 'width=1280, viewport-fit=cover',
};

export function applyDevice() {
  const s = deviceSettings();
  const meta = document.querySelector('meta[name=viewport]');
  if (meta) meta.setAttribute('content', VIEWPORT[s.view] || VIEWPORT.auto);
  document.documentElement.dataset.view = s.view;
  setZoom(s.zoom);
  if (isAndroid) lockRotation(s.rotation);
  window.rxposShell?.setTray?.(s.tray !== false);
}

let tapZoom = 1;
function setZoom(z) {
  const v = Math.round(Math.min(1.6, Math.max(0.8, Number(z) || 1)) * tapZoom * 100) / 100;
  document.documentElement.style.zoom = v === 1 ? '' : String(v);
}

async function lockRotation(mode) {
  try {
    const { ScreenOrientation } = await import('@capacitor/screen-orientation');
    if (mode === 'portrait' || mode === 'landscape') await ScreenOrientation.lock({ orientation: mode });
    else await ScreenOrientation.unlock();
  } catch { /* older installed app without the plugin: the system rotation setting applies */ }
}

/** Double-tap on empty space (not on a button, field or list) zooms in; double-tap again zooms back out */
function watchDoubleTap() {
  let last = 0, lx = 0, ly = 0;
  window.addEventListener('pointerup', (e) => {
    if (e.pointerType !== 'touch' || !deviceSettings().doubleTap || deviceSettings().view === 'desktop') return; // desktop view: the system's own double-tap zoom
    if (e.target.closest('button, a, input, select, textarea, label, [role=button], .product, .cart-line, tr, .bubble, .sheet-handle, .spotlight')) { last = 0; return; }
    const t = Date.now();
    if (t - last < 300 && Math.hypot(e.clientX - lx, e.clientY - ly) < 30) {
      last = 0;
      const y = e.clientY, before = window.scrollY;
      tapZoom = tapZoom === 1 ? 1.35 : 1;
      setZoom(deviceSettings().zoom);
      const main = document.querySelector('.content');
      if (main && tapZoom > 1) main.scrollTop += (y - 120) * 0.35; // keep what was tapped roughly in view
      else window.scrollTo(0, before);
      return;
    }
    last = t; lx = e.clientX; ly = e.clientY;
  }, { passive: true });
}

let started = false;
export function startDevice() {
  if (started) return;
  started = true;
  applyDevice();
  if (isTouch || isAndroid) watchDoubleTap();
}

export const canSwitchView = isTouch || isAndroid;
export const canRotate = isAndroid;
export const hasTray = isElectron;

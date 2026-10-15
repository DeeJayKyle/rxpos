// One live WebSocket per device to the pharmacy's cloud hub (see worker/live.js).
// Brings instant "something changed, pull now" notices and call set-up messages. If it drops, RxPOS falls back to
// regular syncing and polling, and reconnects in the background.
import { LIVE_CLOUD, OWN_SITES } from './cloud.js';

const listeners = new Set();
let ws = null, cfgKey = '', retry = 0, timer = null, pinger = null, wanted = false;

/** WebSockets go straight to the Worker (the Pages site only forwards normal requests) */
const liveBase = (url) => (OWN_SITES.includes(String(url).replace(/\/+$/, '')) ? LIVE_CLOUD : url).replace(/^http/, 'ws');

export const onLive = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export const liveUp = () => ws?.readyState === 1;
export function liveSend(obj) {
  if (!liveUp()) return false;
  try { ws.send(JSON.stringify(obj)); return true; } catch { return false; }
}

export function connectLive(cfg) {
  const key = cfg?.url && cfg?.key?.startsWith('u.') ? cfg.url + '|' + cfg.key + '|' + cfg.deviceId : '';
  if (key === cfgKey && (ws || timer)) return;
  disconnectLive();
  cfgKey = key;
  if (!key) return;
  wanted = true;
  const open = () => {
    timer = null;
    if (!wanted || !navigator.onLine) { timer = setTimeout(open, 5000); return; }
    const u = `${liveBase(cfg.url)}/api/live?token=${encodeURIComponent(cfg.key)}&device=${encodeURIComponent(cfg.deviceId || '')}`;
    let s;
    try { s = new WebSocket(u); } catch { timer = setTimeout(open, 10000); return; }
    ws = s;
    s.onopen = () => {
      retry = 0;
      listeners.forEach((f) => f({ type: 'open' }));
      clearInterval(pinger);
      pinger = setInterval(() => { try { s.send('ping'); } catch {} }, 45000); // keeps mobile networks from dropping the line
    };
    s.onmessage = (e) => { if (e.data === 'pong') return; let m; try { m = JSON.parse(e.data); } catch { return; } listeners.forEach((f) => f(m)); };
    s.onclose = () => {
      clearInterval(pinger);
      if (ws === s) ws = null;
      listeners.forEach((f) => f({ type: 'closed' }));
      if (wanted) timer = setTimeout(open, Math.min(30000, 1000 * 2 ** retry++));
    };
    s.onerror = () => { try { s.close(); } catch {} };
  };
  openFn = open;
  open();
  window.addEventListener('online', reconnectNow);
}
let openFn = null;
/** Internet is back: try again straight away instead of waiting for the back-off */
function reconnectNow() { if (wanted && !ws && openFn) { clearTimeout(timer); retry = 0; openFn(); } }

export function disconnectLive() {
  wanted = false;
  clearTimeout(timer); timer = null; clearInterval(pinger);
  if (ws) { const s = ws; ws = null; try { s.close(); } catch {} }
  cfgKey = ''; openFn = null;
  window.removeEventListener('online', reconnectNow);
}

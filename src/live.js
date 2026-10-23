// One live WebSocket per device to the pharmacy's cloud hub (see worker/live.js).
// Brings instant "something changed, pull now" notices and call set-up messages. If it drops, RxPOS falls back to
// regular syncing and polling, and reconnects in the background.
// Phones and sleeping PCs often leave a socket that looks open but is dead, so it is pinged every 20 s and replaced if
// no answer comes back within 15 s; coming back to the app (or the internet returning) reconnects straight away.
import { LIVE_CLOUD, OWN_SITES } from './cloud.js';

const PING_EVERY = 20000;
const DEAD_AFTER = 15000;
const listeners = new Set();
let ws = null, cfgKey = '', retry = 0, timer = null, pinger = null, wanted = false, lastHeard = 0, openFn = null;

/** WebSockets go straight to the Worker (the Pages site only forwards normal requests) */
const liveBase = (url) => (OWN_SITES.includes(String(url).replace(/\/+$/, '')) ? LIVE_CLOUD : url).replace(/^http/, 'ws');

export const onLive = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export const liveUp = () => ws?.readyState === 1 && Date.now() - lastHeard < PING_EVERY + DEAD_AFTER;
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
  const open = async () => {
    clearTimeout(timer); timer = null;
    if (!wanted) return;
    if (!navigator.onLine) { timer = setTimeout(open, 5000); return; }
    // Open with a short-lived ticket so the long-lived sign-in token never appears in the ws:// URL (1.2).
    // An older cloud without the ticket endpoint still works: fall back to the token.
    let auth = `token=${encodeURIComponent(cfg.key)}`;
    try {
      const r = await fetch(`${cfg.url}/api/live-ticket`, { method: 'POST', headers: { Authorization: 'Bearer ' + cfg.key } });
      if (r.ok) { const j = await r.json().catch(() => ({})); if (j.ticket) auth = `ticket=${encodeURIComponent(j.ticket)}`; }
    } catch { /* offline or old cloud: use the token below */ }
    if (!wanted) return;
    const u = `${liveBase(cfg.url)}/api/live?${auth}&device=${encodeURIComponent(cfg.deviceId || '')}`;
    let s;
    try { s = new WebSocket(u); } catch { timer = setTimeout(open, 10000); return; }
    ws = s;
    s.onopen = () => {
      retry = 0;
      lastHeard = Date.now();
      listeners.forEach((f) => f({ type: 'open' }));
      clearInterval(pinger);
      pinger = setInterval(() => {
        if (Date.now() - lastHeard > PING_EVERY + DEAD_AFTER) { try { s.close(); } catch {} return; } // silent line: replace it
        try { s.send('ping'); } catch {}
      }, PING_EVERY);
    };
    s.onmessage = (e) => {
      lastHeard = Date.now();
      if (e.data === 'pong') return;
      let m; try { m = JSON.parse(e.data); } catch { return; }
      listeners.forEach((f) => f(m));
    };
    s.onclose = () => {
      clearInterval(pinger);
      if (ws !== s && ws !== null) return; // an old line closing after it was replaced
      ws = null;
      listeners.forEach((f) => f({ type: 'closed' }));
      if (wanted) timer = setTimeout(open, Math.min(30000, 1000 * 2 ** retry++));
    };
    s.onerror = () => { try { s.close(); } catch {} };
  };
  openFn = open;
  open();
  window.addEventListener('online', reconnectNow);
  document.addEventListener('visibilitychange', onVisible);
}

/** Internet is back: try again straight away instead of waiting for the back-off */
function reconnectNow() { if (wanted && openFn && !liveUp()) { if (ws) { const s = ws; ws = null; try { s.close(); } catch {} } retry = 0; openFn(); } }
/** Back to the app (phone unlocked, window restored): check the line at once */
function onVisible() {
  if (document.visibilityState !== 'visible' || !wanted) return;
  if (!liveUp()) reconnectNow();
  else try { ws.send('ping'); } catch {}
}

export function disconnectLive() {
  wanted = false;
  clearTimeout(timer); timer = null; clearInterval(pinger);
  if (ws) { const s = ws; ws = null; try { s.close(); } catch {} }
  cfgKey = ''; openFn = null;
  window.removeEventListener('online', reconnectNow);
  document.removeEventListener('visibilitychange', onVisible);
}

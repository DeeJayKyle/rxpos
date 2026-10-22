// Crash reports from devices, kept private: errors on any device go to the pharmacy's own RxPOS cloud (no outside
// service) and the RxPOS owner sees them in the owner console, so problems are fixed before staff report them.
// The same error is sent once per day per device; reports wait on the device while offline. No sales or patient
// data is included: only the error message, where it happened in code, the page, the app build and the device type.
import { BUILD } from './update.js';
import { platformName } from './platform.js';

const QUEUE = 'rxpos-crash-queue';
const SENT = 'rxpos-crash-sent';
let cfg = null, flushing = false;
const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage blocked */ } };
const hash = (s) => { let h = 0; for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };
// Keep code locations, drop anything that could carry data (long numbers, emails, phone numbers incl. spaced/dashed)
export const scrub = (s, n) => String(s || '')
  .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[email]')
  .replace(/\d[\d\s-]{7,}\d/g, '[n]') // 0772 123 456 / 0772-123-456
  .replace(/\b\d{6,}\b/g, '[n]')
  .slice(0, n);

/** Record an error; sent when the device is linked to the cloud and online */
export function reportError(error, extra = {}) {
  try {
    const message = scrub(error?.message || error, 300);
    if (!message || /ResizeObserver loop|Script error\.?$|Load failed$/i.test(message)) return; // browser noise
    const stack = scrub(error?.stack || extra.componentStack || '', 3000);
    const key = hash(message + stack.split('\n').slice(0, 3).join('|'));
    const today = new Date().toISOString().slice(0, 10);
    const sent = read(SENT, {});
    if (sent[key] === today) return; // already reported today from this device
    const q = read(QUEUE, []).filter((x) => x.key !== key).slice(-19);
    q.push({ key, message, stack, page: location.hash.split('?')[0].slice(0, 80) || '/', build: BUILD, platform: platformName, kind: extra.kind || 'error', at: new Date().toISOString() });
    write(QUEUE, q);
    flush();
  } catch { /* reporting must never cause an error of its own */ }
}

/** Send what is waiting (called when the device links to the cloud, comes online, or an error is recorded) */
export async function flush() {
  const q = read(QUEUE, []);
  if (flushing || !q.length || !cfg?.url || !cfg?.key || !navigator.onLine) return;
  flushing = true;
  try {
    const r = await fetch(cfg.url + '/api/errors', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + cfg.key }, body: JSON.stringify({ errors: q }) });
    if (r.ok) {
      const sent = read(SENT, {}), today = new Date().toISOString().slice(0, 10);
      for (const e of q) sent[e.key] = today;
      write(SENT, Object.fromEntries(Object.entries(sent).filter(([, d]) => d === today)));
      write(QUEUE, read(QUEUE, []).filter((x) => !q.some((y) => y.key === x.key)));
    }
  } catch { /* try again later */ } finally { flushing = false; }
}

export function setCrashCloud(c) { cfg = c; flush(); }

let started = false;
export function startCrashReports() {
  if (started) return;
  started = true;
  window.addEventListener('error', (e) => reportError(e.error || e.message, { kind: 'error' }));
  window.addEventListener('unhandledrejection', (e) => reportError(e.reason, { kind: 'promise' }));
  window.addEventListener('online', flush);
}

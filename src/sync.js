// Offline-first sync with the RxPOS cloud.
// Each device keeps its full database locally and works without a network. Changes are pushed almost at once after
// they are made (store.jsx). Other devices hear about it straight away over the live connection (live.js) and pull it;
// without a live connection they check every 5 s while the app is in use (every 60 s in the background), and straight
// away when the internet comes back or the app is reopened. Requests go straight to the cloud server
// (api.rxposug.com), not through the website, which saves a hop on every sync.
// Conflicts: last writer (updatedAt) wins per record.
import { TABLES, now, isUntouchedBase, BASE_AT } from './store.jsx';
import { liveUp } from './live.js';
import { LIVE_CLOUD, OWN_SITES } from './cloud.js';

const ACTIVE = 5000; // no live connection, app in use
const LIVE_SAFETY = 30000; // live connection up: slow safety-net pull only
const BACKGROUND = 60000;
const PUSH_BATCH = 400;

/** The website (rxposug.com) only forwards /api requests to the cloud server: talk to the server directly */
const apiBase = (url) => {
  const u = String(url).replace(/\/+$/, '');
  return OWN_SITES.includes(u) ? LIVE_CLOUD : u;
};

export function collectChanges(db, since) {
  const out = [];
  for (const t of TABLES) for (const r of db[t]) {
    if (since && r.updatedAt <= since) continue;
    if (isUntouchedBase(r) || r.updatedAt === BASE_AT) continue; // built-in catalog medicines and untouched defaults: every device already has them
    const { _base, ...rec } = r; // eslint-disable-line no-unused-vars
    out.push({ t, id: r.id, rec, at: r.updatedAt });
  }
  for (const x of db._tomb) if (!since || x.at > since) out.push({ t: x.t, id: x.id, deleted: true, at: x.at });
  if (!since || db.settings.updatedAt > since) out.push({ t: 'settings', id: 'settings', rec: db.settings, at: db.settings.updatedAt });
  return out;
}

async function post(url, key, body) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 45000);
  try {
    const res = await fetch(apiBase(url) + '/api/sync', {
      method: 'POST', signal: ctl.signal,
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
      body: JSON.stringify(body),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(j.error || `Cloud replied ${res.status}`), { status: res.status });
    return j;
  } catch (e) {
    throw e.name === 'AbortError' ? new Error('The cloud took too long to answer') : e;
  } finally {
    clearTimeout(timer);
  }
}

export function createSync({ getDb, getCfg, saveCfg, applyRemote, onStatus }) {
  let busy = false, again = false, timer = null, stopped = false;
  let lastRun = 0;
  let waiters = []; // callers waiting for the sync running now (and the extra round it may need)

  /** Sync now. Resolves with the final status once this device is up to date (or the attempt failed). */
  async function run() {
    const cfg = getCfg();
    if (!cfg.url || !cfg.key) { onStatus({ state: 'off' }); return { state: 'off' }; }
    if (stopped) return { state: 'off' };
    if (busy) { again = true; return new Promise((res) => waiters.push(res)); } // a change came in while syncing: go round once more afterwards
    if (!navigator.onLine) { onStatus({ state: 'offline', lastSync: cfg.lastSync }); return { state: 'offline' }; }
    busy = true;
    lastRun = Date.now();
    let result;
    onStatus({ state: 'syncing', lastSync: cfg.lastSync, first: !cfg.lastSync });
    try {
      const started = now();
      const changes = collectChanges(getDb(), cfg.pushedAt);
      // Push in batches (the cloud accepts up to 500 per request); every reply also carries a page of remote changes
      const batches = [];
      for (let i = 0; i < changes.length; i += PUSH_BATCH) batches.push(changes.slice(i, i + PUSH_BATCH));
      let cursor = cfg.cursor || 0, sent = 0, pulled = 0;
      for (;;) {
        const r = await post(cfg.url, cfg.key, { deviceId: cfg.deviceId, since: cursor, changes: batches[sent] || [] });
        sent++;
        if (r.changes.length) { applyRemote(r.changes); pulled += r.changes.length; }
        cursor = r.cursor;
        if (sent >= batches.length && !r.more) break;
        onStatus({ state: 'syncing', first: !cfg.lastSync, progress: batches.length > 1 && sent < batches.length ? `Uploading ${Math.min(sent * PUSH_BATCH, changes.length)} of ${changes.length}` : `Downloading… ${pulled.toLocaleString()} records` });
      }
      const next = { ...getCfg(), pushedAt: started, cursor, lastSync: now(), lastError: '' };
      saveCfg(next);
      result = { state: 'ok', lastSync: next.lastSync, pushed: changes.length, pulled };
    } catch (e) {
      saveCfg({ ...getCfg(), lastError: e.message });
      result = { state: 'error', error: e.status === 401 ? 'Sign-in expired. Sign out and sign in again to keep syncing.' : e.message, lastSync: cfg.lastSync, expired: e.status === 401 };
    } finally {
      busy = false;
    }
    onStatus(result);
    if (again && !stopped) { again = false; return run(); }
    const w = waiters; waiters = [];
    w.forEach((res) => res(result));
    return result;
  }

  // The live connection tells us the moment something changes, so then we only need a slow safety-net pull
  const schedule = () => {
    clearTimeout(timer);
    const delay = document.visibilityState === 'hidden' ? BACKGROUND : liveUp() ? LIVE_SAFETY : ACTIVE;
    timer = setTimeout(() => { run(); schedule(); }, delay);
  };
  // back to the app (or the window got focus): pull at once, unless a sync ran in the last 3 s
  const onVisible = () => { schedule(); if (document.visibilityState === 'visible' && Date.now() - lastRun > 3000) run(); };
  const onOnline = () => run();
  const onOffline = () => getCfg().url && onStatus({ state: 'offline', lastSync: getCfg().lastSync });
  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline);
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('focus', onVisible);
  schedule();
  const first = setTimeout(run, 300);

  return {
    run,
    stop() {
      stopped = true;
      clearTimeout(timer);
      clearTimeout(first);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    },
  };
}

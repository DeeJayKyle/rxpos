// Offline-first sync with the RxPOS cloud.
// Each device keeps its full database locally and works without a network. Changes are pushed a moment after they
// are made (store.jsx), and the device pulls what others changed every 10 s while the app is in use (every 60 s in
// the background), straight away when the internet comes back or the app is reopened.
// Conflicts: last writer (updatedAt) wins per record.
import { TABLES, now, isUntouchedBase, BASE_AT } from './store.jsx';
import { liveUp } from './live.js';

const ACTIVE = 10000;
const BACKGROUND = 60000;
const PUSH_BATCH = 400;

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
    const res = await fetch(url.replace(/\/+$/, '') + '/api/sync', {
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

  async function run() {
    const cfg = getCfg();
    if (!cfg.url || !cfg.key) { onStatus({ state: 'off' }); return; }
    if (stopped) return;
    if (busy) { again = true; return; } // a change came in while syncing: go round once more afterwards
    if (!navigator.onLine) { onStatus({ state: 'offline', lastSync: cfg.lastSync }); return; }
    busy = true;
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
      onStatus({ state: 'ok', lastSync: next.lastSync, pushed: changes.length, pulled });
    } catch (e) {
      saveCfg({ ...getCfg(), lastError: e.message });
      onStatus({ state: 'error', error: e.status === 401 ? 'Sign-in expired. Sign out and sign in again to keep syncing.' : e.message, lastSync: cfg.lastSync, expired: e.status === 401 });
    } finally {
      busy = false;
      if (again && !stopped) { again = false; setTimeout(run, 200); }
    }
  }

  // The live connection tells us the moment something changes, so then we only need a slow safety-net pull
  const schedule = () => {
    clearTimeout(timer);
    const delay = document.visibilityState === 'hidden' ? BACKGROUND : liveUp() ? 60000 : ACTIVE;
    timer = setTimeout(() => { run(); schedule(); }, delay);
  };
  const onVisible = () => { schedule(); if (document.visibilityState === 'visible') run(); };
  const onOnline = () => run();
  const onOffline = () => getCfg().url && onStatus({ state: 'offline', lastSync: getCfg().lastSync });
  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline);
  document.addEventListener('visibilitychange', onVisible);
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
    },
  };
}

// Offline-first sync with a PharmaPOS hub (server/hub.mjs).
// Each device keeps its full database locally and works without a network. When a hub is configured,
// every 30 s (and when the connection comes back) it pushes records changed since the last push and
// pulls everything other devices changed since its cursor. Conflicts: last writer (updatedAt) wins per record.
import { TABLES, now } from './store.jsx';

const INTERVAL = 30000;
const PUSH_BATCH = 400;

export function collectChanges(db, since) {
  const out = [];
  for (const t of TABLES) for (const r of db[t]) if (!since || r.updatedAt > since) out.push({ t, id: r.id, rec: r, at: r.updatedAt });
  for (const x of db._tomb) if (!since || x.at > since) out.push({ t: x.t, id: x.id, deleted: true, at: x.at });
  if (!since || db.settings.updatedAt > since) out.push({ t: 'settings', id: 'settings', rec: db.settings, at: db.settings.updatedAt });
  return out;
}

async function post(url, key, body) {
  const res = await fetch(url.replace(/\/+$/, '') + '/api/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
    body: JSON.stringify(body),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || `Hub replied ${res.status}`);
  return j;
}

export function createSync({ getDb, getCfg, saveCfg, applyRemote, onStatus }) {
  let busy = false, timer = null, stopped = false;

  async function run() {
    const cfg = getCfg();
    if (!cfg.url || !cfg.key) { onStatus({ state: 'off' }); return; }
    if (busy || stopped) return;
    if (!navigator.onLine) { onStatus({ state: 'offline', lastSync: cfg.lastSync }); return; }
    busy = true;
    onStatus({ state: 'syncing', lastSync: cfg.lastSync });
    try {
      const started = now();
      const changes = collectChanges(getDb(), cfg.pushedAt);
      // Push in batches (the cloud hub accepts up to 500 per request); every reply also carries a page of remote changes
      const batches = [];
      for (let i = 0; i < changes.length; i += PUSH_BATCH) batches.push(changes.slice(i, i + PUSH_BATCH));
      let cursor = cfg.cursor || 0, sent = 0, pulled = 0;
      for (;;) {
        const r = await post(cfg.url, cfg.key, { deviceId: cfg.deviceId, since: cursor, changes: batches[sent] || [] });
        sent++;
        if (r.changes.length) { applyRemote(r.changes); pulled += r.changes.length; }
        cursor = r.cursor;
        if (sent >= batches.length && !r.more) break;
        if (sent > 1 && batches.length > 1) onStatus({ state: 'syncing', progress: `Uploaded ${Math.min(sent * PUSH_BATCH, changes.length)} of ${changes.length}` });
      }
      const next = { ...cfg, pushedAt: started, cursor, lastSync: now(), lastError: '' };
      saveCfg(next);
      onStatus({ state: 'ok', lastSync: next.lastSync, pushed: changes.length, pulled });
    } catch (e) {
      saveCfg({ ...cfg, lastError: e.message });
      onStatus({ state: 'error', error: e.message, lastSync: cfg.lastSync });
    } finally {
      busy = false;
    }
  }

  const onOnline = () => run();
  const onOffline = () => getCfg().url && onStatus({ state: 'offline', lastSync: getCfg().lastSync });
  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline);
  timer = setInterval(run, INTERVAL);
  const first = setTimeout(run, 1500);

  return {
    run,
    stop() {
      stopped = true;
      clearInterval(timer);
      clearTimeout(first);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    },
  };
}

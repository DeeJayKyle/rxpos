// Older history from the cloud, for a page whose dates go back before this device's window (faster sync, stage 4:
// docs/SYNC-HISTORY-WINDOW.md). The records are fetched for the page only and never stored; a record this device
// already holds wins (it may be newer). Without a window, or for dates inside it, nothing is fetched and the page
// uses the device's own records exactly as before.
import { useEffect, useMemo, useState } from 'react';
import { LIVE_CLOUD, OWN_SITES } from './cloud.js';

const base = (url) => { const u = String(url).replace(/\/+$/, ''); return OWN_SITES.includes(u) ? LIVE_CLOUD : u; };

/** Every record of table t dated in [from, to) from the cloud (paged) */
export async function fetchOlder(cfg, t, from, to) {
  const out = [];
  let after = 0;
  for (let n = 0; n < 200; n++) {
    const res = await fetch(base(cfg.url) + '/api/history', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + cfg.key }, body: JSON.stringify({ t, from, to, after }) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || !Array.isArray(j.records)) throw new Error(j.error || `Cloud replied ${res.status}`);
    out.push(...j.records);
    if (!j.more) break;
    after = j.after;
  }
  return out;
}

/**
 * The page's database with the older records of `tables` added when `from` (YYYY-MM-DD) is before the window start:
 * { db, state: 'local' | 'loading' | 'cloud' | 'offline', W }. `from` empty means "from the beginning".
 */
export function useOlderHistory(db, syncCfg, from, tables) {
  const W = db?._window?.W || '';
  const need = !!W && (!from || from < W) && !!syncCfg?.key;
  const key = need ? `${from || ''}|${W}|${tables.join(',')}` : '';
  const [got, setGot] = useState({ key: '', recs: null, error: '' });
  useEffect(() => {
    if (!key) return undefined;
    let live = true;
    (async () => {
      try {
        const recs = {};
        for (const t of tables) recs[t] = await fetchOlder(syncCfg, t, from || '0000-00-00', W);
        if (live) setGot({ key, recs, error: '' });
      } catch (e) { if (live) setGot({ key, recs: null, error: e.message }); }
    })();
    return () => { live = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return useMemo(() => {
    if (!need) return { db, state: 'local', W };
    if (got.key !== key) return { db, state: 'loading', W };
    if (!got.recs) return { db, state: 'offline', W, error: got.error };
    const merged = { ...db };
    for (const t of tables) {
      const have = new Set((db[t] || []).map((r) => String(r.id)));
      const older = got.recs[t].filter((r) => !have.has(String(r.id)));
      if (older.length) merged[t] = [...(db[t] || []), ...older];
    }
    return { db: merged, state: 'cloud', W };
  }, [db, need, key, got, W]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** The note a page shows about its older part */
export function olderNote(h) {
  if (h.state === 'loading') return `Fetching records before ${h.W} from the cloud…`;
  if (h.state === 'offline') return `Records before ${h.W} are kept in the cloud: connect to the internet to include them`;
  if (h.state === 'cloud') return `Includes records before ${h.W} from the cloud`;
  return '';
}

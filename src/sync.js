// Offline-first sync with the RxPOS cloud.
// Each device keeps its full database locally and works without a network. Changes are pushed almost at once after
// they are made (store.jsx). Other devices hear about it straight away over the live connection (live.js) and pull it;
// without a live connection they check every 5 s while the app is in use (every 60 s in the background), and straight
// away when the internet comes back or the app is reopened. Requests go straight to the cloud server
// (api.rxposug.com), not through the website, which saves a hop on every sync.
//
// 1.6 (protocol 2): what to send comes from the durable outbox (storage.js), written in the same device transaction
// as each change, not from comparing timestamps. Each change carries a unique op id that the cloud remembers, so a
// request repeated after a lost reply is applied once. One action's changes (a sale with its stock movements) are
// never split across requests, and the cloud applies each request in one database transaction. Entries leave the
// outbox only after the cloud has accepted them; refused ones are kept aside for review, never dropped. Pulled
// records are saved on the device before the sync position moves past them, and that position is saved after every
// page, so an interrupted download resumes where it stopped. Failures are retried with exponential backoff and jitter.
// Conflicts: sales, stock movements, audit and other records that are only ever added carry unique ids, so two
// devices never overwrite each other's; stock is the sum of movements. Records that are edited (a medicine's price,
// settings) follow last writer wins by change time, with the cloud clamping clocks that run ahead (docs/ARCHITECTURE.md).
import { TABLES, now, isUntouchedBase, BASE_AT } from './store.jsx';
import { liveUp } from './live.js';
import { LIVE_CLOUD, OWN_SITES } from './cloud.js';

const ACTIVE = 5000; // no live connection, app in use
const LIVE_SAFETY = 30000; // live connection up: slow safety-net pull only
const BACKGROUND = 60000;
const PUSH_BATCH = 400;
export const PULL_LIMIT = 10000; // records per page asked for (a cloud before the faster sync sends 2,500)
export const FLUSH = 10000, FLUSH_MS = 3000; // downloaded records applied and saved together
export const CORE_DAYS = 3; // stage 2: a full download's core has every sale from the last days (today's cash-up, returns)
export const PROTOCOL = 2;
// Bumped when every installed app must download the whole pharmacy again once and merge it (nothing is deleted, the
// newer copy of each record wins, unsent changes are sent first). 1: Windows apps found missing deliveries, batches and
// medicine updates made on other devices since 19 Oct 2026, while the cloud had them all.
export const FULL_PULL = 1;
const MAX_BACKOFF = 60000;
/** Wait before retry n (1, 2, …): 2 s, 4 s, 8 s … up to a minute, ±50 % so many devices don't retry in step */
export const backoff = (n, rand = Math.random) => Math.round(Math.min(MAX_BACKOFF, 1000 * 2 ** n) * (0.5 + rand()));

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
    const { _base, ...rec } = r;
    out.push({ t, id: r.id, rec, at: r.updatedAt });
  }
  for (const x of db._tomb) if (!since || x.at > since) out.push({ t: x.t, id: x.id, deleted: true, at: x.at });
  if ((!since || db.settings.updatedAt > since) && db.settings.updatedAt !== BASE_AT) out.push({ t: 'settings', id: 'settings', rec: db.settings, at: db.settings.updatedAt }); // untouched defaults are never sent
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
    if (!j || !Array.isArray(j.changes) || !Number.isFinite(Number(j.cursor))) throw new Error('The cloud sent an unexpected reply; trying again shortly.');
    return j;
  } catch (e) {
    throw e.name === 'AbortError' ? new Error('The cloud took too long to answer') : e;
  } finally {
    clearTimeout(timer);
  }
}


/** Outbox entries in request-sized groups, never splitting one action (txn) unless it alone is too big */
export function groupOutbox(entries, max = PUSH_BATCH) {
  const out = [];
  let cur = [];
  for (let i = 0; i < entries.length;) {
    let j = i;
    while (j < entries.length && entries[j].txn === entries[i].txn) j++;
    const g = entries.slice(i, j);
    if (cur.length && cur.length + g.length > max) { out.push(cur); cur = []; }
    if (g.length > max) for (let k = 0; k < g.length; k += max) out.push(g.slice(k, k + max));
    else cur.push(...g);
    i = j;
  }
  if (cur.length) out.push(cur);
  return out;
}

/** The changes to send for a group of outbox entries: one per record, its current version, with the latest op id */
export function toChanges(entries, db) {
  const latest = new Map();
  for (const e of entries) latest.set(e.t + '|' + e.id, e);
  const index = {};
  const out = [];
  for (const e of latest.values()) {
    if (e.deleted) { out.push({ t: e.t, id: e.id, deleted: true, at: e.at, op: e.op }); continue; }
    if (e.t === 'settings') { out.push({ t: 'settings', id: 'settings', rec: db.settings, at: db.settings.updatedAt || e.at, op: e.op }); continue; }
    if (!db[e.t]) continue;
    index[e.t] ??= new Map(db[e.t].map((r) => [String(r.id), r]));
    const r = index[e.t].get(String(e.id));
    if (!r) continue; // removed since: its delete is a later entry
    const { _base, ...rec } = r;
    out.push({ t: e.t, id: String(e.id), rec, at: r.updatedAt || e.at, op: e.op });
  }
  return out;
}

export function createSync({ getDb, getCfg, saveCfg, applyRemote, onStatus, store }) {
  let busy = false, again = false, timer = null, stopped = false;
  let lastRun = 0, failures = 0, retryAt = 0;
  let waiters = []; // callers waiting for the sync running now (and the extra round it may need)
  const counts = async () => ({ pending: await store.count().catch(() => 0), rejected: (await store.rejected().catch(() => [])).length });

  /** Sync now. Resolves with the final status once this device is up to date (or the attempt failed). */
  async function run() {
    const cfg = getCfg();
    if (!cfg?.url || !cfg?.key) { onStatus({ state: 'off', ...(await counts()) }); return { state: 'off' }; }
    if (stopped) return { state: 'off' };
    if (busy) { again = true; return new Promise((res) => waiters.push(res)); } // a change came in while syncing: go round once more afterwards
    if (!navigator.onLine) { const r = { state: 'offline', lastSync: cfg.lastSync, ...(await counts()) }; onStatus(r); return r; }
    busy = true;
    lastRun = Date.now();
    let result;
    onStatus({ state: 'syncing', lastSync: cfg.lastSync, first: !cfg.lastSync, ...(await counts()) });
    try {
      // once: changes made before the outbox existed (a 1.5 device), or everything a device holds when it is first
      // linked to a pharmacy, go into the outbox with the rule 1.5 used
      if (!getCfg().outboxV2) {
        const old = collectChanges(getDb(), getCfg().pushedAt);
        const txn = 'link-' + Date.now();
        await store.commit({ puts: [], dels: [], ops: old.map((ch) => ({ op: crypto.randomUUID(), txn, t: ch.t, id: String(ch.id), deleted: !!ch.deleted, at: ch.at })) });
        await saveCfg({ ...getCfg(), outboxV2: true });
      }
      const c = getCfg();
      const batches = groupOutbox(await store.outbox());
      const total = batches.reduce((a, b) => a + b.length, 0);
      // download everything this time. It starts from 0 once (fullInProgress); a run cut off part-way leaves the pages
      // that arrived on the device, and the next run carries on from the last one instead of starting again.
      const full = (c.fullPull || 0) < FULL_PULL;
      // Faster sync, stage 2: a full download comes in phases. First the core (medicines, stock, clients, staff, open
      // debts: the app is usable once it is in), then the history (older cash sales, audit log, messages…), then
      // whatever changed meanwhile, from where the core ended. A cloud without phases sends everything at once.
      if (full && !c.fullInProgress) await saveCfg({ ...getCfg(), cursor: 0, fullInProgress: true, phase: 'core', coreCursor: 0, cutoff: new Date(Date.now() - CORE_DAYS * 864e5).toISOString() });
      let phase = full ? getCfg().phase || null : null; // a download begun by an older version carries on without phases
      let cursor = full ? getCfg().cursor || 0 : c.cursor || 0, epoch = c.epoch, i = 0, sent = 0, pulled = 0, refused = 0;
      // Faster sync, stage 1 (docs/SYNC-SPEED-PLAN.md): downloaded pages are applied and saved in batches (FLUSH records
      // or every FLUSH_MS) instead of one by one, since each save rewrites the storage buckets it touches and redraws
      // the app; and while a batch is being saved, the next page is already on its way. The sync position is saved only
      // after the records before it are on the device, so an interrupted download still resumes where it stopped.
      let held = [], heldCursor = cursor, heldAt = Date.now();
      const flush = async () => {
        if (held.length) { const ch = held; held = []; await applyRemote(ch); pulled += ch.length; }
        await saveCfg({ ...getCfg(), cursor: heldCursor, epoch });
        heldAt = Date.now();
      };
      const ask = (since, batch) => post(c.url, c.key, { deviceId: c.deviceId, since, changes: toChanges(batch, getDb()), v: PROTOCOL, limit: PULL_LIMIT, ...(full ? { all: true } : {}),
        ...(phase === 'core' || phase === 'history' ? { phase, cutoff: getCfg().cutoff } : {}) });
      const later = () => phase === 'history' || phase === 'tail'; // the core is in: the app can be used
      let ahead = null; // the next page, asked for while this one is saved
      try {
        for (;;) {
          const batch = batches[i] || [];
          const r = ahead ? await ahead : await ask(cursor, batch);
          ahead = null;
          i++;
          // the request was applied as a whole: refused changes are kept for review, the rest leave the outbox
          if (batch.length) {
            const no = new Set(r.refusedKeys || []);
            const bad = batch.filter((e) => no.has(e.t + '|' + e.id));
            if (bad.length) await store.reject(bad, 'Refused by the cloud: no permission for this change, or it is too large.');
            await store.ack(batch.filter((e) => !no.has(e.t + '|' + e.id)).map((e) => e.key));
            sent += batch.length; refused += bad.length;
          }
          // 1.4 the cloud was restored from a backup: its database epoch changed, so re-pull everything from the start
          // and merge (last-writer-wins). Restored rows keep their old sequence numbers, below this device's cursor.
          // It also lost what this device sent after that backup (already acknowledged, so no longer in the outbox): once
          // the download is done, everything this device holds goes up once more (resendAfterRestore, kept with the sync
          // settings so an interrupted run still does it).
          if (r.epoch !== undefined && epoch !== undefined && r.epoch !== epoch) {
            if (held.length) await flush(); // what arrived before the restore is still merged (newest copy wins)
            epoch = r.epoch; cursor = 0; heldCursor = 0;
            if (phase) phase = 'core';
            await saveCfg({ ...getCfg(), cursor, epoch, resendAfterRestore: true, ...(phase ? { phase, coreCursor: 0 } : {}) }); continue;
          }
          // a cloud without phases ignored the phase and sent everything in order: carry on as one plain download
          if ((phase === 'core' || phase === 'history') && r.phase !== phase) { phase = null; await saveCfg({ ...getCfg(), phase: null }); }
          epoch = r.epoch ?? epoch;
          cursor = Number(r.cursor);
          const sending = i < batches.length;
          // only downloading, and more to come: ask for the next page now, so it travels while this batch is saved
          if (!sending && r.more) { ahead = ask(cursor, []); ahead.catch(() => {}); }
          if (r.changes.length) held.push(...r.changes);
          heldCursor = cursor;
          if (sending || !r.more || held.length >= FLUSH || Date.now() - heldAt >= FLUSH_MS) await flush();
          if (!sending && !r.more) {
            // the core is in: the history next, from the start; then what changed since the core ended
            if (phase === 'core') { phase = 'history'; await saveCfg({ ...getCfg(), phase, coreCursor: cursor, cursor: 0 }); cursor = 0; heldCursor = 0; }
            else if (phase === 'history') { phase = 'tail'; cursor = getCfg().coreCursor || 0; heldCursor = cursor; await saveCfg({ ...getCfg(), phase, cursor }); }
            else break;
          }
          const what = later() ? 'Downloading older records' : 'Downloading';
          onStatus({ state: 'syncing', first: !c.lastSync, history: later(), progress: sending ? `Sending ${sent.toLocaleString()} of ${total.toLocaleString()} changes` : `${what}… ${(pulled + held.length).toLocaleString()} records`, ...(await counts()) });
        }
      } catch (e) {
        // cut off part-way (the connection dropped): what already arrived is saved, so the next run carries on after it
        if (held.length) await flush().catch(() => {});
        throw e;
      }
      if (getCfg().resendAfterRestore) {
        // Each change goes with its own updatedAt, so the cloud keeps whichever copy is newer (last writer wins) and
        // never changes add-only rows: resending what it already has does nothing. A record deleted and later made
        // again still has its old tombstone; the record is what this device has now, so that delete is not sent.
        const db = getDb();
        const live = new Set(TABLES.flatMap((t) => (db[t] || []).map((x) => t + '|' + x.id)));
        const all = collectChanges(db, null).filter((ch) => !(ch.deleted && live.has(ch.t + '|' + ch.id)));
        await store.commit({ puts: [], dels: [], ops: all.map((ch) => ({ op: crypto.randomUUID(), txn: crypto.randomUUID(), t: ch.t, id: String(ch.id), deleted: !!ch.deleted, at: ch.at })) });
        await saveCfg({ ...getCfg(), resendAfterRestore: false }); // after the commit: a crash in between only queues it twice
        if (all.length) again = true; // send them straight away
      }
      const next = { ...getCfg(), lastSync: now(), lastError: '', ...(full ? { fullPull: FULL_PULL, fullInProgress: false, phase: null } : {}) };
      await saveCfg(next);
      failures = 0; retryAt = 0;
      result = { state: 'ok', lastSync: next.lastSync, pushed: sent, pulled, refused, ...(await counts()) };
    } catch (e) {
      failures++;
      const expired = e.status === 401;
      // the cloud can't be reached (no route, DNS, refused): that is "offline", not a fault to look into
      const unreachable = !e.status && (e instanceof TypeError || /fetch|network|took too long/i.test(e.message || ''));
      retryAt = expired ? 0 : Date.now() + backoff(failures);
      await saveCfg({ ...getCfg(), lastError: e.message });
      result = unreachable ? { state: 'offline', error: 'The cloud can\'t be reached right now.', lastSync: cfg.lastSync, retryAt, ...(await counts()) }
        : { state: 'error', error: expired ? 'Sign-in expired. Sign out and sign in again to keep syncing.' : e.message, lastSync: cfg.lastSync, expired, retryAt, ...(await counts()) };
    } finally {
      busy = false;
    }
    onStatus(result);
    if (again && !stopped && result.state === 'ok') { again = false; return run(); }
    again = false;
    const w = waiters; waiters = [];
    w.forEach((res) => res(result));
    return result;
  }

  // The live connection tells us the moment something changes, so then we only need a slow safety-net pull
  const schedule = () => {
    clearTimeout(timer);
    const base = document.visibilityState === 'hidden' ? BACKGROUND : liveUp() ? LIVE_SAFETY : ACTIVE;
    const delay = retryAt > Date.now() ? Math.max(1000, retryAt - Date.now()) : base; // after a failure: back off
    timer = setTimeout(() => { run(); schedule(); }, delay);
  };
  // back to the app (or the window got focus): pull at once, unless a sync ran in the last 3 s
  const onVisible = () => { schedule(); if (document.visibilityState === 'visible' && Date.now() - lastRun > 3000) run(); };
  const onOnline = () => { failures = 0; retryAt = 0; run(); };
  const onOffline = () => getCfg().url && onStatus({ state: 'offline', lastSync: getCfg().lastSync });
  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline);
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('focus', onVisible);
  schedule();
  const first = setTimeout(run, 300);

  return {
    run,
    /** "Download everything again" (This device): the next sync re-pulls the whole pharmacy and merges it */
    async pullAll() { await saveCfg({ ...getCfg(), fullPull: 0, fullInProgress: false }); return run(); }, // from the start again
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

// Faster sync, stage 3 (docs/SYNC-SPEED-PLAN.md): ready-made, compressed chunks of a full download.
//
// A pharmacy's records are cut into chunks by sequence number at fixed boundaries, about CHUNK records each. The
// boundaries are kept (snapshot_bounds) and only added to as the pharmacy grows, and a chunk is only ever a CLOSED
// range: its upper boundary is a sequence number that already exists. Every later change gets a higher number than
// any existing one, so a closed range never gains records; it can only lose those changed since (their newer copy
// is in a later range or after the last boundary). A chunk built once is therefore right forever: a device that
// applies every chunk in order and then pages from the last boundary (the newest copy of each record wins) has
// exactly the pharmacy. Chunks are kept compressed in R2 (the APPS bucket, under snapshots/), per pharmacy, restore
// epoch, phase and cutoff day (stage 2) and what the role may see (payroll, sale checks), and built the first time
// one is asked for. A restore (new epoch) starts new boundaries; chunks of older epochs and cutoff days are removed
// by the nightly clean-up. The hub has no R2: it answers 404 and the apps page as before.

export const CHUNK = 20000;
/** The chunk size: CHUNK, or SNAPSHOT_CHUNK in the tests' local cloud (tests/run-all.mjs) */
const chunkOf = (env) => Number(env?.SNAPSHOT_CHUNK) || CHUNK;

/** The pharmacy's chunk boundaries for this epoch: [0, b1, b2, …], extended to cover every closed full chunk */
export async function chunkBounds(db, tenant, epoch, size = CHUNK) {
  const row = await db.prepare('SELECT v FROM snapshot_bounds WHERE tenant = ?1').bind(tenant).first();
  let st;
  try { st = row ? JSON.parse(row.v) : null; } catch { st = null; }
  if (!st || st.epoch !== epoch || st.size !== size || !Array.isArray(st.bounds) || !st.bounds.length) st = { epoch, size, bounds: [0] };
  let grew = !row || st.bounds.length === 1;
  for (let n = 0; n < 200; n++) {
    const last = st.bounds[st.bounds.length - 1];
    const r = await db.prepare('SELECT seq FROM records WHERE tenant = ?1 AND seq > ?2 ORDER BY seq LIMIT 1 OFFSET ?3').bind(tenant, last, size - 1).first();
    if (!r) break;
    st.bounds.push(Number(r.seq));
    grew = true;
  }
  if (grew) await db.prepare('INSERT INTO snapshot_bounds (tenant, v) VALUES (?1, ?2) ON CONFLICT(tenant) DO UPDATE SET v = excluded.v').bind(tenant, JSON.stringify(st)).run();
  return st.bounds;
}

/** The cutoff day a phase is split at (stage 2): whole days, so every device downloading that day shares the chunks */
export const cutoffDay = (cutoff) => (typeof cutoff === 'string' && /^\d{4}-\d{2}-\d{2}/.test(cutoff) ? cutoff.slice(0, 10) : new Date(Date.now() - 3 * 864e5).toISOString().slice(0, 10));

/**
 * POST /api/snapshot { phase?, cutoff? }: the chunks of a full download, { epoch, chunks: [{ from, to }] }.
 * Records after the last chunk are paged with /api/sync as before.
 */
export async function snapshotList(env, body, who, { json, epochOf }) {
  if (!env.APPS) return json({ error: 'No ready-made downloads here' }, 404);
  const epoch = await epochOf(env.DB);
  const b = await chunkBounds(env.DB, who.tenant, epoch, chunkOf(env));
  const chunks = [];
  for (let i = 1; i < b.length; i++) chunks.push({ from: b[i - 1], to: b[i] });
  return json({ epoch, chunks, cutoff: cutoffDay(body?.cutoff) + 'T00:00:00.000Z' });
}

/**
 * POST /api/snapshot/chunk { phase?, cutoff?, from, to }: one chunk, { changes: [...] } like a sync page, sent
 * compressed (gzip) as stored. Only a pair of the pharmacy's own boundaries is accepted.
 */
export async function snapshotChunk(env, body, who, { json, epochOf, historySql, viewOf, itemJson, windowOf, keepsRow }) {
  if (!env.APPS) return json({ error: 'No ready-made downloads here' }, 404);
  const epoch = await epochOf(env.DB);
  const from = Number(body?.from), to = Number(body?.to);
  const b = await chunkBounds(env.DB, who.tenant, epoch, chunkOf(env));
  const i = b.indexOf(from);
  if (i < 0 || b[i + 1] !== to) return json({ error: 'Not a chunk of this pharmacy (download the list again)' }, 404);
  const phase = body?.phase === 'core' || body?.phase === 'history' ? body.phase : 'all';
  const day = phase === 'all' ? '0000-00-00' : cutoffDay(body?.cutoff); // a whole download does not depend on the day
  const view = await viewOf(who); // { key, hideHr, hideChecks }
  const W = windowOf(body); // stage 4: a device keeping recent history
  const key = `snapshots/${who.tenant}/${epoch}/${phase}-${day}-${view.key}${W ? '-w' + W.slice(0, 10) : ''}-${from}-${to}.json.gz`;
  const headers = { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip', 'Cache-Control': 'private, no-store', 'X-RxPOS-Chunk': 'stored' };
  const kept = await env.APPS.get(key);
  if (kept) return new Response(kept.body, { headers, encodeBody: 'manual' });

  const filter = phase === 'core' ? ` AND NOT (${historySql})` : phase === 'history' ? ` AND (${historySql})` : '';
  const { results } = await env.DB.prepare(`SELECT t, id, rec, deleted, at FROM records WHERE tenant = ?1 AND seq > ?2 AND seq <= ?3${filter} ORDER BY seq`)
    .bind(...(filter ? [who.tenant, from, to, 0, 0, day + 'T00:00:00.000Z'] : [who.tenant, from, to])).all();
  const items = [];
  for (const r of results || []) {
    if (view.hideHr && view.payroll.has(r.t)) continue;
    if (view.hideChecks && r.t === 'anomalies') continue;
    if (W && !keepsRow(r, W)) continue;
    items.push(itemJson(r));
  }
  const text = `{"changes":[${items.join(',')}],"from":${from},"to":${to},"phase":${JSON.stringify(phase)}}`;
  const gz = new Uint8Array(await new Response(new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
  await env.APPS.put(key, gz, { httpMetadata: { contentType: 'application/json', contentEncoding: 'gzip' } });
  return new Response(gz, { headers: { ...headers, 'X-RxPOS-Chunk': 'built' }, encodeBody: 'manual' });
}

/** Nightly: remove chunks of older restore epochs and of cutoff days more than two days old */
export async function pruneSnapshots(env, epochOf) {
  if (!env.APPS) return 0;
  const epoch = await epochOf(env.DB);
  const keep = new Set([0, 1, 2].map((d) => new Date(Date.now() - (3 + d) * 864e5).toISOString().slice(0, 10)).concat(new Date(Date.now() - 2 * 864e5).toISOString().slice(0, 10)));
  let cursor, removed = 0;
  do {
    const page = await env.APPS.list({ prefix: 'snapshots/', cursor, limit: 1000 });
    const gone = page.objects.map((o) => o.key).filter((k) => {
      const [, , ep, file] = k.split('/');
      const day = (file || '').split('-').slice(1, 4).join('-');
      return ep !== String(epoch) || (!file.startsWith('all-') && !keep.has(day));
    });
    if (gone.length) { await env.APPS.delete(gone); removed += gone.length; }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return removed;
}

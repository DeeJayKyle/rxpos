// PharmaPOS cloud hub on Cloudflare Workers (free plan) + D1.
// Same sync protocol as server/hub.mjs: POST /api/sync { deviceId, since, changes[] } → { changes, cursor, more }.
// Everything else is the web app, served from ./dist as static assets.
const PAGE = 1000;
const MAX_PUSH = 500;

let schemaReady = null;
function ensureSchema(db) {
  schemaReady ??= db.batch([
    db.prepare('CREATE TABLE IF NOT EXISTS rows (k TEXT PRIMARY KEY, t TEXT NOT NULL, id TEXT NOT NULL, rec TEXT, deleted INTEGER NOT NULL DEFAULT 0, at TEXT NOT NULL, seq INTEGER NOT NULL, origin TEXT)'),
    db.prepare('CREATE INDEX IF NOT EXISTS rows_seq ON rows(seq)'),
  ]).catch((e) => { schemaReady = null; throw e; });
  return schemaReady;
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
const json = (body, status = 200) =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...cors } });

async function authorized(req, env) {
  const key = env.SYNC_KEY || '';
  if (key.length < 12) return false;
  const got = new TextEncoder().encode((req.headers.get('Authorization') || '').replace(/^Bearer /, ''));
  const want = new TextEncoder().encode(key);
  return got.byteLength === want.byteLength && crypto.subtle.timingSafeEqual(got, want);
}

async function sync(env, body) {
  const db = env.DB;
  await ensureSchema(db);
  const { deviceId, since = 0, changes = [] } = body;
  if (!deviceId) return json({ error: 'Missing deviceId' }, 400);
  if (changes.length > MAX_PUSH) return json({ error: `Send at most ${MAX_PUSH} changes per request` }, 413);

  // Last writer wins per record; every accepted write gets the next sequence number.
  const upsert = db.prepare(
    `INSERT INTO rows (k, t, id, rec, deleted, at, origin, seq)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, (SELECT COALESCE(MAX(seq), 0) + 1 FROM rows))
     ON CONFLICT(k) DO UPDATE SET rec = excluded.rec, deleted = excluded.deleted, at = excluded.at,
       origin = excluded.origin, seq = excluded.seq
     WHERE excluded.at > rows.at`
  );
  const stmts = [];
  for (const ch of changes) {
    if (!ch || typeof ch.t !== 'string' || ch.id == null || typeof ch.at !== 'string') continue;
    const id = String(ch.id);
    stmts.push(upsert.bind(ch.t + '|' + id, ch.t, id, ch.deleted ? null : JSON.stringify(ch.rec ?? null), ch.deleted ? 1 : 0, ch.at, deviceId));
  }
  let applied = 0;
  if (stmts.length) for (const r of await db.batch(stmts)) applied += r.meta.changes || 0;

  const { results } = await db
    .prepare('SELECT t, id, rec, deleted, at, seq FROM rows WHERE seq > ?1 AND origin IS NOT ?2 ORDER BY seq LIMIT ?3')
    .bind(Number(since) || 0, deviceId, PAGE + 1)
    .all();
  const more = results.length > PAGE;
  const page = more ? results.slice(0, PAGE) : results;
  const cursor = more ? page[page.length - 1].seq : ((await db.prepare('SELECT MAX(seq) m FROM rows').first('m')) || 0);
  // Build the response by hand so records stored as JSON text are not parsed and re-serialised (keeps CPU low)
  const items = page.map((r) => `{"t":${JSON.stringify(r.t)},"id":${JSON.stringify(r.id)},"at":${JSON.stringify(r.at)},"deleted":${r.deleted ? 'true' : 'false'},"rec":${r.rec ?? 'null'}}`);
  return json(`{"changes":[${items.join(',')}],"cursor":${cursor},"more":${more},"applied":${applied}}`);
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(req);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (url.pathname === '/api/health') return json({ ok: true, app: 'pharmapos-cloud', configured: (env.SYNC_KEY || '').length >= 12 });
    if (url.pathname === '/api/sync' && req.method === 'POST') {
      if (!(await authorized(req, env))) return json({ error: 'Wrong sync key' }, 401);
      let body;
      try { body = await req.json(); } catch { return json({ error: 'Bad request' }, 400); }
      try { return await sync(env, body); } catch (e) { return json({ error: 'Hub error: ' + e.message }, 500); }
    }
    return json({ error: 'Not found' }, 404);
  },
};

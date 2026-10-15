// Whole-cloud backup and restore (owner only). Read in small pages so it stays inside the Workers CPU limit;
// the nightly GitHub Action (.github/workflows/backup.yml) pages through it, encrypts the result and keeps it.
//   GET  /api/owner/backup?part=meta                → tenants, owner settings, attachment list, record count
//   GET  /api/owner/backup?part=records&after=<seq> → up to 1000 records after that sequence number
//   GET  /api/owner/backup?part=chunks&after=<n>    → up to 4 attachment pieces (base64) after that row number
//   POST /api/owner/restore { confirm: 'RESTORE', part, rows } → puts rows back exactly as they were

const RECORDS_PAGE = 1000;
const CHUNKS_PAGE = 4;

const b64 = (data) => {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const unb64 = (s) => Uint8Array.from(atob(String(s || '')), (c) => c.charCodeAt(0));

export async function backup(env, url, json) {
  const db = env.DB;
  const part = url.searchParams.get('part') || 'meta';
  if (part === 'meta') {
    const tenants = (await db.prepare('SELECT * FROM tenants').all()).results;
    const ownerConfig = (await db.prepare('SELECT k, v FROM owner_config').all()).results;
    const files = (await db.prepare('SELECT * FROM files').all().catch(() => ({ results: [] }))).results;
    const records = await db.prepare('SELECT COUNT(*) n FROM records').first('n');
    const chunks = await db.prepare('SELECT COUNT(*) n FROM file_chunks').first('n').catch(() => 0);
    const maxSeq = (await db.prepare('SELECT MAX(seq) m FROM records').first('m')) || 0;
    return json({ version: 1, at: new Date().toISOString(), database: env.DB_BACKEND === 'turso' ? 'turso' : 'd1', counts: { tenants: tenants.length, records, files: files.length, chunks }, maxSeq, tenants, ownerConfig, files });
  }
  if (part === 'records') {
    const after = Number(url.searchParams.get('after')) || 0;
    const { results } = await db.prepare('SELECT tenant, k, t, id, rec, deleted, at, seq, origin FROM records WHERE seq > ?1 ORDER BY seq LIMIT ?2').bind(after, RECORDS_PAGE).all();
    // built by hand so stored JSON isn't parsed and re-serialised (keeps CPU low)
    const rows = results.map((r) => `{"tenant":${JSON.stringify(r.tenant)},"k":${JSON.stringify(r.k)},"t":${JSON.stringify(r.t)},"id":${JSON.stringify(r.id)},"rec":${r.rec == null ? 'null' : JSON.stringify(r.rec)},"deleted":${r.deleted ? 1 : 0},"at":${JSON.stringify(r.at)},"seq":${Number(r.seq)},"origin":${JSON.stringify(r.origin ?? null)}}`);
    return json(`{"rows":[${rows.join(',')}],"last":${results.length ? Number(results.at(-1).seq) : after},"done":${results.length < RECORDS_PAGE}}`);
  }
  if (part === 'chunks') {
    const after = Number(url.searchParams.get('after')) || 0;
    const { results } = await db.prepare('SELECT rowid AS r, tenant, id, n, data FROM file_chunks WHERE rowid > ?1 ORDER BY rowid LIMIT ?2').bind(after, CHUNKS_PAGE).all();
    return json({ rows: results.map((x) => ({ tenant: x.tenant, id: x.id, n: x.n, data: b64(x.data) })), last: results.length ? Number(results.at(-1).r) : after, done: results.length < CHUNKS_PAGE });
  }
  return json({ error: 'Unknown part' }, 400);
}

export async function restore(env, body, json) {
  if (body?.confirm !== 'RESTORE') return json({ error: 'Send confirm: "RESTORE" to overwrite data from a backup.' }, 400);
  const db = env.DB;
  const rows = Array.isArray(body.rows) ? body.rows : [];
  if (rows.length > 1000) return json({ error: 'Send at most 1000 rows at a time.' }, 413);
  let stmts = [];
  if (body.part === 'tenants') {
    stmts = rows.map((t) => db.prepare('INSERT OR REPLACE INTO tenants (id, name, key_hash, features, status, secrets, notes, created_at, slug, branding) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)')
      .bind(t.id, t.name, t.key_hash ?? null, t.features ?? '{}', t.status ?? 'active', t.secrets ?? '{}', t.notes ?? null, t.created_at ?? new Date().toISOString(), t.slug ?? null, t.branding ?? null));
  } else if (body.part === 'ownerConfig') {
    stmts = rows.map((r) => db.prepare('INSERT OR REPLACE INTO owner_config (k, v) VALUES (?1, ?2)').bind(r.k, r.v));
  } else if (body.part === 'records') {
    stmts = rows.map((r) => db.prepare('INSERT OR REPLACE INTO records (tenant, k, t, id, rec, deleted, at, seq, origin) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)')
      .bind(r.tenant, r.k, r.t, r.id, r.rec ?? null, r.deleted ? 1 : 0, r.at, r.seq, r.origin ?? null));
  } else if (body.part === 'files') {
    stmts = rows.map((f) => db.prepare('INSERT OR REPLACE INTO files (tenant, id, name, type, size, chunks, by_uid, at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)')
      .bind(f.tenant, f.id, f.name ?? null, f.type ?? null, f.size ?? 0, f.chunks ?? 1, f.by_uid ?? null, f.at ?? Date.now()));
  } else if (body.part === 'chunks') {
    stmts = rows.map((c) => db.prepare('INSERT OR REPLACE INTO file_chunks (tenant, id, n, data) VALUES (?1, ?2, ?3, ?4)').bind(c.tenant, c.id, c.n, unb64(c.data)));
  } else return json({ error: 'Unknown part' }, 400);
  for (let i = 0; i < stmts.length; i += 100) await db.batch(stmts.slice(i, i + 100));
  return json({ ok: true, restored: stmts.length });
}

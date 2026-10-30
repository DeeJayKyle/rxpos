-- RxPOS 1.3: move single-pharmacy data (table "rows") into the multi-pharmacy table "records" as pharmacy "main".
-- The old table is kept untouched as a backup.
CREATE TABLE IF NOT EXISTS records (tenant TEXT NOT NULL, k TEXT NOT NULL, t TEXT NOT NULL, id TEXT NOT NULL, rec TEXT,
  deleted INTEGER NOT NULL DEFAULT 0, at TEXT NOT NULL, seq INTEGER NOT NULL, origin TEXT, PRIMARY KEY (tenant, k));
CREATE INDEX IF NOT EXISTS records_seq ON records(tenant, seq);
CREATE INDEX IF NOT EXISTS records_t ON records(tenant, t);
-- Cross-tenant user lookup at main-page sign-in (no pharmacy chosen): a partial index over just the user rows, so it
-- never full-scans the whole table. See ensureSchema in worker/index.js.
CREATE INDEX IF NOT EXISTS records_users ON records(tenant) WHERE t = 'users';
INSERT OR IGNORE INTO records (tenant, k, t, id, rec, deleted, at, seq, origin)
  SELECT 'main', k, t, id, rec, deleted, at, seq, origin FROM rows;

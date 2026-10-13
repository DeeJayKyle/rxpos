-- RxPOS 1.3: move single-pharmacy data (table "rows") into the multi-pharmacy table "records" as pharmacy "main".
-- The old table is kept untouched as a backup.
CREATE TABLE IF NOT EXISTS records (tenant TEXT NOT NULL, k TEXT NOT NULL, t TEXT NOT NULL, id TEXT NOT NULL, rec TEXT,
  deleted INTEGER NOT NULL DEFAULT 0, at TEXT NOT NULL, seq INTEGER NOT NULL, origin TEXT, PRIMARY KEY (tenant, k));
CREATE INDEX IF NOT EXISTS records_seq ON records(tenant, seq);
CREATE INDEX IF NOT EXISTS records_t ON records(tenant, t);
INSERT OR IGNORE INTO records (tenant, k, t, id, rec, deleted, at, seq, origin)
  SELECT 'main', k, t, id, rec, deleted, at, seq, origin FROM rows;

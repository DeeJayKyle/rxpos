-- RxPOS 1.6, sync protocol 2: op ids already applied per pharmacy, so a request repeated after a lost reply is applied
-- once. (worker/index.js ensureSchema also creates it at runtime; this file documents it for `wrangler d1 migrations`.)
CREATE TABLE IF NOT EXISTS sync_ops (tenant TEXT NOT NULL, op TEXT NOT NULL, at TEXT NOT NULL, PRIMARY KEY (tenant, op));

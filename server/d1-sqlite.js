// Makes Node's built-in SQLite (node:sqlite, Node 22.13+) look like Cloudflare D1, so the RxPOS cloud code
// (worker/index.js) runs unchanged on a self-hosted hub (server/hub.mjs). Only the parts of the D1 API the cloud uses:
// prepare(sql).bind(...).first(col?) / all() / run(), and batch(statements) as ONE transaction (D1 batches are atomic:
// a sale and its stock movements land together or not at all). Same idea as worker/libsql-d1.js for Turso.
import { DatabaseSync } from 'node:sqlite';

// node:sqlite takes numbers, strings, null, bigints and bytes; D1 also takes booleans (as 1/0) and undefined (null)
const arg = (v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v instanceof ArrayBuffer ? new Uint8Array(v) : v);
const isRead = (sql) => /^\s*(select|with|pragma)\b/i.test(sql);

class Statement {
  constructor(db, sql, args = []) { this.db = db; this.sql = sql; this.args = args; }
  bind(...args) { return new Statement(this.db, this.sql, args.map(arg)); }
  #prepared() { return this.db.prepare(this.sql); }
  async all() { return { results: this.#prepared().all(...this.args), meta: { changes: 0 } }; }
  async first(col) {
    const row = this.#prepared().get(...this.args);
    if (!row) return null;
    return col ? row[col] ?? null : row;
  }
  async run() { const r = this.#prepared().run(...this.args); return { meta: { changes: Number(r.changes) } }; }
  /** for batch(): a read gives its rows, a write how many rows it changed */
  exec() {
    if (isRead(this.sql)) return { results: this.#prepared().all(...this.args), meta: { changes: 0 } };
    const r = this.#prepared().run(...this.args);
    return { results: [], meta: { changes: Number(r.changes) } };
  }
}

/** Open (or create) the SQLite file at `file` and wrap it as D1 */
export function d1FromSqlite(file) {
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 5000;');
  return {
    raw: db,
    prepare: (sql) => new Statement(db, sql),
    async batch(stmts) {
      if (!stmts.length) return [];
      db.exec('BEGIN IMMEDIATE');
      try {
        const out = stmts.map((s) => s.exec());
        db.exec('COMMIT');
        return out;
      } catch (e) {
        try { db.exec('ROLLBACK'); } catch { /* already rolled back */ }
        throw e;
      }
    },
    async exec(sql) { db.exec(sql); },
    close: () => db.close(),
  };
}

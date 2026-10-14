// Makes a libSQL / Turso client look like Cloudflare D1, so the RxPOS cloud runs unchanged on either database.
// Only the parts of the D1 API that worker/index.js uses: prepare().bind().first()/all()/run() and batch().
// libSQL is open source (MIT) and can be self-hosted (sqld) or used on Turso's free plan.

const toObjects = (rs) => rs.rows.map((row) => Object.fromEntries(rs.columns.map((c, i) => [c, row[i]])));

class Statement {
  constructor(client, sql, args = []) { this.client = client; this.sql = sql; this.args = args; }
  bind(...args) { return new Statement(this.client, this.sql, args.map((a) => (a === undefined ? null : a))); }
  get stmt() { return { sql: this.sql, args: this.args }; }
  async all() { return { results: toObjects(await this.client.execute(this.stmt)) }; }
  async first(col) {
    const row = toObjects(await this.client.execute(this.stmt))[0];
    if (!row) return null;
    return col ? row[col] ?? null : row;
  }
  async run() { const rs = await this.client.execute(this.stmt); return { meta: { changes: rs.rowsAffected } }; }
}

export function d1FromLibsql(client) {
  return {
    prepare: (sql) => new Statement(client, sql),
    // D1 runs a batch as one transaction; so does libSQL's batch in "write" mode
    async batch(stmts) {
      if (!stmts.length) return [];
      const out = await client.batch(stmts.map((s) => s.stmt), 'write');
      return out.map((rs) => ({ results: toObjects(rs), meta: { changes: rs.rowsAffected } }));
    },
  };
}

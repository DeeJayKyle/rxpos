// Mobile Money payments the cloud keeps track of (2026-11-26), so a payment is never lost when the till closes.
//
// Before: the till asked MTN / Airtel to charge the phone, then polled for 3 minutes. If the till closed, lost the
// internet or ran out of time after the customer approved, the money arrived and no sale was recorded anywhere.
//
// Now every request is written to `pay_requests` BEFORE the network is asked, and its status is settled three ways:
//   1. the till's own polling (/api/pay/status), as before;
//   2. the network's callback (/api/pay/callback/mtn|airtel). A callback is never trusted on its own word: it only
//      makes the cloud ask the network itself (server to server) for the request's status;
//   3. the 5-minute reconciliation (cron), which asks the network about every request still pending.
// A payment that succeeded and is not yet linked to a sale shows on every till of the pharmacy ("received, not
// recorded"). A person then records the sale from the saved basket, or marks it handled with a note: nothing writes
// a sale without a person (the owner's law). One payment can be linked to only one sale.
//
// Rows are the cloud's own working records (like sign-in throttles), not a pharmacy's synced data.

export const PAY_DDL = [
  `CREATE TABLE pay_requests (tenant TEXT NOT NULL, provider TEXT NOT NULL, ref TEXT NOT NULL, phone TEXT, amount INTEGER NOT NULL,
    currency TEXT, reference TEXT, status TEXT NOT NULL, reason TEXT, txid TEXT, basket TEXT, device TEXT, cashier TEXT,
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, checked_at INTEGER NOT NULL DEFAULT 0, checks INTEGER NOT NULL DEFAULT 0,
    sale_id TEXT, sale_number TEXT, note TEXT, settled_by TEXT, settled_at INTEGER, PRIMARY KEY (tenant, provider, ref))`,
  'CREATE INDEX pay_requests_open ON pay_requests(status, checked_at)',
  'CREATE INDEX pay_requests_ref ON pay_requests(provider, ref)',
];

export const PAY_STATUSES = ['PENDING', 'SUCCESSFUL', 'FAILED', 'EXPIRED'];
const MAX_BASKET = 60_000; // characters of the saved basket (a long sale is about 10 KB)
export const RECHECK_MS = 60_000; // the reconciliation leaves a request alone for a minute (the till is polling it)
const CALLBACK_RECHECK_MS = 5_000; // a burst of callbacks asks the network at most once per 5 seconds per request
export const EXPIRE_MS = 48 * 3600_000; // still pending after 2 days: the request has lapsed at the network
export const GRACE_MS = 5 * 60_000; // a till still polling has this long to record its own sale before others see it
const OPEN_DAYS = 30; // how far back "received, not recorded" looks
const RECONCILE_BATCH = 40;

const now = () => Date.now();
const clip = (v, n) => (v == null ? null : String(v).slice(0, n));

/** A new request, written before the network is asked (status PENDING) */
export async function recordRequest(db, row) {
  let basket = null;
  if (row.basket && typeof row.basket === 'object') {
    const s = JSON.stringify(row.basket);
    basket = s.length <= MAX_BASKET ? s : null; // too big to keep: the payment is still tracked, only without its basket
  }
  const t = now();
  await db.prepare(`INSERT INTO pay_requests (tenant, provider, ref, phone, amount, currency, reference, status, basket, device, cashier, created_at, updated_at, checked_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'PENDING', ?8, ?9, ?10, ?11, ?11, ?11)`)
    .bind(row.tenant, row.provider, row.ref, clip(row.phone, 20), Math.round(row.amount), clip(row.currency, 8), clip(row.reference, 64), basket, clip(row.device, 80), clip(row.cashier, 80), t).run();
}

export const getRow = (db, tenant, provider, ref) =>
  db.prepare('SELECT * FROM pay_requests WHERE tenant = ?1 AND provider = ?2 AND ref = ?3').bind(tenant, provider, String(ref)).first();

/**
 * What the network said about a request. A request moves out of PENDING once and never back, and a success is never
 * turned into a failure (a late or forged "failed" can't hide money that arrived).
 */
export async function applyStatus(db, row, s) {
  const t = now();
  const status = PAY_STATUSES.includes(s?.status) ? s.status : 'PENDING';
  if (status === 'PENDING' || row.status !== 'PENDING') {
    await db.prepare('UPDATE pay_requests SET checked_at = ?4, checks = checks + 1 WHERE tenant = ?1 AND provider = ?2 AND ref = ?3').bind(row.tenant, row.provider, row.ref, t).run();
    return { ...row, checked_at: t };
  }
  await db.prepare(`UPDATE pay_requests SET status = ?4, reason = ?5, txid = COALESCE(NULLIF(?6, ''), txid), updated_at = ?7, checked_at = ?7, checks = checks + 1
    WHERE tenant = ?1 AND provider = ?2 AND ref = ?3 AND status = 'PENDING'`).bind(row.tenant, row.provider, row.ref, status, clip(s.reason, 200) || '', clip(s.txid, 80) || '', t).run();
  return getRow(db, row.tenant, row.provider, row.ref);
}

/** Ask the network about one request and keep the answer. Errors leave it pending (the next check tries again). */
export async function checkRow(db, row, { PROVIDERS, penvFor }) {
  const p = PROVIDERS[row.provider];
  const penv = await penvFor(row.tenant);
  if (!p || !penv || !p.enabled(penv)) return row;
  let s;
  try { s = await p.status(penv, row.ref); } catch (e) { s = { status: 'PENDING', error: e.message }; }
  return applyStatus(db, row, s);
}

/** The shape a till sees (never another pharmacy's, never the network's keys) */
export const view = (r) => r && ({
  provider: r.provider, ref: r.ref, phone: r.phone, amount: r.amount, currency: r.currency, status: r.status, reason: r.reason || '',
  txid: r.txid || '', cashier: r.cashier || '', device: r.device || '', createdAt: new Date(r.created_at).toISOString(),
  saleId: r.sale_id || null, saleNumber: r.sale_number || null, note: r.note || null, settledBy: r.settled_by || null,
  basket: (() => { try { return r.basket ? JSON.parse(r.basket) : null; } catch { return null; } })(),
});

/**
 * Payments received and not yet linked to a sale, for the tills of one pharmacy (oldest first). A request still in
 * its till's polling window (GRACE_MS) is left out, so a till that is about to record it isn't raced by another.
 * Also asks the network about a few of this pharmacy's pending requests, so a till sees a lost payment without
 * waiting for the 5-minute reconciliation.
 */
export async function openPayments(db, tenant, deps) {
  const t = now();
  const stale = (await db.prepare(`SELECT * FROM pay_requests WHERE tenant = ?1 AND status = 'PENDING' AND checked_at < ?2 AND created_at > ?3 ORDER BY checked_at LIMIT 3`)
    .bind(tenant, t - RECHECK_MS, t - EXPIRE_MS).all()).results;
  for (const r of stale) await checkRow(db, r, deps);
  const { results } = await db.prepare(`SELECT * FROM pay_requests WHERE tenant = ?1 AND status = 'SUCCESSFUL' AND sale_id IS NULL AND settled_at IS NULL
    AND created_at > ?2 AND created_at < ?3 ORDER BY created_at LIMIT 50`).bind(tenant, t - OPEN_DAYS * 864e5, t - GRACE_MS).all();
  const pending = await db.prepare(`SELECT COUNT(*) AS n FROM pay_requests WHERE tenant = ?1 AND status = 'PENDING' AND created_at > ?2`).bind(tenant, t - EXPIRE_MS).first('n');
  return { payments: results.map(view), pending: Number(pending) || 0 };
}

/**
 * Link a received payment to the sale that records it ({ saleId, saleNumber }), or mark it handled another way
 * ({ note }: refunded, recorded by hand…). One payment, one sale: linking it to a second sale is refused (409),
 * linking it again to the same sale is fine (a till retrying).
 */
export async function settle(db, tenant, { provider, ref, saleId, saleNumber, note, by }, retried = false) {
  const row = await getRow(db, tenant, provider, ref);
  if (!row) return { status: 404, body: { error: 'No such Mobile Money payment in this pharmacy.' } };
  saleId = clip(saleId, 80); note = clip(note && String(note).trim(), 300);
  if (!saleId && !(note && note.length >= 3)) return { status: 400, body: { error: 'Give the sale, or a note saying how the payment was handled.' } };
  if (saleId && row.sale_id === saleId) {
    if (saleNumber && !row.sale_number) await db.prepare('UPDATE pay_requests SET sale_number = ?4 WHERE tenant = ?1 AND provider = ?2 AND ref = ?3').bind(tenant, provider, ref, clip(saleNumber, 40)).run();
    return { status: 200, body: { ok: true, payment: view({ ...row, sale_number: row.sale_number || saleNumber }) } };
  }
  if (row.sale_id || row.settled_at) {
    const what = row.sale_id ? `sale ${row.sale_number || row.sale_id}` : `"${row.note}"`;
    return { status: 409, body: { error: `This payment is already recorded (${what}). It can't be used for another sale.`, payment: view(row) } };
  }
  // a sale may claim a payment the till is still waiting on (it is recorded the moment the network says paid);
  // a note only for a payment that arrived
  if (!saleId && row.status !== 'SUCCESSFUL') return { status: 400, body: { error: 'Only a received payment can be marked as handled.' } };
  if (saleId && row.status === 'FAILED') return { status: 409, body: { error: 'This payment failed at the network: no money was received.' } };
  const t = now();
  const res = await db.prepare(`UPDATE pay_requests SET sale_id = ?4, sale_number = ?5, note = ?6, settled_by = ?7, settled_at = ?8
    WHERE tenant = ?1 AND provider = ?2 AND ref = ?3 AND sale_id IS NULL AND settled_at IS NULL`)
    .bind(tenant, provider, ref, saleId || null, clip(saleNumber, 40), note, clip(by, 80), t).run();
  if (!(res.meta?.changes > 0) && !retried) return settle(db, tenant, { provider, ref, saleId, saleNumber, note, by }, true); // someone else just did: answer as for them
  return { status: 200, body: { ok: true, payment: view(await getRow(db, tenant, provider, ref)) } };
}

/** The address the network calls when a request is settled (MTN takes it per request: X-Callback-Url) */
export async function callbackUrl(base, tenant, ref, sign) {
  const sig = await sign(`paycb:mtn:${tenant}:${ref}`);
  return `${String(base).replace(/\/+$/, '')}/api/pay/callback/mtn?t=${encodeURIComponent(tenant)}&ref=${encodeURIComponent(ref)}&s=${sig}`;
}

/**
 * A network's callback. MTN: our signed address names the pharmacy and request. Airtel: one address for all (set in
 * the Airtel portal), the body names the transaction id we gave. Either way the body's own status is not believed:
 * the cloud asks the network. Unknown or already settled requests are answered 200 and ignored (no retries).
 */
export async function handleCallback(db, provider, url, body, deps) {
  let rows = [];
  if (provider === 'mtn') {
    const tenant = url.searchParams.get('t') || '', ref = url.searchParams.get('ref') || '', s = url.searchParams.get('s') || '';
    if (!tenant || !ref || !(await deps.verify(`paycb:mtn:${tenant}:${ref}`, s))) return { status: 403, body: { error: 'Not a callback from this cloud' } };
    const r = await getRow(db, tenant, 'mtn', ref);
    if (r) rows = [r];
  } else if (provider === 'airtel') {
    const id = body?.transaction?.id;
    if (!id || typeof id !== 'string' || id.length > 64) return { status: 400, body: { error: 'Missing transaction id' } };
    rows = (await db.prepare("SELECT * FROM pay_requests WHERE provider = 'airtel' AND ref = ?1").bind(id).all()).results;
  } else return { status: 404, body: { error: 'Not found' } };
  let checked = 0;
  for (const r of rows) {
    if (r.status !== 'PENDING' || r.checked_at > now() - CALLBACK_RECHECK_MS) continue;
    await checkRow(db, r, deps);
    checked++;
  }
  return { status: 200, body: { ok: true, checked } };
}

/**
 * Every 5 minutes: ask the networks about requests still pending (oldest check first), and close the ones that have
 * lapsed. → { checked, settled, expired }
 */
export async function reconcile(db, deps) {
  const t = now();
  const { results } = await db.prepare(`SELECT * FROM pay_requests WHERE status = 'PENDING' AND checked_at < ?1 ORDER BY checked_at LIMIT ${RECONCILE_BATCH}`).bind(t - RECHECK_MS).all();
  let settled = 0, expired = 0;
  for (const r of results) {
    const after = await checkRow(db, r, deps);
    if (after.status !== 'PENDING') settled++;
    else if (r.created_at < t - EXPIRE_MS) {
      await db.prepare("UPDATE pay_requests SET status = 'EXPIRED', reason = 'No answer from the network in 2 days', updated_at = ?4 WHERE tenant = ?1 AND provider = ?2 AND ref = ?3 AND status = 'PENDING'")
        .bind(r.tenant, r.provider, r.ref, t).run();
      expired++;
    }
  }
  return { checked: results.length, settled, expired };
}

// System watchdog (worker/watchdog.js): emails the owner on new device crash reports and on a stalled nightly backup.
//   node unit-watchdog.mjs
import { watchdog } from '../worker/watchdog.js';
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + String(x) : ''}`); };

// A tiny in-memory stand-in for env.DB (owner_config map + a client_errors list) and a mailer that records sends.
function make({ email, errors = [], cfg = {} }) {
  const config = { ...cfg };
  if (email) config.email = email;
  const db = { prepare(sql) {
    return { a: [], bind(...x) { this.a = x; return this; },
      async first() {
        if (sql.includes("k = 'email'")) return config.email ? { v: config.email } : undefined;
        if (sql.includes('owner_config WHERE k = ?1')) return config[this.a[0]] !== undefined ? { v: config[this.a[0]] } : undefined;
        return undefined;
      },
      async all() {
        if (sql.includes('FROM client_errors')) { const since = this.a[0]; return { results: errors.filter((e) => e.last_at > since).sort((x, y) => (x.last_at < y.last_at ? 1 : -1)) }; }
        return { results: [] };
      },
      async run() { if (sql.includes('INSERT INTO owner_config')) config[this.a[0]] = this.a[1]; return {}; } };
  } };
  const sent = [];
  const mailer = async (_e, to, subject) => { sent.push({ to, subject }); return true; };
  return { env: { DB: db, BREVO_API_KEY: 'x', BREVO_SENDER_EMAIL: 'm@x' }, sent, mailer, config };
}
const ago = (h) => new Date(Date.now() - h * 3600e3).toISOString();

// 1) no recipient configured → nothing is sent
let m = make({ errors: [{ message: 'Boom', platform: 'Android', count: 1, last_at: new Date().toISOString() }] });
let r = await watchdog(m.env, { mailer: m.mailer });
check('no alert email set → skipped, no mail', r.skipped && m.sent.length === 0, JSON.stringify(r));

// 2) new device crash → one digest email
m = make({ email: 'me@rx.test', errors: [{ message: 'TypeError x', platform: 'Android app', count: 4, last_at: new Date().toISOString() }] });
r = await watchdog(m.env, { mailer: m.mailer });
check('new crash reports send one email', m.sent.length === 1 && /device error/.test(m.sent[0].subject), m.sent[0]?.subject);
check('email goes to the configured address', m.sent[0]?.to === 'me@rx.test');

// 3) calling again right away sends nothing (watermark advanced; no NEW errors)
r = await watchdog(m.env, { mailer: m.mailer });
check('no repeat email when there is nothing new', m.sent.length === 1, JSON.stringify(r));

// 4) a stalled nightly backup (last success 30h ago) → one email
m = make({ email: 'me@rx.test', cfg: { backup: JSON.stringify({ at: ago(30) }) } });
r = await watchdog(m.env, { mailer: m.mailer });
check('a stale backup sends a warning email', m.sent.length === 1 && /backup has not run/.test(m.sent[0].subject), m.sent[0]?.subject);
r = await watchdog(m.env, { mailer: m.mailer });
check('the stale-backup reminder is rate-limited (no immediate repeat)', m.sent.length === 1);

// 5) a fresh backup (ran an hour ago) → no backup email
m = make({ email: 'me@rx.test', cfg: { backup: JSON.stringify({ at: ago(1) }) } });
r = await watchdog(m.env, { mailer: m.mailer });
check('a fresh backup raises no alert', m.sent.length === 0, JSON.stringify(r));

// 6) no heartbeat ever recorded → no false backup alarm
m = make({ email: 'me@rx.test' });
r = await watchdog(m.env, { mailer: m.mailer });
check('no backup heartbeat yet → no false alarm', m.sent.length === 0);

// 7) audit 2026-11-17 (2nd pass): reports that arrive while a digest isn't due yet go in the next digest
const t0 = Date.parse('2026-11-17T10:00:00Z'), at = (min) => new Date(t0 + min * 60000);
m = make({ email: 'me@rx.test', errors: [{ message: 'First', platform: 'Android', count: 1, last_at: at(0).toISOString() }] });
await watchdog(m.env, { mailer: m.mailer, now: at(1) });
m.sent.length = 0;
// a new report at 10:10: no digest yet (the last was at 10:01)…
const errs = [{ message: 'Second', platform: 'Windows', count: 1, last_at: at(10).toISOString() }];
const m2 = make({ email: 'me@rx.test', errors: errs, cfg: { ...m.config } });
await watchdog(m2.env, { mailer: m2.mailer, now: at(11) });
check('a report inside the 30 minutes waits (no email yet)', m2.sent.length === 0);
await watchdog(m2.env, { mailer: m2.mailer, now: at(32) });
check('…and is in the next digest, not lost', m2.sent.length === 1 && /1 new device error/.test(m2.sent[0].subject), JSON.stringify(m2.sent));

// 8) a digest that could not be sent is tried again
const m3 = make({ email: 'me@rx.test', errors: [{ message: 'Boom', platform: 'Android', count: 1, last_at: at(0).toISOString() }] });
let tries = 0; const flaky = async (...a) => (++tries === 1 ? false : m3.mailer(...a));
await watchdog(m3.env, { mailer: flaky, now: at(1) });
await watchdog(m3.env, { mailer: flaky, now: at(6) });
check('a digest that failed to send goes out on the next pass', m3.sent.length === 1 && tries === 2);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

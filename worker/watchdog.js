// System watchdog: emails the RxPOS owner when something goes wrong beyond plain uptime (worker/uptime.js already
// covers the database, the websites and cloud sync). This adds the two other ways the whole system "goes wrong":
//   1. Device crash reports arriving (src/crash.js → client_errors) — a short digest, at most once every 30 minutes.
//   2. The nightly cloud backup stopping — if no success heartbeat for over 26 hours.
// Runs on the same 5-minute cron as uptime (worker/index.js → scheduled). Recipient is ALERT_EMAIL, or the owner's
// email in owner_config. State lives in owner_config so reminders don't repeat too often.
const BACKUP_STALE_H = 26;     // a backup is expected every night; warn past this age
const BACKUP_REMIND_H = 12;    // while backups are stale, remind at most this often
const ERROR_GAP_MIN = 30;      // at most one crash-digest email this often

async function mail(env, to, subject, text) {
  if (!to || !env.BREVO_API_KEY || !env.BREVO_SENDER_EMAIL) return false;
  const r = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST', headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ sender: { email: env.BREVO_SENDER_EMAIL, name: 'RxPOS monitor' }, to: [{ email: to }], subject, textContent: text }),
  }).catch(() => ({ ok: false }));
  return !!r.ok;
}
async function cfgGet(env, key, dflt) {
  const row = await env.DB.prepare('SELECT v FROM owner_config WHERE k = ?1').bind(key).first();
  if (!row?.v) return dflt;
  try { return JSON.parse(row.v); } catch { return dflt; }
}
const cfgSet = (env, key, obj) => env.DB.prepare("INSERT INTO owner_config (k, v) VALUES (?1, ?2) ON CONFLICT(k) DO UPDATE SET v = ?2").bind(key, JSON.stringify(obj)).run();
async function recipient(env) {
  if (env.ALERT_EMAIL) return env.ALERT_EMAIL;
  const row = await env.DB.prepare("SELECT v FROM owner_config WHERE k = 'email'").first();
  return row?.v || '';
}

/**
 * One watchdog pass. `mailer` and `now` are injectable for tests. Returns what it did.
 * Safe to call every 5 minutes: it only emails on genuinely new problems and rate-limits reminders.
 */
export async function watchdog(env, { now = new Date(), mailer = mail } = {}) {
  const to = await recipient(env);
  if (!to) return { skipped: 'no alert email set' };
  const nowMs = now.getTime();
  const out = { to: to.replace(/^(.{2}).*(@.*)$/, '$1***$2') };

  // 1) new device crash reports since the last watermark
  const er = await cfgGet(env, 'alert_errors', { since: new Date(nowMs - 3600e3).toISOString(), lastMail: null });
  const { results = [] } = await env.DB.prepare(
    'SELECT message, platform, kind, count, last_at FROM client_errors WHERE last_at > ?1 ORDER BY last_at DESC LIMIT 50'
  ).bind(er.since).all();
  if (results.length && (!er.lastMail || nowMs - Date.parse(er.lastMail) >= ERROR_GAP_MIN * 60000)) {
    const lines = results.slice(0, 10).map((r) => `- [${r.platform || '?'}] ${String(r.message || '').slice(0, 140)} (seen ${r.count}×)`);
    out.errorsMailed = await mailer(env, to, `RxPOS: ${results.length} new device error${results.length > 1 ? 's' : ''} reported`,
      `New error reports from devices since ${er.since}:\n\n${lines.join('\n')}${results.length > 10 ? `\n…and ${results.length - 10} more.` : ''}\n\nOpen the owner console → Errors to see details. Patient and sales data are scrubbed from these reports.`);
    await cfgSet(env, 'alert_errors', { since: now.toISOString(), lastMail: now.toISOString() });
  } else {
    // no email due: still advance the watermark so old rows aren't rescanned forever (keep the last-mail time)
    await cfgSet(env, 'alert_errors', { since: now.toISOString(), lastMail: er.lastMail });
  }

  // 2) nightly backup stopped (only once a success heartbeat has ever been recorded — see tools/backup.mjs)
  const bh = await cfgGet(env, 'backup', null);
  if (bh?.at) {
    const ageH = (nowMs - Date.parse(bh.at)) / 3600e3;
    const bs = await cfgGet(env, 'alert_backup', { lastMail: null });
    if (ageH > BACKUP_STALE_H && (!bs.lastMail || nowMs - Date.parse(bs.lastMail) >= BACKUP_REMIND_H * 3600e3)) {
      out.backupMailed = await mailer(env, to, 'RxPOS: nightly backup has not run',
        `The last successful cloud backup was ${bh.at} — about ${Math.round(ageH)} hours ago. A backup is expected every night.\n\nCheck the "Nightly cloud backup" GitHub Action (Actions tab). Your data is still in the cloud; this only means the off-site copy is not being refreshed.`);
      await cfgSet(env, 'alert_backup', { lastMail: now.toISOString() });
    } else if (ageH <= BACKUP_STALE_H && bs.lastMail) {
      await cfgSet(env, 'alert_backup', { lastMail: null }); // backup healthy again: reset the reminder
    }
  }
  return out;
}

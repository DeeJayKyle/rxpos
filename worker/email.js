// One place all RxPOS owner notifications go out through: Brevo (the same account and secrets used for password-reset
// emails and daily summaries — BREVO_API_KEY, BREVO_SENDER_EMAIL, optional BREVO_SENDER_NAME). The uptime monitor
// (uptime.js) and the system watchdog (watchdog.js) both send through here, so there is a single email path to
// configure and reason about. Transactional emails in index.js/summary.js use the same Brevo account directly.

/** Send one alert email. Never throws (a failed send must not break a cron run); returns true only if Brevo accepted it. */
export async function sendAlert(env, to, subject, text) {
  if (!to || !env.BREVO_API_KEY || !env.BREVO_SENDER_EMAIL) return false;
  const r = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST', headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ sender: { email: env.BREVO_SENDER_EMAIL, name: env.BREVO_SENDER_NAME || 'RxPOS monitor' }, to: [{ email: to }], subject, textContent: text }),
  }).catch(() => ({ ok: false }));
  return !!r.ok;
}

/** Where owner alerts go: the ALERT_EMAIL secret if set, otherwise the address saved in the owner console (owner_config "email"). */
export async function alertRecipient(env) {
  if (env.ALERT_EMAIL) return env.ALERT_EMAIL;
  const row = await env.DB.prepare("SELECT v FROM owner_config WHERE k = 'email'").first().catch(() => null);
  return row?.v || '';
}

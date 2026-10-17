// Uptime watch: every 5 minutes (cron in wrangler.jsonc) check the database and the website, and email the owner
// when something breaks and again when it works again. State lives in owner_config key "uptime".
// Limitation: it runs on Cloudflare, so a full Cloudflare outage can't be reported from here (an outside monitor covers that).
const SITES = ['https://rxposug.com/', 'https://www.rxposug.com/'];
const REMIND_MIN = 60; // while still broken, remind once an hour

const withTimeout = (p, ms, what) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`${what}: no answer in ${ms / 1000} s`)), ms))]);

async function mail(env, to, subject, text) {
  if (!to || !env.BREVO_API_KEY || !env.BREVO_SENDER_EMAIL) return false;
  const r = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST', headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ sender: { email: env.BREVO_SENDER_EMAIL, name: 'RxPOS monitor' }, to: [{ email: to }], subject, textContent: text }),
  });
  return r.ok;
}

/** Runs the checks; returns { problems, dbOk, mailed }. `test: true` always sends one email (owner console test). */
export async function uptimeCheck(env, { now = new Date(), test = false } = {}) {
  const problems = [];
  let dbOk = true;
  try { await withTimeout(env.DB.prepare('SELECT 1 AS ok').first(), 15000, 'Database (Turso)'); }
  catch (e) { dbOk = false; problems.push('Database (Turso): ' + e.message); }
  for (const u of SITES) {
    try { const r = await fetch(u, { signal: AbortSignal.timeout(15000), cf: { cacheTtl: 0 } }); if (!r.ok) problems.push(`Website ${u}: HTTP ${r.status}`); }
    catch (e) { problems.push(`Website ${u}: ${e.message}`); }
  }

  let state = { down: false, since: null, lastOk: null, lastMail: null };
  let to = env.ALERT_EMAIL || '';
  if (dbOk) {
    const { results } = await env.DB.prepare("SELECT k, v FROM owner_config WHERE k IN ('uptime', 'email')").all();
    for (const r of results) {
      if (r.k === 'uptime') { try { state = { ...state, ...JSON.parse(r.v) }; } catch { /* keep default */ } }
      if (r.k === 'email' && r.v) to = r.v;
    }
  }
  const iso = now.toISOString();
  const local = new Date(now.getTime() + 3 * 3600e3).toISOString().slice(0, 16).replace('T', ' ') + ' (Uganda time)';
  const mins = (t) => (t ? Math.round((now - new Date(t)) / 60e3) : null);
  let mailed = false;

  if (test) {
    mailed = await mail(env, to, 'RxPOS monitor: test email', `This is a test from the RxPOS uptime monitor, ${local}.\n\nCurrent status: ${problems.length ? 'PROBLEMS:\n- ' + problems.join('\n- ') : 'everything is working.'}\n\nYou will get an email like this if the RxPOS database or website stops working, and another when it works again.`);
  } else if (problems.length) {
    // When the database itself is down we can't remember earlier emails, so remind at most once an hour (minutes 0-4)
    const due = dbOk ? !state.down || mins(state.lastMail) >= REMIND_MIN : now.getUTCMinutes() < 5;
    if (due) {
      mailed = await mail(env, to, (state.down ? 'Still down: ' : '') + 'RxPOS problem: ' + problems[0].split(':')[0],
        `The RxPOS uptime monitor found a problem at ${local}:\n\n- ${problems.join('\n- ')}\n\nTills keep selling offline; sales sync again once this is fixed. Status pages: https://www.cloudflarestatus.com and https://status.turso.tech\n\nYou will get another email when it works again.`);
    }
    state = { down: true, since: state.down ? state.since : iso, lastOk: state.lastOk, lastMail: mailed ? iso : state.lastMail, problems };
  } else {
    // Back after an outage we recorded, or after a database outage we couldn't record (no "all fine" for 12+ minutes)
    const wasDown = state.down || (state.lastOk && mins(state.lastOk) > 12);
    if (wasDown) {
      const since = state.down ? state.since : state.lastOk;
      mailed = await mail(env, to, 'RxPOS is working again', `RxPOS is working again (${local}). It had a problem for about ${mins(since)} minutes${state.problems ? ':\n- ' + state.problems.join('\n- ') : '.'}\n\nDevices send any waiting sales automatically.`);
    }
    state = { down: false, since: null, lastOk: iso, lastMail: mailed ? iso : state.lastMail };
  }
  if (dbOk) await env.DB.prepare("INSERT INTO owner_config (k, v) VALUES ('uptime', ?1) ON CONFLICT(k) DO UPDATE SET v = ?1").bind(JSON.stringify(state)).run();
  return { problems, dbOk, mailed, to: to ? to.replace(/^(.{2}).*(@.*)$/, '$1***$2') : null };
}

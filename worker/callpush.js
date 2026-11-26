// Incoming-call push notifications (Firebase Cloud Messaging, HTTP v1) for the Android app.
// A phone whose RxPOS app is closed or asleep has no live line, so a ring sent only over the live line or the database
// never reaches it. When a colleague rings, the cloud also sends a high-priority FCM message to every phone the callee
// is signed in on: Android shows "Incoming call" even with the app closed, and tapping it opens RxPOS, which picks up
// the waiting call set-up messages from /api/rtc. Nothing here touches pharmacy records.
// Set-up (once): Worker secret FCM_SERVICE_ACCOUNT = the Firebase service-account JSON (Firebase console → Project
// settings → Service accounts → Generate new private key), and GitHub secret GOOGLE_SERVICES_JSON for the Android build.

const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const te = new TextEncoder();
const b64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64urlText = (s) => b64url(te.encode(s));

/** The service account from the secret, or null when push isn't set up (or the secret isn't valid JSON) */
export function serviceAccount(env) {
  if (!env?.FCM_SERVICE_ACCOUNT) return null;
  try {
    const sa = JSON.parse(env.FCM_SERVICE_ACCOUNT);
    return sa.project_id && sa.client_email && sa.private_key ? sa : null;
  } catch { return null; }
}

/** PEM "-----BEGIN PRIVATE KEY-----" → the PKCS#8 bytes */
const pemBytes = (pem) => Uint8Array.from(atob(String(pem).replace(/-----[^-]+-----/g, '').replace(/\\n/g, '').replace(/\s+/g, '')), (c) => c.charCodeAt(0));

/** A signed JWT for Google's token endpoint (RS256) */
export async function googleJwt(sa, now = Date.now()) {
  const iat = Math.floor(now / 1000);
  const head = b64urlText(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64urlText(JSON.stringify({ iss: sa.client_email, scope: SCOPE, aud: TOKEN_URL, iat, exp: iat + 3600 }));
  const key = await crypto.subtle.importKey('pkcs8', pemBytes(sa.private_key), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, te.encode(head + '.' + claims));
  return head + '.' + claims + '.' + b64url(sig);
}

let accessCache = null; // { token, until, who }
async function accessToken(sa, fetchFn) {
  if (accessCache && accessCache.who === sa.client_email && accessCache.until > Date.now()) return accessCache.token;
  const r = await fetchFn(TOKEN_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=' + encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer') + '&assertion=' + (await googleJwt(sa)),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error('FCM sign-in ' + r.status + (j.error ? ' ' + j.error : ''));
  accessCache = { token: j.access_token, until: Date.now() + Math.max(60, (j.expires_in || 3600) - 300) * 1000, who: sa.client_email };
  return j.access_token;
}
export const _resetPushCache = () => { accessCache = null; };

/** The FCM message for a ring: shown by Android itself when the app is closed (channel "calls", made by the app) */
export function callMessage(token, { callId, fromName }) {
  const name = String(fromName || 'A colleague').slice(0, 60);
  return {
    message: {
      token,
      data: { kind: 'call', callId: String(callId), fromName: name },
      android: {
        priority: 'HIGH',
        ttl: '45s', // a ring older than this is a missed call, not a call to answer
        collapse_key: 'call',
        notification: { channel_id: 'calls', title: 'Incoming call', body: `${name} is calling you on RxPOS`, tag: 'call', notification_priority: 'PRIORITY_MAX', visibility: 'PUBLIC', default_sound: true, default_vibrate_timings: true },
      },
    },
  };
}

/** Save the phone's push token for this person (one row per token: a phone used by someone else moves to them) */
export async function saveToken(db, who, token, platform = 'android') {
  const t = String(token || '');
  if (t.length < 20 || t.length > 4096) return false;
  await db.prepare('INSERT INTO push_tokens (token, tenant, uid, platform, at) VALUES (?1, ?2, ?3, ?4, ?5) ON CONFLICT(token) DO UPDATE SET tenant = ?2, uid = ?3, platform = ?4, at = ?5')
    .bind(t, who.tenant, String(who.uid), String(platform).slice(0, 20), Date.now()).run();
  return true;
}
export async function dropToken(db, who, token) {
  await db.prepare('DELETE FROM push_tokens WHERE token = ?1 AND tenant = ?2').bind(String(token || ''), who.tenant).run();
}

/**
 * Ring the callee's phones. → number of phones the message was accepted for (0 when push isn't set up or the callee
 * has no phone registered). Tokens Google says are gone are removed.
 */
export async function pushRing(env, db, { tenant, to, callId, fromName }, fetchFn = fetch) {
  const sa = serviceAccount(env);
  if (!sa) return 0;
  const { results } = await db.prepare('SELECT token FROM push_tokens WHERE tenant = ?1 AND uid = ?2 ORDER BY at DESC LIMIT 5').bind(tenant, String(to)).all();
  if (!results?.length) return 0;
  const bearer = await accessToken(sa, fetchFn);
  let sent = 0;
  await Promise.all(results.map(async ({ token }) => {
    const r = await fetchFn(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(sa.project_id)}/messages:send`, {
      method: 'POST', headers: { Authorization: 'Bearer ' + bearer, 'Content-Type': 'application/json' }, body: JSON.stringify(callMessage(token, { callId, fromName })),
    }).catch(() => null);
    if (r?.ok) { sent++; return; }
    const body = r ? await r.text().catch(() => '') : '';
    if (r && (r.status === 404 || /UNREGISTERED|registration-token-not-registered/.test(body))) await db.prepare('DELETE FROM push_tokens WHERE token = ?1').bind(token).run().catch(() => {});
    else console.log('call push failed', r?.status ?? 'network', body.slice(0, 200));
  }));
  return sent;
}

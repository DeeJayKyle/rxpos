// Calls to the RxPOS cloud (Cloudflare Worker) for things that need the internet:
// staff sign-in, Mobile Money payment requests and SMS. Sync itself lives in sync.js.
import { isNative } from './platform.js';

export const DEFAULT_CLOUD = 'https://rxpos.pages.dev';
/** The cloud this app talks to: the site itself on the web, the RxPOS cloud in the desktop and Android apps. */
export const cloudUrl = () => (!isNative && /^https?:$/.test(location.protocol) && !import.meta.env.DEV ? location.origin : DEFAULT_CLOUD);

export const cleanUrl = (u) => {
  let url = String(u || '').trim().replace(/\/+$/, '');
  if (url && !/^https?:\/\//.test(url)) url = (/^(localhost|\d+\.\d+\.\d+\.\d+)(:\d+)?$/.test(url) ? 'http://' : 'https://') + url;
  return url;
};

async function call(cfg, path, { method = 'GET', body, timeout = 20000 } = {}) {
  if (!cfg?.url) throw new Error('This device is not connected to the RxPOS cloud. Set it up in Settings → Online sync.');
  if (!navigator.onLine) throw new Error('No internet connection right now.');
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const res = await fetch(cfg.url + path, {
      method, signal: ctl.signal,
      headers: { 'Content-Type': 'application/json', ...(cfg.key ? { Authorization: 'Bearer ' + cfg.key } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.error || `Cloud replied ${res.status}`);
    return j;
  } catch (e) {
    throw e.name === 'AbortError' ? new Error('The cloud took too long to answer. Check the internet connection.') : e;
  } finally {
    clearTimeout(t);
  }
}

/** Sign in to the cloud with a staff account → { token, user } */
export const cloudLogin = (url, email, password, tenant) => call({ url: cleanUrl(url) }, '/api/login', { method: 'POST', body: { email, password, tenant: tenant || undefined } });
export const forgotPassword = (url, body) => call({ url: cleanUrl(url) }, '/api/password/forgot', { method: 'POST', body });
export const resetPassword = (url, body) => call({ url: cleanUrl(url) }, '/api/password/reset', { method: 'POST', body });
// Owner console (RxPOS vendor): the owner key is sent as the bearer token
export const ownerApi = (url, ownerKey, path, body) => call({ url: cleanUrl(url), key: ownerKey }, '/api/owner' + path, { method: body ? 'POST' : 'GET', body, timeout: 60000 });
/** Public name of the pharmacy at a web address (for its sign-in page) */
export const pharmacyInfo = (url, slug) => call({ url: cleanUrl(url) }, '/api/pharmacy/' + encodeURIComponent(slug), { timeout: 8000 });
export const calendarLink = (cfg) => call(cfg, '/api/calendar-link', { timeout: 8000 });
export const cloudConfig = (cfg) => call(cfg, '/api/config', { timeout: 8000 });
export const payRequest = (cfg, body) => call(cfg, '/api/pay/request', { method: 'POST', body, timeout: 30000 });
export const payStatus = (cfg, provider, ref) => call(cfg, `/api/pay/status?provider=${provider}&ref=${encodeURIComponent(ref)}`);
export const sendSms = (cfg, to, message) => call(cfg, '/api/sms', { method: 'POST', body: { to, message } });

/** Guess the mobile network from a Ugandan number: MTN 076/077/078/079/039, Airtel 070/074/075/020 */
export function guessNetwork(msisdn) {
  const local = String(msisdn).replace(/^256/, '').replace(/^0/, '');
  if (/^(7[045]|20)/.test(local)) return 'airtel';
  return 'mtn';
}

/** WhatsApp click-to-chat link (works on phone and desktop, no API needed) */
export const whatsappLink = (phone, text) => `https://wa.me/${String(phone).replace(/\D/g, '')}?text=${encodeURIComponent(text)}`;

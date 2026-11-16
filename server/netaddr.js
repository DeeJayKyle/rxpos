// Which addresses are on a local network (2026-11 audit, hub over plain HTTP). It lives in server/ because the
// Windows app ships server/** for its hub; the apps import it from here too. Used by the hub (server/hub.mjs) to
// refuse plain-HTTP requests that come from the internet, and by the apps (src/cloud.js, src/sync.js) to refuse to send
// a password or a sign-in pass over plain HTTP to an address on the internet. A shop's own network (192.168.x.x,
// 10.x.x.x, 172.16–31.x.x), this computer, link-local and VPN ranges such as Tailscale (100.64/10) count as local.

const v4 = (s) => {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s);
  return m && m.slice(1).every((x) => Number(x) <= 255) ? m.slice(1).map(Number) : null;
};

/** Is this IP address or host name local (not reachable from the internet)? */
export function isLocalAddress(host) {
  let h = String(host || '').trim().toLowerCase().replace(/^\[|\]$/g, '');
  if (!h) return false;
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.lan') || h.endsWith('.home.arpa')) return true;
  if (h.startsWith('::ffff:')) h = h.slice(7); // an IPv4 address as Node reports it on a dual-stack socket
  const a = v4(h);
  if (a) {
    const [p, q] = a;
    return p === 127 || p === 10 || (p === 172 && q >= 16 && q <= 31) || (p === 192 && q === 168) || (p === 169 && q === 254) || (p === 100 && q >= 64 && q <= 127);
  }
  if (h.includes(':')) return h === '::1' || /^f[cd][0-9a-f]{2}:/.test(h) || /^fe[89ab][0-9a-f]:/.test(h);
  return !h.includes('.'); // a bare computer name on the shop's network (e.g. "frontdesk")
}

/** Would this address send secrets over plain HTTP to the internet? (https, or plain http on a local network, is fine) */
export function plainHttpToInternet(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' && !isLocalAddress(u.hostname);
  } catch { return false; }
}

export const INSECURE_LINK = 'This address uses plain http on the internet, so your password and sign-in would travel unprotected. Use the https:// address (put the hub behind HTTPS), or connect over the pharmacy\'s own network.';

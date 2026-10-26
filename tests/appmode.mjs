// Run a test page as the RxPOS Windows app instead of the web version. The web version is online only and keeps
// nothing on the computer; only the Windows and Android apps work offline, so tests of offline sign-in, the quick PIN
// and "Remember me" drive the app. The page gets the Electron user agent (src/platform.js → isElectron), and the
// app's requests to its cloud (rxposug.com, api.rxposug.com) are answered by the local test cloud instead, so no test ever
// reaches the live service. Nothing in the app itself has a test switch.
const CLOUD = /^https:\/\/(?:www\.|api\.)?rxposug\.com/; // the app's cloud addresses (sign-in on the site, sync on api.)
// Launch flag for a browser that plays the app: the app's cloud is another origin than the page, and Chrome sends CORS
// preflights straight to the network (request interception never sees them), so origin checks are off in that test
// browser only. It only ever talks to the local test cloud.
export const APP_ARGS = ['--disable-web-security', '--disable-features=IsolateOrigins,site-per-process,BlockInsecurePrivateNetworkRequests'];

/**
 * Returns a switch for the cloud as this page sees it: 'up' (normal), 'down' (unreachable: requests fail like no
 * internet) or 'lose-reply' (the cloud receives and applies each sync request, then the reply is lost on the way back).
 */
export async function asDesktopApp(page, base) {
  const cloud = { mode: 'up', syncCalls: 0, set(m) { this.mode = m; } };
  const ua = await page.browser().userAgent();
  await page.setUserAgent(ua.replace('HeadlessChrome', 'Chrome') + ' RxPOS Electron/43.0.0');
  await page.setBypassCSP(true); // the real app loads from disk with its own policy, not the web page's
  await page.setRequestInterception(true);
  if (process.env.APPMODE_DEBUG) {
    page.on('requestfailed', (r) => /rxposug/.test(r.url()) && console.log('appmode failed:', r.method(), r.url(), r.failure()?.errorText));
    page.on('console', (m) => /sync|fetch|CORS|blocked|Content Security/i.test(m.text()) && console.log('appmode console:', m.text().slice(0, 200)));
  }
  page.on('request', async (req) => {
    const url = req.url();
    const m = url.match(CLOUD);
    if (m && cloud.mode === 'down') return req.abort('internetdisconnected');
    if (process.env.APPMODE_DEBUG && /rxposug/.test(url)) console.log('appmode req:', req.method(), url, !!m);
    if (!m) return req.continue();
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
    if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: cors });
    try {
      // only what the cloud needs (Node's fetch refuses browser-only headers such as connection)
      const h = req.headers(), headers = {};
      for (const k of ['content-type', 'authorization', 'accept']) if (h[k]) headers[k] = h[k];
      const r = await fetch(base + url.slice(m[0].length), { method: req.method(), headers, body: ['GET', 'HEAD'].includes(req.method()) ? undefined : req.postData() });
      const body = Buffer.from(await r.arrayBuffer());
      if (/\/api\/sync/.test(url)) cloud.syncCalls++;
      if (cloud.mode === 'lose-reply' && /\/api\/sync/.test(url)) return req.abort('connectionreset'); // applied, but the reply never arrives
      req.respond({ status: r.status, headers: { ...cors, 'Content-Type': r.headers.get('content-type') || 'application/json' }, body });
    } catch (e) {
      if (process.env.APPMODE_DEBUG) console.log('appmode:', req.method(), url, e.message);
      req.abort('connectionrefused'); // like no internet (setOfflineMode also blocks it)
    }
  });
  return cloud;
}

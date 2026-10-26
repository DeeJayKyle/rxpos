// Run a test page as the RxPOS Windows app instead of the web version. The web version is online only and keeps
// nothing on the computer; only the Windows and Android apps work offline, so tests of offline sign-in, the quick PIN
// and "Remember me" drive the app. The page gets the Electron user agent (src/platform.js → isElectron), and the
// app's requests to its cloud (https://rxposug.com) are answered by the local test cloud instead, so no test ever
// reaches the live service. Nothing in the app itself has a test switch.
const CLOUD = 'https://rxposug.com';

export async function asDesktopApp(page, base) {
  const ua = await page.browser().userAgent();
  await page.setUserAgent(ua.replace('HeadlessChrome', 'Chrome') + ' RxPOS Electron/43.0.0');
  await page.setRequestInterception(true);
  page.on('request', async (req) => {
    const url = req.url();
    if (!url.startsWith(CLOUD)) return req.continue();
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
    if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: cors });
    try {
      const headers = { ...req.headers() };
      delete headers.host; delete headers.origin; delete headers.referer;
      const r = await fetch(base + url.slice(CLOUD.length), { method: req.method(), headers, body: ['GET', 'HEAD'].includes(req.method()) ? undefined : req.postData() });
      const body = Buffer.from(await r.arrayBuffer());
      req.respond({ status: r.status, headers: { ...cors, 'Content-Type': r.headers.get('content-type') || 'application/json' }, body });
    } catch {
      req.abort('connectionrefused'); // like no internet (setOfflineMode also blocks it)
    }
  });
}

// Checks a deployed website (rxposug.com, or the preview web-preview.rxpos.pages.dev) before and after it goes live:
//   node tests/web-site-check.mjs <site> <app build> [--live]
// - the home page and the app's pages open the RxPOS app, and it starts in a real browser without errors
// - app/version.json names this build (what the web app checks for updates)
// - the classic app's files are still there for the installed classic apps: version.json, and index.html exactly as
//   it lists it (the Windows app refuses a changed file), plus the classic app at /classic/ and a pharmacy's address
// - live only: the cloud is healthy
import crypto from 'node:crypto';

const [site, build, flag] = process.argv.slice(2);
const live = flag === '--live';
const problems = [];
const get = async (p) => {
  const r = await fetch(site + p + (p.includes('?') ? '&' : '?') + 't=' + Date.now(), { signal: AbortSignal.timeout(20000), redirect: 'follow', cache: 'no-store' });
  return { status: r.status, text: Buffer.from(await r.arrayBuffer()) };
};
const check = (ok, what) => { console.log(ok ? 'ok  ' : 'FAIL', what); if (!ok) problems.push(what); };

for (const p of ['/', '/pos', '/inventory']) {
  const r = await get(p);
  check(r.status === 200 && r.text.toString().includes('/app/flutter_bootstrap.js'), `${p} opens the RxPOS app`);
}
const appVersion = await get('/app/version.json');
check(appVersion.status === 200 && JSON.parse(appVersion.text).build === Number(build), `app/version.json is build ${build}`);
const classic = await get('/version.json');
let listed;
try { listed = JSON.parse(classic.text).files?.find((f) => f.path === 'index.html')?.sha256; } catch { listed = undefined; }
check(classic.status === 200 && !!listed, 'the classic version.json is there and lists index.html');
const index = await get('/index.html');
check(index.status === 200 && crypto.createHash('sha256').update(index.text).digest('hex') === listed, 'index.html is exactly the classic page it lists');
const old = await get('/classic/');
check(old.status === 200 && !old.text.toString().includes('flutter_bootstrap') && old.text.toString().includes('assets/'), '/classic/ is the classic app');
const slug = await get('/sample-pharmacy-address');
check(slug.status === 200 && !slug.text.toString().includes('/app/flutter_bootstrap.js'), "a pharmacy's own address still opens the classic app");
if (live) {
  const h = await get('/api/health');
  let ok = false;
  try { ok = h.status === 200 && JSON.parse(h.text).ok === true; } catch { /* not json */ }
  check(ok, 'the cloud is healthy');
}

// the app starts in a real browser
try {
  const { chromium } = await import('playwright');
  // software graphics: CI machines have no GPU, and the app draws with WebGL
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const log = [];
  page.on('console', (m) => { log.push(`${m.type()}: ${m.text().slice(0, 200)}`); if (m.type() === 'error' && /Content Security Policy|Uncaught|TypeError/.test(m.text())) errors.push(m.text()); });
  page.on('requestfailed', (r) => log.push(`request failed: ${r.url().slice(0, 140)} ${r.failure()?.errorText}`));
  page.on('response', (r) => r.status() >= 400 && log.push(`HTTP ${r.status()}: ${r.url().slice(0, 140)}`));
  const explain = () => console.log('  what the browser said:\n    ' + (log.slice(-25).join('\n    ') || '(nothing)'));
  await page.goto(site + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  try {
    await page.waitForSelector('flutter-view, flt-glass-pane', { timeout: 60000 });
    await page.waitForFunction(() => !document.getElementById('rx-loading'), null, { timeout: 60000 });
  } catch (e) {
    explain();
    throw e;
  }
  if (errors.length) explain();
  check(errors.length === 0, 'the app starts in a browser without errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
  await browser.close();
} catch (e) {
  check(false, 'the app starts in a browser: ' + String(e).split('\n')[0]);
}

if (problems.length) { console.log(`\n${problems.length} problem(s) on ${site}`); process.exit(1); }
console.log(`\n${site} is ready`);

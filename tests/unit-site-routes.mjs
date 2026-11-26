// Which addresses of rxposug.com open the RxPOS app (functions/_middleware.js isAppPage).
//   node unit-site-routes.mjs
import { isAppPage, onRequest, pharmacyAddress, webAppFor, WEB_APP } from '../functions/_middleware.js';
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + x : ''}`); };

for (const p of ['/', '/pos', '/inventory/x', '/sign-in', '/payroll', '/pharmcare', '/citycare-ntinda/', '/sample-pharmacy-address']) check(`${p} opens the app`, isAppPage(p) === true);
for (const p of ['/classic/', '/classic/pharmcare', '/api/health', '/owner', '/assets/index-1.js', '/app/main.dart.js', '/index.html', '/version.json', '/sw.js',
  '/manifest.webmanifest', '/updates/x', '/pharmcare/extra', '/Not_A_Slug']) check(`${p} does not`, isAppPage(p) === false);
// rxposug.com/owner → the owner console, a page of the classic app
const r = await onRequest({ request: new Request('https://rxposug.com/owner'), next: () => new Response('next'), env: {} });
check('/owner goes to the classic owner console', r.status === 302 && r.headers.get('location') === 'https://rxposug.com/classic/#/owner', `${r.status} ${r.headers.get('location')}`);
// which app a pharmacy's address opens: as the owner set it, the new app when unsure
check('pharmacy in its address', pharmacyAddress('/pharmcare/') === 'pharmcare' && pharmacyAddress('/pos') === '' && pharmacyAddress('/owner') === '');
const reply = (status, body) => async () => new Response(JSON.stringify(body), { status });
check('a pharmacy kept on the classic app', (await webAppFor('a', reply(200, { app: 'classic' }))) === 'classic');
check('a pharmacy on the new app', (await webAppFor('b', reply(200, { app: 'new' }))) === 'new');
check('an older cloud (no setting) → new app', (await webAppFor('c', reply(200, { name: 'X' }))) === 'new');
check('no such pharmacy → new app (its sign-in says so)', (await webAppFor('d', reply(404, { error: 'x' }))) === 'new');
check('cloud out of reach → new app', (await webAppFor('e', async () => { throw new Error('down'); })) === 'new');
const classicSite = { ASSETS: { fetch: async (u) => new Response(new URL(u).pathname === '/' ? 'classic' : 'flutter') } };
const realFetch = globalThis.fetch;
globalThis.fetch = reply(200, { app: 'classic' });
const page = await onRequest({ request: new Request('https://rxposug.com/oldpharm'), next: () => new Response('next'), env: classicSite });
globalThis.fetch = realFetch;
check('its address then serves the classic page', (await page.text()) === 'classic');
// the owner's choice (2026-11-22): the website opens the classic app (React), whatever a pharmacy's setting says
check('the website opens the classic app', WEB_APP === 'classic');
const site = { ASSETS: { fetch: async (u) => new Response(new URL(u).pathname === '/' ? 'classic' : 'flutter') } };
const home = await onRequest({ request: new Request('https://rxposug.com/'), next: () => new Response('classic root'), env: site });
check('the home page is the classic page', (await home.text()) === 'classic root');
globalThis.fetch = reply(200, { app: 'new' });
const own = await onRequest({ request: new Request('https://rxposug.com/newpharm'), next: () => new Response('next'), env: site });
globalThis.fetch = realFetch;
check("a pharmacy's address serves the classic page, even one set to the new app", (await own.text()) === 'classic');
const pos = await onRequest({ request: new Request('https://rxposug.com/inventory/x'), next: () => new Response('next'), env: site });
check("the new app's page addresses go to the home page", pos.status === 302 && pos.headers.get('location') === 'https://rxposug.com/', `${pos.status} ${pos.headers.get('location')}`);
const files = await onRequest({ request: new Request('https://rxposug.com/app/main.dart.js'), next: () => new Response('next'), env: site });
check("the new app's files are still served (/app/)", (await files.text()) === 'next');
// a missing file is a 404 nothing keeps, never the app's page kept for a year in place of a script (1.21.0's deploy)
const spa = () => new Response('<!doctype html>', { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=31536000, immutable' } });
for (const p of ['/assets/Kits-ByJwkjh_.js', '/assets/index-x.css', '/updates/web-1.zip', '/app/main.dart.js', '/version.json']) {
  const m = await onRequest({ request: new Request('https://rxposug.com' + p), next: async () => spa(), env: site });
  check(`missing ${p} is a 404 not kept`, m.status === 404 && /no-store/.test(m.headers.get('cache-control') || ''), `${m.status} ${m.headers.get('cache-control')}`);
}
const js = await onRequest({ request: new Request('https://rxposug.com/assets/Kits-ByJwkjh_.js'), next: async () => new Response('export{}', { headers: { 'Content-Type': 'application/javascript' } }), env: site });
check('a file the site has is served as it is', js.status === 200 && (await js.text()) === 'export{}');
const pageFile = await onRequest({ request: new Request('https://rxposug.com/classic/index.html'), next: async () => spa(), env: site });
check('an .html file is still served', pageFile.status === 200);
const noExt = await onRequest({ request: new Request('https://rxposug.com/classic/'), next: async () => spa(), env: site });
check('a folder address still gets its page', noExt.status === 200);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

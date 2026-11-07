// RxPOS lives at https://rxposug.com.
// - Cloudflare's free address for this site (rxpos.pages.dev, and the *.rxpos.pages.dev copies of each deployment)
//   sends people there permanently; /api keeps working on the old address so devices that haven't installed the new
//   release yet keep syncing until they do. The preview of the next site (web-preview.rxpos.pages.dev) is the one
//   exception, so it can be checked before it goes live.
// - The site is the RxPOS app (Flutter, its files under /app/): the home page and the app's own pages
//   (/pos, /inventory, …) open it. Everything else is served as before: the classic app's files at the root (the
//   installed classic apps update from them), the classic app itself at /classic/, and a pharmacy's own address
//   (rxposug.com/<pharmacy>) still opens the classic app.
import { FLUTTER_ROUTES } from './flutter-routes.js';

const HOME = 'https://rxposug.com';
const APP = new Set(FLUTTER_ROUTES);

export async function onRequest({ request, next, env }) {
  const url = new URL(request.url);
  const preview = /^web-preview\.rxpos\.pages\.dev$/.test(url.hostname);
  if (!preview && /(^|\.)rxpos\.pages\.dev$/.test(url.hostname) && !url.pathname.startsWith('/api/')) {
    return Response.redirect(HOME + url.pathname + url.search, 301);
  }
  // the classic app's own page, by name: the installed classic Windows app downloads it when it updates (Pages would
  // otherwise redirect /index.html to /, which is now the new app)
  if ((request.method === 'GET' || request.method === 'HEAD') && url.pathname === '/index.html') {
    const page = await env.ASSETS.fetch(new URL('/', url));
    return new Response(request.method === 'HEAD' ? null : page.body, { status: page.status, headers: page.headers });
  }
  if (request.method === 'GET' && isAppPage(url.pathname)) {
    const page = await env.ASSETS.fetch(new URL('/app/index.html', url));
    return new Response(page.body, { status: 200, headers: page.headers });
  }
  return next();
}

/** The home page, or an address starting with one of the app's pages (not a file: no extension). */
export function isAppPage(path) {
  if (path === '/') return true;
  const first = path.split('/')[1] || '';
  return APP.has(first) && !/\.[a-z0-9]+$/i.test(path);
}

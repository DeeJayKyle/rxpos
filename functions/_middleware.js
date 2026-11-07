// RxPOS lives at https://rxposug.com.
// - Cloudflare's free address for this site (rxpos.pages.dev, and the *.rxpos.pages.dev copies of each deployment)
//   sends people there permanently; /api keeps working on the old address so devices that haven't installed the new
//   release yet keep syncing until they do. The preview of the next site (web-preview.rxpos.pages.dev) is the one
//   exception, so it can be checked before it goes live.
// - The site is the RxPOS app (Flutter, its files under /app/): the home page and the app's own pages
//   (/pos, /inventory, …) open it. Everything else is served as before: the classic app's files at the root (the
//   installed classic apps update from them), the classic app itself at /classic/ and its owner console (/owner sends you to /classic/#/owner). A
//   pharmacy's own address (rxposug.com/<pharmacy>, as bookmarked from the classic app) opens the new app too.
import { FLUTTER_ROUTES } from './flutter-routes.js';

const HOME = 'https://rxposug.com';
export const OWNER_CONSOLE = '/classic/#/owner';
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
  // the owner console is a page of the classic app: rxposug.com/owner is the easy address to remember
  if (url.pathname === '/owner' || url.pathname === '/owner/') return Response.redirect(url.origin + OWNER_CONSOLE, 302);
  if (request.method === 'GET' && isAppPage(url.pathname)) {
    // a pharmacy the owner keeps on the classic app (owner console → "New RxPOS app on the web" off): its address opens
    // the classic app, which reads the pharmacy from the address
    const slug = pharmacyAddress(url.pathname);
    if (slug && (await webAppFor(slug)) === 'classic') {
      const page = await env.ASSETS.fetch(new URL('/', url));
      return new Response(page.body, { status: 200, headers: page.headers });
    }
    const page = await env.ASSETS.fetch(new URL('/app/index.html', url));
    return new Response(page.body, { status: 200, headers: page.headers });
  }
  return next();
}

// Not pharmacy addresses: the site's own folders and names the cloud never gives a pharmacy (worker RESERVED)
const NOT_PHARMACY = new Set(['api', 'owner', 'assets', 'app', 'classic', 'updates', 'functions', 'index', 'sw', 'manifest', 'favicon', 'admin', 'login', 'www']);
const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;

/** The home page, an address starting with one of the app's pages, or a pharmacy's own address (/<pharmacy>, with or
 * without a trailing slash); never a file (no extension). */
export function isAppPage(path) {
  if (path === '/') return true;
  if (/\.[a-z0-9]+$/i.test(path)) return false;
  return APP.has(path.split('/')[1] || '') || pharmacyAddress(path) !== '';
}

/** The pharmacy in a pharmacy's own address (/<pharmacy> or /<pharmacy>/), else '' */
export function pharmacyAddress(path) {
  if (/\.[a-z0-9]+$/i.test(path)) return '';
  const parts = path.split('/').filter(Boolean);
  const first = parts[0] || '';
  return parts.length === 1 && SLUG.test(first) && !NOT_PHARMACY.has(first) && !APP.has(first) ? first : '';
}

const API = 'https://api.rxposug.com';
/** Which web app a pharmacy uses ('new' or 'classic'), from the cloud's public lookup, kept for a minute. Anything
 * unexpected (no such pharmacy, the cloud out of reach) opens the new app, whose sign-in says what is wrong. */
export async function webAppFor(slug, fetcher = fetch) {
  const cache = globalThis.caches?.default;
  const key = `${API}/api/pharmacy/${slug}`;
  try {
    let r = cache ? await cache.match(key) : undefined;
    if (!r) {
      r = await fetcher(key, { signal: AbortSignal.timeout(4000) });
      if (cache && r.ok) await cache.put(key, new Response(await r.clone().text(), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=60' } }));
    }
    return r.ok && (await r.json()).app === 'classic' ? 'classic' : 'new';
  } catch {
    return 'new';
  }
}

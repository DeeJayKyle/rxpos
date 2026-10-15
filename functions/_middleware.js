// RxPOS lives at https://rxposug.com. Cloudflare's free address for this site (rxpos.pages.dev, and the *.rxpos.pages.dev
// copies of each deployment) sends people there permanently. /api keeps working on the old address so devices that
// haven't installed the new release yet keep syncing until they do.
const HOME = 'https://rxposug.com';

export async function onRequest({ request, next }) {
  const url = new URL(request.url);
  if (/(^|\.)rxpos\.pages\.dev$/.test(url.hostname) && !url.pathname.startsWith('/api/')) {
    return Response.redirect(HOME + url.pathname + url.search, 301);
  }
  return next();
}

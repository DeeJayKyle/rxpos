// Cloudflare Pages Function for https://rxpos.pages.dev
// The web app is served by Pages; every /api/* request is forwarded unchanged to the RxPOS cloud Worker
// (sync, staff sign-in, Mobile Money, SMS), so data and secrets stay in one place.
const UPSTREAM = 'https://pharmapos.pharmapos.workers.dev';

export async function onRequest({ request }) {
  const url = new URL(request.url);
  return fetch(new Request(UPSTREAM + url.pathname + url.search, request));
}

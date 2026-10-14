// Approximate location of the device's internet connection (from Cloudflare, no permission prompt, no third party).
// Used for the weather when the device can't (or may not) use GPS, e.g. the Windows app.
export function onRequest({ request }) {
  const cf = request.cf || {};
  const body = cf.latitude ? { lat: Number(cf.latitude), lon: Number(cf.longitude), city: cf.city || '', region: cf.region || '', country: cf.country || '' } : { error: 'Location unknown' };
  return new Response(JSON.stringify(body), { status: cf.latitude ? 200 : 404, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' } });
}

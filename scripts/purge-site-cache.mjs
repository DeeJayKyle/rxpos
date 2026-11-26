// After a website deploy: Cloudflare forgets every copy it keeps of rxposug.com's files, so no location keeps serving
// an old or wrong copy of an update file (1.21.0: one location kept the app's page in place of 9 scripts for a year,
// and the Windows app refuses a changed file). The files are only fetched again; no data is touched.
//   CLOUDFLARE_API_TOKEN=… node scripts/purge-site-cache.mjs [rxposug.com]
// The token needs Zone → Cache Purge → Purge (and Zone → Zone → Read, or CLOUDFLARE_ZONE_ID set). Without them this
// says so and exits 0: the deploy goes on, and the update-file check after it shows whether a purge was needed.
const name = process.argv[2] || 'rxposug.com';
const token = process.env.CLOUDFLARE_API_TOKEN;
const api = (path, opt = {}) => fetch('https://api.cloudflare.com/client/v4' + path, {
  ...opt, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(20000),
}).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
const warn = (m) => { console.log(`::warning::${m}`); process.exit(0); };
const errs = (b) => (b.errors || []).map((e) => [e.code, e.message].filter(Boolean).join(' ')).join('; ') || 'no reason given';
if (!token) warn('No CLOUDFLARE_API_TOKEN: Cloudflare\'s copies of the website were not purged.');
let zone = process.env.CLOUDFLARE_ZONE_ID;
if (!zone) {
  const z = await api(`/zones?name=${encodeURIComponent(name)}`).catch((e) => ({ status: 0, body: { errors: [{ message: e.message }] } }));
  zone = z.body.result?.[0]?.id;
  if (!zone) warn(`Could not find the zone ${name} (HTTP ${z.status}: ${errs(z.body)}). Give the CLOUDFLARE_API_TOKEN Zone → Zone → Read and Zone → Cache Purge → Purge for ${name}, or purge by hand: Cloudflare → ${name} → Caching → Configuration → Purge Everything.`);
}
const p = await api(`/zones/${zone}/purge_cache`, { method: 'POST', body: JSON.stringify({ purge_everything: true }) }).catch((e) => ({ status: 0, body: { errors: [{ message: e.message }] } }));
if (!p.body.success) warn(`Cloudflare's copies of ${name} were not purged (HTTP ${p.status}: ${errs(p.body)}). Give the CLOUDFLARE_API_TOKEN Zone → Cache Purge → Purge for ${name}, or purge by hand: Cloudflare → ${name} → Caching → Configuration → Purge Everything.`);
console.log(`Cloudflare's copies of ${name} purged: every location fetches the files again.`);

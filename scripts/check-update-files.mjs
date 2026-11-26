// After a deploy: every file the apps download arrives exactly as version.json lists it. The Windows app checks each
// file's sha256 and refuses the update when one differs ("index.html arrived damaged"); index.html is also fetched the
// way a browser asks for it, because Cloudflare changed pages only for browser requests until _headers said no-transform.
//   node scripts/check-update-files.mjs [https://rxposug.com]
import crypto from 'node:crypto';
const site = process.argv[2] || 'https://rxposug.com';
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
// a network hiccup on the way (timeouts from the build machine) is not a changed file: retry, and say which it was
const fetchRetry = async (url, opt = {}) => {
  for (let i = 0; ; i++) {
    try { return await fetch(url, { ...opt, signal: AbortSignal.timeout(20000) }); } catch (e) {
      if (i >= 4) { console.log(`Could not reach ${url}: ${e.cause?.code || e.message}. The files were not checked.`); process.exit(2); }
      await new Promise((r) => setTimeout(r, 3000 * (i + 1)));
    }
  }
};
const meta = new Map(); // what came back for each file, said for any that differ (1.21.0: the app's page, kept by Cloudflare)
const get = async (p, headers = {}) => {
  const r = await fetchRetry(site + '/' + p.split('/').map(encodeURIComponent).join('/'), { headers });
  const b = Buffer.from(await r.arrayBuffer());
  const h = (k) => r.headers.get(k) || '-';
  meta.set(p, `HTTP ${r.status}, ${h('content-type')}, ${b.length} bytes, cloudflare cache ${h('cf-cache-status')} (age ${h('age')} s), starts ${JSON.stringify(b.subarray(0, 60).toString('utf8'))}`);
  return b;
};
const m = await (await fetchRetry(site + '/version.json?t=' + Date.now(), { cache: 'no-store' })).json();
const bad = [];
for (const f of m.files) if (sha(await get(f.path)) !== f.sha256) { bad.push(f.path); console.log(`${f.path} (listed ${f.size} bytes): ${meta.get(f.path)}`); }
const page = m.files.find((f) => f.path === 'index.html');
const asBrowser = await get('index.html', { Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36' });
if (page && sha(asBrowser) !== page.sha256) { bad.push('index.html (asked like a browser)'); console.log('index.html as a browser gets it ends with:', JSON.stringify(asBrowser.toString('utf8').slice(-500))); }
const zip = await get(m.zip);
if (sha(zip) !== m.zipSha256) bad.push(m.zip);
console.log(`build ${m.build}: ${m.files.length} files and the archive checked, ${bad.length} differ${bad.length ? ': ' + bad.join(', ') : ''}`);
process.exit(bad.length ? 1 : 0);

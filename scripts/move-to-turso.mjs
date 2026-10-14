// Copy the whole RxPOS cloud from Cloudflare D1 to Turso (owner key needed; runs in steps of 500 records).
//   node scripts/move-to-turso.mjs <cloud address> <owner key file>
// After it reports equal counts, set DB_BACKEND = "turso" (wrangler.jsonc vars) and deploy.
import fs from 'node:fs';
const [base = 'https://rxpos.pages.dev', keyFile] = process.argv.slice(2);
const key = (keyFile ? fs.readFileSync(keyFile, 'utf8') : process.env.OWNER_KEY || '').split(/\s+/).filter((w) => /^[A-Za-z0-9_-]{20,}$/.test(w)).sort((a, b) => b.length - a.length)[0];
if (!key) throw new Error('Owner key not found');
const api = async (body) => {
  const r = await fetch(base + '/api/owner/move-to-turso', { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'HTTP ' + r.status);
  return j;
};
console.log('before:', JSON.stringify(await api()));
console.log('pharmacies:', (await api({ step: 'tenants' })).copied);
let after = 0, total = 0;
for (;;) {
  let j;
  for (let a = 1; ; a++) { try { j = await api({ step: 'records', after }); break; } catch (e) { if (a >= 4) throw e; await new Promise((r) => setTimeout(r, 2000 * a)); } }
  total += j.copied; after = j.last;
  process.stdout.write(`\r  records copied: ${total}`);
  if (j.done) break;
}
const end = await api();
console.log('\nafter:', JSON.stringify(end));
const same = end.d1.records === end.turso.records && end.d1.tenants === end.turso.tenants && end.d1.maxSeq === end.turso.maxSeq;
console.log(same ? 'OK: Turso has exactly the same data.' : 'WARNING: counts differ, do not switch yet.');
process.exit(same ? 0 : 1);

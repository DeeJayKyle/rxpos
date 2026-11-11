// Faster sync, stage 3 (worker/snapshot.js): ready-made compressed chunks of a full download. The chunks, then the
// pages after the last one, give exactly the pharmacy (the newest copy of each record), even when records changed
// after a chunk was built; a chunk is built once and then served as stored; only the pharmacy's own boundaries are
// accepted; phases and windows split the chunks like sync does. The local test cloud cuts chunks of 40 records
// (tests/run-all.mjs SNAPSHOT_CHUNK). Cloud only (a hub has no R2 and answers 404: checked too when run there).
//   node v72-snapshot.mjs <base> <ownerKey>
const [base, ownerKey] = process.argv.slice(2);
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + String(x).slice(0, 240) : ''}`); };
const owner = (p, body) => fetch(base + '/api/owner' + p, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ownerKey }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());
const post = (path, token, body) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept-Encoding': 'gzip', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body) })
  .then(async (r) => ({ status: r.status, h: r.headers, j: await r.json().catch(() => ({})) }));

const t = await owner('/tenants', { name: 'Chunks Sample Pharmacy', admin: { name: 'Chao Sample', email: 'chao@test.rx', password: 'chao-pass-12345' } });
const tid = t.tenant.id, slug = t.tenant.slug;
const old = '2025-03-01T10:00:00.000Z';
const recs = [];
for (let i = 0; i < 60; i++) recs.push({ t: 'products', id: 'ck-p' + i, rec: { name: 'Sample Medicine ' + i, price: 100 + i } });
for (let i = 0; i < 60; i++) recs.push({ t: 'sales', id: 'ck-s' + i, rec: { number: 'R' + i, date: old, total: 500, paid: i % 10 === 0 ? 100 : 500, customerId: 'walk-in', items: [], status: 'completed' } });
for (let i = 0; i < 60; i++) recs.push({ t: 'movements', id: 'ck-m' + i, rec: { productId: 'ck-p' + i, qty: 10, type: 'Opening stock', date: old } });
await owner(`/tenants/${tid}/records`, { records: recs });
const token = (await post('/api/login', null, { email: 'chao@test.rx', password: 'chao-pass-12345', tenant: slug })).j.token;
const cutoff = new Date(Date.now() - 3 * 864e5).toISOString().slice(0, 10) + 'T00:00:00.000Z';

/** A whole download: the chunks, then the pages after the last one; the newest copy of each record wins */
async function download(extra = {}) {
  const got = new Map();
  const take = (ch) => { const k = ch.t + '|' + ch.id, prev = got.get(k); if (!prev || prev.at <= ch.at) got.set(k, ch); };
  const list = await post('/api/snapshot', token, { deviceId: 'ck-dev', ...extra });
  if (list.status === 404) return { hub: true };
  let since = 0, how = [];
  for (const c of list.j.chunks) {
    const r = await post('/api/snapshot/chunk', token, { deviceId: 'ck-dev', ...extra, from: c.from, to: c.to });
    how.push(r.h.get('x-rxpos-chunk'));
    for (const ch of r.j.changes || []) take(ch);
    since = c.to;
  }
  for (let n = 0; n < 50; n++) {
    const r = await post('/api/sync', token, { deviceId: 'ck-dev', since, changes: [], v: 2, all: true, ...extra });
    for (const ch of r.j.changes) take(ch);
    since = r.j.cursor;
    if (!r.j.more) break;
  }
  return { got, chunks: list.j.chunks, how };
}
async function plain() {
  const got = new Map();
  let since = 0;
  for (let n = 0; n < 50; n++) { const r = await post('/api/sync', token, { deviceId: 'ck-dev', since, changes: [], v: 2, all: true }); for (const ch of r.j.changes) got.set(ch.t + '|' + ch.id, ch); since = r.j.cursor; if (!r.j.more) break; }
  return got;
}
const same = (a, b) => a.size === b.size && [...b].every(([k, v]) => JSON.stringify(a.get(k)?.rec) === JSON.stringify(v.rec) && !!a.get(k)?.deleted === !!v.deleted);

const first = await download();
if (first.hub) {
  check('a hub has no ready-made downloads: it says so (the apps page as before)', true);
} else {
  check('the pharmacy is cut into chunks at fixed boundaries', first.chunks.length >= 4 && first.chunks.every((c, i) => i === 0 || c.from === first.chunks[i - 1].to), JSON.stringify(first.chunks.slice(0, 3)));
  check('the chunks and the pages after them are exactly the pharmacy', same(first.got, await plain()), `${first.got.size}`);
  check('a chunk is built the first time it is asked for', first.how.every((h) => h === 'built'), first.how.join(','));
  const again = await download();
  check('…and then served as stored', again.how.every((h) => h === 'stored'), again.how.join(','));
  check('the same boundaries the second time', JSON.stringify(again.chunks) === JSON.stringify(first.chunks));
  // a record inside an early chunk changes after the chunk was stored: the newest copy still wins
  await post('/api/sync', token, { deviceId: 'ck-editor', since: 0, v: 2, changes: [{ t: 'products', id: 'ck-p3', rec: { id: 'ck-p3', name: 'Renamed Sample', price: 999 }, at: new Date().toISOString(), op: 'op-ck-rename' }] });
  const after = await download();
  check('a record changed after its chunk was stored arrives in its newest form', after.got.get('products|ck-p3')?.rec?.name === 'Renamed Sample', after.got.get('products|ck-p3')?.rec?.name);
  check('…and the whole download is still exactly the pharmacy', same(after.got, await plain()));
  const bad = await post('/api/snapshot/chunk', token, { deviceId: 'ck-dev', from: 0, to: 999999999 });
  check('a range that is not one of the pharmacy\'s chunks is refused', bad.status === 404);
  // phases: core chunks + history chunks = the whole chunks
  const core = await download({ phase: 'core', cutoff }), hist = await download({ phase: 'history', cutoff });
  const keys = new Set([...core.got.keys(), ...hist.got.keys()]);
  check('core and history chunks together are the whole download', keys.size === after.got.size && [...after.got.keys()].every((k) => keys.has(k)), `${core.got.size} + ${hist.got.size} vs ${after.got.size}`);
  check('old walk-in cash sales are in the history chunks, unpaid ones in the core', hist.got.has('sales|ck-s1') && core.got.has('sales|ck-s0') && !core.got.has('sales|ck-s1'));
  // stage 4: a window leaves out what a device with that window does not keep
  const win = await download({ window: '2026-01-01' });
  check('with a window, old paid sales and old movements stay in the cloud', !win.got.has('sales|ck-s1') && !win.got.has('movements|ck-m1'), win.got.size);
  check('…but medicines and unpaid sales come', win.got.has('products|ck-p1') && win.got.has('sales|ck-s0'));
  const enc = (await fetch(base + '/api/snapshot/chunk', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept-Encoding': 'gzip', Authorization: 'Bearer ' + token }, body: JSON.stringify({ deviceId: 'ck-dev', from: first.chunks[0].from, to: first.chunks[0].to }) })).headers.get('content-encoding');
  check('chunks are sent compressed (gzip, as stored)', enc === 'gzip', enc);
}

await owner('/tenants/' + tid + '/delete', { confirm: slug });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

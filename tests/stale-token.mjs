// Stale sign-ins: removed/disabled staff and devices from a deleted pharmacy are refused. node stale-token.mjs <base> <ownerKey>
const [base, ownerKey] = process.argv.slice(2);
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); };
const call = async (path, { body, auth } = {}) => {
  const r = await fetch(base + path, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: 'Bearer ' + auth } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
  return [r.status, j];
};
const sync = (tok, changes = []) => call('/api/sync', { auth: tok, body: { deviceId: 'dev-' + Math.random(), since: 0, changes } });
const make = () => call('/api/owner/tenants', { auth: ownerKey, body: { name: 'Stale Test', slug: 'stale', admin: { name: 'Ann', email: 'ann@stale.rx', password: 'ann-pass-123' } } });

let [s, j] = await make();
check('create pharmacy', s === 200, j.error);
const tid = j.tenant?.id;
[s, j] = await call('/api/login', { body: { email: 'ann@stale.rx', password: 'ann-pass-123', tenant: 'stale' } });
const annTok = j.token;
check('admin signs in', s === 200 && annTok, j.error);
[s, j] = await sync(annTok, [{ t: 'products', id: 'p-old', at: new Date().toISOString(), rec: { name: 'Old data' } }]);
check('sync works while signed in', s === 200 && j.applied === 1, JSON.stringify(j).slice(0, 120));

[s, j] = await call(`/api/owner/tenants/${tid}/users`, { auth: ownerKey, body: { user: { name: 'Bob', email: 'bob@stale.rx', role: 'cashier', password: 'bob-pass-123' } } });
const bobId = j.user?.id;
[s, j] = await call('/api/login', { body: { email: 'bob@stale.rx', password: 'bob-pass-123', tenant: 'stale' } });
const bobTok = j.token;
check('second staff signs in and syncs', (await sync(bobTok))[0] === 200);
await call(`/api/owner/tenants/${tid}/users`, { auth: ownerKey, body: { user: { id: bobId, email: 'bob@stale.rx', disabled: true } } });
check('disabled staff is refused at once', (await sync(bobTok))[0] === 401);
await call(`/api/owner/tenants/${tid}/users/${bobId}/delete`, { auth: ownerKey, body: {} });
check('removed staff is refused', (await sync(bobTok))[0] === 401);
check('other staff unaffected', (await sync(annTok))[0] === 200);

[s, j] = await call(`/api/owner/tenants/${tid}/delete`, { auth: ownerKey, body: { confirm: 'stale' } });
check('delete pharmacy', s === 200, j.error);
[s, j] = await make();
check('new pharmacy with the same address', s === 200 && j.tenant?.id === tid, j.tenant?.id);
[s, j] = await sync(annTok, [{ t: 'products', id: 'p-old2', at: new Date().toISOString(), rec: { name: 'Old data' } }]);
check('old device from the deleted pharmacy is refused', s === 401, String(s));
[s, j] = await call('/api/login', { body: { email: 'ann@stale.rx', password: 'ann-pass-123', tenant: 'stale' } });
[s, j] = await sync(j.token);
check('new pharmacy starts empty', s === 200 && !j.changes.some((c) => c.t === 'products' && String(c.id).startsWith('p-old')), j.changes?.length);
await call(`/api/owner/tenants/${tid}/delete`, { auth: ownerKey, body: { confirm: 'stale' } });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

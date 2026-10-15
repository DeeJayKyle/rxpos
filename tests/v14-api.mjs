// RxPOS 1.4 cloud rules: node v14-api.mjs <base> <ownerKey>
const [base, ownerKey] = process.argv.slice(2);
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); };
const call = async (path, { method, body, auth } = {}) => {
  const r = await fetch(base + path, { method: method || (body ? 'POST' : 'GET'), headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: 'Bearer ' + auth } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let j; try { j = JSON.parse(text); } catch { j = text; }
  return [r.status, j];
};
const at = () => new Date().toISOString();
const sync = (tok, changes = [], since = 0) => call('/api/sync', { auth: tok, body: { deviceId: 'dev-' + Math.random(), since, changes } });

let [s, j] = await call('/api/health');
check('health', s === 200 && j.version >= 4);
[s, j] = await call('/api/owner/tenants', { auth: ownerKey, body: { name: 'Test Pharmacy Ltd', admin: { name: 'Ann Admin', email: 'ann@test.rx', password: 'short' } } });
check('create refuses a short admin password', s === 400, j.error);
[s, j] = await call('/api/owner/tenants', { auth: ownerKey, body: { name: 'Test Pharmacy Ltd', slug: 'api', admin: { name: 'Ann', email: 'ann@test.rx', password: 'ann-pass-123' } } });
check('reserved web address refused', s === 400);
[s, j] = await call('/api/owner/tenants', { auth: ownerKey, body: { name: 'Test Pharmacy Ltd', address: 'Ntinda', branches: [{ name: 'Kireka' }], features: { chat: false }, admin: { name: 'Ann Admin', email: 'Ann@Test.rx', password: 'ann-pass-123', mustChange: true } } });
check('owner creates pharmacy with web address from its name', s === 200 && j.tenant.slug === 'test-pharmacy-ltd' && j.tenant.features.chat === false, j.error || j.tenant?.slug);
const tid = j.tenant?.id;
[s, j] = await call('/api/pharmacy/test-pharmacy-ltd');
check('public pharmacy lookup by web address', s === 200 && j.name === 'Test Pharmacy Ltd');
[s, j] = await call('/api/pharmacy/nope-nothing');
check('unknown address → 404', s === 404);

[s, j] = await call('/api/login', { body: { email: 'ann@test.rx', password: 'ann-pass-123', tenant: 'test-pharmacy-ltd' } });
check('admin signs in with web address', s === 200 && j.user.role === 'admin' && j.slug === 'test-pharmacy-ltd', j.error);
const adminTok = j.token;
[s, j] = await sync(adminTok);
const tables = new Set(j.changes.map((c) => c.t));
check('first sync brings settings, branches (2), admin user, licence', ['settings', 'branches', 'users', 'license'].every((t) => tables.has(t)) && j.changes.filter((c) => c.t === 'branches').length === 2 && j.changes.find((c) => c.t === 'users')?.rec.mustChangePassword === true);

// devices may not touch branches / licence, nor create admins
[s, j] = await sync(adminTok, [{ t: 'branches', id: 'br-x', rec: { id: 'br-x', name: 'Rogue' }, at: at() }, { t: 'license', id: 'license', rec: { features: {} }, at: at() }]);
check('devices cannot add branches or change the licence', j.refused === 2 && j.applied === 0, JSON.stringify({ a: j.applied, r: j.refused }));
[s, j] = await sync(adminTok, [{ t: 'users', id: 'u-new-admin', rec: { id: 'u-new-admin', name: 'Sneaky', email: 'sneaky@test.rx', role: 'admin' }, at: at() }]);
check('pharmacy admin cannot create another admin', j.refused === 1);
[s, j] = await sync(adminTok, [{ t: 'users', id: 'u-disp', rec: { id: 'u-disp', name: 'Dee', email: 'dee@test.rx', role: 'dispenser', algo: 'sha', hash: 'x' }, at: at() }]);
check('pharmacy admin can add a dispenser', j.applied === 1 && j.refused === 0);
[s, j] = await sync(adminTok, [{ t: 'users', id: 'u-disp', rec: { id: 'u-disp', name: 'Dee', email: 'dee@test.rx', role: 'admin' }, at: at() }]);
check('…but cannot promote them to admin', j.refused === 1);

// owner manages everything
[s, j] = await call(`/api/owner/tenants/${tid}/branches`, { auth: ownerKey, body: { branch: { name: 'Bweyogerere' } } });
check('owner adds a branch', s === 200 && j.branch.id);
[s, j] = await call(`/api/owner/tenants/${tid}/users`, { auth: ownerKey, body: { user: { name: 'Second Admin', email: 'two@test.rx', role: 'admin', password: 'second-pass-1' } } });
check('owner creates a second admin', s === 200 && j.user.role === 'admin' && !j.user.hash);
[s, j] = await call(`/api/owner/tenants/${tid}`, { auth: ownerKey, body: { slug: 'testrx', features: { chat: true, promos: false } } });
check('owner edits web address and features', s === 200 && j.tenant.slug === 'testrx' && j.tenant.features.promos === false);
[s, j] = await call('/api/login', { body: { email: 'two@test.rx', password: 'second-pass-1', tenant: 'testrx' } });
check('sign-in works at the new address', s === 200, j.error);
[s, j] = await call(`/api/owner/tenants/${tid}/records`, { auth: ownerKey, body: { records: [{ t: 'products', id: 'p1', rec: { name: 'Paracetamol 500mg', price: 100 } }, { t: 'customers', id: 'c1', rec: { name: 'Jane' } }] } });
check('owner writes records', s === 200 && j.written === 2);
[s, j] = await call(`/api/owner/tenants/${tid}/records?t=products&q=Paracet`, { auth: ownerKey });
check('owner searches records', s === 200 && j.total === 1 && j.rows[0].rec.name === 'Paracetamol 500mg');
[s, j] = await call(`/api/owner/tenants/${tid}/export`, { auth: ownerKey });
check('owner exports all data', s === 200 && j.products?.length === 1 && j.settings?.name === 'Test Pharmacy Ltd' && j.users.length >= 2);
[s, j] = await call(`/api/owner/tenants/${tid}`, { auth: ownerKey });
check('owner sees users without password hashes', s === 200 && j.users.every((u) => !u.hash && !u.salt) && j.branches.length === 3);

// calendar feed
await sync(adminTok, [{ t: 'events', id: 'e1', rec: { id: 'e1', title: 'NDA inspection, main shop', date: '2026-11-02', time: '10:00', repeat: 'none' }, at: at() }]);
[s, j] = await call('/api/calendar-link', { auth: adminTok });
check('calendar link for the pharmacy', s === 200 && /\/api\/calendar\/.+\.ics$/.test(j.url));
const r = await fetch(j.url.replace(/^https?:\/\/[^/]+/, base));
const ics = await r.text();
check('calendar feed lists the event (ICS)', r.ok && ics.includes('BEGIN:VCALENDAR') && ics.includes('SUMMARY:NDA inspection\\, main shop') && ics.includes('DTSTART:20261102T100000'));
const bad = await fetch(j.url.replace(/^https?:\/\/[^/]+/, base).replace(/[A-Za-z0-9_-]{24}\.ics$/, 'x'.repeat(24) + '.ics'));
check('calendar feed needs the secret link', bad.status === 404);

// reset & delete
[s, j] = await call(`/api/owner/tenants/${tid}/reset`, { auth: ownerKey, body: { confirm: 'wrong' } });
check('reset needs the address typed', s === 400);
[s, j] = await call(`/api/owner/tenants/${tid}/reset`, { auth: ownerKey, body: { confirm: 'testrx', keepMedicines: true } });
check('reset clears data but keeps staff/branches/medicines', s === 200 && j.cleared >= 2, String(j.cleared));
[s, j] = await call(`/api/owner/tenants/${tid}`, { auth: ownerKey });
check('…staff and branches kept', j.users.length >= 2 && j.branches.length === 3 && (j.tables.find((x) => x.t === 'customers')?.n || 0) === 0);
[s, j] = await call(`/api/owner/tenants/${tid}/delete`, { auth: ownerKey, body: { confirm: 'testrx' } });
check('owner deletes the pharmacy', s === 200 && j.deleted > 0);
[s, j] = await call('/api/login', { body: { email: 'ann@test.rx', password: 'ann-pass-123' } });
check('deleted pharmacy staff cannot sign in', s === 401);
[s] = await call('/api/owner/tenants/main/delete', { auth: ownerKey, body: { confirm: 'wrong' } });
check('deleting a pharmacy needs its address typed (or it does not exist)', s === 400 || s === 404);
console.log(`\n${pass} passed, ${fail} failed`);

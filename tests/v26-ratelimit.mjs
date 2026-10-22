// Sign-in lockout and reset-send caps (security review 0.6).
//   node v26-ratelimit.mjs <base> <ownerKey> <outDir>
const [base, ownerKey] = process.argv.slice(2);
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + String(x).slice(0, 120) : ''}`); };
const owner = (p, body) => fetch(base + '/api/owner' + p, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ownerKey }, body: JSON.stringify(body) }).then((r) => r.json());
const api = (p, body) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.status);

const t = await owner('/tenants', { name: 'Rate Pharmacy', admin: { name: 'Ro Admin', email: 'ro@test.rx', password: 'ro-pass-12345' } });
const slug = t.tenant.slug, tid = t.tenant.id;

// --- staff lockout after repeated wrong passwords (keyed per IP + account) ---
const statuses = [];
for (let i = 0; i < 6; i++) statuses.push(await api('/api/login', { email: 'ro@test.rx', password: 'wrong-' + i, tenant: slug }));
check('wrong passwords eventually lock sign-in (429)', statuses.includes(429), JSON.stringify(statuses));
check('the correct password is also refused while locked', (await api('/api/login', { email: 'ro@test.rx', password: 'ro-pass-12345', tenant: slug })) === 429);

// --- forgot-password cap: the endpoint can't be used to fan out many sends from one IP ---
let last = 200, hit429 = false;
for (let i = 0; i < 25; i++) { last = await api('/api/password/forgot', { email: 'ghost' + i + '@test.rx', tenant: slug }); if (last === 429) { hit429 = true; break; } }
check('0.6 reset sends are rate-limited (429 after the cap)', hit429, 'last=' + last);

await owner('/tenants/' + tid + '/delete', { confirm: slug });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

// Sign-in slowdown per account on a local cloud (workplan step 6). Guesses come from a different address each time,
// so the older per-address lock never trips: only the per-account slowdown can stop them. Includes one real minute of
// waiting, to show a real person gets back in.   node v58-throttle.mjs <base> <ownerKey>
const [base, ownerKey] = process.argv.slice(2);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + String(x).slice(0, 180) : ''}`); };
const owner = (p, body) => fetch(base + '/api/owner' + p, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ownerKey }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());
let ipN = 0;
const from = (ip = `198.51.100.${(ipN++ % 250) + 1}`) => ip; // documentation addresses (RFC 5737), a new one per try
const login = (body, ip = from()) => fetch(base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip, 'X-Forwarded-For': ip }, body: JSON.stringify(body) })
  .then(async (r) => ({ status: r.status, ...(await r.json().catch(() => ({}))) }));

const t = await owner('/tenants', { name: 'Slow Pharmacy', admin: { name: 'Sam Admin', email: 'sam@slow.rx', password: 'sam-pass-1234' } });
const slug = t.tenant.slug, tid = t.tenant.id;
await owner('/tenants/' + tid + '/users', { user: { name: 'Bea Bystander', email: 'bea@slow.rx', role: 'cashier', password: 'bea-pass-1234' } });

// the older lock is per address: 5 wrong tries from one address lock that address only
const same = [];
for (let i = 0; i < 5; i++) same.push((await login({ email: 'bea@slow.rx', password: 'nope' + i, tenant: slug }, '203.0.113.9')).status);
check('the per-address lock still works (5 wrong from one address)', same.at(-1) === 429, same.join(','));
check('…and does not stop the same person from another address', (await login({ email: 'bea@slow.rx', password: 'bea-pass-1234', tenant: slug }, '203.0.113.10')).status === 200);

// a guesser rotating addresses: 10 wrong passwords, then the account slows down
const st = [];
for (let i = 0; i < 10; i++) st.push((await login({ email: 'sam@slow.rx', password: 'guess-' + i, tenant: slug })).status);
check('10 wrong passwords from 10 addresses are each just "wrong" (no per-address lock)', st.every((x) => x === 401), st.join(','));
let r = await login({ email: 'sam@slow.rx', password: 'guess-x', tenant: slug });
check('the next try, from yet another address, is slowed down (429)', r.status === 429 && r.retryAfter > 0 && r.retryAfter <= 60, JSON.stringify(r));
check('…with a plain message and the way out', /Try again in .*Forgot password/.test(r.error || ''), r.error);
r = await login({ email: 'sam@slow.rx', password: 'sam-pass-1234', tenant: slug });
check('during the wait even the right password waits (no hint that it was right)', r.status === 429);
check('another account is not affected', (await login({ email: 'bea@slow.rx', password: 'bea-pass-1234', tenant: slug })).status === 200);
r = await login({ email: 'nobody@slow.rx', password: 'x', tenant: slug });
check('an account that does not exist answers like one that does', r.status === 401 && !/exist|no such/i.test(r.error || ''));

// a real person: a minute later, the right password works and clears the count
await wait(61000);
r = await login({ email: 'sam@slow.rx', password: 'sam-pass-1234', tenant: slug });
check('a minute later the right password signs in', r.status === 200 && !!r.token, JSON.stringify(r).slice(0, 120));
const after = [];
for (let i = 0; i < 3; i++) after.push((await login({ email: 'sam@slow.rx', password: 'oops-' + i, tenant: slug })).status);
check('…and the count started again (3 wrong are just wrong)', after.every((x) => x === 401), after.join(','));

await owner('/tenants/' + tid + '/delete', { confirm: slug });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

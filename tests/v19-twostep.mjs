// Two-step sign-in (worker/twostep.js, Auth.jsx, twostep.jsx): set up, sign in with a code in the browser, no
// replay, wrong codes lock, the secret never reaches devices, administrators can reset it.
//   node v19-twostep.mjs <base> <ownerKey> <outDir>
import puppeteer from 'puppeteer-core';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { CHROME } from './chrome.mjs';
const [base, ownerKey, out] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + String(x).slice(0, 200) : ''}`); };
const owner = (p, body) => fetch(base + '/api/owner' + p, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ownerKey }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());
const api = (p, body, token) => fetch(base + p, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined }).then(async (r) => ({ status: r.status, ...(await r.json()) }));
const until = async (pg, fn, ms = 15000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await pg.evaluate(fn).catch(() => false)) return true; await wait(300); } return false; };

// an authenticator app, in a few lines (RFC 6238: HMAC-SHA1, 30 s, 6 digits)
const b32 = (s) => { const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; let bits = 0, v = 0; const o = []; for (const c of s.replace(/=+$/, '')) { v = (v << 5) | A.indexOf(c); bits += 5; if (bits >= 8) { o.push((v >>> (bits - 8)) & 255); bits -= 8; } } return Buffer.from(o); };
const totp = (secret, step) => { const m = Buffer.alloc(8); m.writeUInt32BE(Math.floor(step / 2 ** 32), 0); m.writeUInt32BE(step >>> 0, 4); const h = crypto.createHmac('sha1', b32(secret)).update(m).digest(); const o = h[h.length - 1] & 15; return String((h.readUInt32BE(o) & 0x7fffffff) % 1e6).padStart(6, '0'); };
const stepNow = () => Math.floor(Date.now() / 30000);

const t = await owner('/tenants', { name: 'Twostep Pharmacy', admin: { name: 'Tess Admin', email: 'tess@test.rx', password: 'tess-pass-123' } });
const slug = t.tenant.slug, tid = t.tenant.id;
const login = (otp) => api('/api/login', { email: 'tess@test.rx', password: 'tess-pass-123', tenant: slug, ...(otp ? { otp } : {}) });
let r = await login();
const token = r.token, uid = r.user?.id;
check('signs in with the password while two-step is off', !!token && !r.twoFactor);
r = await api('/api/2fa', null, token);
check('two-step starts off', r.status === 200 && r.enabled === false, JSON.stringify(r));
const setup = await api('/api/2fa/setup', {}, token);
check('setup gives a secret and an otpauth:// link for the QR code', /^[A-Z2-7]{32}$/.test(setup.secret || '') && /^otpauth:\/\/totp\/RxPOS:tess%40test\.rx\?secret=/.test(setup.uri || ''), setup.uri);
r = await api('/api/2fa/enable', { code: '000000' }, token);
check('a wrong first code does not switch it on', r.status === 400);
let s = stepNow();
r = await api('/api/2fa/enable', { code: totp(setup.secret, s) }, token);
check('the app\'s code switches it on', r.status === 200 && r.enabled === true, JSON.stringify(r));
r = await login();
check('sign-in now asks for a code (no token without it)', r.twoFactor === true && !r.token, JSON.stringify(r));
r = await login(totp(setup.secret, s));
check('a code already used is refused (no replay)', r.status === 401 && !r.token);
// the sign-in token's user record says two-step is on, and carries no secret
const pulled = await api('/api/sync', { deviceId: 'test-device', since: 0, changes: [] }, token);
const me = (pulled.changes || []).find((c) => c.t === 'users' && c.id === uid)?.rec || {};
check('devices learn two-step is on from the user record, which holds no secret', me.twoFactor === true && !JSON.stringify(pulled).includes(setup.secret), JSON.stringify({ twoFactor: me.twoFactor }));

// ----- in the browser: the sign-in screen asks for the code -----
const b = await puppeteer.launch({ executablePath: CHROME, headless: true });
const P = await (await b.createBrowserContext()).newPage(); await P.setViewport({ width: 1200, height: 860 });
const errors = []; P.on('pageerror', (e) => errors.push(e.message));
await P.goto(base + '/' + slug, { waitUntil: 'networkidle2' }); await wait(800);
await P.type('input[type=email]', 'tess@test.rx'); await P.type('input[type=password]', 'tess-pass-123');
await P.evaluate(() => [...document.querySelectorAll('button')].find((x) => x.textContent.includes('Sign in')).click());
check('the sign-in screen asks for the authenticator code', await until(P, () => !!document.querySelector('input[aria-label="Authenticator code"]')));
await P.screenshot({ path: path.join(out, '1-code-step.png') });
await P.type('input[aria-label="Authenticator code"]', '123456');
await P.evaluate(() => [...document.querySelectorAll('button')].find((x) => /Sign in/.test(x.textContent) && !x.disabled)?.click());
check('a wrong code is refused with a clear message', await until(P, () => /code is not right/.test(document.querySelector('.error')?.innerText || '')));
await P.evaluate(() => { const i = document.querySelector('input[aria-label="Authenticator code"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, ''); i.dispatchEvent(new Event('input', { bubbles: true })); });
await P.type('input[aria-label="Authenticator code"]', totp(setup.secret, s + 1));
await P.evaluate(() => [...document.querySelectorAll('button')].find((x) => /Sign in/.test(x.textContent) && !x.disabled)?.click());
check('the right code signs in', await until(P, () => !!document.querySelector('.sidebar'), 20000));
check('…and this device is remembered for offline sign-in', await P.evaluate((k) => localStorage.getItem(k) === '1', `rxpos-2fa-ok:${tid}:${uid}`));
await wait(1500);
await P.evaluate(() => document.querySelector('button[title^="Two-step sign-in"]')?.click()); await wait(1200);
check('the shield button shows two-step is on, with a way to switch it off', /is on for your account/.test(await P.evaluate(() => document.querySelector('.modal')?.innerText || '')));
await P.screenshot({ path: path.join(out, '2-on.png') });
await b.close();

// ----- administrators see who has it, and can reset it (lost phone) -----
r = await api('/api/2fa/users', null, token);
check('administrators see who has two-step on', Array.isArray(r.enabled) && r.enabled.includes(uid), JSON.stringify(r));
// wrong codes lock the account like wrong passwords
const wrong = [];
for (let i = 0; i < 5; i++) wrong.push((await login('999999')).status);
check('five wrong codes lock sign-in', wrong.slice(0, 4).every((x) => x === 401) && wrong[4] === 429, wrong.join(','));
r = await login(totp(setup.secret, stepNow()));
check('…even the right code waits for the lock', r.status === 429 && !r.token);
r = await api('/api/2fa/reset', { uid }, token);
check('an administrator can switch it off for a person', r.ok === true);
r = await api('/api/2fa', null, token);
check('…and it is off', r.enabled === false);

check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await owner('/tenants/' + tid + '/delete', { confirm: slug });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

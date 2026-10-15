// Owner account & recovery: node owner-auth-test.mjs <base> <masterKey>
import puppeteer from 'puppeteer-core';
import { CHROME } from './chrome.mjs';
const [base, master] = process.argv.slice(2);
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); };
const call = async (path, { body, auth, method } = {}) => {
  const r = await fetch(base + path, { method: method || (body ? 'POST' : 'GET'), redirect: 'manual', headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: 'Bearer ' + auth } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let j = null; try { j = await r.clone().json(); } catch {}
  return [r.status, j, r.headers.get('location')];
};
let [s, j, loc] = await call('/api/owner-auth/config');
check('fresh: no owner password yet', s === 200 && j.password === false && !j.google && !j.github);
[s, j] = await call('/api/owner-auth/login', { body: { password: 'nope-nope-nope' } });
check('wrong key refused', s === 401);
[s, j] = await call('/api/owner-auth/login', { body: { password: master } });
check('master key signs in and asks to set a password', s === 200 && j.token?.startsWith('o.') && j.mustSetPassword === true);
let tok = j.token;
[s] = await call('/api/owner/tenants', { auth: tok });
check('owner session works for the console', s === 200);
[s] = await call('/api/owner/tenants', { auth: 'o.' + 'x'.repeat(40) + '.' + 'y'.repeat(43) });
check('forged session refused', s === 401);
[s, j] = await call('/api/owner/account', { auth: tok, body: { password: 'short' } });
check('owner password must be 10+ characters', s === 400);
[s, j] = await call('/api/owner/account', { auth: tok, body: { password: 'my-own-owner-pass-1' } });
check('owner sets own password', s === 200 && j.hasPassword === true);
[s, j] = await call('/api/owner-auth/config');
check('sign-in page now asks for the password', j.password === true);
[s, j] = await call('/api/owner-auth/login', { body: { password: 'my-own-owner-pass-1' } });
check('owner signs in with own password', s === 200 && j.token && !j.mustSetPassword);
tok = j.token;
[s, j] = await call('/api/owner/account', { auth: tok, body: { password: 'another-pass-22', current: 'wrong-current' } });
check('changing password needs the current one', s === 400);
[s, j] = await call('/api/owner/account', { auth: tok, body: { password: 'another-pass-22', current: 'my-own-owner-pass-1' } });
check('password changed', s === 200);
[s] = await call('/api/owner-auth/login', { body: { password: 'my-own-owner-pass-1' } });
check('old password no longer works', s === 401);
[s, j] = await call('/api/owner-auth/login', { body: { password: master } });
check('master key still works as emergency key', s === 200);

// recovery providers
[s, j, loc] = await call('/api/owner-auth/github/start');
check('GitHub sign-in off until set up (friendly redirect)', s === 302 && /oerr=/.test(loc));
[s, j] = await call('/api/owner/account', { auth: tok, body: { googleEmail: 'Owner@Gmail.com', googleClientId: 'test-client.apps.googleusercontent.com', githubLogin: 'DeeJayKyle', githubClientId: 'gh-client-id', githubClientSecret: 'gh-secret' } });
check('owner links Google and GitHub accounts', s === 200 && j.googleEmail === 'Owner@Gmail.com' && j.githubSecretSet && !('githubClientSecret' in j));
[s, j] = await call('/api/owner-auth/config');
check('sign-in page offers Google and GitHub', j.google?.clientId === 'test-client.apps.googleusercontent.com' && j.github === true);
[s, j, loc] = await call('/api/owner-auth/github/start');
check('GitHub sign-in sends to github.com with the callback', s === 302 && /^https:\/\/github\.com\/login\/oauth\/authorize\?/.test(loc) && /client_id=gh-client-id/.test(loc) && /owner-auth%2Fgithub%2Fcallback/.test(loc));
[s, j, loc] = await call('/api/owner-auth/github/callback?code=abc&state=forged.state');
check('GitHub callback with a forged state is refused', s === 302 && /oerr=/.test(loc));
[s, j] = await call('/api/owner-auth/google', { body: { credential: 'a.b.c' } });
check('fake Google token refused', s === 401);

// lockout
for (let i = 0; i < 5; i++) [s] = await call('/api/owner-auth/login', { body: { password: 'bad-guess-' + i } });
check('5 wrong passwords lock owner sign-in', s === 429);
[s] = await call('/api/owner-auth/login', { body: { password: 'another-pass-22' } });
check('…even the right password waits out the lock (use Google/GitHub)', s === 429);
[s] = await call('/api/owner-auth/login', { body: { password: master } });
check('…but the master key still works during the lock', s === 200);

// UI
const b = await puppeteer.launch({ executablePath: CHROME, headless: true });
const p = await b.newPage(); await p.setViewport({ width: 1280, height: 860 });
const errors = []; p.on('pageerror', (e) => errors.push(e.message));
await p.goto(base + '/#/owner', { waitUntil: 'domcontentloaded' }); await new Promise((r) => setTimeout(r, 3000));
const t = await p.evaluate(() => document.body.innerText);
check('sign-in page shows password, Google and GitHub options', /Owner password/.test(t) && /Continue with GitHub/.test(t) && !!(await p.$('.google-btn')) && /Forgot the password/.test(t));
await p.screenshot({ path: 'owner-signin.png' });
await p.goto('about:blank'); await p.goto(base + '/#/owner?oerr=GitHub%20user%20x%20is%20not%20the%20owner', { waitUntil: 'domcontentloaded' }); await new Promise((r) => setTimeout(r, 2500));
check('GitHub errors are shown on the sign-in page', /is not the owner/.test(await p.evaluate(() => document.body.innerText)));
await p.goto('about:blank'); await p.goto(base + '/#/owner?ot=' + encodeURIComponent(tok), { waitUntil: 'domcontentloaded' }); await new Promise((r) => setTimeout(r, 3000));
check('returning from GitHub with a session opens the console', /Client pharmacies/.test(await p.evaluate(() => document.body.innerText)) && !p.url().includes('ot='));
await p.evaluate(() => [...document.querySelectorAll('button')].find((x) => x.textContent.includes('Owner account')).click()); await new Promise((r) => setTimeout(r, 1200));
const m = await p.evaluate(() => document.querySelector('.modal')?.innerText || '');
check('Owner account panel: password, Google, GitHub', /Change your owner password/.test(m) && /Sign in with Google/.test(m) && /Sign in with GitHub/.test(m));
await p.screenshot({ path: 'owner-account.png' });
console.log(`\nerrors: ${errors.length ? errors.slice(0, 3).join(' | ') : 'none'}`);
console.log(`${pass} passed, ${fail} failed`);
await b.close();

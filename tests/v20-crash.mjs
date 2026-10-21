// Private crash reports (src/crash.js → /api/errors → owner console): an error on a device reaches the owner,
// without personal data, grouped and counted; only the owner can read them.
//   node v20-crash.mjs <base> <ownerKey> <outDir>
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import { CHROME } from './chrome.mjs';
const [base, ownerKey, out] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + String(x).slice(0, 200) : ''}`); };
const owner = (p, body) => fetch(base + '/api/owner' + p, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ownerKey }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());
const api = (p, body, token) => fetch(base + p, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined }).then(async (r) => ({ status: r.status, ...(await r.json().catch(() => ({}))) }));

const t = await owner('/tenants', { name: 'Crash Test Pharmacy', admin: { name: 'Cleo Admin', email: 'cleo@test.rx', password: 'cleo-pass-123' } });
const slug = t.tenant.slug, tid = t.tenant.id;
const b = await puppeteer.launch({ executablePath: CHROME, headless: true });
const P = await (await b.createBrowserContext()).newPage();
await P.goto(base + '/' + slug, { waitUntil: 'networkidle2' }); await wait(800);
await P.type('input[type=email]', 'cleo@test.rx'); await P.type('input[type=password]', 'cleo-pass-123');
await P.evaluate(() => [...document.querySelectorAll('button')].find((x) => x.textContent.includes('Sign in')).click());
await P.waitForSelector('.sidebar', { timeout: 20000 }); await wait(2500);
// an error in the app, carrying a phone number and an email that must not be sent
await P.evaluate(() => { const sc = document.createElement('script'); sc.textContent = "setTimeout(function(){ throw new Error('Test crash for 0772123456 jane@example.com'); }, 0)"; document.head.appendChild(sc); }); // from a script of the page itself (not a cross-origin 'Script error.')
await wait(2500);
let r = await owner('/tenants/' + tid + '/errors');
const e = (r.errors || []).find((x) => /Test crash/.test(x.message));
check('an error on a device reaches the owner console', !!e, JSON.stringify(r).slice(0, 200));
check('…with the page, device type and app build', e && e.page && e.platform === 'Browser' && e.build > 0, JSON.stringify(e || {}).slice(0, 200));
check('…and without the phone number or email', e && !/0772123456|jane@example\.com/.test(e.message + e.stack) && /\[n\]/.test(e.message) && /\[email\]/.test(e.message), e?.message);
// the same error again from the same device the same day is not sent again
await P.evaluate(() => { const sc = document.createElement('script'); sc.textContent = "setTimeout(function(){ throw new Error('Test crash for 0772123456 jane@example.com'); }, 0)"; document.head.appendChild(sc); }); // from a script of the page itself (not a cross-origin 'Script error.')
await wait(2000);
r = await owner('/tenants/' + tid + '/errors');
check('the same error is sent once a day per device', (r.errors || []).find((x) => /Test crash/.test(x.message))?.count === 1);
await b.close();
// another device reporting it adds to the count instead of a new row
const tok = (await api('/api/login', { email: 'cleo@test.rx', password: 'cleo-pass-123', tenant: slug })).token;
await api('/api/errors', { errors: [{ key: e.k, message: e.message, stack: '', page: '/', build: 1, platform: 'Android app', kind: 'error' }] }, tok);
r = await owner('/tenants/' + tid + '/errors');
const again = (r.errors || []).filter((x) => /Test crash/.test(x.message));
check('the same error from another device is counted on the same row', again.length === 1 && again[0].count === 2, JSON.stringify(again.map((x) => x.count)));
r = await api('/api/owner/tenants/' + tid + '/errors', null, tok);
check('pharmacy staff cannot read the crash reports (owner only)', r.status === 401 || r.status === 403, r.status);
r = await api('/api/errors', { errors: [{ key: 'x', message: 'nope' }] });
check('reports need a signed-in device', r.status === 401, r.status);
await owner('/tenants/' + tid + '/errors', { clear: true, k: e.k });
r = await owner('/tenants/' + tid + '/errors');
check('"Fixed" removes it from the list', !(r.errors || []).some((x) => /Test crash/.test(x.message)));
// ----- "Remember me" on the sign-in screen -----
{
  const b2 = await puppeteer.launch({ executablePath: CHROME, headless: true });
  const ctx = await b2.createBrowserContext();
  const signIn = async (remember) => {
    const p = await ctx.newPage();
    await p.goto(base + '/' + slug, { waitUntil: 'networkidle2' }); await wait(800);
    await p.evaluate(() => { const i = document.querySelector('input[type=email]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, ''); i.dispatchEvent(new Event('input', { bubbles: true })); });
    await p.type('input[type=email]', 'cleo@test.rx'); await p.type('input[type=password]', 'cleo-pass-123');
    const box = await p.$('.remember-row input[type=checkbox]');
    if ((await box.evaluate((x) => x.checked)) !== remember) await box.click();
    await p.evaluate(() => [...document.querySelectorAll('button')].find((x) => x.textContent.includes('Sign in')).click());
    await p.waitForSelector('.sidebar', { timeout: 20000 }); await wait(800);
    return p;
  };
  // "closing the app": a new tab has a fresh session, like reopening the browser or the Windows / Android app
  const reopen = async () => { const p = await ctx.newPage(); await p.goto(base + '/' + slug, { waitUntil: 'networkidle2' }); await wait(1500); const inside = await p.evaluate(() => !!document.querySelector('.sidebar')); return { p, inside }; };
  let p1 = await signIn(false); await p1.close();
  let r1 = await reopen();
  check('without "Remember me", reopening the app asks to sign in again', !r1.inside);
  await r1.p.close();
  p1 = await signIn(true); await p1.close();
  r1 = await reopen();
  check('with "Remember me", reopening the app is still signed in', r1.inside);
    await r1.p.evaluate(() => document.querySelector('button[title="Log out"]').click()); await wait(800);
  await r1.p.close();
  const r2 = await reopen();
  check('signing out forgets the device', !r2.inside);
  check('…and the box is still ticked from last time', await r2.p.evaluate(() => document.querySelector('.remember-row input[type=checkbox]')?.checked === true));
  await b2.close();
}
await owner('/tenants/' + tid + '/delete', { confirm: slug });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

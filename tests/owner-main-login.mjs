// The owner signs in on the main page with the owner email + owner password and lands in the owner console.
//   node tests/owner-main-login.mjs <base> <ownerKey> <outDir>
import puppeteer from 'puppeteer-core';
import { CHROME } from './chrome.mjs';
import fs from 'node:fs';
import path from 'node:path';
const [base, ownerKey, out = '.output/owner-main'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + String(x).slice(0, 200) : ''}`); };
const owner = (p, body, key = ownerKey) => fetch(base + '/api/owner' + p, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());
const login = (body) => fetch(base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, ...(await r.json()) }));

// owner password + owner email; a pharmacy where the same person is staff
let j = await owner('/account', { password: 'owner-pass-12345', current: ownerKey }); // the master key counts as the current password
j = await owner('/account', { email: 'Boss@Test.RX' });
check('owner email can be set (stored in lower case)', j.email === 'boss@test.rx', JSON.stringify(j).slice(0, 120));
const t = (await owner('/tenants', { name: 'Kansanga Test Pharmacy', slug: 'kansanga', admin: { name: 'Boss Person', email: 'boss@test.rx', password: 'staff-pass-123' } })).tenant;

let r = await login({ email: 'boss@test.rx', password: 'owner-pass-12345' });
check('owner email + owner password on the main page → owner console', r.status === 200 && r.owner?.token?.startsWith('o.'), JSON.stringify(r).slice(0, 120));
const list = await owner('/tenants', null, r.owner?.token);
check('…and that owner session manages the pharmacies', Array.isArray(list.tenants) && list.tenants.some((x) => x.id === t.id));
r = await login({ email: 'boss@test.rx', password: 'staff-pass-123' });
check('same email + their pharmacy password → their pharmacy, as before', r.status === 200 && r.token && r.tenant === t.id && !r.owner);
r = await login({ email: 'boss@test.rx', password: 'owner-pass-12345', tenant: 'kansanga' });
check('on a pharmacy\'s own address the owner password does not open the owner console', r.status === 401 && !r.owner && !r.ownerToken);

// same password for both → a choice
await owner('/tenants/' + t.id + '/users', { user: { id: (await owner('/tenants/' + t.id)).users?.find?.((u) => u.email === 'boss@test.rx')?.id, email: 'boss@test.rx', password: 'owner-pass-12345' } });
r = await login({ email: 'boss@test.rx', password: 'owner-pass-12345' });
check('when both passwords are the same: choose the pharmacy or the owner console', Array.isArray(r.choose) && r.choose.map((c) => c.code).join(',') === 'kansanga,__owner__' && r.ownerToken?.startsWith('o.'), JSON.stringify(r).slice(0, 160));

// in the browser: main page → owner console; the link no longer says "console"
const b = await puppeteer.launch({ executablePath: CHROME, headless: true });
const p = await (await b.createBrowserContext()).newPage(); await p.setViewport({ width: 1366, height: 820 });
const errors = []; p.on('pageerror', (e) => errors.push(e.message));
await owner('/tenants/' + t.id + '/users', { user: { id: (await owner('/tenants/' + t.id)).users?.find?.((u) => u.email === 'boss@test.rx')?.id, email: 'boss@test.rx', password: 'staff-pass-123' } });
await p.goto(base + '/', { waitUntil: 'networkidle2' }); await wait(800);
const footer = await p.evaluate(() => document.querySelector('.auth-hero small')?.innerText || '');
check('front page has no owner link (owners sign in with the normal form)', !/owner|console/i.test(footer) && !(await p.$('a[href="#/owner"]')), footer);
await p.type('input[autocomplete=username]', 'boss@test.rx'); await p.type('input[type=password]', 'owner-pass-12345');
await p.evaluate(() => [...document.querySelectorAll('button')].find((x) => x.textContent.includes('Sign in')).click());
let ok = false; for (let i = 0; i < 40 && !ok; i++) { await wait(300); ok = await p.evaluate(() => location.hash.startsWith('#/owner') && /Kansanga Test Pharmacy/.test(document.body.innerText)); }
check('signing in on the main page with the owner details opens the owner console', ok, await p.evaluate(() => location.href + ' ' + document.body.innerText.slice(0, 80)));
await p.screenshot({ path: path.join(out, 'owner-from-main.png') });
check('no page errors', !errors.length, errors.join(' | '));
await b.close();

// a locked staff account doesn't keep the owner out; wrong owner passwords lock the owner sign-in
for (let i = 0; i < 5; i++) await login({ email: 'boss@test.rx', password: 'staff-wrong-' + i, tenant: 'kansanga' });
r = await login({ email: 'boss@test.rx', password: 'owner-pass-12345' });
check('staff account locked, owner password still opens the owner console', r.status === 200 && r.owner?.token, JSON.stringify(r).slice(0, 120));
for (let i = 0; i < 5; i++) await login({ email: 'boss@test.rx', password: 'totally-wrong-' + i });
r = await login({ email: 'boss@test.rx', password: 'owner-pass-12345' });
check('5 wrong passwords on the main page lock the owner sign-in for a while', r.status === 429 && !r.owner, JSON.stringify(r).slice(0, 120));
const master = await fetch(base + '/api/owner-auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: ownerKey }) }).then((x) => x.json());
check('the master key still gets in during a lock', master.token?.startsWith('o.'));

await owner('/tenants/' + t.id + '/delete', { confirm: 'kansanga' });
await owner('/account', { email: '' });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

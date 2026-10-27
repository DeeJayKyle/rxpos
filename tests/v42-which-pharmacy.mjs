// Signing in on a device that already holds a pharmacy (1.7), as the Windows app (tests/appmode.mjs), fictional data:
// the cloud decides which pharmacy from the email and password. Someone at one pharmacy goes straight in, also when the
// device holds another (after a confirm, the device switches and downloads only that pharmacy); someone at several is
// asked "Which pharmacy?" with this device's marked; cancelling the switch changes nothing.
//   node v42-which-pharmacy.mjs <base> <ownerKey> <outDir>
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import { CHROME } from './chrome.mjs';
import { asDesktopApp, APP_ARGS } from './appmode.mjs';
const [base, ownerKey, out] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + String(x).slice(0, 240) : ''}`); };
const owner = (p, body) => fetch(base + '/api/owner' + p, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ownerKey }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());
const until = async (p, fn, ms = 20000, arg) => { const end = Date.now() + ms; while (Date.now() < end) { if (await p.evaluate(fn, arg).catch(() => false)) return true; await wait(300); } return false; };

for (const x of (await owner('/tenants')).tenants || []) if (/^(North|South) Sample Pharmacy$/.test(x.name)) await owner('/tenants/' + x.id + '/delete', { confirm: x.slug });
const A = await owner('/tenants', { name: 'North Sample Pharmacy', admin: { name: 'Pat Both', email: 'pat@test.rx', password: 'pat-pass-1234' } });
const B = await owner('/tenants', { name: 'South Sample Pharmacy', admin: { name: 'Sky Admin', email: 'sky@test.rx', password: 'sky-pass-1234' } });
await owner('/tenants/' + B.tenant.id + '/users', { user: { name: 'Pat Both', email: 'pat@test.rx', role: 'manager', password: 'pat-pass-1234' } });
await owner('/tenants/' + B.tenant.id + '/users', { user: { name: 'Quinn South', email: 'quinn@test.rx', role: 'cashier', password: 'quinn-pass-123' } });
await owner('/tenants/' + A.tenant.id + '/records', { records: [{ t: 'products', id: 'pa', rec: { name: 'North Only Tabs', generic: 'Northamol', form: 'Tablets', unit: 'Tablet', price: 500, cost: 300, reorder: 0 } }] });
await owner('/tenants/' + B.tenant.id + '/records', { records: [{ t: 'products', id: 'pb', rec: { name: 'South Only Syrup', generic: 'Southamol', form: 'Syrups', unit: 'Bottle', price: 900, cost: 500, reorder: 0 } }] });
for (const t of [A, B]) await owner('/tenants/' + t.tenant.id, { features: { catalog: false, weather: false, promos: false } });

const b = await puppeteer.launch({ executablePath: CHROME, headless: true, args: APP_ARGS });
const ctx = await b.createBrowserContext();
const p = await ctx.newPage(); await p.setViewport({ width: 1280, height: 860 });
await asDesktopApp(p, base);
await p.goto(base + '/', { waitUntil: 'networkidle2' }); await wait(600);
const fill = async (email, pw) => {
  await p.waitForSelector('input[type=password]', { timeout: 20000 });
  await p.evaluate((e, w) => { const set = (sel, v) => { const i = document.querySelector(sel); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, v); i.dispatchEvent(new Event('input', { bubbles: true })); }; set('input[autocomplete=username]', e); set('input[type=password]', w); }, email, pw);
  await p.evaluate(() => [...document.querySelectorAll('form button')].find((x) => /^Sign in/.test(x.textContent.trim()))?.click());
  await wait(1200);
};
const pick = (name) => p.evaluate((n) => { const b = [...document.querySelectorAll('.pharmacy-choice')].find((x) => x.innerText.includes(n)); b?.click(); return !!b; }, name);
const dialog = (re) => p.evaluate((src) => { const b = [...document.querySelectorAll('.modal button, .dialog button')].find((x) => new RegExp(src).test(x.textContent.trim())); b?.click(); return !!b; }, re.source);
const device = () => p.evaluate(() => new Promise((res) => { const q = indexedDB.open('pharmapos'); q.onsuccess = () => { const g = q.result.transaction('kv').objectStore('kv').get('sync'); g.onsuccess = () => { res(g.result?.slug || ''); q.result.close(); }; }; q.onerror = () => res(''); }));
const signOut = async () => { await p.evaluate(() => document.querySelector('button[title="Log out"]')?.click()); await wait(800); await dialog(/^Sign out/); await p.waitForSelector('input[type=password]', { timeout: 15000 }); await wait(500); };
const products = async () => { await p.evaluate(() => { location.hash = '#/pos'; }); await wait(1500); return p.evaluate(() => document.querySelector('.product-grid')?.innerText || ''); }; // the till: every role has it

// 1. someone at two pharmacies on a new device: asked which one
await fill('pat@test.rx', 'pat-pass-1234');
check('someone at two pharmacies is asked "Which pharmacy?"', await until(p, () => document.querySelectorAll('.pharmacy-choice').length === 2 && /Which pharmacy/.test(document.body.innerText), 10000));
await pick('North Sample Pharmacy');
check('…and gets the pharmacy they picked', await until(p, () => !!document.querySelector('.sidebar'), 25000) && (await device()) === A.tenant.slug, await device());
await wait(2500);
check('…with only that pharmacy\'s data', /North Only Tabs/.test(await products()) && !/South Only Syrup/.test(await products()));
await signOut();

// 2. someone at one pharmacy, on a device that holds another: no wrong-password error; a confirm, then that pharmacy
check('the sign-in card shows which pharmacy the device holds', /this device: North Sample Pharmacy/.test(await p.evaluate(() => document.body.innerText)));
await fill('quinn@test.rx', 'quinn-pass-123');
check('someone from another pharmacy is not refused as a wrong password', !/Wrong email or password/i.test(await p.evaluate(() => document.body.innerText)));
check('…switching this device is asked first', await until(p, () => /Switch this device to South Sample Pharmacy/.test(document.body.innerText), 10000));
await dialog(/^Switch to/);
check('…then the device holds their pharmacy', await until(p, () => !!document.querySelector('.sidebar'), 25000) && (await device()) === B.tenant.slug, await device());
await wait(2500);
const south = await products();
check('…with only that pharmacy\'s data (nothing from the other one)', /South Only Syrup/.test(south) && !/North Only Tabs/.test(south), south.slice(0, 200));
await signOut();

// 3. someone at both, on a device holding South: asked, this device marked; cancelling the switch changes nothing
await fill('pat@test.rx', 'pat-pass-1234');
check('asked again, with the pharmacy on this device marked', await until(p, () => [...document.querySelectorAll('.pharmacy-choice')].some((x) => /this device/.test(x.innerText) && /South Sample/.test(x.innerText)), 10000));
await pick('North Sample Pharmacy');
check('picking the other pharmacy asks before switching', await until(p, () => /Switch this device to North Sample Pharmacy/.test(document.body.innerText), 10000));
await dialog(/^Cancel$/); await wait(800);
check('…cancel keeps the device on its pharmacy and nobody is signed in', (await device()) === B.tenant.slug && !(await p.evaluate(() => !!document.querySelector('.sidebar'))), await device());
await p.evaluate(() => [...document.querySelectorAll('button')].find((x) => /^Back$/.test(x.textContent.trim()))?.click()); await wait(300);
await fill('pat@test.rx', 'pat-pass-1234');
await pick('South Sample Pharmacy');
check('picking the pharmacy already on the device signs straight in (no switch)', await until(p, () => !!document.querySelector('.sidebar'), 20000) && (await device()) === B.tenant.slug);

await b.close();
for (const t of [A, B]) await owner('/tenants/' + t.tenant.id + '/delete', { confirm: t.tenant.slug });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

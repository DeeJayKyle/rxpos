// Device-bound offline sign-in and quick PIN (security review 0.2), driven through the real sign-in UI.
// Seeds the pharmacy through the owner API (fast and reliable), then uses only the login screen.
//   node v28-pin.mjs <base> <ownerKey> <outDir>
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import { CHROME } from './chrome.mjs';
const [base, ownerKey, out] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + String(x).slice(0, 160) : ''}`); };
const owner = (p, body) => fetch(base + '/api/owner' + p, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ownerKey }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());
const until = async (p, fn, ms = 10000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await p.evaluate(fn).catch(() => false)) return true; await wait(400); } return false; };
const clickSignIn = (p) => p.evaluate(() => { const el = [...document.querySelectorAll('form button')].find((x) => /^(Sign in|Signing in|Checking)/.test(x.textContent.trim())); el?.click(); return !!el; });
const confirmDialog = (p) => p.evaluate(() => [...document.querySelectorAll('.modal.dialog .form-actions button')].find((x) => !x.classList.contains('ghost'))?.click());
const logout = async (p) => { await p.evaluate(() => document.querySelector('button[title="Log out"]')?.click()); await wait(1000); };
// Set a React-controlled input reliably (native value setter + input event), like idle-fit.mjs does.
const setVal = (p, sel, val) => p.evaluate((sel, val) => { const i = document.querySelector(sel); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, val); i.dispatchEvent(new Event('input', { bubbles: true })); }, sel, val);

const t = await owner('/tenants', { name: 'Pin Pharmacy', admin: { name: 'Al Admin', email: 'al@test.rx', password: 'al-pass-1234' } });
const slug = t.tenant.slug, tid = t.tenant.id;
const b = await puppeteer.launch({ executablePath: CHROME, headless: true });
const P = await (await b.createBrowserContext()).newPage();
await P.setViewport({ width: 1280, height: 860 });

// ----- online password sign-in: the device remembers the password for offline use -----
await P.goto(base + '/' + slug, { waitUntil: 'networkidle2' }); await wait(700);
await setVal(P, 'input[autocomplete=username]', 'al@test.rx');
await setVal(P, 'input[type=password]', 'al-pass-1234');
await clickSignIn(P);
check('online password sign-in works', await until(P, () => !!document.querySelector('.sidebar'), 20000));
await wait(1200);
const remembered = await P.evaluate(() => { try { return Object.values(JSON.parse(localStorage.getItem('rxpos-offline-v1') || '{}')).some((e) => e.pw); } catch { return false; } });
check('0.2 the device stored an offline verifier on sign-in', remembered);

// ----- set a quick PIN from the profile -----
await P.click('button[title="Set a quick PIN for this device"]'); await wait(500);
await P.type('.modal.dialog input', '2468'); await confirmDialog(P); await wait(500);
await P.type('.modal.dialog input', '2468'); await confirmDialog(P); await wait(700);
const pinStored = await P.evaluate(() => { try { return Object.values(JSON.parse(localStorage.getItem('rxpos-offline-v1') || '{}')).some((e) => e.pin); } catch { return false; } });
check('0.2 a device PIN can be set from the profile', pinStored);
await P.screenshot({ path: out + '/01-pin-set.png' });

// ----- offline password sign-in via the device verifier -----
await logout(P);
await P.setOfflineMode(true);
await setVal(P, 'input[autocomplete=username]', 'al@test.rx');
await setVal(P, 'input[type=password]', 'al-pass-1234');
await clickSignIn(P);
check('0.2 offline password sign-in works via the device verifier', await until(P, () => !!document.querySelector('.sidebar'), 12000));

// ----- offline PIN sign-in -----
await logout(P);
await setVal(P, 'input[autocomplete=username]', 'al@test.rx'); await wait(400);
const pinBtn = await P.evaluate(() => { const el = [...document.querySelectorAll('button')].find((x) => /Use the PIN for this device/.test(x.textContent)); el?.click(); return !!el; });
check('0.2 the PIN option appears for a device that has a PIN', pinBtn); await wait(400);
await setVal(P, 'input[aria-label="Device PIN"]', '0000'); await clickSignIn(P); await wait(600);
check('a wrong PIN is rejected with tries remaining', await P.evaluate(() => /Wrong PIN/.test(document.body.innerText)));
await setVal(P, 'input[aria-label="Device PIN"]', '2468'); await clickSignIn(P);
check('0.2 the correct PIN signs in offline', await until(P, () => !!document.querySelector('.sidebar'), 12000));
await P.screenshot({ path: out + '/02-pin-signin.png' });
await P.setOfflineMode(false);

await b.close();
await owner('/tenants/' + tid + '/delete', { confirm: slug });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

// Switchable surface styles (glassmorphism, claymorphism, skeuomorphism, neumorphism). Each one applies a
// data-surface attribute, persists across a reload, and actually changes the rendered CSS.
//   node v32-surface.mjs <base> <ownerKey> <outDir>
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import { CHROME } from './chrome.mjs';
const [base, ownerKey, out] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + String(x).slice(0, 140) : ''}`); };
const owner = (p, body) => fetch(base + '/api/owner' + p, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ownerKey }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());
const setVal = (p, sel, val) => p.evaluate((sel, val) => { const i = document.querySelector(sel); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, val); i.dispatchEvent(new Event('input', { bubbles: true })); }, sel, val);
const clickSignIn = (p) => p.evaluate(() => [...document.querySelectorAll('form button')].find((x) => /^Sign in/.test(x.textContent.trim()))?.click());
const surfaceAttr = (p) => p.evaluate(() => document.documentElement.getAttribute('data-surface'));
const pillShadow = (p) => p.evaluate(() => { const el = document.querySelector('.pill'); return el ? getComputedStyle(el).boxShadow : ''; });
const openMenu = (p) => p.evaluate(() => document.querySelector('button[title="Theme"]')?.click());
const pickStyle = (p, name) => p.evaluate((name) => { const b = [...document.querySelectorAll('.theme-menu .style-item')].find((x) => x.textContent.includes(name)); b?.click(); return !!b; }, name);

const STYLES = [['Glassmorphism', 'glass'], ['Claymorphism', 'clay'], ['Skeuomorphism', 'skeuomorphism'], ['Neumorphism', 'neumorphism']];

const t = await owner('/tenants', { name: 'Style Pharmacy', admin: { name: 'Stella', email: 'stella@test.rx', password: 'stella-pass-12' } });
const slug = t.tenant.slug, tid = t.tenant.id;
const b = await puppeteer.launch({ executablePath: CHROME, headless: true });
const p = await (await b.createBrowserContext()).newPage();
await p.setViewport({ width: 1280, height: 860 });
await p.goto(base + '/' + slug, { waitUntil: 'networkidle2' }); await wait(700);
await setVal(p, 'input[autocomplete=username]', 'stella@test.rx');
await setVal(p, 'input[type=password]', 'stella-pass-12');
await clickSignIn(p);
await p.waitForSelector('.sidebar', { timeout: 20000 }); await wait(1200);

check('default surface style is flat', (await surfaceAttr(p)) === 'flat' || (await surfaceAttr(p)) === null, String(await surfaceAttr(p)));
const flatShadow = await pillShadow(p);

for (const [name, id] of STYLES) {
  await openMenu(p); await wait(250);
  const clicked = await pickStyle(p, name); await wait(400);
  check(`${name}: option exists and is selectable`, clicked);
  check(`${name}: sets data-surface="${id}"`, (await surfaceAttr(p)) === id, String(await surfaceAttr(p)));
  check(`${name}: is remembered in localStorage`, (await p.evaluate(() => localStorage.getItem('rxpos-surface-style'))) === id);
  const shadow = await pillShadow(p);
  check(`${name}: actually restyles a surface (box-shadow changed from flat)`, !!shadow && shadow !== 'none' && shadow !== flatShadow, shadow);
  await p.screenshot({ path: `${out}/${id}.png` });
}

// persists across a reload (applied before first paint)
await p.goto(base + '/' + slug + '#/', { waitUntil: 'networkidle2' }); await wait(1200);
check('the chosen style survives a reload', (await surfaceAttr(p)) === 'neumorphism', String(await surfaceAttr(p)));

// can switch back to flat
await openMenu(p); await wait(250);
await pickStyle(p, 'Flat'); await wait(300);
check('can switch back to flat', (await surfaceAttr(p)) === 'flat', String(await surfaceAttr(p)));

await b.close();
await owner('/tenants/' + tid + '/delete', { confirm: slug });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

// The web version shows the pharmacy's own details even when its first download is slow (fictional data).
// On 27 Oct 2026 rxposug.com showed "My Pharmacy" and "2 changes were refused by the cloud": the weekly automatic
// reorder levels ran 20 s after opening, before the large pharmacy had finished downloading, and stamped the blank
// default settings as newer than the pharmacy's; the cloud (rightly) refused those defaults.
//   node v45-web-settings.mjs <base> <ownerKey>
import puppeteer from 'puppeteer-core';
import { CHROME } from './chrome.mjs';
const [base, ownerKey] = process.argv.slice(2);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + String(x).slice(0, 240) : ''}`); };
const owner = (p, body) => fetch(base + '/api/owner' + p, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ownerKey }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());

for (const x of (await owner('/tenants')).tenants || []) if (x.name === 'Kibuye Sample Pharmacy') await owner('/tenants/' + x.id + '/delete', { confirm: x.slug });
const T = await owner('/tenants', { name: 'Kibuye Sample Pharmacy', admin: { name: 'Kay Admin', email: 'kay@test.rx', password: 'kay-pass-1234' } });
await owner('/tenants/' + T.tenant.id, { features: { catalog: false, weather: false, promos: false }, settings: { phone: '0700 000 111', address: 'Plot 1 Sample Road' } });

const b = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
const p = await (await b.createBrowserContext()).newPage(); await p.setViewport({ width: 1280, height: 860 });
// the first download after signing in takes 25 s, like a pharmacy with 50,000 records on a slow line
await p.setRequestInterception(true);
let slowed = false;
p.on('request', async (r) => {
  if (!slowed && r.method() === 'POST' && r.url().endsWith('/api/sync')) { slowed = true; await wait(25000); }
  r.continue().catch(() => {});
});
await p.goto(base + '/' + T.tenant.slug, { waitUntil: 'networkidle2' }); await wait(600);
await p.waitForSelector('input[type=password]', { timeout: 20000 });
await p.evaluate(() => { const set = (sel, v) => { const i = document.querySelector(sel); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, v); i.dispatchEvent(new Event('input', { bubbles: true })); }; set('input[autocomplete=username]', 'kay@test.rx'); set('input[type=password]', 'kay-pass-1234'); });
await p.evaluate(() => [...document.querySelectorAll('form button')].find((x) => /^Sign in/.test(x.textContent.trim()))?.click());
await p.waitForSelector('.sidebar', { timeout: 30000 }).catch(() => {});
await wait(40000); // past the 25 s download and the 20 s automatic reorder
const text = await p.evaluate(() => document.body.innerText);
check('the web shows the pharmacy\'s own name, not "My Pharmacy"', /Kibuye Sample Pharmacy/.test(await p.evaluate(() => document.querySelector('.sidebar')?.innerText || '')) && !/My Pharmacy/.test(text));
check('the top bar does not say Needs attention', !/Needs attention/.test(text));
await p.evaluate(() => { location.hash = '#/device'; }); await wait(1500);
check('no changes refused by the cloud', !/refused by the cloud/.test(await p.evaluate(() => document.body.innerText)));
await p.evaluate(() => { location.hash = '#/settings'; }); await wait(1500);
check('Settings shows the Owner\'s phone number', await p.evaluate(() => [...document.querySelectorAll('input')].some((i) => i.value === '0700 000 111')));

await b.close();
await owner('/tenants/' + T.tenant.id + '/delete', { confirm: T.tenant.slug });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

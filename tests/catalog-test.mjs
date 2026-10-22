// Shared catalog: node catalog-test.mjs <base> <ownerKey>
import puppeteer from 'puppeteer-core';
import { CHROME } from './chrome.mjs';
const [base, ownerKey] = process.argv.slice(2);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); };
const owner = (p, body) => fetch(base + '/api/owner' + p, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ownerKey }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());
const stored = async (slug) => (await owner('/tenants/' + slug)).tables.reduce((a, t) => a + t.n, 0);

const t = await owner('/tenants', { name: 'Catalog Test', admin: { name: 'Kat', email: 'kat@test.rx', password: 'kat-pass-123' } });
const slug = t.tenant.slug;
const n0 = await stored(slug);
check('new pharmacy costs only a handful of records (no catalog copy)', n0 < 10, `${n0} records`);

const b = await puppeteer.launch({ executablePath: CHROME, headless: true });
const errors = [];
const signIn = async () => {
  const ctx = await b.createBrowserContext();
  const p = await ctx.newPage(); await p.setViewport({ width: 1366, height: 860 });
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(base + '/' + slug, { waitUntil: 'networkidle2' }); await wait(1200);
  await p.type('input[autocomplete=username]', 'kat@test.rx'); await p.type('input[type=password]', 'kat-pass-123');
  await p.evaluate(() => [...document.querySelectorAll('button')].find((x) => x.textContent.includes('Sign in')).click());
  await wait(5000);
  return p;
};
const p = await signIn();
await p.goto(base + '/' + slug + '#/pos', { waitUntil: 'networkidle2' }); await wait(1200);
await p.type('.pos-search input, input.search', 'ORNIDAZOLE'); await wait(600);
check('built-in catalog medicines are on the device', await p.evaluate(() => /02-LON/.test(document.body.innerText)));
await wait(4000);
const n1 = await stored(slug);
check('signing in uploads no catalog (only the automatic 6-hourly weather log)', n1 - n0 < 15, `${n1} records stored`);

// delete a catalog medicine on device A
await p.goto(base + '/' + slug + '#/medicines', { waitUntil: 'networkidle2' }); await wait(1500);
await p.type('.page-head input, input[type=search], .search input', '02-LON'); await wait(800);
const deleted = await p.evaluate(() => { const row = [...document.querySelectorAll('tbody tr')].find((r) => r.innerText.includes('02-LON')); const btn = row && [...row.querySelectorAll('button')].find((x) => /delete/i.test(x.title || x.textContent) || x.className.includes('danger')); btn?.click(); return !!btn; });
await wait(400);
await p.evaluate(() => document.querySelector('.dialog .btn.danger-solid, .dialog .btn.primary')?.click());
await wait(5000);
check('catalog medicine deleted on device A', deleted && !(await p.evaluate(() => [...document.querySelectorAll('tbody tr')].some((r) => r.querySelectorAll('td').length > 2 && r.innerText.includes('02-LON')))));
const hiddenRecs = (await owner(`/tenants/${slug}/records?t=catalogHidden`)).total;
check('the removal is synced as one small record', hiddenRecs === 1, `${hiddenRecs}`);

// device B sees it removed
const q = await signIn();
await q.goto(base + '/' + slug + '#/pos', { waitUntil: 'networkidle2' }); await wait(1200);
await q.type('.pos-search input, input.search', '02-LON'); await wait(600);
check('another device does not show the removed medicine', !(await q.evaluate(() => [...document.querySelectorAll('.product')].some((x) => x.innerText.includes('02-LON')))));

// owner switches the catalog off
await owner('/tenants/' + slug, { features: { catalog: false } });
await q.goto(base + '/' + slug + '#/medicines', { waitUntil: 'networkidle2' });
let off = false;
for (let i = 0; i < 30 && !off; i++) { await wait(1000); off = await q.evaluate(() => !document.querySelector('tbody tr') || /No /.test(document.querySelector('tbody')?.innerText || '')); }
check('owner switching the catalog off removes it from devices', off);
console.log(`\nerrors: ${errors.length ? [...new Set(errors)].slice(0, 4).join(' | ') : 'none'}`);
console.log(`${pass} passed, ${fail} failed`);
await b.close();

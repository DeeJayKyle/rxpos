// Scan invoice → delivery drafts for review, end to end on the local cloud (fictional pharmacy and invoices). Workers
// AI isn't available locally, so the cloud's answer for /api/ai/invoice is a fixed reading of the kind the real cloud
// returns (two readings cross-checked: one line flagged with the other reading, one line not matched to a medicine);
// the upload of the pages, the drafts, the review and receiving the stock are the real thing.
//   node v47-scan-drafts.mjs <base> <ownerKey> <outDir>
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
import { CHROME } from './chrome.mjs';
const [base, ownerKey, out] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + String(x).slice(0, 240) : ''}`); };
const owner = (p, body) => fetch(base + '/api/owner' + p, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ownerKey }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());
const until = async (p, fn, ms = 20000, arg) => { const end = Date.now() + ms; while (Date.now() < end) { if (await p.evaluate(fn, arg).catch(() => false)) return true; await wait(300); } return false; };
const text = (p) => p.evaluate(() => document.body.innerText);
const click = (p, re, sel = 'button') => p.evaluate((src, s) => { const b = [...document.querySelectorAll(s)].find((x) => new RegExp(src).test(x.textContent.trim())); b?.click(); return !!b; }, re.source, sel);

for (const x of (await owner('/tenants')).tenants || []) if (x.name === 'Scan Sample Pharmacy') await owner('/tenants/' + x.id + '/delete', { confirm: x.slug });
const T = await owner('/tenants', { name: 'Scan Sample Pharmacy', admin: { name: 'Sam Admin', email: 'sam@test.rx', password: 'sam-pass-1234' } });
await owner('/tenants/' + T.tenant.id, { features: { catalog: false, weather: false, promos: false } });
await owner('/tenants/' + T.tenant.id + '/records', { records: [
  { t: 'products', id: 'sc-amx', rec: { name: 'Amoxicillin 500mg Capsules 10x10', generic: 'Amoxicillin', form: 'Capsules', unit: 'Pack', price: 25000, cost: 18000, reorder: 0 } },
  { t: 'products', id: 'sc-pct', rec: { name: 'Paracetamol 500mg Tablets 100s', generic: 'Paracetamol', form: 'Tablets', unit: 'Tin', price: 5000, cost: 3000, reorder: 0 } },
  { t: 'suppliers', id: 'sc-sup', rec: { name: 'Lakeview Medical Supplies Ltd', contact: '', phone: '', email: '', address: '' } },
] });

// a fictional invoice photo (any JPEG: the reading is the fixed answer below)
const img = path.join(out, 'invoice.jpg');
fs.writeFileSync(img, Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64'));
const reading = (n) => ({
  supplier: 'Lakeview Medical Supplies Ltd', invoiceNo: 'LV-2041' + n, date: '2026-10-28', total: 260800, linesTotal: 260800, totalMatches: true, readings: 2, models: ['a', 'b'],
  items: [
    { name: 'Amoxicillin 500mg Capsules 10x10', batch: 'AMX2405', expiry: '2028-06-30', qty: 10, unitCost: 18500, lineTotal: 185000, unclear: false, check: [], readings: 2 },
    { name: 'Paracetamol 500mg Tablets 100s', batch: 'PCT8812', expiry: '2027-11-30', qty: 24, unitCost: 3200, lineTotal: 76800, unclear: true, check: ['qty'], alt: { qty: 30 }, note: 'printed 30 crossed out, 24 written by hand', readings: 2 },
    { name: 'Zinc Sulphate 20mg Dispersible', batch: 'ZN0091', expiry: '2027-03-31', qty: 0, unitCost: 0, lineTotal: 0, unclear: true, check: ['name', 'qty', 'unitCost'], why: ['only one reading found this line'], readings: 1 },
  ],
});

const b = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
const p = await (await b.createBrowserContext()).newPage(); await p.setViewport({ width: 1280, height: 900 });
let aiCalls = 0, uploads = 0;
await p.setRequestInterception(true);
p.on('request', (r) => {
  if (r.method() === 'POST' && r.url().endsWith('/api/ai/invoice')) { aiCalls++; return r.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(reading(aiCalls)) }); }
  if (r.method() === 'POST' && r.url().endsWith('/api/files')) uploads++;
  r.continue().catch(() => {});
});
await p.goto(base + '/' + T.tenant.slug, { waitUntil: 'networkidle2' });
await p.waitForSelector('input[type=password]');
await p.evaluate(() => { const set = (sel, v) => { const i = document.querySelector(sel); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, v); i.dispatchEvent(new Event('input', { bubbles: true })); }; set('input[autocomplete=username]', 'sam@test.rx'); set('input[type=password]', 'sam-pass-1234'); });
await click(p, /^Sign in/, 'form button');
await p.waitForSelector('.sidebar', { timeout: 30000 }); await wait(2500);

// two invoices in one go
await p.evaluate(() => { location.hash = '#/add-stock'; }); await wait(1500);
await click(p, /^Scan invoice$/);
await p.waitForSelector('.modal input[type=file][multiple]');
const multi = await p.$$('.modal input[type=file][multiple]');
await multi[0].uploadFile(img); await wait(1200);
check('the first invoice is in the list', /Invoice 1 · 1 page/.test(await text(p)));
const more = (await p.$$('.modal input[type=file][multiple]'))[1];
await more.uploadFile(img); await wait(1200);
check('"Another invoice" starts a second one', /Invoice 2 · 1 page/.test(await text(p)));
await p.screenshot({ path: path.join(out, 'scanner.png') });
await click(p, /Read 2 invoices into drafts for review/);
if (process.env.DEBUG47) { await wait(6000); const t = await p.evaluate(() => (document.querySelector('.modal') ? document.querySelector('.modal').innerText : 'no modal') + ' || ' + document.body.innerText.slice(0, 300)); console.log('DEBUG', t.slice(0, 900)); }
check('both invoices are read into drafts, and Drafts opens', await until(p, () => document.querySelectorAll('.draft-card').length === 2, 30000), await text(p).then((t) => t.slice(0, 200)));
check('the pages are kept in the cloud for the reviewer', uploads >= 2, uploads);
const drafts = await text(p);
check('each draft says "Scanned · needs review" and how many lines to check', (drafts.match(/Scanned · needs review/g) || []).length === 2 && /2 lines to check/.test(drafts));
check('…with the invoice number and the supplier', /invoice LV-2041/.test(drafts) && /Scanned: Lakeview Medical Supplies Ltd/.test(drafts));
check('…and a picture of the first page from the cloud', await p.evaluate(() => [...document.querySelectorAll('.draft-scan img')].every((i) => /\/api\/files\//.test(i.src))));
await p.screenshot({ path: path.join(out, 'drafts.png') });

// review one
await click(p, /^Continue/); await wait(2000);
const page = await text(p);
check('Add Stock opens the draft with what was read', /Filled from a scanned invoice \(no\. LV-2041\d\)/.test(page) && /cross-checked by two AI readings/.test(page));
check('the flagged line says what to check, with the other reading', /check quantity \(other reading: 30\)/.test(page) && /printed 30 crossed out/.test(page));
check('the line only one reading saw asks for the medicine', /Zinc Sulphate 20mg Dispersible/.test(page) && /not matched to a medicine/.test(page));
check('the invoice page is shown to compare', await p.evaluate(() => [...document.querySelectorAll('.scan-thumbs img')].some((i) => /\/api\/files\//.test(i.src))));
check('the supplier was matched', await p.evaluate(() => document.querySelector('form select')?.value === 'sc-sup'));
await p.screenshot({ path: path.join(out, 'review.png'), fullPage: true });
check('it cannot be received before someone confirms they checked', await p.evaluate(() => [...document.querySelectorAll('button')].find((x) => /^Receive stock/.test(x.textContent.trim()))?.disabled === true));
// the reviewer removes the line the invoice didn't really have, ticks the box and receives
await p.evaluate(() => { const row = [...document.querySelectorAll('tr')].find((r) => /Zinc Sulphate/.test(r.innerText)); row?.querySelector('button[aria-label="Remove line"]')?.click(); });
await wait(500);
await p.evaluate(() => { const c = document.querySelector('.scan-confirm input'); c?.click(); });
await wait(300);
await click(p, /^Receive stock/);
check('received: the stock is in and the draft is gone', await until(p, () => /Received 2 item/.test(document.body.innerText), 15000), await text(p).then((t) => t.slice(0, 300)));
await p.evaluate(() => { location.hash = '#/purchases'; }); await wait(1500);
await click(p, /^Drafts/, 'button, [role=tab]'); await wait(800);
check('one draft left to review', await p.evaluate(() => document.querySelectorAll('.draft-card').length === 1));

await b.close();
await owner('/tenants/' + T.tenant.id + '/delete', { confirm: T.tenant.slug });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

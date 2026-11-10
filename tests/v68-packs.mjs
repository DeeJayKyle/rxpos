// Received by the box, sold by the unit (the owner's request, 2026-11-10): any Add Stock line, a new medicine too, can be
// received in packs of a size typed on the line. The medicine is sold by the tablet/capsule, keeps the pack for next
// time, and its stock is counted in units. Fictional data only.   node v68-packs.mjs <base> <ownerKey>
import puppeteer from 'puppeteer-core';
import { CHROME } from './chrome.mjs';
const [base, ownerKey] = process.argv.slice(2);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + String(x).slice(0, 300) : ''}`); };
const owner = (p, body) => fetch(base + '/api/owner' + p, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ownerKey }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());
const until = async (p, fn, ms = 20000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await p.evaluate(fn).catch(() => false)) return true; await wait(300); } return false; };
const recs = async (tid, t) => ((await owner(`/tenants/${tid}/records?t=${t}`)).rows || []).map((x) => x.rec);

const T = await owner('/tenants', { name: 'Pack Pharmacy', admin: { name: 'Ari Admin', email: 'ari@packs.rx', password: 'ari-pass-1234' } });
const tid = T.tenant.id, slug = T.tenant.slug;
await owner('/tenants/' + tid, { features: { catalog: false } });
await owner('/tenants/' + tid + '/records', { records: [
  { t: 'products', id: 'p1', rec: { name: 'Paramol 500mg', unit: 'Tablet', price: 100, cost: 40, reorder: 0 } }, // no packs yet
  { t: 'suppliers', id: 's1', rec: { name: 'Sample Wholesalers', phone: '0414000000' } },
] });

const b = await puppeteer.launch({ executablePath: CHROME, headless: true });
const p = await (await b.createBrowserContext()).newPage();
await p.setViewport({ width: 1440, height: 900 });
p.on('dialog', (d) => d.dismiss().catch(() => {}));
await p.goto(base + '/' + slug, { waitUntil: 'networkidle2' }); await wait(600);
await p.evaluate(() => { for (const id of ['pos', 'dashboard', 'add-stock']) localStorage.setItem('rxpos-tip:' + id, '1'); });
await p.type('input[autocomplete=username]', 'ari@packs.rx'); await p.type('input[type=password]', 'ari-pass-1234');
await p.evaluate(() => [...document.querySelectorAll('form button')].find((x) => /^Sign in/.test(x.textContent.trim()))?.click());
await p.waitForSelector('.sidebar', { timeout: 20000 });
await until(p, () => /Synced/.test(document.querySelector('.pill.clock .clock-state')?.innerText || ''), 30000);
const go = async (h) => { await p.evaluate((x) => { location.hash = x; }, h); await wait(1200); };
const setVal = (sel, v, n = 0) => p.evaluate((s, val, i) => { const el = document.querySelectorAll(s)[i]; Object.getOwnPropertyDescriptor(el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value').set.call(el, val); el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); }, sel, v, n);
const row = (n) => `table.lines tbody tr:nth-child(${n})`;
const val = (sel) => p.evaluate((s) => document.querySelector(s)?.value, sel);
const synced = () => until(p, () => /^Synced/.test(document.querySelector('.pill.clock .clock-state')?.innerText || ''), 20000);

await go('#/add-stock');
// line 1: a new medicine, 3 boxes of 100 capsules for 15,000 (5,000 a box)
await p.type('.picker input', 'Amoxil 500mg Caps'); await wait(400);
await p.click('.picker-new'); await wait(300);
await setVal(`${row(1)} select[aria-label="Formulation"]`, 'Capsules');
const opts = await p.evaluate((s) => [...document.querySelector(s).options].map((o) => o.textContent), `${row(1)} select[aria-label="Received as"]`);
check('a new medicine can be received as units or by the box', opts[0] === 'Capsules' && /Boxes \/ packs of/.test(opts.join('|')), JSON.stringify(opts));
await setVal(`${row(1)} select[aria-label="Received as"]`, '__pack__'); await wait(200);
await setVal(`${row(1)} input[aria-label="Units per pack"]`, '100');
await setVal(`${row(1)} input[aria-label="Quantity"]`, '3');
await setVal(`${row(1)} input[aria-label="Line total"]`, '15000'); await wait(300);
check('the cost is per box (5,000), the price per capsule (50 + markup)', (await val(`${row(1)} input[aria-label="Unit cost"]`)) === '5000' && Number(await val(`${row(1)} input[aria-label="New retail price"]`)) > 50 && Number(await val(`${row(1)} input[aria-label="New retail price"]`)) < 200,
  [await val(`${row(1)} input[aria-label="Unit cost"]`), await val(`${row(1)} input[aria-label="New retail price"]`)].join(' / '));
check('…and it shows the capsules received (= 300)', /= 300 capsules/.test(await p.evaluate((s) => document.querySelector(s)?.innerText, `${row(1)} td[data-label="Qty"]`)));
await setVal(`${row(1)} input[aria-label="Batch number"]`, 'AM1');
await setVal(`${row(1)} input[aria-label="Expiry date"]`, 'DEC 2029');
// line 2: Paramol (no packs yet) by the carton of 500
await p.type('.picker input', 'Paramol'); await p.keyboard.press('Enter'); await wait(300);
await setVal(`${row(2)} select[aria-label="Received as"]`, '__pack__'); await wait(200);
await setVal(`${row(2)} input[aria-label="Pack name"]`, 'Carton');
await setVal(`${row(2)} input[aria-label="Units per pack"]`, '500');
await setVal(`${row(2)} input[aria-label="Quantity"]`, '2');
await setVal(`${row(2)} input[aria-label="Unit cost"]`, '15000');
await setVal(`${row(2)} input[aria-label="Batch number"]`, 'PM1');
await setVal(`${row(2)} input[aria-label="Expiry date"]`, '06/2030'); await wait(300);
check('Paramol keeps its retail price (100) when received by the carton', (await val(`${row(2)} input[aria-label="New retail price"]`)) === '100', await val(`${row(2)} input[aria-label="New retail price"]`));
await setVal('form.card select', 's1');
await p.evaluate(() => [...document.querySelectorAll('button')].find((x) => /^Receive stock/.test(x.textContent.trim()))?.click()); await wait(1500);
check('received', /Received 2 item/.test(await p.evaluate(() => document.body.innerText)), await p.evaluate(() => [...document.querySelectorAll('.toast, .notice')].map((x) => x.innerText).join(' | ')));
await synced();

const prods = await recs(tid, 'products');
const amox = prods.find((x) => x.name === 'Amoxil 500mg Caps'), para = prods.find((x) => x.id === 'p1');
check('the new medicine is sold by the capsule, costs 50 a capsule and keeps its Box of 100', amox?.unit === 'Capsule' && amox.cost === 50 && JSON.stringify(amox.packs) === '[{"name":"Box","size":100}]', JSON.stringify(amox && { unit: amox.unit, cost: amox.cost, packs: amox.packs }));
check('Paramol gains a Carton of 500, costs 30 a tablet, its price unchanged', JSON.stringify(para?.packs) === '[{"name":"Carton","size":500}]' && para.cost === 30 && para.price === 100, JSON.stringify(para && { packs: para.packs, cost: para.cost, price: para.price }));
const moves = (await recs(tid, 'movements')).filter((m) => m.type === 'Purchase');
check('stock is counted in units: 300 capsules, 1,000 tablets', moves.find((m) => m.productId === amox?.id)?.qty === 300 && moves.find((m) => m.productId === 'p1')?.qty === 1000, JSON.stringify(moves.map((m) => [m.productId, m.qty])));
check('the expiry typed as on the pack (DEC 2029) is the end of that month', (await recs(tid, 'batches')).some((x) => x.batch === 'AM1' && x.expiry === '2029-12-31'));
check('the pack added is in the audit log', (await recs(tid, 'audit')).some((x) => x.action === 'Pack added' && /Carton of 500/.test(x.details || '')));

// the till sells by the capsule
await go('#/pos');
await p.evaluate(() => { const i = document.querySelector('.search-row input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, 'Amoxil'); i.dispatchEvent(new Event('input', { bubbles: true })); }); await wait(400);
const tile = await p.evaluate(() => document.querySelector('.product')?.innerText || '');
check('the till offers it by the capsule, 300 in stock', /\/ capsule/.test(tile) && /300 left/.test(tile), tile.replace(/\n/g, ' · '));

// a size typed without a number is refused, nothing saved
await go('#/add-stock');
await p.type('.picker input', 'Paramol'); await p.keyboard.press('Enter'); await wait(300);
await setVal(`${row(1)} select[aria-label="Received as"]`, '__pack__'); await wait(200);
await setVal(`${row(1)} input[aria-label="Pack name"]`, 'Tin');
await setVal(`${row(1)} input[aria-label="Units per pack"]`, ''); // (it starts from the Carton's 500)
await setVal(`${row(1)} input[aria-label="Batch number"]`, 'PM2');
await setVal(`${row(1)} input[aria-label="Expiry date"]`, '06/2030'); await wait(200);
await setVal('form.card select', 's1');
await p.evaluate(() => [...document.querySelectorAll('button')].find((x) => /^Receive stock/.test(x.textContent.trim()))?.click()); await wait(800);
const refused = await p.evaluate(() => [...document.querySelectorAll('.toast')].map((x) => x.innerText).join(' | '));
check('a pack without its size is refused, nothing received', /how many tablets are in one tin/i.test(refused) && (await recs(tid, 'purchases')).length === 1, refused);

await b.close();
await owner('/tenants/' + tid + '/delete', { confirm: slug });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

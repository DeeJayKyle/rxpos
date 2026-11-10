// Step 21: GS1 pack codes (src/gs1.js). At the till a scanned pack sells from its own batch first and an expired pack is
// refused; at Add Stock a pack fills the medicine, batch and expiry, and an unknown product number starts a new
// medicine with them filled. Fictional data only.   node v65-gs1.mjs <base> <ownerKey>
import puppeteer from 'puppeteer-core';
import { CHROME } from './chrome.mjs';
const [base, ownerKey] = process.argv.slice(2);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + String(x).slice(0, 200) : ''}`); };
const owner = (p, body) => fetch(base + '/api/owner' + p, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ownerKey }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());
const until = async (p, fn, ms = 20000, arg) => { const end = Date.now() + ms; while (Date.now() < end) { if (await p.evaluate(fn, arg).catch(() => false)) return true; await wait(300); } return false; };

const T = await owner('/tenants', { name: 'Pack Pharmacy', admin: { name: 'Ari Admin', email: 'ari@pack.rx', password: 'ari-pass-1234' } });
const tid = T.tenant.id, slug = T.tenant.slug;
await owner('/tenants/' + tid, { features: { catalog: false } });
const date = new Date().toISOString();
await owner('/tenants/' + tid + '/records', { records: [
  { t: 'products', id: 'p1', rec: { name: 'Pack Tabs', price: 1000, cost: 400, reorder: 0, barcode: '4006381333931' } },
  // the first to expire is E1; the pack scanned at the till is L2
  { t: 'batches', id: 'b1', rec: { productId: 'p1', batch: 'E1', expiry: '2029-01-31', cost: 400 } },
  { t: 'batches', id: 'b2', rec: { productId: 'p1', batch: 'L2', expiry: '2030-06-30', cost: 400 } },
  { t: 'movements', id: 'm1', rec: { productId: 'p1', qty: 50, type: 'Opening stock', batchId: 'b1', branchId: 'main', date } },
  { t: 'movements', id: 'm2', rec: { productId: 'p1', qty: 50, type: 'Opening stock', batchId: 'b2', branchId: 'main', date } },
] });

const b = await puppeteer.launch({ executablePath: CHROME, headless: true });
const p = await (await b.createBrowserContext()).newPage();
await p.setViewport({ width: 1366, height: 900 });
p.on('dialog', (d) => d.dismiss().catch(() => {}));
await p.goto(base + '/' + slug, { waitUntil: 'networkidle2' }); await wait(600);
await p.evaluate(() => { for (const id of ['pos', 'dashboard', 'add-stock']) localStorage.setItem('rxpos-tip:' + id, '1'); });
await p.type('input[autocomplete=username]', 'ari@pack.rx'); await p.type('input[type=password]', 'ari-pass-1234');
await p.evaluate(() => [...document.querySelectorAll('form button')].find((x) => /^Sign in/.test(x.textContent.trim()))?.click());
await p.waitForSelector('.sidebar', { timeout: 20000 });
await until(p, () => /Synced/.test(document.querySelector('.pill.clock .clock-state')?.innerText || ''), 30000);
const go = async (h) => { await p.evaluate((x) => { location.hash = x; }, h); await wait(1200); };
const scan = async (sel, code) => { await p.click(sel, { clickCount: 3 }); await p.type(sel, code); await p.keyboard.press('Enter'); await wait(600); };
const values = () => p.evaluate(() => [...document.querySelectorAll('input')].map((i) => i.value));

// the till
await go('#/pos');
await scan('.search-row input', '0104006381333931172001311OLD1');
check('an expired pack is refused', /expired on 2020-01-31/.test(await p.evaluate(() => document.body.innerText)));
check('nothing was added', await p.evaluate(() => !!document.querySelector('.cart-empty')));
await p.evaluate(() => document.querySelectorAll('.toast button').forEach((x) => x.click()));
await scan('.search-row input', '01040063813339311730063010L2');
await p.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F9', bubbles: true })));
check('the pack is sold', await until(p, () => /Sale complete/.test(document.querySelector('.modal')?.innerText || ''), 6000));
await p.keyboard.press('Escape'); await wait(300);
await until(p, () => /^Synced/.test(document.querySelector('.pill.clock .clock-state')?.innerText || ''), 20000);
const moves = ((await owner(`/tenants/${tid}/records?t=movements`)).rows || []).map((x) => x.rec).filter((m) => m.type === 'Sale');
check('from its own batch L2, not the first to expire', moves.length === 1 && moves[0].batchId === 'b2', JSON.stringify(moves.map((m) => [m.batchId, m.qty])));

// Add Stock
await go('#/add-stock');
const search = 'input.search.big';
await scan(search, '(01)04006381333931(17)310200(10)NEW9');
let v = await values();
check('a known pack: its medicine with batch and expiry filled', v.includes('Pack Tabs') && v.includes('NEW9') && v.some((x) => /2031/.test(x)), JSON.stringify(v.filter(Boolean)));
await scan(search, '010950600013435217280115' + '10Z5');
v = await values();
check('an unknown product number: a new medicine, batch and expiry filled, the name to type', v.includes('Z5') && v.some((x) => /2028/.test(x)) && await p.evaluate(() => document.activeElement?.getAttribute('aria-label') === 'New medicine name'), JSON.stringify(v.filter(Boolean)));

await b.close();
await owner('/tenants/' + tid + '/delete', { confirm: slug });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

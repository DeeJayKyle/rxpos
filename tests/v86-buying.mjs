// UI batch 3, G (buying stock): the invoice beside the Add Stock form (G1), checking a delivery by scanning each pack
// (G2), supplier price chips on an order line (G3), stock in the other branches (G4). Fictional data only.
//   node v86-buying.mjs <base> <ownerKey> <outDir>
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
import { CHROME } from './chrome.mjs';
const [base, ownerKey, out = '.output/v86'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + String(x).slice(0, 300) : ''}`); };
const owner = (p, body) => fetch(base + '/api/owner' + p, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ownerKey }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());
const until = async (p, fn, ms = 20000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await p.evaluate(fn).catch(() => false)) return true; await wait(250); } return false; };
const recs = async (tid, t) => ((await owner(`/tenants/${tid}/records?t=${t}&offset=0`)).rows || []).map((r) => r.rec || r);

const T = await owner('/tenants', { name: 'Buying Sample Pharmacy', admin: { name: 'Bea Admin', email: 'bea@buy.rx', password: 'bea-pass-1234' } });
const tid = T.tenant.id, slug = T.tenant.slug;
await owner('/tenants/' + tid, { features: { catalog: false, weather: false, promos: false, branches: true } });
const day = new Date(Date.now() - 86400000).toISOString();
const mv = (id, pid, b, qty, br) => ({ t: 'movements', id, rec: { productId: pid, batchId: b, qty, type: 'Opening stock', date: day, branchId: br, user: 'Bea Admin' } });
await owner('/tenants/' + tid + '/records', { records: [
  { t: 'branches', id: 'br2', rec: { name: 'Kira Road' } },
  { t: 'products', id: 'ga', rec: { name: 'Calmex 500mg Tabs', form: 'Tablets', barcode: '7010001', price: 500, cost: 300, reorder: 50 } },
  { t: 'products', id: 'gb', rec: { name: 'Zinco Syrup 100ml', form: 'Syrups', barcode: '7010002', price: 6000, cost: 4000, reorder: 0 } },
  { t: 'batches', id: 'gba', rec: { productId: 'ga', batch: 'C1', expiry: '2029-01-31', cost: 300 } },
  { t: 'batches', id: 'gbb', rec: { productId: 'gb', batch: 'Z1', expiry: '2029-01-31', cost: 4000 } },
  mv('gm1', 'ga', 'gba', 5, 'main'), mv('gm2', 'ga', 'gba', 30, 'br2'), mv('gm3', 'gb', 'gbb', 7, 'br2'),
  { t: 'suppliers', id: 's1', rec: { name: 'Alpha Wholesale' } },
  { t: 'suppliers', id: 's2', rec: { name: 'Beta Medics' } },
  { t: 'purchases', id: 'pu1', rec: { number: 'GRN-1', date: day, supplierId: 's1', supplierName: 'Alpha Wholesale', branchId: 'main', items: [{ productId: 'ga', name: 'Calmex 500mg Tabs', qty: 10, cost: 300 }], total: 3000 } },
  { t: 'purchases', id: 'pu2', rec: { number: 'GRN-2', date: day, supplierId: 's2', supplierName: 'Beta Medics', branchId: 'main', items: [{ productId: 'ga', name: 'Calmex 500mg Tabs', qty: 10, cost: 250 }], total: 2500 } },
  { t: 'purchaseOrders', id: 'po1', rec: { number: 'PO-1', date: day, status: 'Sent', branchId: 'main', supplierId: 's1', supplierName: 'Alpha Wholesale', items: [{ productId: 'ga', name: 'Calmex 500mg Tabs', qty: 2, cost: 300 }, { productId: 'gb', name: 'Zinco Syrup 100ml', qty: 1, cost: 4000 }] } },
  { t: 'drafts', id: 'dr1', rec: { kind: 'delivery', branchId: 'main', userId: 'x', userName: 'Bea Admin', order: 1, startedAt: day, title: 'Scanned: Alpha Wholesale', invoice: 'INV-9', count: 1, total: 600,
    scan: { supplier: 'Alpha Wholesale', supplierMatched: true, lines: 1, pages: ['/api/files/' + tid + '/pagepage1/abcdefghijklmnopqrstuvwx'] },
    data: { supplierId: 's1', invoice: 'INV-9', date: day.slice(0, 10), lines: [{ key: 'k1', productId: 'ga', qty: '2', cost: '300', price: '500', batch: 'C9', expiry: '2029-06-30', read: { name: 'Calmex 500mg', matched: true }, box: { page: 0, x: 0.1, y: 0.4, w: 0.8, h: 0.06 } }] } } },
] });
const movementsBefore = (await recs(tid, 'movements')).length;

const b = await puppeteer.launch({ executablePath: CHROME, headless: true });
const p = await (await b.createBrowserContext()).newPage();
await p.setViewport({ width: 1440, height: 900 });
const errors = []; p.on('pageerror', (e) => errors.push(e.message));
await p.goto(base + '/' + slug, { waitUntil: 'networkidle2' }); await wait(300);
await p.evaluate(() => { for (const id of ['pos', 'dashboard', 'add-stock', 'purchases', 'reorder']) localStorage.setItem('rxpos-tip:' + id, '1'); for (const k of Object.keys(localStorage)) if (/^rxpos-tour/.test(k)) localStorage.removeItem(k); localStorage.setItem('rxpos-tour:pos', '1'); });
await p.type('input[autocomplete=username]', 'bea@buy.rx'); await p.type('input[type=password]', 'bea-pass-1234');
await p.evaluate(() => [...document.querySelectorAll('form button')].find((x) => /^Sign in/.test(x.textContent.trim()))?.click());
await p.waitForSelector('.sidebar', { timeout: 20000 });
await until(p, () => /Synced/.test(document.querySelector('.pill.clock .clock-state')?.innerText || ''), 30000); await wait(1000);

// G3: supplier price chips on the order line, the cheapest marked; a tap uses that supplier
await p.evaluate(() => { location.hash = '#/reorder'; }); await wait(1500);
const chips = await p.evaluate(() => [...document.querySelectorAll('.price-chips .price-chip')].map((x) => ({ t: x.innerText.replace(/\s+/g, ' '), on: x.getAttribute('aria-checked') === 'true', cheap: x.classList.contains('cheapest') })));
check('G3 the order line shows each supplier\'s last price, the cheapest marked and chosen', chips.length === 2 && chips[0].cheap && /Beta Medics.*250.*Cheapest/.test(chips[0].t) && chips[0].on && /Alpha Wholesale.*300/.test(chips[1].t), JSON.stringify(chips));
await p.evaluate(() => [...document.querySelectorAll('.price-chips .price-chip')].find((x) => /Alpha/.test(x.innerText)).click()); await wait(300);
check('G3 …a tap uses that supplier and price', await p.evaluate(() => [...document.querySelectorAll('.price-chips .price-chip')].find((x) => /Alpha/.test(x.innerText)).getAttribute('aria-checked') === 'true' && /50 more than Beta Medics/.test(document.querySelector('.price-chips').parentElement.innerText)));
await p.screenshot({ path: path.join(out, 'price-chips.png') });

// G2: receiving the order: check it by scanning each pack
await p.evaluate(() => [...document.querySelectorAll('.tabs button, [role=tab]')].find((x) => /Purchase orders/.test(x.textContent))?.click()); await wait(600);
await p.evaluate(() => [...document.querySelectorAll('tr')].find((r) => /PO-1/.test(r.innerText))?.querySelector('button.primary')?.click()); await wait(1500);
check('G2 receiving an order offers "Check the delivery by scan"', await p.evaluate(() => /Check the delivery by scan/.test(document.querySelector('.dcheck')?.innerText || '')));
await p.evaluate(() => [...document.querySelectorAll('.dcheck button')].find((x) => /Start checking/.test(x.textContent)).click()); await wait(300);
const scan = async (code) => { await p.focus('.dcheck-input'); await p.keyboard.type(code); await p.keyboard.press('Enter'); await wait(250); };
await scan('7010001');
check('G2 a scanned pack counts up its line', await p.evaluate(() => [...document.querySelectorAll('[data-testid=dcheck-count]')].some((x) => x.textContent === '1/2')), await p.evaluate(() => [...document.querySelectorAll('[data-testid=dcheck-count]')].map((x) => x.textContent).join(',')));
await scan('7010001');
check('G2 …and ticks it when all are in', await p.evaluate(() => [...document.querySelectorAll('[data-testid=dcheck-count].done')].some((x) => /✓ 2\/2/.test(x.textContent))));
await scan('999000');
check('G2 a pack not on the order is listed as extra; what is still to scan is said', await p.evaluate(() => /Still to scan: Zinco Syrup 100ml \(1\)[\s\S]*Extra: 999000/.test(document.querySelector('.dcheck-left')?.innerText || '')));
await p.screenshot({ path: path.join(out, 'delivery-check.png') });
await p.evaluate(() => { const i = document.querySelector('.invoice-sheet input[aria-label="Invoice number"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, 'INV-PO1'); i.dispatchEvent(new Event('input', { bubbles: true })); });
await p.evaluate(() => [...document.querySelectorAll('.invoice-sheet button.primary')].pop().click()); await wait(700);
const dlg = await p.evaluate(() => document.querySelector('.modal.dialog')?.innerText || '');
check('G2 "Receive stock" first says what is missing and extra', /Not everything matches the scan/.test(dlg) && /Zinco Syrup 100ml: 0 of 1 scanned/.test(dlg) && /Extra: 999000/.test(dlg), dlg.slice(0, 300));
await p.evaluate(() => [...document.querySelectorAll('.modal.dialog button')].find((x) => x.textContent.trim() === 'Cancel').click()); await wait(1500);
check('G2 …Cancel receives nothing (quantities can still be changed)', (await recs(tid, 'movements')).length === movementsBefore);

// G1: a scanned delivery: the invoice beside the form, the line being edited outlined on it
await p.evaluate(() => { location.hash = '#/purchases'; }); await wait(1200);
await p.evaluate(() => [...document.querySelectorAll('.subview-bar button, button')].find((x) => /^Drafts/.test(x.textContent.trim()))?.click()); await wait(700);
await p.evaluate(() => [...document.querySelectorAll('button')].find((x) => /^(Continue|Take over)$/.test(x.textContent.trim()))?.click()); await wait(1800);
check('G1 the invoice sits beside the form on a wide screen', await p.evaluate(() => { const v = document.querySelector('.invoice-view'), f = document.querySelector('.invoice-sheet'); return !!v && !!v.querySelector('img') && v.getBoundingClientRect().right <= f.getBoundingClientRect().left + 1; }));
await p.evaluate(() => document.querySelector('.invoice-sheet tr[data-line] input')?.focus()); await wait(300);
check('G1 …and the line being edited is outlined on it', await p.evaluate(() => { const m = document.querySelector('.invoice-mark'); return !!m && /10%/.test(m.style.left) && /40%/.test(m.style.top); }));
await p.screenshot({ path: path.join(out, 'invoice-beside.png') });
await p.setViewport({ width: 1100, height: 900 }); await wait(500);
check('G1 narrower screens keep the form alone', await p.evaluate(() => !document.querySelector('.invoice-view')));
await p.setViewport({ width: 1440, height: 900 }); await wait(300);

// G4: stock in the other branches: on an out-of-stock till tile and on the medicine
await p.evaluate(() => { location.hash = '#/pos'; }); await wait(1500);
// the till opens on In stock (the owner's rule, 2026-11-20): an out-of-stock medicine shows under All
await p.evaluate(() => [...document.querySelectorAll('.view-chip')].find((x) => x.textContent.trim() === 'All')?.click()); await wait(400);
await p.evaluate(() => [...document.querySelectorAll('.product-wrap')].find((w) => /Zinco/.test(w.innerText))?.querySelector('.branch-btn')?.click()); await wait(300);
const pop = await p.evaluate(() => document.querySelector('.branch-pop')?.innerText || '');
check('G4 an out-of-stock till tile shows the stock in each branch', /Main[\s\S]*none[\s\S]*Kira Road[\s\S]*7/.test(pop) || /Kira Road[\s\S]*7/.test(pop), pop);
await p.screenshot({ path: path.join(out, 'branch-stock.png') });
check('G4 …only out-of-stock tiles carry it', await p.evaluate(() => !([...document.querySelectorAll('.product-wrap')].find((w) => /Calmex/.test(w.innerText))?.querySelector('.branch-btn'))));
check('no page errors', !errors.length, errors.join(' | '));

await b.close();
await owner('/tenants/' + tid + '/delete', { confirm: slug });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

// Kits (1.10.0, fictional pharmacy): build an HIV test kit from a ready-made kit matched to the pharmacy's own
// medicines (with a testing fee), see it kept out of Inventory and Add Stock, flagged as running low, sell two at the
// till (warning ticked, Rx confirmed), check every medicine left stock from its own batches (FEFO) in the cloud,
// swap a short medicine for one sale, scan the kit's label barcode, refund a kit sale (its medicines go back) and
// check the cloud's sale checks raise nothing.
//   node v82-kits.mjs <base> <ownerKey> <outDir>
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
import { CHROME } from './chrome.mjs';
const [base, ownerKey, out] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + String(x).slice(0, 300) : ''}`); };
const owner = (p, body) => fetch(base + '/api/owner' + p, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ownerKey }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());
const until = async (p, fn, ms = 15000, arg) => { const end = Date.now() + ms; while (Date.now() < end) { if (await p.evaluate(fn, arg).catch(() => false)) return true; await wait(300); } return false; };

for (const x of (await owner('/tenants')).tenants || []) if (x.name === 'Kits Sample Pharmacy') await owner('/tenants/' + x.id + '/delete', { confirm: x.slug });
const T = await owner('/tenants', { name: 'Kits Sample Pharmacy', admin: { name: 'Kai Admin', email: 'kai@test.rx', password: 'kai-pass-1234' } });
const tid = T.tenant.id;
await owner('/tenants/' + tid, { features: { catalog: false, weather: false, promos: false } });
const day = new Date().toISOString();
const prod = (id, name, price, cost, extra = {}) => ({ t: 'products', id, rec: { name, generic: '', form: 'Devices', unit: 'Piece', price, cost, reorder: 0, ...extra } });
const lot = (id, productId, batch, expiry, qty) => [{ t: 'batches', id, rec: { productId, batch, expiry, cost: 0, received: day.slice(0, 10) } }, { t: 'movements', id: 'm-' + id, rec: { productId, batchId: id, qty, type: 'Opening stock', date: day, branchId: 'main', user: 'Kai Admin' } }];
await owner('/tenants/' + tid + '/records', { records: [
  prod('k-strip', 'HIV Test Strip', 5000, 3000), prod('k-lancet', 'Blood Lancets', 100, 40), prod('k-swab', 'Alcohol Swabs', 50, 20),
  prod('k-wfi', 'Water for Injection 10ml', 500, 250, { rx: true, form: 'Injectables' }), prod('k-safety', 'Safety Lancets', 150, 60), prod('k-para', 'Paracetamol 500mg', 200, 100, { form: 'Tablets' }),
  ...lot('b-strip', 'k-strip', 'HS1', '2028-03-31', 10), ...lot('b-l1', 'k-lancet', 'BL1', '2028-01-31', 3), ...lot('b-l2', 'k-lancet', 'BL2', '2030-01-31', 4),
  ...lot('b-swab', 'k-swab', 'AS1', '2029-01-31', 100), ...lot('b-wfi', 'k-wfi', 'WF1', '2027-06-30', 20), ...lot('b-safety', 'k-safety', 'SL1', '2030-06-30', 30), ...lot('b-para', 'k-para', 'PA1', '2029-01-31', 50),
] });
const cloud = async () => {
  const ex = await fetch(base + '/api/owner/tenants/' + tid + '/export', { headers: { Authorization: 'Bearer ' + ownerKey } }).then((r) => r.json());
  const s = {}; for (const m of ex.movements || []) s[m.productId] = (s[m.productId] || 0) + m.qty; return { s, ex };
};
const cloudUntil = async (fn) => { for (let k = 0; k < 30; k++) { const r = await cloud(); if (fn(r)) return r; await wait(500); } return cloud(); };

const b = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
const p = await (await b.createBrowserContext()).newPage(); await p.setViewport({ width: 1366, height: 900 });
const errors = []; p.on('pageerror', (e) => errors.push(e.message));
await p.goto(base + '/' + T.tenant.slug, { waitUntil: 'networkidle2' });
await p.waitForSelector('input[type=password]');
await p.evaluate(() => { const set = (sel, v) => { const i = document.querySelector(sel); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, v); i.dispatchEvent(new Event('input', { bubbles: true })); }; set('input[autocomplete=username]', 'kai@test.rx'); set('input[type=password]', 'kai-pass-1234'); });
await p.evaluate(() => [...document.querySelectorAll('form button')].find((x) => /^Sign in/.test(x.textContent.trim()))?.click());
await p.waitForSelector('.sidebar', { timeout: 30000 }); await wait(2500);
const go = async (h) => { await p.evaluate((x) => { location.hash = x; }, h); await wait(1200); };
const click = (sel, text) => p.evaluate((s, t) => { const el = [...document.querySelectorAll(s)].find((x) => (t ? new RegExp(t).test(x.textContent.trim()) : true)); el?.click(); return !!el; }, sel, text);
const typeIn = (sel, v) => p.evaluate((s, val) => { const i = document.querySelector(s); const proto = i.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(i, val); i.dispatchEvent(new Event('input', { bubbles: true })); }, sel, v);
const confirmDialog = () => p.evaluate(() => [...document.querySelectorAll('.modal.dialog .form-actions button')].find((x) => !x.classList.contains('ghost'))?.click());
const body = () => p.evaluate(() => document.body.innerText);

// 1. a ready-made HIV test kit, matched to this pharmacy's medicines
await go('#/kits');
check('the Kits page is in the menu and opens', /No kits yet/.test(await body()));
await click('.page-head button', 'Ready-made kit'); await wait(300);
await click('.modal button.kit-tile', 'HIV Test Kit'); await wait(500);
const picked = await p.evaluate(() => [...document.querySelectorAll('.modal .kit-items .med-pick input')].map((i) => i.value));
check('the template found the strip, lancets, swabs and water for injection', picked.join('|') === 'HIV Test Strip|Blood Lancets|Alcohol Swabs|Water for Injection 10ml', picked.join('|'));
check('…its icon, colour and warning come with it', await p.evaluate(() => document.querySelector('.kit-icons button[aria-pressed="true"]')?.title === 'test tube' && /counselling/.test(document.querySelector('.modal textarea').value) && document.querySelectorAll('.modal input[type=checkbox]')[0].checked));
// two lancets per kit, and a testing fee
await p.evaluate(() => { const i = document.querySelectorAll('.modal input[aria-label="Quantity per kit"]')[1]; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, '2'); i.dispatchEvent(new Event('input', { bubbles: true })); });
await click('.modal button', 'Add a service'); await wait(200);
await typeIn('.modal input[aria-label="Service name"]', 'Testing fee'); await typeIn('.modal input[aria-label="Service price"]', '2000');
await wait(300);
const fig = await p.evaluate(() => Object.fromEntries([...document.querySelectorAll('.modal .kit-figures div')].map((d) => [d.querySelector('small').innerText, d.querySelector('b').innerText])));
check('the editor shows can make 3 (7 lancets ÷ 2), the live cost and the prices added up', fig['Can make now'] === '3' && /3,350/.test(fig['Cost (live)']) && /7,750/.test(fig['Retail prices added up']), JSON.stringify(fig));
await p.screenshot({ path: path.join(out, 'kit-editor.png') });
await click('.modal button', '^Save kit'); await wait(1200);
let c = await cloudUntil((r) => (r.ex.products || []).some((x) => x.kit));
const kitRec = (c.ex.products || []).find((x) => x.kit);
check('the kit is saved as a recipe in the cloud', kitRec && kitRec.name === 'HIV Test Kit' && kitRec.kit.items.length === 5 && kitRec.kit.ack === true && /^20\d{10}$/.test(kitRec.barcode || ''), JSON.stringify(kitRec?.kit));
check('…with an audit line', (c.ex.audit || []).some((a) => a.action === 'Kit created' && /2 × Blood Lancets/.test(a.details)));
check('…and no stock of its own', !(c.ex.movements || []).some((m) => m.productId === kitRec?.id));
check('the kit card says can make 3 and names the short medicine', /Can make\s*3/.test(await p.evaluate(() => document.querySelector('.kit-card')?.innerText || '')) && /Blood Lancets running low/.test(await p.evaluate(() => document.querySelector('.kit-card')?.innerText || '')));
await p.screenshot({ path: path.join(out, 'kits-page.png'), fullPage: true });

// 2. kept out of stock pages; flagged as running low
await go('#/inventory');
const page = () => p.evaluate(() => document.querySelector('.page')?.innerText || '');
check('Inventory does not list the kit', !/HIV Test Kit/.test(await page()) && /HIV Test Strip/.test(await page()));
await go('#/add-stock');
await p.focus('input.search.big'); await p.keyboard.type('HIV Test'); await wait(400);
check('Add Stock can\'t receive a kit', !/HIV Test Kit/.test(await p.evaluate(() => document.querySelector('.picker-list')?.innerText || '')) && /HIV Test Strip/.test(await p.evaluate(() => document.querySelector('.picker-list')?.innerText || '')));
await typeIn('input.search.big', '');
await go('#/');
check('the dashboard flags the kit running low', /Kits running low:.*HIV Test Kit: only 3 can be made/.test(await p.evaluate(() => document.querySelector('.kit-low-alert')?.innerText.replace(/\s+/g, ' ') || '')));

// 3. sell two at the till
await go('#/pos'); await wait(800);
await p.focus('.search-row input'); await p.keyboard.type('HIV'); await wait(700);
const tile = await p.evaluate(() => { const t = document.querySelector('.product.kit-tile'); return t ? { text: t.innerText, kit: getComputedStyle(t).getPropertyValue('--kit').trim(), dashed: getComputedStyle(t).borderStyle } : null; });
check('the kit looks different at the till: colour, KIT badge, contents, can make', tile && tile.kit && /KIT/.test(tile.text) && /Can make 3/.test(tile.text) && /Testing fee/.test(tile.text) && /Warning to give/.test(tile.text), JSON.stringify(tile));
check('…found by what it holds too (search "HIV" shows the kit and the strip)', await p.evaluate(() => document.querySelectorAll('.product-grid .product').length >= 2));
await p.screenshot({ path: path.join(out, 'till-kit-tile.png') });
await click('.product.kit-tile'); await wait(400);
check('adding the kit shows its warning first', /before you sell it/.test(await p.evaluate(() => document.querySelector('.modal.dialog')?.innerText || '')) && /counselling/.test(await p.evaluate(() => document.querySelector('.modal.dialog')?.innerText || '')));
await confirmDialog(); await wait(400);
check('the basket line is a kit line with its contents', await p.evaluate(() => { const l = document.querySelector('.cart-line.kit-line'); return !!l && /KIT/.test(l.innerText) && /2 × Blood Lancets/.test(l.innerText) && /Testing fee/.test(l.innerText); }));
check('…priced at the prices added up (7,750)', /7,750/.test(await p.evaluate(() => document.querySelector('.cart-line.kit-line .line-total')?.innerText || '')));
await p.evaluate(() => document.querySelector('.cart-line.kit-line button[aria-label="More"]').click()); await wait(300);
check('a second kit can be added', (await p.evaluate(() => document.querySelector('.cart-line.kit-line input[aria-label="Quantity"]').value)) === '2');
await p.evaluate(() => document.querySelector('.cart-line.kit-line button[aria-label="More"]').click()); await p.evaluate(() => document.querySelector('.cart-line.kit-line button[aria-label="More"]').click()); await wait(300);
check('…but never more than can be made (3)', (await p.evaluate(() => document.querySelector('.cart-line.kit-line input[aria-label="Quantity"]').value)) === '3');
await p.evaluate(() => document.querySelector('.cart-line.kit-line button[aria-label="Less"]').click()); await wait(200);
await click('button.btn.primary.big'); await wait(500);
check('charging waits for the warning to be ticked', /tick that the client was given the warning/.test(await body()) && !(await p.evaluate(() => !!document.querySelector('.modal.dialog'))));
await p.evaluate(() => document.querySelector('.kit-ack input').click()); await wait(200);
await p.screenshot({ path: path.join(out, 'till-kit-line.png') });
await click('button.btn.primary.big'); await wait(500);
check('the Rx medicine in the kit asks for the prescription', /Prescription-only/.test(await p.evaluate(() => document.querySelector('.modal.dialog')?.innerText || '')));
await confirmDialog();
check('the sale completes', await until(p, () => /Sale complete/.test(document.querySelector('.modal')?.innerText || '')));
const receipt = await p.evaluate(() => document.querySelector('.modal')?.innerText || '');
check('the receipt shows the kit with its contents', /HIV Test Kit/.test(receipt) && /KIT · Contains 1 × HIV Test Strip, 2 × Blood Lancets, 1 × Alcohol Swabs, 1 × Water for Injection 10ml, Testing fee/.test(receipt), receipt.slice(0, 400));
await p.screenshot({ path: path.join(out, 'kit-receipt.png') });
await p.keyboard.press('Escape'); await wait(300);
c = await cloudUntil((r) => (r.ex.sales || []).length === 1 && r.s['k-lancet'] === 3);
const sale1 = (c.ex.sales || [])[0];
check('stock: 2 strips, 4 lancets, 2 swabs, 2 WFI left their stock', c.s['k-strip'] === 8 && c.s['k-lancet'] === 3 && c.s['k-swab'] === 98 && c.s['k-wfi'] === 18, JSON.stringify(c.s));
const lancetMoves = (c.ex.movements || []).filter((m) => m.type === 'Sale' && m.productId === 'k-lancet').map((m) => [m.batchId, m.qty]).sort();
check('…the lancets first from the earliest-expiring batch (3 from BL1, 1 from BL2)', JSON.stringify(lancetMoves) === JSON.stringify([['b-l1', -3], ['b-l2', -1]]), JSON.stringify(lancetMoves));
check('the sale has one kit line at 7,750 × 2, its cost from the medicines', sale1 && sale1.items.length === 1 && sale1.items[0].kit && sale1.items[0].qty === 2 && sale1.items[0].price === 7750 && sale1.items[0].cost === 3350 && sale1.total === 15500, JSON.stringify(sale1?.items?.[0]));
check('…and records the warning as given (audit)', sale1?.items?.[0]?.kit?.acked === true && (c.ex.audit || []).some((a) => a.action === 'Kit warning given' && a.details.includes(sale1.number)));

// 4. one kit left to make: swap the short medicine for this sale
await go('#/pos'); await wait(800);
await typeIn('.search-row input', 'HIV Test Kit'); await wait(600);
check('the till now says can make 1', /Can make 1/.test(await p.evaluate(() => document.querySelector('.product.kit-tile')?.innerText || '')));
await click('.product.kit-tile'); await wait(400); await confirmDialog(); await wait(400);
await p.evaluate(() => document.querySelector('.cart-line.kit-line button[aria-label="More"]').click()); await wait(300);
check('a second kit is refused: only 1 can be made', (await p.evaluate(() => document.querySelector('.cart-line.kit-line input[aria-label="Quantity"]').value)) === '1');
await p.evaluate(() => document.querySelector('.cart-line.kit-line button[aria-label="Swap Blood Lancets in HIV Test Kit"]').click()); await wait(400);
check('swap offers other lancets in stock', /Safety Lancets/.test(await p.evaluate(() => document.querySelector('.modal')?.innerText || '')));
await click('.modal button.product', 'Safety Lancets'); await wait(400);
check('the line shows the swap', /Safety Lancets \(for Blood Lancets\)/.test(await p.evaluate(() => document.querySelector('.cart-line.kit-line')?.innerText || '')));
await p.evaluate(() => document.querySelector('.cart-line.kit-line button[aria-label="More"]').click()); await wait(300);
check('…and now two can be sold', (await p.evaluate(() => document.querySelector('.cart-line.kit-line input[aria-label="Quantity"]').value)) === '2');
await p.evaluate(() => document.querySelector('.kit-ack input').click());
await click('button.btn.primary.big'); await wait(500); await confirmDialog();
await until(p, () => /Sale complete/.test(document.querySelector('.modal')?.innerText || ''));
check('the receipt says what was swapped', /Safety Lancets instead of Blood Lancets/.test(await p.evaluate(() => document.querySelector('.modal')?.innerText || '')));
await p.keyboard.press('Escape'); await wait(300);
c = await cloudUntil((r) => (r.ex.sales || []).length === 2 && r.s['k-safety'] === 26);
check('the swapped sale took 4 safety lancets and no blood lancets', c.s['k-safety'] === 26 && c.s['k-lancet'] === 3 && c.s['k-strip'] === 6, JSON.stringify(c.s));
check('…with an audit line for the swap', (c.ex.audit || []).some((a) => a.action === 'Kit item swapped' && /Safety Lancets instead of Blood Lancets/.test(a.details)));

// 5. the kit's label: its barcode adds the kit at the till
await go('#/kits');
await click('.kit-card button', 'Label'); await wait(1200);
check('Barcode Labels opens with the kit on it', /KIT · HIV Test Kit/.test(await p.evaluate(() => document.querySelector('.label-sheet')?.innerText || '')) && await p.evaluate(() => !!document.querySelector('.label-sheet svg.barcode')));
await go('#/pos'); await wait(800);
await typeIn('.search-row input', kitRec.barcode); await wait(300);
await p.focus('.search-row input'); await p.keyboard.press('Enter'); await wait(500);
check('scanning the kit\'s label adds the kit (after its warning)', /before you sell it/.test(await p.evaluate(() => document.querySelector('.modal.dialog')?.innerText || '')), await p.evaluate(() => [document.querySelector('.search-row input')?.value, document.querySelector('.toasts')?.innerText].join(' / ')) + ' / ' + kitRec.barcode);
await confirmDialog(); await wait(300);
check('…as a kit line', await p.evaluate(() => !!document.querySelector('.cart-line.kit-line')));
await click('.cart-tools button', 'Clear all'); await wait(200);

// 6. a kit plus the same medicine on its own can't take more than is in stock
await typeIn('.search-row input', 'Blood Lancets'); await wait(600);
await click('.product-grid .product:not(.kit-tile)'); await wait(300);
await p.evaluate(() => { const i = document.querySelector('.cart-line input[aria-label="Quantity"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, '3'); i.dispatchEvent(new Event('input', { bubbles: true })); }); await wait(200);
await typeIn('.search-row input', 'HIV Test Kit'); await wait(600);
await click('.product.kit-tile'); await wait(400); await confirmDialog(); await wait(400);
check('a kit is refused when the basket already holds the lancets it needs', !(await p.evaluate(() => !!document.querySelector('.cart-line.kit-line'))) && /swap/i.test(await p.evaluate(() => document.querySelector('.modal')?.innerText || '') + await body()));
await p.keyboard.press('Escape'); await wait(200);
await click('.cart-tools button', 'Clear all'); await wait(200);

// 7. refund the first sale: every medicine goes back to its batch
await go('#/sales'); await wait(800);
await p.evaluate((n) => { const r = [...document.querySelectorAll('.page table tbody tr')].find((x) => x.innerText.includes(n)); const td = r.querySelector('td:nth-child(2)'); const bx = td.getBoundingClientRect(); td.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: bx.x + 5, clientY: bx.y + 5 })); }, sale1.number); await wait(300);
await click('.ctx-menu button, .ctx-menu [role=menuitem]', 'Refund'); await wait(400);
// the refund sheet: each kit medicine and its batch, the money back, a reason
const sheet = await p.evaluate(() => document.querySelector('.refund-sheet')?.innerText || '');
check('the refund sheet lists the kit\'s medicines and the money going back', /Money back to the customer/.test(sheet) && /Back to stock/i.test(sheet), sheet.slice(0, 300));
check('…and needs a reason first', await p.evaluate(() => document.querySelector('.refund-sheet button[type=submit]')?.disabled === true));
await p.select('.refund-sheet select', 'Customer returned it'); await wait(100);
await p.evaluate(() => document.querySelector('.refund-sheet button[type=submit]').click()); await wait(1200);
c = await cloudUntil((r) => (r.ex.sales || []).some((x) => x.number === sale1.number && x.status === 'refunded') && r.s['k-strip'] === 8);
check('the reason is kept on the sale', (c.ex.sales || []).find((x) => x.number === sale1.number)?.refundReason === 'Customer returned it');
check('a kit refund returns its medicines to stock', c.s['k-strip'] === 8 && c.s['k-lancet'] === 7 && c.s['k-swab'] === 98 && c.s['k-wfi'] === 18, JSON.stringify(c.s));
const back = (c.ex.movements || []).filter((m) => m.type === 'Refund' && m.productId === 'k-lancet').map((m) => [m.batchId, m.qty]).sort();
check('…into the batches they came from', JSON.stringify(back) === JSON.stringify([['b-l1', 3], ['b-l2', 1]]), JSON.stringify(back));

// 8. the cloud's checks: a kit sale is neither a price nor a stock finding
const found = ((await owner(`/tenants/${tid}/records?t=anomalies`)).rows || []).map((r) => r.rec);
check('the cloud found nothing wrong with the kit sales', found.length === 0, JSON.stringify(found.map((f) => f.detail)));
check('no errors on the pages', errors.length === 0, errors.join(' | '));

await b.close();
await owner('/tenants/' + tid + '/delete', { confirm: T.tenant.slug });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

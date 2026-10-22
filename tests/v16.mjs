// Batch 16: POS layout, edit sales/purchases/inventory, chat audience, call menu & speed, SMS test, auto reorder,
// stocked-only quick edit & stock card, dashboard links.   node v16.mjs <base> <ownerKey> <outDir>
import puppeteer from 'puppeteer-core';
import { CHROME } from './chrome.mjs';
import fs from 'node:fs';
const [base, ownerKey, out] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + String(x).slice(0, 170) : ''}`); };
const owner = (p, body) => fetch(base + '/api/owner' + p, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ownerKey }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());
const until = async (pg, fn, ms = 15000, arg) => { const end = Date.now() + ms; while (Date.now() < end) { if (await pg.evaluate(fn, arg).catch(() => false)) return true; await wait(300); } return false; };

const t = await owner('/tenants', { name: 'Kololo Test Pharmacy', admin: { name: 'Ada Admin', email: 'ada@test.rx', password: 'ada-pass-123' } });
const slug = t.tenant.slug, tid = t.tenant.id;
await owner('/tenants/' + tid + '/users', { user: { name: 'Dee Dispenser', email: 'dee@test.rx', role: 'dispenser', password: 'dee-pass-123', phone: '0772000222' } });
const exp = '2028-06-30', d = (n) => new Date(Date.now() - n * 864e5).toISOString();
const recs = [
  { t: 'batches', id: 'b1', rec: { productId: 'cat-1', batch: 'A1', expiry: exp, cost: 500 } },
  { t: 'batches', id: 'b2', rec: { productId: 'cat-2', batch: 'B1', expiry: exp, cost: 800 } },
  { t: 'batches', id: 'b3', rec: { productId: 'cat-3', batch: 'C1', expiry: exp, cost: 300 } },
  { t: 'movements', id: 'm1', rec: { productId: 'cat-1', qty: 100, type: 'Opening stock', batchId: 'b1', branchId: 'main', date: d(40) } },
  { t: 'movements', id: 'm2', rec: { productId: 'cat-2', qty: 50, type: 'Opening stock', batchId: 'b2', branchId: 'main', date: d(40) } },
  { t: 'movements', id: 'm3', rec: { productId: 'cat-3', qty: 20, type: 'Purchase', batchId: 'b3', branchId: 'main', date: d(5) } },
  { t: 'purchases', id: 'pu1', rec: { number: 'GRN-T1', supplierName: 'Test Supplier', invoice: 'INV-9', date: d(5).slice(0, 10), total: 6000, paid: 6000, branchId: 'main', receivedBy: 'Ada Admin', items: [{ productId: 'cat-3', name: 'Item three', qty: 20, cost: 300, batch: 'C1', expiry: exp, batchId: 'b3' }] } },
  { t: 'customers', id: 'cu1', rec: { name: 'Jane Client', phone: '0701234567' } },
];
// 30 days of sales of cat-1 (3 a day) → reorder level 3 × (7 + 7) = 42
for (let i = 1; i <= 30; i++) recs.push({ t: 'sales', id: 'hs' + i, rec: { number: 'H' + i, date: d(i), total: 3000, items: [{ id: 'cat-1', name: 'Item one', qty: 3, price: 1000, cost: 500, alloc: [] }], payment: 'Cash', cashier: 'Ada Admin', status: 'completed', branchId: 'main' } });
await owner('/tenants/' + tid + '/records', { records: recs });

// owner: SMS test without keys
let j = await fetch(base + `/api/owner/tenants/${tid}/test-sms`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ownerKey }, body: JSON.stringify({ to: '0772123456' }) }).then((r) => r.json());
check('owner "Send test SMS" explains when Africa’s Talking keys are missing', /not set up/i.test(j.error || ''), j.error);

const b = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
const errors = [];
const signIn = async (email, pw) => {
  const ctx = await b.createBrowserContext();
  await ctx.overridePermissions(base, ['microphone', 'notifications']);
  const p = await ctx.newPage(); await p.setViewport({ width: 1366, height: 860 });
  p.on('pageerror', (e) => errors.push(email + ': ' + e.message));
  await p.goto(base + '/' + slug, { waitUntil: 'networkidle2' }); await wait(1000);
  await p.type('input[autocomplete=username]', email); await p.type('input[type=password]', pw);
  await p.evaluate(() => [...document.querySelectorAll('button')].find((x) => x.textContent.includes('Sign in')).click());
  await until(p, () => !!document.querySelector('.sidebar'), 20000); await wait(5000);
  return p;
};
const go = async (p, h) => { await p.goto(base + '/' + slug + '#' + h, { waitUntil: 'networkidle2' }); await wait(1200); };
const A = await signIn('ada@test.rx', 'ada-pass-123');
const stockOf = async (name) => { await go(A, '/inventory'); return A.evaluate((n) => { const r = [...document.querySelectorAll('tbody tr')].find((x) => x.innerText.includes(n)); return r ? Number(r.querySelectorAll('td')[5].innerText.trim()) : null; }, name); };

// #10 dashboard links
await go(A, '/');
await A.evaluate(() => [...document.querySelectorAll('.stat.link')].find((s) => /low stock/i.test(s.innerText)).click()); await wait(1000);
check('dashboard "Low stock" tile opens Inventory on the Low stock tab', A.url().includes('#/inventory') && /low stock/i.test(await A.evaluate(() => document.querySelector('.tab.active')?.innerText || '')));
await go(A, '/');
await A.evaluate(() => [...document.querySelectorAll('.stat.link')].find((s) => /today's sales/i.test(s.innerText)).click()); await wait(1000);
check('"Today\'s sales" tile opens Sales History filtered to today', A.url().includes('#/sales') && (await A.evaluate(() => [...document.querySelectorAll('input[type=date]')].map((i) => i.value).join(','))) === `${new Date().toISOString().slice(0, 10)},${new Date().toISOString().slice(0, 10)}`);
check('all 8 dashboard tiles are links', (await (async () => { await go(A, '/'); return A.evaluate(() => document.querySelectorAll('.stat.link').length); })()) >= 8);

// #8 quick edit & #9 stock card: stocked items only
await go(A, '/quick-edit');
const qrows = await A.evaluate(() => document.querySelectorAll('table.lines tbody tr').length);
check('Quick Edit lists only medicines in stock (3), not the 9,710 catalog', qrows === 3, qrows);
await go(A, '/stock-card');
const sopts = await A.evaluate(() => document.querySelectorAll('.page-head select option').length);
check('Stock Card choices are only medicines in stock', sopts === 3, sopts);

// #1 POS layout + sale
await go(A, '/pos');
const widths = await A.evaluate(() => ({ cart: document.querySelector('.pos-cart').getBoundingClientRect().width, prods: document.querySelector('.pos-products').getBoundingClientRect().width }));
check('POS "Current sale" panel is wider (≥ 470 px at 1366 px)', widths.cart >= 470, JSON.stringify(widths));
for (const id of ['cat-1', 'cat-2', 'cat-3']) {
  await A.evaluate(() => { const i = document.querySelector('.pos-search input, input.search'); i.value = ''; });
}
await A.evaluate(() => { const ps = [...document.querySelectorAll('.product:not(.disabled)')].slice(0, 3); ps.forEach((p) => p.click()); });
await wait(400);
await A.evaluate(() => { const ps = [...document.querySelectorAll('.product:not(.disabled)')].slice(0, 1); ps.forEach((p) => p.click()); });
await wait(300);
const fits = await A.evaluate(() => { const l = document.querySelector('.cart-lines'); return { lines: document.querySelectorAll('.cart-line').length, scroll: l.scrollHeight > l.clientHeight + 2 }; });
check('a multi-item sale shows without scrolling', fits.lines >= 3 && !fits.scroll, JSON.stringify(fits));
await A.screenshot({ path: out + '/01-pos.png' });
const before1 = await (async () => { const r = await A.evaluate(() => [...document.querySelectorAll('.cart-line')].map((l) => l.querySelector('strong').innerText)); return r; })();
await A.evaluate(() => [...document.querySelectorAll('.pos-cart .btn.primary')].find((x) => /Charge/.test(x.textContent)).click()); await wait(1200);
const dlg = await A.$('.dialog .btn.primary'); if (dlg) { await dlg.click(); await wait(1000); }
await A.keyboard.press('Escape'); await wait(500);

// #2 edit the sale: first line 2 → 1, remove the last line
const name1 = before1[0];
const s0 = await stockOf(name1);
await go(A, '/sales');
await A.evaluate(() => [...document.querySelectorAll('tbody tr')][0].querySelector('button[class*="ghost"]:nth-of-type(2)')?.click());
await wait(600);
check('sale editor opens for the admin', await A.evaluate(() => /Edit sale/.test(document.querySelector('.modal')?.innerText || '')));
await A.evaluate(() => { const r = document.querySelectorAll('.modal tbody tr'); const q = r[0].querySelector('input'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(q, '1'); q.dispatchEvent(new Event('input', { bubbles: true })); r[r.length - 1].querySelector('button[title="Remove"]').click(); });
await A.type('.modal input[placeholder^="e.g. wrong"]', 'Customer returned one');
await A.screenshot({ path: out + '/02-edit-sale.png' });
await A.evaluate(() => [...document.querySelectorAll('.modal button')].find((x) => x.textContent.includes('Save changes')).click()); await wait(1000);
const s1 = await stockOf(name1);
check('editing a sale returns stock to inventory', s1 === s0 + 1, `${s0} → ${s1}`);
await go(A, '/sales');
check('edited sale is marked "edited"', /edited/i.test(await A.evaluate(() => document.querySelector('tbody tr')?.innerText || '')));

// #2 edit a purchase: 20 → 15
const p0 = await stockOf('Item three') ?? await stockOf(await A.evaluate(() => ''));
await go(A, '/purchases');
await A.evaluate(() => [...document.querySelectorAll('tbody tr button')].find((x) => x.textContent.includes('Edit')).click()); await wait(600);
await A.evaluate(() => { const qty = document.querySelectorAll('.modal tbody tr td input')[2]; const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(qty, '15'); qty.dispatchEvent(new Event('input', { bubbles: true })); });
await A.type('.modal input[placeholder^="e.g. invoice"]', 'Invoice said 15');
await A.evaluate(() => [...document.querySelectorAll('.modal button')].find((x) => x.textContent.includes('Save changes')).click()); await wait(1000);
await go(A, '/purchases');
check('edited purchase total updated (15 × 300 = 4,500)', /4,500/.test(await A.evaluate(() => document.querySelector('tbody tr')?.innerText || '')));
await go(A, '/stock-card');
const third = await A.evaluate(() => { const s = document.querySelector('.page-head select'); const o = [...s.options].find((x) => /three|cat/i.test(x.text)) || s.options[2]; return o?.text; });

// #7 inventory edit: change the first item's quantity by +5
await go(A, '/inventory');
const invName = await A.evaluate(() => document.querySelector('tbody tr strong')?.innerText);
const i0 = await stockOf(invName);
await A.evaluate(() => document.querySelector('tbody tr button').click()); await wait(600);
check('Inventory has an Edit button for the admin', await A.evaluate(() => /Batches at this branch/.test(document.querySelector('.modal')?.innerText || '')));
await A.evaluate((n) => { const q = [...document.querySelectorAll('.modal tbody tr')][0].querySelectorAll('input')[2]; const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(q, String(n)); q.dispatchEvent(new Event('input', { bubbles: true })); }, i0 + 5);
await A.type('.modal input[placeholder^="e.g. stock take"]', 'Stock take');
await A.evaluate(() => [...document.querySelectorAll('.modal button')].find((x) => x.textContent.trim() === 'Save').click()); await wait(1000);
check('inventory edit changes the stock', (await stockOf(invName)) === i0 + 5, `${i0} → ${await stockOf(invName)}`);

// #6 automatic reorder levels
await go(A, '/reorder');
await A.evaluate(() => [...document.querySelectorAll('button')].find((x) => x.textContent.includes('Set reorder levels from sales')).click()); await wait(600);
const lv = await A.evaluate(() => [...document.querySelectorAll('.modal tbody tr')].map((r) => r.innerText.replace(/\s+/g, ' ')));
check('reorder level computed from 30 days of sales (3/day × 14 days = 42)', lv.some((r) => / 42$/.test(r.trim())), lv.join(' | '));
await A.screenshot({ path: out + '/03-reorder.png' });
await A.evaluate(() => [...document.querySelectorAll('.modal button')].find((x) => /^Apply/.test(x.textContent.trim())).click()); await wait(800);
await go(A, '/inventory');
check('reorder level saved on the medicine', await A.evaluate(() => [...document.querySelectorAll('tbody tr')].some((r) => r.querySelectorAll('td')[4]?.innerText.trim() === '42')));

// #3 chat audience
await go(A, '/chat');
check('chat lets you choose whole team or a private chat', await A.evaluate(() => { const t = [...document.querySelectorAll('.chat-conv')].map((x) => x.innerText).join('|'); return /General/.test(t) && /Dee Dispenser/.test(t); }));
await A.evaluate(() => [...document.querySelectorAll('.chat-conv')].find((x) => /Dee Dispenser/.test(x.innerText)).click()); await wait(400);
check('choosing a colleague switches to a private chat', /Dee Dispenser/.test(await A.evaluate(() => document.querySelector('.chat-title')?.innerText || '')));
// #4 call menu
await A.evaluate(() => document.querySelector('.chat-head .call-menu button').click()); await wait(300);
const menu = await A.evaluate(() => document.querySelector('.call-pop')?.innerText || '');
check('call menu offers in-app, WhatsApp and phone call', /In-app call/.test(menu) && /WhatsApp/.test(menu) && /Phone call/.test(menu), menu.replace(/\n/g, ' | '));
await A.screenshot({ path: out + '/04-call-menu.png' });
await go(A, '/customers');
await A.evaluate(() => document.querySelector('tbody .call-menu button')?.click()); await wait(300);
const cmenu = await A.evaluate(() => document.querySelector('.call-pop')?.innerText || '');
check('customer call menu offers WhatsApp and phone call', /WhatsApp/.test(cmenu) && /Phone call/.test(cmenu));

// #4 call speed
const B = await signIn('dee@test.rx', 'dee-pass-123');
await go(B, '/');
await go(A, '/chat');
await A.evaluate(() => [...document.querySelectorAll('.chat-conv')].find((x) => /Dee Dispenser/.test(x.innerText)).click()); await wait(300);
await A.evaluate(() => document.querySelector('.chat-head .call-menu button').click()); await wait(200);
const t0 = Date.now();
await A.evaluate(() => [...document.querySelectorAll('.call-pop button')].find((x) => x.textContent.includes('In-app')).click());
const rang = await until(B, () => /Incoming call/.test(document.querySelector('.call-screen')?.innerText || ''), 15000);
const ringMs = Date.now() - t0;
check('the call rings on the other device in under 3 seconds', rang && ringMs < 3000, ringMs + ' ms');
const t1 = Date.now();
await B.evaluate(() => document.querySelector('.call-btn.accept')?.click());
const live = await until(A, () => /live/.test(document.querySelector('.call-screen')?.className || ''), 15000);
check('answered call connects in under 3 seconds', live && Date.now() - t1 < 3000, (Date.now() - t1) + ' ms');
await A.evaluate(() => document.querySelector('.call-btn.end')?.click()); await wait(1500);

// permissions: a dispenser cannot edit sales or inventory
await go(B, '/sales');
check('dispenser has no Edit button on sales', !(await B.evaluate(() => [...document.querySelectorAll('tbody button')].some((x) => /^\s*Edit\s*$/.test(x.textContent)))));
console.log(`\nerrors: ${errors.length ? [...new Set(errors)].slice(0, 5).join(' | ') : 'none'}`);
console.log(`${pass} passed, ${fail} failed`);
await b.close();

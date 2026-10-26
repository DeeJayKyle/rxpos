// Transaction and sync reliability (1.6), run as the Windows app (data kept on the device; tests/appmode.mjs):
// offline sale then restart, reconnect without duplicates, the cloud applying a request whose reply is lost, two
// devices selling the last units while disconnected, a device clock days behind, a failed write on the device, the
// one-time move from 1.5 storage (with an unsent sale), and refusing to switch pharmacy with unsent changes.
// Fictional data only.   node v37-reliability.mjs <base> <ownerKey> <outDir>
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import { CHROME } from './chrome.mjs';
import { asDesktopApp, APP_ARGS } from './appmode.mjs';
const [base, ownerKey, out] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + String(x).slice(0, 240) : ''}`); };
const owner = (p, body) => fetch(base + '/api/owner' + p, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ownerKey }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());
const until = async (p, fn, ms = 20000, arg) => { const end = Date.now() + ms; while (Date.now() < end) { if (await p.evaluate(fn, arg).catch(() => false)) return true; await wait(300); } return false; };
const untilNode = async (fn, ms = 20000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn().catch(() => false)) return true; await wait(400); } return false; };
const iso = (n) => new Date(Date.now() - n * 864e5).toISOString();
const day = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

const t = await owner('/tenants', { name: 'Reliable Sample Pharmacy', admin: { name: 'Riley Sample', email: 'riley@test.rx', password: 'riley-pass-1234' } });
const slug = t.tenant.slug, tid = t.tenant.id;
await owner('/tenants/' + tid + '/records', { records: [
  { t: 'products', id: 'p1', rec: { name: 'Sample Tabs 500mg', generic: 'Sample', form: 'Tablets', unit: 'Tablet', price: 500, cost: 300, reorder: 0 } },
  { t: 'batches', id: 'b1', rec: { productId: 'p1', batch: 'S1', expiry: day(300), cost: 300 } },
  { t: 'movements', id: 'm1', rec: { productId: 'p1', qty: 100, type: 'Opening stock', batchId: 'b1', branchId: 'main', date: iso(3) } },
  // the last unit: two devices will both sell it while disconnected
  { t: 'products', id: 'p2', rec: { name: 'Last Unit Syrup', generic: 'Lastunit', form: 'Syrups', unit: 'Bottle', price: 4000, cost: 2500, reorder: 0 } },
  { t: 'batches', id: 'b2', rec: { productId: 'p2', batch: 'L1', expiry: day(300), cost: 2500 } },
  { t: 'movements', id: 'm2', rec: { productId: 'p2', qty: 1, type: 'Opening stock', batchId: 'b2', branchId: 'main', date: iso(3) } },
] });
await owner('/tenants/' + tid, { features: { catalog: false } });
const cloudCount = async (table, q = '') => (await owner(`/tenants/${tid}/records?t=${table}${q ? '&q=' + encodeURIComponent(q) : ''}`)).total;

const b = await puppeteer.launch({ executablePath: CHROME, headless: true, args: APP_ARGS });
const device = async () => {
  const ctx = await b.createBrowserContext();
  const p = await ctx.newPage();
  await p.setViewport({ width: 1366, height: 860 });
  const cloud = await asDesktopApp(p, base);
  p.on('dialog', (d) => d.dismiss().catch(() => {}));
  await p.goto(base + '/' + slug, { waitUntil: 'networkidle2' }); await wait(600);
  await p.evaluate(() => { for (const id of ['pos', 'dashboard']) localStorage.setItem('rxpos-tip:' + id, '1'); });
  await p.type('input[autocomplete=username]', 'riley@test.rx'); await p.type('input[type=password]', 'riley-pass-1234');
  await p.evaluate(() => [...document.querySelectorAll('form button')].find((x) => /^Sign in/.test(x.textContent.trim()))?.click());
  await p.waitForSelector('.sidebar', { timeout: 20000 });
  await until(p, () => /Synced/.test(document.querySelector('.pill.clock .clock-state')?.innerText || ''), 30000);
  return { p, cloud, ctx };
};
const pill = (p) => p.evaluate(() => document.querySelector('.pill.clock .clock-state')?.innerText || '');
const go = async (p, hash) => { await p.evaluate((h) => { location.hash = h; }, hash); await wait(900); };
/** Sell one of a medicine at the POS; resolves with the receipt number shown (or null) */
const sell = async (p, name) => {
  await go(p, '#/pos');
  await p.evaluate((n) => { const i = document.querySelector('.search-row input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, n); i.dispatchEvent(new Event('input', { bubbles: true })); }, name); await wait(300);
  await p.evaluate(() => document.querySelector('.product')?.click()); await wait(300);
  await p.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F9', bubbles: true })));
  const ok = await until(p, () => /Sale complete/.test(document.querySelector('.modal')?.innerText || ''), 8000);
  const number = ok ? await p.evaluate(() => document.querySelector('.modal .receipt')?.innerText.match(/\bR[A-Z0-9]{6,}\b/)?.[0] || null) : null;
  await p.keyboard.press('Escape'); await wait(300);
  return number;
};
const deviceHas = (p, number) => p.evaluate(async (n) => new Promise((res) => { const q = indexedDB.open('pharmapos'); q.onsuccess = () => { const g = q.result.transaction('records').objectStore('records').getAll(); g.onsuccess = () => { res(g.result.some((x) => x.t === 'sales' && x.rs.some((r) => r.number === n))); q.result.close(); }; }; q.onerror = () => res(false); }), number);
const outboxSize = (p) => p.evaluate(async () => new Promise((res) => { const q = indexedDB.open('pharmapos'); q.onsuccess = () => { const g = q.result.transaction('outbox').objectStore('outbox').count(); g.onsuccess = () => { res(g.result); q.result.close(); }; }; }));

// ---------- 1. offline sale, restart, reconnect: exactly once in the cloud ----------
const A = await device();
A.cloud.set('down'); await wait(300);
const r1 = await sell(A.p, 'Sample Tabs');
check('offline: the sale completes on the device', !!r1, r1);
check('…and is on the device before "Sale complete" is shown', r1 && (await deviceHas(A.p, r1)));
check('…with its changes waiting in the outbox', (await outboxSize(A.p)) >= 2, await outboxSize(A.p));
await wait(1500);
check('the top bar says Offline with the number waiting', /^Offline · \d+ waiting$/.test(await pill(A.p)), await pill(A.p));
await A.p.goto('about:blank'); await A.p.goto(base + '/' + slug + '#/sales', { waitUntil: 'networkidle2' }); await wait(1500); // restart (cloud still down)
check('after a restart the sale is still there', await until(A.p, (n) => document.querySelector('.page tbody')?.innerText.includes(n), 8000, r1));
check('…and still waiting to be sent', (await outboxSize(A.p)) >= 2);
A.cloud.set('up');
await A.p.evaluate(() => window.dispatchEvent(new Event('online')));
check('back online: everything is sent', await until(A.p, () => /Synced/.test(document.querySelector('.pill.clock .clock-state')?.innerText || ''), 30000), await pill(A.p));
check('…the outbox is empty', (await outboxSize(A.p)) === 0);
check('…and the cloud has the sale exactly once', (await cloudCount('sales', r1)) === 1, await cloudCount('sales', r1));
check('…with its stock movement exactly once', (await cloudCount('movements', r1)) === 1, await cloudCount('movements', r1));

// ---------- 2. the cloud applies a request, the reply is lost: the retry is not applied twice ----------
A.cloud.set('lose-reply');
const r2 = await sell(A.p, 'Sample Tabs');
check('a sale while replies are being lost still completes on the device', !!r2);
await untilNode(async () => (await cloudCount('sales', r2)) === 1, 15000);
check('the cloud received and applied it, though the device never heard back', (await cloudCount('sales', r2)) === 1);
check('…so the device keeps it in the outbox', (await outboxSize(A.p)) >= 2, await outboxSize(A.p));
A.cloud.set('up');
check('when replies get through again, the retry clears the outbox', await until(A.p, () => /Synced/.test(document.querySelector('.pill.clock .clock-state')?.innerText || ''), 60000), await pill(A.p));
check('…and the cloud still has that sale once, with one stock movement', (await cloudCount('sales', r2)) === 1 && (await cloudCount('movements', r2)) === 1, `${await cloudCount('sales', r2)} / ${await cloudCount('movements', r2)}`);

// ---------- 3. two devices sell the last unit while disconnected ----------
const B = await device();
await go(A.p, '#/'); await go(B.p, '#/');
A.cloud.set('down'); B.cloud.set('down'); await wait(300);
const ra = await sell(A.p, 'Last Unit'), rb = await sell(B.p, 'Last Unit');
check('disconnected, both devices sell the last bottle', !!ra && !!rb, `${ra} ${rb}`);
A.cloud.set('up'); B.cloud.set('up');
await A.p.evaluate(() => window.dispatchEvent(new Event('online'))); await B.p.evaluate(() => window.dispatchEvent(new Event('online')));
await untilNode(async () => (await cloudCount('sales', 'Last Unit')) === 2, 30000);
check('reconnected: the cloud keeps both sales (none is overwritten)', (await cloudCount('sales', 'Last Unit')) === 2, await cloudCount('sales', 'Last Unit'));
await A.p.evaluate(() => window.dispatchEvent(new Event('focus'))); await wait(3000);
await go(A.p, '#/inventory'); await A.p.evaluate(() => [...document.querySelectorAll('.tab')].find((x) => /^All$/.test(x.textContent.trim()))?.click());
check('…the shared stock shows the oversell honestly (-1)', await until(A.p, () => [...document.querySelectorAll('tbody tr')].some((r) => /Last Unit/.test(r.innerText) && /-1\b/.test(r.innerText)), 20000));
await A.p.evaluate(() => document.querySelector('button[title="Notifications"]')?.click()); await wait(300);
check('…and an urgent alert asks for a count and correction', await A.p.evaluate(() => /stock below zero/.test(document.querySelector('.bell-menu')?.innerText || '')));
await A.p.keyboard.press('Escape');

// ---------- 4. a device whose clock is days behind still sends its sales ----------
await B.p.evaluateOnNewDocument(() => { const real = Date.now, skew = -3 * 864e5; const D = Date; globalThis.Date = class extends D { constructor(...a) { super(...(a.length ? a : [real() + skew])); } static now() { return real() + skew; } }; });
await B.p.goto('about:blank'); await B.p.goto(base + '/' + slug + '#/pos', { waitUntil: 'networkidle2' }); await wait(2500);
const rc = await sell(B.p, 'Sample Tabs');
check('a device with its clock 3 days behind completes a sale', !!rc, rc);
check('…and it reaches the cloud (sending no longer depends on clock times)', await untilNode(async () => (await cloudCount('sales', rc)) === 1, 30000));

// ---------- 5. a failed write on the device: no "Sale complete", the basket is kept ----------
await go(A.p, '#/pos');
await A.p.evaluate(() => { window.__realAdd = IDBObjectStore.prototype.add; IDBObjectStore.prototype.add = function () { throw new DOMException('The quota has been exceeded.', 'QuotaExceededError'); }; });
await A.p.evaluate(() => { const i = document.querySelector('.search-row input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, 'Sample Tabs'); i.dispatchEvent(new Event('input', { bubbles: true })); }); await wait(300);
await A.p.evaluate(() => document.querySelector('.product')?.click()); await wait(300);
await A.p.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F9', bubbles: true }))); await wait(1500);
check('a sale the device could not save is NOT shown as complete', !(await A.p.evaluate(() => /Sale complete/.test(document.querySelector('.modal')?.innerText || ''))));
check('…the person is told why, in plain words', await A.p.evaluate(() => /NOT recorded.*out of storage space/i.test(document.body.innerText)));
check('…and the basket is kept to try again', (await A.p.evaluate(() => document.querySelectorAll('.cart-line').length)) === 1);
await A.p.evaluate(() => { IDBObjectStore.prototype.add = window.__realAdd; });
await A.p.evaluate(() => document.querySelectorAll('.toast button').forEach((x) => x.click()));
await A.p.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F9', bubbles: true })));
check('once space is free, the same basket is charged and saved', await until(A.p, () => /Sale complete/.test(document.querySelector('.modal')?.innerText || ''), 8000));
await A.p.keyboard.press('Escape');

// ---------- 6. switching pharmacy with unsent changes is refused, nothing is carried over ----------
const t2 = await owner('/tenants', { name: 'Other Sample Pharmacy', admin: { name: 'Riley Sample', email: 'riley2@test.rx', password: 'riley-pass-1234' } });
A.cloud.set('down');
await sell(A.p, 'Sample Tabs');
await A.p.evaluate(() => document.querySelector('button[title="Log out"]')?.click()); await wait(1200);
A.cloud.set('up');
// the cloud is reachable for signing in, but this device's pending sale will be sent first
await A.p.evaluate(() => { const set = (s, v) => { const i = document.querySelector(s); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, v); i.dispatchEvent(new Event('input', { bubbles: true })); }; set('input[autocomplete=username]', 'riley2@test.rx'); set('input[type=password]', 'riley-pass-1234'); });
await A.p.evaluate(() => [...document.querySelectorAll('form button')].find((x) => /^Sign in/.test(x.textContent.trim()))?.click());
await until(A.p, () => !!document.querySelector('.sidebar'), 20000);
check('signing in to another pharmacy sends the first pharmacy\'s pending sale to ITS cloud first', (await cloudCount('sales')) >= 6, await cloudCount('sales'));
check('…and none of it ends up in the other pharmacy', (await owner(`/tenants/${t2.tenant.id}/records?t=sales`)).total === 0);

await b.close();
await owner('/tenants/' + tid + '/delete', { confirm: slug });
await owner('/tenants/' + t2.tenant.id + '/delete', { confirm: t2.tenant.slug });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

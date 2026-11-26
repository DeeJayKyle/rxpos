// A Mobile Money payment received after the till closed (2026-11-26, worker/payments.js): the till shows it, a person
// loads its saved basket and records the sale against it without asking the phone again, or marks it handled with a
// note. The cloud's /api/pay/open and /api/pay/link are played here (the local cloud has no MTN keys); their own rules
// are checked in unit-pay-callbacks.mjs.   node v89-momo-recover.mjs <base> <ownerKey> <outDir>
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
import { CHROME } from './chrome.mjs';
const [base, ownerKey, out] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' && !ok ? '  ' + String(x).slice(0, 300) : ''}`); };
const owner = (p, body) => fetch(base + '/api/owner' + p, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ownerKey }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());
const iso = (n) => new Date(Date.now() - n * 864e5).toISOString();
const day = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

const t = await owner('/tenants', { name: 'Ntinda Recovery Pharmacy', admin: { name: 'Grace Namata', email: 'grace@recover.rx', password: 'grace-pass-1234' } });
const slug = t.tenant.slug, tid = t.tenant.id;
const recs = [];
[['Amoxil 500mg Caps', 2000], ['Panadol 500mg Tablets', 500]].forEach(([name, price], i) => {
  recs.push({ t: 'products', id: 'p' + i, rec: { name, generic: name.split(' ')[0], form: 'Tablets', price, cost: Math.round(price * 0.6), reorder: 5, unit: 'Unit' } });
  recs.push({ t: 'batches', id: 'b' + i, rec: { productId: 'p' + i, batch: 'B' + i, expiry: day(500), cost: Math.round(price * 0.6) } });
  recs.push({ t: 'movements', id: 'm' + i, rec: { productId: 'p' + i, qty: 100, type: 'Opening stock', batchId: 'b' + i, branchId: 'main', date: iso(30) } });
});
await owner('/tenants/' + tid + '/records', { records: recs });
await owner('/tenants/' + tid, { features: { catalog: false } });

// two payments the cloud says were received with no sale: one with its basket (2 × Amoxil + 2 × Panadol = 5,000)
const line = (id, name, price, qty) => ({ id, name, price, cost: Math.round(price * 0.6), qty, max: 100 });
let open = [
  { provider: 'mtn', ref: 'ref-basket', phone: '256770000123', amount: 5000, currency: 'UGX', status: 'SUCCESSFUL', txid: 'MTN-777', cashier: 'Grace Namata', createdAt: iso(0.01), basket: { cart: [line('p0', 'Amoxil 500mg Caps', 2000, 2), line('p1', 'Panadol 500mg Tablets', 500, 2)], customerId: 'walk-in', discount: 0, payment: 'Mobile Money', branchId: 'main', mode: 'retail' } },
  { provider: 'airtel', ref: 'ref-other', phone: '256750000456', amount: 1500, currency: 'UGX', status: 'SUCCESSFUL', txid: 'AIR-888', cashier: 'Grace Namata', createdAt: iso(0.02), basket: null },
];
const links = [];
const asked = [];

const b = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
const errors = [];
const P = await (await b.createBrowserContext()).newPage();
P.on('pageerror', (e) => errors.push(e.message));
await P.setViewport({ width: 1366, height: 860 });
await P.setRequestInterception(true);
const reply = (r, body) => r.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(body) });
P.on('request', (r) => {
  const u = r.url();
  if (r.method() === 'OPTIONS' && u.includes('/api/pay/')) return r.respond({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' } });
  if (u.includes('/api/pay/open')) return reply(r, { payments: open, pending: 0 });
  if (u.includes('/api/pay/link')) { const body = JSON.parse(r.postData() || '{}'); links.push(body); open = open.filter((p) => p.ref !== body.ref); return reply(r, { ok: true }); }
  if (u.includes('/api/pay/request')) { asked.push(u); return reply(r, { ref: 'should-not-happen', provider: 'mtn' }); }
  return r.continue();
});
await P.goto(base + '/' + slug, { waitUntil: 'networkidle2' }); await wait(800);
await P.type('input[autocomplete=username]', 'grace@recover.rx'); await P.type('input[type=password]', 'grace-pass-1234');
await P.evaluate(() => [...document.querySelectorAll('button')].find((x) => x.textContent.includes('Sign in')).click());
await wait(4000);
await P.goto(base + '/' + slug + '#/pos', { waitUntil: 'networkidle2' }); await wait(2500);
await P.evaluate(() => document.querySelectorAll('.page-tip button, .tip-chip, .tour button').forEach((x) => /Got it|Skip|Close/i.test(x.textContent) && x.click()));

const banner = await P.evaluate(() => document.querySelector('.momo-unrec')?.innerText || '');
check('the till shows payments received with no sale', /2 Mobile Money payments were received/.test(banner), banner);
await P.evaluate(() => [...document.querySelectorAll('.momo-unrec button')].find((x) => /Review/.test(x.textContent))?.click()); await wait(500);
const list = await P.evaluate(() => document.querySelector('.modal')?.innerText || '');
check('the list names the amount, network, phone, transaction and basket', /5,?000/.test(list) && /MTN MoMo/.test(list) && /256770000123/.test(list) && /MTN-777/.test(list) && /2 × Amoxil/.test(list) && /No basket was saved/.test(list), list);
await P.screenshot({ path: path.join(out, 'received-not-recorded.png') });

// record the sale from the basket
await P.evaluate(() => [...document.querySelectorAll('.modal button')].find((x) => /Load the basket/.test(x.textContent))?.click()); await wait(800);
const cart = await P.evaluate(() => ({ lines: document.querySelectorAll('.pos-cart .cart-line').length, pay: document.querySelector('.pay-methods .chip.active')?.innerText || '' }));
check('the basket is on the till, paid by Mobile Money', cart.lines === 2 && /Mobile Money/.test(cart.pay), JSON.stringify(cart));
await P.evaluate(() => [...document.querySelectorAll('.pos-cart button')].find((x) => /^Charge/.test(x.textContent.trim()) && x.getClientRects().length)?.click()); await wait(2000);
const done = await P.evaluate(() => document.querySelector('.modal')?.innerText || '');
check('Charge records the sale at once (no new request to the phone)', /Receipt|Sale complete|R-/i.test(done) && !asked.length && !/Send payment request/.test(done), done.slice(0, 200));
await P.screenshot({ path: path.join(out, 'recorded.png') });
const claim = links[0], final = links[1];
check('the payment was claimed for the sale before it was saved, then linked with its number', !!claim?.saleId && claim.ref === 'ref-basket' && final?.saleId === claim.saleId && /\S/.test(final?.saleNumber || ''), JSON.stringify(links));
await P.evaluate(() => document.querySelector('.modal .modal-close, .modal button[aria-label="Close"]')?.click()); await P.keyboard.press('Escape'); await wait(500);

// the other one: handled another way, with a note
await P.evaluate(() => [...document.querySelectorAll('.momo-unrec button')].find((x) => /Review/.test(x.textContent))?.click()); await wait(500);
await P.evaluate(() => [...document.querySelectorAll('.modal button')].find((x) => /Handled another way/.test(x.textContent))?.click()); await wait(500);
const input = await P.$('.modal input, .modal textarea');
if (input) { await input.type('Refunded to the customer'); await wait(200); }
await P.evaluate(() => [...document.querySelectorAll('.modal button')].find((x) => /Mark handled/.test(x.textContent))?.click()); await wait(1000);
const note = links.find((l) => l.ref === 'ref-other');
check('a payment handled another way is marked with the note', note?.note === 'Refunded to the customer' && !note.saleId, JSON.stringify(links));
const after = await P.evaluate(() => document.querySelector('.momo-unrec')?.innerText || '');
check('nothing is left waiting', !after, after);
check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

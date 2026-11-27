// From the SmarterPOS review (27 Nov 2026), in the app against the local cloud: the public front page of rxposug.com
// (shown here with this tab's test flag, since the test site isn't rxposug.com) with its contact form and Sign in; a
// batch sold below zero shown on the dashboard; the sync status in sight while all is well; "Customer asked: note it"
// at the till, for an out-of-stock medicine and for one not stocked, shown on Reorder. Fictional data only.
//   node v93-shop-window.mjs <base> <ownerKey>
import puppeteer from 'puppeteer-core';
import { CHROME } from './chrome.mjs';
const [base, ownerKey] = process.argv.slice(2);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + String(x).slice(0, 300) : ''}`); };
const owner = (p, body) => fetch(base + '/api/owner' + p, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ownerKey }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());
const recs = async (tid, t) => ((await owner(`/tenants/${tid}/records?t=${t}&offset=0`)).rows || []).map((r) => r.rec);
const until = async (p, fn, ms = 20000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await p.evaluate(fn).catch(() => false)) return true; await wait(300); } return false; };
const ago = (h) => new Date(Date.now() - h * 36e5).toISOString();
const day = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const errors = [];
const b = await puppeteer.launch({ executablePath: CHROME, headless: true });
const page = async (w = 1280, h = 860, welcome = true) => {
  const p = await (await b.createBrowserContext()).newPage();
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('dialog', (d) => d.dismiss().catch(() => {}));
  await p.setViewport({ width: w, height: h, isMobile: w < 600, hasTouch: w < 600 });
  if (welcome) await p.evaluateOnNewDocument(() => { try { sessionStorage.setItem('rxpos-test-welcome', '1'); } catch { /* ignore */ } });
  return p;
};

// ---- the front page ----
let p = await page();
await p.goto(base + '/', { waitUntil: 'networkidle2' }); await wait(800);
const front = await p.evaluate(() => document.querySelector('.front-page')?.innerText || '');
check('the home address shows the front page, not the sign-in form', !!front && !(await p.$('input[type=password]')), front.slice(0, 120));
check('…what RxPOS does for a pharmacy: 8 features, the steps, the apps and questions', await p.evaluate(() => document.querySelectorAll('.wl-card').length === 8 && document.querySelectorAll('.wl-steps li').length === 3 && document.querySelectorAll('.wl-faq details').length >= 6 && !!document.querySelector('.front-page .app-downloads')));
check('…search engines get a description and the app\'s details', await p.evaluate(() => /pharmacy/i.test(document.querySelector('meta[name=description]')?.content || '') && /SoftwareApplication/.test(document.querySelector('script[type="application/ld+json"]')?.textContent || '')));
await p.type('.wl-form input[autocomplete=name]', 'Grace Test');
await p.type('.wl-form input[autocomplete=organization]', 'Sample Hill Pharmacy');
await p.type('.wl-form input[type=tel]', '0772 000 111');
let sent = null;
p.on('request', (r) => { if (r.url().endsWith('/api/contact')) sent = r.postData(); });
await p.evaluate(() => document.querySelector('.wl-form button.primary').click());
await until(p, () => !!document.querySelector('.wl-form .error, .wl-sent'), 15000);
const reply = await p.evaluate(() => (document.querySelector('.wl-form .error') || document.querySelector('.wl-sent'))?.innerText || '');
check('Talk to us: the form goes to the cloud with what was typed', !!sent && /Sample Hill Pharmacy/.test(sent) && /0772 000 111/.test(sent), sent);
// the local cloud has no email account: it says so plainly, never pretends it was sent
check('…and the answer is shown (no email account here: "could not be sent")', /could not be sent|Thank you/.test(reply), reply);
const direct = await fetch(base + '/api/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'X', pharmacy: '', phone: '1' }) });
check('the cloud refuses an incomplete enquiry', direct.status === 400);
await p.evaluate(() => [...document.querySelectorAll('.wl-top button')].find((x) => /Sign in/.test(x.textContent))?.click()); await wait(800);
check('Sign in opens the usual sign-in', !!(await p.$('.auth-card input[type=password]')));
await p.close();
p = await page(390, 844);
await p.goto(base + '/', { waitUntil: 'networkidle2' }); await wait(800);
check('the front page fits a phone (no sideways scroll)', await p.evaluate(() => !!document.querySelector('.front-page') && document.documentElement.scrollWidth <= innerWidth + 1));
await p.close();
p = await page(1280, 860, false);
await p.goto(base + '/', { waitUntil: 'networkidle2' }); await wait(800);
check('any other site address (tests, previews) opens on sign-in as before', !!(await p.$('.auth-card input[type=password]')) && !(await p.$('.front-page')));
await p.close();

// ---- a pharmacy: one batch oversold offline, one medicine out of stock ----
const t = await owner('/tenants', { name: 'Shop Window Pharmacy', admin: { name: 'Ola Admin', email: 'ola@sw.rx', password: 'ola-pass-1234' } });
const slug = t.tenant.slug, tid = t.tenant.id;
await owner('/tenants/' + tid, { features: { catalog: false } });
await owner('/tenants/' + tid + '/records', { records: [
  { t: 'products', id: 'p1', rec: { name: 'Sample Caps 250mg', form: 'Capsules', unit: 'Capsule', price: 1500, cost: 1000, reorder: 0 } },
  { t: 'products', id: 'p2', rec: { name: 'Zeta Syrup 100ml', form: 'Syrup', unit: 'Bottle', price: 8000, cost: 5000, reorder: 0 } },
  { t: 'batches', id: 'b1', rec: { productId: 'p1', batch: 'SC7', expiry: day(300), cost: 1000 } },
  { t: 'movements', id: 'm1', rec: { productId: 'p1', qty: 5, type: 'Opening stock', batchId: 'b1', branchId: 'main', date: ago(72) } },
  // two counters each sold the "last" packs while one was offline
  { t: 'movements', id: 'm2', rec: { productId: 'p1', qty: -4, type: 'Sale', ref: 'A-101', user: 'Ann Counter', batchId: 'b1', branchId: 'main', date: ago(5) } },
  { t: 'movements', id: 'm3', rec: { productId: 'p1', qty: -3, type: 'Sale', ref: 'B-202', user: 'Ben Counter', batchId: 'b1', branchId: 'main', date: ago(4) } },
] });
p = await page(1366, 900, false);
await p.goto(base + '/' + slug, { waitUntil: 'networkidle2' }); await wait(600);
await p.evaluate(() => { for (const id of ['pos', 'dashboard', 'reorder']) localStorage.setItem('rxpos-tip:' + id, '1'); });
await p.type('input[autocomplete=username]', 'ola@sw.rx'); await p.type('input[type=password]', 'ola-pass-1234');
await p.evaluate(() => [...document.querySelectorAll('form button')].find((x) => /^Sign in/.test(x.textContent.trim()))?.click());
await p.waitForSelector('.sidebar', { timeout: 20000 });
const synced = () => until(p, () => /^Synced/.test(document.querySelector('.pill.clock .clock-state')?.innerText || ''), 30000);
check('the sync status is in sight while all is well ("Synced" and the time, no seconds)', await synced() && await p.evaluate(() => { const c = document.querySelector('.pill.clock'); return !c.hidden && c.classList.contains('quiet') && /^Synced \d{1,2}[:.]\d{2}/.test(c.innerText.trim()) && !/\d{1,2}:\d{2}:\d{2}/.test(c.innerText); }), await p.evaluate(() => document.querySelector('.pill.clock')?.innerText));
const go = async (hash) => { await p.evaluate((h) => { location.hash = h; }, hash); await wait(1200); };
await go('#/');
const over = await p.evaluate(() => document.querySelector('.oversold')?.innerText || '');
check('the dashboard flags the batch sold below zero, with both sales, and asks for a count', /Sold more than was in stock/.test(over) && /Sample Caps 250mg/.test(over) && /SC7/.test(over) && /-2|−2/.test(over) && /Ann Counter \(A-101\) and Ben Counter \(B-202\)/.test(over) && /Count stock/.test(over), over.replace(/\s+/g, ' '));

// ---- the till: out of stock → "Customer asked: note it"; not stocked → typed name ----
await go('#/pos');
const setInput = (sel, v) => p.evaluate((s, val) => { const i = document.querySelector(s); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, val); i.dispatchEvent(new Event('input', { bubbles: true })); }, sel, v);
await setInput('.search-row input', 'Zeta Syrup'); await wait(400);
await p.evaluate(() => [...document.querySelectorAll('.product')].find((x) => /Zeta Syrup/.test(x.innerText))?.click()); await wait(400);
check('an out-of-stock medicine offers "Customer asked: note it"', await p.evaluate(() => [...document.querySelectorAll('.toast button')].some((x) => /Customer asked: note it/.test(x.textContent))));
await p.evaluate(() => [...document.querySelectorAll('.toast button')].find((x) => /Customer asked: note it/.test(x.textContent))?.click()); await wait(400);
await setInput('.search-row input', 'Unicorn Drops'); await wait(400);
check('no medicine matches: "Customer asked for it? Note it"', await p.evaluate(() => [...document.querySelectorAll('.cart-empty button')].some((x) => /Note it/.test(x.textContent))));
await p.evaluate(() => [...document.querySelectorAll('.cart-empty button')].find((x) => /Note it/.test(x.textContent))?.click()); await wait(400);
await synced(); await wait(1500);
const notes = await recs(tid, 'missedSales');
check('both notes reach the cloud, with who and where', notes.length === 2 && notes.some((n) => n.productId === 'p2') && notes.some((n) => n.name === 'Unicorn Drops' && !n.productId) && notes.every((n) => n.user === 'Ola Admin' && n.branchId === 'main'), JSON.stringify(notes));
await go('#/reorder');
const ro = await p.evaluate(() => document.querySelector('.page')?.innerText || '');
check('Reorder: the out-of-stock medicine is suggested from the asks', /Zeta Syrup 100ml/.test(ro), ro.replace(/\s+/g, ' ').slice(200, 700));
check('…with the asks in their own column', /Asked, none in stock/i.test(ro), await p.evaluate(() => [...document.querySelectorAll('th')].map((x) => x.innerText).join(' | ')));
check('Reorder: what customers asked for that isn\'t stocked', /Customers asked for these, which you don't stock/.test(ro) && /Unicorn Drops/.test(ro));
check('no page errors', errors.length === 0, errors.join(' | '));
await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

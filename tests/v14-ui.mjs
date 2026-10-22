// RxPOS 1.4 UI walkthrough: node v14-ui.mjs <base> <ownerKey> <outDir>
import puppeteer from 'puppeteer-core';
import { CHROME } from './chrome.mjs';
import fs from 'node:fs';
const [base, ownerKey, out] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const b = await puppeteer.launch({ executablePath: CHROME, headless: true });
const errors = [];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); };
const mk = async (ctx) => { const p = await ctx.newPage(); await p.setViewport({ width: 1366, height: 860 }); p.on('pageerror', (e) => errors.push(e.message)); p.on('dialog', (d) => d.dismiss()); return p; };
const text = (p) => p.evaluate(() => document.body.innerText);
const clickText = (p, t, sel = 'button') => p.evaluate((t, sel) => { const el = [...document.querySelectorAll(sel)].find((x) => x.textContent.trim().includes(t)); el?.click(); return !!el; }, t, sel);
const fill = async (p, label, value, root = 'body') => {
  const h = await p.evaluateHandle((l, root) => [...document.querySelector(root).querySelectorAll('label.field')].find((f) => f.querySelector('span')?.textContent.trim().startsWith(l))?.querySelector('input,select,textarea'), label, root);
  const el = h.asElement(); if (!el) throw new Error('no field ' + label);
  if ((await el.evaluate((e) => e.tagName)) === 'SELECT') await el.select(value); else { await el.focus(); await p.keyboard.down('Control'); await p.keyboard.press('KeyA'); await p.keyboard.up('Control'); await p.keyboard.press('Backspace'); await el.type(value); }
};
const until = async (p, fn, ms = 20000, arg) => { const end = Date.now() + ms; while (Date.now() < end) { if (await p.evaluate(fn, arg).catch(() => false)) return true; await wait(500); } return false; };
const menu = (p) => p.evaluate(() => [...document.querySelectorAll('.sidebar nav a')].map((a) => a.textContent.trim()));

// ---------- owner console ----------
const owner = await mk(await b.createBrowserContext());
await owner.goto(base + '/#/owner', { waitUntil: 'networkidle2' }); await wait(800);
await owner.type('input[type=password]', ownerKey); await clickText(owner, 'Sign in'); await wait(1500);
check('owner console opens with the owner key', /Client pharmacies/.test(await text(owner)));
await clickText(owner, 'New pharmacy'); await wait(400);
await fill(owner, 'Pharmacy name', 'Mukono Health Pharmacy', '.modal');
const slug = await owner.evaluate(() => document.querySelector('.modal .slug-input input').value);
check('web address suggested from the name', slug === 'mukono-health-pharmacy', slug);
await fill(owner, 'Address', 'Mukono town', '.modal');
await fill(owner, 'Full name', 'Grace Admin', '.modal'); await fill(owner, 'Email', 'grace@mukono.test', '.modal'); await fill(owner, 'Phone', '0772000111', '.modal');
const tempPw = await owner.evaluate(() => [...document.querySelectorAll('.modal label.field')].find((f) => f.textContent.startsWith('Temporary password')).querySelector('input').value);
await owner.evaluate(() => [...document.querySelectorAll('.modal button')].find((x) => x.textContent.includes('Create pharmacy')).click()); await wait(2500);
check('pharmacy created, welcome details shown', /is ready/.test(await text(owner)) && (await text(owner)).includes('/mukono-health-pharmacy'));
await owner.screenshot({ path: out + '/01-owner-created.png' });
await owner.keyboard.press('Escape'); await owner.evaluate(() => document.querySelector('.modal-bg')?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))); await wait(400);

// ---------- pharmacy admin on their own web address ----------
const ctx = await b.createBrowserContext();
const p = await mk(ctx);
await p.goto(base + '/mukono-health-pharmacy', { waitUntil: 'networkidle2' }); await wait(1800);
const auth = await text(p);
check('sign-in page shows the pharmacy by its address', /Sign in to Mukono Health Pharmacy/.test(auth));
check('no "New pharmacy" or "sync key" options on sign-in', !/New pharmacy|sync key/i.test(auth));
await p.screenshot({ path: out + '/02-signin.png' });
await p.type('input[autocomplete=username]', 'grace@mukono.test'); await p.type('input[type=password]', tempPw);
await clickText(p, 'Sign in');
check('asked to set own password at first sign-in', await until(p, () => /Set your own password/.test(document.body.innerText), 20000));
const dlg = async (v) => { await p.type('.dialog input', v); await p.evaluate(() => document.querySelector('.dialog .btn.primary').click()); await wait(500); };
await dlg('grace-own-pass-1'); await dlg('grace-own-pass-1');
check('password changed, dashboard shown', await until(p, () => /Password changed/.test(document.body.innerText) && /Good (morning|afternoon|evening)/.test(document.body.innerText), 10000));
let m = await menu(p);
check('new menu: Calendar and Weather & Storage', m.includes('Calendar') && m.includes('Weather & Storage'), m.length + ' items');
await p.screenshot({ path: out + '/03-dashboard.png' });

await p.goto(base + '/mukono-health-pharmacy#/settings', { waitUntil: 'networkidle2' }); await wait(800);
const tabs = await p.evaluate(() => [...document.querySelectorAll('.tab')].map((t) => t.textContent));
check('settings: no Features tab, has Alerts & storage', !tabs.includes('Features') && tabs.includes('Alerts & storage'), tabs.join(' | '));
await p.goto(base + '/mukono-health-pharmacy#/branches', { waitUntil: 'networkidle2' }); await wait(800);
check('branches page has no Add branch button', !(await text(p)).includes('Add branch'));
await p.goto(base + '/mukono-health-pharmacy#/users', { waitUntil: 'networkidle2' }); await wait(800);
await clickText(p, 'Add user'); await wait(300);
const roleOpts = await p.evaluate(() => [...document.querySelectorAll('.modal select option')].map((o) => o.textContent));
check('admin cannot create another Administrator', !roleOpts.includes('Administrator') && roleOpts.includes('Dispenser'), roleOpts.join(', '));
await fill(p, 'Full name', 'Dan Dispenser', '.modal'); await fill(p, 'Email', 'dan@mukono.test', '.modal'); await fill(p, 'Role', 'dispenser', '.modal'); await fill(p, 'Password', 'dan-pass-123', '.modal');
await p.evaluate(() => [...document.querySelectorAll('.modal button')].find((x) => x.textContent.includes('Add user')).click()); await wait(600);
check('admin adds a dispenser', /Dan Dispenser/.test(await text(p)));

// ---------- owner changes reach the device live ----------
await owner.goto(base + '/#/owner', { waitUntil: 'networkidle2' }); await wait(1200);
await owner.evaluate(() => [...document.querySelectorAll('.tenant-card')].find((c) => c.textContent.includes('Mukono')).click()); await wait(1500);
await clickText(owner, 'Features', '.tab'); await wait(300);
await owner.evaluate(() => [...document.querySelectorAll('.perm-grid label')].find((l) => l.textContent.includes('Team chat')).querySelector('input').click());
await clickText(owner, 'Save features'); await wait(800);
await clickText(owner, 'Branches', '.tab'); await wait(300);
await clickText(owner, 'Add branch'); await wait(300);
await fill(owner, 'Branch name', 'Seeta', '.modal'); await owner.evaluate(() => [...document.querySelectorAll('.modal button')].find((x) => x.textContent.trim() === 'Save').click()); await wait(1000);
await clickText(owner, 'Staff', '.tab'); await wait(300);
check('owner sees the dispenser the admin added', /Dan Dispenser/.test(await text(owner)));
await owner.screenshot({ path: out + '/04-owner-tenant.png' });
await p.goto(base + '/mukono-health-pharmacy#/', { waitUntil: 'networkidle2' });
const t0 = Date.now();
const gone = await until(p, () => ![...document.querySelectorAll('.sidebar nav a')].some((a) => a.textContent.startsWith('Chat')), 30000);
check('feature switched off by owner disappears from the device', gone, `${Math.round((Date.now() - t0) / 1000)} s`);
check('branch added by owner appears on the device', await until(p, () => document.querySelector('.branch-pill') !== null, 20000));

// ---------- calendar, storage, weather ----------
await p.goto(base + '/mukono-health-pharmacy#/calendar', { waitUntil: 'networkidle2' }); await wait(800);
await clickText(p, 'Add event'); await wait(300);
await fill(p, 'What', 'Supplier delivery', '.modal');
// time boxes are typed differently in 12- and 24-hour locales: set the value directly so the test passes on any computer
await p.evaluate(() => { const el = document.querySelector('.modal input[type=time]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, '10:00'); el.dispatchEvent(new Event('input', { bubbles: true })); });
await p.evaluate(() => [...document.querySelectorAll('.modal button')].find((x) => x.textContent.trim() === 'Save').click()); await wait(800);
check('calendar event added', /Supplier delivery/.test(await text(p)));
check('calendar subscription link shown', await until(p, () => /\.ics/.test(document.querySelector('.keybox')?.textContent || ''), 10000));
await p.screenshot({ path: out + '/05-calendar.png' });
await p.goto(base + '/mukono-health-pharmacy#/storage', { waitUntil: 'networkidle2' }); await wait(800);
check('weather loads (Open-Meteo)', await until(p, () => /°C/.test(document.querySelector('.weather')?.innerText || ''), 15000));
await clickText(p, 'Record reading'); await wait(300);
await fill(p, 'Temperature', '11', '.modal'); await p.evaluate(() => [...document.querySelectorAll('.modal button')].find((x) => x.textContent.includes('Save reading')).click()); await wait(600);
check('out-of-range fridge reading flagged', /Out of range/.test(await text(p)));
await p.screenshot({ path: out + '/06-storage.png' });

// ---------- stock for promotions (owner writes it), idle spotlight, bell ----------
const exp = new Date(Date.now() + 20 * 864e5).toISOString().slice(0, 10);
await owner.evaluate(async (key, exp) => {
  await fetch('/api/owner/tenants/mukono-health-pharmacy/records', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key }, body: JSON.stringify({ records: [
    { t: 'products', id: 'px1', rec: { name: 'Augmentin 625mg tabs', generic: 'Amoxicillin/Clavulanate', form: 'Tablets', price: 45000, cost: 30000, reorder: 0 } },
    { t: 'products', id: 'px2', rec: { name: 'Vitamin C 1000mg effervescent', generic: 'Ascorbic acid', form: 'Tablets', price: 12000, cost: 5000, reorder: 0 } },
    { t: 'batches', id: 'bx1', rec: { productId: 'px1', batch: 'AUG1', expiry: exp, cost: 30000 } },
    { t: 'batches', id: 'bx2', rec: { productId: 'px2', batch: 'VC1', expiry: '2028-01-01', cost: 5000 } },
    { t: 'movements', id: 'mx1', rec: { productId: 'px1', qty: 12, type: 'Opening stock', batchId: 'bx1', branchId: 'main', date: new Date().toISOString() } },
    { t: 'movements', id: 'mx2', rec: { productId: 'px2', qty: 40, type: 'Opening stock', batchId: 'bx2', branchId: 'main', date: new Date().toISOString() } },
  ] }) });
}, ownerKey, exp);
await p.goto(base + '/mukono-health-pharmacy#/settings', { waitUntil: 'networkidle2' }); await wait(800);
await clickText(p, 'Alerts & storage', '.tab'); await wait(300);
await fill(p, 'Show product promotions', '0.5');
await p.evaluate(() => [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Save').click()); await wait(500);
await p.goto(base + '/mukono-health-pharmacy#/', { waitUntil: 'networkidle2' });
check('owner-written stock reaches the device', await until(p, () => /Augmentin/.test(document.body.innerText), 25000));
await p.screenshot({ path: out + '/07-dashboard-promote.png' });
await p.bringToFront(); console.log('  visibility:', await p.evaluate(() => document.visibilityState), 'idleMinutes:', await p.evaluate(() => 0));
check('idle spotlight appears after 30 s of no activity', await until(p, () => !!document.querySelector('.spotlight'), 45000));
await p.screenshot({ path: out + '/08-spotlight.png' });
const share = await p.evaluate(() => document.querySelector('.spotlight a[href*="wa.me"]')?.href || '');
check('spotlight has a WhatsApp share link', /wa\.me\/\?text=/.test(share));
const before = p.url();
await p.mouse.click(120, 203); await wait(600);
check('a tap closes the spotlight without clicking what is underneath', !(await p.$('.spotlight')) && p.url() === before, p.url());
await p.click('.bell .icon-btn'); await wait(300);
const bell = await p.evaluate(() => document.querySelector('.bell-menu')?.innerText || '');
check('notification bell lists expiring stock and today\'s event', /expires? within 30 days/.test(bell) && /Supplier delivery/.test(bell), bell.replace(/\n/g, ' | ').slice(0, 160));
await p.screenshot({ path: out + '/09-bell.png' });

// ---------- offline sign-in on a device that has signed in before ----------
await p.evaluate(() => [...document.querySelectorAll('button[title="Log out"]')][0].click()); await wait(800);
await p.setOfflineMode(true);
await p.type('input[type=password]', 'grace-own-pass-1');
const email = await p.$eval('input[autocomplete=username]', (e) => e.value);
if (!email) await p.type('input[autocomplete=username]', 'grace@mukono.test');
await clickText(p, 'Sign in');
const offOk = await until(p, () => !!document.querySelector('.sidebar') && !!document.querySelector('.pill.clock.warn'), 10000);
if (!offOk) { console.log('  auth text:', (await text(p)).replace(/\n/g, ' | ').slice(0, 400)); await p.screenshot({ path: out + '/xx-offline.png' }); }
check('offline sign-in works after the first online sign-in', offOk);
await p.setOfflineMode(false);

// phone width: no sideways scrolling on new pages
await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
const wide = [];
for (const h of ['/', '/calendar', '/storage', '/settings']) {
  await p.goto(base + '/mukono-health-pharmacy#' + h, { waitUntil: 'networkidle2' }); await wait(700);
  if (await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2)) wide.push(h);
}
check('new pages fit a phone screen', !wide.length, wide.join(' '));
await p.goto(base + '/mukono-health-pharmacy#/calendar', { waitUntil: 'networkidle2' }); await wait(700);
await p.screenshot({ path: out + '/10-phone-calendar.png' });
await owner.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
await owner.goto(base + '/#/owner', { waitUntil: 'networkidle2' }); await wait(1000);
check('owner console fits a phone screen', await owner.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2));

console.log(`\nerrors: ${errors.length ? [...new Set(errors)].slice(0, 6).join(' | ') : 'none'}`);
console.log(`${pass} passed, ${fail} failed`);
await b.close();

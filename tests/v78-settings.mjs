// Settings and This device (2026-11-15, the owner's choice from the "app settings" references): labelled groups with
// an icon and a line each, search that takes you to a setting, quick switches that save at once, rarely changed
// options under Advanced, and a Danger zone with a warning screen and a second confirmation. Windows and phone
// screenshots. Fictional data only.
//   node v78-settings.mjs <base> <ownerKey> <outDir>
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
import { CHROME } from './chrome.mjs';
const [base, ownerKey, out = '.output/v78'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + String(x).slice(0, 300) : ''}`); };
const owner = (p, body) => fetch(base + '/api/owner' + p, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ownerKey }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());
const until = async (p, fn, ms = 20000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await p.evaluate(fn).catch(() => false)) return true; await wait(250); } return false; };

const T = await owner('/tenants', { name: 'Settings Pharmacy', admin: { name: 'Sam Admin', email: 'sam@settings.rx', password: 'sam-pass-1234' } });
const tid = T.tenant.id, slug = T.tenant.slug;
await owner('/tenants/' + tid, { features: { catalog: false } });
const b = await puppeteer.launch({ executablePath: CHROME, headless: true });
const p = await (await b.createBrowserContext()).newPage();
await p.setViewport({ width: 1440, height: 950 });
const errors = []; p.on('pageerror', (e) => errors.push(e.message));
await p.goto(base + '/' + slug, { waitUntil: 'networkidle2' }); await wait(500);
await p.evaluate(() => { for (const id of ['pos', 'dashboard', 'settings', 'device']) localStorage.setItem('rxpos-tip:' + id, '1'); });
await p.type('input[autocomplete=username]', 'sam@settings.rx'); await p.type('input[type=password]', 'sam-pass-1234');
await p.evaluate(() => [...document.querySelectorAll('form button')].find((x) => /^Sign in/.test(x.textContent.trim()))?.click());
await p.waitForSelector('.sidebar', { timeout: 20000 });
await until(p, () => /Synced/.test(document.querySelector('.pill.clock .clock-state')?.innerText || ''), 30000);
const go = async (h) => { await p.evaluate((x) => { location.hash = x; }, h); await wait(1200); };

await go('#/settings');
const groups = await p.evaluate(() => [...document.querySelectorAll('.settings-group-label')].map((x) => x.textContent));
check('settings in labelled groups, with quick switches and a danger zone', ['Quick switches', 'Pharmacy', 'Selling & stock', 'Alerts & messages', 'Online & data', 'More', 'Danger zone'].every((g) => groups.includes(g)), groups.join(' | '));
check('every section row has an icon and a line on what it is for', await p.evaluate(() => [...document.querySelectorAll('.settings-row.tab')].every((r) => r.querySelector('.settings-icon svg') && r.querySelector('small')?.textContent.length > 8)));
check('on a PC the first section shows beside the list', /Pharmacy details/.test(await p.evaluate(() => document.querySelector('.settings-main').innerText)));
await p.screenshot({ path: path.join(out, 'settings.png') });
// quick switch saves at once
await p.evaluate(() => [...document.querySelectorAll('.settings-row.toggle')].find((x) => /Print receipts/.test(x.innerText)).querySelector('input').click());
await wait(1500);
await p.reload({ waitUntil: 'networkidle2' }); await wait(1500);
check('a quick switch saves at once (auto-print stays on after a reload)', await p.evaluate(() => [...document.querySelectorAll('.settings-row.toggle')].find((x) => /Print receipts/.test(x.innerText)).querySelector('input').checked));
// search
await p.type('.settings-search input', 'lead time'); await wait(300);
check('search finds "Supplier lead time"', /Supplier lead time/.test(await p.evaluate(() => document.querySelector('.settings-hits')?.innerText || '')));
await p.keyboard.press('Enter'); await wait(1200);
check('…and opens Receipts & stock with Advanced unfolded at that setting', await p.evaluate(() => /Receipts & stock/.test(document.querySelector('.settings-section-head')?.innerText || '') && document.querySelector('details.advanced')?.open));
await p.screenshot({ path: path.join(out, 'settings-search.png') });
// danger zone: warning screen, then a second confirmation; cancel keeps everything
await p.evaluate(() => [...document.querySelectorAll('.settings-row.danger')].find((x) => /Restore default settings/.test(x.innerText)).click()); await wait(500);
check('Danger zone: a warning screen first', await p.evaluate(() => /Restore every setting/.test(document.querySelector('.danger-sheet')?.innerText || '')));
await p.screenshot({ path: path.join(out, 'danger.png') });
await p.evaluate(() => [...document.querySelectorAll('.danger-sheet button')].find((x) => /^Yes,/.test(x.textContent)).click()); await wait(500);
check('…then a second confirmation (the warning screen gives way to it)', await p.evaluate(() => !document.querySelector('.danger-sheet') && /Restore defaults\?/.test(document.querySelector('.modal')?.innerText || '')));
await p.evaluate(() => [...document.querySelectorAll('.modal button')].find((x) => /Cancel/.test(x.textContent))?.click()); await wait(500);
check('…Cancel leaves the settings as they were (auto-print still on)', await p.evaluate(() => [...document.querySelectorAll('.settings-row.toggle')].find((x) => /Print receipts/.test(x.innerText)).querySelector('input').checked));

await go('#/device');
check('the confirmation is gone', await p.evaluate(() => !document.querySelector('.modal')));
check('This device: search, quick switches and a danger zone', await p.evaluate(() => !!document.querySelector('.device-top .settings-search') && /Sounds/.test(document.querySelector('.device-top').innerText) && /Reset this device/.test(document.querySelector('.danger-zone-box')?.innerText || '')));
await p.screenshot({ path: path.join(out, 'device.png') });
await p.type('.device-top .settings-search input', 'tax'); await wait(300);
await p.keyboard.press('Enter'); await wait(1500);
check('searching on This device can open a pharmacy setting (Tax / VAT rate)', await p.evaluate(() => location.hash.includes('/settings') && /Pharmacy/.test(document.querySelector('.settings-section-head')?.innerText || '')));

// phone
await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
await go('#/dashboard'); await go('#/settings');
check('phone: the list first, no section', await p.evaluate(() => !!document.querySelector('.settings-side').getClientRects().length && !document.querySelector('.settings-main').getClientRects().length));
await p.screenshot({ path: path.join(out, 'settings-phone.png'), fullPage: true });
await p.evaluate(() => [...document.querySelectorAll('.settings-row.tab')].find((x) => /Payment methods/.test(x.innerText)).click()); await wait(600);
check('phone: a section opens with "All settings" to go back', await p.evaluate(() => !!document.querySelector('.settings-back').getClientRects().length && !document.querySelector('.settings-side').getClientRects().length));
await p.screenshot({ path: path.join(out, 'settings-phone-section.png'), fullPage: true });
check('phone: nothing runs off the screen', await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
await go('#/device');
await p.screenshot({ path: path.join(out, 'device-phone.png'), fullPage: true });
check('no page errors', !errors.length, errors.join(' | '));

await b.close();
await owner('/tenants/' + tid + '/delete', { confirm: T.tenant.slug });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

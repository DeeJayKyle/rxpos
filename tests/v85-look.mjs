// UI batch 3, E (look and readability): one type scale, text size presets, chart patterns, touch targets, one date
// control, the pharmacy's logo (Settings → Pharmacy, the menu, the sign-in page from the cloud), the branded sign-in,
// the opening screen and the friendly error page. The PIN pad and recent staff need the apps: v28-pin.mjs.
//   node v85-look.mjs <base> <ownerKey> <outDir>
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
import { CHROME } from './chrome.mjs';
const [base, ownerKey, out = '.output/v85'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + String(x).slice(0, 300) : ''}`); };
const owner = (p, body) => fetch(base + '/api/owner' + p, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ownerKey }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());
const until = async (p, fn, ms = 20000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await p.evaluate(fn).catch(() => false)) return true; await wait(250); } return false; };
const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const localDay = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

const T = await owner('/tenants', { name: 'Look Sample Pharmacy', admin: { name: 'Lee Admin', email: 'lee@look.rx', password: 'lee-pass-1234' } });
const tid = T.tenant.id, slug = T.tenant.slug;
await owner('/tenants/' + tid, { features: { catalog: false, weather: false, promos: false } });
const at = (n) => { const d = new Date(); d.setMonth(d.getMonth() - n); d.setHours(10, 0, 0, 0); return d.toISOString(); };
await owner('/tenants/' + tid + '/records', { records: [
  { t: 'products', id: 'lp1', rec: { name: 'Calmex 500mg Tabs', generic: 'Calmex', form: 'Tablets', price: 500, cost: 300, reorder: 0 } },
  ...[0, 1, 2, 3].map((n) => ({ t: 'sales', id: 'ls' + n, rec: { number: 'R' + n, date: at(n), type: 'retail', branchId: 'main', items: [{ id: 'lp1', name: 'Calmex 500mg Tabs', qty: 2, price: 500, cost: 300, alloc: [] }], subtotal: 1000, discount: 0, tax: 0, total: 1000, paid: 1000, payment: 'Cash', cashier: 'Lee Admin', status: 'completed' } })),
] });

const b = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
const p = await (await b.createBrowserContext()).newPage();
await p.setViewport({ width: 1440, height: 900 });
const errors = []; p.on('pageerror', (e) => { if (!/A test crash/.test(e.message)) errors.push(e.message); });
await p.goto(base + '/' + slug, { waitUntil: 'networkidle2' }); await wait(300);
// E8: the opening screen says what is happening
check('E8 the opening screen: "Getting your pharmacy ready"', /Getting your pharmacy ready/.test(await (await fetch(base + '/index.html')).text()));
await p.evaluate(() => { for (const id of ['pos', 'dashboard', 'sales', 'settings']) localStorage.setItem('rxpos-tip:' + id, '1'); });
await p.type('input[autocomplete=username]', 'lee@look.rx'); await p.type('input[type=password]', 'lee-pass-1234');
await p.evaluate(() => [...document.querySelectorAll('form button')].find((x) => /^Sign in/.test(x.textContent.trim()))?.click());
await p.waitForSelector('.sidebar', { timeout: 20000 });
await until(p, () => /Synced/.test(document.querySelector('.pill.clock .clock-state')?.innerText || ''), 30000);

// E1: five sizes, money in tabular figures
const scale = await p.evaluate(() => { const cs = getComputedStyle(document.documentElement); return [1, 2, 3, 4, 5].map((i) => cs.getPropertyValue('--t-' + i).trim()); });
check('E1 one type scale: 28 / 20 / 16 / 14 / 12', JSON.stringify(scale) === JSON.stringify(['28px', '20px', '16px', '14px', '12px']), JSON.stringify(scale));
await p.evaluate(() => { location.hash = '#/sales'; }); await wait(1500);
check('E1 amounts line up (tabular figures)', await p.evaluate(() => { const c = document.querySelector('td.num'); return !!c && /tabular-nums/.test(getComputedStyle(c).fontVariantNumeric); }));

// E5: one date control with presets
check('E5 Sales: the date control with presets', await p.evaluate(() => { const s = document.querySelector('.date-range select'); return !!s && ['All dates', 'Today', 'Yesterday', '7 days', 'This month', 'Last month', 'Custom'].every((l) => [...s.options].some((o) => o.text === l)); }));
await p.select('.date-range select', '7d'); await wait(400);
check('E5 "7 days" fills From and To', await p.evaluate((f, t) => document.querySelector('.date-range input[aria-label=From]').value === f && document.querySelector('.date-range input[aria-label=To]').value === t, localDay(-6), localDay(0)));
for (const [h, name] of [['#/reports', 'Reports'], ['#/expenses', 'Expenses'], ['#/audit', 'Audit log'], ['#/purchases', 'Purchases']]) {
  await p.evaluate((x) => { location.hash = x; }, h); await wait(1200);
  check(`E5 ${name}: the same date control`, await p.evaluate(() => !!document.querySelector('.date-range select')));
}

// E3: the second and later chart lines have a pattern
await p.evaluate(() => { location.hash = '#/'; }); await wait(1500);
await p.evaluate(() => [...document.querySelectorAll('.chart-card .seg button')].find((x) => x.textContent === 'Monthly')?.click()); await wait(800);
const dashes = await p.evaluate(() => [...document.querySelectorAll('.trend-series')].map((g) => getComputedStyle(g.querySelector('path')).strokeDasharray));
check('E3 chart lines: the first solid, the others dashed / dotted', dashes.length >= 2 && dashes.slice(1).every((d) => d && d !== 'none' && d !== '1px' && d !== '1') && new Set(dashes).size === dashes.length, JSON.stringify(dashes));

// E2: text size presets
await p.evaluate(() => { location.hash = '#/device'; }); await wait(1200);
await p.evaluate(() => [...document.querySelectorAll('.text-size-presets button')].find((x) => /^Large/.test(x.textContent))?.click()); await wait(300);
check('E2 "Large" sets the text size to 115 %', await p.evaluate(() => document.documentElement.style.zoom === '1.15' && document.querySelector('.text-size-presets [aria-checked=true]')?.textContent.startsWith('Large')));
await p.evaluate(() => [...document.querySelectorAll('.text-size-presets button')].find((x) => /^Normal/.test(x.textContent))?.click()); await wait(300);

// E6: the logo, uploaded in Settings → Pharmacy
const png = path.join(out, 'logo.png');
fs.writeFileSync(png, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEklEQVR4nGP4z8CAFWEXHbQSACj/P8Fu7N9hAAAAAElFTkSuQmCC', 'base64'));
await p.evaluate(() => { location.hash = '#/settings'; }); await wait(1000);
await p.evaluate(() => [...document.querySelectorAll('.settings-side button, .settings-side a')].find((x) => /^Pharmacy/.test(x.innerText.trim()))?.click()); await wait(700);
const inp = await p.$('input[aria-label="Pharmacy logo"]');
check('E6 Settings → Pharmacy has the logo upload', !!inp);
if (inp) await inp.uploadFile(png);
await until(p, () => /\/api\/files\//.test(document.querySelector('.sidebar .brand img')?.src || ''), 15000);
check('E6 …the menu shows the pharmacy\'s logo (a file in its cloud)', await p.evaluate(() => /\/api\/files\//.test(document.querySelector('.sidebar .brand img')?.src || '')));
await wait(2500); // the settings reach the cloud
const info = await (await fetch(base + '/api/pharmacy/' + slug)).json();
check('E6 …and the sign-in page gets it from the cloud', /\/api\/files\//.test(info.logo || ''), JSON.stringify(info).slice(0, 200));
await p.screenshot({ path: path.join(out, 'settings-logo.png') });

// E4: touch screens: 44 px
const t = await (await b.createBrowserContext()).newPage();
await t.setViewport({ width: 820, height: 1180, isMobile: true, hasTouch: true });
await t.goto(base + '/' + slug, { waitUntil: 'networkidle2' }); await wait(800);
check('E7 the sign-in page names the pharmacy, shows its logo and a welcome', await t.evaluate(() => /Look Sample Pharmacy/.test(document.body.innerText) && /welcome back/i.test(document.body.innerText) && /\/api\/files\//.test(document.querySelector('.auth-card .brand img')?.src || '')), await t.evaluate(() => document.querySelector('.auth-card')?.innerHTML.slice(0, 300)));
const small = await t.evaluate(() => matchMedia('(pointer: coarse)').matches && [...document.querySelectorAll('.auth-card .btn')].filter((x) => x.offsetParent && x.getBoundingClientRect().height < 43.5).map((x) => x.textContent.trim()));
check('E4 touch: every button at least 44 px', Array.isArray(small) && small.length === 0, JSON.stringify(small));
await t.close();

// E10: the friendly error page
await p.evaluate(() => { sessionStorage.setItem('rxpos-test-crash', '1'); location.hash = '#/__crash'; }); await wait(800);
check('E10 the error page says it plainly, with Try again, Go to the dashboard and Send report', await p.evaluate(() => /Something went wrong on this page/.test(document.body.innerText) && /Nothing you saved is lost/.test(document.body.innerText) && ['Try again', 'Go to the dashboard', 'Send report'].every((l) => [...document.querySelectorAll('.crash button')].some((x) => x.textContent.trim() === l))));
await p.screenshot({ path: path.join(out, 'error-page.png') });
await p.evaluate(() => [...document.querySelectorAll('.crash button')].find((x) => x.textContent.trim() === 'Send report').click()); await wait(300);
check('E10 Send report says it was sent', await p.evaluate(() => /Report sent/.test(document.querySelector('.crash').innerText)));
await p.evaluate(() => sessionStorage.removeItem('rxpos-test-crash'));
await p.evaluate(() => [...document.querySelectorAll('.crash button')].find((x) => x.textContent.trim() === 'Go to the dashboard').click()); await wait(1200);
check('E10 Go to the dashboard carries on', await p.evaluate(() => !document.querySelector('.crash') && !!document.querySelector('.sidebar') && /#\/$/.test(location.hash)));
check('no page errors', !errors.length, errors.join(' | '));

await b.close();
await owner('/tenants/' + tid + '/delete', { confirm: slug });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

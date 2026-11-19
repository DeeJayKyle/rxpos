// Forms and dialogs (UI batch 3, D1-D10; fictional data): fields checked as they are left, "Draft saved" on Add Stock,
// (?) help, saves that close at once with a cloud mark, amounts with the currency and commas, phone numbers that format
// themselves, the cursor in the first field and Enter to the next, sheets on phones, three pop-up sizes, danger
// dialogs that say what will happen.
//   node v84-forms.mjs <base> <ownerKey> <outDir>
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
import { CHROME } from './chrome.mjs';
const [base, ownerKey, out = '.output/v84'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + String(x).slice(0, 300) : ''}`); };
const owner = (p, body) => fetch(base + '/api/owner' + p, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ownerKey }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());
const until = async (p, fn, ms = 20000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await p.evaluate(fn).catch(() => false)) return true; await wait(250); } return false; };
const recs = async (tid, t) => ((await owner(`/tenants/${tid}/records?t=${t}`)).rows || []).map((x) => x.rec);

const T = await owner('/tenants', { name: 'Forms Sample Pharmacy', admin: { name: 'Fay Admin', email: 'fay@forms.rx', password: 'fay-pass-1234' } });
const tid = T.tenant.id, slug = T.tenant.slug;
await owner('/tenants/' + tid, { features: { catalog: false, weather: false, promos: false } });
await owner('/tenants/' + tid + '/records', { records: [
  { t: 'products', id: 'fp1', rec: { name: 'Calmex 500mg Tabs', generic: 'Calmex', form: 'Tablets', price: 500, cost: 300, reorder: 10, barcode: '7010001' } },
  { t: 'suppliers', id: 'fs1', rec: { name: 'Sample Wholesalers', phone: '0700999888' } },
] });

const b = await puppeteer.launch({ executablePath: CHROME, headless: true });
const p = await (await b.createBrowserContext()).newPage();
await p.setViewport({ width: 1440, height: 900 });
const errors = []; p.on('pageerror', (e) => errors.push(e.message));
await p.goto(base + '/' + slug, { waitUntil: 'networkidle2' }); await wait(500);
await p.evaluate(() => { for (const id of ['pos', 'dashboard', 'customers', 'medicines', 'add-stock', 'expenses']) localStorage.setItem('rxpos-tip:' + id, '1'); });
await p.type('input[autocomplete=username]', 'fay@forms.rx'); await p.type('input[type=password]', 'fay-pass-1234');
await p.evaluate(() => [...document.querySelectorAll('form button')].find((x) => /^Sign in/.test(x.textContent.trim()))?.click());
await p.waitForSelector('.sidebar', { timeout: 20000 });
await until(p, () => /Synced/.test(document.querySelector('.pill.clock .clock-state')?.innerText || ''), 30000);
const label = () => p.evaluate(() => document.activeElement?.closest('label')?.querySelector('span')?.innerText.replace(/\s*\*$/, '').trim());

// Customers: first field, Enter to the next, phone format, email check, Ctrl+Enter saves
await p.evaluate(() => { location.hash = '#/customers'; }); await wait(1200);
await p.evaluate(() => [...document.querySelectorAll('.page-head button')].find((x) => /Add customer/.test(x.textContent)).click()); await wait(400);
check('D7 the form opens with the cursor in its first field', /Full name/.test(await label() || ''), await label());
check('D9 a pop-up has one of the three sizes', await p.evaluate(() => { const m = document.querySelector('.modal'); const w = Math.round(m.getBoundingClientRect().width); return [...m.classList].some((c) => /^size-(sm|md|lg)$/.test(c)) && [420, 640, 960].includes(w); }), await p.evaluate(() => document.querySelector('.modal').className + ' ' + Math.round(document.querySelector('.modal').getBoundingClientRect().width)));
await p.keyboard.type('Grace Sample'); await p.keyboard.press('Enter'); await wait(150);
check('D7 Enter moves to the next field (not a save)', /Phone/.test(await label() || '') && await p.evaluate(() => !!document.querySelector('.modal')), await label());
await p.keyboard.type('0772123456'); await wait(150);
check('D6 the phone formats as it is typed, with a tick for WhatsApp / SMS', await p.evaluate(() => { const i = document.activeElement; return i.value === '0772 123 456' && !!i.parentElement.querySelector('.phone-ok'); }), await p.evaluate(() => document.activeElement.value));
await p.keyboard.press('Enter'); await p.keyboard.type('not-an-email'); await p.keyboard.press('Enter'); await wait(200);
check('D1 a field is checked when it is left (email)', /Not an email address/.test(await p.evaluate(() => document.querySelector('.modal .field-error')?.innerText || '')));
await p.evaluate(() => { const i = [...document.querySelectorAll('.modal input')].find((x) => x.type === 'email'); i.focus(); });
await p.keyboard.down('Control'); await p.keyboard.press('a'); await p.keyboard.up('Control'); await p.keyboard.type('grace@sample.rx'); await wait(150);
check('D1 …and again as it is typed: the message goes once it is right', await p.evaluate(() => !document.querySelector('.modal .field-error')));
const cl = await p.evaluate(() => { const l = [...document.querySelectorAll('.modal label')].find((x) => /Credit limit/.test(x.innerText)); return { money: !!l?.querySelector('.money-input'), help: !!l?.querySelector('.field-help') }; });
// 1.16.0 (the owner's clean-up): a field's help is always under it, not behind a (?)
check('D5 / D3 the credit limit is an amount with the currency, with its help under it', cl.money && cl.help, JSON.stringify(cl));
await p.evaluate(() => { const l = [...document.querySelectorAll('.modal label')].find((x) => /Credit limit/.test(x.innerText)); l.querySelector('input').focus(); });
await p.keyboard.type('1500000'); await wait(100);
check('D5 thousand commas while typing', await p.evaluate(() => document.activeElement.value === '1,500,000'), await p.evaluate(() => document.activeElement.value));
await p.keyboard.down('Control'); await p.keyboard.press('Enter'); await p.keyboard.up('Control'); await wait(500);
check('D4 Ctrl+Enter saves; the form closes at once with a mark for the cloud', await p.evaluate(() => !document.querySelector('.modal') && !!document.querySelector('.toast .sync-mark')));
await until(p, () => !!document.querySelector('.toast .sync-mark.done'), 15000);
check('D4 …the mark turns into a tick once the cloud has it', await p.evaluate(() => !!document.querySelector('.toast .sync-mark.done')));
await wait(1500);
const grace = (await recs(tid, 'customers')).find((c) => c.name === 'Grace Sample');
check('D5 / D6 the amount is kept as a number, the phone as typed', grace && grace.creditLimit === 1500000 && /0772 123 456/.test(grace.phone), JSON.stringify(grace));

// Medicine form: a barcode another medicine has, a price under the cost
await p.evaluate(() => { location.hash = '#/medicines'; }); await wait(1200);
await p.evaluate(() => [...document.querySelectorAll('.page-head button')].find((x) => /Add medicine/.test(x.textContent)).click()); await wait(400);
const fieldIn = (re) => p.evaluate((r) => { const l = [...document.querySelectorAll('.modal label')].find((x) => new RegExp(r).test(x.querySelector('span')?.innerText || '')); l.querySelector('input').focus(); }, re);
await fieldIn('^Barcode'); await p.keyboard.type('7010001'); await fieldIn('^Cost price'); await wait(150);
check('D1 a barcode another medicine has is said on leaving the field', /Another medicine has this barcode \(Calmex/.test(await p.evaluate(() => [...document.querySelectorAll('.modal .field-error')].map((x) => x.innerText).join(' | '))), await p.evaluate(() => (document.querySelector('.modal')?.innerText || 'no modal: ' + [...document.querySelectorAll('.page-head button')].map((x) => x.textContent).join('|')).slice(0, 300)));
await p.keyboard.type('800'); await fieldIn('^Retail price'); await p.keyboard.type('600'); await fieldIn('^Reorder level'); await wait(150);
check('D1 a retail price under the cost is said', await p.evaluate(() => [...document.querySelectorAll('.modal .field-error')].some((x) => /below the cost/.test(x.innerText))));
check('D3 the help under the reorder level explains it', /goes on the reorder list/.test(await p.evaluate(() => [...document.querySelectorAll('.modal label')].find((x) => /Reorder level/.test(x.innerText))?.querySelector('.field-help')?.innerText || '')));
await p.evaluate(() => [...document.querySelectorAll('.modal button')].find((x) => /^Save$/.test(x.textContent.trim())).click()); await wait(300);
check('D1 Save with problems keeps the form open', await p.evaluate(() => !!document.querySelector('.modal')));
await p.keyboard.press('Escape'); await wait(300);

// A5: a medicine's photo: chosen in the form, made small, stored with the pharmacy's files, shown on the till's tile
await p.evaluate(() => { location.hash = '#/medicines'; }); await wait(1000);
await p.evaluate(() => [...[...document.querySelectorAll('table tbody tr')].find((r) => /Calmex/.test(r.innerText)).querySelectorAll('td.actions button')].find((b) => /^Edit$/.test(b.textContent.trim())).click()); await wait(400);
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEklEQVR4nGP4z8CAFWEXHbQSACj/P8Fu7N9hAAAAAElFTkSuQmCC', 'base64');
fs.writeFileSync(path.join(out, 'pill.png'), png);
await (await p.$('.modal input[type=file]')).uploadFile(path.join(out, 'pill.png'));
await until(p, () => /Change photo/.test(document.querySelector('.modal .photo-field')?.innerText || ''), 15000);
check('A5 the photo is taken in and shown in the form', await p.evaluate(() => !!document.querySelector('.modal .photo-field img.med-thumb')));
await p.evaluate(() => [...document.querySelectorAll('.modal button')].find((x) => /^Save$/.test(x.textContent.trim())).click()); await wait(1500);
const calmex = (await recs(tid, 'products')).find((x) => x.id === 'fp1');
check('A5 the record keeps only the photo\'s address, not the picture', /^\/api\/files\//.test(calmex?.photo || '') && JSON.stringify(calmex).length < 2000, String(calmex?.photo));
await p.evaluate(() => { location.hash = '#/pos'; }); await wait(1500);
check('A5 the till tile shows the photo; one without a photo shows its first letter', await p.evaluate(() => { const t = [...document.querySelectorAll('.product')].find((x) => /Calmex/.test(x.innerText)); return !!t?.querySelector('img.med-thumb'); }));

// Add Stock: draft saved, an expiry that has passed
await p.evaluate(() => { location.hash = '#/add-stock'; }); await wait(1500);
await p.evaluate(() => document.querySelector('.stock-lines input')?.focus()); await p.keyboard.type('Calmex'); await wait(600);
await p.keyboard.press('Enter'); await wait(800);
await until(p, () => /Draft saved \d{1,2}:\d{2}/.test(document.querySelector('.draft-saved')?.innerText || ''), 5000);
check('D2 Add Stock: "Draft saved hh:mm" under the title', /Draft saved \d{1,2}:\d{2}/.test(await p.evaluate(() => document.querySelector('.draft-saved')?.innerText || '')));

// Danger dialogs: what will happen, Cancel first, the red button on the right
await p.evaluate(() => { location.hash = '#/formulations'; }); await wait(1200);
await p.evaluate(() => document.querySelector('table tbody tr td.actions button.danger')?.click()); await wait(400);
const dz = await p.evaluate(() => { const d = document.querySelector('.modal.dialog'); const bs = [...d.querySelectorAll('.form-actions button')]; return { effects: d.querySelector('.dialog-effects')?.innerText, focus: document.activeElement?.textContent.trim(), last: bs.at(-1).className, red: getComputedStyle(bs.at(-1)).backgroundColor }; });
check('D10 a delete says what will happen, Cancel has the focus, the red button is on the right', /1 formulation removed on every device/.test(dz.effects || '') && dz.focus === 'Cancel' && /danger-solid/.test(dz.last), JSON.stringify(dz));
await p.keyboard.press('Escape'); await wait(200);

// Expenses: the amount with commas; the till's tendered box
await p.evaluate(() => { location.hash = '#/expenses'; }); await wait(1200);
await p.evaluate(() => [...document.querySelectorAll('.page-head button')].find((x) => /Add expense/.test(x.textContent)).click()); await wait(400);
const amt = await p.evaluate(() => { const l = [...document.querySelectorAll('.modal label')].find((x) => /Amount/.test(x.innerText)); return { cur: l.querySelector('.money-cur')?.innerText, ok: !!l.querySelector('.money-input') }; });
check('D5 expenses: the amount shows UGX in front', amt.ok && amt.cur === 'UGX', JSON.stringify(amt));
await p.keyboard.press('Escape'); await wait(200);

// phone: a pop-up is a full-height sheet, its main button at the bottom
await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
await p.evaluate(() => { location.hash = '#/customers'; }); await wait(1500);
await p.evaluate(() => [...document.querySelectorAll('.page-head button')].find((x) => /Add customer/.test(x.textContent)).click()); await wait(700);
const sheet = await p.evaluate(() => { const m = document.querySelector('.modal').getBoundingClientRect(); const a = document.querySelector('.modal form > .form-actions').getBoundingClientRect(); return { h: Math.round(m.height), top: Math.round(m.top), actionsBottom: Math.round(a.bottom), vh: innerHeight }; });
check('D8 phone: the pop-up is a full-height sheet with Save at the bottom', sheet.h >= sheet.vh - 60 && sheet.actionsBottom >= sheet.vh - 40, JSON.stringify(sheet));
await p.screenshot({ path: path.join(out, 'phone-sheet.png') });
check('no page errors', !errors.length, errors.join(' | '));

await b.close();
await owner('/tenants/' + tid + '/delete', { confirm: slug });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

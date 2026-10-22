// This device page, password eye, WhatsApp-style chat actions and the idle-screen shop window.
//   node v21-device-chat.mjs <base> <ownerKey> <outDir>
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import { CHROME } from './chrome.mjs';
const [base, ownerKey, out] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + String(x).slice(0, 200) : ''}`); };
const owner = (p, body) => fetch(base + '/api/owner' + p, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ownerKey }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());
const until = async (p, fn, ms = 20000, arg) => { const t = Date.now(); while (Date.now() - t < ms) { if (await p.evaluate(fn, arg).catch(() => false)) return true; await wait(400); } return false; };
const clickText = (p, sel, re) => p.evaluate((s, src) => { const r = new RegExp(src); const el = [...document.querySelectorAll(s)].find((x) => r.test(x.textContent) || r.test(x.getAttribute('aria-label') || '')); el?.click(); return !!el; }, sel, re.source);

const t = await owner('/tenants', { name: 'Device Test Pharmacy', admin: { name: 'Ada Admin', email: 'ada@test.rx', password: 'ada-pass-123' } });
const slug = t.tenant.slug, tid = t.tenant.id;
const exp = new Date(Date.now() + 20 * 864e5).toISOString().slice(0, 10);
await owner('/tenants/' + tid + '/records', { records: [
  { t: 'products', id: 'px1', rec: { name: 'Benylin syrup 100ml', generic: 'Cough syrup', form: 'Syrup', price: 9000, cost: 6000, reorder: 0 } },
  { t: 'products', id: 'px2', rec: { name: 'Fungal cream 30g', generic: 'Clotrimazole', form: 'Cream', price: 7000, cost: 2500, reorder: 0 } },
  { t: 'batches', id: 'bx1', rec: { productId: 'px1', batch: 'B1', expiry: exp, cost: 6000 } },
  { t: 'batches', id: 'bx2', rec: { productId: 'px2', batch: 'C1', expiry: '2028-01-01', cost: 2500 } },
  { t: 'movements', id: 'mx1', rec: { productId: 'px1', qty: 12, type: 'Opening stock', batchId: 'bx1', branchId: 'main', date: new Date().toISOString() } },
  { t: 'movements', id: 'mx2', rec: { productId: 'px2', qty: 30, type: 'Opening stock', batchId: 'bx2', branchId: 'main', date: new Date().toISOString() } },
] });
await owner('/tenants/' + tid + '/users', { user: { name: 'Ben Dispenser', email: 'ben@test.rx', role: 'cashier', password: 'ben-pass-123' } });

const b = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
const errors = [];
const signIn = async (email, pw) => {
  const p = await (await b.createBrowserContext()).newPage();
  p.on('pageerror', (e) => errors.push(e.message));
  await p.setViewport({ width: 1366, height: 860 });
  await p.goto(base + '/' + slug, { waitUntil: 'networkidle2' }); await wait(800);
  await p.type('input[type=email]', email); await p.type('input[type=password]', pw);
  // the eye shows the password, and hides it again
  if (email.startsWith('ada')) {
    await p.click('.pw-eye');
    check('the eye button shows the password as typed', await p.evaluate(() => document.querySelector('.pw-wrap input').type === 'text' && document.querySelector('.pw-wrap input').value === 'ada-pass-123'));
    await p.click('.pw-eye');
    check('…and a second tap hides it again', await p.evaluate(() => document.querySelector('.pw-wrap input').type === 'password'));
  }
  await p.evaluate(() => [...document.querySelectorAll('button')].find((x) => x.textContent.includes('Sign in')).click());
  await p.waitForSelector('.sidebar', { timeout: 25000 }); await wait(2500);
  return p;
};
const A = await signIn('ada@test.rx', 'ada-pass-123');
const B = await signIn('ben@test.rx', 'ben-pass-123');

// ---------- This device ----------
await A.goto(base + '/' + slug + '#/device', { waitUntil: 'networkidle2' }); await wait(1000);
check('"This device" opens for everyone and shows the version', /RxPOS 1\.0/.test(await A.evaluate(() => document.querySelector('.update-card')?.innerText || '')));
check('…with an "Update to the latest version" button', await A.evaluate(() => [...document.querySelectorAll('button')].some((x) => /Update to the latest version/.test(x.textContent))));
await B.goto(base + '/' + slug + '#/device', { waitUntil: 'networkidle2' }); await wait(800);
check('a cashier (no Settings access) can reach it too', /Update to the latest version/.test(await B.evaluate(() => document.body.innerText)));
await A.evaluate(() => { const r = document.querySelector('.device-page input[type=range]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(r, '1.2'); r.dispatchEvent(new Event('input', { bubbles: true })); r.dispatchEvent(new Event('change', { bubbles: true })); }); await wait(300);
check('the size slider zooms the whole app', await A.evaluate(() => document.documentElement.style.zoom === '1.2'));
await A.reload({ waitUntil: 'networkidle2' }); await wait(800);
check('…and is remembered on this device', await A.evaluate(() => document.documentElement.style.zoom === '1.2'));
await clickText(A, '.device-page button', /^Back to 100%$/); await wait(200);
check('"Back to 100%" resets it', await A.evaluate(() => document.documentElement.style.zoom === ''));
await A.select('.sound-row select', 'marimba'); await wait(200);
check('each kind of notice can have its own sound', await A.evaluate(() => JSON.parse(localStorage.getItem('rxpos-device')).sounds.message === 'marimba'));
check('…with a choice of built-in tones, your own file or silent', await A.evaluate(() => { const o = [...document.querySelector('.sound-row select').options].map((x) => x.textContent); return o.length >= 10 && o.some((x) => /own file/.test(x)) && o.includes('Silent'); }));
// phone: layout switch
await A.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
await A.evaluateOnNewDocument(() => {}); await A.reload({ waitUntil: 'networkidle2' }); await wait(900);
const seg = await A.evaluate(() => !!document.querySelector('.seg[aria-label="Layout"]'));
check('on a touch screen: Phone view / Desktop view switch', seg);
if (seg) {
  await clickText(A, '.seg button', /Desktop view/); await wait(300);
  check('Desktop view lays the page out at PC width', await A.evaluate(() => /width=1280/.test(document.querySelector('meta[name=viewport]').content)));
  await clickText(A, '.seg button', /Automatic/); await wait(300);
  check('Automatic goes back to the phone layout', await A.evaluate(() => /device-width/.test(document.querySelector('meta[name=viewport]').content)));
}
await A.screenshot({ path: out + '/device-phone.png' });
await A.setViewport({ width: 1366, height: 860 }); await A.reload({ waitUntil: 'networkidle2' }); await wait(800);

// ---------- chat ----------
await A.goto(base + '/' + slug + '#/chat', { waitUntil: 'networkidle2' }); await wait(1200);
await B.goto(base + '/' + slug + '#/chat', { waitUntil: 'networkidle2' }); await wait(1200);
const send = async (p, text) => { await p.type('.chat-compose textarea', text); await p.keyboard.press('Enter'); await wait(400); };
await send(A, 'Morning team, the fridge delivery comes at 3');
check('Enter sends; the message shows with a tick', await until(A, () => !!document.querySelector('.bubble.mine .tick')));
check('…it arrives on the other device', await until(B, () => /fridge delivery comes at 3/.test(document.querySelector('.chat-messages')?.innerText || ''), 25000));
check('the other device reads it: blue ticks for the sender', await until(A, () => !!document.querySelector('.bubble.mine .tick.read'), 25000));
check('messages are grouped under a "Today" label', await A.evaluate(() => /Today/.test(document.querySelector('.chat-day')?.innerText || '')));
// Ben replies to it and reacts
await B.evaluate(() => { const bb = [...document.querySelectorAll('.bubble')].find((x) => /fridge delivery/.test(x.innerText)); bb.querySelector('.bubble-more').click(); }); await wait(300);
check('a message menu offers reply, copy, forward, pin, star, info, delete', await B.evaluate(() => { const t = document.querySelector('.msg-menu')?.innerText || ''; return ['Reply', 'Copy', 'Forward', 'Pin', 'Star', 'Info', 'Delete'].every((w) => t.includes(w)); }));
await B.evaluate(() => [...document.querySelectorAll('.msg-reacts button')].find((x) => x.textContent === '👍').click()); await wait(300);
await B.evaluate(() => { const bb = [...document.querySelectorAll('.bubble')].find((x) => /fridge delivery/.test(x.innerText)); bb.querySelector('.bubble-more').click(); }); await wait(200);
await clickText(B, '.msg-menu button', /^Reply$/); await wait(200);
check('Reply shows what you are answering above the box', /Replying to Ada Admin/.test(await B.evaluate(() => document.querySelector('.compose-ctx')?.innerText || '')));
await send(B, 'Got it, I will be here');
check('the reply quotes the original', await until(B, () => [...document.querySelectorAll('.bubble.mine')].some((x) => x.querySelector('.bubble-quote') && /fridge delivery/.test(x.querySelector('.bubble-quote').innerText))));
check('the reaction 👍 shows on the other device', await until(A, () => /👍/.test(document.querySelector('.bubble-reacts')?.innerText || ''), 25000));
check('…and the reply with its quote arrives too', await until(A, () => [...document.querySelectorAll('.bubble.theirs .bubble-quote')].length > 0, 25000));
// Ada edits her message
await A.evaluate(() => { const bb = [...document.querySelectorAll('.bubble.mine')].find((x) => /fridge delivery/.test(x.innerText)); bb.querySelector('.bubble-more').click(); }); await wait(200);
await clickText(A, '.msg-menu button', /^Edit$/); await wait(200);
await A.evaluate(() => { const i = document.querySelector('.chat-compose textarea'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(i, 'Morning team, the fridge delivery comes at 4 now'); i.dispatchEvent(new Event('input', { bubbles: true })); });
await A.keyboard.press('Enter'); await wait(500);
check('Edit changes the message and marks it "edited"', await A.evaluate(() => [...document.querySelectorAll('.bubble.mine')].some((x) => /comes at 4 now/.test(x.innerText) && /edited/.test(x.innerText))));
check('…on the other device too', await until(B, () => /comes at 4 now/.test(document.querySelector('.chat-messages')?.innerText || ''), 25000));
// pin & star
await A.evaluate(() => { const bb = [...document.querySelectorAll('.bubble.mine')].find((x) => /comes at 4/.test(x.innerText)); bb.querySelector('.bubble-more').click(); }); await wait(200);
await clickText(A, '.msg-menu button', /^Pin$/); await wait(300);
check('Pin puts the message in a bar at the top', /comes at 4/.test(await A.evaluate(() => document.querySelector('.chat-pinned')?.innerText || '')));
check('…for everyone in the chat', await until(B, () => /comes at 4/.test(document.querySelector('.chat-pinned')?.innerText || ''), 25000));
await A.evaluate(() => { const bb = [...document.querySelectorAll('.bubble.mine')].find((x) => /comes at 4/.test(x.innerText)); bb.querySelector('.bubble-more').click(); }); await wait(200);
await clickText(A, '.msg-menu button', /^Star$/); await wait(300);
await A.click('.chat-head button[title="Starred messages"]'); await wait(300);
check('Star keeps it under "Starred messages"', await A.evaluate(() => document.querySelectorAll('.chat-messages .bubble').length === 1 && /comes at 4/.test(document.querySelector('.chat-messages').innerText)));
await A.click('.chat-head button[title="Starred messages"]'); await wait(300);
// search
await A.click('.chat-head button[title="Search this chat"]'); await wait(200);
await A.type('.chat-find input', 'here'); await wait(300);
check('search finds a message and highlights the words', await A.evaluate(() => document.querySelectorAll('.chat-messages .bubble').length === 1 && !!document.querySelector('.bubble mark')));
await A.click('.chat-find button'); await wait(200);
// forward to Ben privately
await A.evaluate(() => { const bb = [...document.querySelectorAll('.bubble.mine')].find((x) => /comes at 4/.test(x.innerText)); bb.querySelector('.bubble-more').click(); }); await wait(200);
await clickText(A, '.msg-menu button', /^Forward$/); await wait(300);
await A.evaluate(() => [...document.querySelectorAll('.fwd-row')].find((x) => /Ben Dispenser/.test(x.innerText)).querySelector('input').click()); await wait(100);
await clickText(A, '.modal button', /^Forward/); await wait(600);
await A.evaluate(() => [...document.querySelectorAll('.chat-conv')].find((x) => /Ben Dispenser/.test(x.innerText)).click()); await wait(600);
check('Forward copies it into another chat, marked "Forwarded"', await A.evaluate(() => /Forwarded/.test(document.querySelector('.chat-messages')?.innerText || '') && /comes at 4/.test(document.querySelector('.chat-messages').innerText)));
// delete for everyone
await A.evaluate(() => { const bb = [...document.querySelectorAll('.bubble.mine')].find((x) => /comes at 4/.test(x.innerText)); bb.querySelector('.bubble-more').click(); }); await wait(200);
await clickText(A, '.msg-menu button', /^Delete$/); await wait(300);
await clickText(A, '.modal button', /Delete for everyone/); await wait(500);
check('Delete for everyone leaves "You deleted this message"', /You deleted this message/.test(await A.evaluate(() => document.querySelector('.chat-messages')?.innerText || '')));
await B.evaluate(() => [...document.querySelectorAll('.chat-conv')].find((x) => /Ada Admin/.test(x.innerText)).click()); await wait(600);
check('…and the other person sees "This message was deleted"', await until(B, () => /This message was deleted/.test(document.querySelector('.chat-messages')?.innerText || ''), 25000));
await A.screenshot({ path: out + '/chat.png' });
// phones: the list, then one chat full screen with a back button
await B.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }); await B.reload({ waitUntil: 'networkidle2' }); await wait(1200);
check('phone: the chat list fills the screen', await B.evaluate(() => getComputedStyle(document.querySelector('.chat-main')).display === 'none' && getComputedStyle(document.querySelector('.chat-list')).display !== 'none'));
await B.evaluate(() => [...document.querySelectorAll('.chat-conv')].find((x) => /General/.test(x.innerText)).click()); await wait(500);
check('…tapping a chat opens it full screen with a back button', await B.evaluate(() => getComputedStyle(document.querySelector('.chat-list')).display === 'none' && getComputedStyle(document.querySelector('.chat-back')).display !== 'none'));
await B.screenshot({ path: out + '/chat-phone.png' });
await B.click('.chat-back'); await wait(300);
check('…and back returns to the list', await B.evaluate(() => getComputedStyle(document.querySelector('.chat-list')).display !== 'none'));

// ---------- idle screen ----------
await A.goto(base + '/' + slug + '#/settings', { waitUntil: 'networkidle2' }); await wait(800);
await clickText(A, '.tab', /Alerts & storage/); await wait(300);
await A.evaluate(() => { const l = [...document.querySelectorAll('label.field')].find((x) => /Show product promotions/.test(x.innerText)); const i = l.querySelector('input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, '0.5'); i.dispatchEvent(new Event('input', { bubbles: true })); });
await A.evaluate(() => [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Save').click()); await wait(500);
await A.goto(base + '/' + slug + '#/', { waitUntil: 'networkidle2' }); await A.bringToFront();
check('the shop window opens after a while with nothing touched', await until(A, () => !!document.querySelector('.spotlight'), 50000));
check('…each slide has a picture', await A.evaluate(() => !!document.querySelector('.spot-art svg, .spot-art img')));
check('…health tips are mixed in, with thumbnails to jump around', await A.evaluate(() => document.querySelectorAll('.spot-thumb').length >= 3 && [...document.querySelectorAll('.spot-thumb')].some((x) => /Health tip/.test(x.innerText))));
const first = await A.evaluate(() => document.querySelector('.spot-card h2')?.innerText);
await A.click('.spot-arrow[aria-label="Next"]'); await wait(700);
check('the arrows move between slides and keep it open', !!(await A.$('.spotlight')) && (await A.evaluate(() => document.querySelector('.spot-card h2')?.innerText)) !== first);
await A.keyboard.press('ArrowLeft'); await wait(700);
check('so do the arrow keys', (await A.evaluate(() => document.querySelector('.spot-card h2')?.innerText)) === first);
await A.evaluate(() => document.querySelectorAll('.spot-thumb')[2].click()); await wait(600);
check('tapping a thumbnail jumps to it', await A.evaluate(() => document.querySelectorAll('.spot-thumb')[2].classList.contains('on')));
await A.click('.spot-top button[aria-label="Pause"]'); await wait(200);
check('it can be paused', await A.evaluate(() => !!document.querySelector('.spot-progress i.on.paused')));
await A.screenshot({ path: out + '/idle.png' });
await A.click('.spot-close'); await wait(600);
check('the Close button closes it', !(await A.$('.spotlight')));

check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await b.close();
await owner('/tenants/' + tid + '/delete', { confirm: slug });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

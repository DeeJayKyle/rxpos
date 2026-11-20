// The owner's requests of 2026-11-20: dashboard cards resized (drag the edge, or the card's menu) and moved (drag and
// drop); a right-click or a long press opens options on every page; the theme panel's sections fold.
//   node v89-layout.mjs <base> <ownerKey> <outDir>
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import { CHROME } from './chrome.mjs';
const [base, ownerKey, out] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + String(x).slice(0, 200) : ''}`); };
const owner = (p, body) => fetch(base + '/api/owner' + p, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ownerKey }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());
const setVal = (p, sel, val) => p.evaluate((sel, val) => { const i = document.querySelector(sel); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, val); i.dispatchEvent(new Event('input', { bubbles: true })); }, sel, val);
const clickText = (p, sel, re) => p.evaluate((s, r) => { const el = [...document.querySelectorAll(s)].find((x) => new RegExp(r).test(x.textContent.trim())); el?.click(); return !!el; }, sel, re.source);
const menuItems = (p) => p.evaluate(() => [...document.querySelectorAll('.ctx-menu button')].map((b) => b.querySelector('span')?.textContent.trim() || b.textContent.trim()));
const cells = (p) => p.evaluate(() => [...document.querySelectorAll('.dash-grid > .dash-cell')].map((c) => c.dataset.widget + ':' + (c.className.match(/span-(\d+)/) || [])[1]));

const t = await owner('/tenants', { name: 'Layout Pharmacy', admin: { name: 'Lea', email: 'lea89@test.rx', password: 'lea-pass-12345' } });
await owner('/tenants/' + t.tenant.id, { features: { catalog: false } });
const b = await puppeteer.launch({ executablePath: CHROME, headless: true });
const p = await (await b.createBrowserContext()).newPage();
await p.setViewport({ width: 1440, height: 950 });
await p.goto(base + '/' + t.tenant.slug, { waitUntil: 'networkidle2' }); await wait(700);
await setVal(p, 'input[autocomplete=username]', 'lea89@test.rx'); await setVal(p, 'input[type=password]', 'lea-pass-12345');
await p.evaluate(() => [...document.querySelectorAll('form button')].find((x) => /^Sign in/.test(x.textContent.trim()))?.click());
await p.waitForSelector('.dash-grid', { timeout: 20000 }); await wait(2500);

// ---- dashboard: a card's menu, resizing by its edge, moving by drag and drop ----
const before = await cells(p);
const second = before[1].split(':')[0];
await p.evaluate((id) => { const c = document.querySelector(`.dash-cell[data-widget="${id}"]`); const r = c.getBoundingClientRect(); c.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 40, clientY: r.top + 40 })); }, second);
await wait(300);
const cm = await menuItems(p);
check('a card\'s menu: sizes, move, hide', ['Small (a third)', 'Half', 'Full width', 'Move earlier', 'Move later'].every((x) => cm.some((y) => y.includes(x))) && cm.some((y) => /^Hide/.test(y)), cm.join(' | '));
await clickText(p, '.ctx-menu button', /^(✓ )?Half$/); await wait(500);
check('…"Half" makes it half the width', (await cells(p)).includes(second + ':6'), (await cells(p)).join(','));
// drag its right edge out to the full row
const edge = await p.evaluate((id) => { const r = document.querySelector(`.dash-cell[data-widget="${id}"] .dash-resize`).getBoundingClientRect(); const g = document.querySelector('.dash-grid').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, to: g.right - 2 }; }, second);
await p.mouse.move(edge.x, edge.y); await p.mouse.down(); await p.mouse.move(edge.x + 60, edge.y, { steps: 4 });
const tip = await p.evaluate(() => document.querySelector('.dash-size-tip')?.textContent || '');
await p.mouse.move(edge.to, edge.y, { steps: 6 }); await p.mouse.up(); await wait(500);
check('…dragging its edge resizes it, showing the width while dragging', /of 12/.test(tip) && (await cells(p)).includes(second + ':12'), tip + ' ' + (await cells(p)).join(','));
// drag the second card before the first
const first = before[0].split(':')[0];
await p.evaluate((from, to) => {
  const dt = new DataTransfer();
  const grip = document.querySelector(`.dash-cell[data-widget="${from}"] .dash-grip`), target = document.querySelector(`.dash-cell[data-widget="${to}"]`);
  grip.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
  return new Promise((res) => setTimeout(() => { target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt })); setTimeout(() => { target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt })); grip.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt })); res(); }, 50); }, 50));
}, second, first);
await wait(500);
const after = await cells(p);
check('…dragging its grip onto another card moves it there', after[0].startsWith(second + ':') && after[1].startsWith(first + ':'), after.join(','));
await p.reload({ waitUntil: 'networkidle2' }); await p.waitForSelector('.dash-grid', { timeout: 20000 }); await wait(1500);
check('…sizes and order are kept on this device', JSON.stringify(await cells(p)) === JSON.stringify(after), (await cells(p)).join(','));
await p.screenshot({ path: `${out}/dashboard.png` });

// ---- options on every page: right-click, and a long press on a touch screen ----
await p.evaluate(() => { const h = document.querySelector('.page-head h1'); const r = h.getBoundingClientRect(); h.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 5, clientY: r.top + 5 })); });
await wait(300);
const dm = await menuItems(p);
check('a right-click on the dashboard: its own options and every page\'s', dm.includes('Edit widgets…') && dm.includes('Cards back to their usual sizes') && dm.includes('Search or ask AI') && dm.includes('Sync now'), dm.join(' | '));
await clickText(p, '.ctx-menu button', /^Cards back to their usual sizes$/); await wait(400);
check('…"Cards back to their usual sizes" undoes the resizing', !(await cells(p)).includes(second + ':12') || before.includes(second + ':12'), (await cells(p)).join(','));
for (const [path, want] of [['/add-stock', 'Scan invoice'], ['/medicines', 'Tidy names and merge look-alikes…'], ['/shifts', 'Start my shift'], ['/customers', 'Pin this page']]) {
  await p.evaluate((h) => { location.hash = '#' + h; }, path); await wait(1400);
  await p.evaluate(() => { const h = document.querySelector('.page h1') || document.querySelector('main.content'); const r = h.getBoundingClientRect(); h.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 5, clientY: r.top + 5 })); });
  await wait(300);
  const m = await menuItems(p);
  check(`${path}: a right-click opens its options`, m.includes(want) && m.includes('Back'), m.join(' | '));
  await p.keyboard.press('Escape'); await wait(150);
}
// typing boxes keep the browser's own menu (copy, paste)
const kept = await p.evaluate(() => { const i = document.querySelector('main.content input'); if (!i) return 'no input'; return i.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })) ? 'native' : 'ours'; });
check('a typing box keeps the browser\'s menu', kept === 'native' && !(await p.evaluate(() => document.querySelector('.ctx-menu'))), kept);
// a long press with a finger
await p.evaluate(() => { const h = document.querySelector('.page h1'); const r = h.getBoundingClientRect(); h.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch', clientX: r.left + 5, clientY: r.top + 5 })); });
await wait(800);
check('a long press on a touch screen opens the same options', (await menuItems(p)).includes('Search or ask AI'));
await p.evaluate(() => document.querySelector('.page h1').dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'touch' })));
await p.keyboard.press('Escape'); await wait(150);

// ---- the theme panel's sections fold ----
await p.evaluate(() => document.querySelector('button[title="Theme"]').click()); await wait(300);
const secs = await p.evaluate(() => [...document.querySelectorAll('.theme-sec')].map((x) => x.querySelector('.sec-head').textContent.trim() + (x.querySelector('.sec-body').hidden ? ':shut' : ':open')));
check('the theme panel: Recommended open; Colour, Gradient and Style folded', secs.some((x) => x === 'Recommended:open') && ['Colour:shut', 'Gradient:shut', 'Style:shut'].every((x) => secs.includes(x)), secs.join(' | '));
await clickText(p, '.theme-sec .sec-head', /^Style$/); await wait(200);
check('…a folded section opens', await p.evaluate(() => [...document.querySelectorAll('.theme-sec')].find((x) => /^Style$/.test(x.querySelector('.sec-head').textContent.trim()))?.querySelector('.sec-body').hidden === false));
await p.screenshot({ path: `${out}/themes.png` });
await p.keyboard.press('Escape');
await p.reload({ waitUntil: 'networkidle2' }); await wait(1500);
await p.evaluate(() => document.querySelector('button[title="Theme"]').click()); await wait(300);
check('…and stays open on this device', await p.evaluate(() => [...document.querySelectorAll('.theme-sec')].find((x) => /^Style$/.test(x.querySelector('.sec-head').textContent.trim()))?.querySelector('.sec-body').hidden === false));

await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

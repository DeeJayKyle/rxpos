// The idle-screen shop window fits inside the screen at PC, laptop, tablet and phone sizes, with 40 medicines.
//   node idle-fit.mjs <base> <ownerKey> <outDir>
import puppeteer from 'puppeteer-core';
import { CHROME } from './chrome.mjs';
const [base, key, out] = process.argv.slice(2);
const owner = (p, b) => fetch(base + '/api/owner' + p, { method: b ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key }, body: b ? JSON.stringify(b) : undefined }).then((r) => r.json());
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const t = await owner('/tenants', { name: 'Fit Pharmacy', admin: { name: 'Fay Fit', email: 'fay@test.rx', password: 'fay-pass-123' } });
const slug = t.tenant.slug;
const forms = ['Tablets', 'Syrup', 'Cream', 'Capsules', 'Injection', 'Inhaler', 'Sachet', 'Bandage'];
const recs = [];
for (let i = 0; i < 40; i++) {
  recs.push({ t: 'products', id: 'p' + i, rec: { name: ['Menthoxyl Inhaler', 'Amoxicillin 500mg capsules extra long name for testing', 'Benylin syrup', 'Clotrimazole cream'][i % 4] + ' ' + i, form: forms[i % 8], price: 2000 + i * 900, cost: 800 + i * 200, reorder: 0 } });
  recs.push({ t: 'batches', id: 'b' + i, rec: { productId: 'p' + i, batch: 'B' + i, expiry: new Date(Date.now() + (10 + i * 5) * 864e5).toISOString().slice(0, 10), cost: 800 } });
  recs.push({ t: 'movements', id: 'm' + i, rec: { productId: 'p' + i, qty: 20, type: 'Opening stock', batchId: 'b' + i, branchId: 'main', date: new Date().toISOString() } });
}
await owner('/tenants/' + t.tenant.id + '/records', { records: recs });
const b = await puppeteer.launch({ executablePath: CHROME, headless: true });
const p = await b.newPage();
await p.goto(base + '/' + slug, { waitUntil: 'networkidle2' }); await wait(800);
await p.type('input[autocomplete=username]', 'fay@test.rx'); await p.type('input[type=password]', 'fay-pass-123');
await p.evaluate(() => [...document.querySelectorAll('button')].find((x) => x.textContent.includes('Sign in')).click());
await p.waitForSelector('.sidebar', { timeout: 20000 }); await wait(4000);
await p.goto(base + '/' + slug + '#/settings', { waitUntil: 'networkidle2' }); await wait(800);
await p.evaluate(() => [...document.querySelectorAll('.tab')].find((x) => /Alerts/.test(x.textContent)).click()); await wait(300);
await p.evaluate(() => { const l = [...document.querySelectorAll('label.field')].find((x) => /Show product promotions/.test(x.innerText)); const i = l.querySelector('input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, '0.5'); i.dispatchEvent(new Event('input', { bubbles: true })); });
await p.evaluate(() => [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Save').click()); await wait(500);
let bad = 0;
for (const [w, h, mobile] of [[1920, 1080], [1366, 768], [1280, 600], [1024, 768], [768, 1024, 1], [390, 844, 1], [844, 390, 1], [360, 640, 1]]) {
  await p.setViewport({ width: w, height: h, isMobile: !!mobile, hasTouch: !!mobile, deviceScaleFactor: 1 });
  await p.goto(base + '/' + slug + '#/', { waitUntil: 'networkidle2' });
  for (let i = 0; i < 100 && !(await p.$('.spotlight')); i++) await wait(500);
  await wait(1200);
  const r = await p.evaluate(() => { const s = document.querySelector('.spot-stage')?.getBoundingClientRect(); const c = document.querySelector('.spot-card')?.getBoundingClientRect(); const x = document.querySelector('.spot-close')?.getBoundingClientRect(); return s && { s: [s.left, s.right, s.top, s.bottom].map(Math.round), c: [c.left, c.right, c.top, c.bottom].map(Math.round), x: [x.left, x.right, x.top, x.bottom].map(Math.round), sw: document.querySelector('.spotlight').scrollWidth, vw: innerWidth, vh: innerHeight }; });


  const ok = r && r.s[0] >= 0 && r.s[1] <= r.vw + 1 && r.c[0] >= 0 && r.c[1] <= r.vw + 1 && r.x[1] <= r.vw && r.x[2] >= 0 && r.sw <= r.vw + 1;
  if (!ok) bad++;
  console.log(ok ? 'PASS' : 'FAIL', `${w}x${h}`, JSON.stringify(r));
  await p.screenshot({ path: `${out}/idle-${w}x${h}.png` });
  await p.keyboard.press('Escape'); await wait(400);
}
await b.close(); await owner('/tenants/' + t.tenant.id + '/delete', { confirm: slug });
console.log(`\n${8 - bad} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);

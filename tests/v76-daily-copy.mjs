// The daily on-device undo copy is made by a worker (src/snapshot.worker.js) straight from IndexedDB, not on the
// screen's thread: in the Windows app (the web version keeps nothing on the computer) a quiet moment after sign-in
// the copy `snap:<today>` appears, holds the saved records, settings and tombstones, and there is one per day.
// Fictional data only.   node v76-daily-copy.mjs <base> <ownerKey>
import puppeteer from 'puppeteer-core';
import { CHROME } from './chrome.mjs';
import { asDesktopApp, APP_ARGS } from './appmode.mjs';
const [base, ownerKey] = process.argv.slice(2);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + String(x).slice(0, 200) : ''}`); };
const owner = (p, body) => fetch(base + '/api/owner' + p, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ownerKey }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());
const until = async (p, fn, ms = 20000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await p.evaluate(fn).catch(() => false)) return true; await wait(500); } return false; };
const setVal = (p, sel, val) => p.evaluate((sel, val) => { const i = document.querySelector(sel); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, val); i.dispatchEvent(new Event('input', { bubbles: true })); }, sel, val);

const t = await owner('/tenants', { name: 'Copy Day Pharmacy', admin: { name: 'Ada Admin', email: 'ada@copyday.rx', password: 'ada-pass-1234' } });
const slug = t.tenant.slug, tid = t.tenant.id;
await owner('/tenants/' + tid, { features: { catalog: false } });
await owner('/tenants/' + tid + '/records', { records: [
  { t: 'products', id: 'p1', rec: { name: 'Test Tabs 500mg', price: 500, cost: 200 } },
  { t: 'products', id: 'p2', rec: { name: 'Test Syrup 100ml', price: 3000, cost: 1800 } },
] });
const b = await puppeteer.launch({ executablePath: CHROME, headless: true, args: APP_ARGS });
const P = await (await b.createBrowserContext()).newPage();
await P.setViewport({ width: 1280, height: 860 });
const errors = []; P.on('pageerror', (e) => errors.push(e.message));
await asDesktopApp(P, base);
await P.goto(base + '/' + slug, { waitUntil: 'networkidle2' }); await wait(700);
await setVal(P, 'input[autocomplete=username]', 'ada@copyday.rx');
await setVal(P, 'input[type=password]', 'ada-pass-1234');
await P.evaluate(() => [...document.querySelectorAll('form button')].find((x) => /^Sign in/.test(x.textContent.trim()))?.click());
check('signed in as the Windows app', await until(P, () => !!document.querySelector('.sidebar'), 20000));
await until(P, () => /Synced/.test(document.querySelector('.pill.clock .clock-state')?.innerText || ''), 30000);

// nobody touches the app: after the quiet half-minute the worker writes today's copy
const readCopies = () => P.evaluate(() => new Promise((res) => {
  const q = indexedDB.open('pharmapos');
  q.onsuccess = () => {
    const kv = q.result.transaction('kv').objectStore('kv');
    const k = kv.getAllKeys();
    k.onsuccess = () => {
      const keys = k.result.map(String).filter((x) => x.startsWith('snap:'));
      if (!keys.length) { q.result.close(); return res({ keys }); }
      const g = kv.get(keys.sort().at(-1));
      g.onsuccess = () => { const v = g.result; q.result.close(); res({ keys, v: v?.v, ids: (v?.rows || []).flatMap((r) => (r.t === 'products' ? r.rs.map((x) => x.id) : [])), settings: !!v?.settings, tomb: Array.isArray(v?.tomb) }); };
    };
  };
  q.onerror = () => res({ keys: [] });
}));
let copy = { keys: [] };
for (let i = 0; i < 40 && !copy.keys.length; i++) { await wait(2000); copy = await readCopies(); }
check('a quiet moment after sign-in, today\'s copy is written', copy.keys.length === 1, JSON.stringify(copy.keys));
check('…by the worker, from the saved records (format 2)', copy.v === 2, copy.v);
check('…with the pharmacy\'s medicines, settings and deletions', ['p1', 'p2'].every((id) => copy.ids?.includes(id)) && copy.settings && copy.tomb, JSON.stringify(copy));
// another reload the same day: still one copy
await P.reload({ waitUntil: 'networkidle2' }); await wait(40000);
check('one copy a day', (await readCopies()).keys.length === 1);
check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await b.close();
await owner('/tenants/' + tid + '/delete', { confirm: slug });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

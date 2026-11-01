// Dashboard "Today's sales" card opens Reports → Sales lines for today (every medicine sold today). Cashiers (permission
// reports.lines only) land there too, but see just the Sales lines tab and no profit / margin / below-cost figures.
//   node v49-dashboard-sales-link.mjs <base> <ownerKey> <outDir>
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import { CHROME } from './chrome.mjs';
const [base, ownerKey, out] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + String(x).slice(0, 160) : ''}`); };
const owner = (p, body) => fetch(base + '/api/owner' + p, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ownerKey }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());
const setVal = (p, sel, val) => p.evaluate((sel, val) => { const i = document.querySelector(sel); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, val); i.dispatchEvent(new Event('input', { bubbles: true })); }, sel, val);
const todayLocal = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };

const t = await owner('/tenants', { name: 'Dashboard Link Test', admin: { name: 'Ada Admin', email: 'ada@test.rx', password: 'ada-pass-1234' } });
const tid = t.tenant.id, slug = t.tenant.slug;
await owner('/tenants/' + tid + '/users', { user: { name: 'Cal Cashier', email: 'cal@test.rx', role: 'cashier', password: 'cal-pass-1234' } });

const b = await puppeteer.launch({ executablePath: CHROME, headless: true });
const signInAndClick = async (email, pw) => {
  const p = await (await b.createBrowserContext()).newPage();
  await p.setViewport({ width: 1366, height: 860 });
  await p.goto(base + '/' + slug, { waitUntil: 'networkidle2' }); await wait(700);
  await setVal(p, 'input[autocomplete=username]', email);
  await setVal(p, 'input[type=password]', pw);
  await p.evaluate(() => [...document.querySelectorAll('form button')].find((x) => /^Sign in/.test(x.textContent.trim()))?.click());
  await p.waitForSelector('.sidebar', { timeout: 20000 }); await wait(1200);
  await p.evaluate(() => { location.hash = '#/'; }); await wait(1200);
  const clicked = await p.evaluate(() => { const c = [...document.querySelectorAll('.card.stat.link')].find((x) => /today's sales/i.test(x.innerText)); c?.click(); return !!c; });
  await wait(1500);
  return { p, clicked };
};

// 1) admin (can see reports) → Reports, Sales lines tab, today to today
const a = await signInAndClick('ada@test.rx', 'ada-pass-1234');
check("the Today's sales card is clickable", a.clicked);
const at = await a.p.evaluate(() => ({ hash: location.hash, tab: document.querySelector('.tab.active')?.textContent.trim() || '', body: document.body.innerText }));
await a.p.screenshot({ path: out + '/admin.png' });
check('…it opens Reports', /#\/reports/.test(at.hash), at.hash);
check('…on the Sales lines tab', at.tab === 'Sales lines', at.tab);
const d = todayLocal();
check("…for today's date only", at.body.includes(`Sales lines from ${d} to ${d}`), (at.body.match(/Sales lines from [^\n]*/) || [''])[0]);

check('…and an administrator sees profit', /profit/i.test(at.body) && /margin/i.test(at.body));

// 2) cashier (Sales lines only) → the same report, one tab, no profit
const c = await signInAndClick('cal@test.rx', 'cal-pass-1234');
const ct = await c.p.evaluate(() => ({ hash: location.hash, tabs: [...document.querySelectorAll('.tab')].map((x) => x.textContent.trim()), body: document.body.innerText, nav: [...document.querySelectorAll('.sidebar a')].map((a) => a.textContent.trim()) }));
await c.p.screenshot({ path: out + '/cashier.png' });
check("a cashier's Today's sales card opens Reports too", c.clicked && /#\/reports/.test(ct.hash), ct.hash);
check('…showing only the Sales lines tab', ct.tabs.length === 1 && ct.tabs[0] === 'Sales lines', JSON.stringify(ct.tabs));
check("…for today's date", ct.body.includes(`Sales lines from ${d} to ${d}`));
check('…with no profit, margin or below-cost figures', !/Profit|Margin|Sold below cost/i.test(ct.body), (ct.body.match(/.{0,30}(Profit|Margin|below cost).{0,30}/i) || [''])[0]);
check('…and Reports is in the cashier\'s menu', ct.nav.some((x) => /Reports/.test(x)), JSON.stringify(ct.nav));

await b.close();
await owner('/tenants/' + tid + '/delete', { confirm: slug });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

// The clean dashboard (2026-11-15, the owner's choice from the dashboard references): period chips with ↑ / ↓ on the
// four figures, one sales chart (Daily / Monthly) with a tooltip and Export, stock health with what drives it, the
// top medicines and the latest sales; Edit widgets shows, hides and orders the cards on this device; the reference
// themes (Royal Violet, Cobalt Blue, Soft Grey, Sage Garden, Ember Forge). Fictional data only.
//   node v77-clean-dashboard.mjs <base> <ownerKey> <outDir>
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
import { CHROME } from './chrome.mjs';
const [base, ownerKey, out = '.output/v77'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + String(x).slice(0, 300) : ''}`); };
const owner = (p, body) => fetch(base + '/api/owner' + p, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ownerKey }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());
const until = async (p, fn, ms = 20000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await p.evaluate(fn).catch(() => false)) return true; await wait(250); } return false; };

const T = await owner('/tenants', { name: 'Clean Dash Pharmacy', admin: { name: 'Dana Admin', email: 'dana@clean.rx', password: 'dana-pass-1234' } });
const tid = T.tenant.id, slug = T.tenant.slug;
await owner('/tenants/' + tid, { features: { catalog: false } });
const at = (daysAgo) => { const d = new Date(); d.setDate(d.getDate() - daysAgo); d.setHours(10, 0, 0, 0); return d.toISOString(); };
const exp = (days) => { const d = new Date(); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); };
const sale = (id, n, daysAgo, pid, name, qty, price, cost, paid) => ({ t: 'sales', id, rec: { number: 'R' + n, date: at(daysAgo), type: 'retail', branchId: 'main', items: [{ id: pid, name, qty, price, cost, alloc: [] }], subtotal: qty * price, discount: 0, tax: 0, total: qty * price, payment: paid === 0 ? 'Credit' : 'Cash', paid: paid ?? qty * price, customerId: 'walk-in', customerName: paid === 0 ? 'Test Clinic One' : 'Walk-in Customer', cashier: 'Dana Admin', status: 'completed' } });
await owner('/tenants/' + tid + '/records', { records: [
  { t: 'products', id: 'p1', rec: { name: 'Amoxil 500mg Caps', generic: 'Amoxicillin', form: 'Capsules', price: 500, cost: 200, reorder: 5 } },
  { t: 'products', id: 'p2', rec: { name: 'Cipro 500', generic: 'Ciprofloxacin', form: 'Tablets', price: 800, cost: 300, reorder: 50 } },
  { t: 'products', id: 'p3', rec: { name: 'Zinc 20mg', generic: 'Zinc', form: 'Tablets', price: 200, cost: 90, reorder: 5 } },
  { t: 'batches', id: 'b1', rec: { productId: 'p1', batch: 'A1', expiry: exp(400), cost: 200, branchId: 'main' } },
  { t: 'batches', id: 'b2', rec: { productId: 'p2', batch: 'C1', expiry: exp(20), cost: 300, branchId: 'main' } },
  { t: 'movements', id: 'm1', rec: { productId: 'p1', qty: 40, type: 'Opening stock', branchId: 'main', batchId: 'b1', date: at(60) } },
  { t: 'movements', id: 'm2', rec: { productId: 'p2', qty: 10, type: 'Opening stock', branchId: 'main', batchId: 'b2', date: at(60) } },
  sale('s1', 1, 0, 'p1', 'Amoxil 500mg Caps', 4, 500, 200),
  sale('s2', 2, 0, 'p2', 'Cipro 500', 1, 800, 300, 0),
  sale('s3', 3, 1, 'p1', 'Amoxil 500mg Caps', 2, 500, 200),
  sale('s4', 4, 12, 'p2', 'Cipro 500', 3, 800, 300),
  sale('s5', 5, 45, 'p1', 'Amoxil 500mg Caps', 10, 500, 200),
] });
const b = await puppeteer.launch({ executablePath: CHROME, headless: true });
const p = await (await b.createBrowserContext()).newPage();
await p.setViewport({ width: 1440, height: 1000 });
const errors = []; p.on('pageerror', (e) => errors.push(e.message));
await p.goto(base + '/' + slug, { waitUntil: 'networkidle2' }); await wait(500);
await p.evaluate(() => { for (const id of ['pos', 'dashboard']) localStorage.setItem('rxpos-tip:' + id, '1'); });
// B8: this device last saw 1.13.0's highlights, so 1.15.0 is an update to it
await p.evaluate(() => localStorage.setItem('rxpos-device', JSON.stringify({ ...JSON.parse(localStorage.getItem('rxpos-device') || '{}'), whatsNewSeen: '1.13.0' })));
await p.reload({ waitUntil: 'networkidle2' }); await wait(500);
await p.type('input[autocomplete=username]', 'dana@clean.rx'); await p.type('input[type=password]', 'dana-pass-1234');
await p.evaluate(() => [...document.querySelectorAll('form button')].find((x) => /^Sign in/.test(x.textContent.trim()))?.click());
await p.waitForSelector('.sidebar', { timeout: 20000 });
await until(p, () => /Synced/.test(document.querySelector('.pill.clock .clock-state')?.innerText || ''), 30000);
await until(p, () => document.querySelectorAll('.recent-table tbody tr').length >= 5, 15000);
await wait(1500);
const tiles = () => p.evaluate(() => Object.fromEntries([...document.querySelectorAll('.kpis .stat')].map((s) => [s.querySelector('small').textContent.trim(), s.querySelector('strong').innerText.trim()])));
const widgets = () => p.evaluate(() => [...document.querySelectorAll('.dash-cell')].map((c) => c.dataset.widget));

check('clean layout: figures, the bento row, chart, health, top medicines, latest sales, busy hours', JSON.stringify(await widgets()) === JSON.stringify(['figures', 'bento', 'chart', 'health', 'top', 'recent', 'busy']), JSON.stringify(await widgets()));
check('header: no repeated search or bell (the top bar\'s show), today\'s date in the greeting\'s line', await p.evaluate(() => !document.querySelector('.dash-search') && !document.querySelector('.dash-bell') && !!document.querySelector('.topbar .search-trigger')?.offsetParent && !!document.querySelector('.topbar > .bell button[aria-label^=Notifications]')?.offsetParent && /\d{4}/.test(document.querySelector('.welcome .sub .date-pill')?.innerText || '')));
// UI batch 3, B1-B8
check('B8 what\'s new: shown once after an update', await p.evaluate(() => /What.s new in 1\.15\.0/.test(document.querySelector('.whats-new')?.innerText || '') && !!document.querySelector('.whats-new a')), await p.evaluate(() => localStorage.getItem('rxpos-device')));
check('B7 setup checklist: medicines and stock ticked from the data, staff not yet', await p.evaluate(() => { const st = (id) => document.querySelector(`.setup-steps [data-step=${id}]`)?.classList.contains('done'); return st('medicines') && st('stock') && st('staff') === false && /of 6 done/.test(document.querySelector('.setup-card').innerText); }));
// 1.16.0 (the owner's clean-up): the bento row keeps the week at a glance and the next step; the daily chart and the
// latest sales are the dashboard's own (no copies), and there is one period picker
check('B1 one daily chart (none in the bento row), with a dashed average line', await p.evaluate(() => !document.querySelector('.bento-bar, .bento-chart') && !!document.querySelector('.chart-card .trend-avg') && document.querySelectorAll('[role=radiogroup][aria-label=Period]').length === 1));
check('B2 figure cards: the change and "vs yesterday" on one line', await p.evaluate(() => [...document.querySelectorAll('.kpis .stat .stat-sub')].every((x) => x.getBoundingClientRect().height < 30 && getComputedStyle(x).whiteSpace === 'nowrap')), await p.evaluate(() => [...document.querySelectorAll('.kpis .stat .stat-sub')].map((x) => x.getBoundingClientRect().height + getComputedStyle(x).whiteSpace).join()));
check('B3 one latest-sales list (the table), none in the bento row', await p.evaluate(() => !document.querySelector('.bento-recent') && !!document.querySelector('.recent-table')));
check('B4 the hero card shows the busiest hour (10:00, as the samples) and the best day', await p.evaluate(() => /Busiest hour\s*10:00 · \d+ sales?/.test(document.querySelector('.bento-facts')?.innerText || '') && /Best day/.test(document.querySelector('.bento-facts').innerText)));
check('B5 busy hours: a day × hour grid with "Day 10:00 · n sales" on the cells', await p.evaluate(() => { const c = [...document.querySelectorAll('.busy-grid td')].filter((x) => +x.dataset.v > 0); return c.length >= 1 && c.every((x) => /^\w{3} 10:00 · \d+ sales?$/.test(x.title)); }));
check('B6 small amounts stay in full (no short form below 100,000)', await p.evaluate(() => !document.querySelector('.kpis .stat strong[data-full]') && /2,800/.test(document.querySelector('.kpis .stat strong').innerText)));
// 1.14.1 (the owner's choice): figure cards show the whole amount unless This device → Amounts on the dashboard says Short
await p.evaluate(() => { location.hash = '#/device'; }); await wait(900);
check('1.14.1 This device: "Amounts on the dashboard", Whole by default', await p.evaluate(() => { const g = document.querySelector('[role=radiogroup][aria-label="Amounts on the dashboard"]'); return !!g && /Whole/.test(g.querySelector('[aria-checked=true]')?.textContent || ''); }));
await p.evaluate(() => [...document.querySelectorAll('[role=radiogroup][aria-label="Amounts on the dashboard"] button')].find((x) => /Short/.test(x.textContent)).click()); await wait(300);
check('1.14.1 …Short is kept on this device', await p.evaluate(() => JSON.parse(localStorage.getItem('rxpos-device') || '{}').amountStyle === 'short'));
await p.evaluate(() => [...document.querySelectorAll('[role=radiogroup][aria-label="Amounts on the dashboard"] button')].find((x) => /Whole/.test(x.textContent)).click()); await wait(300);
await p.evaluate(() => { location.hash = '#/'; }); await wait(900);
await p.evaluate(() => [...document.querySelectorAll('.setup-card button')].find((x) => /Hide/.test(x.textContent)).click()); await wait(300);
check('B7 Hide puts the checklist away', await p.evaluate(() => !document.querySelector('.setup-card')));
await p.reload({ waitUntil: 'networkidle2' }); await wait(2000);
check('B7/B8 …kept on this device, and what\'s new is not shown again', await p.evaluate(() => !document.querySelector('.setup-card') && !document.querySelector('.whats-new') && !!document.querySelector('.kpis')));
let t = await tiles();
check('Today: today\'s sales 2,800 with ↑ against yesterday', /2,800/.test(t["Today's sales"]) && await p.evaluate(() => /up/.test(document.querySelector('.kpis .stat .delta')?.className || '')), JSON.stringify(t));
await p.evaluate(() => [...document.querySelectorAll('.period-chips button')].find((x) => x.textContent === '1M').click()); await wait(900);
t = await tiles();
check('1M: sales of the last 30 days (6,200) compared with the 30 days before', /6,200/.test(t.Sales) && /vs the 30 days before/.test(await p.evaluate(() => document.querySelector('.kpis .stat').innerText)), JSON.stringify(t));
check('…the top medicines follow the period', /last 30 days/.test(await p.evaluate(() => document.querySelector('[data-widget=top] h3').innerText)) && /Amoxil/.test(await p.evaluate(() => document.querySelector('.top-list').innerText)));
await p.reload({ waitUntil: 'networkidle2' }); await wait(2000);
check('the period chip is kept on this device', await p.evaluate(() => document.querySelector('.period-chips [aria-checked=true]')?.textContent === '1M'));
check('stock health: a gauge, an insight and what drives it (expiring Cipro)', await p.evaluate(() => /\d+%/.test(document.querySelector('.gauge-num')?.textContent || '') && /Expiring/.test(document.querySelector('.driven-by')?.innerText || '') && !!document.querySelector('.health-insight strong')));
check('latest sales: an Owing pill', await p.evaluate(() => /Owing/.test(document.querySelector('.recent-table').innerText)));
// chart tooltip and export
const hit = await p.$$('.trend-hit');
await hit[hit.length - 2].hover(); await wait(400);
check('chart: pointing at a day shows a tooltip', await p.evaluate(() => /Sales/.test(document.querySelector('.chart-tip')?.innerText || '')));
await p.evaluate(() => [...document.querySelectorAll('.chart-card .seg button')].find((x) => x.textContent === 'Monthly').click()); await wait(600);
check('chart: Monthly shows money in and out', /month by month/.test(await p.evaluate(() => document.querySelector('.chart-card h3').innerText)));
await p.evaluate(() => document.querySelector('.chart-export button').click()); await wait(200);
check('chart: Export offers figures (CSV) and a picture (PNG)', await p.evaluate(() => /CSV/.test(document.querySelector('.chart-export-menu')?.innerText || '') && /PNG/.test(document.querySelector('.chart-export-menu').innerText)));
await p.keyboard.press('Escape');
await p.screenshot({ path: path.join(out, 'dashboard.png'), fullPage: true });
// edit widgets
await p.evaluate(() => [...document.querySelectorAll('button')].find((x) => /Edit widgets/.test(x.textContent)).click()); await wait(400);
await p.evaluate(() => { const li = [...document.querySelectorAll('.widget-list li')].find((x) => /Stock alert tiles/.test(x.innerText)); li.querySelector('input').click(); });
await p.evaluate(() => { const li = [...document.querySelectorAll('.widget-list li')].find((x) => /Latest sales/.test(x.innerText)); li.querySelector('input').click(); });
await p.evaluate(() => [...document.querySelectorAll('.modal button')].find((x) => /Done/.test(x.textContent)).click()); await wait(600);
let w = await widgets();
check('Edit widgets: the alert tiles come back, latest sales goes', w.includes('alerts') && !w.includes('recent'), JSON.stringify(w));
await p.reload({ waitUntil: 'networkidle2' }); await wait(2000);
w = await widgets();
check('…kept on this device after a reload', w.includes('alerts') && !w.includes('recent'), JSON.stringify(w));
await p.evaluate(() => [...document.querySelectorAll('button')].find((x) => /Edit widgets/.test(x.textContent)).click()); await wait(300);
await p.evaluate(() => [...document.querySelectorAll('.modal button')].find((x) => /standard dashboard/.test(x.textContent)).click()); await wait(300);
await p.keyboard.press('Escape'); await wait(400);
check('…and "Back to the standard dashboard" restores the clean layout', JSON.stringify(await widgets()) === JSON.stringify(['figures', 'bento', 'chart', 'health', 'top', 'recent', 'busy']));
// sidebar groups: a count, a + quick add, opening and closing
// 1.16.0 (the owner's clean-up): group titles carry alert counts only, no page counts; one group open at a time
check('sidebar group titles show no page counts', await p.evaluate(() => document.querySelectorAll('.nav-title .nav-count').length === 0 && document.querySelectorAll('.nav-title').length >= 4));
await p.evaluate(() => [...document.querySelectorAll('.nav-title')].find((x) => /Finance/.test(x.textContent))?.click()); await wait(500);
check('a group opens with its pages', await p.evaluate(() => { const g = [...document.querySelectorAll('.nav-group')].find((x) => /Finance/.test(x.querySelector('.nav-title')?.textContent || '')); return g.classList.contains('open') && [...g.querySelectorAll('a')].some((a) => !a.hidden); }));
check('…and the other groups fold (one open at a time)', await p.evaluate(() => [...document.querySelectorAll('.nav-group:not(.nav-quick)')].filter((g) => g.querySelector('.nav-title') && g.classList.contains('open')).length === 1));
check('rarely used pages sit under More', await p.evaluate(() => { const g = [...document.querySelectorAll('.nav-group')].find((x) => /^More/.test(x.querySelector('.nav-title')?.textContent.trim() || '')); return !!g && /Kits/.test(g.textContent) && /Shelves/.test(g.textContent); }));
await p.evaluate(() => { location.hash = '#/customers'; }); await wait(900);
await p.evaluate(() => document.activeElement?.blur()); await p.keyboard.press('g'); await p.keyboard.press('g'); await wait(500);
await p.evaluate(() => { location.hash = '#/'; }); await wait(900);
check('no Recent list; Pinned is a group that folds', await p.evaluate(() => !document.querySelector('a.nav-recent') && /Pinned/.test(document.querySelector('.nav-quick .nav-title')?.textContent || '')));
await p.screenshot({ path: path.join(out, 'sidebar-open.png'), clip: { x: 0, y: 0, width: 260, height: 1000 } });
await p.evaluate(() => document.querySelector('.nav-quick .nav-title').click()); await wait(300);
check('…Pinned folds', await p.evaluate(() => document.querySelector('.nav-quick').classList.contains('collapsed')));
await p.screenshot({ path: path.join(out, 'sidebar-pinned-folded.png'), clip: { x: 0, y: 0, width: 260, height: 600 } });
await p.evaluate(() => [...document.querySelectorAll('.nav-add')].find((x) => /Receive stock/.test(x.title))?.click()); await wait(800);
check('the + of Stock opens Add Stock', await p.evaluate(() => location.hash.includes('add-stock')));
await p.evaluate(() => { location.hash = '#/'; }); await wait(1200);
// UI batch 2 (2026-11-18)
check('figure cards carry a small 7-day trend line', await p.evaluate(() => document.querySelectorAll('.kpis .stat .spark polyline').length >= 3 && [...document.querySelectorAll('.kpis .stat .spark')].every((s) => s.getBoundingClientRect().width <= 100 && s.getBoundingClientRect().height <= 30)), await p.evaluate(() => document.querySelectorAll('.kpis .stat .spark').length));
check('latest sales: only unusual states carry a pill (Owing, not Paid)', await p.evaluate(() => { const t = [...document.querySelectorAll('.recent-table .status-pill')].map((x) => x.innerText.trim()); return t.includes('Owing') && !t.includes('Paid'); }), await p.evaluate(() => [...document.querySelectorAll('.recent-table .status-pill')].map((x) => x.innerText).join()));
await p.evaluate(() => document.querySelector('button[aria-label=Theme]').click()); await wait(300);
const before = await p.evaluate(() => document.documentElement.dataset.palette);
const other = await p.evaluate(() => [...document.querySelectorAll('.theme-item')].findIndex((x) => !x.classList.contains('on')));
await (await p.$$('.theme-item'))[other].hover(); await wait(200);
const previewed = await p.evaluate(() => document.documentElement.dataset.palette);
check('theme menu: hovering a theme previews it', previewed !== before, previewed);
await p.mouse.move(700, 900); await wait(200);
check('...leaving the menu puts the chosen theme back', await p.evaluate((x) => document.documentElement.dataset.palette === x, before));
await p.mouse.click(700, 980); await wait(300);
check('...and closing keeps it', await p.evaluate((x) => document.documentElement.dataset.palette === x, before));
const compact = () => p.evaluate(() => [...document.querySelectorAll('.toggle-row, label')].find((x) => /Compact tables/.test(x.innerText))?.querySelector('input')?.click());
await p.evaluate(() => { location.hash = '#/device'; }); await wait(1200);
await compact(); await wait(300);
check('This device: Compact tables', await p.evaluate(() => document.documentElement.dataset.density === 'compact'));
await p.evaluate(() => { location.hash = '#/sales'; }); await wait(1500);
const rowH = await p.evaluate(() => Math.round(document.querySelector('table tbody tr')?.getBoundingClientRect().height || 0));
check('...a sales row is about 36 px', rowH > 0 && rowH <= 44, rowH);
check('Sales History: no "completed" pill on ordinary sales', await p.evaluate(() => ![...document.querySelectorAll('td[data-label=Status] .badge')].some((x) => /completed/i.test(x.innerText))));
await p.evaluate(() => { location.hash = '#/device'; }); await wait(1000);
await compact(); await wait(300);
check('...and off again', await p.evaluate(() => !document.documentElement.dataset.density));
await p.evaluate(() => { location.hash = '#/'; }); await wait(1200);
// themes from the references
for (const [id, side] of [['royal-purple', 'dark'], ['electric-blue', 'dark'], ['sage', 'dark'], ['charcoal-lime', 'light'], ['amber-gold', 'dark']]) {
  await p.evaluate((x) => { localStorage.setItem('pharmapos-theme', x); }, id);
  await p.reload({ waitUntil: 'networkidle2' }); await wait(1800);
  const got = await p.evaluate(() => [document.documentElement.dataset.palette, document.documentElement.dataset.sidebar]);
  check(`theme ${id} applies (sidebar ${side})`, got[0] === id && got[1] === side, JSON.stringify(got));
  await p.screenshot({ path: path.join(out, `theme-${id}.png`) });
}
// phone
await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
await p.reload({ waitUntil: 'networkidle2' }); await wait(2000);
check('phone: nothing runs off the screen', await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), await p.evaluate(() => document.documentElement.scrollWidth));
await p.screenshot({ path: path.join(out, 'dashboard-phone.png'), fullPage: true });
check('no page errors', !errors.length, errors.join(' | '));

await b.close();
await owner('/tenants/' + tid + '/delete', { confirm: T.tenant.slug });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

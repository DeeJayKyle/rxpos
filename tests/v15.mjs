// RxPOS batch-15 features: node v15.mjs <base> <ownerKey> <outDir>
import puppeteer from 'puppeteer-core';
import { CHROME } from './chrome.mjs';
import fs from 'node:fs';
const [base, ownerKey, out] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + String(x).slice(0, 160) : ''}`); };
const owner = (p, body) => fetch(base + '/api/owner' + p, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ownerKey }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());
const LOGO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAJ0lEQVR42mNk+M/AQAxgYmBgYGBg+M/AwMDAwPCfgYGBgYGBgYEBAI5yBAEJ3w8VAAAAAElFTkSuQmCC';

// ----- owner: pharmacy with logo + 3 themes, stock that expires soon, a sale last week -----
const t = await owner('/tenants', { name: 'Bugolobi Care Pharmacy', admin: { name: 'Bea Admin', email: 'bea@test.rx', password: 'bea-pass-123' } });
const slug = t.tenant.slug, tid = t.tenant.id;
let j = await owner('/tenants/' + tid, { branding: { logo: LOGO, themes: ['tokyo-night', 'mint', 'clinic-blue'], defaultTheme: 'mint' } });
check('owner sets logo and 3 allowed themes', j.tenant?.branding?.logo === LOGO && j.tenant.branding.themes.length === 3, j.error);
j = await owner('/tenants/' + tid, { branding: { themes: ['mint', 'dark'] } });
check('fewer than 3 themes refused', !!j.error);
j = await fetch(base + '/api/pharmacy/' + slug).then((r) => r.json());
check('sign-in page gets the pharmacy logo', j.logo === LOGO);
await owner('/tenants/' + tid + '/users', { user: { name: 'Dan Dispenser', email: 'dan@test.rx', role: 'dispenser', password: 'dan-pass-123' } });
const soon = new Date(Date.now() + 12 * 864e5).toISOString().slice(0, 10);
const lastWeek = (d) => { const x = new Date(); x.setDate(x.getDate() - ((x.getDay() + 6) % 7) - 7 + d); x.setHours(10); return x.toISOString(); };
await owner('/tenants/' + tid + '/records', { records: [
  { t: 'settings', id: 'settings', rec: { name: 'Bugolobi Care Pharmacy', quietFrom: 0, quietTo: 0 } },
  { t: 'batches', id: 'b-amox', rec: { productId: 'cat-1', batch: 'AMX1', expiry: soon, cost: 500 } },
  { t: 'movements', id: 'm-amox', rec: { productId: 'cat-1', qty: 30, type: 'Opening stock', batchId: 'b-amox', branchId: 'main', date: new Date().toISOString() } },
  { t: 'sales', id: 's-lw1', rec: { number: 'R1', date: lastWeek(1), total: 45000, items: [{ id: 'cat-1', name: '02-LON', qty: 3, price: 15000, cost: 9000 }], payment: 'Cash', cashier: 'Bea Admin', status: 'paid', branchId: 'main' } },
  { t: 'sales', id: 's-lw2', rec: { number: 'R2', date: lastWeek(3), total: 12000, items: [{ id: 'cat-2', name: 'Item two', qty: 1, price: 12000, cost: 8000 }], payment: 'Mobile Money', cashier: 'Bea Admin', status: 'paid', branchId: 'main' } },
] });

// ----- API: health alerts, AI quiz, AI prescription -----
j = await fetch(base + '/api/health-alerts').then((r) => r.json());
check('WHO health alerts feed (or a clear message when WHO is unreachable)', (Array.isArray(j.items) && j.items.length > 0) || /unavailable/.test(j.error || ''), j.items?.[0]?.title || j.error);
const login = await fetch(base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'bea@test.rx', password: 'bea-pass-123', tenant: slug }) }).then((r) => r.json());
const auth = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + login.token };
let r = await fetch(base + '/api/ai/quiz', { method: 'POST', headers: auth, body: JSON.stringify({ drugs: ['amoxicillin', 'metformin', 'paracetamol', 'amlodipine'], count: 4 }) });
j = await r.json();
check('AI drug quiz (Workers AI)', r.ok && j.questions?.length >= 3 && j.questions.every((q) => q.options.length === 4), j.error || j.questions?.[0]?.q);

const b = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
// make a typed prescription picture
const pg = await b.newPage();
const rxImg = await pg.evaluate(() => {
  const c = document.createElement('canvas'); c.width = 900; c.height = 640; const x = c.getContext('2d');
  x.fillStyle = '#fff'; x.fillRect(0, 0, 900, 640); x.fillStyle = '#111'; x.font = 'bold 34px Arial'; x.fillText('MULAGO HOSPITAL - OUTPATIENT', 40, 70);
  x.font = '28px Arial'; x.fillText('Patient: John Okello   Age: 34', 40, 140); x.fillText('Dx: Upper respiratory tract infection', 40, 190);
  x.font = 'bold 30px Arial'; x.fillText('Rx', 40, 260); x.font = '28px Arial';
  x.fillText('1. Amoxicillin 500mg capsules  1 cap tds x 5 days', 60, 310);
  x.fillText('2. Paracetamol 500mg tablets  2 tabs tds x 3 days', 60, 360);
  x.fillText('3. Cetirizine 10mg tablets  1 tab od x 5 days', 60, 410);
  x.fillText('Dr. A. Namukasa   Signature ______', 40, 520);
  return c.toDataURL('image/jpeg', 0.9);
});
await pg.close();
r = await fetch(base + '/api/ai/prescription', { method: 'POST', headers: auth, body: JSON.stringify({ image: rxImg }) });
j = await r.json();
const names = (j.medicines || []).map((m) => m.name.toLowerCase()).join(', ');
check('AI reads a prescription photo (Workers AI vision)', r.ok && /amox/.test(names) && /paracet/.test(names), j.error || names);

// ----- UI as the admin -----
const ctxA = await b.createBrowserContext();
await ctxA.overridePermissions(base, ['geolocation', 'notifications', 'microphone', 'camera']);
const A = await ctxA.newPage(); await A.setViewport({ width: 1366, height: 860 });
await A.setGeolocation({ latitude: 0.3136, longitude: 32.5811 });
const errors = []; A.on('pageerror', (e) => errors.push('A: ' + e.message));
await A.goto(base + '/' + slug, { waitUntil: 'networkidle2' }); await wait(1200);
check('sign-in shows the pharmacy logo', await A.evaluate((l) => !!document.querySelector(`img[src="${l}"]`), LOGO));
await A.type('input[autocomplete=username]', 'bea@test.rx'); await A.type('input[type=password]', 'bea-pass-123');
await A.evaluate(() => [...document.querySelectorAll('button')].find((x) => x.textContent.includes('Sign in')).click());
await wait(6000);
const top = await A.evaluate(() => document.querySelector('.topbar')?.innerText || '');
check('top bar shows a live clock with seconds, no "sync" wording', /\d{1,2}:\d{2}:\d{2}/.test(top) && !/sync/i.test(top), top.replace(/\n/g, ' | '));
check('sidebar shows the pharmacy logo', await A.evaluate(() => !!document.querySelector('.sidebar .logo-img')));
check('dashboard has no Add stock button', !(await A.evaluate(() => [...document.querySelectorAll('.page-head a, .page-head button')].some((x) => /add stock/i.test(x.textContent)))));
await A.evaluate(() => document.querySelector('button[title="Theme"]').click()); await wait(300);
const themes = await A.evaluate(() => [...document.querySelectorAll('.theme-item')].map((x) => x.innerText.split('\n')[0]));
check('theme picker offers exactly the 3 themes the owner allowed', themes.length === 3, themes.join(', '));
check('device starts on the owner\'s default theme (Fresh Mint)', await A.evaluate(() => document.documentElement.dataset.palette === 'mint'));
await A.evaluate(() => [...document.querySelectorAll('.theme-item')].find((x) => x.textContent.includes('Tokyo')).click()); await wait(300);
check('switching theme applies it', await A.evaluate(() => document.documentElement.dataset.palette === 'tokyo-night' && document.documentElement.dataset.theme === 'dark'));
await A.screenshot({ path: out + '/01-tokyo-dashboard.png' });
check('expiry pop-up with sound appears', await (async () => { for (let i = 0; i < 20; i++) { if (await A.evaluate(() => /attention/i.test(document.querySelector('.popups')?.innerText || ''))) return true; await wait(500); } return false; })());
await A.screenshot({ path: out + '/02-popup.png' });
check('weekly summary pop-up for last week', await (async () => { for (let i = 0; i < 24; i++) { if (await A.evaluate(() => /Last week at a glance/.test(document.querySelector('.popups')?.innerText || ''))) return true; await wait(500); } return false; })());
await A.screenshot({ path: out + '/03-weekly-popup.png' });

// weather from the device location + 6-hourly outside log
await A.goto(base + '/' + slug + '#/storage', { waitUntil: 'networkidle2' });
let wtxt = '';
for (let i = 0; i < 30; i++) { wtxt = await A.evaluate(() => document.querySelector('.weather')?.innerText || ''); if (/°C/.test(wtxt)) break; await wait(500); }
check('weather uses the device location (GPS)', /°C/.test(wtxt) && /GPS|Near|Your location/.test(wtxt), wtxt.split('\n')[0]);
await wait(2500);
const autoRows = await A.evaluate(() => [...document.querySelectorAll('tbody tr')].filter((r) => /Automatic \(weather\)/.test(r.innerText)).length);
check('outside temperature & humidity logged every 6 hours', autoRows >= 2, autoRows + ' readings');
await A.screenshot({ path: out + '/04-storage.png' });

// weekly report page
await A.goto(base + '/' + slug + '#/weekly', { waitUntil: 'networkidle2' }); await wait(1200);
const wk = await A.evaluate(() => document.body.innerText);
check('weekly report: totals, top sellers, team performance', /57,000/.test(wk) && /Top sellers/.test(wk) && /Team performance/.test(wk) && /Bea Admin/.test(wk));
await A.screenshot({ path: out + '/05-weekly.png' });

// messages page
await A.goto(base + '/' + slug + '#/messages', { waitUntil: 'networkidle2' }); await wait(800);
const mp = await A.evaluate(() => document.body.innerText);
check('messages & SMS page with templates and audiences', /Special offer/.test(mp) && /Who gets it/.test(mp) && /Send by WhatsApp/.test(mp));

// quiz (offline)
await A.goto(base + '/' + slug + '#/quiz', { waitUntil: 'networkidle2' }); await wait(800);
await A.evaluate(() => [...document.querySelectorAll('button')].find((x) => x.textContent.includes('Quick quiz')).click()); await wait(800);
for (let i = 0; i < 8; i++) {
  const ok = await A.evaluate(() => { const o = document.querySelector('.quiz-opt'); if (!o) return false; o.click(); return true; }); if (!ok) break; await wait(150);
  await A.evaluate(() => [...document.querySelectorAll('.quiz button.btn.primary')].find((x) => /Next|score/.test(x.textContent))?.click()); await wait(200);
}
check('quiz scored with the right answers shown', /\d+ \/ \d+/.test(await A.evaluate(() => document.querySelector('.quiz-score')?.innerText || '')) && /Right answer/.test(await A.evaluate(() => document.body.innerText)));
await A.screenshot({ path: out + '/06-quiz.png' });

// scan page renders, matching works on the AI result
await A.goto(base + '/' + slug + '#/scan', { waitUntil: 'networkidle2' }); await wait(800);
check('scan prescription page', /Snap the prescription/.test(await A.evaluate(() => document.body.innerText)));

// ----- chat: attachment, voice note, message pop-up, call -----
const ctxB = await b.createBrowserContext();
await ctxB.overridePermissions(base, ['microphone', 'notifications']);
const B = await ctxB.newPage(); await B.setViewport({ width: 1100, height: 800 });
B.on('pageerror', (e) => errors.push('B: ' + e.message));
await B.goto(base + '/' + slug, { waitUntil: 'networkidle2' }); await wait(1000);
await B.type('input[autocomplete=username]', 'dan@test.rx'); await B.type('input[type=password]', 'dan-pass-123');
await B.evaluate(() => [...document.querySelectorAll('button')].find((x) => x.textContent.includes('Sign in')).click()); await wait(6000);
await A.goto(base + '/' + slug + '#/', { waitUntil: 'networkidle2' }); await wait(2500);
// Dan posts a team message → Bea gets a pop-up
await B.goto(base + '/' + slug + '#/chat', { waitUntil: 'networkidle2' }); await wait(1500);
await B.type('.chat-compose textarea', 'Fridge delivery arriving at 3pm'); await B.keyboard.press('Enter'); await wait(500);
check('new team message pops up on another device', await (async () => { for (let i = 0; i < 30; i++) { if (await A.evaluate(() => /Fridge delivery/.test(document.querySelector('.popups')?.innerText || ''))) return true; await wait(700); } return false; })());
// attachment (png) from Dan
const fileInput = await B.$('.chat-compose input[type=file]');
fs.writeFileSync(out + '/pic.png', Buffer.from(LOGO.split(',')[1], 'base64'));
await fileInput.uploadFile(out + '/pic.png'); await wait(3000);
check('photo shared in chat', await B.evaluate(() => !!document.querySelector('.att-img img')));
// voice note from Dan
await B.evaluate(() => document.querySelector('.chat-compose button[aria-label="Record a voice note"]').click()); await wait(2500);
await B.evaluate(() => [...document.querySelectorAll('.voice-rec button')].find((x) => x.textContent.includes('Stop')).click()); await wait(800);
await B.evaluate(() => [...document.querySelectorAll('.voice-rec button')].find((x) => x.textContent.includes('Send')).click()); await wait(3500);
check('voice note recorded and shared', await B.evaluate(() => !!document.querySelector('.att-audio audio')));
await A.goto(base + '/' + slug + '#/chat', { waitUntil: 'networkidle2' });
check('the other device sees the photo and voice note', await (async () => { for (let i = 0; i < 25; i++) { if (await A.evaluate(() => !!document.querySelector('.att-img img') && !!document.querySelector('.att-audio audio'))) return true; await wait(700); } return false; })());
await A.screenshot({ path: out + '/07-chat.png' });
// call: Bea calls Dan
await A.evaluate(() => { const b = [...document.querySelectorAll('.chat-conv')].find((x) => x.textContent.includes('Dan Dispenser')); b.querySelector('.call-menu button').click(); }); await wait(200);
await A.evaluate(() => [...document.querySelectorAll('.call-pop button')].find((x) => x.textContent.includes('In-app')).click());
check('incoming call rings on the other device', await (async () => { for (let i = 0; i < 25; i++) { if (await B.evaluate(() => /Incoming call/.test(document.querySelector('.call-screen')?.innerText || ''))) return true; await wait(600); } return false; })());
await B.screenshot({ path: out + '/08-incoming-call.png' });
await B.evaluate(() => document.querySelector('.call-btn.accept')?.click());
check('call connects (live timer on both devices)', await (async () => { for (let i = 0; i < 30; i++) { const a = await A.evaluate(() => document.querySelector('.call-screen')?.className || ''), bb = await B.evaluate(() => document.querySelector('.call-screen')?.className || ''); if (/live/.test(a) && /live/.test(bb)) return true; await wait(600); } return false; })());
await A.screenshot({ path: out + '/09-live-call.png' });
await A.evaluate(() => document.querySelector('.call-btn.end')?.click()); await wait(3000);
check('hang up ends the call on both devices', !(await B.evaluate(() => /live/.test(document.querySelector('.call-screen')?.className || ''))));

// owner console: look & logo tab
const O = await (await b.createBrowserContext()).newPage(); await O.setViewport({ width: 1280, height: 860 });
await O.goto(base + '/#/owner', { waitUntil: 'networkidle2' }); await wait(800);
await O.type('input[type=password]', ownerKey); await O.evaluate(() => [...document.querySelectorAll('button')].find((x) => x.textContent.includes('Sign in')).click()); await wait(2000);
await O.evaluate(() => [...document.querySelectorAll('.tenant-card')].find((c) => c.textContent.includes('Bugolobi')).click()); await wait(1500);
await O.evaluate(() => [...document.querySelectorAll('.tab')].find((x) => x.textContent.includes('Look')).click()); await wait(500);
check('owner Look & logo tab lists all themes', (await O.evaluate(() => document.querySelectorAll('.theme-card').length)) >= 20);
await O.screenshot({ path: out + '/10-owner-look.png' });

// phone width
await A.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
const wide = [];
for (const h of ['/', '/chat', '/messages', '/weekly', '/quiz', '/scan', '/storage']) { await A.goto(base + '/' + slug + '#' + h, { waitUntil: 'networkidle2' }); await wait(700); if (await A.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2)) wide.push(h); }
check('new pages fit a phone screen', !wide.length, wide.join(' '));
await A.goto(base + '/' + slug + '#/chat', { waitUntil: 'networkidle2' }); await wait(800);
await A.screenshot({ path: out + '/11-phone-chat.png' });
console.log(`\nerrors: ${errors.length ? [...new Set(errors)].slice(0, 5).join(' | ') : 'none'}`);
console.log(`${pass} passed, ${fail} failed`);
await b.close();

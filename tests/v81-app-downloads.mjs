// Web sign-in (2026-11-15): "Browser or app?" says what each is for and links the newest Windows and Android apps
// the cloud serves (falls back to the release page); the visitor's own device comes first; iPhone / Mac get a note;
// the installed apps don't show it. Fictional data only.
//   node v81-app-downloads.mjs <base> <ownerKey> <outDir>
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
import { CHROME } from './chrome.mjs';
import { asDesktopApp, APP_ARGS } from './appmode.mjs';
const [base, ownerKey, out = '.output/v81'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + String(x).slice(0, 300) : ''}`); };
const owner = (p, body) => fetch(base + '/api/owner' + p, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ownerKey }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());
const T = await owner('/tenants', { name: 'Download Test Pharmacy', admin: { name: 'Dee Admin', email: 'dee@dl.rx', password: 'dee-pass-1234' } });
const slug = T.tenant.slug;

const WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const AND = 'Mozilla/5.0 (Linux; Android 14; SM-A146P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';
const IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const b = await puppeteer.launch({ executablePath: CHROME, headless: true, args: APP_ARGS });
const errors = [];
async function open({ ua, w = 1280, h = 860, manifests = true, app = false }) {
  const p = await (await b.createBrowserContext()).newPage();
  p.on('pageerror', (e) => errors.push(e.message));
  await p.setUserAgent(ua);
  await p.setViewport({ width: w, height: h, isMobile: w < 600, hasTouch: w < 600 });
  if (app) await asDesktopApp(p, base);
  if (!app) await p.setRequestInterception(true);
  if (!app) p.on('request', (r) => {
    const u = r.url();
    if (manifests && u.endsWith('/api/app/flutter-windows.json')) return r.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ build: 154, label: '2.1.154', file: 'RxPOS-New-154.exe', size: 89128960 }) });
    if (manifests && u.endsWith('/api/app/flutter-android.json')) return r.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ build: 154, label: '2.1.154', file: 'RxPOS-New-154.apk', size: 31457280 }) });
    if (!manifests && /\/api\/app\/flutter-/.test(u)) return r.respond({ status: 404, contentType: 'application/json', body: '{"error":"Not found"}' });
    r.continue();
  });
  await p.goto(base + '/' + slug, { waitUntil: 'networkidle2' }); await wait(800);
  return p;
}
const links = (p) => p.evaluate(() => [...document.querySelectorAll('.app-downloads a.app-dl')].map((a) => ({ k: a.dataset.platform, href: a.getAttribute('href'), primary: a.classList.contains('primary'), text: a.innerText.replace(/\s+/g, ' ') })));

let p = await open({ ua: WIN });
check('web sign-in: "Browser or app?" sits under the sign-in form', await p.evaluate(() => !!document.querySelector('.auth-card form input[type=password]') && /Browser or app\?/.test(document.querySelector('.app-downloads')?.innerText || '')));
const txt = await p.evaluate(() => document.querySelector('.app-downloads').innerText);
check('…says what the browser is for (online only, nothing kept) and what the app adds (offline, devices, updates)', /Needs the internet the whole time/.test(txt) && /keeps nothing on this computer/.test(txt) && /keeps selling when the internet drops/.test(txt) && /updates itself/.test(txt));
check('…same account and data in the app', /Same account and data/.test(txt));
let l = await links(p);
check('Windows browser: Windows first and highlighted, with version and size', l[0].k === 'windows' && l[0].primary && /this device/.test(l[0].text) && /v2\.1\.154/.test(l[0].text) && /85 MB/.test(l[0].text), JSON.stringify(l[0]));
check('…direct links to the newest apps the cloud serves', l.find((x) => x.k === 'windows').href.endsWith('/api/app/RxPOS-New-154.exe') && l.find((x) => x.k === 'android').href.endsWith('/api/app/RxPOS-New-154.apk'), JSON.stringify(l));
await p.screenshot({ path: path.join(out, 'signin-windows.png') });
await p.close();

p = await open({ ua: AND, w: 390, h: 844 });
l = await links(p);
check('Android phone: Android first and highlighted', l[0].k === 'android' && l[0].primary && !l[1].primary, JSON.stringify(l));
check('…mentions allowing installs from the browser', /allow installing apps from your browser/.test(await p.evaluate(() => document.querySelector('.app-downloads').innerText)));
check('…fits the phone (no sideways scroll)', await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
await p.screenshot({ path: path.join(out, 'signin-android.png'), fullPage: true });
await p.close();

p = await open({ ua: IOS, w: 390, h: 844 });
check('iPhone: says there is no iPhone / Mac app yet', /no RxPOS app for iPhone, iPad or Mac yet/.test(await p.evaluate(() => document.querySelector('.app-downloads')?.innerText || '')));
await p.close();

p = await open({ ua: WIN, manifests: false });
l = await links(p);
check('cloud has no app files: both buttons open the release page', l.every((x) => /github\.com\/DeeJayKyle\/rxpos\/releases\/latest$/.test(x.href)), JSON.stringify(l));
await p.close();

p = await open({ ua: WIN, app: true });
check('the installed Windows app does not show it', await p.evaluate(() => !!document.querySelector('.auth-card') && !document.querySelector('.app-downloads')));
await p.close();

check('no page errors', !errors.length, errors.join(' | '));
await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

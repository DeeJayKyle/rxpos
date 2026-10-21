// Windows app self-update (electron/updater.cjs): start the app, find a newer build, switch to it, keep the
// device's data, survive a restart, and roll back a broken build. Serves a copy of dist/ as the "newer build".
//   npm run build && node tests/electron-update.mjs      (Linux needs xvfb-run; Windows runs as is)
import { spawn } from 'node:child_process';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const S = path.join(root, 'tests', '.state', 'electron-update'); // (arguments from run-all.mjs are not needed)
fs.rmSync(S, { recursive: true, force: true }); fs.mkdirSync(S + '/home', { recursive: true });
fs.cpSync(path.join(root, 'dist'), S + '/srv', { recursive: true });
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
{ // the "newer build": the same files, with a marker in index.html
  const m = JSON.parse(fs.readFileSync(S + '/srv/version.json'));
  const idx = fs.readFileSync(S + '/srv/index.html', 'utf8').replace('<title>', '<meta name="rxpos-test" content="UPDATED-MARKER" /><title>');
  fs.writeFileSync(S + '/srv/index.html', idx);
  Object.assign(m.files.find((f) => f.path === 'index.html'), { size: Buffer.byteLength(idx), sha256: sha(idx) });
  m.build += 100; m.label = '1.0 · test-newer';
  fs.writeFileSync(S + '/srv/version.json', JSON.stringify(m));
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n} ${x}`); };
const srv = spawn('python3', ['-m', 'http.server', '8799', '-d', S + '/srv'], { stdio: 'ignore' });
const electron = path.join(root, 'node_modules', 'electron', 'dist', process.platform === 'win32' ? 'electron.exe' : 'electron');
const cmd = process.platform === 'linux' ? ['xvfb-run', ['-a', electron]] : [electron, []];
const start = () => spawn(cmd[0], [...cmd[1], ...(process.getuid?.() === 0 ? ['--no-sandbox'] : []), '--remote-debugging-port=9333', root],
  { env: { ...process.env, HOME: S + '/home', XDG_CONFIG_HOME: S + '/home/.config', APPDATA: S + '/home/.config', RXPOS_UPDATE_URL: 'http://localhost:8799', RXPOS_READY_TIMEOUT: '8000' }, stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32' });
// stop the app and everything it started (xvfb-run leaves Electron running otherwise)
const stop = (c) => { try { process.platform === 'win32' ? spawn('taskkill', ['/pid', String(c.pid), '/T', '/F']) : process.kill(-c.pid, 'SIGTERM'); } catch { /* gone */ } setTimeout(() => { try { process.kill(-c.pid, 'SIGKILL'); } catch { /* gone */ } }, 1500); };
const connect = async () => { for (let i = 0; i < 40; i++) { try { return await puppeteer.connect({ browserURL: 'http://localhost:9333' }); } catch { await wait(500); } } throw new Error('no electron'); };
const mark = (p) => p.evaluate(() => document.querySelector('meta[name=rxpos-test]')?.content || 'installed');
const page = async (b) => { for (let i = 0; i < 40; i++) { const p = (await b.pages()).find((x) => x.url().startsWith('file:')); if (p) return p; await wait(500); } throw new Error('no page'); };
let el = start(); let log = ''; el.stderr.on('data', (d) => (log += d)); el.stdout.on('data', (d) => (log += d));
try {
  let b = await connect(); let p = await page(b); await wait(2500);
  check('the Windows app starts from the installed files', (await mark(p)) === 'installed', await mark(p));
  await p.evaluate(() => localStorage.setItem('rxpos-test-keep', 'still-here'));
  const r = await p.evaluate(() => window.rxposShell.check());
  check('it finds and downloads the newer build', r.status === 'ready' && r.label === '1.0 · test-newer', JSON.stringify(r));
  const dirs = fs.readdirSync(S + '/home/.config/PharmaPOS/web');
  check('the downloaded files are kept in the app data folder', dirs.some((d) => /^\d+$/.test(d)), dirs.join(','));
  await p.evaluate(() => window.rxposShell.apply()); await wait(4000);
  p = await page(b);
  check('"Update" switches to the new build under the same address', (await mark(p)) === 'UPDATED-MARKER' && p.url().includes('/dist/index.html'), (await mark(p)) + ' ' + p.url());
  check('data saved on the device is still there after the switch', (await p.evaluate(() => localStorage.getItem('rxpos-test-keep'))) === 'still-here');
  await wait(9000); // past the ready timeout: a build that started fine is not rolled back
  check('a build that starts fine stays', (await mark(p)) === 'UPDATED-MARKER', await mark(p));
  b.disconnect(); stop(el); await wait(2500);
  // restart: it still runs the new build
  el = start(); b = await connect(); p = await page(b); await wait(2500);
  check('after a restart the app still runs the new build', (await mark(p)) === 'UPDATED-MARKER', await mark(p));
  // a broken newer build (never says ready) is rolled back
  const m = JSON.parse(fs.readFileSync(S + '/srv/version.json')); const bad = '<!doctype html><meta name="rxpos-test" content="BROKEN" /><title>BROKEN</title><body>broken';
  fs.writeFileSync(S + '/srv/index.html', bad);
  m.files.find((f) => f.path === 'index.html').sha256 = sha(bad); m.files.find((f) => f.path === 'index.html').size = Buffer.byteLength(bad);
  m.build += 100; fs.writeFileSync(S + '/srv/version.json', JSON.stringify(m));
  const r2 = await p.evaluate(() => window.rxposShell.check());
  await p.evaluate(() => window.rxposShell.apply()); await wait(3000);
  p = await page(b);
  check('a broken build loads…', r2.status === 'ready' && (await mark(p)) === 'BROKEN', await mark(p));
  await wait(12000); p = await page(b);
  check('…and is rolled back to the last good build automatically', (await mark(p)) === 'UPDATED-MARKER', await mark(p));
  const again = await p.evaluate(() => window.rxposShell.check());
  check('the broken build is not downloaded again', again.status === 'current', JSON.stringify(again));
  b.disconnect();
} catch (e) { console.log('ERROR', e.message); fail++; console.log(log.slice(-1500)); }
stop(el); srv.kill();
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);

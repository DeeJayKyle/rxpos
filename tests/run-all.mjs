// Run every RxPOS test suite against a throw-away local cloud:   npm test
// Starts `wrangler dev` on port 8790 with an empty database (tests/.state), runs each suite with a clean cloud,
// prints a summary and stops the local cloud. Needs Chrome or Edge (see tests/chrome.mjs) and `npm ci` done once.
// Run one suite only:  npm test -- v17
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const BASE = 'http://localhost:8790';
const OWNER = 'local-owner-key-0123456789abcdef';
const SUITES = [
  ['secret helper (unit)', 'unit-secret.mjs', []],
  ['safe file urls (unit)', 'unit-safeurl.mjs', []],
  ['refill rules (unit)', 'unit-rxrules.mjs', []],
  ['crash scrub (unit)', 'unit-scrub.mjs', []],
  ['theme contrast', 'contrast-test.mjs', []],
  ['owner sign-in', 'owner-auth-test.mjs', []],
  ['cloud rules', 'v14-api.mjs', []],
  ['shared catalog', 'catalog-test.mjs', []],
  ['app walkthrough', 'v14-ui.mjs', ['.output/v14']],
  ['batch 15 features', 'v15.mjs', ['.output/v15']],
  ['batch 16 features', 'v16.mjs', ['.output/v16']],
  ['stale sign-ins', 'stale-token.mjs', []],
  ['batch 17 features', 'v17.mjs', ['.output/v17']],
  ['backup & restore', 'backup-test.mjs', []],
  ['owner on main page', 'owner-main-login.mjs', ['.output/owner-main']],
  ['stock in & stock take', 'v18.mjs', ['.output/v18']],
  ['two-step sign-in', 'v19-twostep.mjs', ['.output/v19']],
  ['screen tour', 'ui-tour.mjs', ['.output/tour']],
  ['crash reports', 'v20-crash.mjs', ['.output/v20']],
  ['device & chat', 'v21-device-chat.mjs', ['.output/v21']],
  ['idle screen fit', 'idle-fit.mjs', ['.output/fit']],
  ['username & ABC report', 'v22-username-abc.mjs', ['.output/v22']],
  ['server permissions', 'v23-perms.mjs', []],
  ['file uploads', 'v24-files.mjs', []],
  ['security headers', 'v25-headers.mjs', []],
  // the Windows app's self-update needs a screen: Windows itself, or xvfb-run on Linux
  ...(process.platform === 'win32' || fs.existsSync('/usr/bin/xvfb-run') ? [['windows self-update', 'electron-update.mjs', []]] : []),
];
const only = process.argv[2];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const state = path.join(here, '.state');
fs.rmSync(state, { recursive: true, force: true });
// run the tools with node directly: no shell, so folders with spaces in their names work
const bin = (p) => path.join(root, 'node_modules', p);
console.log('Building the app and starting a local cloud…');
const build = spawn(process.execPath, [bin('vite/bin/vite.js'), 'build'], { cwd: root, stdio: 'ignore' });
await new Promise((r) => build.on('exit', r));
// Workers AI only runs on Cloudflare, so without a Cloudflare sign-in the local cloud starts from a copy of the config
// without it (everything else runs locally; only AI reading / quizzes are unavailable)
const cfgArgs = [];
if (!process.env.CLOUDFLARE_API_TOKEN) {
  const cfg = fs.readFileSync(path.join(root, 'wrangler.jsonc'), 'utf8').replace(/^\s*"ai":.*$/m, '');
  fs.writeFileSync(path.join(root, 'wrangler.test.jsonc'), cfg);
  cfgArgs.push('-c', 'wrangler.test.jsonc');
}
const cloud = spawn(process.execPath, [bin('wrangler/bin/wrangler.js'), 'dev', ...cfgArgs, '--port', '8790', '--persist-to', state, '--var', 'DB_BACKEND:', '--var', 'SYNC_KEY:local-test-sync-key-0123456789abcdef',
  '--var', `OWNER_KEY:${OWNER}`, '--var', `PUBLIC_URL:${BASE}`], { cwd: root, stdio: 'ignore' });
const stop = () => { try { process.platform === 'win32' ? spawn('taskkill', ['/pid', String(cloud.pid), '/T', '/F'], { stdio: 'ignore' }) : cloud.kill('SIGTERM'); } catch { /* already gone */ } };
process.on('exit', stop);
let up = false;
for (let i = 0; i < 90 && !up; i++) { up = await fetch(BASE + '/api/health').then((r) => r.ok).catch(() => false); if (!up) await wait(1000); }
if (!up) { console.error('The local cloud did not start'); stop(); process.exit(1); }

const owner = (p, body) => fetch(BASE + '/api/owner' + p, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + OWNER }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());
const clearAll = async () => { for (const t of (await owner('/tenants')).tenants || []) await owner('/tenants/' + t.id + '/delete', { confirm: t.slug }); };

const results = [];
for (const [label, file, extra] of SUITES) {
  if (only && !file.includes(only)) continue;
  await clearAll();
  const outDir = extra[0] ? path.join(here, extra[0]) : null;
  const args = [path.join(here, file), BASE, OWNER, ...(outDir ? [outDir] : [])];
  const t0 = Date.now();
  const out = await new Promise((resolve) => {
    let buf = '';
    const p = spawn(process.execPath, args, { cwd: here });
    p.stdout.on('data', (d) => { buf += d; });
    p.stderr.on('data', (d) => { buf += d; });
    p.on('exit', (code) => resolve({ code, buf }));
  });
  const m = out.buf.match(/(\d+) passed, (\d+) failed/);
  const passed = m ? +m[1] : 0, failed = m ? +m[2] : 1;
  results.push({ label, passed, failed: out.code && !failed ? 1 : failed });
  console.log(`${failed || out.code ? '✗' : '✓'} ${label.padEnd(20)} ${passed} passed, ${failed} failed  (${Math.round((Date.now() - t0) / 1000)} s)`);
  for (const line of out.buf.split('\n').filter((l) => /^(FAIL|Error|s+at |[A-Za-z]*Error:)/.test(l)).slice(0, 8)) console.log('    ' + line.slice(0, 220));
}
const total = results.reduce((a, r) => ({ p: a.p + r.passed, f: a.f + r.failed }), { p: 0, f: 0 });
console.log(`\n${total.p} passed, ${total.f} failed`);
stop();
process.exit(total.f ? 1 : 0);

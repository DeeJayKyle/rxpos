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
  ['daily stock figures (unit)', 'unit-daily-stock.mjs', []],
  ['invoice reading cross-check (unit)', 'unit-invoice-read.mjs', []],
  ['date formats (unit)', 'unit-dateformat.mjs', []],
  ['packs (unit)', 'unit-packs.mjs', []],
  ['safe file urls (unit)', 'unit-safeurl.mjs', []],
  ['refill rules (unit)', 'unit-rxrules.mjs', []],
  ['crash scrub (unit)', 'unit-scrub.mjs', []],
  ['idle promote (unit)', 'unit-promote.mjs', []],
  ['offline sign-in (unit)', 'unit-offline.mjs', []],
  ['money math (unit)', 'unit-money.mjs', []],
  ['server write policy (unit)', 'unit-policy.mjs', []],
  ['sale checks (unit)', 'unit-anomalies.mjs', []],
  ['password hashing (unit)', 'unit-passwords.mjs', []],
  ['sign-in slowdown (unit)', 'unit-throttle.mjs', []],
  ['medicine search (unit)', 'unit-search.mjs', []],
  ['drug labels (unit)', 'unit-druglabel.mjs', []],
  ['fefo allocate (unit)', 'unit-fefo.mjs', []],
  ['date helpers (unit)', 'unit-dates.mjs', []],
  ['record ids (unit)', 'unit-ids.mjs', []],
  ['watchdog alerts (unit)', 'unit-watchdog.mjs', []],
  ['inventory value (unit)', 'unit-stockvalue.mjs', []],
  ['stock audit (unit)', 'unit-stockaudit.mjs', []],
  ['stock repair (unit)', 'unit-stockrepair.mjs', []],
  ['backup verify (unit)', 'unit-verify.mjs', []],
  ['storage change detection (unit)', 'unit-diff.mjs', []],
  ['cloud restore resend (unit)', 'unit-sync-restore.mjs', []],
  ['first download resume (unit)', 'unit-sync-resume.mjs', []],
  ['theme choice (unit)', 'unit-theme.mjs', []],
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
  ['server write policy', 'v55-write-policy.mjs', []],
  ['staff screens match the policy', 'v55-staff-ui.mjs', []],
  ['sale checks for the owner', 'v56-sale-checks.mjs', []],
  ['passwords: rounds, upgrade on sign-in', 'v57-passwords.mjs', []],
  ['sign-in slowdown per account', 'v58-throttle.mjs', []],
  ['file uploads', 'v24-files.mjs', []],
  ['security headers', 'v25-headers.mjs', []],
  ['rate limits', 'v26-ratelimit.mjs', []],
  ['sync hides secrets', 'v27-secrets.mjs', []],
  ['offline sign-in & PIN', 'v28-pin.mjs', ['.output/v28']],
  ['surface styles', 'v32-surface.mjs', ['.output/v32']],
  ['appearance & dashboard', 'v33-appearance.mjs', ['.output/v33']],
  ['pharmacy workspace', 'v34-workspace.mjs', ['.output/v34']],
  ['layout on every screen', 'v35-layout.mjs', ['.output/v35']],
  ['web is online only', 'v36-web-online.mjs', ['.output/v36']],
  ['sales & sync reliability', 'v37-reliability.mjs', ['.output/v37']],
  ['device pharmacy settings', 'v43-pharmacy-settings.mjs', []],
  ['sync protocol 2', 'v38-sync-protocol.mjs', []],
  ['storage upgrade 1.5 → 1.6', 'v39-migration.mjs', ['.output/v39']],
  ['reports, colour & drafts', 'v41-reports-drafts.mjs', ['.output/v41']],
  ['which pharmacy at sign-in', 'v42-which-pharmacy.mjs', ['.output/v42']],
  ['full download repairs a device', 'v44-full-pull.mjs', []],
  ['web shows the pharmacy\'s details', 'v45-web-settings.mjs', []],
  ['daily stock sheet link', 'v46-daily-stock.mjs', []],
  ['scan invoices into drafts', 'v47-scan-drafts.mjs', ['.output/v47']],
  ['add stock & edit purchase tools', 'v49-addstock-tools.mjs', ['.output/v49']],
  ['packs: receive boxes, sell tablets or boxes', 'v50-packs.mjs', ['.output/v50']],
  ['wide till: client panel, quick actions, ledger', 'v51-pos-wide.mjs', ['.output/v51']],
  ['till layouts: classic, standard, advanced + command bar', 'v52-pos-layouts.mjs', ['.output/v52']],
  ['Midnight Pro theme', 'v53-midnight-pro.mjs', ['.output/v53']],
  ['append-only tables', 'v29-immutable.mjs', []],
  ['pay & sms gated', 'v30-paysms.mjs', []],
  ['restore epoch', 'v31-restore.mjs', []],
  ['restore drill', 'v33-restore-drill.mjs', []],
  ['receipt from settings', 'v47-receipt.mjs', ['.output/v47']],
  ['sign-in finds the pharmacy at scale', 'v48-login-scale.mjs', []],
  ['dashboard sales card opens sales lines', 'v49-dashboard-sales-link.mjs', ['.output/v49']],
  ['scheduled email reports', 'v54-scheduled-reports.mjs', []],
  // performance timings: only on request (npm run bench), never part of npm test
  ...(process.argv[2] === 'bench' ? [['benchmarks', 'bench.mjs', ['.output/bench']]] : []),
  // the Windows app's self-update needs a screen: Windows itself, or xvfb-run on Linux
  ...(process.platform === 'win32' || fs.existsSync('/usr/bin/xvfb-run') ? [['windows self-update', 'electron-update.mjs', []]] : []),
];
const only = process.argv[2];
// RXPOS_CI=1 (full-tests.yml): checks that need a service a CI machine can't reach are reported as skipped, not
// failed, so the deploy gate isn't blocked by the outside world. Listed by exact check name: anything else that fails
// still fails. Local runs (no RXPOS_CI) count them as failures as before.
const CI = process.env.RXPOS_CI === '1';
const NEEDS_OUTSIDE = new Map([
  ['weather loads (Open-Meteo)', 'Open-Meteo'],
  ['AI drug quiz (Workers AI)', 'Workers AI'],
  ['AI reads a prescription photo (Workers AI vision)', 'Workers AI'],
  ['weather uses the device location (GPS)', 'Open-Meteo'],
  ['outside temperature & humidity logged every 6 hours', 'Open-Meteo'],
]);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const state = path.join(here, '.state');
fs.rmSync(state, { recursive: true, force: true });
// run the tools with node directly: no shell, so folders with spaces in their names work
const bin = (p) => path.join(root, 'node_modules', p);
console.log('Building the app and starting a local cloud…');
const build = spawn(process.execPath, [bin('vite/bin/vite.js'), 'build'], { cwd: root });
let buildOut = '';
build.stdout.on('data', (d) => { buildOut += d; });
build.stderr.on('data', (d) => { buildOut += d; });
const buildCode = await new Promise((r) => build.on('exit', r));
if (buildCode !== 0) { console.error('The app build failed (exit ' + buildCode + '):\n' + buildOut); process.exit(1); }
// Workers AI only runs on Cloudflare, so without a Cloudflare sign-in the local cloud starts from a copy of the config
// without it (everything else runs locally; only AI reading / quizzes are unavailable)
const cfgArgs = [];
if (!process.env.CLOUDFLARE_API_TOKEN) {
  const cfg = fs.readFileSync(path.join(root, 'wrangler.jsonc'), 'utf8').replace(/^\s*"ai":.*$/m, '');
  fs.writeFileSync(path.join(root, 'wrangler.test.jsonc'), cfg);
  cfgArgs.push('-c', 'wrangler.test.jsonc');
}
const cloud = spawn(process.execPath, [bin('wrangler/bin/wrangler.js'), 'dev', ...cfgArgs, '--port', '8790', '--persist-to', state, '--var', 'DB_BACKEND:', '--var', 'SYNC_KEY:local-test-sync-key-0123456789abcdef',
  '--var', `OWNER_KEY:${OWNER}`, '--var', `PUBLIC_URL:${BASE}`,
  // step 5: a raised password-rounds setting, so every suite signs in through the re-hash path
  '--var', 'PBKDF2_ITER:150000'], { cwd: root, stdio: 'ignore' });
const stop = () => { try { process.platform === 'win32' ? spawn('taskkill', ['/pid', String(cloud.pid), '/T', '/F'], { stdio: 'ignore' }) : cloud.kill('SIGTERM'); } catch { /* already gone */ } };
process.on('exit', stop);
let up = false;
for (let i = 0; i < 90 && !up; i++) { up = await fetch(BASE + '/api/health').then((r) => r.ok).catch(() => false); if (!up) await wait(1000); }
if (!up) { console.error('The local cloud did not start'); stop(); process.exit(1); }

const owner = (p, body) => fetch(BASE + '/api/owner' + p, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + OWNER }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());
const clearAll = async () => { for (const t of (await owner('/tenants')).tenants || []) await owner('/tenants/' + t.id + '/delete', { confirm: t.slug }); };

const results = [];
let totalSkipped = 0;
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
  const passed = m ? +m[1] : 0;
  let failed = m ? +m[2] : 1;
  const skipped = [];
  if (CI && m) for (const line of out.buf.split('\n')) {
    const name = line.startsWith('FAIL  ') && [...NEEDS_OUTSIDE.keys()].find((k) => line.slice(6).startsWith(k));
    if (name) { skipped.push(`${name} (needs ${NEEDS_OUTSIDE.get(name)})`); failed--; }
  }
  if (skipped.length && !failed) out.code = 0; // the only failures were the listed outside-service checks
  totalSkipped += skipped.length;
  results.push({ label, passed, failed: out.code && !failed ? 1 : failed });
  console.log(`${failed || out.code ? '✗' : '✓'} ${label.padEnd(20)} ${passed} passed, ${failed} failed  (${Math.round((Date.now() - t0) / 1000)} s)`);
  for (const line of out.buf.split('\n').filter((l) => /^(FAIL|Error|\s+at |[A-Za-z]*Error:)/.test(l) && !skipped.some((x) => l.slice(6).startsWith(x.replace(/ \(needs .*\)$/, '')))).slice(0, 8)) console.log('    ' + line.slice(0, 220));
  for (const x of skipped) console.log('    SKIP  ' + x);
}
const total = results.reduce((a, r) => ({ p: a.p + r.passed, f: a.f + r.failed }), { p: 0, f: 0 });
console.log(`\n${total.p} passed, ${total.f} failed${totalSkipped ? `, ${totalSkipped} skipped (need outside services)` : ''}`);
stop();
process.exit(total.f ? 1 : 0);

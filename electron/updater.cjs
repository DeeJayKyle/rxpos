// Windows app updates: the newest build's files come from rxposug.com (dist/version.json lists each file with its
// SHA-256). Only files that changed are downloaded; each is checked before use. Builds are kept in
// <userData>/web/<build>/ and served in place of the installed dist/ files under the SAME file:// addresses, so the
// offline database (stored per address) is untouched. A new build that doesn't report "ready" within 40 s of loading
// is marked bad and the previous one comes back.
const { app, protocol, net, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { pathToFileURL, fileURLToPath } = require('url');

const CLOUD = process.env.RXPOS_UPDATE_URL || 'https://rxposug.com'; // tests point this at a local copy
const SHELL = 1; // what this installer can run (see scripts/release-files.mjs)
const dist = path.join(__dirname, '..', 'dist');
let root, stateFile, state = { active: null, prev: null, trial: false, bad: [] };
let win = null, inflight = null, readyTimer = null;

const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const save = () => { try { fs.mkdirSync(root, { recursive: true }); fs.writeFileSync(stateFile, JSON.stringify(state)); } catch (e) { console.error('updater state', e); } };
const bundled = () => readJson(path.join(dist, 'version.json'))?.build || 0;
const usable = (b) => b && !state.bad.includes(b.build) && fs.existsSync(path.join(b.dir, 'index.html'));
const active = () => (usable(state.active) && state.active.build > bundled() ? state.active : null);
const running = () => active()?.build || bundled();
/** Folders to look in for a file, newest first: a chunk of the build still on screen is found even after a switch */
const sources = () => [active()?.dir, usable(state.prev) ? state.prev.dir : null, dist].filter(Boolean);
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

function register() {
  root = path.join(app.getPath('userData'), 'web');
  stateFile = path.join(root, 'state.json');
  state = { ...state, ...(readJson(stateFile) || {}) };
  protocol.handle('file', (req) => {
    let target = fileURLToPath(req.url);
    const rel = path.relative(dist, target);
    if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) {
      for (const dir of sources()) { const f = path.join(dir, rel); if (fs.existsSync(f)) { target = f; break; } }
    }
    return net.fetch(pathToFileURL(target).href, { bypassCustomProtocolHandlers: true });
  });
  ipcMain.on('rxpos:ready', () => {
    clearTimeout(readyTimer);
    if (state.trial) { state.trial = false; save(); cleanup(); }
  });
  ipcMain.handle('rxpos:check', () => check());
  ipcMain.on('rxpos:apply', () => win?.webContents.reload());
}

/** Watch a freshly switched build: no "ready" in time → back to the previous one */
function attach(w) {
  win = w;
  w.webContents.on('did-finish-load', () => {
    clearTimeout(readyTimer);
    if (!state.trial || !active()) return;
    readyTimer = setTimeout(() => {
      console.error('updater: build', state.active.build, 'did not start, going back');
      state.bad = [...new Set([...state.bad, state.active.build])].slice(-10);
      state.active = usable(state.prev) ? state.prev : null; state.prev = null; state.trial = false;
      save(); w.webContents.reload();
    }, Number(process.env.RXPOS_READY_TIMEOUT) || 40e3);
  });
  setTimeout(() => check().catch(() => {}), 30e3);
  setInterval(() => check().catch(() => {}), 30 * 60e3);
}

function check() {
  return (inflight ??= (async () => {
    const res = await net.fetch(CLOUD + '/version.json?t=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) throw new Error('Update check failed (' + res.status + ')');
    const m = await res.json();
    if (!m.build || m.build <= running() || state.bad.includes(m.build)) return { status: 'current', label: m.label, build: m.build };
    if ((m.shell || 1) > SHELL) return { status: 'shell', label: m.label, build: m.build };
    if (state.active?.build === m.build && usable(state.active)) return { status: 'ready', label: m.label, build: m.build };
    const dir = path.join(root, String(m.build)), tmp = dir + '.part';
    fs.rmSync(tmp, { recursive: true, force: true });
    for (const f of m.files) {
      if (f.path.includes('..')) continue;
      const out = path.join(tmp, f.path);
      fs.mkdirSync(path.dirname(out), { recursive: true });
      // the same file already on this computer (unchanged since the last build): copy it instead of downloading
      const have = sources().map((d) => path.join(d, f.path)).find((p) => fs.existsSync(p) && fs.statSync(p).size === f.size && sha256(fs.readFileSync(p)) === f.sha256);
      if (have) { fs.copyFileSync(have, out); continue; }
      const r = await net.fetch(CLOUD + '/' + f.path.split('/').map(encodeURIComponent).join('/'));
      if (!r.ok) throw new Error(`Download of ${f.path} failed (${r.status})`);
      const buf = Buffer.from(await r.arrayBuffer());
      if (sha256(buf) !== f.sha256) throw new Error(`${f.path} arrived damaged`);
      fs.writeFileSync(out, buf);
    }
    fs.writeFileSync(path.join(tmp, 'version.json'), JSON.stringify(m));
    fs.rmSync(dir, { recursive: true, force: true });
    fs.renameSync(tmp, dir);
    state.prev = active() || state.prev; state.active = { build: m.build, dir }; state.trial = true;
    save();
    win?.webContents.send('rxpos:update-ready', { status: 'ready', label: m.label, build: m.build });
    return { status: 'ready', label: m.label, build: m.build };
  })().finally(() => { inflight = null; }));
}

/** Keep the running build and the one before it; remove older downloads */
function cleanup() {
  const keep = new Set([state.active?.dir, state.prev?.dir].filter(Boolean).map((d) => path.basename(d)));
  try { for (const n of fs.readdirSync(root)) if (/^\d+(\.part)?$/.test(n) && !keep.has(n)) fs.rmSync(path.join(root, n), { recursive: true, force: true }); } catch { /* nothing to clean */ }
}

module.exports = { register, attach };

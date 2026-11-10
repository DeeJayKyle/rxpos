// After `vite build`: write what devices need to update themselves from rxposug.com (see src/update.js and
// electron/updater.cjs):
//   dist/version.json          { version, build, label, commit, files: [{ path, size, sha256 }], zip, zipSha256, shell }
//   dist/updates/web-<build>.zip   every app file in one archive (the Android updater installs it)
// The build number is the commit's time, so the website, the Windows app and the Android app built from the same
// commit all agree on it. Plain Node, no extra packages.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { execSync } from 'node:child_process';

// What makes up the classic app (and so its update): a commit that changes none of these (e.g. only the new app in
// rxpos_flutter/, the cloud or the CI) must not make a new classic version, or every installed classic app is
// offered an update for nothing and the previous update file disappears from the site while devices still ask for it.
export const CLASSIC_SOURCES = ['src', 'public', 'index.html', 'package.json', 'package-lock.json', 'vite.config.js', 'scripts/release-files.mjs'];

/** Build number and commit: the time (seconds) of the last commit that changed the classic app (needs the git history:
 * CI checks out with fetch-depth 0), else of the last commit, else now */
export function buildInfo(root = process.cwd()) {
  let build = 0, commit = '';
  const git = (args) => execSync(`git ${args}`, { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  try { build = Number(git(`log -1 --format=%ct -- ${CLASSIC_SOURCES.join(' ')}`)) || 0; } catch { /* no git */ }
  try { if (!build || git('rev-parse --is-shallow-repository') === 'true') build = Number(git('log -1 --format=%ct')) || 0; } catch { /* no git */ }
  try { commit = execSync('git rev-parse --short HEAD', { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { /* no git */ }
  if (!build) build = Math.floor(Date.now() / 1000);
  const d = new Date(build * 1000);
  const pad = (n) => String(n).padStart(2, '0');
  const label = `1.0 · ${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
  return { build, commit, label };
}

// ---- a minimal zip writer (deflate) ----
const CRC = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function zip(entries) {
  const parts = [], central = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, 'utf8');
    const packed = zlib.deflateRawSync(data, { level: 9 });
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(8, 8);
    local.writeUInt32LE(0, 10); local.writeUInt32LE(crc, 14); local.writeUInt32LE(packed.length, 18); local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26); local.writeUInt16LE(0, 28);
    parts.push(local, nameBuf, packed);
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(20, 4); cen.writeUInt16LE(20, 6); cen.writeUInt16LE(0x0800, 8); cen.writeUInt16LE(8, 10);
    cen.writeUInt32LE(0, 12); cen.writeUInt32LE(crc, 16); cen.writeUInt32LE(packed.length, 20); cen.writeUInt32LE(data.length, 24);
    cen.writeUInt16LE(nameBuf.length, 28); cen.writeUInt32LE(offset, 42);
    central.push(cen, nameBuf);
    offset += local.length + nameBuf.length + packed.length;
  }
  const cenBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cenBuf.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, cenBuf, end]);
}

const walk = (dir, base = dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const full = path.join(dir, e.name);
  return e.isDirectory() ? walk(full, base) : [path.relative(base, full).split(path.sep).join('/')];
});
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

/** Write version.json and the update archive into a finished dist folder */
export function writeReleaseFiles(dist, info, version) {
  fs.rmSync(path.join(dist, 'updates'), { recursive: true, force: true });
  // Cloudflare Pages settings files (_headers, _redirects, _routes.json …) are read by the host and never served as
  // files: listing them made every Windows update fail ("_headers arrived damaged", the site's page came back instead)
  const names = walk(dist).filter((f) => f !== 'version.json' && !f.startsWith('updates/') && !/^_[^/]*$/.test(f)).sort();
  const files = names.map((name) => { const data = fs.readFileSync(path.join(dist, name)); return { path: name, size: data.length, sha256: sha256(data), data }; });
  const archive = zip(files.map((f) => ({ name: f.path, data: f.data })));
  const zipName = `updates/web-${info.build}.zip`;
  fs.mkdirSync(path.join(dist, 'updates'), { recursive: true });
  fs.writeFileSync(path.join(dist, zipName), archive);
  // shell: bump when a change needs a new installer / APK (new native permission or plugin); older shells are told so
  const manifest = { version, build: info.build, label: info.label, commit: info.commit, shell: 1, zip: zipName, zipSha256: sha256(archive), files: files.map(({ data, ...f }) => f) };  
  fs.writeFileSync(path.join(dist, 'version.json'), JSON.stringify(manifest));
  return manifest;
}

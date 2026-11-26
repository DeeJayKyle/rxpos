// Signs one Windows file with SSL.com eSigner (cloud code signing, no USB token) for electron-builder.
// The Build RxPOS workflow passes this as win.sign only on a release run with the ESIGNER_* secrets set; electron-builder
// then calls it for the app's RxPOS.exe, the uninstaller, RxPOS-Setup.exe and the portable .exe.
// Needs: CODESIGNTOOL_DIR (CodeSignTool unpacked, its conf/code_sign_tool.properties pointing at production),
// JAVA_HOME, and ESIGNER_USERNAME, ESIGNER_PASSWORD, ESIGNER_CREDENTIAL_ID, ESIGNER_TOTP_SECRET.
// Any failure stops the build: a release is never shipped half signed.
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

module.exports = async function sign(task) {
  const file = task.path;
  const env = process.env;
  const need = ['CODESIGNTOOL_DIR', 'JAVA_HOME', 'ESIGNER_USERNAME', 'ESIGNER_PASSWORD', 'ESIGNER_CREDENTIAL_ID', 'ESIGNER_TOTP_SECRET'];
  const missing = need.filter((k) => !env[k]);
  if (missing.length) throw new Error(`win-sign: missing ${missing.join(', ')}`);
  const jar = fs.readdirSync(path.join(env.CODESIGNTOOL_DIR, 'jar')).find((f) => /^code_sign_tool-.*\.jar$/.test(f));
  if (!jar) throw new Error('win-sign: CodeSignTool jar not found');
  // CodeSignTool writes the signed copy to an output folder, then it replaces the original
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'rxpos-sign-'));
  const java = path.join(env.JAVA_HOME, 'bin', process.platform === 'win32' ? 'java.exe' : 'java');
  const args = ['-Xmx1024M', '-jar', path.join(env.CODESIGNTOOL_DIR, 'jar', jar), 'sign',
    `-username=${env.ESIGNER_USERNAME}`, `-password=${env.ESIGNER_PASSWORD}`,
    `-credential_id=${env.ESIGNER_CREDENTIAL_ID}`, `-totp_secret=${env.ESIGNER_TOTP_SECRET}`,
    `-input_file_path=${file}`, `-output_dir_path=${out}`];
  console.log(`  • eSigner signing ${path.basename(file)}`);
  for (let attempt = 1; ; attempt++) {
    try {
      // cwd: CodeSignTool reads conf/ from its own folder
      const log = execFileSync(java, args, { cwd: env.CODESIGNTOOL_DIR, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      // CodeSignTool can print an error and still exit 0: success is the signed copy in the output folder
      if (!fs.existsSync(path.join(out, path.basename(file)))) throw new Error(log || 'no signed copy');
      break;
    } catch (e) {
      const msg = String(e.stdout || e.message || e).split(env.ESIGNER_PASSWORD).join('***').split(env.ESIGNER_TOTP_SECRET).join('***');
      // the command line (with the password) must never reach the log through the attached error
      Object.assign(e, { message: msg, stack: msg, cmd: undefined, spawnargs: undefined });
      if (attempt >= 3) throw new Error(`win-sign: ${path.basename(file)} was not signed: ${msg}`, { cause: e });
      console.log(`  • eSigner attempt ${attempt} failed, retrying: ${msg.trim().split('\n').pop()}`);
      await new Promise((r) => setTimeout(r, 5000 * attempt));
    }
  }
  fs.copyFileSync(path.join(out, path.basename(file)), file);
  fs.rmSync(out, { recursive: true, force: true });
};

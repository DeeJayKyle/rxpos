// Web sign-in: download links for the apps (src/appDownloads.js)
import assert from 'node:assert/strict';
import { deviceOf, downloadLinks, RELEASES_PAGE } from '../src/appDownloads.js';
let passed = 0;
const ok = (n, fn) => { fn(); passed++; console.log('PASS ', n); };

ok('the device is read from the browser', () => {
  assert.equal(deviceOf('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130'), 'windows');
  assert.equal(deviceOf('Mozilla/5.0 (Linux; Android 14; SM-A146P) Chrome/130 Mobile'), 'android');
  assert.equal(deviceOf('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)'), 'apple');
  assert.equal(deviceOf('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)'), 'apple');
  assert.equal(deviceOf('Mozilla/5.0 (X11; Linux x86_64)'), 'other');
});
ok('links to the React app\'s installer and Android app in the newest release', () => {
  const l = downloadLinks();
  assert.deepEqual(l.windows, { name: 'Windows', url: RELEASES_PAGE + '/download/RxPOS-Setup.exe', direct: true });
  assert.equal(l.android.url, RELEASES_PAGE + '/download/RxPOS-Android.apk');
  assert.ok(!JSON.stringify(l).includes('flutter'), 'never the retired Flutter apps');
});
console.log(`\n${passed} passed, 0 failed`);

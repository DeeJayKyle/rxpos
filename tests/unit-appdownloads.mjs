// Web sign-in: download links for the apps (src/appDownloads.js)
import assert from 'node:assert/strict';
import { deviceOf, sizeText, downloadLinks, RELEASES_PAGE } from '../src/appDownloads.js';
let passed = 0;
const ok = (n, fn) => { fn(); passed++; console.log('PASS ', n); };

ok('the device is read from the browser', () => {
  assert.equal(deviceOf('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130'), 'windows');
  assert.equal(deviceOf('Mozilla/5.0 (Linux; Android 14; SM-A146P) Chrome/130 Mobile'), 'android');
  assert.equal(deviceOf('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)'), 'apple');
  assert.equal(deviceOf('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)'), 'apple');
  assert.equal(deviceOf('Mozilla/5.0 (X11; Linux x86_64)'), 'other');
});
ok('sizes in MB', () => { assert.equal(sizeText(89128960), '85 MB'); assert.equal(sizeText(0), ''); assert.equal(sizeText(1000), '1 MB'); });
ok('links to the newest released apps the cloud serves', () => {
  const l = downloadLinks('https://rxposug.com', { build: 154, label: '2.1.154', file: 'RxPOS-New-154.exe', size: 89128960 }, { build: 154, label: '2.1.154', file: 'RxPOS-New-154.apk', size: 31457280 });
  assert.deepEqual(l.windows, { name: 'Windows', url: 'https://rxposug.com/api/app/RxPOS-New-154.exe', version: '2.1.154', size: '85 MB', direct: true });
  assert.equal(l.android.url, 'https://rxposug.com/api/app/RxPOS-New-154.apk');
});
ok('no version file, or a strange file name: the release page instead', () => {
  const l = downloadLinks('https://rxposug.com', null, { file: '../secret.apk' });
  assert.equal(l.windows.url, RELEASES_PAGE); assert.equal(l.windows.direct, false);
  assert.equal(l.android.url, RELEASES_PAGE);
  assert.equal(downloadLinks('x', { file: 'RxPOS.apk' }, null).windows.url, RELEASES_PAGE, 'an APK is not a Windows installer');
});
console.log(`\n${passed} passed, 0 failed`);

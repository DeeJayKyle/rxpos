// Which addresses of rxposug.com open the RxPOS app (functions/_middleware.js isAppPage).
//   node unit-site-routes.mjs
import { isAppPage } from '../functions/_middleware.js';
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + x : ''}`); };

for (const p of ['/', '/pos', '/inventory/x', '/sign-in', '/payroll', '/pharmcare', '/citycare-ntinda/', '/sample-pharmacy-address']) check(`${p} opens the app`, isAppPage(p) === true);
for (const p of ['/classic/', '/classic/pharmcare', '/api/health', '/owner', '/assets/index-1.js', '/app/main.dart.js', '/index.html', '/version.json', '/sw.js',
  '/manifest.webmanifest', '/updates/x', '/pharmcare/extra', '/Not_A_Slug']) check(`${p} does not`, isAppPage(p) === false);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

// What's new (UI batch 3, B8): the classic app's list (src/whatsnew.js) and the Flutter app's
// (rxpos_flutter/lib/core/config/whats_new.dart) say the same, and the card shows once after an update only.
import fs from 'node:fs';
import { WHATS_NEW, whatsNewDue } from '../src/whatsnew.js';
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + x : ''}`); };
const dart = fs.readFileSync(new URL('../rxpos_flutter/lib/core/config/whats_new.dart', import.meta.url), 'utf8');
const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
check('the same release in both apps', dart.includes(`whatsNewVersion = '${WHATS_NEW.version}'`), WHATS_NEW.version);
const items = [...dart.matchAll(/\('([^']+)', '([^']+)'\)/g)].map((m) => [m[1], m[2]]);
check('the same highlights and links in both apps', JSON.stringify(items) === JSON.stringify(WHATS_NEW.items.map((x) => [x.text, x.to])), JSON.stringify(items));
check('the list is for this release or the one coming (package.json)', WHATS_NEW.version.split('.').map(Number).reduce((a, v) => a * 1000 + v, 0) >= pkg.version.split('.').map(Number).reduce((a, v) => a * 1000 + v, 0), `${WHATS_NEW.version} / ${pkg.version}`);
check('due after an update', whatsNewDue('1.12.0', { usedBefore: false }) === true);
check('not again once seen', whatsNewDue(WHATS_NEW.version, { usedBefore: true }) === false);
check('a new device or pharmacy is not told what is "new"', whatsNewDue(undefined, { usedBefore: false }) === false && whatsNewDue(undefined, { usedBefore: true }) === true);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

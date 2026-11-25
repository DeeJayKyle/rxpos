// What's new (UI batch 3, B8): the app's list (src/whatsnew.js) is for this release, and the card shows once after an
// update only. (The Flutter app it was once compared with is archived: archive/README.md.)
import fs from 'node:fs';
import { WHATS_NEW, whatsNewDue } from '../src/whatsnew.js';
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + x : ''}`); };
const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
check('every highlight has words and a page to open', WHATS_NEW.items.length > 0 && WHATS_NEW.items.every((x) => x.text && x.to));
check('the list is for this release or the one coming (package.json)', WHATS_NEW.version.split('.').map(Number).reduce((a, v) => a * 1000 + v, 0) >= pkg.version.split('.').map(Number).reduce((a, v) => a * 1000 + v, 0), `${WHATS_NEW.version} / ${pkg.version}`);
check('due after an update', whatsNewDue('1.12.0', { usedBefore: false }) === true);
check('not again once seen', whatsNewDue(WHATS_NEW.version, { usedBefore: true }) === false);
check('a new device or pharmacy is not told what is "new"', whatsNewDue(undefined, { usedBefore: false }) === false && whatsNewDue(undefined, { usedBefore: true }) === true);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

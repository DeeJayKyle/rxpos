// The till's idle lock (src/behaviour.js idleLockMinutes): the pharmacy's setting (Settings → Alerts & storage →
// Till lock) can turn it off for every device; otherwise a device's own Control Centre choice wins, else the
// pharmacy's time, else 5 minutes.   node unit-idle-lock.mjs
import { idleLockMinutes } from '../src/behaviour.js';
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' && !ok ? '  ' + String(x) : ''}`); };
const dev = (lock) => ({ lock: lock ?? 5, lockChosen: lock != null });
check('nothing chosen: 5 minutes', idleLockMinutes({}, dev()) === 5);
check('the pharmacy turned it off: never locks by itself', idleLockMinutes({ idleLock: 0 }, dev()) === 0);
check('…even on a device that picked its own time', idleLockMinutes({ idleLock: 0 }, dev(2)) === 0);
check('the pharmacy\'s time is used by devices that picked none', idleLockMinutes({ idleLock: 30 }, dev()) === 30);
check('a device\'s own choice wins over the pharmacy\'s time', idleLockMinutes({ idleLock: 30 }, dev(2)) === 2);
check('a strange stored value falls back to 5 minutes', idleLockMinutes({ idleLock: 7 }, dev()) === 5 && idleLockMinutes(null, dev()) === 5);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

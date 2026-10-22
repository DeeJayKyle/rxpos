// Unit test: refill and reminder rules (src/rxrules.js, review 0.8).
import { refillsLeft, canRecordRefill, reminderActive } from '../src/rxrules.js';
let pass = 0, fail = 0;
const check = (n, ok) => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}`); };
check('0 refills allowed means no refill can be recorded (was unlimited)', canRecordRefill({ refillsAllowed: 0 }) === false);
check('missing refillsAllowed means none', canRecordRefill({}) === false);
check('2 allowed, 0 used -> can refill', canRecordRefill({ refillsAllowed: 2, refillsUsed: 0 }) === true);
check('2 allowed, 2 used -> cannot', canRecordRefill({ refillsAllowed: 2, refillsUsed: 2 }) === false);
check('refillsLeft never negative', refillsLeft({ refillsAllowed: 1, refillsUsed: 5 }) === 0);
check('reminder active for a dispensed prescription with an interval', reminderActive({ refillDays: 30, status: 'Dispensed' }) === true);
check('no reminder when Completed', reminderActive({ refillDays: 30, status: 'Completed' }) === false);
check('no reminder when Pending', reminderActive({ refillDays: 30, status: 'Pending' }) === false);
check('no reminder when Cancelled', reminderActive({ refillDays: 30, status: 'Cancelled' }) === false);
check('no reminder without an interval', reminderActive({ status: 'Dispensed' }) === false);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

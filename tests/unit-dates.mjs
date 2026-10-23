// Local-time date helpers (review Phase 1.8).
//   node unit-dates.mjs
import { localDate, today, dayOf, monthOf, daysUntil, daysSince } from '../src/dates.js';
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + x : ''}`); };

check('localDate formats YYYY-MM-DD', /^\d{4}-\d{2}-\d{2}$/.test(localDate(new Date('2026-03-05T10:00:00'))), localDate(new Date('2026-03-05T10:00:00')));
check('today is a date string', /^\d{4}-\d{2}-\d{2}$/.test(today()), today());
check('dayOf keeps a plain date', dayOf('2026-10-15') === '2026-10-15');
check('dayOf converts a timestamp', /^\d{4}-\d{2}-\d{2}$/.test(dayOf('2026-10-15T08:30:00.000Z')));
check('dayOf of empty is empty', dayOf('') === '' && dayOf(null) === '');
check('monthOf is the first 7 chars', monthOf('2026-10-15') === '2026-10');
check('daysUntil today is 0', daysUntil(today()) === 0, String(daysUntil(today())));
check('daysUntil a far future date is positive', daysUntil('2099-01-01') > 0);
check('daysUntil a past date is negative', daysUntil('2000-01-01') < 0);
check('daysSince a past date is positive', daysSince('2000-01-01') > 0);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

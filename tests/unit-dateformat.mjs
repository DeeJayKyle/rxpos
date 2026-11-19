// Typing dates in the pharmacy's chosen format (src/dateformat.js)
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { formatDate, parseDate } from '../src/dateformat.js';
let passed = 0;
const ok = (n, fn) => { fn(); passed++; console.log('PASS ', n); };
ok('shows a stored date in each format', () => { assert.equal(formatDate('2026-11-02', 'dmy'), '02/11/2026'); assert.equal(formatDate('2026-11-02', 'mdy'), '11/02/2026'); assert.equal(formatDate('2026-11-02', 'ymd'), '2026-11-02'); assert.equal(formatDate(''), ''); });
ok('reads DD/MM/YYYY (also with - or . and 2-digit years)', () => { assert.equal(parseDate('02/11/2026', 'dmy'), '2026-11-02'); assert.equal(parseDate('2-11-26', 'dmy'), '2026-11-02'); assert.equal(parseDate('02.11.2026', 'dmy'), '2026-11-02'); });
ok('reads MM/DD/YYYY', () => assert.equal(parseDate('11/02/2026', 'mdy'), '2026-11-02'));
ok('reads YYYY-MM-DD in any format', () => { assert.equal(parseDate('2026-11-02', 'ymd'), '2026-11-02'); assert.equal(parseDate('2026-11-02', 'dmy'), '2026-11-02'); });
ok('an expiry with month and year is the last day of that month (leap years too)', () => { assert.equal(parseDate('06/2028', 'dmy', { monthYear: true }), '2028-06-30'); assert.equal(parseDate('2/28', 'dmy', { monthYear: true }), '2028-02-29'); assert.equal(parseDate('2027-02', 'ymd', { monthYear: true }), '2027-02-28'); });
ok('month/year is not accepted where a full date is needed', () => assert.equal(parseDate('06/2028', 'dmy'), null));
ok('impossible dates are refused', () => { assert.equal(parseDate('31/02/2026', 'dmy'), null); assert.equal(parseDate('13/13/2026', 'dmy'), null); assert.equal(parseDate('hello', 'dmy'), null); });
ok('typed without separators', () => { assert.equal(parseDate('02112026', 'dmy'), '2026-11-02'); assert.equal(parseDate('021126', 'dmy'), '2026-11-02'); assert.equal(parseDate('11022026', 'mdy'), '2026-11-02'); });
ok('an empty box is empty', () => assert.equal(parseDate('  ', 'dmy'), ''));
// 1.14.0: dates are shown in the chosen format everywhere, never in the computer's locale order (a PC in US English
// showed 2 November as 11/2/2026)
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const { showDate, showDateTime, dateLocale } = await import('../src/showdate.js');
ok('shows a date, an ISO time, a Date and milliseconds as DD/MM/YYYY', () => {
  assert.equal(showDate('2026-11-02'), '02/11/2026'); assert.equal(showDate(new Date(2026, 10, 2, 9, 5)), '02/11/2026');
  assert.equal(showDate(new Date(2026, 10, 2, 9, 5).getTime()), '02/11/2026'); assert.equal(showDate(''), ''); assert.equal(showDate(null), '');
  assert.equal(showDateTime(new Date(2026, 10, 2, 9, 5)), '02/11/2026 09:05'); assert.equal(dateLocale(), 'en-GB');
});
ok('no screen formats a date in the computer\'s own locale or with the browser\'s date box', () => {
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : /\.(jsx?|tsx?)$/.test(e.name) ? [path.join(d, e.name)] : []));
  const bad = [];
  for (const f of walk(new URL('../src', import.meta.url).pathname)) {
    const src = fs.readFileSync(f, 'utf8');
    if (/toLocaleDateString\((?!dateLocale\(\))/.test(src) || /new Date\([^;]*?\)\.toLocaleString\(\)/.test(src)) bad.push(f + ': locale date');
    if (!f.endsWith('fields.jsx') && /<input[^>]*type="date"/.test(src)) bad.push(f + ': native date box');
  }
  assert.deepEqual(bad, []);
});
console.log(`\n${passed} passed, 0 failed`);

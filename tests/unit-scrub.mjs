// Unit test: crash reports never carry phone numbers or emails (src/crash.js scrub, review 0.8).
import { scrub } from '../src/crash.js';
import { scrubText, scrubPage } from '../worker/crashscrub.js';
let pass = 0, fail = 0;
const check = (n, ok, got) => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : '  got: ' + got}`); };
const s = (x) => scrub(x, 500);
check('emails are removed', !/jane@/.test(s('err jane@example.com here')) && /\[email\]/.test(s('jane@example.com')), s('jane@example.com'));
check('plain long numbers removed', s('id 0772123456 x') === 'id [n] x', s('id 0772123456 x'));
check('spaced phone numbers removed', !/0772 123 456/.test(s('call 0772 123 456 now')) && /\[n\]/.test(s('call 0772 123 456 now')), s('call 0772 123 456 now'));
check('dashed phone numbers removed', !/0772-123-456/.test(s('call 0772-123-456')) , s('call 0772-123-456'));
check('short counts are kept (e.g. "3 items")', /3 items/.test(s('3 items')), s('3 items'));
// audit 2026-11-17 (2nd pass): the cloud scrubs again what a device sent, and keeps no query in the page
for (const x of ['err jane@example.com here', 'call 0772 123 456 now', 'id 0772123456 x', '3 items']) check(`the cloud scrubs like the device: ${x}`, scrubText(x, 500) === s(x), scrubText(x, 500));
check('the page loses its query, keeps its path', scrubPage('/sales?q=R-104233') === '/sales' && scrubPage('#/stock-card?id=abc') === '#/stock-card' && scrubPage('#/pos') === '#/pos', scrubPage('#/stock-card?id=abc'));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

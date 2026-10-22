// Unit test: attachment links must resolve to http(s) only (src/safeurl.js, security review 0.4).
import { safeFileUrl } from '../src/safeurl.js';
let pass = 0, fail = 0;
const check = (n, ok) => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}`); };
const base = 'https://rxposug.com';
check('a normal file path resolves to https', safeFileUrl(base, '/api/files/t/abc/sig') === 'https://rxposug.com/api/files/t/abc/sig');
check('javascript: is rejected', safeFileUrl(base, 'javascript:alert(1)') === null);
check('data: is rejected', safeFileUrl(base, 'data:text/html,<script>alert(1)</script>') === null);
check('blob: is rejected', safeFileUrl(base, 'blob:https://x/abc') === null);
check('an absolute http(s) url is kept', safeFileUrl(base, 'https://other.example/x') === 'https://other.example/x');
check('a file: url is rejected', safeFileUrl('', 'file:///etc/passwd') === null);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

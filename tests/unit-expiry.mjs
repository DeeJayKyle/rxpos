// Expiry dates read whatever their format (src/dateformat.js parseExpiry), against the cases shared with the Flutter
// app (tests/expiry-cases.json).   node unit-expiry.mjs
import fs from 'node:fs';
import { parseExpiry } from '../src/dateformat.js';
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + String(x) : ''}`); };
const { cases } = JSON.parse(fs.readFileSync(new URL('./expiry-cases.json', import.meta.url), 'utf8'));
for (const c of cases) { const got = parseExpiry(c.in, c.fmt); check(`"${c.in}" (${c.fmt}) → ${c.expect}`, got === c.expect, got); }
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

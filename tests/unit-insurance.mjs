// Insurance co-pay split and balances (workplan step 22, src/insurance.js), against the cases shared with the Flutter
// app (tests/insurance-cases.json).   node unit-insurance.mjs
import fs from 'node:fs';
import { copayOf, insurerBalance, clientOwes, schemeChoices } from '../src/insurance.js';
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + String(x) : ''}`); };
const cases = JSON.parse(fs.readFileSync(new URL('./insurance-cases.json', import.meta.url), 'utf8'));
for (const c of cases.copay) {
  const got = copayOf(c.scheme, c.total, c.decimals);
  check('split: ' + c.name, got.copay === c.expect.copay && got.insurer === c.expect.insurer && Math.abs(got.copay + got.insurer - c.total) < 1e-9, JSON.stringify(got));
}
const { sales, payments, expect } = cases.balances;
for (const [id, v] of Object.entries(expect.insurer)) check(`insurer ${id} owes ${v}`, insurerBalance(sales, payments, id) === v, insurerBalance(sales, payments, id));
for (const [id, v] of Object.entries(expect.clientOwes)) { const got = clientOwes(sales.find((s) => s.id === id)); check(`client owes on ${id}: ${v}`, got === v, got); }
const ch = schemeChoices([{ id: 'i1', name: 'A', schemes: [{ id: 'gold' }, { id: 'silver' }] }, { id: 'i2', archived: true, schemes: [{ id: 'x' }] }]);
check('scheme choices: archived insurers left out', JSON.stringify(ch.map((x) => x.key)) === '["i1|gold","i1|silver"]');
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

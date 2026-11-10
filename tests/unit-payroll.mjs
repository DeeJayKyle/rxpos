// Payroll & HR rules (step 26, src/payroll.js), against the cases shared with the Flutter app (tests/payroll-cases.json).
//   node unit-payroll.mjs
import fs from 'node:fs';
import { payeUganda, payLine, payrollTotals } from '../src/payroll.js';
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + String(x) : ''}`); };
const c = JSON.parse(fs.readFileSync(new URL('./payroll-cases.json', import.meta.url), 'utf8'));
for (const [g, t] of c.paye) check(`PAYE on ${g} = ${t}`, payeUganda(g) === t, payeUganda(g));
for (const x of c.lines) {
  const l = payLine(x.employee, x.month, { attendance: x.attendance, advances: x.advances, workingDays: x.workingDays, deductAbsence: x.deductAbsence });
  const bad = Object.entries(x.expect).filter(([k, v]) => JSON.stringify(l[k]) !== JSON.stringify(v));
  check(x.name, !bad.length, bad.map(([k]) => `${k}: ${JSON.stringify(l[k])}`).join(', '));
}
const t = payrollTotals(c.lines.map((x) => payLine(x.employee, x.month, { attendance: x.attendance, advances: x.advances, workingDays: x.workingDays, deductAbsence: x.deductAbsence })));
check('totals: cost = gross + employer NSSF; statutory = PAYE + both NSSF', t.cost === t.gross + t.nssfEmployer && t.statutory === t.paye + t.nssfEmployee + t.nssfEmployer && t.gross === 1652000, JSON.stringify(t));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

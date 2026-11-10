// GS1 pack codes (workplan step 21, src/gs1.js), against the cases shared with the Flutter app (tests/gs1-cases.json).
//   node unit-gs1.mjs
import fs from 'node:fs';
import { parseGs1, sameGtin, findByGtin, gtinValid, gs1Date } from '../src/gs1.js';
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + String(x) : ''}`); };
const cases = JSON.parse(fs.readFileSync(new URL('./gs1-cases.json', import.meta.url), 'utf8'));
for (const c of cases.parse) {
  const got = parseGs1(c.in + c.append);
  check('read: ' + c.name, JSON.stringify(got) === JSON.stringify(c.expect), JSON.stringify(got));
}
for (const c of cases.sameGtin) check(`same product number: ${c.a} / ${c.b}`, sameGtin(c.a, c.b) === c.expect);
check('check digits', gtinValid('4006381333931') && gtinValid('09506000134352') && !gtinValid('4006381333932'));
check('dates: leap year and a bad month', gs1Date('280200') === '2028-02-29' && gs1Date('271300') === '');
const products = [{ id: 'p1', barcode: '4006381333931' }, { id: 'p2', barcode: 'INTERNAL-7' }];
check('the medicine is found from the GTIN-14 in the code', findByGtin(products, '04006381333931')?.id === 'p1' && findByGtin(products, '09506000134352') === null);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

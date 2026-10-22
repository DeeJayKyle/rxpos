// Unit test: the idle shop window never features rx or controlled medicines (src/promote.js, review 0.8).
import { isFeaturable } from '../src/promote.js';
let pass = 0, fail = 0;
const check = (n, ok) => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}`); };
check('an ordinary in-stock product is featurable', isFeaturable({ stock: 5, price: 1000 }) === true);
check('a prescription-only product is not featured', isFeaturable({ stock: 5, price: 1000, rx: true }) === false);
check('a controlled product is not featured', isFeaturable({ stock: 5, price: 1000, controlled: true }) === false);
check('out-of-stock is not featured', isFeaturable({ stock: 0, price: 1000 }) === false);
check('a product with no price is not featured', isFeaturable({ stock: 5, price: 0 }) === false);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

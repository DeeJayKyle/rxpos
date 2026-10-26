// POS medicine search: brand, generic, strength, barcode; spelling variants; ranking.   node unit-search.mjs
import { fold, searchProducts } from '../src/search.js';
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + String(x) : ''}`); };

const P = [
  { id: 1, name: 'Amoxyl 500mg caps', generic: 'Amoxicillin', form: 'Capsules', stock: 10, barcode: '6001001' },
  { id: 2, name: 'Panadol Extra', generic: 'Paracetamol + Caffeine', form: 'Tablets', stock: 0 },
  { id: 3, name: 'Ferrous Sulphate 200 mg', generic: 'Iron', form: 'Tablets', stock: 5 },
  { id: 4, name: 'Calpol Paediatric', generic: 'Paracetamol', form: 'Syrup', stock: 3 },
  { id: 5, name: 'Paracetamol 500mg', generic: 'Paracetamol', form: 'Tablets', stock: 50 },
];
const ids = (q) => searchProducts(P, q).map((p) => p.id);

check('brand name', ids('amoxyl').join() === '1');
check('generic name finds the brand', ids('amoxicillin').join() === '1');
check('spelling variant (amoxycillin)', ids('amoxycillin').join() === '1');
check('sulphate / sulfate', ids('ferrous sulfate').join() === '3');
check('paediatric / pediatric', ids('calpol pediatric').join() === '4');
check('strength with or without a space', ids('500 mg').includes(1) && ids('500mg').includes(5) && ids('200mg').join() === '3');
check('several words, any order', ids('500mg amox').join() === '1');
check('barcode', ids('6001001').join() === '1');
check('name starting with the query ranks first', ids('paracetamol')[0] === 5, ids('paracetamol').join());
check('in stock before out of stock within the same rank', ids('panadol').join() === '2' && ids('paracetamol').indexOf(4) < ids('paracetamol').indexOf(2), ids('paracetamol').join());
check('empty query returns the list unchanged', searchProducts(P, '  ').length === P.length);
check('fold folds case, accents and punctuation', fold('Café-Ämox  500 MG') === 'cafe amox 500mg', fold('Café-Ämox  500 MG'));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

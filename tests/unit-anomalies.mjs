// Sale checks on the cloud (workplan step 3, worker/anomalies.js): what is flagged for the owner, and what is not.
//   node unit-anomalies.mjs
import { saleFindings, fingerprint } from '../worker/anomalies.js';
import { moneyView } from '../worker/policy.js';
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + String(x) : ''}`); };

const products = new Map([
  ['p1', { name: 'Amox', price: 1000, wholesale: 800, updatedAt: '2026-01-01T00:00:00Z' }],
  ['p2', { name: 'Para', price: 500, packs: [{ name: 'Box', size: 3, price: 1300 }], updatedAt: '2026-01-01T00:00:00Z' }],
  ['p3', { name: 'Later', price: 900, updatedAt: '2026-12-01T00:00:00Z' }], // price changed after the sale
]);
const base = { id: 's1', number: 'R1', date: '2026-11-09T10:00:00Z', type: 'retail', status: 'completed', items: [{ id: 'p1', name: 'Amox', qty: 2, price: 1000 }], subtotal: 2000, discount: 0, tax: 0, total: 2000, paid: 2000 };
const sale = (x = {}) => ({ ...base, ...x });
const cashier = (p) => false && p; // no discount, no price edit
const boss = () => true;
const kinds = async (s, can = cashier) => (await saleFindings(s, products, can)).map((f) => f.kind).sort().join(',');

check('a correct sale has no findings', (await kinds(sale())) === '');
check('lines that do not add up to the subtotal', (await kinds(sale({ subtotal: 1500, total: 1500, paid: 1500 }))) === 'totals');
check('a total that is not subtotal − discount + tax', (await kinds(sale({ total: 1000, paid: 1000 }))) === 'totals');
check('rounding of a split pack is not a finding', (await kinds(sale({ items: [{ id: 'p2', qty: 3, price: 433.3333, pack: { name: 'Box', size: 3 } }], subtotal: 1300, total: 1300, paid: 1300 }), boss)) === '');
check('tax that adds up is fine', (await kinds(sale({ tax: 360, total: 2360, paid: 2360 }))) === '');
check('paid more than the total', (await kinds(sale({ paid: 5000 }))) === 'paid');
check('a negative quantity is invalid', (await kinds(sale({ items: [{ id: 'p1', qty: -2, price: 1000 }], subtotal: 0, total: 0, paid: 0 }), boss)).includes('invalid'));
check('a discount by a role without "Give discounts"', (await kinds(sale({ discount: 200, total: 1800, paid: 1800 }))) === 'discount');
check('…not when the role may give discounts', (await kinds(sale({ discount: 200, total: 1800, paid: 1800 }), (p) => p === 'pos.discount')) === '');
check('…not when it came from a proforma', (await kinds(sale({ discount: 200, total: 1800, paid: 1800, proformaId: 'pf1' }))) === '');
check('a line below the medicine\'s price by a role without "Change prices"', (await kinds(sale({ items: [{ id: 'p1', qty: 2, price: 600 }], subtotal: 1200, total: 1200, paid: 1200 }))) === 'price');
const priceF = (await saleFindings(sale({ items: [{ id: 'p1', name: 'Amox', qty: 2, price: 600 }], subtotal: 1200, total: 1200, paid: 1200 }), products, cashier))[0];
check('…says what it was sold at and what is lost', priceF?.amount === 800 && /600 instead of 1,000/.test(priceF?.detail), priceF?.detail);
check('…not when the role may change prices', (await kinds(sale({ items: [{ id: 'p1', qty: 2, price: 600 }], subtotal: 1200, total: 1200, paid: 1200 }), (p) => p === 'pos.price_edit')) === '');
check('the wholesale price counts on a wholesale sale', (await kinds(sale({ type: 'wholesale', items: [{ id: 'p1', qty: 2, price: 800 }], subtotal: 1600, total: 1600, paid: 1600 }))) === '');
check('a pack line is compared with the pack\'s own price', (await kinds(sale({ items: [{ id: 'p2', qty: 3, price: 1300 / 3, pack: { name: 'Box', size: 3 } }], subtotal: 1300, total: 1300, paid: 1300 }))) === '');
check('a medicine re-priced after the sale is not compared', (await kinds(sale({ items: [{ id: 'p3', qty: 1, price: 100 }], subtotal: 100, total: 100, paid: 100 }))) === '');
check('an unknown medicine is not compared', (await kinds(sale({ items: [{ id: 'nope', qty: 1, price: 1 }], subtotal: 1, total: 1, paid: 1 }))) === '');
check('a refunded sale is not re-checked', (await kinds(sale({ status: 'refunded', total: 1 }))) === '');
check('the same money gives the same fingerprint (a re-send keeps "checked")', fingerprint(moneyView(sale())) === fingerprint(moneyView({ ...sale(), receiptSent: true })));
check('different money gives a new fingerprint', fingerprint(moneyView(sale())) !== fingerprint(moneyView(sale({ total: 1 }))));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

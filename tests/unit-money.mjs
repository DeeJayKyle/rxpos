// Money math (review Phase 1.5): integer-UGX rounding, per-line totals, tax, pack splitting, locale formatting.
//   node unit-money.mjs
import { round, lineTotal, cartSubtotal, taxOf, unitPrice, formatMoney } from '../src/money.js';
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + String(x) : ''}`); };

// round
check('round to whole shillings', round(666.666 * 3) === 2000, round(666.666 * 3));
check('round keeps 2 decimals when asked', round(1.005, 2) === 1.01, round(1.005, 2));
check('round of junk is 0', round(undefined) === 0 && round(NaN) === 0);

// lineTotal
check('line total is price × qty', lineTotal({ price: 1500, qty: 3 }) === 4500);
check('a pack-split price rounds per line', lineTotal({ price: 2000 / 3, qty: 3 }) === 2000, lineTotal({ price: 2000 / 3, qty: 3 }));
check('a per-line discount is subtracted', lineTotal({ price: 1000, qty: 2, discount: 500 }) === 1500);
check('a line never goes negative', lineTotal({ price: 100, qty: 1, discount: 999 }) === 0);

// cartSubtotal: each line rounds, then they sum (no floating tail)
const cart = [{ price: 2000 / 3, qty: 3 }, { price: 1000 / 7, qty: 7 }];
check('cart subtotal sums per-line rounded nets', cartSubtotal(cart) === 3000, cartSubtotal(cart));

// tax
check('tax adds on by default', taxOf(10000, 18) === 1800);
check('no rate means no tax', taxOf(10000, 0) === 0);
check('inclusive tax is extracted', taxOf(11800, 18, { inclusive: true }) === 1800, taxOf(11800, 18, { inclusive: true }));
check('tax rounds once', taxOf(333, 18) === 60, taxOf(333, 18)); // 59.94 → 60

// unitPrice
check('pack unit price rounds', unitPrice(2000, 3) === 667, unitPrice(2000, 3));
check('unit price of a single is the price', unitPrice(1500, 1) === 1500);

// formatMoney: pharmacy locale, not the device's
check('format groups thousands with the currency prefix', formatMoney(1234567, { currency: 'UGX', decimals: 0, locale: 'en-UG' }) === 'UGX 1,234,567', formatMoney(1234567, { currency: 'UGX', decimals: 0, locale: 'en-UG' }));
check('format respects decimals', formatMoney(1234.5, { currency: 'USD', decimals: 2, locale: 'en-US' }) === 'USD 1,234.50', formatMoney(1234.5, { currency: 'USD', decimals: 2, locale: 'en-US' }));
check('format with no currency is just the number', formatMoney(1000, { locale: 'en-UG' }) === '1,000');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

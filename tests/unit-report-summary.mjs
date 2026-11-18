// The one-line summary each report opens with (UI batch 3, F9)
import { reportSummary } from '../src/reportSummary.js';
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + x : ''}`); };
const fmt = (n) => 'UGX ' + Math.round(n).toLocaleString('en-US');
let s = reportSummary('sales', { sales: 112000, prevSales: 100000, receipts: 40, topProduct: 'Amoxil' }, fmt);
check('sales: up 12% on the period before; the top seller', s === 'UGX 112,000 from 40 sales, up 12% on the period before; Amoxil sold most.', s);
s = reportSummary('sales', { sales: 90000, prevSales: 100000, receipts: 1 }, fmt);
check('sales: down, one sale', s === 'UGX 90,000 from 1 sale, down 10% on the period before.', s);
check('sales: nothing to compare with', reportSummary('sales', { sales: 5000, prevSales: 0, receipts: 2 }, fmt) === 'UGX 5,000 from 2 sales.');
check('no sales', reportSummary('sales', { receipts: 0 }, fmt) === 'No sales in these dates.');
s = reportSummary('profit', { sales: 100000, profit: -2000, margin: -2 }, fmt);
check('profit: a loss said as a loss', s === 'A loss of UGX 2,000 (-2% of sales).', s);
check('expenses: the largest category', reportSummary('expenses', { expenses: 30000, topCategory: 'Rent' }, fmt) === 'UGX 30,000 spent; Rent the largest.');
check('stock: expired said apart', reportSummary('stock', { stockValue: 500000, expiredValue: 20000 }, fmt) === 'UGX 500,000 of stock at cost; UGX 20,000 has expired.');
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

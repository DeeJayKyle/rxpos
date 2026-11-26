// VAT per item (2026-11 audit): tax categories, line-by-line VAT, the discount shared before tax, the breakdown on
// receipts and in reports, and the cloud's sale check and money view.   node tests/unit-vat.mjs
import { TAX_CATEGORIES, categoryOf, rateOf, saleTax, shareDiscount, breakdownOf, sumBreakdowns, receiptVatRows, lineMark, showsVat } from '../src/tax.js';
import { summarise } from '../worker/summary.js';
import { saleFindings } from '../worker/anomalies.js';
import { moneyView } from '../worker/policy.js';
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + String(x) : ''}`); };
const J = JSON.stringify;

check('EFRIS codes: standard 01, zero 02, exempt 03', J(TAX_CATEGORIES.map((c) => [c.id, c.efris])) === J([['standard', '01'], ['zero', '02'], ['exempt', '03']]));
check('a medicine with its own category keeps it', categoryOf({ taxCategory: 'exempt' }, { defaultTaxCategory: 'standard' }) === 'exempt');
check('an unclassified medicine takes the pharmacy default', categoryOf({}, { defaultTaxCategory: 'exempt' }) === 'exempt' && categoryOf({ taxCategory: '' }, { defaultTaxCategory: 'zero' }) === 'zero');
check('with no default set, unclassified is standard (sales unchanged from before)', categoryOf({ taxCategory: 'junk' }, {}) === 'standard');
check('only standard carries the rate', rateOf('standard', 18) === 18 && rateOf('zero', 18) === 0 && rateOf('exempt', 18) === 0);

// a mixed basket: 30,000 of exempt medicine, 10,000 of standard-rated sundries, 5,000 zero-rated
const cart = [{ price: 10000, qty: 3, taxCategory: 'exempt' }, { price: 5000, qty: 2, taxCategory: 'standard' }, { price: 5000, qty: 1, taxCategory: 'zero' }];
let v = saleTax(cart, { standardRate: 18 });
check('VAT only on the standard-rated line (18% of 10,000)', v.tax === 1800 && J(v.lines.map((l) => l.tax)) === J([0, 1800, 0]), J(v.lines));
check('the breakdown has one row per category, standard first', J(v.breakdown.map((r) => [r.category, r.net, r.tax])) === J([['standard', 10000, 1800], ['zero', 5000, 0], ['exempt', 30000, 0]]), J(v.breakdown));
check('the old single rate would have charged 8,100: the fix charges 1,800', v.tax === 1800 && v.tax < 45000 * 0.18);

// the receipt discount is shared by value before VAT
check('discount shares add up exactly to the discount', shareDiscount([30000, 10000, 5000], 4500).reduce((a, b) => a + b, 0) === 4500 && J(shareDiscount([30000, 10000, 5000], 4500)) === J([3000, 1000, 500]));
check('a discount that does not divide evenly puts the remainder on the largest line', J(shareDiscount([100, 100, 101], 100)) === J([33, 33, 34]), J(shareDiscount([100, 100, 101], 100)));
check('a discount above the total is capped', J(shareDiscount([100], 500)) === J([100]));
v = saleTax(cart, { standardRate: 18, discount: 4500 });
check('VAT on the standard line after its share of the discount (18% of 9,000)', v.tax === 1620 && v.breakdown[0].net === 9000, J(v.breakdown));
check('taxable values add up to subtotal − discount', v.breakdown.reduce((a, r) => a + r.net, 0) === 45000 - 4500);

// rounding: per line, to the currency's precision
v = saleTax([{ price: 333, qty: 1, taxCategory: 'standard' }, { price: 333, qty: 1, taxCategory: 'standard' }], { standardRate: 18 });
check('each line rounds its VAT (59.94 → 60, twice)', v.tax === 120 && v.breakdown[0].tax === 120, v.tax);
v = saleTax([{ price: 333, qty: 1, taxCategory: 'standard' }], { standardRate: 18, decimals: 2 });
check('two-decimal currencies keep cents', v.tax === 59.94, v.tax);
check('not VAT-registered (rate 0): no VAT, categories still kept', saleTax(cart, { standardRate: 0 }).tax === 0 && saleTax(cart, { standardRate: 0 }).lines[1].taxCategory === 'standard');
check('a line with no category counts as standard', saleTax([{ price: 1000, qty: 1 }], { standardRate: 18 }).tax === 180);
check('an empty cart has no VAT and no rows', saleTax([], { standardRate: 18 }).tax === 0 && saleTax([], {}).breakdown.length === 0);

// receipts
const sale = { subtotal: 45000, discount: 0, tax: 1800, total: 46800, taxRate: 18, taxBreakdown: saleTax(cart, { standardRate: 18 }).breakdown, items: cart };
const fmt = (n) => 'UGX ' + n.toLocaleString('en-US');
const rows = receiptVatRows(sale, fmt);
check('the receipt shows VAT per category and the total VAT', J(rows) === J([['S VAT 18% (standard) on UGX 10,000', 'UGX 1,800'], ['Z Zero-rated on UGX 5,000', 'UGX 0'], ['E Exempt on UGX 30,000', 'UGX 0'], ['Total VAT', 'UGX 1,800']]), J(rows));
check('each receipt line carries its category letter', J(cart.map((i) => lineMark(sale, i))) === J(['E', 'S', 'Z']));
check('a pharmacy that is not VAT-registered prints no VAT lines', receiptVatRows({ ...sale, tax: 0, taxRate: 0 }, fmt).length === 0 && !showsVat({ ...sale, taxRate: 0 }) && lineMark({ ...sale, taxRate: 0 }, cart[0]) === '');
check('an older sale keeps its one "Tax" line', J(receiptVatRows({ subtotal: 1000, tax: 180, total: 1180 }, fmt)) === J([['Tax', 'UGX 180']]));

// reports
const old = { subtotal: 10000, discount: 0, tax: 1800, total: 11800 };
check('an older sale reports as one unclassified row', J(breakdownOf(old)) === J([{ category: null, efris: '', rate: null, net: 10000, tax: 1800 }]));
const sum = sumBreakdowns([[sale], [sale], [old], [sale, -1]]);
check('report totals per category, refunds taken off, older sales last', J(sum.map((r) => [r.category, r.net, r.tax])) === J([['standard', 10000, 1800], ['zero', 5000, 0], ['exempt', 30000, 0], [null, 10000, 1800]]), J(sum));
const f = summarise({ sales: [{ ...sale, id: 'a', status: 'completed' }, { ...sale, id: 'b', status: 'refunded' }], refunds: [{ ...sale, id: 'b', status: 'refunded' }], expenses: [] });
check('the cloud summary nets VAT by category after refunds', f.tax === 1800 && J(f.vat.map((r) => [r.category, r.net, r.tax])) === J([['standard', 10000, 1800], ['zero', 5000, 0], ['exempt', 30000, 0]]), J(f.vat));

// the cloud's sale check
const can = () => true;
const good = { ...sale, payment: 'Cash', paid: 46800, items: cart.map((i, k) => ({ id: 'p' + k, name: 'm' + k, ...i })) };
check('a correct per-item VAT sale raises no check', (await saleFindings(good, new Map(), can)).length === 0, J(await saleFindings(good, new Map(), can)));
const sneaky = { ...good, taxBreakdown: [{ ...good.taxBreakdown[0], tax: 900 }, ...good.taxBreakdown.slice(1)] };
check('a breakdown that does not add up to the VAT is flagged', (await saleFindings(sneaky, new Map(), can)).some((x) => x.kind === 'totals'));
const vatOnExempt = { ...good, tax: 2800, total: 47800, paid: 47800, taxBreakdown: [good.taxBreakdown[0], good.taxBreakdown[1], { ...good.taxBreakdown[2], tax: 1000 }] };
check('VAT charged on an exempt row is flagged', (await saleFindings(vatOnExempt, new Map(), can)).some((x) => x.kind === 'totals'));

// the money view: a re-send can't quietly move a line to another category
const moved = { ...good, items: good.items.map((i, k) => (k === 1 ? { ...i, taxCategory: 'exempt' } : i)) };
check('changing a line\'s VAT category changes the sale\'s money view', moneyView(good) !== moneyView(moved));
check('an older sale\'s money view is unchanged by the new fields', moneyView(old) === moneyView({ ...old }) && !moneyView(old).includes('standard'));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

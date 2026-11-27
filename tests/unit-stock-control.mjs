// Stock controls, 27 Nov 2026 (src/stockcontrol.js, worker/anomalies.js stockLossFindings, tools/stock-audit.mjs):
// the stock review found sales moving stock exactly right and the losses in hand changes (counts, adjustments, edits,
// write-offs). Each test checks one of the controls added for it.
import assert from 'node:assert/strict';
import {
  STOCK_REASONS, reasonLabel, reasonNote, reasonReady, lossLimit, lossDayLimit, deliveryGapDays, needsApproval, isApprover, costLookup, lossOf,
  shrinkage, weekStart, weeklyBuySell, deliveryGap, adjustmentBurst, expiryState, orderDue, LOSS_LIMIT, LOSS_DAY_LIMIT,
} from '../src/stockcontrol.js';
import { stockLossFindings } from '../worker/anomalies.js';
import { auditTenant, headline, formatReport } from '../tools/stock-audit.mjs';
import { deliveryReview } from '../src/deliverychecks.js';

let passed = 0;
const ok = async (n, fn) => { await fn(); passed++; console.log('PASS ', n); };
const at = (day, h = 9) => new Date(Date.UTC(2026, 10, day, h - 3)).toISOString(); // h o'clock in Uganda on Nov `day`
const mv = (type, qty, day, extra = {}) => ({ id: `${type}-${day}-${qty}-${extra.productId || 'para'}-${extra.h || 9}`, productId: 'para', batchId: 'b1', branchId: 'main', type, qty, date: at(day, extra.h || 9), ...extra });
const products = [{ id: 'para', name: 'Paracetamol', cost: 100 }, { id: 'amox', name: 'Amoxicillin', cost: 1000 }];
const batches = [{ id: 'b1', productId: 'para', cost: 100 }, { id: 'b2', productId: 'amox', cost: 1000 }];
const costOf = costLookup(products, batches);

await ok('reasons: a list, words for each code, "Other" needs a note', () => {
  assert.ok(STOCK_REASONS.length >= 6);
  assert.equal(reasonLabel('damaged'), 'Damaged or broken');
  assert.equal(reasonLabel(''), 'No reason given');
  assert.equal(reasonNote('damaged', ' fell '), 'Damaged or broken: fell');
  assert.equal(reasonNote('other', 'given to the clinic'), 'given to the clinic');
  assert.equal(reasonReady('', 'x'), false);
  assert.equal(reasonReady('other', ' '), false);
  assert.equal(reasonReady('other', 'why'), true);
  assert.equal(reasonReady('loss', ''), true);
});

await ok('limits: defaults, 0 turns them off, typed values are used', () => {
  assert.equal(lossLimit({}), LOSS_LIMIT);
  assert.equal(lossDayLimit({}), LOSS_DAY_LIMIT);
  assert.equal(lossLimit({ stockLossLimit: 0 }), 0);
  assert.equal(lossLimit({ stockLossLimit: '20000' }), 20000);
  assert.equal(lossLimit({ stockLossLimit: '' }), LOSS_LIMIT);
  assert.equal(deliveryGapDays({ deliveryGapDays: 3 }), 3);
});

await ok('approval: a loss over the limit needs a manager, unless a manager makes it', () => {
  const cashier = { role: 'cashier' }, manager = { role: 'manager' }, admin = { role: 'admin' };
  assert.equal(needsApproval(60000, {}, cashier), true);
  assert.equal(needsApproval(50000, {}, cashier), false, 'at the limit is fine');
  assert.equal(needsApproval(60000, {}, manager), false);
  assert.equal(needsApproval(1e9, {}, admin), false);
  assert.equal(needsApproval(60000, { stockLossLimit: 0 }, cashier), false, 'switched off');
  assert.ok(isApprover(manager) && !isApprover(cashier) && !isApprover(null));
  assert.equal(lossOf([{ qty: -5, cost: 100 }, { qty: 3, cost: 100 }]), 500, 'stock found is not a loss');
});

await ok('costs: a batch\'s own cost first, then the medicine\'s', () => {
  assert.equal(costOf({ productId: 'amox', batchId: 'b2' }), 1000);
  assert.equal(costOf({ productId: 'para', batchId: 'missing' }), 100);
  assert.equal(costOf({ productId: 'nothing' }), 0);
});

await ok('shrinkage: hand losses net of stock found, against the cost of sales, by type, reason and person', () => {
  const moves = [
    mv('Sale', -1000, 3), mv('Refund', 10, 3), // 990 sold at 100 = 99,000
    mv('Adjustment', -10, 4, { reason: 'damaged', user: 'Ann' }), // -1,000
    mv('Inventory edit', -5, 5, { reason: 'loss', user: 'Bob' }), // -500
    mv('Stock count', 2, 6, { user: 'Ann' }), // +200 found
    mv('Expired write-off', -3, 6, { user: 'Ann' }), // -300
    mv('Purchase', 500, 6), // not a loss
    mv('Adjustment', -100, 1, { reason: 'loss', user: 'Bob' }), // before the range
  ];
  const s = shrinkage(moves, { from: at(2, 0), costOf });
  assert.equal(s.lost, 1800);
  assert.equal(s.found, 200);
  assert.equal(s.net, 1600);
  assert.equal(s.sold, 99000);
  assert.equal(s.pct, 1.6);
  assert.equal(s.byReason.damaged, -1000);
  assert.equal(s.byReason.expired, -300);
  assert.equal(s.byReason.count, 200);
  assert.equal(s.byPerson.Ann, -1100);
  assert.equal(s.byType['Inventory edit'], -500);
  assert.equal(shrinkage([], { costOf }).pct, null, 'no sales: no percentage');
  assert.equal(shrinkage(moves, { from: at(2, 0), costOf, branchId: 'other' }).lost, 0, 'another branch');
});

await ok('deliveries against the cost of sales, week by week', () => {
  assert.equal(weekStart('2026-11-27T10:00:00Z'), '2026-11-23'); // a Friday → its Monday
  assert.equal(weekStart('2026-11-23'), '2026-11-23');
  const moves = [mv('Purchase', 100, 24), mv('Purchase edit', -10, 24), mv('Sale', -50, 25), mv('Sale', -20, 17)];
  const w = weeklyBuySell(moves, { costOf, today: '2026-11-27', weeks: 2 });
  assert.deepEqual(w, [{ week: '2026-11-16', bought: 0, sold: 2000 }, { week: '2026-11-23', bought: 9000, sold: 5000 }]);
});

await ok('missing deliveries: selling for a week with none recorded is flagged; a recent delivery is not', () => {
  const moves = [mv('Opening stock', 500, 1), mv('Purchase', 50, 10), mv('Sale', -1, 15), mv('Sale', -1, 26)];
  assert.deepEqual(deliveryGap(moves, { today: '2026-11-27', minDays: 7 }), { days: 17, since: '2026-11-10', sales: 2, never: false });
  assert.equal(deliveryGap([...moves, mv('Purchase', 5, 25)], { today: '2026-11-27', minDays: 7 }), null);
  assert.equal(deliveryGap(moves, { today: '2026-11-27', minDays: 0 }), null, 'switched off');
  assert.equal(deliveryGap([mv('Opening stock', 5, 1)], { today: '2026-11-27', minDays: 7 }), null, 'nothing sold: nothing to say');
  assert.equal(deliveryGap([mv('Opening stock', 5, 1), mv('Sale', -1, 2)], { today: '2026-11-27', minDays: 7 }).never, true);
});

await ok('a stock take typed as adjustments is noticed', () => {
  const moves = Array.from({ length: 12 }, (_, i) => ({ type: 'Adjustment', user: 'Ann', date: new Date(Date.UTC(2026, 10, 27, 9, i * 3)).toISOString() }));
  assert.equal(adjustmentBurst(moves, 'Ann', new Date(Date.UTC(2026, 10, 27, 9, 40)).toISOString()), 12);
  assert.equal(adjustmentBurst(moves, 'Bob', new Date(Date.UTC(2026, 10, 27, 9, 40)).toISOString()), 0);
  assert.equal(adjustmentBurst(moves, 'Ann', new Date(Date.UTC(2026, 10, 27, 12, 0)).toISOString()), 0, 'hours later');
});

await ok('expiry: expired, soon, or fine; a month-only date means the end of the month', () => {
  assert.equal(expiryState('2026-11-26', '2026-11-27'), 'expired');
  assert.equal(expiryState('2026-11', '2026-11-27'), 'soon', 'Nov 2026 is good to the 30th');
  assert.equal(expiryState('2026-10', '2026-11-27'), 'expired');
  assert.equal(expiryState('2027-01-15', '2026-11-27', 90), 'soon');
  assert.equal(expiryState('2028-01-01', '2026-11-27', 90), null);
  assert.equal(expiryState('', '2026-11-27'), null);
});

await ok('Add Stock warns about stock that has already expired', () => {
  const base = { products: new Map([['para', { cost: 50, price: 100 }]]), purchases: [], supplierId: 's', supplierName: 'S', invoice: 'I1', date: '2026-11-27', today: '2026-11-27', total: 5000 };
  const r = deliveryReview({ ...base, lines: [{ productId: 'para', name: 'Para', qty: 100, cost: 50, price: 100, expiry: '2026-10-01' }] }, { money: String, date: String });
  assert.ok(r.warnings.some((w) => /EXPIRED/.test(w)), r.warnings.join('\n'));
});

await ok('the weekly order: due from the order day until an order is drafted that week', () => {
  // 27 Nov 2026 is a Friday
  assert.deepEqual(orderDue({ orderDay: 1 }, '2026-11-27', []), { since: '2026-11-23' });
  assert.equal(orderDue({ orderDay: 1 }, '2026-11-27', [{ date: '2026-11-24T10:00:00Z' }]), null);
  assert.deepEqual(orderDue({ orderDay: 1 }, '2026-11-27', [{ date: '2026-11-20T10:00:00Z' }]), { since: '2026-11-23' }, 'last week\'s order does not count');
  assert.deepEqual(orderDue({ orderDay: 5 }, '2026-11-27', []), { since: '2026-11-27' });
  assert.equal(orderDue({ orderDay: '' }, '2026-11-27', []), null);
  assert.equal(orderDue({}, '2026-11-27', []), null);
});

await ok('the cloud flags one hand loss over the limit, and says when no manager approved it', async () => {
  const dayOf = (iso) => new Date(Date.parse(iso) + 3 * 3600e3).toISOString().slice(0, 10);
  const big = mv('Adjustment', -60, 27, { productId: 'amox', batchId: 'b2', note: 'Missing or stolen', user: 'Ann' }); // 60,000
  const small = mv('Adjustment', -10, 27, { user: 'Ann' }); // 1,000
  const approved = mv('Inventory edit', -70, 27, { productId: 'amox', batchId: 'b2', approvedBy: 'Mary', h: 10 });
  const sale = mv('Sale', -500, 27, { productId: 'amox', batchId: 'b2' });
  const f = await stockLossFindings([big, small, approved, sale], { costOf, settings: {}, dayBefore: async () => 0, dayOf, names: new Map([['amox', 'Amoxicillin']]) });
  const lines = f.filter((x) => x.kind === 'stock-loss');
  assert.equal(lines.length, 2, 'the two over 50,000; the sale and the small one are not hand losses over the limit');
  assert.match(lines[0].detail, /Amoxicillin: 60 taken off .*no manager approved it/);
  assert.match(lines[1].detail, /approved by Mary/);
  assert.equal(lines[0].amount, 60000);
  const day = f.filter((x) => x.kind === 'stock-loss-day');
  assert.equal(day.length, 0, '131,000 is under the day limit of 200,000');
  const none = await stockLossFindings([big], { costOf, settings: { stockLossLimit: 0, stockLossDayLimit: 0 }, dayBefore: async () => 0, dayOf });
  assert.equal(none.length, 0, 'both switched off');
});

await ok('the cloud flags a day\'s hand losses each time they pass another multiple of the day limit', async () => {
  const dayOf = (iso) => new Date(Date.parse(iso) + 3 * 3600e3).toISOString().slice(0, 10);
  const m = mv('Stock count', -100, 27, { productId: 'amox', batchId: 'b2' }); // 100,000
  const settings = { stockLossLimit: 0 };
  assert.equal((await stockLossFindings([m], { costOf, settings, dayBefore: async () => 50000, dayOf })).length, 0, '150,000: under');
  const crossed = await stockLossFindings([m], { costOf, settings, dayBefore: async () => 150000, dayOf });
  assert.equal(crossed.length, 1);
  assert.equal(crossed[0].kind, 'stock-loss-day');
  assert.equal(crossed[0].step, 1);
  assert.equal(crossed[0].amount, 250000);
  assert.equal(crossed[0].day, '2026-11-27');
  const again = await stockLossFindings([m], { costOf, settings, dayBefore: async () => 250000, dayOf });
  assert.equal(again.length, 0, '350,000 is still in the second band: no new finding');
  const third = await stockLossFindings([m], { costOf, settings, dayBefore: async () => 320000, dayOf });
  assert.equal(third[0].step, 2, '420,000: the second multiple');
});

await ok('the stock audit: copied Rxtera history is expected, hand changes are listed with who and why', () => {
  const opening = { id: 'o1', productId: 'para', batchId: 'b1', branchId: 'main', type: 'Opening stock', qty: 1000, date: at(16, 5) };
  const copiedSale = { id: 'rx-1', number: 'RX1', date: at(16, 10), items: [{ id: 'para', name: 'Paracetamol', qty: 5, price: 200, cost: 100 }] };
  const realSale = { id: 's1', number: 'R1', date: at(20, 10), items: [{ id: 'para', name: 'Paracetamol', qty: 2, price: 200, cost: 100 }] };
  const movements = [opening, { id: 'm1', productId: 'para', batchId: 'b1', branchId: 'main', type: 'Sale', qty: -2, ref: 'R1', date: at(20, 10) },
    { id: 'm2', productId: 'para', batchId: 'b1', branchId: 'main', type: 'Adjustment', qty: -30, reason: 'loss', note: 'Missing or stolen', user: 'Ann', origin: 'dev12345678', date: at(26, 11) }];
  const a = auditTenant({ products, batches, movements, sales: [copiedSale, realSale], purchases: [{ id: 'rx-p', number: 'P1', invoice: 'P1', date: '2026-11-16', items: [{ productId: 'para', qty: 10 }] }], today: '2026-11-27', days: 30 });
  assert.equal(a.sales.missing.n, 0, 'the copied receipt is not a problem');
  assert.equal(a.sales.changeover.n, 1);
  assert.equal(a.sales.changeover.value, 500);
  assert.equal(a.purchases.missing.n, 0);
  assert.equal(a.purchases.changeover.n, 1);
  assert.equal(a.hand.lost, 3000);
  assert.equal(a.hand.top[0].by, 'Ann');
  assert.equal(a.hand.top[0].device, 'dev12345');
  assert.match(a.hand.top[0].why, /Missing or stolen/);
  const text = formatReport('Test', a).join('\n');
  assert.match(text, /changeover/);
  assert.match(text, /Hand changes since/);
  const short = headline('Test pharmacy', a).join('\n');
  assert.match(short, /hand changes since .*3,000 taken off/);
  assert.match(short, /Paracetamol: -30/);
});

console.log(`\n${passed} passed, 0 failed`);

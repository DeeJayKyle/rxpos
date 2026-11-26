// Stock audit, 26 Nov 2026 (src/stockcount.js, src/deliverychecks.js): each test reproduces a way the stock figures went
// wrong when adding, editing or counting stock, and checks the fix. The ledger is replayed with the app's own counter
// (src/stockindex.js countAll), so "stock" here is exactly what the app shows.
import assert from 'node:assert/strict';
import { countDiff, movedAfter, packSlip, packText, scanStep, repack, lotKey, lotChange } from '../src/stockcount.js';
import { auditTenant } from '../tools/stock-audit.mjs';
import { countAll } from '../src/stockindex.js';
import { deliveryReview } from '../src/deliverychecks.js';
import { planReturn, returnsOf } from '../src/returns.js';
import { packAndDoubles } from '../tools/stock-audit.mjs';

let passed = 0;
const ok = (n, fn) => { fn(); passed++; console.log('PASS ', n); };
const T = (min) => new Date(Date.UTC(2026, 10, 26, 8, min)).toISOString(); // 26 Nov 2026 08:mm
const mv = (qty, type, min, extra = {}) => ({ id: type + min + qty, productId: 'para', batchId: 'b1', branchId: 'main', qty, type, date: T(min), ...extra });
const stock = (moves) => countAll(moves).batch.get(lotKey('main', 'para', 'b1')) || 0;
/** What the app books when the count is posted (StockCount ReviewPost) */
const post = (ledger, line) => countDiff(line, { current: stock(ledger), after: movedAfter(ledger, { branchId: 'main', productId: 'para', batchId: 'b1' }, line.at) });
const para = { id: 'para', unit: 'Tablet', packs: [{ name: 'Strip', size: 10 }, { name: 'Box', size: 100 }] };

// ---- 1. counts and the ledger ----
ok('a sale on another till before the count, synced after it, is not taken off twice', () => {
  // 100 on the shelf. Till B sells 10 at 08:05 (offline). The count at 08:10 finds 90; this device still shows 100.
  const counted = { qty: 90, sys: 100, at: T(10) };
  const ledger = [mv(100, 'Purchase', 0)];
  // the sale reaches this device before the count is posted
  ledger.push(mv(-10, 'Sale', 5, { ref: 'R-9' }));
  assert.equal(stock(ledger), 90);
  const diff = post(ledger, counted);
  assert.equal(diff, 0, 'the shelf matched once the sale is known: nothing to correct');
  assert.equal(stock([...ledger, mv(diff, 'Stock count', 20)]), 90);
  // the old rule (counted − system then) booked −10 and left 80: the sale counted twice
  assert.equal(countDiff({ qty: 90, sys: 100 }), -10);
});
ok('sales after the count are kept: stock = counted − sold since', () => {
  const ledger = [mv(100, 'Purchase', 0), mv(-5, 'Sale', 15, { ref: 'R-1' })];
  const diff = post(ledger, { qty: 97, sys: 100, at: T(10) }); // 3 missing at 08:10, 5 sold at 08:15
  assert.equal(stock([...ledger, mv(diff, 'Stock count', 20)]), 92);
});
ok('a delivery after the count is kept', () => {
  const ledger = [mv(100, 'Purchase', 0), mv(50, 'Purchase', 15)];
  assert.equal(stock([...ledger, mv(post(ledger, { qty: 98, sys: 100, at: T(10) }), 'Stock count', 20)]), 148);
});
ok('two counts of the same medicine do not both correct it', () => {
  // counts A and B both find 80 of the 100 at 08:10; A is posted, then B
  const ledger = [mv(100, 'Purchase', 0)];
  const a = post(ledger, { qty: 80, sys: 100, at: T(10) });
  ledger.push(mv(a, 'Stock count', 20));
  const b = post(ledger, { qty: 80, sys: 100, at: T(11) });
  assert.equal(a, -20); assert.equal(b, 0);
  assert.equal(stock([...ledger, mv(b, 'Stock count', 21)]), 80, 'was 60 before the fix');
});
ok('an inventory edit after the count is a correction, not stock moving', () => {
  const ledger = [mv(100, 'Purchase', 0), mv(-20, 'Inventory edit', 12)];
  assert.equal(stock([...ledger, mv(post(ledger, { qty: 80, sys: 100, at: T(10) }), 'Stock count', 20)]), 80);
});
ok('counts saved before the fix (no time) keep the old rule', () => assert.equal(countDiff({ qty: 7, sys: 10 }, { current: 3, after: 99 }), -3));
ok('movedAfter looks at one batch, one branch, and skips corrections', () => {
  const m = [mv(-5, 'Sale', 15), mv(-5, 'Sale', 15, { batchId: 'b2' }), mv(-5, 'Sale', 15, { branchId: 'b' }), mv(-5, 'Sale', 5), mv(3, 'Stock count', 16), mv(2, 'Refund', 17)];
  assert.equal(movedAfter(m, { branchId: 'main', productId: 'para', batchId: 'b1' }, T(10)), -3);
  // stock from before batches is its own lot
  assert.equal(movedAfter([mv(4, 'Refund', 20, { batchId: null })], { branchId: 'main', productId: 'para', batchId: null }, T(10)), 4);
});

// ---- 2. packs and single units ----
ok('Scan & count adds a whole box of tablets per scan (it added one tablet)', () => {
  assert.equal(scanStep(para), 100);
  assert.equal(scanStep({ unit: 'Bottle' }), 1);
  // 3 boxes scanned on a shelf the system says holds 300: posting changes nothing (it set 300 → 3 before)
  let qty = 0; for (let i = 0; i < 3; i++) qty += scanStep(para);
  assert.equal(countDiff({ qty, sys: 300 }), 0);
});
ok('a count typed in boxes is caught, with the figure in tablets offered', () => {
  assert.deepEqual(packSlip(para, 3, 300), { pack: para.packs[1], units: 300 });
  assert.deepEqual(packSlip(para, 3, 320), { pack: para.packs[1], units: 300 });
  assert.equal(packSlip(para, 29, 30)?.pack.name, undefined, 'near the system figure: not a slip');
  assert.deepEqual(packSlip(para, 3, 30), { pack: para.packs[0], units: 30 }, 'strips');
  assert.equal(packSlip(para, 0, 300), null);
  assert.equal(packSlip(para, 3, 5), null, 'less than a pack in stock');
  assert.equal(packSlip({ unit: 'Bottle' }, 3, 300), null, 'no packs: nothing to say');
  assert.equal(packSlip(para, 290, 300), null);
});
ok('a quantity in tablets is shown in boxes too', () => {
  assert.equal(packText(para, 320), '3 Boxes + 20 tablets');
  assert.equal(packText(para, 100), '1 Box');
  assert.equal(packText(para, 99), '');
  assert.equal(packText({ unit: 'Tablet' }, 500), '');
});
ok('a delivery line edited from 500 to 450 tablets no longer says "5 Boxes"', () => {
  const line = { productId: 'para', qty: 500, pack: { name: 'Box', size: 100, count: 5, cost: 5000 } };
  assert.equal(repack(line, 300).pack.count, 3);
  assert.equal(repack(line, 450).pack, undefined);
  assert.equal(repack({ qty: 5 }, 7).pack, undefined);
});
ok('Add Stock: a box price typed as the retail price of one tablet is flagged', () => {
  const base = { products: new Map([['para', { cost: 50, price: 100 }]]), purchases: [], supplierId: 's', supplierName: 'S', invoice: 'I1', date: '2026-11-26', today: '2026-11-26', total: 5000 };
  const show = { money: String, date: String };
  const box = deliveryReview({ ...base, lines: [{ productId: 'para', name: 'Para', qty: 100, cost: 50, price: 6000, expiry: '2028-01-01' }] }, show);
  assert.ok(box.warnings.some((w) => /price of a whole pack/.test(w)), box.warnings.join('\n'));
  const normal = deliveryReview({ ...base, lines: [{ productId: 'para', name: 'Para', qty: 100, cost: 50, price: 150, expiry: '2028-01-01' }] }, show);
  assert.ok(!normal.warnings.some((w) => /price of a whole pack/.test(w)));
});

// ---- 3. returns: a whole refund after part was returned would put the returned stock back twice ----
ok('a sale with a part returned can only return what is left', () => {
  const sale = { id: 's1', number: 'R-1', total: 1000, paid: 1000, subtotal: 1000, items: [{ id: 'para', name: 'Para', qty: 10, price: 100, alloc: [{ batchId: 'b1', qty: 10 }] }] };
  const ret = { id: 'cn1', returnOf: 's1', items: [{ line: 0, id: 'para', qty: -4, alloc: [{ batchId: 'b1', qty: -4 }] }] };
  const rets = returnsOf(sale, [sale, ret]);
  assert.equal(rets.length, 1, 'Sales.jsx now refuses a whole refund when this is not empty');
  assert.equal(planReturn(sale, rets, [{ line: 0, qty: 10 }]).ok, false);
  const rest = planReturn(sale, rets, [{ line: 0, qty: 6 }]);
  assert.equal(rest.ok, true);
  assert.equal(-rest.items[0].alloc.reduce((a, x) => a + x.qty, 0), 6);
});

ok('an expired batch written off twice no longer goes below zero (Monticope 38 → −38)', () => {
  const then = [mv(38, 'Opening stock', 0)];
  const now = [...then, mv(-38, 'Expired write-off', 5)]; // the other device's write-off arrived first
  const qty = 38 + lotChange(now, then, { branchId: 'main', productId: 'para', batchId: 'b1' });
  assert.equal(qty, 0, 'nothing left to write off');
  assert.equal(lotChange([...then, mv(3, 'Refund', 6)], then, { branchId: 'main', productId: 'para', batchId: 'b1' }), 3);
});

// ---- 4. finding what the old mistakes left in a pharmacy's records (tools/stock-audit.mjs, read-only) ----
ok('the audit finds counts typed in boxes, transfers received twice and refunds after a return', () => {
  const P = new Map([['para', para]]);
  const moves = [
    mv(300, 'Purchase', 0), mv(-297, 'Stock count', 10, { user: 'Amina' }), // 300 tablets counted as 3 (boxes)
    mv(-5, 'Stock count', 11, { batchId: 'b2' }), // an ordinary count: not listed
    mv(-20, 'Transfer out', 12, { ref: 'TR-4 → Kampala', batchId: 'b3' }),
    mv(20, 'Transfer in', 13, { ref: 'TR-4 ← Main', branchId: 'kla', batchId: 'b3' }), mv(20, 'Transfer in', 14, { ref: 'TR-4 ← Main', branchId: 'kla', batchId: 'b3' }),
  ];
  const sales = [{ id: 's1', number: 'R-1', status: 'refunded', items: [{ id: 'para', qty: 10 }] }, { id: 'cn', number: 'CN-1', returnOf: 's1', items: [{ id: 'para', qty: -4 }] }];
  const a = packAndDoubles({ movements: moves, sales, P, cost: () => 50 });
  assert.equal(a.packSlips.n, 1);
  assert.equal(a.packSlips.top[0].fix, 297);
  assert.equal(a.packSlips.top[0].by, 'Amina');
  assert.equal(a.transfers.n, 1); assert.equal(a.transfers.top[0].extra, 20);
  assert.equal(a.refunds.n, 1); assert.equal(a.refunds.units, 4);
});

ok('the audit counts a kit sale against its medicines, not the kit', () => {
  const a = auditTenant({ today: '2026-11-26', days: 1, products: [para, { id: 'kit', name: 'HIV kit', kit: {} }], batches: [{ id: 'b1', productId: 'para' }],
    movements: [mv(10, 'Opening stock', 0), mv(-2, 'Sale', 5, { ref: 'R-7' })],
    sales: [{ id: 's7', number: 'R-7', date: T(5), status: 'completed', items: [{ id: 'kit', name: 'HIV kit', qty: 1, cost: 10, kit: { components: [{ id: 'para', qty: 2, alloc: [{ batchId: 'b1', qty: 2 }] }] } }] }] });
  assert.equal(a.sales.missing.n, 0); assert.equal(a.sales.extra.n, 0); assert.equal(a.sales.ok, 1);
});

console.log(`\n${passed} passed`);

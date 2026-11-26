// Packs (src/packs.js): which pack a line starts with, and its price
import assert from 'node:assert/strict';
import { mainPack, receiveInPacks, sellInPacks, packPrice, startPack, soldLoose, unitPresets, unitChange, unitScaleAt, unitChangedSince } from '../src/packs.js';
import { dailyStock } from '../worker/dailystock.js';
import { decide } from '../worker/policy.js';
let passed = 0;
const ok = (n, fn) => { fn(); passed++; console.log('PASS ', n); };
const p = { packs: [{ name: 'Strip', size: 10, price: 1200 }, { name: 'Box', size: 100, price: 11000, wholesale: 9000 }, { name: '', size: 5 }, { name: 'Single', size: 1 }] };
ok('the main pack is the largest one', () => assert.equal(mainPack(p).name, 'Box'));
ok('no packs: none', () => assert.equal(mainPack({}), null));
ok('defaults: receive in packs, retail sells units, wholesale sells packs', () => { assert.equal(receiveInPacks({}), true); assert.equal(sellInPacks({}, false), false); assert.equal(sellInPacks({}, true), true); });
ok('settings change them', () => { assert.equal(receiveInPacks({ receiveUnit: 'unit' }), false); assert.equal(sellInPacks({ sellUnitRetail: 'pack' }, false), true); assert.equal(sellInPacks({ sellUnitWholesale: 'unit' }, true), false); });
ok('a pack\'s own retail / wholesale price wins, else unit price × size', () => { assert.equal(packPrice(p.packs[1], 120, false), 11000); assert.equal(packPrice(p.packs[1], 95, true), 9000); assert.equal(packPrice(p.packs[0], 95, true), 950); });
// selling units set per medicine: the unit the till starts on, and "sold loose"
const med = { stock: 100, packs: [{ name: 'Pair', size: 2 }, { name: 'Half strip', size: 5 }, { name: 'Strip', size: 10 }, { name: 'Box', size: 100 }] };
ok('no choice on the medicine: the settings decide (retail a single unit, wholesale the largest pack)', () => { assert.equal(startPack(med, {}, false), null); assert.equal(startPack(med, {}, true).name, 'Box'); });
ok('the medicine\'s own start unit wins over the settings', () => { assert.equal(startPack({ ...med, sellAs: 'Strip' }, {}, false).name, 'Strip'); assert.equal(startPack({ ...med, sellAs: '' }, {}, true), null); assert.equal(startPack({ ...med, sellAs: 'Half strip' }, {}, true).name, 'Half strip'); });
ok('a start unit bigger than the stock falls back', () => { assert.equal(startPack({ ...med, stock: 50, sellAs: 'Box' }, {}, false), null); });
ok('not sold loose: starts on the smallest pack the stock fills, never a single unit', () => {
  assert.equal(soldLoose(med), true); assert.equal(soldLoose({ loose: false }), false);
  assert.equal(startPack({ ...med, loose: false }, {}, false).name, 'Pair');
  assert.equal(startPack({ ...med, loose: false, stock: 1 }, {}, false), null);
  assert.equal(startPack({ ...med, loose: false, sellAs: 'Box', stock: 30 }, {}, false).name, 'Pair');
});
ok('ready-made units follow the strip; an odd strip has no half', () => {
  const by = (p) => Object.fromEntries(unitPresets(p).map((k) => [k.name, k.size]));
  assert.deepEqual(by({ packs: [{ name: 'Strip', size: 10 }] }), { Pair: 2, 'Half strip': 5, Strip: 10, Box: 100 });
  assert.equal(by({ packs: [{ name: 'Strip', size: 15 }] })['Half strip'], '');
  assert.equal(by({})['Strip'], 10);
});

// changing the unit of issue: Box → Tablet, 1 box = 100 tablets
const box = { id: 'amx', name: 'Amoxil', unit: 'Box', price: 10000, wholesale: 9000, cost: 7000, reorder: 3, packs: [{ name: 'Carton', size: 10, price: 95000 }] };
const lots = [{ branchId: 'main', batchId: 'b1', qty: 4 }, { branchId: 'main', batchId: null, qty: 1 }, { branchId: 'kla', batchId: 'b2', qty: 2 }, { branchId: 'kla', batchId: 'b3', qty: 0 }];
const at = '2026-11-26T10:00:00.000Z';
const ch = unitChange(box, { to: 'Tablet', factor: 100, lots, batches: [{ id: 'b1', productId: 'amx', cost: 7000 }, { id: 'zz', productId: 'other', cost: 5 }], at, by: 'Admin' });
ok('stock is multiplied in every batch and branch by a Unit change movement', () => {
  assert.deepEqual(ch.moves.map((m) => [m.branchId, m.batchId, m.qty, m.type]), [['main', 'b1', 396, 'Unit change'], ['main', null, 99, 'Unit change'], ['kla', 'b2', 198, 'Unit change']]);
});
ok('prices and cost divided, reorder and packs multiplied, the old unit kept as a pack at its price', () => {
  const p = ch.product;
  assert.equal(p.unit, 'Tablet'); assert.equal(p.price, 100); assert.equal(p.wholesale, 90); assert.equal(p.cost, 70); assert.equal(p.reorder, 300);
  assert.deepEqual(p.packs.map((k) => [k.name, k.size, k.price]), [['Box', 100, 10000], ['Carton', 1000, 95000]]);
  assert.equal(p.packs[0].wholesale, 9000);
  assert.deepEqual(p.unitChanges, [{ at, from: 'Box', to: 'Tablet', factor: 100, by: 'Admin' }]);
  assert.deepEqual(ch.batches, [{ id: 'b1', productId: 'amx', cost: 70 }]);
});
ok('a till that started on one box still starts on one box', () => assert.equal(unitChange({ ...box, sellAs: '' }, { to: 'Tablet', factor: 100, at }).product.sellAs, 'Box'));
ok('a bad factor or the same unit is refused', () => {
  assert.throws(() => unitChange(box, { to: 'Tablet', factor: 1, at }));
  assert.throws(() => unitChange(box, { to: 'Tablet', factor: 2.5, at }));
  assert.throws(() => unitChange(box, { to: 'box', factor: 10, at }));
  assert.throws(() => unitChange(box, { to: '', factor: 10, at }));
});
ok('older sales and movements count in the new unit; later ones as they are', () => {
  assert.equal(unitScaleAt(ch.product, '2026-11-20T08:00:00Z'), 100);
  assert.equal(unitScaleAt(ch.product, '2026-11-27T08:00:00Z'), 1);
  assert.equal(unitChangedSince(ch.product, '2026-11-20'), true);
  assert.equal(unitScaleAt({}, '2026-01-01'), 1);
  const twice = unitChange(ch.product, { to: 'Half tablet', factor: 2, at: '2026-12-01T00:00:00Z' }).product;
  assert.equal(unitScaleAt(twice, '2026-11-20'), 200); assert.equal(unitScaleAt(twice, '2026-11-28'), 2);
});
ok('the daily stock report: the change moves no value, and days before it read the same stock', () => {
  const movements = [
    { productId: 'amx', batchId: 'b1', branchId: 'main', qty: 5, type: 'Purchase', date: '2026-11-24T09:00:00Z' },
    { productId: 'amx', batchId: 'b1', branchId: 'main', qty: 495, type: 'Unit change', date: at },
  ];
  const rows = dailyStock({ movements, batches: [{ id: 'b1', productId: 'amx', cost: 70 }], products: [ch.product], sales: [], expenses: [], from: '2026-11-24', to: '2026-11-26' });
  assert.deepEqual(rows.map((r) => [r.purchases, r.closing, r.other]), [[35000, 35000, 0], [0, 35000, 0], [0, 35000, 0]]);
});
ok('the cloud lets only Adjust stock record a Unit change', async () => {
  const mv = { t: 'movements', id: 'm1', rec: { type: 'Unit change', qty: 99, productId: 'amx' } };
  assert.equal((await decide(mv, null, 'cashier', (x) => x === 'pos.sell')).ok, false);
  assert.equal((await decide(mv, null, 'pharmacist', (x) => x === 'stock.adjust')).ok, true);
});

console.log(`\n${passed} passed, 0 failed`);

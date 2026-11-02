// Packs (src/packs.js): which pack a line starts with, and its price
import assert from 'node:assert/strict';
import { mainPack, receiveInPacks, sellInPacks, packPrice } from '../src/packs.js';
let passed = 0;
const ok = (n, fn) => { fn(); passed++; console.log('PASS ', n); };
const p = { packs: [{ name: 'Strip', size: 10, price: 1200 }, { name: 'Box', size: 100, price: 11000, wholesale: 9000 }, { name: '', size: 5 }, { name: 'Single', size: 1 }] };
ok('the main pack is the largest one', () => assert.equal(mainPack(p).name, 'Box'));
ok('no packs: none', () => assert.equal(mainPack({}), null));
ok('defaults: receive in packs, retail sells units, wholesale sells packs', () => { assert.equal(receiveInPacks({}), true); assert.equal(sellInPacks({}, false), false); assert.equal(sellInPacks({}, true), true); });
ok('settings change them', () => { assert.equal(receiveInPacks({ receiveUnit: 'unit' }), false); assert.equal(sellInPacks({ sellUnitRetail: 'pack' }, false), true); assert.equal(sellInPacks({ sellUnitWholesale: 'unit' }, true), false); });
ok('a pack\'s own retail / wholesale price wins, else unit price × size', () => { assert.equal(packPrice(p.packs[1], 120, false), 11000); assert.equal(packPrice(p.packs[1], 95, true), 9000); assert.equal(packPrice(p.packs[0], 95, true), 950); });
console.log(`\n${passed} passed, 0 failed`);

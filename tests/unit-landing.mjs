// Role-based landing and the phone's bottom bar (src/landing.js).
import assert from 'node:assert/strict';
import { homeFor, bottomTabs } from '../src/landing.js';
import { DEFAULT_ROLES } from '../src/access.js';
let passed = 0;
const ok = (name, fn) => { fn(); passed++; console.log('PASS ', name); };
const canOf = (id) => { const r = DEFAULT_ROLES.find((x) => x.id === id); return (p) => r.permissions.includes(p); };

ok('administrators and managers land on the dashboard', () => { assert.equal(homeFor('admin', canOf('admin')), '/'); assert.equal(homeFor('manager', canOf('manager')), '/'); });
ok('pharmacists, dispensers and cashiers land on the till', () => ['pharmacist', 'dispenser', 'cashier'].forEach((r) => assert.equal(homeFor(r, canOf(r)), '/pos')));
ok('a custom role: the till when it sells without reports, else the dashboard', () => {
  assert.equal(homeFor('front-desk', (p) => p === 'pos.sell'), '/pos');
  assert.equal(homeFor('supervisor', (p) => ['pos.sell', 'reports'].includes(p)), '/');
  assert.equal(homeFor('store', (p) => p === 'inventory.view'), '/');
});
ok('a cashier\'s bottom bar has no Stock tab (they cannot open Inventory)', () => {
  const t = bottomTabs(canOf('cashier'));
  assert.deepEqual(t.left.map((x) => x[0]), ['/', '/customers']); assert.equal(t.sell, true); assert.deepEqual(t.right.map((x) => x[0]), ['/sales']);
});
ok('a manager keeps Home, Stock, Sell, Sales', () => {
  const t = bottomTabs(canOf('manager'));
  assert.deepEqual([...t.left.map((x) => x[1]), t.sell && 'Sell', ...t.right.map((x) => x[1])], ['Home', 'Stock', 'Sell', 'Sales']);
});
ok('a page switched off for the pharmacy is never a tab', () => {
  const t = bottomTabs(canOf('manager'), (to) => to !== '/inventory');
  assert.ok(!t.left.some((x) => x[0] === '/inventory'));
});
console.log(`\n${passed} passed, 0 failed`);

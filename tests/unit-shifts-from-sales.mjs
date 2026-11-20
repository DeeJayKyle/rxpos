// Past sales outside any shift → one shift per person, branch and day (src/shiftsfromsales.js). Fictional people.
import assert from 'node:assert/strict';
import { shiftsFromSales, rebuiltShift } from '../src/shiftsfromsales.js';
let passed = 0;
const ok = (name, fn) => { fn(); passed++; console.log('PASS ', name); };
process.env.TZ = 'Africa/Kampala';
const sale = (id, cashier, date, o = {}) => ({ id, cashier, date, total: 1000, status: 'completed', branchId: 'main', ...o });
const users = [{ id: 'u1', name: 'Amina Nakato' }, { id: 'u2', name: 'Henry Example' }];

ok('each person\'s sales on a day become one shift, first sale to last', () => {
  const r = shiftsFromSales([sale('a', 'Amina Nakato', '2026-11-01T06:10:00Z'), sale('b', 'Amina Nakato', '2026-11-01T15:00:00Z'), sale('c', 'Henry Example', '2026-11-01T09:00:00Z')], [], users);
  assert.equal(r.length, 2);
  const a = r.find((x) => x.user === 'Amina Nakato');
  assert.deepEqual([a.userId, a.openedAt, a.closedAt, a.sales, a.total], ['u1', '2026-11-01T06:10:00Z', '2026-11-01T15:00:00Z', 2, 2000]);
});
ok('another day or another branch is another shift', () => {
  const r = shiftsFromSales([sale('a', 'Amina Nakato', '2026-11-01T08:00:00Z'), sale('b', 'Amina Nakato', '2026-11-02T08:00:00Z'), sale('c', 'Amina Nakato', '2026-11-02T09:00:00Z', { branchId: 'br2' })], [], users);
  assert.equal(r.length, 3);
});
ok('the day is the pharmacy\'s local day (22:30 UTC is the next morning in Kampala)', () => {
  const r = shiftsFromSales([sale('a', 'Amina Nakato', '2026-11-01T22:30:00Z'), sale('b', 'Amina Nakato', '2026-11-02T05:00:00Z')], [], users);
  assert.equal(r.length, 1); assert.equal(r[0].day, '2026-11-02');
});
ok('sales already inside a shift are left alone', () => {
  const shifts = [{ user: 'Amina Nakato', branchId: 'main', openedAt: '2026-11-01T05:00:00Z', closedAt: '2026-11-01T12:00:00Z' }];
  const r = shiftsFromSales([sale('a', 'Amina Nakato', '2026-11-01T08:00:00Z'), sale('b', 'Amina Nakato', '2026-11-01T14:00:00Z')], shifts, users);
  assert.equal(r.length, 1); assert.equal(r[0].sales, 1); assert.equal(r[0].openedAt, '2026-11-01T14:00:00Z');
});
ok('an open shift covers up to now', () => {
  const r = shiftsFromSales([sale('a', 'Amina Nakato', '2026-11-20T08:00:00Z')], [{ user: 'Amina Nakato', openedAt: '2026-11-20T05:00:00Z' }], users, '2026-11-20T10:00:00Z');
  assert.equal(r.length, 0);
});
ok('training sales and sales with no cashier are left out; refunded sales count but add nothing to the total', () => {
  const r = shiftsFromSales([sale('a', 'Amina Nakato', '2026-11-01T08:00:00Z', { training: true }), sale('b', '', '2026-11-01T08:00:00Z'), sale('c', 'Amina Nakato', '2026-11-01T09:00:00Z', { status: 'refunded' })], [], users);
  assert.equal(r.length, 1); assert.deepEqual([r[0].sales, r[0].total], [1, 0]);
});
ok('a rebuilt shift has no float and no cash count, and says so', () => {
  const rec = rebuiltShift({ user: 'Amina Nakato', userId: 'u1', branchId: 'main', openedAt: 'x', closedAt: 'y' }, 'id1');
  assert.deepEqual([rec.rebuilt, rec.float, rec.counted, rec.variance], [true, 0, null, null]);
  assert.match(rec.note, /no cash count/);
});
console.log(`\n${passed} passed, 0 failed`);

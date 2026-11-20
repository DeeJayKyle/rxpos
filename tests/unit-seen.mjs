// Menu counts and notifications highlight only while new (src/seen.js): opening the page / the bell marks them read.
import assert from 'node:assert/strict';
const store = new Map();
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) };
const { unreadCount, markCounts, settleCounts, alertUnread, markAlerts, seenMap, NAV_SEEN, BELL_SEEN } = await import('../src/seen.js');
let passed = 0;
const ok = (name, fn) => { fn(); passed++; console.log('PASS ', name); };

ok('a count never seen is new; once seen it is not; a higher count is new again', () => {
  assert.equal(unreadCount(42, undefined), 42);
  const seen = markCounts(NAV_SEEN, {}, { low: 42 });
  assert.equal(unreadCount(42, seen.low), 0);
  assert.equal(unreadCount(43, seen.low), 43);
  assert.deepEqual(seenMap(NAV_SEEN), { low: 42 }, 'kept on this device');
});
ok('a count that fell is lowered, so its next rise shows', () => {
  const seen = settleCounts(NAV_SEEN, { low: 42 }, { low: 30 });
  assert.equal(seen.low, 30);
  assert.equal(unreadCount(31, seen.low), 31);
  assert.equal(settleCounts(NAV_SEEN, seen, { low: 35 }), seen, 'no change when it rose');
});
ok('opening the bell marks its alerts read; a changed alert is new again', () => {
  const a = [{ key: 'expiry', text: '22 batches expiring' }, { key: 'low', text: '42 low' }];
  const seen = markAlerts(BELL_SEEN, a);
  assert.equal(a.filter((x) => alertUnread(x, seen)).length, 0);
  assert.equal(alertUnread({ key: 'expiry', text: '23 batches expiring' }, seen), true);
  assert.equal(alertUnread({ key: 'chat', text: '1 message' }, seen), true);
});
console.log(`\n${passed} passed, 0 failed`);

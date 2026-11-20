// The owner's law (worker/ownerlaw.js): direct writes to a pharmacy's data through the owner API need the owner's
// approval header; reading and the apps' own sync are untouched.
import assert from 'node:assert/strict';
import { OWNER_LAW, writesData, ownerApproved } from '../worker/ownerlaw.js';
let passed = 0;
const ok = (name, fn) => { fn(); passed++; console.log('PASS ', name); };
const req = (h = {}) => new Request('https://x/api/owner/tenants/a/records', { method: 'POST', headers: h });

ok('record writes, restore and database moves need approval', () => {
  assert.equal(writesData(['tenants', 'a', 'records'], 'POST'), true);
  assert.equal(writesData(['restore'], 'POST'), true);
  assert.equal(writesData(['move-to-turso'], 'POST'), true);
});
ok('reading never needs it; other owner calls are unchanged', () => {
  assert.equal(writesData(['tenants', 'a', 'records'], 'GET'), false);
  assert.equal(writesData(['backup'], 'GET'), false);
  assert.equal(writesData(['tenants'], 'POST'), false);
});
ok('approved only with X-Owner-Approved: yes (or on a throw-away test cloud)', () => {
  assert.equal(ownerApproved(req(), {}), false);
  assert.equal(ownerApproved(req({ 'X-Owner-Approved': 'no' }), {}), false);
  assert.equal(ownerApproved(req({ 'X-Owner-Approved': 'yes' }), {}), true);
  assert.equal(ownerApproved(req(), { TEST_CLOUD: '1' }), true);
});
ok('the law says to ask the owner first', () => { assert.match(OWNER_LAW, /without the owner's approval/); assert.match(OWNER_LAW, /stop and ask the owner/); });
console.log(`\n${passed} passed, 0 failed`);

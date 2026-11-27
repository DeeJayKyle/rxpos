// Hover tips on every control (src/hovertips.js).
import assert from 'node:assert/strict';
import { tipFor, guideKey, GUIDE } from '../src/hovertips.js';
let passed = 0;
const ok = (name, fn) => { fn(); passed++; console.log('PASS ', name); };

ok('counts and numbers are dropped from the guide key', () => { assert.equal(guideKey('In stock7'), 'in stock'); assert.equal(guideKey('All (8)'), 'all'); assert.equal(guideKey(' 12M '), 'm'); assert.equal(guideKey('+ Add line'), 'add line'); });
ok('common buttons get the guide words', () => {
  assert.equal(tipFor({ tag: 'BUTTON', text: 'Edit' }), GUIDE.edit);
  assert.equal(tipFor({ tag: 'BUTTON', text: 'Columns' }), GUIDE.columns);
  assert.equal(tipFor({ tag: 'BUTTON', text: 'Low stock2' }), GUIDE['low stock']);
});
ok('a table heading says how to sort, move and resize', () => assert.match(tipFor({ tag: 'BUTTON', cls: 'th-sort', text: 'Expiry' }), /^Sort by Expiry.*move.*resize/));
ok('a menu group says which pages it holds', () => assert.match(tipFor({ tag: 'BUTTON', cls: 'nav-title', text: 'Stock' }), /Stock pages \(medicines/));
ok('an icon-only button uses its accessible name', () => assert.equal(tipFor({ tag: 'BUTTON', text: '', label: 'Move Expiry left' }), 'Move Expiry left'));
ok('lists, fields, tabs and links say what they do', () => {
  assert.equal(tipFor({ tag: 'SELECT', label: 'Supplier' }), 'Choose supplier');
  assert.equal(tipFor({ tag: 'INPUT', type: 'text', label: 'Phone' }), 'Type phone');
  assert.equal(tipFor({ tag: 'INPUT', type: 'checkbox', label: 'Show price' }), 'Tick: Show price');
  assert.equal(tipFor({ tag: 'A', role: 'tab', cls: 'hub-tab', text: 'Stock Card' }), 'Show Stock Card');
  assert.equal(tipFor({ tag: 'A', text: 'Add your staff' }), 'Open Add your staff');
});
ok('search boxes and tick boxes read naturally', () => { assert.equal(tipFor({ tag: 'INPUT', type: 'text', label: 'Search…' }), 'Search: type a few letters to find or filter'); assert.equal(tipFor({ tag: 'INPUT', type: 'checkbox', label: 'Tick all rows shown' }), 'Tick all rows shown'); });
ok('a control with nothing to say gets no tip', () => { assert.equal(tipFor({ tag: 'BUTTON', text: '  ' }), ''); assert.equal(tipFor({ tag: 'INPUT', type: 'checkbox' }), ''); });
ok('long card words are cut short', () => assert.ok(tipFor({ tag: 'BUTTON', text: 'x'.repeat(200) }).length <= 60));
console.log(`\n${passed} passed, 0 failed`);

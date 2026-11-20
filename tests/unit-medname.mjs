// Consistent medicine names (src/medname.js): the house style, and the safety check every AI suggestion must pass
// before it is even offered; nothing is renamed without a person's approval (components/NameCheck.jsx).
import assert from 'node:assert/strict';
import { tidyName, safeRename, nameSuggestions, lookAlikes } from '../src/medname.js';
let passed = 0;
const ok = (name, fn) => { fn(); passed++; console.log('PASS ', name); };

ok('house style: capitals to Title Case, strengths joined and lower case, form written out', () => {
  assert.equal(tidyName('PARACETAMOL 500MG TABLETS'), 'Paracetamol 500mg Tablets');
  assert.equal(tidyName('Amoxil 500 mg caps'), 'Amoxil 500mg Capsules');
  assert.equal(tidyName('cetirizine syr 5mg/5ml'), 'Cetirizine Syrup 5mg/5ml');
  assert.equal(tidyName('VITAMIN B12 INJ'), 'Vitamin B12 Injection');
});
ok('short codes stay in capitals; stray marks and spaces go', () => {
  assert.equal(tidyName('ZINC 20 MG DT'), 'Zinc 20mg DT');
  assert.equal(tidyName('ORS SACHETS'), 'ORS Sachets');
  assert.equal(tidyName('Zyncet 10mg? tabs'), 'Zyncet 10mg Tablets');
  assert.equal(tidyName('Amoxicillin  250mg   Capsules'), 'Amoxicillin 250mg Capsules');
});
ok('a name already in style is left as it is', () => { assert.equal(tidyName('Panadol Extra'), 'Panadol Extra'); assert.equal(tidyName('AL 80/480'), 'AL 80/480'); });
ok('a suggestion must keep every number and the medicine', () => {
  assert.equal(safeRename('Amoxil 500 mg caps', 'Amoxil 500mg Capsules'), true);
  assert.equal(safeRename('Amoxil 500mg', 'Amoxil 250mg'), false, 'another strength');
  assert.equal(safeRename('Coartem 80/480 6x30', 'Coartem 80/480 6x20'), false, 'another pack');
  assert.equal(safeRename('Amoxil 500mg', 'Paracetamol 500mg'), false, 'another medicine');
  assert.equal(safeRename('Amoxil 500mg', ''), false);
  assert.equal(safeRename('Paracetamoll 500mg', 'Paracetamol 500mg'), true, 'a spelling fix');
});
ok('suggestions list only names that would change, with why', () => {
  const s = nameSuggestions([{ id: 'a', name: 'PCM 500MG TABS' }, { id: 'b', name: 'Panadol Extra' }]);
  assert.deepEqual(s.map((x) => [x.id, x.to]), [['a', 'PCM 500mg Tablets']]);
  assert.match(s[0].why, /form written out/);
});
ok('the same item twice is spotted (not merged)', () => {
  assert.equal(lookAlikes([{ id: 1, name: 'Zinc 20mg DT' }, { id: 2, name: 'ZINC 20 MG DT' }, { id: 3, name: 'ORS' }]).length, 1);
});
console.log(`\n${passed} passed, 0 failed`);

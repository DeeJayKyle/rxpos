// The live clinical safety check (src/clinical.js) and the FEFO expiry traffic light (src/fefo.js expiryLevel).
// Fictional customers and medicines.   node unit-clinical.mjs
import assert from 'node:assert/strict';
import { safetyCheck } from '../src/clinical.js';
import { expiryLevel } from '../src/fefo.js';
let passed = 0;
const ok = (name, fn) => { fn(); passed++; console.log('PASS ', name); };
const P = (id, name, generic) => ({ id, name, generic });
const products = [
  P('amx', 'MoxaForte 500mg Caps', 'amoxicillin'), P('cef', 'Cefuroxime 500mg Tablets', 'cefuroxime'),
  P('ibu', 'Ibuprofen 400mg Tablets', 'ibuprofen'), P('dic', 'Diclofenac 50mg Tablets', 'diclofenac'),
  P('war', 'Warfarin 5mg Tablets', 'warfarin'), P('met', 'Metronidazole 400mg Tablets', 'metronidazole'),
  P('cot', 'Septrin 480mg Tablets', 'cotrimoxazole'), P('pcm', 'Paracetamol 500mg Tablets', 'paracetamol'),
  P('pcm2', 'Panadol Extra', 'paracetamol'), P('cip', 'Ciprofloxacin 500mg', 'ciprofloxacin'), P('fer', 'Ferrous Sulphate 200mg', 'ferrous sulphate'),
  P('tra', 'Tramadol 50mg Caps', 'tramadol'), P('dia', 'Diazepam 5mg', 'diazepam'),
];
const lines = (...ids) => ids.map((id) => ({ id, name: id }));
const who = (allergies) => ({ id: 'c1', name: 'Test Client', allergies });

ok('nothing to say: ok', () => assert.deepEqual(safetyCheck(lines('pcm', 'amx'), products, null), { level: 'ok', findings: [] }));
ok('penicillin allergy: amoxicillin is major, a cephalosporin is a caution', () => {
  const r = safetyCheck(lines('amx', 'cef'), products, who('Penicillin - rash'));
  assert.equal(r.level, 'major');
  assert.equal(r.findings.filter((f) => f.kind === 'allergy').length, 2);
  assert.equal(r.findings[0].level, 'major'); assert.deepEqual(r.findings[0].ids, ['amx']);
  assert.ok(r.findings.some((f) => f.level === 'caution' && f.ids[0] === 'cef'));
});
ok('sulfa allergy catches Septrin', () => assert.equal(safetyCheck(lines('cot'), products, who('sulfa drugs')).level, 'major'));
ok('a medicine named in the allergy note is caught', () => assert.match(safetyCheck(lines('met'), products, who('metronidazole (vomiting)')).findings[0].text, /metronidazole/));
ok('"none" / "NKDA" means no allergy findings', () => { assert.equal(safetyCheck(lines('amx'), products, who('None known')).level, 'ok'); assert.equal(safetyCheck(lines('amx'), products, who('NKDA')).level, 'ok'); });
ok('warfarin + an NSAID: major bleeding risk', () => { const r = safetyCheck(lines('war', 'ibu'), products, null); assert.equal(r.level, 'major'); assert.match(r.findings[0].text, /bleeding/); });
ok('warfarin + metronidazole: raises the INR', () => assert.match(safetyCheck(lines('war', 'met'), products, null).findings[0].text, /INR/));
ok('tramadol + diazepam: opioid with benzodiazepine', () => assert.ok(safetyCheck(lines('tra', 'dia'), products, null).findings.some((f) => /breathing/.test(f.text))));
ok('ciprofloxacin + iron: a caution about spacing', () => { const r = safetyCheck(lines('cip', 'fer'), products, null); assert.equal(r.level, 'caution'); assert.match(r.findings[0].text, /2 hours/); });
ok('the same ingredient twice (paracetamol) and two NSAIDs are flagged as duplicates', () => {
  assert.equal(safetyCheck(lines('pcm', 'pcm2'), products, null).findings[0].kind, 'duplicate');
  assert.ok(safetyCheck(lines('ibu', 'dic'), products, null).findings.some((f) => f.kind === 'duplicate' && /NSAIDs/.test(f.text)));
});
ok('the same line twice in a cart (packs) is one medicine, not a duplicate', () => assert.equal(safetyCheck([{ id: 'pcm' }, { id: 'pcm' }], products, null).level, 'ok'));
ok('major findings come first', () => { const r = safetyCheck(lines('cip', 'fer', 'war', 'ibu'), products, null); assert.equal(r.findings[0].level, 'major'); });
ok('expiry traffic light: >6 months ok, 3–6 soon, <3 short, past expired, none empty', () => {
  const t = '2026-11-13';
  assert.equal(expiryLevel('2027-08-01', t), 'ok');
  assert.equal(expiryLevel('2027-04-01', t), 'soon');
  assert.equal(expiryLevel('2027-01-10', t), 'short');
  assert.equal(expiryLevel('2026-11-12', t), 'expired');
  assert.equal(expiryLevel('', t), '');
});
console.log(`\n${passed} passed, 0 failed`);

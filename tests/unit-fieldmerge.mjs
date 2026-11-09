// Field-by-field merge (workplan step 14, src/fieldmerge.js), against the cases shared with the Flutter app
// (tests/field-merge-cases.json), plus a few properties.   node unit-fieldmerge.mjs
import fs from 'node:fs';
import { mergeFields, stampFields, clampFields } from '../src/fieldmerge.js';
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + String(x) : ''}`); };
// key order does not matter
const canon = (v) => (Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v);
const same = (a, b) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));

const cases = JSON.parse(fs.readFileSync(new URL('./field-merge-cases.json', import.meta.url), 'utf8'));
for (const c of cases.merge) {
  const got = mergeFields(c.a, c.aAt, c.b, c.bAt);
  check('merge: ' + c.name, same(got, c.expect), JSON.stringify(got));
}
for (const c of cases.stamp) {
  const got = stampFields(c.prev, c.next, c.now);
  check('save: ' + c.name, same(got, c.expect), JSON.stringify(got));
}

// two devices, each saving its own edit, merged in either order: the same result
const base = { id: 'p1', name: 'Amox', price: 1000, reorder: 10, updatedAt: '2026-11-09T09:00:00Z' };
const a = stampFields(base, { ...base, price: 1200 }, '2026-11-09T10:00:00Z');
const b = stampFields(base, { ...base, reorder: 25 }, '2026-11-09T11:00:00Z');
const ab = mergeFields(mergeFields(base, base.updatedAt, a, a.updatedAt), '2026-11-09T10:00:00Z', b, b.updatedAt);
const ba = mergeFields(mergeFields(base, base.updatedAt, b, b.updatedAt), '2026-11-09T11:00:00Z', a, a.updatedAt);
check('both edits survive, whatever order they arrive in', ab.price === 1200 && ab.reorder === 25 && same(ab, ba), JSON.stringify([ab, ba]));
check('merging a copy with itself changes nothing', same(mergeFields(ab, ab.updatedAt, ab, ab.updatedAt), ab));
check('field times are capped at the record time (a clock running ahead)', clampFields({ id: 'x', _f: { a: '2030-01-01', b: '2020-01-01' } }, '2026-11-09')._f.a === '2026-11-09');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

// Device storage change detection (src/storage.js diff): every kind of change in one update becomes the right puts,
// deletes and outbox entries. 1.7 found that removing one record and adding another in the same table in one update
// (resuming one held sale while holding another) lost the removal.   node unit-diff.mjs
import { diff } from '../src/storage.js';
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + x : ''}`); };
const opts = { tables: ['drafts'], local: true };
const X = { id: 'x', updatedAt: '2026-01-01T00:00:00Z' }, Y = { id: 'y', updatedAt: '2026-01-01T00:00:01Z' }, Z = { id: 'z', updatedAt: '2026-01-01T00:00:02Z' };
const db = (rows, tomb = []) => ({ drafts: rows, _tomb: tomb });
const ids = (c) => ({ puts: c.puts.map((p) => p.rec.id).sort().join(','), dels: c.dels.map((d) => d.id).sort().join(','), ops: c.ops.map((o) => (o.deleted ? '-' : '+') + o.id).sort().join(',') });

let c = diff(db([X]), db([Y, ...[]], [{ t: 'drafts', id: 'x', at: 'T' }]), opts);
check('one removed and one added in the same update: both are kept', JSON.stringify(ids(c)) === JSON.stringify({ puts: 'y', dels: 'x', ops: '+y,-x' }), JSON.stringify(ids(c)));
check('…the removal is sent with its tombstone time', c.ops.find((o) => o.deleted)?.at === 'T');
c = diff(db([X, Y]), db([Y]), opts);
check('a plain removal', JSON.stringify(ids(c)) === JSON.stringify({ puts: '', dels: 'x', ops: '-x' }), JSON.stringify(ids(c)));
c = diff(db([X]), db([X, Y]), opts);
check('a plain addition', JSON.stringify(ids(c)) === JSON.stringify({ puts: 'y', dels: '', ops: '+y' }), JSON.stringify(ids(c)));
const X2 = { ...X, updatedAt: '2026-01-02T00:00:00Z' };
c = diff(db([X, Y]), db([X2, Y]), opts);
check('an edit is a put, not a removal', JSON.stringify(ids(c)) === JSON.stringify({ puts: 'x', dels: '', ops: '+x' }), JSON.stringify(ids(c)));
c = diff(db([X, Y]), db([X2, Z]), opts);
check('an edit, a removal and an addition together', JSON.stringify(ids(c)) === JSON.stringify({ puts: 'x,z', dels: 'y', ops: '+x,+z,-y' }), JSON.stringify(ids(c)));
const same = [X, Y];
c = diff(db(same), db(same), opts);
check('no change: nothing to write', !c.puts.length && !c.dels.length && !c.ops.length);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

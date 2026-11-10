// Document numbers (workplan step 7, src/docnumbers.js).   node unit-docnumbers.mjs
import { nextNumber, branchCode, formatNumber, DOC_KINDS, counterId } from '../src/docnumbers.js';
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + String(x) : ''}`); };
// the store's put (src/store.jsx), so the counter lands in d.counters as it would on a device
const put = (d, t, rec) => { const i = d[t].findIndex((x) => x.id === rec.id); if (i >= 0) d[t][i] = rec; else d[t].unshift(rec); return rec; };

check('a branch with a code uses it', branchCode({ name: 'Ntinda branch', code: 'ntd' }) === 'NTD');
check('…cleaned and at most 5', branchCode({ code: 'k-la 12345' }) === 'KLA12');
check('no code: the first three letters of the name', branchCode({ name: 'Main branch' }) === 'MAI' && branchCode({ name: 'Ötbo' }) === 'OTB');
check('no branch at all', branchCode(null) === 'BR');
check('the format', formatNumber('R', 'NTD', 3, 412) === 'R-NTD-03-000412' && formatNumber('PF', 'KLA', 123, 1234567) === 'PF-KLA-123-1234567');

const d = { counters: [] };
const ctx = { till: 3, branch: { name: 'Ntinda', code: 'NTD' } };
const a = nextNumber(d, put, 'R', ctx), b = nextNumber(d, put, 'R', ctx), p = nextNumber(d, put, 'PF', ctx);
check('receipts count up one by one', a === 'R-NTD-03-000001' && b === 'R-NTD-03-000002', `${a} ${b}`);
check('each kind counts on its own', p === 'PF-NTD-03-000001', p);
check('the count is kept in this till\'s counter record', d.counters.length === 1 && d.counters[0].id === counterId(3) && d.counters[0].R === 2 && d.counters[0].PF === 1);
const other = { counters: [] };
check('another till starts its own count (never the same number)', nextNumber(other, put, 'R', { till: 4, branch: ctx.branch }) === 'R-NTD-04-000001');
check('a device that downloads its counter again carries on', nextNumber({ counters: [{ id: 'till-3', till: 3, R: 41 }] }, put, 'R', ctx) === 'R-NTD-03-000042');
check('no till yet: the old style, nothing counted', /^R[0-9A-Z]{7}$/.test(nextNumber(d, put, 'R', {})) && d.counters[0].R === 2);
check('every kind the apps use', DOC_KINDS.join() === 'R,PF,GRN,PO,TR,SC,RT');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

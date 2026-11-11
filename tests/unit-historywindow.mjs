// The history window's keep rule (src/historywindow.js keeps): which records a device keeping recent history holds.
// Writes / checks the shared case file tests/window-cases.json that the Flutter app checks too
// (rxpos_flutter/test/rules/history_window_test.dart), so both apps keep exactly the same records.
//   node unit-historywindow.mjs [--write]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { keeps, isOpenItem, WINDOWED, pruneOf } from '../src/historywindow.js';

let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + x : ''}`); };
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const W = '2026-01-01';
check('a recent sale is kept', keeps('sales', { id: 's', total: 5, paid: 5, date: '2026-03-01' }, W));
check('an old paid sale is not', !keeps('sales', { id: 's', total: 5, paid: 5, date: '2025-03-01' }, W));
check('an old unpaid sale is an open item, kept', keeps('sales', { id: 's', total: 5, paid: 1, customerId: 'c', date: '2025-03-01' }, W) && isOpenItem('sales', { total: 5, paid: 1 }));
check('an old sale refunded since the window start is kept (its refund entry is new)', keeps('sales', { id: 's', total: 5, paid: 5, date: '2025-03-01', status: 'refunded', refundedAt: '2026-02-01' }, W));
check('an old movement is not kept', !keeps('movements', { id: 'm', productId: 'p', qty: 3, date: '2025-02-01' }, W));
check('medicines are always kept whole', keeps('products', { id: 'p', name: 'x', updatedAt: '2020-01-01' }, W) && !WINDOWED.has('products'));
check('no window: everything is kept', keeps('sales', { id: 's', total: 5, paid: 5, date: '2020-01-01' }, ''));

// what a device drops when its window moves forward (src/store.jsx pruneWindow)
{
  const db = { sales: [{ id: 'old', total: 5, paid: 5, date: '2025-03-01' }, { id: 'edited', total: 5, paid: 5, date: '2025-03-01' }, { id: 'new', total: 5, paid: 5, date: '2026-03-01' }],
    movements: [{ id: 'm', productId: 'p', qty: 1, date: '2026-02-01' }], products: [{ id: 'p', updatedAt: '2020-01-01' }] };
  const { tables, dels } = pruneOf(db, W, new Set(['sales|edited']));
  check('moving the window drops old settled records, never one with a change waiting to be sent', dels.map((d) => d.t + '|' + d.id).join() === 'sales|old' && tables.sales.map((r) => r.id).join() === 'edited,new', JSON.stringify(dels));
  check('…and leaves untouched tables out', !('movements' in tables) && !('products' in tables));
}

// the shared case file
const file = path.join(root, 'tests', 'window-cases.json');
const balance = JSON.parse(fs.readFileSync(path.join(root, 'tests', 'balance-cases.json'), 'utf8')).cases.map(({ t, rec }) => ({ t, rec }));
const extra = [
  { t: 'sales', rec: { id: 'w-unpaid', total: 9000, paid: 2000, customerId: 'c1', date: '2024-05-01T08:00:00.000Z', status: 'completed' } },
  { t: 'sales', rec: { id: 'w-insured', total: 9000, paid: 1000, date: '2024-05-01T08:00:00.000Z', status: 'completed', insurance: { insurerId: 'i1', share: 8000 } } },
  { t: 'purchases', rec: { id: 'w-owed', supplierId: 's1', total: 50000, paid: 10000, date: '2024-06-01' } },
  { t: 'purchases', rec: { id: 'w-paid', supplierId: 's1', total: 50000, paid: 50000, date: '2024-06-01' } },
  { t: 'salaryAdvances', rec: { id: 'w-adv-open', staffId: 'u1', amount: 20000, date: '2024-07-01' } },
  { t: 'salaryAdvances', rec: { id: 'w-adv-done', staffId: 'u1', amount: 20000, date: '2024-07-01', payrollId: 'pr1' } },
  { t: 'transfers', rec: { id: 'w-tr-transit', status: 'In transit', date: '2024-08-01' } },
  { t: 'transfers', rec: { id: 'w-tr-done', status: 'Received', date: '2024-08-01' } },
  { t: 'shifts', rec: { id: 'w-shift-open', startedAt: '2024-09-01T07:00:00.000Z' } },
  { t: 'shifts', rec: { id: 'w-shift-closed', startedAt: '2024-09-01T07:00:00.000Z', closedAt: '2024-09-01T19:00:00.000Z', status: 'closed' } },
  { t: 'audit', rec: { id: 'w-audit-old', date: '2024-01-01T00:00:00.000Z', action: 'x' } },
  { t: 'audit', rec: { id: 'w-audit-new', date: '2026-10-20T00:00:00.000Z', action: 'x' } },
  { t: 'messages', rec: { id: 'w-msg', at: '2024-02-02T00:00:00.000Z', text: 'x' } },
  { t: 'sales', rec: { id: 'w-nodate', total: 5, paid: 5 } },
  { t: 'products', rec: { id: 'w-product', name: 'x', updatedAt: '2020-01-01' } },
  { t: 'customers', rec: { id: 'w-customer', name: 'x', createdAt: '2020-01-01' } },
];
const windows = ['2025-06-01', '2026-01-01', '2026-10-01'];
const cases = { about: 'src/historywindow.js keeps(t, rec, W): whether a device with window start W holds the record (faster sync, stage 4). Made by tests/unit-historywindow.mjs --write.', windows,
  cases: [...balance, ...extra].map(({ t, rec }) => ({ t, rec, keeps: windows.map((w) => keeps(t, rec, w)) })) };
if (process.argv.includes('--write')) fs.writeFileSync(file, JSON.stringify(cases, null, 1) + '\n');
const kept = JSON.parse(fs.readFileSync(file, 'utf8'));
check('tests/window-cases.json matches the keep rule (shared with the Flutter app)', JSON.stringify(kept.cases.map((c) => kept.windows.map((w) => keeps(c.t, c.rec, w)))) === JSON.stringify(kept.cases.map((c) => c.keeps)), kept.cases.length + ' records');
check('the cases cover both kept and dropped records', kept.cases.some((c) => c.keeps.includes(false)) && kept.cases.some((c) => c.keeps.includes(true)));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

// From the SmarterPOS review (27 Nov 2026): batches sold below zero by two offline devices (src/oversold.js), the
// "asked for, we had none" notes behind Reorder (src/missed.js), and the website's contact form (worker contactText).
//   node tests/unit-shop-window.mjs
import { oversold, soldByText } from '../src/oversold.js';
import { missedNote, lostDemand, unstockedAsks } from '../src/missed.js';
import { contactText, CONTACT_PER_IP } from '../worker/index.js';
import { KNOWN_TABLES, TABLE_RULES } from '../worker/policy.js';
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + x : ''}`); };

// ---- oversold ----
const mv = (id, qty, type, date, extra = {}) => ({ id, productId: 'p1', batchId: 'b1', branchId: 'main', qty, type, date, ref: 'S-' + id, user: 'U' + id, ...extra });
const list = [mv(1, 10, 'Purchase', '2026-11-20T08:00'), mv(2, -6, 'Sale', '2026-11-26T09:00'), mv(3, -3, 'Sale', '2026-11-26T09:05'), mv(4, -4, 'Sale', '2026-11-26T09:06')];
const bal = (m) => (k) => m.filter((x) => (x.batchId || 'lb-' + x.productId) === k).reduce((a, x) => a + x.qty, 0);
const r = oversold(list, { since: '2026-11-20', balance: bal(list) });
check('a batch sold to -3 is found', r.length === 1 && r[0].balance === -3 && r[0].batchId === 'b1', JSON.stringify(r));
check('…with the sale that took it below zero and the one before', r[0].sales.map((s) => s.ref).join() === 'S-3,S-4' && r[0].sales[1].qty === 4, JSON.stringify(r[0].sales));
check('the names read as one line', soldByText(r[0].sales) === 'U3 (S-3) and U4 (S-4)');
check('older than the window: left to the stock count', oversold(list, { since: '2026-11-27', balance: bal(list) }).length === 0);
const fine = list.slice(0, 3);
check('a batch at or above zero is not flagged', oversold(fine, { balance: bal(fine) }).length === 0);
const adj = [...list.slice(0, 3), mv(5, -4, 'Adjustment', '2026-11-26T10:00')];
check('below zero by a hand adjustment, not a sale: not this alert', oversold(adj, { since: '2026-11-01', balance: bal(adj) }).length === 0);
const other = list.map((m) => ({ ...m, branchId: 'b2' }));
check('another branch is not this branch', oversold(other, { since: '2026-11-01', balance: bal(other) }).length === 0);
const loose = list.map((m) => ({ ...m, batchId: null }));
check('stock without a batch is checked too', oversold(loose, { since: '2026-11-01', balance: bal(loose) })[0]?.batchId === null);

// ---- missed sales ----
let threw = false; try { missedNote({ name: '  ' }); } catch { threw = true; }
check('a note needs a medicine or a typed name', threw);
const n1 = missedNote({ productId: 'p1', name: 'Amoxil', qty: 2, user: 'Ann' });
check('a note is dated and kept by branch', n1.productId === 'p1' && n1.qty === 2 && n1.branchId === 'main' && !!n1.date && !!n1.id);
const notes = [n1, { ...missedNote({ productId: 'p1' }), date: '2026-11-25T10:00:00Z' }, missedNote({ name: 'Ventolin inhaler' }), missedNote({ name: 'ventolin Inhaler ' }), { ...missedNote({ name: 'Old ask' }), date: '2020-01-01' }, missedNote({ name: 'Elsewhere', branchId: 'b2' })];
const d = lostDemand(notes, { since: '2026-11-01', branchId: 'main' });
check('asks for a stocked medicine add up', d.get('p1')?.times === 2 && d.get('p1')?.qty === 3, JSON.stringify(d.get('p1')));
check('typed names group regardless of case and spaces', d.get('name:ventolin inhaler')?.times === 2);
check('old asks and other branches are left out', !d.has('name:old ask') && !d.has('name:elsewhere'));
const un = unstockedAsks(notes, { since: '2026-11-01', branchId: 'main' });
check('not-stocked asks, most asked first', un.length === 1 && un[0].name.toLowerCase().includes('ventolin') && un[0].times === 2);
check('the cloud knows the table, and only sellers write it', KNOWN_TABLES.has('missedSales') && TABLE_RULES.missedSales.write.includes('pos.sell') && !TABLE_RULES.missedSales.delete.includes('pos.sell'));

// ---- contact form ----
const ok = contactText({ name: 'Grace', pharmacy: 'Kisenyi Pharmacy', phone: '0772 123 456', town: 'Kampala', branches: '2–3', message: 'Call after 5' });
check('a good enquiry becomes an email', !ok.error && ok.subject === 'RxPOS enquiry: Kisenyi Pharmacy' && /0772 123 456/.test(ok.text) && /Call after 5/.test(ok.text), JSON.stringify(ok));
check('no phone: refused', !!contactText({ name: 'Grace', pharmacy: 'Kisenyi', phone: 'abc' }).error);
check('no pharmacy: refused', !!contactText({ name: 'Grace', phone: '0772123456' }).error);
check('a bad email: refused', !!contactText({ name: 'Grace', pharmacy: 'Kisenyi', phone: '0772123456', email: 'nope' }).error);
check('the hidden robot field: quietly dropped', contactText({ name: 'Bot', pharmacy: 'Bot', phone: '0772123456', website: 'http://spam' }).error === 'spam');
const inj = contactText({ name: 'A\r\nBcc: x@y.z', pharmacy: 'P\u0000harm', phone: '0772123456' });
check('line breaks and control characters cannot reach the subject', !/[\r\n]/.test(inj.subject) && !inj.subject.includes('\u0000') && !/\r/.test(inj.text), JSON.stringify(inj));
check('long fields are cut', contactText({ name: 'N'.repeat(500), pharmacy: 'P'.repeat(500), phone: '0772123456' }).subject.length < 160);
check('a few messages an hour from one address', CONTACT_PER_IP > 0 && CONTACT_PER_IP <= 10);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

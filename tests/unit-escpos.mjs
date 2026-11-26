// Receipts straight to the thermal printer (src/escpos.js): the ESC/POS bytes, the drawer kick, line widths
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { receiptBytes, testPageBytes, drawerKick, columnsFor, ascii, wrap, twoCols, toBase64 } from '../src/escpos.js';
let passed = 0;
const ok = (n, fn) => { fn(); passed++; console.log('PASS ', n); };
const has = (bytes, seq) => { const b = [...bytes]; for (let i = 0; i <= b.length - seq.length; i++) if (seq.every((x, j) => b[i + j] === x)) return i; return -1; };
const text = (bytes) => Buffer.from(bytes).toString('latin1');
const fmt = (n) => 'UGX ' + Number(n).toLocaleString('en-US');
const sale = {
  number: 'R-000123', date: '2026-11-26T10:00:00Z', cashier: 'Amina', customerName: 'Walk-in Customer', payment: 'Cash',
  items: [
    { id: 1, name: 'Paracetamol 500mg tablets', qty: 20, price: 100, alloc: [{ batch: 'B12', expiry: '2027-06-30' }] },
    { id: 2, name: 'Amoxicillin 250mg capsules (a very long name that has to wrap on a narrow roll)', qty: 1, price: 6000, pack: { count: 1, name: 'Box', size: 21, price: 6000 }, directions: { dose: '1 cap', freq: '3 times a day', days: 7 } },
  ],
  subtotal: 8000, discount: 0, tax: 0, total: 8000, paid: 8000, tendered: 10000,
};
const settings = { name: 'City Care Pharmacy', phone: '0700 000000', tin: '1000', receiptFooter: 'Thank you. Get well soon!' };

ok('columns: 58 mm 32, 80 mm 48', () => { assert.equal(columnsFor(58), 32); assert.equal(columnsFor(80), 48); assert.equal(columnsFor(undefined), 48); });
ok('drawer kick: ESC p, pin 2 is m=0, pin 5 is m=1', () => {
  assert.deepEqual([...drawerKick()], [0x1b, 0x70, 0, 0x19, 0xfa]);
  assert.deepEqual([...drawerKick(5)], [0x1b, 0x70, 1, 0x19, 0xfa]);
});
ok('text is plain ASCII on the printer: × · — é and non-breaking spaces', () => {
  assert.equal(ascii('2 × Panadol · café — ok'), '2 x Panadol - cafe - ok');
  assert.equal(ascii('UGX 1,000'), 'UGX 1,000');
  assert.equal(ascii('漢'), '?');
});
ok('wrap keeps every line within the width, long words cut', () => {
  const lines = wrap('Supercalifragilisticexpialidocious syrup 100ml for the children', 12);
  assert.ok(lines.every((l) => l.length <= 12), lines.join('|'));
  assert.equal(lines.join('').replace(/\s/g, ''), 'Supercalifragilisticexpialidocioussyrup100mlforthechildren');
});
ok('two columns: the amount flush right on the last line', () => {
  const l = twoCols('A medicine with a rather long name indeed', 'UGX 12,000', 32);
  assert.ok(l.every((x) => x.length <= 32));
  assert.equal(l.at(-1).length, 32);
  assert.ok(l.at(-1).endsWith('UGX 12,000'));
});
for (const paper of [58, 80]) {
  ok(`a ${paper} mm receipt: reset first, every line fits, totals, change, footer, cut`, () => {
    const b = receiptBytes(sale, { settings, fmt, when: '26/11/2026 13:00', paper });
    assert.deepEqual([...b.slice(0, 2)], [0x1b, 0x40]);
    const t = text(b);
    for (const want of ['City Care', 'R-000123', 'Served by: Amina', 'Paracetamol 500mg', 'B/N B12', '1 cap 3 times a day for 7 days', 'TOTAL', 'UGX 8,000', 'Paid (Cash)', 'UGX 10,000', 'Change', 'UGX 2,000', 'Get well soon']) assert.ok(t.includes(want), `missing ${want}`);
    // printable runs between control codes never exceed the line (the big shop name is half as many characters)
    const W = columnsFor(paper);
    for (const run of t.split(/[\x00-\x1f]/)) assert.ok(run.length <= W + 2, `too long for ${paper} mm: "${run}"`); // eslint-disable-line no-control-regex
    assert.ok(has(b, [0x1d, 0x56, 66, 0]) > 0, 'cut');
    assert.equal(has(b, [0x1b, 0x70]), -1, 'no drawer kick unless asked');
  });
}
ok('a cash sale with the drawer on: the kick comes first, before the text', () => {
  const b = receiptBytes(sale, { settings, fmt, kick: 2 });
  assert.equal(has(b, [0x1b, 0x70, 0, 0x19, 0xfa]), 2);
  assert.equal(has(receiptBytes(sale, { settings, fmt, kick: 5 }), [0x1b, 0x70, 1]), 2);
});
ok('no cut when the printer has no cutter: paper fed instead', () => {
  assert.equal(has(receiptBytes(sale, { settings, fmt, cut: false }), [0x1d, 0x56]), -1);
});
ok('the receipt number as a CODE128 barcode', () => {
  const b = receiptBytes(sale, { settings, fmt });
  const i = has(b, [0x1d, 0x6b, 73]);
  assert.ok(i > 0);
  assert.equal(b[i + 3], 'R-000123'.length + 2);
  assert.equal(text(b.slice(i + 4, i + 4 + 10)), '{BR-000123');
});
ok('proforma, training, refund and insurance lines, as on the screen receipt', () => {
  assert.ok(text(receiptBytes({ ...sale, number: 'PF-0001' }, { settings, fmt })).includes('PROFORMA INVOICE'));
  assert.ok(!text(receiptBytes({ ...sale, number: 'PF-0001' }, { settings, fmt })).includes('Paid ('));
  assert.ok(text(receiptBytes({ ...sale, training: true }, { settings, fmt })).includes('TRAINING - NOT A SALE'));
  assert.ok(text(receiptBytes({ ...sale, status: 'refunded' }, { settings, fmt })).includes('REFUNDED'));
  const ins = text(receiptBytes({ ...sale, payment: 'Insurance', paid: 2000, insurance: { insurer: 'Jubilee', scheme: 'Gold', memberNo: 'J-9', share: 6000 } }, { settings, fmt }));
  assert.ok(ins.includes('Jubilee (Gold)') && ins.includes('Member no. J-9') && !ins.includes('Balance on credit'));
  assert.ok(text(receiptBytes({ ...sale, payment: 'Credit', paid: 0 }, { settings, fmt })).includes('Balance on credit'));
});
ok('kits: what the kit contains', () => {
  const kit = { id: 3, name: 'Malaria kit', qty: 1, price: 5000, kit: { components: [{ name: 'Coartem', qty: 1, per: 1 }] } };
  assert.ok(text(receiptBytes({ ...sale, items: [kit] }, { settings, fmt })).includes('KIT - Contains 1 x Coartem'));
});
ok('test page: the ruler is exactly one line, kick only when asked', () => {
  const t = text(testPageBytes({ paper: 58 }));
  assert.ok(t.includes('12345678901234567890123456789012\n'));
  assert.ok(!t.includes('123456789012345678901234567890123'));
  assert.equal(has(testPageBytes({ paper: 80 }), [0x1b, 0x70]), -1);
  assert.ok(has(testPageBytes({ paper: 80, kick: 2 }), [0x1b, 0x70, 0]) > 0);
});
ok('base64 for the Windows and Android bridges', () => {
  const b = receiptBytes(sale, { settings, fmt });
  assert.deepEqual([...Buffer.from(toBase64(b), 'base64')], [...b]);
});
ok('the Windows app: the page reaches the printer only through the two printer calls', () => {
  const pre = fs.readFileSync(new URL('../electron/preload.cjs', import.meta.url), 'utf8');
  assert.ok(pre.includes("invoke('rxpos:print-raw'") && pre.includes("invoke('rxpos:printers'"));
  const main = fs.readFileSync(new URL('../electron/main.cjs', import.meta.url), 'utf8');
  assert.ok(main.includes("require('./printer.cjs').register(ipcMain"));
});

// a network printer: a local TCP server stands in for the printer on port 9100
const net = await import('node:net');
const { createRequire } = await import('node:module');
const { sendNetwork } = createRequire(import.meta.url)('../electron/printer.cjs');
const got = [];
const server = net.createServer((s) => s.on('data', (d) => got.push(...d)));
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const bytes = receiptBytes(sale, { settings, fmt, kick: 2 });
await sendNetwork('127.0.0.1', server.address().port, Buffer.from(bytes));
await new Promise((r) => setTimeout(r, 100));
server.close();
assert.deepEqual(got, [...bytes]); passed++; console.log('PASS  network printer: every byte arrives, the drawer kick first');
await assert.rejects(sendNetwork('127.0.0.1', 1, Buffer.from([1])), /refused|reach/); passed++; console.log('PASS  network printer off: a message a cashier can act on');

console.log(`\n${passed} passed`);

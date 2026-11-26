// URA EFRIS fiscal receipts (src/efris.js, worker/efris.js): what a sale and a refund become, the encryption and
// signature checked against Node's own crypto, and the cloud's routes against a pretend URA that decrypts, checks the
// signature and answers as EFRIS does. Nothing reaches URA.
import assert from 'node:assert/strict';
import nodeCrypto from 'node:crypto';
import { createClient } from '@libsql/client';
import { d1FromLibsql } from '../worker/libsql-d1.js';
import { saleLines, invoiceFromSale, fiscalFromT109, keptOfInvoice, creditNoteFromInvoice, creditStatus, paymentMode, creditReason, eatTime, unfiscalised, creditsToDo, fiscalText, runEfrisQueue } from '../src/efris.js';
import { aesEncrypt, aesDecrypt, signContent, rsaDecrypt, pemToPkcs8, unb64, efrisRoutes, efrisUrl, EFRIS_URLS } from '../worker/efris.js';
import { decide } from '../worker/policy.js';

let passed = 0;
const ok = async (name, fn) => { await fn(); passed++; console.log('PASS ', name); };
const sum = (xs, f) => Math.round(xs.reduce((a, x) => a + Number(f(x)), 0) * 100) / 100;

const old = { id: 's1', number: 'R-1-00012', date: '2026-11-26T09:00:00.000Z', cashier: 'Amina', payment: 'Cash', items: [
  { id: 'p1', name: 'Paracetamol 500mg', qty: 20, price: 100 }, { id: 'p2', name: 'Amoxicillin 250mg', qty: 1, price: 3000 }],
  subtotal: 5000, discount: 500, tax: 810, total: 5310, paid: 5310, status: 'completed', customerName: 'Walk-in Customer' };
const perLine = { ...old, id: 's2', number: 'R-1-00013', taxRate: 18, items: [
  { id: 'p1', name: 'Paracetamol 500mg', qty: 20, price: 100, taxCategory: 'exempt', tax: 0 },
  { id: 'p3', name: 'Sunscreen', qty: 1, price: 3000, taxCategory: 'standard', tax: 486 }], tax: 486, total: 4986, paid: 4986 };

await ok('a sale from before per-item VAT: its VAT shared over the lines, adding up to what was charged', () => {
  const lines = saleLines(old);
  assert.equal(sum(lines, (l) => l.gross), 5310);
  assert.equal(sum(lines, (l) => l.tax), 810);
  assert.ok(lines.every((l) => l.category === 'standard' && l.rate === 0.18));
  assert.equal(saleLines({ ...old, tax: 0, total: 4500 })[0].category, 'exempt');
});
await ok('per-item VAT (src/tax.js): each line keeps its own category and VAT', () => {
  const lines = saleLines(perLine);
  assert.deepEqual(lines.map((l) => l.category), ['exempt', 'standard']);
  assert.deepEqual(lines.map((l) => l.tax), [0, 486]);
  assert.equal(sum(lines, (l) => l.gross), 4986);
});
await ok('a sale whose lines cannot make its total is refused, not sent', () => {
  assert.throws(() => saleLines({ ...old, total: 9000 }), /do not add up/);
});
const ctx = { tin: '1000000000', deviceNo: 'TCS-1', settings: { name: 'Kampala Pharmacy', taxRate: 18, currency: 'UGX' }, products: new Map([['p1', { id: 'p1', efrisCode: 'PARA500', efrisUnit: '102' }]]), unit: '101', category: '51101500' };
await ok('T109: goods, tax details and summary agree with each other and with the sale', () => {
  const inv = invoiceFromSale(perLine, ctx);
  assert.equal(inv.sellerDetails.referenceNo, 'R-1-00013');
  assert.equal(inv.sellerDetails.isCheckReferenceNo, '1');
  assert.equal(inv.basicInformation.invoiceType, '1');
  assert.equal(inv.basicInformation.invoiceKind, '2');
  assert.equal(inv.basicInformation.issuedDate, '2026-11-26 12:00:00'); // Uganda time
  assert.equal(inv.buyerDetails.buyerType, '1');
  const [a, b] = inv.goodsDetails;
  assert.equal(a.itemCode, 'PARA500'); assert.equal(a.unitOfMeasure, '102'); assert.equal(a.taxRate, '-'); assert.equal(b.taxRate, '0.18');
  assert.equal(b.itemCode, 'p3'); assert.equal(b.goodsCategoryId, '51101500');
  for (const g of inv.goodsDetails) assert.ok(Math.abs(Number(g.qty) * Number(g.unitPrice) - Number(g.total)) < 0.01, 'qty × unit price = total');
  assert.equal(inv.summary.grossAmount, '4986.00');
  assert.equal(inv.summary.taxAmount, '486.00');
  assert.equal(sum(inv.goodsDetails, (g) => g.total), 4986);
  assert.equal(sum(inv.taxDetails, (t) => t.grossAmount), 4986);
  assert.deepEqual(inv.taxDetails.map((t) => t.taxCategoryCode).sort(), ['01', '03']);
  assert.deepEqual(inv.payWay, [{ paymentMode: '102', paymentAmount: '4986.00', orderNumber: 'a' }]);
});
await ok('a business customer with a TIN gets a tax invoice; insurers and credit are paid "on credit"', () => {
  const inv = invoiceFromSale({ ...old, payment: 'Mobile Money', paid: 1000, insurance: { share: 4000 } }, { ...ctx, customer: { tin: '1002003004' } });
  assert.equal(inv.buyerDetails.buyerType, '0'); assert.equal(inv.buyerDetails.buyerTin, '1002003004'); assert.equal(inv.basicInformation.invoiceKind, '1');
  assert.deepEqual(inv.payWay.map((p) => [p.paymentMode, p.paymentAmount]), [['105', '1000.00'], ['101', '4310.00']]);
});
await ok('codes: payment modes, credit note reasons, Uganda time', () => {
  assert.equal(paymentMode('Cash'), '102'); assert.equal(paymentMode('MTN MoMo'), '105'); assert.equal(paymentMode('Visa card'), '106'); assert.equal(paymentMode('Bank transfer'), '107');
  assert.equal(creditReason('Expired'), '101'); assert.equal(creditReason('wrong price'), '103'); assert.equal(creditReason(''), '102');
  assert.equal(eatTime('2026-01-01T22:30:00Z'), '2026-01-02 01:30:00');
});
const answer = { basicInformation: { invoiceNo: '320011223344', invoiceId: '998877', antifakeCode: '12345678901234567890', deviceNo: 'TCS-1', issuedDate: '26/11/2026 12:00:00' }, summary: { qrCode: '0200000000...QR' } };
await ok('the receipt carries the FDN, verification code, device number and QR', () => {
  const f = fiscalFromT109(answer);
  assert.deepEqual([f.fdn, f.code, f.qr, f.invoiceId], ['320011223344', '12345678901234567890', '0200000000...QR', '998877']);
  assert.deepEqual(fiscalText({ ...f, status: 'issued' }), ['FDN: 320011223344', 'Verification code: 12345678901234567890', 'Device no: TCS-1']);
  assert.throws(() => fiscalFromT109({ basicInformation: {} }), /fiscal document number/);
});
await ok('T110: the credit note is the issued receipt with every amount negative', () => {
  const inv = invoiceFromSale(perLine, ctx);
  const cn = creditNoteFromInvoice({ fdn: '320011223344', invoiceId: '998877', sent: keptOfInvoice(inv), saleNumber: 'R-1-00013' }, { reason: 'Expired on the shelf', by: 'Amina', at: '2026-11-26T10:00:00Z' });
  assert.equal(cn.oriInvoiceNo, '320011223344'); assert.equal(cn.oriInvoiceId, '998877'); assert.equal(cn.reasonCode, '101'); assert.equal(cn.invoiceApplyCategoryCode, '101');
  assert.equal(cn.sellersReferenceNo, 'CN-R-1-00013');
  assert.ok(cn.goodsDetails.every((g) => Number(g.qty) < 0 && Number(g.total) <= 0));
  assert.equal(cn.summary.grossAmount, '-4986.00');
  assert.deepEqual(cn.goodsDetails.map((g) => g.orderNumber), inv.goodsDetails.map((g) => g.orderNumber));
  assert.throws(() => creditNoteFromInvoice({}, {}), /no fiscal receipt/);
});
await ok('T111: approved, waiting, rejected', () => {
  assert.deepEqual(creditStatus({ records: [{ referenceNo: '77', approveStatus: '101', invoiceNo: '320099' }] }, '77').fdn, '320099');
  assert.equal(creditStatus({ records: [{ referenceNo: '77', approveStatus: '102' }] }, '77').status, 'pending');
  assert.equal(creditStatus({ records: [{ referenceNo: '77', approveStatus: '103' }] }, '77').status, 'rejected');
});

// ----- crypto, against Node's own ---------------------------------------------------------------------------------
const { privateKey, publicKey } = nodeCrypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const pem = privateKey.export({ type: 'pkcs8', format: 'pem' });
const pkcs1 = privateKey.export({ type: 'pkcs1', format: 'pem' });
const env = { EFRIS_TIN: '1000000000', EFRIS_DEVICE_NO: 'TCS-1', EFRIS_PRIVATE_KEY: pem, __tenant: 't1' };
const aes = nodeCrypto.randomBytes(16);
await ok('AES-ECB (PKCS#7) made from WebCrypto matches Node, both ways, any length', async () => {
  for (const text of ['', 'x', '0123456789abcdef', JSON.stringify(invoiceFromSale(perLine, ctx))]) {
    const mine = await aesEncrypt(aes, text);
    const c = nodeCrypto.createCipheriv('aes-128-ecb', aes, null);
    assert.equal(mine, Buffer.concat([c.update(text, 'utf8'), c.final()]).toString('base64'));
    assert.equal(await aesDecrypt(aes, unb64(mine)), text);
  }
});
await ok('the signature is SHA1withRSA over the base64 content; PKCS#1 keys are read too', async () => {
  const sig = await signContent(env, 'aGVsbG8=');
  assert.ok(nodeCrypto.verify('sha1', Buffer.from('aGVsbG8='), publicKey, Buffer.from(sig, 'base64')));
  assert.deepEqual(Buffer.from(pemToPkcs8(pkcs1)), privateKey.export({ type: 'pkcs8', format: 'der' }));
  const sig1 = await signContent({ ...env, EFRIS_PRIVATE_KEY: pkcs1, __tenant: 't-pkcs1' }, 'aGVsbG8=');
  assert.equal(sig1, sig);
});
await ok('the key URA sends (RSA PKCS#1 v1.5) is decrypted', async () => {
  const wrapped = nodeCrypto.publicEncrypt({ key: publicKey, padding: nodeCrypto.constants.RSA_PKCS1_PADDING }, Buffer.from('secret-key-text'));
  assert.equal(Buffer.from(await rsaDecrypt(env, wrapped)).toString(), 'secret-key-text');
});
await ok('test and production addresses', () => {
  assert.equal(efrisUrl({}), EFRIS_URLS.test);
  assert.equal(efrisUrl({ EFRIS_ENV: 'production' }), EFRIS_URLS.production);
  assert.equal(efrisUrl({ EFRIS_URL: 'http://localhost:9880/efristcs/ws/tcsapp/getInformation' }), 'http://localhost:9880/efristcs/ws/tcsapp/getInformation');
});

// ----- the routes, against a pretend URA ------------------------------------------------------------------------------
function fakeUra() {
  const seen = { calls: [], byRef: new Map(), apps: new Map() };
  const ura = async (url, init) => {
    const req = JSON.parse(init.body);
    const code = req.globalInfo.interfaceCode;
    seen.calls.push(code);
    const reply = (content, rc = '00', msg = 'SUCCESS') => {
      const text = content == null ? '' : JSON.stringify(content);
      const c = nodeCrypto.createCipheriv('aes-128-ecb', aes, null);
      const body = content == null ? '' : code === 'T104' ? Buffer.from(text).toString('base64') : Buffer.concat([c.update(text), c.final()]).toString('base64');
      return new Response(JSON.stringify({ data: { content: body, signature: '', dataDescription: { codeType: code === 'T104' ? '0' : '1', encryptCode: '2', zipCode: '0' } }, globalInfo: req.globalInfo, returnStateInfo: { returnCode: rc, returnMessage: msg } }));
    };
    assert.equal(req.globalInfo.appId, 'AP04'); assert.equal(req.globalInfo.tin, '1000000000'); assert.equal(req.globalInfo.deviceNo, 'TCS-1');
    if (code === 'T104') {
      // URA's way: the key, base64, encrypted with the pharmacy's public key
      return reply({ passowrdDes: nodeCrypto.publicEncrypt({ key: publicKey, padding: nodeCrypto.constants.RSA_PKCS1_PADDING }, Buffer.from(aes.toString('base64'))).toString('base64'), sign: '' });
    }
    assert.ok(nodeCrypto.verify('sha1', Buffer.from(req.data.content), publicKey, Buffer.from(req.data.signature, 'base64')), 'signed');
    const d = nodeCrypto.createDecipheriv('aes-128-ecb', aes, null);
    const content = JSON.parse(Buffer.concat([d.update(Buffer.from(req.data.content, 'base64')), d.final()]).toString());
    if (code === 'T109') {
      const ref = content.sellerDetails.referenceNo;
      if (seen.byRef.has(ref)) return reply(null, '2253', `sellerDetails-->referenceNo:'${ref}' already exists!`);
      const inv = { ...answer, basicInformation: { ...answer.basicInformation, invoiceNo: '32001' + (seen.byRef.size + 1) } };
      seen.byRef.set(ref, inv);
      return reply(inv);
    }
    if (code === 'T106') return reply({ records: [...seen.byRef].filter(([r]) => r === content.referenceNo).map(([r, inv]) => ({ referenceNo: r, invoiceNo: inv.basicInformation.invoiceNo })) });
    if (code === 'T108') return reply([...seen.byRef.values()].find((i) => i.basicInformation.invoiceNo === content.invoiceNo));
    if (code === 'T110') { assert.equal(content.summary.grossAmount, '-5310.00'); seen.apps.set('REF77', '102'); return reply({ referenceNo: 'REF77' }); }
    if (code === 'T111') return reply({ records: [{ referenceNo: content.referenceNo, approveStatus: seen.apps.get(content.referenceNo), invoiceNo: '320077' }] });
    return reply(null, '01', 'Interface coding error');
  };
  return { ura, seen };
}
const db = createClient({ url: ':memory:' });
await db.execute('CREATE TABLE records (tenant TEXT, k TEXT, t TEXT, id TEXT, rec TEXT, deleted INTEGER DEFAULT 0, at TEXT, origin TEXT, seq INTEGER, PRIMARY KEY (tenant, k))');
const D1 = { DB: d1FromLibsql(db) };
const put = (t, id, rec) => db.execute({ sql: 'INSERT OR REPLACE INTO records (tenant, k, t, id, rec, deleted, at) VALUES (?, ?, ?, ?, ?, 0, ?)', args: ['t1', t + '|' + id, t, id, JSON.stringify({ ...rec, id }), new Date().toISOString()] });
const write = async (_env, tenant, items) => { for (const i of items) await put(i.t, i.id, i.rec); };
const json = (body, status = 200) => ({ status, body });
const who = { tenant: 't1', role: 'cashier' };
const route = (path, body, { perms = ['pos.sell', 'sales.refund', 'settings.manage'], penv = env, fetcher } = {}) => efrisRoutes(D1, path, body, who, penv, { json, write, can: async (p) => perms.includes(p), fetcher });
await put('settings', 'settings', { name: 'Kampala Pharmacy', taxRate: 18, efrisOn: true });
await put('sales', 's1', old);

await ok('a sale is fiscalised once: asked again, the cloud answers with the same receipt and URA is not called', async () => {
  const { ura, seen } = fakeUra();
  const r = await route('/api/efris/sale', { id: 's1' }, { fetcher: ura });
  assert.equal(r.status, 200); assert.equal(r.body.fiscal.status, 'issued'); assert.equal(r.body.fiscal.fdn, '320011');
  assert.deepEqual(seen.calls, ['T104', 'T109']);
  const again = await route('/api/efris/sale', { id: 's1' }, { fetcher: ura });
  assert.equal(again.body.fiscal.fdn, '320011'); assert.deepEqual(seen.calls, ['T104', 'T109']);
});
await ok('a receipt URA already has (an answer lost on the way) is looked up, not issued twice', async () => {
  const { ura, seen } = fakeUra();
  await put('sales', 's3', { ...old, id: 's3', number: 'R-1-00099' });
  await route('/api/efris/sale', { id: 's3' }, { fetcher: ura });
  await db.execute({ sql: 'DELETE FROM records WHERE k = ?', args: ['fiscal|s3'] }); // as if the cloud never heard back
  const r = await route('/api/efris/sale', { id: 's3' }, { fetcher: ura });
  assert.equal(r.body.fiscal.fdn, '320011');
  assert.deepEqual(seen.calls.slice(-3), ['T109', 'T106', 'T108']);
  assert.equal(seen.byRef.size, 1);
});
await ok('a sale not yet in the cloud waits (409); URA down is tried again later and nothing is kept', async () => {
  const r = await route('/api/efris/sale', { id: 'nope' }, { fetcher: fakeUra().ura });
  assert.equal(r.status, 409);
  await put('sales', 's4', { ...old, id: 's4', number: 'R-1-00100' });
  const down = await route('/api/efris/sale', { id: 's4' }, { fetcher: async () => { throw new Error('ECONNRESET'); } });
  assert.equal(down.status, 503); assert.equal(down.body.retry, true);
  assert.equal((await db.execute({ sql: 'SELECT COUNT(*) n FROM records WHERE k = ?', args: ['fiscal|s4'] })).rows[0].n, 0);
});
await ok('only staff who sell may fiscalise; switched off in Settings, nothing is sent', async () => {
  const { ura, seen } = fakeUra();
  assert.equal((await route('/api/efris/sale', { id: 's4' }, { fetcher: ura, perms: [] })).status, 403);
  await put('settings', 'settings', { name: 'Kampala Pharmacy', efrisOn: false });
  assert.equal((await route('/api/efris/sale', { id: 's4' }, { fetcher: ura })).status, 400);
  await put('settings', 'settings', { name: 'Kampala Pharmacy', taxRate: 18, efrisOn: true });
  assert.equal(seen.calls.length, 0);
  assert.equal((await route('/api/efris/sale', { id: 's4' }, { penv: {} })).status, 400); // no keys
});
await ok('a refund becomes a credit note application, then its approved number is fetched', async () => {
  const { ura, seen } = fakeUra();
  await put('sales', 's1', { ...old, status: 'refunded', refundReason: 'Customer changed mind', refundedBy: 'Amina', refundedAt: '2026-11-26T10:00:00Z' });
  const a = await route('/api/efris/refund', { id: 's1' }, { fetcher: ura });
  assert.equal(a.body.fiscal.creditNote.status, 'pending'); assert.equal(a.body.fiscal.creditNote.referenceNo, 'REF77');
  const twice = await route('/api/efris/refund', { id: 's1' }, { fetcher: ura });
  assert.equal(twice.body.fiscal.creditNote.referenceNo, 'REF77'); assert.equal(seen.calls.filter((c) => c === 'T110').length, 1);
  assert.equal((await route('/api/efris/credit', { id: 's1' }, { fetcher: ura })).body.fiscal.creditNote.status, 'pending');
  seen.apps.set('REF77', '101');
  const done = await route('/api/efris/credit', { id: 's1' }, { fetcher: ura });
  assert.equal(done.body.fiscal.creditNote.status, 'approved'); assert.equal(done.body.fiscal.creditNote.fdn, '320077');
});
await ok('devices can never write a fiscal receipt themselves (the cloud does)', async () => {
  const r = await decide({ t: 'fiscal', id: 's1', rec: { fdn: 'fake' } }, null, 'manager', async () => true);
  assert.equal(r.ok, false);
});

// ----- the app's queue -------------------------------------------------------------------------------------------------
await ok('the queue: sales since EFRIS was switched on, failed ones again after 6 hours, then credit notes', async () => {
  const now = Date.parse('2026-11-26T12:00:00Z');
  const base = { settings: { efrisOn: true, efrisFrom: '2026-11-26T08:00:00Z' }, sales: [
    { id: 'a', number: 'R1', date: '2026-11-26T09:00:00Z' }, { id: 'b', number: 'R2', date: '2026-11-26T07:00:00Z' }, { id: 'c', number: 'T', date: '2026-11-26T09:00:00Z', training: true },
    { id: 'd', number: 'R3', date: '2026-11-26T09:00:00Z' }, { id: 'e', number: 'R4', date: '2026-11-26T09:00:00Z', status: 'refunded' }],
  fiscal: [{ id: 'd', status: 'failed', lastTry: '2026-11-26T11:00:00Z' }, { id: 'e', status: 'issued', fdn: '1' }] };
  assert.deepEqual(unfiscalised(base, { now }).map((x) => x.id), ['a']);
  assert.deepEqual(unfiscalised(base, { now: now + 7 * 3600e3 }).map((x) => x.id).sort(), ['a', 'd']);
  assert.deepEqual(creditsToDo(base, { now }).apply.map((x) => x.id), ['e']);
  assert.deepEqual(unfiscalised({ ...base, settings: {} }, { now }), []);
  const asked = [];
  const api = { efrisSale: async (_c, id) => { asked.push('sale ' + id); return { fiscal: {} }; }, efrisRefund: async (_c, id) => { asked.push('refund ' + id); return { fiscal: {} }; }, efrisCredit: async () => ({}) };
  const n = await runEfrisQueue({ db: { ...base, sales: base.sales.map((s) => ({ ...s, date: new Date().toISOString() })) }, syncCfg: { url: 'x' }, can: () => true, api });
  assert.ok(n >= 2); assert.ok(asked.includes('refund e'));
  // the cloud or URA cannot be reached: the pass stops at once
  const stop = []; await runEfrisQueue({ db: { ...base, sales: base.sales.map((s) => ({ ...s, date: new Date().toISOString() })) }, syncCfg: { url: 'x' }, can: () => true, api: { ...api, efrisSale: async (_c, id) => { stop.push(id); throw new Error('No internet connection right now.'); } } });
  assert.equal(stop.length, 1);
});
console.log(`\n${passed} passed, 0 failed`);

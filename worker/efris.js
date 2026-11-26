// URA EFRIS, the cloud's side: signs, encrypts and sends to URA what src/efris.js builds, and keeps each sale's fiscal
// receipt in the synced table `fiscal` (one record per sale, id = the sale's id), which only the cloud writes.
//
// Why the cloud: the pharmacy's EFRIS private key never sits on a till, every till (Windows, Android, web) gets the
// same fiscal receipt, and a sale made offline is fiscalised when its till is back online (the app's queue). A
// pharmacy hub (server/hub.mjs) runs this same code; pointed at URA's Offline Mode Enabler (EFRIS_URL) it fiscalises
// through the enabler on the shop's own network.
//
// Keys per pharmacy (Owner console → Payments & keys; the main pharmacy uses Worker secrets of the same names):
//   EFRIS_TIN, EFRIS_DEVICE_NO        the TIN and the EFRIS device number URA gave for this system
//   EFRIS_PRIVATE_KEY                 the private key of the key pair registered on the EFRIS portal (PEM)
//   EFRIS_ENV                         test (default) or production
//   EFRIS_URL                         optional: another address (URA's Offline Mode Enabler on a hub)
//   EFRIS_LEGAL_NAME, EFRIS_BRN       optional: the name and BRN exactly as registered with URA
//   EFRIS_UNIT, EFRIS_CATEGORY        optional: default unit of measure and commodity category for medicines
//
// The protocol (URA "Interface Design for System-to-System", interfaces T101–T135): every call is one JSON envelope
// POSTed to getInformation. T104 hands out a symmetric (AES) key, encrypted with our public key; every other call's
// content is that JSON, AES-ECB encrypted (PKCS#7), base64, and signed SHA1withRSA with our private key.
// Everything here uses WebCrypto only, so it runs in Cloudflare Workers and in Node (the hub) alike.

import { invoiceFromSale, fiscalFromT109, keptOfInvoice, creditNoteFromInvoice, creditStatus, eatTime } from '../src/efris.js';

export const EFRIS_FIELDS = ['EFRIS_TIN', 'EFRIS_DEVICE_NO', 'EFRIS_PRIVATE_KEY', 'EFRIS_ENV', 'EFRIS_URL', 'EFRIS_LEGAL_NAME', 'EFRIS_BRN', 'EFRIS_UNIT', 'EFRIS_CATEGORY'];
export const EFRIS_URLS = {
  test: 'https://efristest.ura.go.ug/efrisws/ws/taapp/getInformation',
  production: 'https://efrisws.ura.go.ug/ws/taapp/getInformation',
};
export const efrisReady = (env) => !!(env?.EFRIS_TIN && env?.EFRIS_DEVICE_NO && env?.EFRIS_PRIVATE_KEY);
export const efrisUrl = (env) => env.EFRIS_URL || (env.EFRIS_ENV === 'production' ? EFRIS_URLS.production : EFRIS_URLS.test);

// ----- bytes ---------------------------------------------------------------------------------------------------------
const enc = new TextEncoder(), dec = new TextDecoder();
export const b64 = (bytes) => { let s = ''; const u = new Uint8Array(bytes); for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };
export const unb64 = (text) => Uint8Array.from(atob(String(text).replace(/\s+/g, '')), (c) => c.charCodeAt(0));
const unb64url = (t) => unb64(t.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (t.length % 4)) % 4));

// ----- the private key -----------------------------------------------------------------------------------------------
// PKCS#8 ("BEGIN PRIVATE KEY") as `openssl pkcs12 -in key.p12 -nocerts -nodes` gives it, or PKCS#1 ("BEGIN RSA
// PRIVATE KEY"), which is wrapped into PKCS#8 here.
function derLen(n) { if (n < 128) return [n]; const b = []; while (n) { b.unshift(n & 255); n >>= 8; } return [0x80 | b.length, ...b]; }
const der = (tag, body) => new Uint8Array([tag, ...derLen(body.length), ...body]);
export function pemToPkcs8(pem) {
  const text = String(pem || '');
  const body = unb64(text.replace(/-----[^-]+-----/g, ''));
  if (!/BEGIN RSA PRIVATE KEY/.test(text)) return body;
  const algo = [0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00]; // rsaEncryption, NULL
  return der(0x30, [0x02, 0x01, 0x00, ...algo, ...der(0x04, body)]);
}
const keys = new Map(); // tenant → { pem, sign, n, d }
async function privateKey(env) {
  const id = env.__tenant || 'main';
  const have = keys.get(id);
  if (have && have.pem === env.EFRIS_PRIVATE_KEY) return have;
  let sign;
  try { sign = await crypto.subtle.importKey('pkcs8', pemToPkcs8(env.EFRIS_PRIVATE_KEY), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-1' }, true, ['sign']); }
  catch { throw new EfrisError('The EFRIS private key could not be read. Paste the PEM text of the key (see the setup notes).', 'key'); }
  const jwk = await crypto.subtle.exportKey('jwk', sign);
  const big = (t) => BigInt('0x' + [...unb64url(t)].map((x) => x.toString(16).padStart(2, '0')).join(''));
  const k = { pem: env.EFRIS_PRIVATE_KEY, sign, n: big(jwk.n), d: big(jwk.d), bytes: unb64url(jwk.n).length };
  keys.set(id, k);
  return k;
}
export async function signContent(env, text) {
  const k = await privateKey(env);
  return b64(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', k.sign, enc.encode(text)));
}
/** RSA PKCS#1 v1.5 decryption (T104's key comes this way; WebCrypto has only OAEP), done with BigInt */
export async function rsaDecrypt(env, bytes) {
  const k = await privateKey(env);
  let c = 0n; for (const x of bytes) c = (c << 8n) | BigInt(x);
  let m = 1n, b = c % k.n, e = k.d;
  while (e > 0n) { if (e & 1n) m = (m * b) % k.n; b = (b * b) % k.n; e >>= 1n; }
  const out = new Uint8Array(k.bytes);
  for (let i = k.bytes - 1; i >= 0; i--) { out[i] = Number(m & 255n); m >>= 8n; }
  if (out[0] !== 0 || out[1] !== 2) throw new EfrisError('EFRIS sent a key that does not match this pharmacy\'s private key', 'key');
  const zero = out.indexOf(0, 2);
  if (zero < 10) throw new EfrisError('EFRIS sent a key that does not match this pharmacy\'s private key', 'key');
  return out.slice(zero + 1);
}

// ----- AES-ECB with PKCS#7, made from WebCrypto's AES-CBC ------------------------------------------------------------
// ECB is each block on its own: CBC with a zero IV over one block is exactly that block's ECB (plus a padding block,
// dropped). Decrypting: CBC decryption of the whole text gives each block XOR the block before, so XOR that back; one
// extra block (the encryption of a full padding block XOR the last block) makes CBC's own padding check pass.
const ZERO = new Uint8Array(16);
const aesKey = (raw, use) => crypto.subtle.importKey('raw', raw, 'AES-CBC', false, [use]);
async function ecbBlocks(raw, blocks) {
  const k = await aesKey(raw, 'encrypt');
  const out = new Uint8Array(blocks.length);
  for (let i = 0; i < blocks.length; i += 16) out.set(new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-CBC', iv: ZERO }, k, blocks.subarray(i, i + 16))).subarray(0, 16), i);
  return out;
}
export async function aesEncrypt(raw, text) {
  const data = enc.encode(text), pad = 16 - (data.length % 16);
  const padded = new Uint8Array(data.length + pad); padded.set(data); padded.fill(pad, data.length);
  return b64(await ecbBlocks(raw, padded));
}
export async function aesDecrypt(raw, cipher) {
  if (!cipher.length || cipher.length % 16) throw new EfrisError('EFRIS sent an answer that could not be read (length)', 'reply');
  const last = cipher.subarray(cipher.length - 16), fake = new Uint8Array(16);
  for (let i = 0; i < 16; i++) fake[i] = 16 ^ last[i];
  const extra = await ecbBlocks(raw, fake);
  const all = new Uint8Array(cipher.length + 16); all.set(cipher); all.set(extra, cipher.length);
  const cbc = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-CBC', iv: ZERO }, await aesKey(raw, 'decrypt'), all));
  for (let i = 16; i < cbc.length; i++) cbc[i] ^= cipher[i - 16];
  const pad = cbc[cbc.length - 1];
  if (pad < 1 || pad > 16) throw new EfrisError('EFRIS sent an answer that could not be read (padding)', 'reply');
  return dec.decode(cbc.subarray(0, cbc.length - pad));
}

// ----- the envelope --------------------------------------------------------------------------------------------------
export class EfrisError extends Error {
  constructor(message, kind = 'refused', code = '') { super(message); this.kind = kind; this.code = code; }
}
/** URA's numbers for "this receipt number was already sent" (then the receipt already exists and is looked up) */
const DUPLICATE = /already|duplicate|exist/i;

function globalInfo(env, interfaceCode, operator = 'RxPOS') {
  return {
    appId: 'AP04', version: '1.1.20191201', dataExchangeId: crypto.randomUUID().replace(/-/g, '').toUpperCase(), interfaceCode,
    requestCode: 'TP', requestTime: eatTime(), responseCode: 'TA', userName: 'admin', deviceMAC: 'FFFFFFFFFFFF',
    deviceNo: env.EFRIS_DEVICE_NO, tin: env.EFRIS_TIN, brn: env.EFRIS_BRN || '', taxpayerID: '1', longitude: '32.5825', latitude: '0.3476',
    agentType: '0', extendField: { responseDateFormat: 'dd/MM/yyyy', responseTimeFormat: 'dd/MM/yyyy HH:mm:ss', referenceNo: '', operatorName: String(operator).slice(0, 100) },
  };
}

async function post(env, envelope, fetcher) {
  let r;
  try { r = await fetcher(efrisUrl(env), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(envelope), signal: AbortSignal.timeout?.(25000) }); }
  catch (e) { throw new EfrisError('EFRIS could not be reached: ' + (e?.message || e), 'network'); }
  if (!r.ok) throw new EfrisError(`EFRIS answered HTTP ${r.status}`, r.status >= 500 ? 'network' : 'refused');
  try { return await r.json(); } catch { throw new EfrisError('EFRIS sent an answer that is not JSON', 'network'); }
}

async function unzip(bytes) {
  const s = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}

async function readContent(data, key) {
  const text = data?.content;
  if (!text) return null;
  const d = data.dataDescription || {};
  let bytes = unb64(text);
  if (String(d.zipCode) === '1') bytes = await unzip(bytes);
  const json = String(d.codeType) === '1' ? await aesDecrypt(key, bytes) : dec.decode(bytes);
  try { return JSON.parse(json); } catch { throw new EfrisError('EFRIS sent content that is not JSON', 'reply'); }
}

const stateOf = (res) => res?.returnStateInfo || res?.globalInfo?.returnStateInfo || {};
function check(res, what) {
  const st = stateOf(res);
  const code = String(st.returnCode ?? '');
  if (code === '00' || (!code && /success/i.test(st.returnMessage || ''))) return;
  const msg = String(st.returnMessage || 'no reason given');
  // 28: the clock is more than 10 minutes off; 99: URA's own error. Both are worth trying again later.
  throw new EfrisError(`EFRIS refused the ${what}: ${msg}${code ? ` (code ${code})` : ''}`, code === '99' || code === '28' ? 'network' : 'refused', code);
}

const symKeys = new Map(); // tenant → { raw, at, pem }
const KEY_HOURS = 20; // URA's key is good for a day; fetched again well before
async function symmetricKey(env, fetcher, fresh = false) {
  const id = env.__tenant || 'main';
  const have = symKeys.get(id);
  if (!fresh && have && have.pem === env.EFRIS_PRIVATE_KEY && have.url === efrisUrl(env) && Date.now() - have.at < KEY_HOURS * 3600e3) return have.raw;
  const res = await post(env, { data: { content: '', signature: '', dataDescription: { codeType: '0', encryptCode: '1', zipCode: '0' } }, globalInfo: globalInfo(env, 'T104'), returnStateInfo: { returnCode: '', returnMessage: '' } }, fetcher);
  check(res, 'sign-in (T104)');
  const content = await readContent(res.data, null);
  const wrapped = content?.passowrdDes || content?.passwordDes;
  if (!wrapped) throw new EfrisError('EFRIS sent no key (T104)', 'reply');
  const plain = await rsaDecrypt(env, unb64(wrapped));
  // the key comes base64-encoded inside; an 8-byte key is doubled to 16 (as URA's own clients do)
  let raw;
  try { raw = unb64(dec.decode(plain)); } catch { raw = plain; }
  if (!raw.length) raw = plain;
  if (raw.length === 8) raw = new Uint8Array([...raw, ...raw]);
  if (![16, 24, 32].includes(raw.length)) raw = raw.slice(0, 16);
  symKeys.set(id, { raw, at: Date.now(), pem: env.EFRIS_PRIVATE_KEY, url: efrisUrl(env) });
  return raw;
}

/** One encrypted call: content in, URA's decrypted content out */
export async function efrisCall(env, interfaceCode, content, { fetcher = fetch, operator, what = interfaceCode } = {}) {
  for (let attempt = 0; ; attempt++) {
    const key = await symmetricKey(env, fetcher, attempt > 0);
    const body = await aesEncrypt(key, JSON.stringify(content));
    const envelope = {
      data: { content: body, signature: await signContent(env, body), dataDescription: { codeType: '1', encryptCode: '2', zipCode: '0' } },
      globalInfo: globalInfo(env, interfaceCode, operator), returnStateInfo: { returnCode: '', returnMessage: '' },
    };
    const res = await post(env, envelope, fetcher);
    try { check(res, what); }
    catch (e) {
      // 02/03: the encryption did not match (URA's key changed): fetch a fresh key and try once more
      if (attempt === 0 && ['02', '03'].includes(e.code)) continue;
      throw e;
    }
    return readContent(res.data, key);
  }
}

/** T101 server time and T104 key: proves the TIN, device number and private key are right */
export async function efrisTest(env, { fetcher = fetch } = {}) {
  const res = await post(env, { data: { content: '', signature: '', dataDescription: { codeType: '0', encryptCode: '1', zipCode: '0' } }, globalInfo: globalInfo(env, 'T101'), returnStateInfo: { returnCode: '', returnMessage: '' } }, fetcher);
  check(res, 'time check (T101)');
  const time = (await readContent(res.data, null))?.currentTime || '';
  symKeys.delete(env.__tenant || 'main');
  await symmetricKey(env, fetcher, true);
  return { ok: true, serverTime: time, env: env.EFRIS_URL ? 'custom' : env.EFRIS_ENV === 'production' ? 'production' : 'test' };
}

// ----- the routes ----------------------------------------------------------------------------------------------------
// /api/efris/sale    { id }          fiscalise one sale (from the cloud's own copy of it), or return the receipt it has
// /api/efris/refund  { id }          apply for the credit note of a refunded, fiscalised sale
// /api/efris/credit  { id }          ask URA whether that credit note is approved
// /api/efris/test                    check the keys (settings)
// Answers { fiscal } (the sale's fiscal record) or { error }. A sale not yet in the cloud answers 409: the till
// sends it first (sync) and asks again.

const parse = (row) => { try { return row ? JSON.parse(row.rec) : null; } catch { return null; } };
async function rec(env, tenant, t, id) {
  return parse(await env.DB.prepare('SELECT rec FROM records WHERE tenant = ?1 AND k = ?2 AND deleted = 0').bind(tenant, t + '|' + id).first());
}
async function recs(env, tenant, t, ids) {
  if (!ids.length) return [];
  const { results } = await env.DB.prepare('SELECT rec FROM records WHERE tenant = ?1 AND deleted = 0 AND k IN (SELECT value FROM json_each(?2))').bind(tenant, JSON.stringify(ids.map((i) => t + '|' + i))).all();
  return results.map(parse).filter(Boolean);
}

export async function efrisRoutes(env, path, body, who, penv, { json, can, write, fetcher = fetch }) {
  const tenant = who.tenant;
  const settings = (await rec(env, tenant, 'settings', 'settings')) || {};
  if (path === '/api/efris/status') return json({ ready: efrisReady(penv), on: !!settings.efrisOn, env: penv.EFRIS_URL ? 'custom' : penv.EFRIS_ENV === 'production' ? 'production' : 'test' });
  if (!efrisReady(penv)) return json({ error: 'URA EFRIS is not set up for this pharmacy yet: its TIN, device number and key are added in the Owner console.' }, 400);
  if (path === '/api/efris/test') {
    if (!(await can('settings.manage'))) return json({ error: 'Only staff who manage settings can test EFRIS.' }, 403);
    try { return json(await efrisTest(penv, { fetcher })); } catch (e) { return json({ error: e.message }, 502); }
  }
  const id = String(body?.id || '');
  if (!id || id.length > 100) return json({ error: 'Which sale?' }, 400);
  const sale = await rec(env, tenant, 'sales', id);
  if (!sale) return json({ error: 'This sale has not reached the cloud yet. It is fiscalised once it has synced.', pending: true }, 409);
  const have = await rec(env, tenant, 'fiscal', id);
  const save = async (f) => { await write(env, tenant, [{ t: 'fiscal', id, rec: f }]); return f; };

  if (path === '/api/efris/sale') {
    if (!(await can('pos.sell')) && !(await can('pos.wholesale'))) return json({ error: 'You are not allowed to sell.' }, 403);
    if (have?.status === 'issued') return json({ fiscal: have });
    if (!settings.efrisOn) return json({ error: 'URA EFRIS is switched off in Settings.' }, 400);
    if (sale.training || !sale.number) return json({ error: 'Not a real sale.' }, 400);
    const ids = [...new Set((sale.items || []).map((i) => String(i.id)))];
    const products = new Map((await recs(env, tenant, 'products', ids)).map((p) => [String(p.id), p]));
    const customer = sale.customerId ? await rec(env, tenant, 'customers', sale.customerId) : null;
    const attempts = (have?.attempts || 0) + 1;
    let invoice;
    try {
      invoice = invoiceFromSale(sale, { tin: penv.EFRIS_TIN, brn: penv.EFRIS_BRN, deviceNo: penv.EFRIS_DEVICE_NO, legalName: penv.EFRIS_LEGAL_NAME, settings, products, customer, unit: penv.EFRIS_UNIT, category: penv.EFRIS_CATEGORY });
    } catch (e) {
      return json({ fiscal: await save({ saleId: id, saleNumber: sale.number, status: 'failed', error: e.message, attempts, lastTry: new Date().toISOString() }) });
    }
    try {
      let content;
      try { content = await efrisCall(penv, 'T109', invoice, { fetcher, operator: invoice.basicInformation.operator, what: 'receipt' }); }
      catch (e) {
        // sent before (a till asked twice, or the answer was lost): look the receipt up by its number
        if (e.kind !== 'refused' || !DUPLICATE.test(e.message)) throw e;
        content = await findInvoice(penv, sale.number, fetcher);
      }
      const f = fiscalFromT109(content);
      return json({ fiscal: await save({ saleId: id, saleNumber: sale.number, status: 'issued', ...f, env: penv.EFRIS_ENV === 'production' ? 'production' : 'test', attempts, lastTry: new Date().toISOString(), sent: keptOfInvoice(invoice) }) });
    } catch (e) {
      if (e.kind === 'network') return json({ error: e.message, retry: true }, 503); // nothing kept: the queue tries again
      return json({ fiscal: await save({ saleId: id, saleNumber: sale.number, status: 'failed', error: e.message, attempts, lastTry: new Date().toISOString() }) });
    }
  }

  if (path === '/api/efris/refund' || path === '/api/efris/credit') {
    if (!(await can('sales.refund'))) return json({ error: 'You are not allowed to refund.' }, 403);
    if (have?.status !== 'issued') return json({ error: 'This sale has no fiscal receipt to credit.' }, 400);
    if (sale.status !== 'refunded') return json({ error: 'This sale is not refunded.' }, 400);
    const cn = have.creditNote;
    const now = new Date().toISOString();
    if (path === '/api/efris/refund') {
      if (cn && cn.status !== 'failed') return json({ fiscal: have });
      try {
        const app = creditNoteFromInvoice(have, { reason: sale.refundReason, by: sale.refundedBy, at: sale.refundedAt, number: sale.number });
        const content = await efrisCall(penv, 'T110', app, { fetcher, operator: sale.refundedBy, what: 'credit note' });
        return json({ fiscal: await save({ ...have, creditNote: { status: 'pending', referenceNo: String(content?.referenceNo || ''), at: now, reasonCode: app.reasonCode } }) });
      } catch (e) {
        if (e.kind === 'network') return json({ error: e.message, retry: true }, 503);
        return json({ fiscal: await save({ ...have, creditNote: { status: 'failed', error: e.message, lastTry: now } }) });
      }
    }
    if (cn?.status !== 'pending' || !cn.referenceNo) return json({ fiscal: have });
    try {
      const content = await efrisCall(penv, 'T111', { referenceNo: cn.referenceNo, oriInvoiceNo: have.fdn, invoiceApplyCategoryCode: '101', queryType: '1', pageNo: '1', pageSize: '10' }, { fetcher, what: 'credit note check' });
      const st = creditStatus(content, cn.referenceNo);
      return json({ fiscal: await save({ ...have, creditNote: { ...cn, ...st, checked: now } }) });
    } catch (e) {
      if (e.kind === 'network') return json({ error: e.message, retry: true }, 503);
      return json({ fiscal: await save({ ...have, creditNote: { ...cn, checked: now, note: e.message } }) });
    }
  }
  return json({ error: 'Not found' }, 404);
}

/** T106 finds a receipt by our number, T108 gives its details (FDN, verification code, QR) */
async function findInvoice(env, number, fetcher) {
  const list = await efrisCall(env, 'T106', { referenceNo: String(number), pageNo: '1', pageSize: '10' }, { fetcher, what: 'receipt look-up' });
  const row = (list?.records || []).find((r) => String(r.referenceNo) === String(number)) || list?.records?.[0];
  if (!row?.invoiceNo) throw new EfrisError('EFRIS says this receipt was sent before but could not find it', 'refused');
  return efrisCall(env, 'T108', { invoiceNo: row.invoiceNo }, { fetcher, what: 'receipt details' });
}

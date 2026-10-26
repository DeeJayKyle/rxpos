// Drug label lookup (src/druglabel.js) with a fake network and storage: one request, best match, caching,
// shared requests, retries, timeouts handled, misses remembered.   node unit-druglabel.mjs
import { createDrugLookup, labelUrl, pickBest, lookupKeys, FRESH_MS, MISS_MS } from '../src/druglabel.js';
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + String(x) : ''}`); };

const label = (generic, brand, extra = {}) => ({ openfda: { generic_name: [generic], brand_name: [brand], route: ['ORAL'], dosage_form: ['CAPSULE'] }, indications_and_usage: ['Infections.'], dosage_and_administration: ['500 mg every 8 hours.'], ...extra });
const json = (results, status = 200) => ({ status, ok: status >= 200 && status < 300, json: async () => ({ results }) });
const store = () => { const m = new Map(); return { m, get: async (k) => m.get(k), set: async (k, v) => { m.set(k, v); } }; };

// one URL asks generic OR substance OR brand
const u = labelUrl('amoxicillin');
check('one request searches generic, substance and brand together', (u.match(/openfda\./g) || []).length === 3 && u.includes('+') && u.includes('limit=5'), u);
check('quotes in a name cannot break the query', !labelUrl('a"b').includes('a"b'));

// best match
const docs = [label('AMOXICILLIN AND CLAVULANATE', 'Augmentin'), label('AMOXICILLIN', 'Amoxil')];
check('the exact generic wins over a combination product', pickBest(docs, 'amoxicillin').openfda.brand_name[0] === 'Amoxil');
check('an exact brand is found', pickBest([label('PARACETAMOL', 'Calpol')], 'calpol').openfda.generic_name[0] === 'PARACETAMOL');
check('names to try: generic first, then brand, no blanks', JSON.stringify(lookupKeys('Amoxyl 500mg caps', 'Amoxicillin')) === '["amoxicillin","amoxyl"]' && lookupKeys('', '').length === 0, JSON.stringify(lookupKeys('Amoxyl 500mg caps', 'Amoxicillin')));

// caching and sharing
{
  let calls = 0; const s = store(); let t = 1_700_000_000_000;
  const L = createDrugLookup({ fetchFn: async () => { calls++; await new Promise((r) => setTimeout(r, 20)); return json(docs); }, get: s.get, set: s.set, now: () => t });
  const [a, b] = await Promise.all([L.refresh('amoxicillin'), L.refresh('amoxicillin')]);
  check('two panels asking at once share one request', calls === 1 && a === b && a.title.startsWith('AMOXICILLIN'), calls);
  check('the label is saved on the device', !!s.m.get('drug:amoxicillin')?.sections?.length);
  check('…and is then known without the network (fresh)', (await L.saved('amoxicillin'))?.fresh === true && L.peek('amoxicillin') === a);
  t += FRESH_MS + 1;
  check('after 30 days the saved copy is still shown but marked for refresh', (await L.saved('amoxicillin'))?.fresh === false);
  const L2 = createDrugLookup({ fetchFn: async () => { throw new Error('no network'); }, get: s.get, set: s.set, now: () => t });
  check('a new session reads the saved copy from the device', !!(await L2.saved('amoxicillin'))?.info);
}

// retries and errors
{
  let calls = 0;
  const L = createDrugLookup({ fetchFn: async () => (++calls === 1 ? json([], 503) : json([label('IBUPROFEN', 'Brufen')])), backoff: 1 });
  const info = await L.refresh('ibuprofen');
  check('a busy server (503) is retried once, then answers', calls === 2 && info?.title.startsWith('IBUPROFEN'), calls);
}
{
  let calls = 0;
  const L = createDrugLookup({ fetchFn: async () => { calls++; throw new TypeError('Failed to fetch'); }, backoff: 1 });
  const e = await L.refresh('x-drug').catch((x) => x);
  check('a network failure is retried once, then explained in plain words', calls === 2 && /internet connection/.test(e.message), `${calls} ${e.message}`);
}
{
  let calls = 0;
  const L = createDrugLookup({ fetchFn: async () => { calls++; return json([], 400); }, backoff: 1 });
  const e = await L.refresh('bad').catch((x) => x);
  check('a request the server refuses (400) is not retried', calls === 1 && /400/.test(e.message), calls);
}
{
  // a server that never answers: each attempt is cut off (8 s in the app, 30 ms here), retried once, then explained
  let calls = 0;
  const L = createDrugLookup({ fetchFn: (url, { signal }) => { calls++; return new Promise((_, rej) => signal.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError')))); }, timeout: 30, backoff: 1 });
  const t0 = Date.now();
  const e = await L.refresh('slow').catch((x) => x);
  check('a hanging request is cut off, retried once, and explained', calls === 2 && /took too long/.test(e.message) && Date.now() - t0 < 2000, `${calls} ${e.message}`);
}

// misses remembered
{
  let calls = 0; const s = store(); let t = 1_700_000_000_000;
  const L = createDrugLookup({ fetchFn: async () => { calls++; return json([], 404); }, get: s.get, set: s.set, now: () => t });
  const info = await L.refresh('localbrand');
  check('a medicine not in the database returns nothing (404 is not an error)', info === null && calls === 1);
  check('…and is remembered for a day, so it is not looked up again', (await L.saved('localbrand'))?.miss === true && typeof s.m.get('drug-miss:localbrand') === 'number');
  t += MISS_MS + 1;
  const L2 = createDrugLookup({ fetchFn: async () => json([]), get: s.get, set: s.set, now: () => t });
  check('…after a day it is looked up again', (await L2.saved('localbrand')) === null);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

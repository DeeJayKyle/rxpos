// The React app's own rules (src/*.js) run on fixed, fictional cases; the answers go to test/parity/react_expected.json,
// and test/parity/react_parity_test.dart checks the Flutter rules give the same answers.
//   cd rxpos_flutter && node tool/parity/react_cases.mjs     (rerun whenever a rule changes in src/)
import { build } from 'esbuild';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
// which copy of the React app: this repository (now), or another checkout given as the first argument (e.g. the
// v1.7.0 code, from before the migration); the answers go to the file named second
const root = path.resolve(process.argv[2] || path.join(here, '..', '..', '..'));
const target = process.argv[3] || path.join(here, '..', '..', 'test', 'parity', 'react_expected.json');
const mods = ['money', 'fefo', 'packs', 'search', 'dates', 'dateformat', 'rxrules', 'invoicedates', 'druglabel', 'weather', 'access', 'drugclass']
  .filter((m) => fs.existsSync(path.join(root, 'src', m + '.js')));
const entry = mods.map((m) => `export * as ${m} from ${JSON.stringify(path.join(root, 'src', m + '.js'))};`).join('\n');
const out = await build({ stdin: { contents: entry, resolveDir: root, loader: 'js' }, bundle: true, format: 'esm', platform: 'node', write: false,
  loader: { '.js': 'jsx' }, jsx: 'automatic', define: { 'import.meta.env.DEV': 'false' }, logLevel: 'error',
  nodePaths: [path.join(here, '..', '..', '..', 'node_modules')] });
const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rxpos-parity-')), 'rules.mjs');
fs.writeFileSync(file, out.outputFiles[0].text);
globalThis.localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {} };
const M = await import(pathToFileURL(file).href);
// every rule by name, from whichever module has it; a rule this copy doesn't have is recorded as absent
const R = new Proxy({}, { get: (_, k) => { for (const m of mods) if (typeof M[m]?.[k] === 'function') return M[m][k]; return undefined; } });

const cases = [];
const run = (fn, args, f) => {
  if (!R[fn]) return cases.push({ fn, args, absent: true });
  try { cases.push({ fn, args, out: f() }); } catch (e) { cases.push({ fn, args, error: String(e.message || e) }); }
};

// money
for (const a of [[1.005, 2], [2.5, 0], [-2.5, 0], [1234.5678, 2], [0.1 + 0.2, 2], [999.995, 2], [1e7 / 3, 0]]) run('round', a, () => R.round(...a));
for (const l of [{ price: 500, qty: 3 }, { price: 1250.5, qty: 2, discount: 100 }, { price: 100, qty: 1, discount: 250 }, { price: 33.333, qty: 3 }, { price: 0.5, qty: 7 }])
  for (const d of [0, 2]) run('lineTotal', [l, d], () => R.lineTotal(l, d));
run('cartSubtotal', [[{ price: 500, qty: 2 }, { price: 1250.5, qty: 1, discount: 50 }], 0], () => R.cartSubtotal([{ price: 500, qty: 2 }, { price: 1250.5, qty: 1, discount: 50 }], 0));
for (const a of [[10000, 18, false, 0], [11800, 18, true, 0], [999, 16, false, 2], [999, 16, true, 2], [5000, 0, false, 0]])
  run('taxOf', a, () => R.taxOf(a[0], a[1], { inclusive: a[2], decimals: a[3] }));
for (const a of [[6000, 12, 0], [1000, 3, 2], [500, 0, 0]]) run('unitPrice', a, () => R.unitPrice(...a));
for (const a of [[5, ''], [1, 'tablet'], [2, 'tablet'], [1.333333, ''], [0.5, 'bottle'], [12.5, 'ml'], [100, 'Strip']]) run('formatQty', a, () => R.formatQty(...a));
for (const a of [[1234567, 'UGX', 0], [1234.5, 'KES', 2], [-500, 'UGX', 0], [0, '', 0], [999999.999, 'UGX', 2]])
  run('formatMoney', a, () => R.formatMoney(a[0], { currency: a[1], decimals: a[2] }));

// first expiry first out (within stock: past it the Flutter app refuses the sale on purpose)
const B = [
  { id: 'b-old', qty: 5, batch: 'X0', expiry: '2001-01-31' },
  { id: 'b1', qty: 10, batch: 'A1', expiry: '2091-03-31' },
  { id: 'b2', qty: 0, batch: 'A2', expiry: '2092-03-31' },
  { id: 'b3', qty: 25, batch: 'A3', expiry: '2093-03-31' },
  { id: 'b4', qty: 4.5, batch: 'A4', expiry: '' },
];
for (const q of [1, 10, 11, 35, 39.5]) run('allocate', [B, q, false], () => R.allocate(B, q));
for (const q of [3, 44.5]) run('allocate', [B, q, true], () => R.allocate(B, q, { allowExpired: true }));
for (const a of [['b3', 5], ['b3', 30], ['b1', 44.5], ['b2', 3], ['b1', 100]]) run('removalSplit', [B, ...a], () => R.removalSplit(B, ...a));

// packs
const P = { id: 'p1', name: 'Calmex 500mg Tabs', price: 500, wholesale: 400, packs: [{ name: 'Strip', size: 10 }, { name: 'Box', size: 100, price: 45000 }, { name: '', size: 5 }, { name: 'Single', size: 1 }] };
run('packsOf', [P], () => R.packsOf(P).map((k) => k.name));
run('mainPack', [P], () => R.mainPack(P)?.name ?? null);
run('mainPack', [{ id: 'p2', name: 'No packs' }], () => R.mainPack({ id: 'p2' })?.name ?? null);
for (const a of [[{ name: 'Strip', size: 10 }, 500, false], [{ name: 'Box', size: 100, price: 45000 }, 500, false], [{ name: 'Box', size: 100, price: 45000, wholesale: 38000 }, 400, true], [{ name: 'Strip', size: 10, price: 4500 }, 400, true]])
  run('packPrice', a, () => R.packPrice(...a));
for (const s of [{}, { receiveUnit: 'unit' }]) run('receiveInPacks', [s], () => R.receiveInPacks(s));
for (const [s, w] of [[{}, false], [{}, true], [{ sellUnitRetail: 'pack' }, false], [{ sellUnitWholesale: 'unit' }, true]]) run('sellInPacks', [s, w], () => R.sellInPacks(s, w));

// search
for (const s of ['Amoxycillin 500 mg Caps', 'PAEDIATRIC Syrup', 'Ferrous Sulphate', 'Café-Crème', 'Vit. C 1000MG', 'Paracetamol  250mg/5ml', '', 'Ibuprofen 2%']) run('fold', [s], () => R.fold(s));
const list = [
  { id: 'a', name: 'Amoxil 500mg Capsules', generic: 'Amoxicillin', form: 'Capsules', stock: 0 },
  { id: 'b', name: 'Calmex 500mg Tabs', generic: 'Paracetamol', form: 'Tablets', stock: 40 },
  { id: 'c', name: 'Panadol Extra', generic: 'Paracetamol Caffeine', form: 'Tablets', barcode: '6001234', stock: 12 },
  { id: 'd', name: 'Zinco Syrup 100ml', generic: 'Zinc sulphate', form: 'Syrup', category: 'Paediatric', stock: 3 },
  { id: 'e', name: 'Para Junior Syrup', generic: 'Paracetamol 120mg/5ml', form: 'Syrup', stock: 0 },
  { id: 'f', name: 'Ferrous Tabs', generic: 'Ferrous sulfate', strength: '200 mg', stock: 9 },
];
for (const q of ['para', 'paracetamol tab', 'amoxycillin', 'sulfate', 'syrup', 'pediatric', '6001', '200mg', 'xyz', '']) run('searchProducts', [list, q], () => R.searchProducts(list, q).map((p) => p.id));

// dates
for (const v of ['2026-11-06T09:15:00.000Z', '2026-11-06', '2026-02', '', null, 'garbage']) run('dayOf', [v], () => R.dayOf(v));
for (const v of ['2026-11-06T09:15:00.000Z', '2026-11', '']) run('monthOf', [v], () => R.monthOf(v));
for (const f of ['dmy', 'mdy', 'ymd']) for (const v of ['2026-11-06', '2028-06-30T00:00:00Z', '', 'nope']) run('formatDate', [v, f], () => R.formatDate(v, f));
for (const f of ['dmy', 'mdy', 'ymd'])
  for (const [t, my] of [['06/11/2026', false], ['6/11/26', false], ['2026-11-06', false], ['31/02/2026', false], ['06/2028', true], ['6-28', true], ['2028/06', true], ['06112026', false], ['061126', false], ['', false], ['hello', false], ['13/13/2026', false]])
    run('parseDate', [t, f, my], () => R.parseDate(t, f, { monthYear: my }));

// prescriptions and refills
for (const r of [{ status: 'Active', refillsAllowed: 3, refillsUsed: 1, refillDays: 30 }, { status: 'Completed', refillsAllowed: 3, refillsUsed: 3, refillDays: 30 },
  { status: 'Pending', refillsAllowed: 2, refillsUsed: 0, refillDays: 0 }, { status: 'Cancelled', refillsAllowed: 5, refillsUsed: 1, refillDays: 14 },
  { status: 'Active', refillsAllowed: '2', refillsUsed: '2', refillDays: '28' }]) {
  run('refillsLeft', [r], () => R.refillsLeft(r));
  run('canRecordRefill', [r], () => R.canRecordRefill(r));
  run('reminderActive', [r], () => R.reminderActive(r));
}

// invoice dates and drug labels
for (const v of ['06/2028', '2028-06', '30.06.2028', 'Jun 2028', 'JUN-28', '2028-06-15', '15/06/2028', '', null, 'n/a', 46000]) run('normDate', [v], () => R.normDate(v));
for (const v of ['Amoxicillin 500mg Capsules', 'PARACETAMOL (as hydrochloride) 1g', 'Zinc sulphate 20mg/5ml syrup', '', null, 'Co-trimoxazole']) run('genericKey', [v], () => R.genericKey(v));
run('lookupKeys', ['Amoxil 500mg', 'Amoxicillin'], () => R.lookupKeys('Amoxil 500mg', 'Amoxicillin'));
run('lookupKeys', ['Calmex', ''], () => R.lookupKeys('Calmex', ''));

// storage advice
for (const cur of [{ temperature_2m: 31.4, relative_humidity_2m: 70 }, { temperature_2m: 27, relative_humidity_2m: 40 }, { temperature_2m: 20, relative_humidity_2m: 90 }])
  for (const s of [{}, { roomMax: 28, hotAlert: 33, humidityMax: 80 }]) run('storageAdvice', [cur, s], () => R.storageAdvice(cur, R.storageLimits(s)));

// roles and permissions
const roles = [{ id: 'cashier', name: 'Cashier (edited)', permissions: ['pos.sell'] }, { id: 'counter', name: 'Counter', permissions: ['pos.sell', 'sales.view'] }];
for (const role of ['admin', 'cashier', 'pharmacist', 'counter', 'nobody']) run('permissionsOf', [roles, role], () => [...R.permissionsOf({ roles, settings: {} }, role)].sort());

// drug classes and grouping (step 26: copied from the Flutter app): every 25th medicine of the standard catalogue, and
// some typed categories
const cat = JSON.parse(fs.readFileSync(path.join(here, '..', '..', 'assets', 'catalog.json'), 'utf8'));
const col = (r, k) => r[cat.columns.indexOf(k)];
const meds = cat.rows.filter((_, i) => i % 25 === 0).map((r, i) => ({ id: 'k' + i, name: String(col(r, 'name') ?? ''), generic: String(col(r, 'generic') ?? ''), form: String(col(r, 'form') ?? '') }));
meds.push({ id: 't1', name: 'House blend', category: 'Antimalarial' }, { id: 't2', name: 'Mystery Tabs', category: 'Supplements' }, { id: 't3', name: 'Plain thing' }, { id: 't4', name: 'Shelved', shelf: 'A3' });
for (const m of meds) run('drugClassOf', [m], () => R.drugClassOf(m));
for (const o of ['drugClass', 'area', 'form', 'shelf']) run('groupMedicines', [meds.slice(0, 80), o], () => R.groupMedicines(meds.slice(0, 80), o).map(([g, ps]) => [g, ps.map((x) => x.id)]));

fs.writeFileSync(target, JSON.stringify(cases, null, 1) + '\n');
console.log(`${cases.length} cases from the React rules in ${root} (${cases.filter((c) => c.absent).length} rules not there)`);

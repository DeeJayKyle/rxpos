// Matching invoice lines (printed or handwritten) to the pharmacy's medicines (src/invoiceMatch.js) and cleaning up
// a photo of an invoice before it is read (src/pageenhance.js). Fictional medicines and suppliers.
import assert from 'node:assert/strict';
import { nameWords, strengthsOf, wordLike, rankProducts, matchProduct, matchSupplier, learnedNames, lastBatchOf, fillFromLast } from '../src/invoiceMatch.js';
import { enhancePixels } from '../src/pageenhance.js';
import { normDate, oldDeliveryDays } from '../src/invoicedates.js';
let passed = 0;
const ok = (name, fn) => { fn(); passed++; console.log('PASS ', name); };

const P = [
  { id: 'amx500', name: 'Amoxicillin 500mg Capsules', generic: 'Amoxicillin', stock: 40 },
  { id: 'amx250', name: 'Amoxicillin 250mg Capsules', generic: 'Amoxicillin', stock: 0 },
  { id: 'pcm', name: 'Paracetamol 500mg Tablets', generic: 'Paracetamol', stock: 900 },
  { id: 'mtz', name: 'Metronidazole 400mg Tablets', generic: 'Metronidazole' },
  { id: 'al', name: 'Lumartem 80/480 Tablets', generic: 'Artemether Lumefantrine' },
  { id: 'ors', name: 'ORS Sachets', generic: 'Oral rehydration salts', barcode: '6001234567890' },
  { id: 'ctx', name: 'Cotrimoxazole 960mg Tablets', generic: 'Sulfamethoxazole Trimethoprim' },
];
const best = (n, o) => matchProduct(n, P, o)?.id;

ok('words: form and pack words and strengths left out, abbreviations written out', () => {
  assert.deepEqual(nameWords('Amoxicillin 500mg Caps 10x10'), ['amoxicilin']);
  assert.deepEqual(nameWords('PCM 500mg tabs 1000s'), ['paracetamol']);
  assert.deepEqual(nameWords('Cotrim 960 mg'), ['cotrimoxazole']);
});
ok('strengths in one unit: 0.5g = 500mg, 1 g = 1000mg, 80/480, a volume is not a strength', () => {
  assert.deepEqual(strengthsOf('Amoxicillin 0.5g'), ['500mg']);
  assert.deepEqual(strengthsOf('Ceftriaxone 1 g'), ['1000mg']);
  assert.deepEqual(strengthsOf('AL 80/480'), ['80/480']);
  assert.deepEqual(strengthsOf('Amoxil syrup 125mg/5ml 100ml'), ['125mg']);
});
ok('letters misread in handwriting still match (l/i, o/a, a missing letter)', () => {
  assert.ok(wordLike('paracetamoi', 'paracetamol') > 0.8);
  assert.ok(wordLike('metronidazoie', 'metronidazole') > 0.8);
  assert.ok(wordLike('amoxicilin', 'amoxicilln') > 0.7);
  assert.equal(wordLike('salbutamol', 'paracetamol'), 0);
});
ok('printed names match', () => { assert.equal(best('Amoxicillin 500mg Capsules 10x10'), 'amx500'); assert.equal(best('Paracetamol 500mg Tabs'), 'pcm'); });
ok('handwritten misreadings match', () => {
  assert.equal(best('Amoxicilin 500mg caps'), 'amx500');
  assert.equal(best('Paracetamoi 500 mg'), 'pcm');
  assert.equal(best('Metronidazoie 400mg'), 'mtz');
});
ok('abbreviations and other spellings match: PCM, Amox, AMOXYCILLIN 0.5g, Cotrim', () => {
  assert.equal(best('PCM 500mg x1000'), 'pcm');
  assert.equal(best('Amox 500mg'), 'amx500');
  assert.equal(best('AMOXYCILLIN 0.5g CAPS'), 'amx500');
  assert.equal(best('Cotrim 960mg'), 'ctx');
});
ok('the strength decides between two of the same medicine', () => { assert.equal(best('Amoxicillin 250mg caps'), 'amx250'); assert.equal(best('Amoxicillin 500mg caps'), 'amx500'); });
ok('a different strength is never chosen by itself, only suggested', () => {
  assert.equal(best('Amoxicillin 1g'), undefined);
  const r = rankProducts('Amoxicillin 1g', P);
  assert.ok(r.some((x) => x.p.id === 'amx500') && r.every((x) => !x.sure));
  assert.match(r[0].why, /strength differs/);
});
ok('no strength on the line and two strengths in stock: suggested, not chosen', () => {
  assert.equal(best('Amoxicillin caps'), undefined);
  assert.deepEqual(rankProducts('Amoxicillin caps', P).slice(0, 2).map((x) => x.p.id).sort(), ['amx250', 'amx500']);
});
ok('generic name on the invoice finds the brand (Artemether/Lumefantrine 80/480 → Lumartem)', () => { assert.equal(best('Artemether Lumefantrine 80/480 tabs'), 'al'); });
ok('a barcode on the line', () => { assert.equal(best('6001234567890 Oral salts'), 'ors'); });
ok('something not stocked: nothing chosen', () => { assert.equal(best('Salbutamol inhaler 100mcg'), undefined); assert.equal(best(''), undefined); });
ok('the other reading\'s name is tried too', () => { assert.equal(best('Xqzl 400mg', { alt: 'Metronidazole 400mg' }), 'mtz'); });
ok('learned: words received as a medicine before match it at once, whatever they say', () => {
  const learned = learnedNames([{ items: [{ productId: 'ctx', invoiceName: 'Septrin DS tabs 100s' }, { productId: 'pcm', name: 'x' }] }]);
  const r = rankProducts('SEPTRIN DS Tabs 100s', P, { learned });
  assert.equal(r[0].p.id, 'ctx'); assert.equal(r[0].sure, true); assert.match(r[0].why, /received as this before/);
});
ok('suppliers: company words left out, a misread letter allowed', () => {
  const S = [{ id: 'a', name: 'Abacus Pharma (U) Ltd' }, { id: 'k', name: 'Kampala Medical Distributors' }];
  assert.equal(matchSupplier('ABACUS PHARMACEUTICALS LIMITED', S)?.id, 'a');
  assert.equal(matchSupplier('Kampaia Medical', S)?.id, 'k');
  assert.equal(matchSupplier('Lakeview Ltd', S), null);
});
ok('a few thousand medicines: a 40-line invoice is matched quickly', () => {
  const many = Array.from({ length: 4000 }, (_, i) => ({ id: 'x' + i, name: `Medicine${i} ${i % 50}0mg Tablets`, generic: `Generic${i % 300}` })).concat(P);
  const t = performance.now();
  for (let i = 0; i < 40; i++) rankProducts(i % 2 ? 'Paracetamoi 500mg' : 'Amoxicilin 250mg caps', many);
  assert.ok(performance.now() - t < 4000, `took ${Math.round(performance.now() - t)} ms`);
});

// a page 60×40: grey paper (160) with a shadow on the right half (90), dark grey writing (110 / 60 in the shadow)
const page = () => {
  const w = 60, h = 40, px = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const shade = x >= 30, ink = y % 10 === 5 && x % 6 < 4, v = ink ? (shade ? 60 : 110) : shade ? 90 : 160;
    px.set([v, v, v, 255], (y * w + x) * 4);
  }
  return { px, w, h };
};
ok('photo clean-up: shadow evened out, paper white, writing dark on both halves', () => {
  const { px, w, h } = page();
  enhancePixels(px, w, h);
  const at = (x, y) => px[(y * w + x) * 4];
  assert.ok(at(10, 2) > 230 && at(50, 2) > 230, `paper ${at(10, 2)} / ${at(50, 2)}`);
  assert.ok(at(1, 5) < 120 && at(49, 5) < 120, `ink ${at(1, 5)} / ${at(49, 5)}`);
  assert.ok(Math.abs(at(10, 2) - at(50, 2)) < 20, 'both halves alike');
  assert.equal(px[3], 255, 'alpha kept');
});
ok('photo clean-up: a blank page is left as it is', () => {
  const px = new Uint8ClampedArray(20 * 20 * 4).fill(200);
  enhancePixels(px, 20, 20);
  assert.ok(px[0] >= 200);
});
ok('an expiry with a month only is the 30th, the 28th in February (leap years too); a written day is kept', () => {
  assert.deepEqual(['01/2028', 'Feb 2028', '2027-02', 'Dec-27', '06/2028', '31/01/2028'].map((x) => normDate(x)), ['2028-01-30', '2028-02-28', '2027-02-28', '2027-12-30', '2028-06-30', '2028-01-31']);
});
ok('batch or expiry not read well: the last delivery\'s, to be checked; read well: kept', () => {
  const B = [{ productId: 'pcm', batch: 'OLD1', expiry: '2027-01-30', received: '2026-01-02' }, { productId: 'pcm', batch: 'PC2405', expiry: '2028-03-30', received: '2026-10-01' }, { productId: 'mtz', batch: 'M9', expiry: '2029-01-30', received: '2026-11-01' }];
  assert.equal(lastBatchOf(B, 'pcm').batch, 'PC2405');
  assert.equal(lastBatchOf(B, 'none'), null);
  assert.deepEqual(fillFromLast({ batch: '', expiry: '' }, lastBatchOf(B, 'pcm'), '2026-11-20'), { batch: 'PC2405', expiry: '2028-03-30', used: ['batch', 'expiry'] });
  assert.deepEqual(fillFromLast({ batch: 'PC24O5', expiry: '2028-03-30', check: ['batch'] }, lastBatchOf(B, 'pcm'), '2026-11-20'), { batch: 'PC2405', expiry: '2028-03-30', used: ['batch'] });
  assert.deepEqual(fillFromLast({ batch: 'NEW77', expiry: '2029-05-30' }, lastBatchOf(B, 'pcm'), '2026-11-20').used, [], 'read well: nothing taken');
  assert.deepEqual(fillFromLast({ batch: 'X', expiry: '' }, { batch: 'Y', expiry: '2025-01-30' }, '2026-11-20').used, [], 'an expiry that has passed is not offered');
});
ok('a delivery dated more than 3 days ago is asked about before receiving', () => {
  assert.deepEqual([oldDeliveryDays('2026-11-12', '2026-11-22'), oldDeliveryDays('2026-11-19', '2026-11-22'), oldDeliveryDays('2026-11-18', '2026-11-22'),
    oldDeliveryDays('2026-11-22', '2026-11-22'), oldDeliveryDays('', '2026-11-22'), oldDeliveryDays('2025-11-22', '2026-11-22')], [10, 0, 4, 0, 0, 365]);
});
console.log(`\n${passed} passed, 0 failed`);

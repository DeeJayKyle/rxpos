// Matching a line read off a supplier invoice (printed or handwritten) to one of this pharmacy's medicines.
// Pure functions (no browser), checked in tests/unit-invoice-match.mjs.
//
// How a line is matched, most certain first:
//   1. learned: the same words on an earlier invoice were received as this medicine (purchase items keep `invoiceName`)
//   2. barcode / product number written on the line
//   3. the words: every word of the name compared with the medicine's name, generic and ingredients, allowing for
//      spelling variants (search.js fold), common invoice abbreviations (amox, pcm, cotrim…) and letters that are
//      easily misread in handwriting (l/i/1, o/0, rn/m, cl/d, u/v…); the strength must agree.
// A different strength is never matched by itself (10mg is not 100mg): it is only offered as a suggestion.
import { fold } from './search.js';

const FORM_WORDS = new Set(['tablet', 'tablets', 'tabs', 'tab', 'tb', 'tbs', 'capsule', 'capsules', 'caps', 'cap', 'syrup', 'syr', 'suspension', 'susp', 'cream', 'crm', 'ointment', 'oint',
  'injection', 'inj', 'drops', 'drop', 'the', 'and', 'with', 'for', 'pack', 'packs', 'pcs', 'pc', 'box', 'boxes', 'bx', 'bottle', 'btl', 'btls', 'strip', 'strips', 'sachet', 'sachets', 'vial', 'vials',
  'amp', 'amps', 'ampoule', 'ampoules', 'tube', 'tubes', 'film', 'coated', 'fc', 'ec', 'sr', 'dt', 'oral', 'solution', 'soln', 'sol', 'ml', 'mg', 'mcg', 'g', 'iu', 'each', 'per', 'of', 'no', 'qty', 'nos', 'tins', 'tin']);
// words written short on invoices → the word they stand for
const SHORT = {
  amox: 'amoxicilin', amoxil: 'amoxicilin', amoxi: 'amoxicilin', pcm: 'paracetamol', para: 'paracetamol', panadol: 'paracetamol', cotrim: 'cotrimoxazole', septrin: 'cotrimoxazole',
  metro: 'metronidazole', flagil: 'metronidazole', cipro: 'ciprofloxacin', ibu: 'ibuprofen', ibupro: 'ibuprofen', diclo: 'diclofenac', omep: 'omeprazole', ome: 'omeprazole',
  hctz: 'hidrochlorothiazide', asa: 'aspirin', vit: 'vitamin', multivit: 'multivitamin', ferrous: 'ferous', fefol: 'ferous', chlor: 'chlorfeniramine', cpm: 'chlorfeniramine',
  azith: 'azithromicin', azithro: 'azithromicin', erythro: 'erithromicin', doxy: 'doxicicline', genta: 'gentamicin', ceftri: 'ceftriaxone', metfor: 'metformin', amlo: 'amlodipine',
  nifed: 'nifedipine', predni: 'prednisolone', salbu: 'salbutamol', albend: 'albendazole', mebend: 'mebendazole', fluco: 'fluconazole', clotri: 'clotrimazole', hydrocort: 'hidrocortisone',
  ors: 'ors', zinc: 'zinc', coartem: 'artemether', al: 'artemether', amoxiclav: 'amoxicilin', augmentin: 'amoxicilin',
};
// letters that look alike in handwriting (and to a reading model): a swap between them costs less than another letter
const LOOKALIKE = [['l', 'i'], ['l', '1'], ['i', '1'], ['o', '0'], ['o', 'a'], ['u', 'v'], ['u', 'n'], ['n', 'r'], ['e', 'c'], ['a', 'e'], ['s', '5'], ['z', '2'], ['b', '8'], ['g', '9'], ['t', 'f'], ['h', 'n']];
const LOOK = new Set(LOOKALIKE.flatMap(([a, b]) => [a + b, b + a]));

// keys and words folded the same way as the names they are compared with
const SHORT_F = new Map(Object.entries(SHORT).map(([k, v]) => [fold(k), fold(v)]));
const shorten = (w) => SHORT_F.get(w) || w;
/** The words of a name worth comparing: folded, form / pack words, pack sizes (10x10) and strengths left out */
export function nameWords(s) {
  return fold(s).replace(/\b\d+\s*[x*]\s*\d+\b/g, ' ').split(/[\s.]+/)
    .filter((w) => w && !FORM_WORDS.has(w) && !/^x?\d/.test(w)).map(shorten);
}
/** Strengths on a name, as numbers in one unit: "500mg" → 500, "1g" → 1000 (mg), "0.5 g" → 500, "125mg/5ml" → 125 */
export function strengthsOf(s) {
  const out = [];
  for (const m of fold(s).matchAll(/(\d+(?:\.\d+)?)(mg|mcg|g|ml|iu|%)/g)) {
    const n = Number(m[1]), u = m[2];
    if (u === 'ml') continue; // a volume (5ml, 100ml) is the pack, not the strength
    out.push(u === 'g' ? `${n * 1000}mg` : u === 'mcg' && n >= 1000 ? `${n / 1000}mg` : `${n}${u}`);
  }
  // "80/480" (artemether/lumefantrine), "400/80" (cotrimoxazole) written without units
  for (const m of String(s || '').toLowerCase().matchAll(/\b(\d+)\s*\/\s*(\d+)\b(?!\s*ml)/g)) out.push(`${m[1]}/${m[2]}`);
  return [...new Set(out)];
}

/** Edit distance where a swap between look-alike letters costs half and two letters swapped round cost one */
function distance(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (Math.abs(m - n) > 3) return Math.max(m, n);
  let prev2 = null, prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      const x = a[i - 1], y = b[j - 1];
      const sub = x === y ? 0 : LOOK.has(x + y) ? 0.5 : 1;
      let d = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + sub);
      if (prev2 && i > 1 && j > 1 && x === b[j - 2] && a[i - 2] === y) d = Math.min(d, prev2[j - 2] + 1);
      cur.push(d);
    }
    prev2 = prev; prev = cur;
  }
  return prev[n];
}
/** How alike two words are, 0 to 1: the same, one the start of the other (amox / amoxicillin), or a few letters misread */
export function wordLike(w, h) {
  if (w === h) return 1;
  const short = Math.min(w.length, h.length);
  if (short >= 4 && (h.startsWith(w) || w.startsWith(h))) return 0.9;
  if (short < 4) return 0;
  if (w[0] !== h[0] && !LOOK.has(w[0] + h[0])) return 0; // the first letter is rarely misread: saves most of the work
  const d = distance(w, h), allowed = Math.max(w.length, h.length) <= 6 ? 1 : Math.max(w.length, h.length) <= 9 ? 2 : 3;
  return d <= allowed ? 1 - d / Math.max(w.length, h.length) / 1.5 : 0;
}

// the words of each medicine, worked out once per medicine list
const prepared = new WeakMap();
function prep(p) {
  let v = prepared.get(p);
  if (!v) {
    const own = nameWords(p.name);
    const all = [...new Set([...own, ...nameWords(`${p.generic || ''} ${p.ingredients || ''} ${p.brand || ''}`)])];
    v = { own, all, first: own[0] || all[0] || '', str: strengthsOf(`${p.name} ${p.strength || ''}`) };
    prepared.set(p, v);
  }
  return v;
}

/** The invoice words a medicine was received as before (learned from earlier deliveries): folded words → productId */
export function learnedNames(purchases = []) {
  const map = new Map();
  for (const pu of purchases) for (const it of pu.items || []) if (it.invoiceName && it.productId) map.set(nameWords(it.invoiceName).join(' ') + '|' + strengthsOf(it.invoiceName).join(','), it.productId);
  return map;
}

/**
 * The medicines an invoice line could be, best first: [{ p, score, sure, why }].
 * `sure` = safe to put on the line (still shown for checking); otherwise only suggested.
 * opts: { learned (from learnedNames), alt (the other reading's name), limit }
 */
export function rankProducts(name, products, opts = {}) {
  const { learned, alt, limit = 5 } = opts;
  const names = [name, alt].filter((x) => x && String(x).trim());
  if (!names.length || !products?.length) return [];
  const byId = new Map(products.map((p) => [p.id, p]));
  const out = new Map();
  const add = (p, score, why, sure) => { const was = out.get(p.id); if (!was || score > was.score) out.set(p.id, { p, score, why, sure }); };
  for (const n of names) {
    // 1. learned from an earlier invoice
    const id = learned?.get(nameWords(n).join(' ') + '|' + strengthsOf(n).join(','));
    if (id && byId.has(id)) add(byId.get(id), 3, 'received as this before', true);
    // 2. a barcode written on the line
    const code = (String(n).match(/\b\d{8,14}\b/) || [])[0];
    if (code) for (const p of products) if (p.barcode && String(p.barcode) === code) add(p, 2.5, 'barcode', true);
    // 3. the words
    const want = nameWords(n), wantStr = strengthsOf(n);
    if (!want.length) continue;
    for (const p of products) {
      const h = prep(p);
      if (!h.all.length) continue;
      let sum = 0, exact = 0;
      for (const w of want) {
        let b = 0;
        for (const x of h.all) { const s = wordLike(w, x); if (s > b) b = s; if (b === 1) break; }
        sum += b; if (b === 1) exact++;
      }
      const hit = sum / want.length;
      if (hit < 0.5) continue;
      // the medicine's own words found on the line too (Amoxicillin 250 vs Amoxicillin + Clavulanate)
      const cover = h.own.length ? h.own.filter((x) => want.some((w) => wordLike(w, x) >= 0.8)).length / h.own.length : 0;
      const strengthSame = wantStr.length && h.str.length ? wantStr.some((x) => h.str.includes(x)) : null;
      const score = hit + 0.25 * cover + (strengthSame === true ? 0.3 : strengthSame === false ? -0.8 : 0) + (wordLike(want[0], h.first) >= 0.8 ? 0.15 : 0) + (p.stock > 0 ? 0.03 : 0);
      const why = strengthSame === false ? `strength differs (${h.str.join(', ')})` : exact === want.length ? 'same name' : 'name read alike';
      add(p, score, why, strengthSame !== false && hit >= 0.75 && score >= 0.9);
    }
  }
  const list = [...out.values()].filter((x) => x.score >= 0.55).sort((a, b) => b.score - a.score).slice(0, limit);
  // two medicines almost equally likely (and neither learned): don't choose between them, only suggest
  if (list[0]?.sure && list[0].score < 2 && list[1] && list[0].score - list[1].score < 0.08) list[0] = { ...list[0], sure: false, why: list[0].why + '; another medicine is as likely' };
  return list;
}

/** Best medicine for a name read off an invoice, only when it is safe to choose (null otherwise) */
export function matchProduct(name, products, opts) {
  const [best] = rankProducts(name, products, opts);
  return best?.sure ? best.p : null;
}

const SUPPLIER_NOISE = ['ltd', 'limited', 'co', 'company', 'u', 'uganda', 'pharma', 'pharmaceuticals', 'pharmaceutical', 'pharmacy', 'pharmacie', 'enterprises', 'enterprise', 'distributors', 'distributor', 'investments', 'smc', 'wholesale', 'wholesalers', 'the', 'and', 'drug', 'drugs', 'shop'];
/** Supplier named on the invoice → one of the pharmacy's suppliers (or null); misread letters allowed */
export function matchSupplier(name, suppliers) {
  const sw = (s) => fold(s).split(' ').filter((w) => w && !SUPPLIER_NOISE.includes(w));
  const want = sw(name);
  if (!want.length) return null;
  let best = null;
  for (const s of suppliers || []) {
    const have = sw(s.name);
    if (!have.length) continue;
    const score = want.reduce((a, w) => a + Math.max(0, ...have.map((h) => (w.length < 4 || h.length < 4 ? (w === h ? 1 : 0) : wordLike(w, h)))), 0) / Math.max(want.length, have.length);
    if (score >= 0.6 && (!best || score > best.score)) best = { s, score };
  }
  return best?.s || null;
}

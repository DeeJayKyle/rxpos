// Consistent medicine names (the owner's request, 2026-11-20): suggestions only; a person ticks and approves each
// change before anything is saved (components/NameCheck.jsx). Pure, tested in tests/unit-medname.mjs.
//   tidyName(name)        the house style: "Paracetamol 500mg Tablets" (strengths joined and in lower case, form
//                         words written out, ALL-CAPS names in Title Case, stray marks and spaces gone)
//   nameSuggestions(list) every medicine whose name would change, with why
//   safeRename(from, to)  an AI suggestion is only offered when it keeps every number (strength, pack) and changes
//                         nothing else that matters: a name never becomes another medicine or strength
const FORMS = { tab: 'Tablets', tabs: 'Tablets', tb: 'Tablets', tbs: 'Tablets', tablet: 'Tablets', tablets: 'Tablets', cap: 'Capsules', caps: 'Capsules', capsule: 'Capsules', capsules: 'Capsules',
  syr: 'Syrup', syrup: 'Syrup', susp: 'Suspension', suspension: 'Suspension', inj: 'Injection', injection: 'Injection', oint: 'Ointment', ointment: 'Ointment', crm: 'Cream', cream: 'Cream',
  sol: 'Solution', soln: 'Solution', solution: 'Solution', drops: 'Drops', gel: 'Gel', lotion: 'Lotion', sachet: 'Sachets', sachets: 'Sachets', inhaler: 'Inhaler', spray: 'Spray', pessaries: 'Pessaries', suppositories: 'Suppositories' };
// short words kept in capitals (release types, common abbreviations)
const KEEP_CAPS = new Set(['DS', 'SR', 'ER', 'XR', 'XL', 'MR', 'CR', 'DT', 'EC', 'FC', 'IV', 'IM', 'ORS', 'ARV', 'TB', 'HIV', 'BP', 'AL', 'ACT', 'PCM', 'ASA', 'HCT', 'HCTZ', 'MDI', 'ENT', 'LA', 'OD', 'BD', 'II', 'III', 'IV', 'B6', 'B12', 'D3', 'K2', 'C', 'E', 'A', 'B', 'D', 'K', 'Q10']);
const UNIT = /^(\d+(?:\.\d+)?)(mg|mcg|µg|g|kg|ml|l|iu|%|cm|mm)$/i;

const titleWord = (w) => (w.length <= 1 ? w : w[0].toUpperCase() + w.slice(1).toLowerCase());

/** One name in the house style (the same name back when nothing needs changing) */
export function tidyName(name) {
  let s = String(name || '').replace(/[?!*_#~`"]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!s) return s;
  // ALL CAPS? (judged before strengths are lower-cased: "PARACETAMOL 500MG" is a capitals name)
  const letters = s.replace(/\d+(?:\.\d+)?\s*(mg|mcg|µg|g|kg|ml|iu|l)\b/gi, '').replace(/[^A-Za-z]/g, '');
  const allCaps = letters.length > 3 && letters === letters.toUpperCase();
  // "500 mg" → "500mg", "500MG" → "500mg", "5 ML" → "5ml", "0.5 G" → "0.5g"
  s = s.replace(/(\d)\s*(mg|mcg|µg|g|kg|ml|iu|%)\b/gi, (_, d, u) => d + (u.toLowerCase() === 'iu' ? 'IU' : u.toLowerCase()));
  s = s.replace(/(\d)\s*(l)\b(?!\w)/g, '$1L');
  // "10 x 10" / "10X10" → "10x10"
  s = s.replace(/(\d)\s*[xX×]\s*(\d)/g, '$1x$2');
  const words = s.split(' ').map((w) => {
    const bare = w.replace(/^[(]+|[),.;:]+$/g, '');
    const pre = w.slice(0, w.indexOf(bare)), post = w.slice(w.indexOf(bare) + bare.length);
    const low = bare.toLowerCase();
    let out = bare;
    if (FORMS[low]) out = FORMS[low];
    else if (UNIT.test(bare) || /\d/.test(bare) && /^[\d.x/+-]+[a-z%]*$/i.test(bare)) out = bare.replace(/IU$/i, 'IU');
    else if (allCaps) out = KEEP_CAPS.has(bare.toUpperCase()) ? bare.toUpperCase() : bare.split(/([-/+&])/).map((p) => (/^[A-Za-z]+$/.test(p) ? (KEEP_CAPS.has(p.toUpperCase()) ? p.toUpperCase() : titleWord(p)) : p)).join('');
    else if (/^[a-z]/.test(bare) && words0(s) === w) out = bare[0].toUpperCase() + bare.slice(1); // the first word starts with a capital
    return pre + out + post;
  });
  return words.join(' ').replace(/\s+/g, ' ').trim();
}
const words0 = (s) => s.split(' ')[0];

/** The numbers in a name (strengths and packs), in order: a rename must keep them all */
const numbers = (s) => (String(s || '').match(/\d+(?:\.\d+)?/g) || []).map(Number);
const letterKey = (s) => String(s || '').toLowerCase().replace(/[^a-z]/g, '');

/** Is a suggested new name safe to offer for [from]? Same numbers in the same order, not empty, not much longer, and
 *  sharing the medicine's main word (a suggestion never turns one medicine into another) */
export function safeRename(from, to) {
  const a = String(from || '').trim(), b = String(to || '').trim();
  if (!b || a === b || b.length > Math.max(80, a.length * 1.6)) return false;
  if (numbers(a).join(',') !== numbers(b).join(',')) return false;
  const main = (String(a).toLowerCase().match(/[a-z]{4,}/g) || []).find((w) => !FORMS[w]); // the medicine's word, not "tabs"
  return !main || letterKey(b).includes(main.slice(0, 4));
}

/**
 * Every medicine whose name the house style would change: [{ id, from, to, why }]. Names the person already approved
 * or dismissed are skipped (`ignore`: a Set of "id|name").
 */
export function nameSuggestions(products = [], ignore = new Set()) {
  const out = [];
  for (const p of products) {
    if (!p?.id || !p.name || ignore.has(`${p.id}|${p.name}`)) continue;
    const to = tidyName(p.name);
    if (to !== p.name && safeRename(p.name, to)) out.push({ id: p.id, from: p.name, to, why: whyOf(p.name) });
  }
  return out;
}
function whyOf(from) {
  const why = [];
  if (/\d\s+(mg|ml|g|mcg)\b/i.test(from) || /\d(MG|ML|MCG)\b/.test(from)) why.push('strength written the same way');
  if (/\b(tabs?|caps?|syr|susp|inj|oint|crm|soln?)\b/i.test(from)) why.push('form written out');
  const letters = from.replace(/[^A-Za-z]/g, '');
  if (letters.length > 3 && letters === letters.toUpperCase()) why.push('capital letters as in the rest of the list');
  if (/[?!*_#~`"]|\s{2,}|^\s|\s$/.test(from)) why.push('stray marks or spaces');
  return why.join(', ') || 'house style';
}

/** Medicines that look like the same item twice (same letters and numbers once tidied): [[p, q, …], …] */
export function lookAlikes(products = []) {
  const groups = new Map();
  for (const p of products) {
    if (!p?.name) continue;
    const k = tidyName(p.name).toLowerCase().replace(/[^a-z0-9]/g, '');
    (groups.get(k) || groups.set(k, []).get(k)).push(p);
  }
  return [...groups.values()].filter((g) => g.length > 1);
}

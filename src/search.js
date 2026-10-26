// Medicine search for the POS: every word typed must appear somewhere in the medicine's brand, generic name,
// form, category, strength or barcode. Matching ignores case, accents, punctuation and common spelling variants
// (amoxycillin / amoxicillin, sulphate / sulfate, paediatric / pediatric, "500 mg" / "500mg"), so staff find a
// medicine however it was typed in. Pure functions, so the index is built once per product list and checked in tests.

/** Lower-case, accents and punctuation gone, strengths joined ("500 mg" → "500mg"), spelling variants folded */
export function fold(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9%.]+/g, ' ').replace(/(\d)\s+(mg|mcg|g|ml|iu|%)\b/g, '$1$2')
    .replace(/ph/g, 'f').replace(/ae|oe/g, 'e').replace(/y/g, 'i').replace(/ck/g, 'k')
    .replace(/([a-z])\1+/g, '$1').replace(/\s+/g, ' ').trim();
}

/** One searchable string per medicine (built once, reused for every keystroke) */
export function searchKey(p) {
  return fold([p.name, p.generic, p.ingredients, p.strength, p.form, p.category, p.barcode].filter(Boolean).join(' '));
}

/** Medicines matching the query, best first: name starts with it, then a word starts with it, then anywhere; in stock first within each */
export function searchProducts(list, query, keyOf = searchKey) {
  const q = fold(query);
  if (!q) return list;
  const words = q.split(' ');
  const out = [];
  for (const p of list) {
    const key = keyOf(p);
    if (!words.every((w) => key.includes(w))) continue;
    const name = fold(p.name);
    const rank = name.startsWith(q) ? 0 : (' ' + key).includes(' ' + words[0]) ? 1 : 2;
    out.push([rank, p]);
  }
  return out.sort((a, b) => a[0] - b[0] || (b[1].stock > 0) - (a[1].stock > 0)).map((x) => x[1]);
}

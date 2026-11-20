// The same item under different names (the owner's request, 2026-11-20): found here, merged only after a person
// approves each group (components/NameCheck.jsx). Pure, tested in tests/unit-medmerge.mjs.
// Two medicines are the same item when their names say the same words (spelling slips, abbreviations, capitals and
// form words aside), with the same strengths and the same form. A different strength or form is never the same item.
import { nameWords, strengthsOf, wordLike } from './invoiceMatch.js';

const FORM_OF = [[/tab|tb\b/, 'tablet'], [/cap/, 'capsule'], [/syr|susp|suspension|elixir|mixture/, 'liquid'], [/inj|amp|vial/, 'injection'], [/cream|crm|oint|gel|lotion/, 'topical'],
  [/drop/, 'drops'], [/sachet|powder/, 'sachet'], [/inhal|spray|puff/, 'inhaler'], [/suppos|pessar/, 'suppository']];
/** The form of a medicine from its form field, else from its name ('' when unknown) */
export function formOf(p) {
  const f = String(p?.form || '').toLowerCase();
  for (const [re, k] of FORM_OF) if (re.test(f)) return k;
  const n = String(p?.name || '').toLowerCase();
  for (const [re, k] of FORM_OF) if (new RegExp('\\b(' + re.source.replace(/\\b/g, '') + ')').test(n)) return k;
  return '';
}

// each medicine's words, strengths and form, worked out once
const facts = new WeakMap();
function factsOf(p) {
  let f = facts.get(p);
  if (!f) facts.set(p, (f = { s: strengthsOf(`${p.name} ${p.strength || ''}`).sort().join(','), form: formOf(p), w: nameWords(p.name) }));
  return f;
}

/** Are two medicines the same item? */
export function sameItem(a, b) {
  if (!a || !b || a.id === b.id) return false;
  const x = factsOf(a), y = factsOf(b);
  if (x.s !== y.s || (x.form && y.form && x.form !== y.form)) return false;
  if (!x.w.length || x.w.length !== y.w.length) return false;
  return x.w.every((w, i) => wordLike(w, y.w[i]) >= 0.8);
}

/**
 * Groups of medicines that look like one item: [{ ids, keep, items }], `keep` the suggested one to keep (most stock,
 * then a barcode, then the tidiest name). Compares within buckets (same strengths and first letters), so thousands of
 * medicines are checked quickly.
 */
export function mergeGroups(products = [], stockOf = (p) => Number(p.stock ?? p.totalStock ?? 0)) {
  const buckets = new Map();
  for (const p of products) {
    if (!p?.id || !p.name) continue;
    const f = factsOf(p);
    if (!f.w.length) continue;
    const k = f.s + '|' + f.w.length + '|' + f.w[0].slice(0, 3);
    (buckets.get(k) || buckets.set(k, []).get(k)).push(p);
  }
  const out = [];
  for (const list of buckets.values()) {
    if (list.length < 2) continue;
    const parent = new Map(list.map((p) => [p.id, p.id]));
    const root = (x) => { while (parent.get(x) !== x) x = parent.get(x); return x; };
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) if (sameItem(list[i], list[j])) parent.set(root(list[i].id), root(list[j].id));
    const groups = new Map();
    for (const p of list) (groups.get(root(p.id)) || groups.set(root(p.id), []).get(root(p.id))).push(p);
    for (const items of groups.values()) {
      if (items.length < 2) continue;
      const keep = [...items].sort((a, b) => stockOf(b) - stockOf(a) || (b.barcode ? 1 : 0) - (a.barcode ? 1 : 0) || a.name.length - b.name.length)[0];
      out.push({ ids: items.map((p) => p.id), keep: keep.id, items });
    }
  }
  return out.sort((a, b) => a.items[0].name.localeCompare(b.items[0].name));
}

/** The kept medicine after a merge: the others' names kept as aliases (search and invoices still find them), their
 *  barcode when it has none, their packs and missing details added. Nothing of the kept record is lost. */
export function mergedRecord(keep, gone = []) {
  const aliases = [...new Set([...(keep.aliases || []), ...gone.flatMap((g) => [g.name, ...(g.aliases || [])]), ...gone.map((g) => (keep.barcode && g.barcode && g.barcode !== keep.barcode ? g.barcode : '')) /* a second barcode, still found by search */].filter((x) => x && x !== keep.name))];
  const packs = [...(keep.packs || [])];
  for (const g of gone) for (const k of g.packs || []) if (!packs.some((x) => x.name === k.name && Number(x.size) === Number(k.size))) packs.push(k);
  const fill = {};
  for (const f of ['barcode', 'generic', 'category', 'shelf', 'strength', 'ingredients']) if (!keep[f]) { const v = gone.map((g) => g[f]).find(Boolean); if (v) fill[f] = v; }
  return { ...keep, ...fill, aliases, ...(packs.length ? { packs } : {}) };
}

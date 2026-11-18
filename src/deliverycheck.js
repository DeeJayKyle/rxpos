// G2 (1.13): check a delivery by scanning each pack. Pure, so it is unit-tested (tests/unit-deliverycheck.mjs) and
// the Flutter app does the same (lib/features/stock/domain/delivery_check.dart).
//   state: { counts: { productId: packs scanned }, extra: [{ code, name }] }
import { parseGs1 } from './gs1.js';

export const emptyCheck = () => ({ counts: {}, extra: [] });

/** The product a scanned code stands for: its barcode, or the GTIN inside a GS1 pack code */
export function productForCode(code, products) {
  const c = String(code || '').trim();
  if (!c) return null;
  const g = parseGs1(c);
  const gtin = g?.gtin || '';
  return products.find((p) => p.barcode && (p.barcode === c || (gtin && (p.barcode === gtin || p.barcode === gtin.replace(/^0+/, ''))))) || null;
}

/** One scan: the line of that medicine counts up (a medicine on no line is extra) → { state, line, text } */
export function scanInto(state, lines, products, code) {
  const p = productForCode(code, products);
  const line = p && lines.find((l) => l.productId === p.id);
  if (!line) {
    const name = p?.name || '';
    return { state: { ...state, extra: [...state.extra, { code: String(code).trim(), name }] }, line: null, text: name ? `${name} is not on this order: listed as extra` : `${String(code).trim()}: not a medicine on this order: listed as extra` };
  }
  const n = (state.counts[p.id] || 0) + 1;
  const want = Number(line.qty) || 0;
  return { state: { ...state, counts: { ...state.counts, [p.id]: n } }, line, text: `${p.name}: ${n} of ${want}${n > want ? ' (more than ordered)' : n === want ? ' ✓' : ''}` };
}

/** What doesn't match before "Receive stock": lines short of their quantity, more than it, and extra packs */
export function checkSummary(state, lines, nameOf = (l) => l.name) {
  const ls = lines.filter((l) => l.productId && Number(l.qty) > 0);
  return {
    missing: ls.filter((l) => (state.counts[l.productId] || 0) < Number(l.qty)).map((l) => ({ name: nameOf(l), got: state.counts[l.productId] || 0, want: Number(l.qty) })),
    over: ls.filter((l) => (state.counts[l.productId] || 0) > Number(l.qty)).map((l) => ({ name: nameOf(l), got: state.counts[l.productId], want: Number(l.qty) })),
    extra: state.extra,
  };
}

// Packs (strip, box, bottle…): stock is always counted in the medicine's smallest unit; a pack is a number of them.
// Settings → Receipts & stock decides what a line starts as (each line can still be switched):
//   receiveUnit       Add Stock receives in   'pack' (default) | 'unit'
//   sellUnitRetail    the retail till sells   'unit' (default) | 'pack'
//   sellUnitWholesale the wholesale till sells 'pack' (default) | 'unit'
// "The pack" is the medicine's largest pack (a box of 100 rather than a strip of 10).
export const packsOf = (p) => (p?.packs || []).filter((k) => k && k.name && Number(k.size) > 1);
export const mainPack = (p) => packsOf(p).reduce((best, k) => (!best || Number(k.size) > Number(best.size) ? k : best), null);
export const receiveInPacks = (s) => (s?.receiveUnit || 'pack') === 'pack';
export const sellInPacks = (s, wholesale) => (wholesale ? (s?.sellUnitWholesale || 'pack') : (s?.sellUnitRetail || 'unit')) === 'pack';
/** Price of one pack: its own price if set, else the unit price (retail or wholesale) × units in the pack */
export function packPrice(k, unitPrice, wholesale) {
  const own = Number(wholesale ? k.wholesale : k.price);
  return own > 0 ? own : unitPrice * Number(k.size);
}

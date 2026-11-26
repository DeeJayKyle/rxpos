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

// ---------- Selling units set per medicine (Nov 2026, the owner's request) ----------
// The admin sets, per medicine in the Medicine list → Selling units, which units the till may sell it by: a single
// tablet (the stock unit), a pair, a half strip, a strip, a box… each a pack of a number of stock units with its own
// retail and wholesale price. Two more fields on the medicine:
//   sellAs  the unit the till starts a line on: '' = one stock unit, a pack's name, undefined = the Settings default
//   loose   false = never sold as single stock units (e.g. a strip is the least sold); undefined/true = may be
export const soldLoose = (p) => p?.loose !== false;
/** The pack a new till line starts on (null = a single stock unit), and only one the stock can fill */
export function startPack(p, settings, wholesale) {
  const list = packsOf(p);
  const fits = (k) => k && Number(k.size) <= (Number(p?.stock) || 0);
  let k;
  if (p?.sellAs !== undefined && p?.sellAs !== null) k = p.sellAs ? list.find((x) => x.name === p.sellAs) || null : null;
  else k = sellInPacks(settings, wholesale) ? mainPack(p) : null;
  if (k && !fits(k)) k = null;
  // not sold loose: the smallest pack the stock can fill
  if (!k && !soldLoose(p)) k = list.filter(fits).sort((a, b) => Number(a.size) - Number(b.size))[0] || null;
  return k;
}
/** Ready-made selling units for the editor, sized from the medicine's strip (blank when it has none yet) */
export function unitPresets(p) {
  const strip = packsOf(p).find((k) => /^strip$/i.test(k.name))?.size;
  const s = Number(strip) || 0;
  return [
    { name: 'Pair', size: 2 },
    { name: 'Half strip', size: s && s % 2 === 0 ? s / 2 : '', note: s && s % 2 ? `A strip of ${s} has no whole half` : '' },
    { name: 'Strip', size: s || 10 },
    { name: 'Box', size: s ? s * 10 : 100 },
  ];
}

// ---------- Changing the unit of issue (stock unit) ----------
// Choosing "Tablet" instead of "Box" in the medicine form only renames the unit: 5 boxes would read as 5 tablets at
// the box price. The change is made with a factor (1 old unit = `factor` new units): every batch's stock is multiplied
// by a "Unit change" movement, prices and cost are divided, the reorder level and pack sizes multiplied, the old unit
// is kept as a pack (its price as before), and the change is recorded on the medicine (unitChanges) so that sales and
// movements from before it are counted in the new unit in reports and refunds.
export const UNIT_CHANGE = 'Unit change';
/** Multiply a quantity recorded at `date` into the medicine's unit of today (1 when it never changed after `date`) */
export function unitScaleAt(p, date) {
  let f = 1;
  for (const c of p?.unitChanges || []) if (String(date || '') < String(c.at || '') && Number(c.factor) > 0) f *= Number(c.factor);
  return f;
}
/** Has the unit changed since `date` (a sale from before it can't be edited line by line)? */
export const unitChangedSince = (p, date) => unitScaleAt(p, date) !== 1;
/**
 * The medicine after the change, and the movements that rescale its stock. Pure.
 * p: the stored medicine · to: the new unit's name · factor: whole number ≥ 2 · lots: [{ branchId, batchId, qty }]
 * (every batch with stock, any branch; batchId null = stock from before batches) · batches: the medicine's batch
 * records (their cost per unit is divided too) · at: ISO time · decimals: money decimals for the new prices.
 */
export function unitChange(p, { to, factor, lots = [], batches = [], at, by = '', decimals = 0 }) {
  const f = Number(factor);
  if (!Number.isInteger(f) || f < 2) throw new Error('The factor is a whole number, 2 or more (1 old unit = how many new ones)');
  const name = String(to || '').trim();
  const from = p.unit || 'Unit';
  if (!name) throw new Error('Name the new unit');
  if (name.toLowerCase() === from.toLowerCase()) throw new Error(`It is already counted in ${from}s`);
  const r = (x) => { const k = 10 ** Math.max(0, Number(decimals) || 0); return Math.round(x * k) / k; };
  const money = (x) => (Number(x) > 0 ? r(Number(x) / f) : x);
  const packs = packsOf(p).map((k) => ({ ...k, size: Number(k.size) * f })); // same packs, more of the new unit in each
  // the old unit becomes a pack at its old price, so it still sells at the same money (unless a pack has that name)
  if (!packs.some((k) => k.name.toLowerCase() === from.toLowerCase()))
    packs.push({ name: from, size: f, price: Number(p.price) > 0 ? Number(p.price) : null, ...(Number(p.wholesale) > 0 ? { wholesale: Number(p.wholesale) } : {}) });
  const sellAs = p.sellAs === '' ? from : p.sellAs; // it started on one old unit: it starts on the pack of one old unit
  const product = {
    ...p, unit: name, price: money(p.price), wholesale: money(p.wholesale),
    cost: Number(p.cost) > 0 ? Math.round((Number(p.cost) / f) * 10000) / 10000 : p.cost, // kept to 4 places: × stock is the value
    reorder: Number(p.reorder) > 0 ? Number(p.reorder) * f : p.reorder,
    packs: packs.sort((a, b) => a.size - b.size),
    ...(sellAs !== undefined ? { sellAs } : {}),
    unitChanges: [...(p.unitChanges || []), { at, from, to: name, factor: f, by }],
  };
  const moves = lots.filter((l) => Number(l.qty)).map((l) => ({ productId: p.id, batchId: l.batchId, branchId: l.branchId, qty: Number(l.qty) * (f - 1), type: UNIT_CHANGE, note: `1 ${from} = ${f} ${name}` }));
  const cost4 = (x) => Math.round((Number(x) / f) * 10000) / 10000;
  const batchesOut = batches.filter((b) => b.productId === p.id && Number(b.cost) > 0).map((b) => ({ ...b, cost: cost4(b.cost) }));
  return { product, moves, batches: batchesOut };
}

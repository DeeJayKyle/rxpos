// Planning purchase orders from reorder suggestions (Reorder page). Pure helpers, so the page and the tests agree.
// Nothing here changes stock, prices or orders; the page shows the plan and asks before it creates anything.

/** A quantity typed by hand: a whole number of units, at least 1. Anything else is not valid (null). */
export function validQty(v) {
  const s = String(v ?? '').trim();
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  return n >= 1 && n <= 1e7 ? n : null;
}

/** Round a quantity of units up to whole packs (size 2 or more); otherwise unchanged */
export function roundToPack(qty, size) {
  const z = Number(size);
  if (!(z > 1) || !(qty > 0)) return qty;
  return Math.ceil(qty / z) * z;
}

/** What the confirmation says about where each medicine is bought */
export function supplierRule(from, handPicked) {
  const base = from === 'cheapest' ? 'the cheapest supplier for each medicine (from past purchases)' : 'the supplier you last bought each medicine from';
  return handPicked > 0 ? `${base}, except ${handPicked} you chose by hand` : base;
}

/**
 * Group chosen lines by the supplier actually chosen for each.
 * rows: [{ p, qty, buy }] ; buy = { supplierId, supplierName, cost } or undefined.
 * Returns [{ supplierId, supplierName, lines: [{ productId, name, qty, cost, priced }], total, unpriced }]
 * A line has no known price when neither the supplier nor the medicine has a cost ("priced" false); it counts 0.
 */
export function planOrders(rows, suppliers = []) {
  const g = new Map();
  for (const r of rows) {
    const id = r.buy?.supplierId || '';
    if (!g.has(id)) {
      const name = suppliers.find((x) => x.id === id)?.name || r.buy?.supplierName || 'Any supplier';
      g.set(id, { supplierId: id, supplierName: id ? name : 'No supplier yet', lines: [], total: 0, unpriced: 0 });
    }
    const o = g.get(id);
    const cost = Number(r.buy?.cost || r.p.cost || 0);
    o.lines.push({ productId: r.p.id, name: r.p.name, qty: r.qty, cost, priced: cost > 0 });
    o.total += r.qty * cost;
    if (!(cost > 0)) o.unpriced++;
  }
  return [...g.values()];
}

/** Status a purchase order can move to by hand. Printing or opening WhatsApp never changes it. */
export function nextStatus(status) {
  return status === 'Draft' ? 'Sent' : null;
}

// Kits (1.10.0): a kit is a RECIPE sold from its components' stock, not stock of its own. It is a `products` record
// with a `kit` field and no movements:
//   kit: { items: [{ productId, qty } | { service: true, name, price, cost }], icon, color, warning, ack, price, wholesale }
// - Available ("can make N") = the least, over the stock components, of floor(sellable stock ÷ quantity per kit).
// - Cost = the live sum of component cost × quantity (+ service costs). Price = the sum of component retail prices
//   × quantity (+ service prices), unless the kit has a fixed price.
// - Earliest expiry, Rx and controlled flags come from the components.
// - Selling: one sale line for the kit, `items[i].kit = { components: [{ id, name, qty, cost, alloc }], services }`,
//   and one "Sale" movement per component batch, so stock stays the sum of movements and offline sync is unchanged.
// Pure (no React): used by the web app, the cloud's sale checks (worker/anomalies.js) and the unit tests.

/** lucide icon names a kit can show at the till (src/components/KitIcon.jsx draws them) */
export const KIT_ICONS = ['test-tube', 'syringe', 'bandage', 'baby', 'heart-pulse', 'pill', 'package', 'stethoscope', 'droplet', 'shield-plus'];
/** kit colours (700-level: white text reads on every one; tests/unit-kits.mjs checks it) */
export const KIT_COLORS = ['#be185d', '#6d28d9', '#1d4ed8', '#0e7490', '#0f766e', '#15803d', '#b45309', '#c2410c', '#b91c1c', '#4338ca'];

const num = (v) => Number(v) || 0;
const r2 = (n) => Math.round(n * 100) / 100;

export const isKit = (p) => !!(p && p.kit && typeof p.kit === 'object');
/** a kit that is switched on (a kit can be kept but taken off the till) */
export const kitActive = (p) => isKit(p) && p.active !== false;

/** the kit's stock lines (with a medicine and a quantity above 0) and its service lines */
export function kitParts(kit) {
  const items = Array.isArray(kit?.items) ? kit.items : [];
  return {
    stock: items.filter((x) => x && !x.service && x.productId && num(x.qty) > 0).map((x) => ({ productId: String(x.productId), qty: num(x.qty) })),
    services: items.filter((x) => x && x.service && String(x.name || '').trim()).map((x) => ({ name: String(x.name).trim(), price: num(x.price), cost: num(x.cost) })),
  };
}

/** How many kits can be made: the least of floor(have ÷ need). stockOf(productId) → sellable units. Infinity when
 *  the kit has no stock lines (services only); 0 when a component is missing. */
export function canMake(stockLines, stockOf) {
  let n = Infinity;
  for (const x of stockLines) n = Math.min(n, Math.floor((num(stockOf(x.productId)) + 1e-9) / x.qty));
  return Math.max(0, n);
}

/** The components after this sale's swaps ({ [productId]: substituteId }); quantities of the same medicine add up */
export function withSwaps(stockLines, swaps = {}) {
  const m = new Map();
  for (const x of stockLines) { const id = String(swaps?.[x.productId] || x.productId); m.set(id, (m.get(id) || 0) + x.qty); }
  return [...m].map(([productId, qty]) => ({ productId, qty }));
}

/**
 * What a kit is right now. byId: Map(id → product as the store shows it, with .stock and .expiry) ·
 * stockOf(id) → sellable units (non-expired), default product.stock · swaps: this sale's substitutions.
 */
export function kitView(k, byId, { stockOf, swaps } = {}) {
  const { stock, services } = kitParts(k.kit);
  const lines = withSwaps(stock, swaps);
  const have = stockOf || ((id) => byId.get(id)?.stock || 0);
  const components = lines.map((x) => {
    const p = byId.get(x.productId);
    const h = num(have(x.productId));
    return { productId: x.productId, name: p?.name || 'Missing medicine', missing: !p, qty: x.qty, have: h, makes: Math.floor((h + 1e-9) / x.qty),
      cost: num(p?.cost), price: num(p?.price), wholesale: num(p?.wholesale) || num(p?.price), rx: !!p?.rx, controlled: !!p?.controlled, expiry: p?.expiry || '',
      swappedFrom: Object.entries(swaps || {}).find(([, to]) => String(to) === x.productId)?.[0] || '' };
  });
  const make = components.some((c) => c.missing) ? 0 : canMake(lines, have);
  const serviceCost = services.reduce((a, s) => a + s.cost, 0), servicePrice = services.reduce((a, s) => a + s.price, 0);
  const cost = r2(components.reduce((a, c) => a + c.cost * c.qty, 0) + serviceCost);
  const listPrice = r2(components.reduce((a, c) => a + c.price * c.qty, 0) + servicePrice);
  const listWholesale = r2(components.reduce((a, c) => a + c.wholesale * c.qty, 0) + servicePrice);
  const price = num(k.kit.price) > 0 ? num(k.kit.price) : listPrice;
  const wholesale = num(k.kit.wholesale) > 0 ? num(k.kit.wholesale) : num(k.kit.price) > 0 ? num(k.kit.price) : listWholesale;
  const stocked = components.filter((c) => c.have > 0 && c.expiry);
  const expiry = stocked.reduce((e, c) => (!e || c.expiry < e ? c.expiry : e), '');
  const short = components.filter((c) => c.makes === make).sort((a, b) => a.makes - b.makes);
  return {
    ...k, isKit: true, kitId: k.id, components, services,
    stock: make === Infinity ? 999999 : make, canMake: make === Infinity ? null : make,
    short: make === Infinity ? [] : short, cost, listPrice, price, wholesale,
    margin: price > 0 ? Math.round(((price - cost) / price) * 100) : null,
    expiry, rx: components.some((c) => c.rx) || !!k.rx, controlled: components.some((c) => c.controlled),
    generic: 'Kit: ' + [...components.map((c) => c.name), ...services.map((s) => s.name)].join(', '),
    form: 'Kit', unit: 'Kit', category: k.category || '',
  };
}

/** "Lancets running low": the component that limits the kit, in words ('' when nothing limits it) */
export function shortText(view) {
  if (!view || view.canMake == null) return '';
  const c = view.short?.[0];
  if (!c) return '';
  if (c.missing) return 'a medicine in this kit was deleted';
  return view.canMake === 0 ? `no ${c.name} (needs ${c.qty})` : `${c.name} running low (${c.have} left)`;
}

/** Units of each medicine a basket needs: plain lines by their quantity, kit lines by their components × kits */
export function basketDemand(lines) {
  const m = new Map();
  const add = (id, q) => m.set(String(id), (m.get(String(id)) || 0) + q);
  for (const l of lines || []) {
    if (l.kit) for (const c of l.kit.components || []) add(c.productId ?? c.id, num(c.qty) * num(l.qty));
    else add(l.id, num(l.qty));
  }
  return m;
}

/** The stock a sale line moved, per medicine and batch: [{ productId, batchId, qty }] (kit lines: their components) */
export function stockParts(item) {
  if (item?.kit && Array.isArray(item.kit.components)) {
    return item.kit.components.flatMap((c) => (c.alloc?.length ? c.alloc : [{ batchId: null, qty: num(c.qty) }]).map((a) => ({ productId: String(c.id), batchId: a.batchId ?? null, qty: num(a.qty) })));
  }
  return (item?.alloc?.length ? item.alloc : [{ batchId: null, qty: num(item?.qty) }]).map((a) => ({ productId: String(item.id), batchId: a.batchId ?? null, qty: num(a.qty) }));
}

/** The price a kit line should have, per kit (the cloud's sale check). products: Map(id → stored product). */
export function kitExpectedPrice(kitRec, products, wholesale) {
  if (!isKit(kitRec)) return 0;
  const fixed = wholesale ? num(kitRec.kit.wholesale) || num(kitRec.kit.price) : num(kitRec.kit.price);
  if (fixed > 0) return fixed;
  const { stock, services } = kitParts(kitRec.kit);
  let sum = services.reduce((a, s) => a + s.price, 0);
  for (const x of stock) {
    const p = products.get(x.productId);
    if (!p) return 0; // a component the cloud doesn't know: no check
    sum += (wholesale ? num(p.wholesale) || num(p.price) : num(p.price)) * x.qty;
  }
  return r2(sum);
}

/** Ready-made kits (recommendation 2): each line is matched to the pharmacy's own medicines by name */
export const KIT_TEMPLATES = [
  { key: 'hiv', name: 'HIV Test Kit', icon: 'test-tube', color: '#be185d', warning: 'Pre-test counselling first. Give the result in private; refer a reactive result for confirmation.', ack: true,
    items: [{ find: ['hiv test', 'hiv strip', 'determine'], qty: 1 }, { find: ['lancet'], qty: 1 }, { find: ['alcohol swab', 'swab'], qty: 1 }, { find: ['water for injection', 'wfi'], qty: 1 }] },
  { key: 'malaria', name: 'Malaria RDT Kit', icon: 'droplet', color: '#b91c1c', warning: 'Test before treating: give antimalarials only for a positive result.', ack: false,
    items: [{ find: ['malaria rdt', 'malaria test', 'mrdt'], qty: 1 }, { find: ['lancet'], qty: 1 }, { find: ['alcohol swab', 'swab'], qty: 1 }, { find: ['glove'], qty: 2 }] },
  { key: 'pregnancy', name: 'Pregnancy Test Kit', icon: 'baby', color: '#6d28d9', warning: 'Explain how to read the result; a faint line counts as positive.', ack: false,
    items: [{ find: ['pregnancy test', 'hcg'], qty: 1 }, { find: ['urine container', 'specimen'], qty: 1 }] },
  { key: 'injection', name: 'Injection Set', icon: 'syringe', color: '#1d4ed8', warning: 'Single use: one needle and syringe per patient.', ack: true,
    items: [{ find: ['syringe'], qty: 1 }, { find: ['needle'], qty: 1 }, { find: ['alcohol swab', 'swab'], qty: 1 }, { find: ['water for injection', 'wfi'], qty: 1 }] },
  { key: 'wound', name: 'Wound Dressing Kit', icon: 'bandage', color: '#0f766e', warning: '', ack: false,
    items: [{ find: ['gauze'], qty: 2 }, { find: ['bandage', 'crepe'], qty: 1 }, { find: ['plaster', 'strapping'], qty: 1 }, { find: ['povidone', 'iodine', 'antiseptic'], qty: 1 }, { find: ['glove'], qty: 2 }] },
  { key: 'mama', name: 'Mama Kit', icon: 'heart-pulse', color: '#c2410c', warning: 'For a clean delivery: check every item is sealed.', ack: false,
    items: [{ find: ['cotton wool'], qty: 1 }, { find: ['glove'], qty: 2 }, { find: ['razor', 'blade'], qty: 1 }, { find: ['cord tie', 'cord clamp', 'thread'], qty: 1 }, { find: ['plastic sheet', 'mackintosh'], qty: 1 }, { find: ['sanitary pad', 'maternity pad', 'pad'], qty: 2 }, { find: ['soap'], qty: 1 }] },
];

const fold = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

/** A template's lines matched to the pharmacy's medicines: in-stock first, then the shortest name. Lines with no
 *  match come back with productId '' and the words searched, for the person to choose. */
export function matchTemplate(t, products) {
  const list = (products || []).filter((p) => !isKit(p));
  return t.items.map((it) => {
    let best = null;
    for (const w of it.find) {
      const f = fold(w);
      const hits = list.filter((p) => fold(`${p.name} ${p.generic || ''}`).includes(f));
      hits.sort((a, b) => ((b.stock || 0) > 0) - ((a.stock || 0) > 0) || a.name.length - b.name.length);
      if (hits[0]) { best = hits[0]; break; }
    }
    return { productId: best?.id || '', qty: it.qty, looking: it.find[0] };
  });
}

/** The medicines a sale line used up, as [productId, units]: a kit line counts its components (reorder levels and
 *  "how fast it sells" see the lancets a kit used), a plain line itself */
export function unitsUsed(item) {
  if (item?.kit && Array.isArray(item.kit.components)) return item.kit.components.map((c) => [String(c.id), num(c.qty)]);
  return [[String(item?.id ?? ''), num(item?.qty)]];
}

/** "Contains 1 × HIV Test Strip, 2 × Blood Lancets, Testing fee · Safety Lancets instead of Blood Lancets" for a
 *  receipt, per kit ('' for a plain line) */
export function kitContents(item) {
  const k = item?.kit;
  if (!k || !Array.isArray(k.components)) return '';
  const n = num(item.qty) || 1;
  const parts = [...k.components.map((c) => `${r2(num(c.per) || num(c.qty) / n)} × ${c.name}`), ...(k.services || []).map((s) => s.name)];
  const swaps = k.components.filter((c) => c.swappedFromName).map((c) => `${c.name} instead of ${c.swappedFromName}`);
  return `Contains ${parts.join(', ')}${swaps.length ? ' · ' + swaps.join(', ') : ''}`;
}

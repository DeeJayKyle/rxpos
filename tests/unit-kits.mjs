// Kits (1.10.0, src/kits.js): can make N, live cost and price, fixed price, expiry / Rx / CD from the components,
// services, swaps, the basket's stock demand, the stock a sale line moved, the cloud's expected kit price, templates.
//   node unit-kits.mjs
import { kitView, kitParts, canMake, withSwaps, shortText, basketDemand, stockParts, kitExpectedPrice, matchTemplate, KIT_TEMPLATES, KIT_COLORS, isKit, kitActive } from '../src/kits.js';
import { contrast } from '../src/themes.js';
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + JSON.stringify(x) : ''}`); };

const P = [
  { id: 'strip', name: 'HIV Test Strip', price: 5000, wholesale: 4500, cost: 3000, stock: 10, expiry: '2028-03-31' },
  { id: 'lancet', name: 'Blood Lancets', price: 100, cost: 40, stock: 7, expiry: '2029-01-31' },
  { id: 'swab', name: 'Alcohol Swabs', price: 50, cost: 20, stock: 100, expiry: '2027-12-31', rx: false },
  { id: 'wfi', name: 'Water for Injection 10ml', price: 500, cost: 250, stock: 20, expiry: '2027-06-30', rx: true },
  { id: 'lancet2', name: 'Safety Lancets', price: 150, cost: 60, stock: 30, expiry: '2030-01-31' },
  { id: 'pethidine', name: 'Pethidine 50mg', price: 3000, cost: 1500, stock: 4, controlled: true, rx: true },
];
const byId = new Map(P.map((p) => [p.id, p]));
const kit = { id: 'k1', name: 'HIV Test Kit', kit: { items: [{ productId: 'strip', qty: 1 }, { productId: 'lancet', qty: 2 }, { productId: 'swab', qty: 2 }, { productId: 'wfi', qty: 1 }, { service: true, name: 'Testing fee', price: 2000, cost: 0 }], icon: 'test-tube', color: '#be185d', warning: 'Counsel first', ack: true } };

check('a kit is a product with a kit field', isKit(kit) && !isKit(P[0]) && kitActive(kit) && !kitActive({ ...kit, active: false }));
const parts = kitParts(kit.kit);
check('stock lines and service lines are told apart', parts.stock.length === 4 && parts.services.length === 1 && parts.services[0].price === 2000, parts);
check('lines with no medicine or a zero quantity are ignored', kitParts({ items: [{ productId: '', qty: 1 }, { productId: 'x', qty: 0 }, { service: true, name: ' ' }] }).stock.length === 0);

let v = kitView(kit, byId);
check('can make = the least of stock ÷ quantity (lancets: 7 ÷ 2 = 3)', v.canMake === 3 && v.stock === 3, v.canMake);
check('the short component is named', v.short[0].productId === 'lancet' && /Blood Lancets running low \(7 left\)/.test(shortText(v)), shortText(v));
check('cost = the live sum of components × quantity + services', v.cost === 3000 + 80 + 40 + 250 + 0, v.cost);
check('price = the sum of retail prices × quantity + services', v.price === 5000 + 200 + 100 + 500 + 2000 && v.listPrice === v.price, v.price);
check('margin is shown', v.margin === Math.round(((7800 - 3370) / 7800) * 100), v.margin);
check('earliest expiry of the components', v.expiry === '2027-06-30', v.expiry);
check('Rx comes from a component', v.rx === true && v.controlled === false);
check('the kit is found by its contents (generic)', /HIV Test Strip/.test(v.generic) && /Testing fee/.test(v.generic));

v = kitView({ ...kit, kit: { ...kit.kit, price: 9000 } }, byId);
check('a fixed kit price wins over the sum', v.price === 9000 && v.listPrice === 7800 && v.wholesale === 9000, [v.price, v.wholesale]);
check('wholesale without a fixed price is the sum of wholesale prices', kitView(kit, byId).wholesale === 4500 + 200 + 100 + 500 + 2000);

v = kitView(kit, byId, { stockOf: (id) => (id === 'strip' ? 0 : byId.get(id).stock) });
check('sellable stock (not expired) is what counts: none → 0', v.canMake === 0 && /no HIV Test Strip/.test(shortText(v)), shortText(v));
check('a deleted component: none can be made', kitView({ ...kit, kit: { items: [{ productId: 'gone', qty: 1 }] } }, byId).canMake === 0);
check('a kit of services only is always available', kitView({ id: 's', name: 'Consult', kit: { items: [{ service: true, name: 'BP check', price: 1000 }] } }, byId).canMake === null);
check('a controlled component makes the kit controlled', kitView({ id: 'c', name: 'Pain kit', kit: { items: [{ productId: 'pethidine', qty: 1 }, { productId: 'swab', qty: 1 }] } }, byId).controlled === true);

// swaps (recommendation 3)
check('withSwaps replaces a component for this sale', JSON.stringify(withSwaps(parts.stock, { lancet: 'lancet2' })) === JSON.stringify([{ productId: 'strip', qty: 1 }, { productId: 'lancet2', qty: 2 }, { productId: 'swab', qty: 2 }, { productId: 'wfi', qty: 1 }]));
check('…two lines of the same medicine add up', withSwaps([{ productId: 'a', qty: 1 }, { productId: 'b', qty: 2 }], { b: 'a' })[0].qty === 3);
v = kitView(kit, byId, { swaps: { lancet: 'lancet2' } });
check('a swap lifts the limit (safety lancets: 30 ÷ 2 = 15, strips 10)', v.canMake === 10 && v.components.find((c) => c.productId === 'lancet2').swappedFrom === 'lancet', v.canMake);
check('…and the cost follows the substitute', v.cost === 3000 + 120 + 40 + 250, v.cost);
check('canMake with no lines is Infinity', canMake([], () => 0) === Infinity);

// the basket
const basket = [{ id: 'lancet', qty: 3 }, { id: 'k1', qty: 2, kit: { components: [{ productId: 'lancet', qty: 2 }, { productId: 'strip', qty: 1 }] } }];
const dm = basketDemand(basket);
check('a basket needs plain lines plus kit components × kits', dm.get('lancet') === 3 + 4 && dm.get('strip') === 2, [...dm]);

// the stock a sale line moved
const saleKit = { id: 'k1', qty: 2, kit: { components: [{ id: 'strip', qty: 2, alloc: [{ batchId: 'b1', qty: 1 }, { batchId: 'b2', qty: 1 }] }, { id: 'lancet', qty: 4, alloc: [] }] } };
const sp = stockParts(saleKit);
check('a kit line moved its components\' batches', sp.length === 3 && sp[0].productId === 'strip' && sp[0].batchId === 'b1' && sp[2].productId === 'lancet' && sp[2].qty === 4 && sp[2].batchId === null, sp);
check('a plain line moved its own batches', stockParts({ id: 'x', qty: 3, alloc: [{ batchId: 'z', qty: 3 }] })[0].batchId === 'z' && stockParts({ id: 'x', qty: 3 })[0].qty === 3);

// the cloud's expected price
const stored = new Map(P.map((p) => [p.id, p]));
check('expected kit price: the live sum', kitExpectedPrice(kit, stored, false) === 7800);
check('…the fixed price when set', kitExpectedPrice({ ...kit, kit: { ...kit.kit, price: 9000 } }, stored, false) === 9000);
check('…no check when a component is unknown', kitExpectedPrice({ ...kit, kit: { items: [{ productId: 'nope', qty: 1 }] } }, stored, false) === 0);

// templates (recommendation 2)
const shelf = [...P, { id: 'glove', name: 'Examination Gloves (pair)', stock: 50 }, { id: 'hivold', name: 'HIV Test Strip (old)', stock: 0 }];
const m = matchTemplate(KIT_TEMPLATES.find((t) => t.key === 'hiv'), shelf);
check('the HIV template finds the pharmacy\'s own medicines', m.map((x) => x.productId).join() === 'strip,lancet2,swab,wfi' || m.map((x) => x.productId).join() === 'strip,lancet,swab,wfi', m);
check('…in-stock medicines first', m[0].productId === 'strip');
const mm = matchTemplate(KIT_TEMPLATES.find((t) => t.key === 'mama'), shelf);
check('a line with no match is left for the person to choose', mm.some((x) => x.productId === '' && x.looking === 'cotton wool'));
check('there are six ready-made kits', KIT_TEMPLATES.length === 6);
for (const c of KIT_COLORS) { const r = contrast('#ffffff', c); check(`white on kit colour ${c}`, r >= 4.5, r.toFixed(2)); }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

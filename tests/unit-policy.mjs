// Server write policy (workplan step 2, worker/policy.js): which staff may create, change or delete which records.
//   node unit-policy.mjs
import { decide, isRefundOnly, MOVEMENT_RULES } from '../worker/policy.js';
import { DEFAULT_ROLES } from '../src/access.js';
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + String(x) : ''}`); };

const permsOf = (id) => new Set(DEFAULT_ROLES.find((r) => r.id === id).permissions);
const as = (role) => { const p = permsOf(role); return (ch, old = null) => decide(ch, old, role, (perm) => role === 'admin' || p.has(perm)); };
const cashier = as('cashier'), dispenser = as('dispenser'), pharmacist = as('pharmacist'), manager = as('manager'), admin = as('admin');
const ok = async (p) => (await p).ok;

const sale = { id: 's1', number: 'R1', type: 'retail', branchId: 'main', items: [{ id: 'p1', qty: 2, price: 1000, name: 'Amox' }], subtotal: 2000, discount: 0, tax: 0, total: 2000, paid: 2000, payment: 'Cash', customerId: 'walk-in', status: 'completed' };
const refunded = { ...sale, status: 'refunded', refundedBy: 'Pam', refundedAt: '2026-11-09T10:00:00Z', updatedAt: '2026-11-09T10:00:00Z' };
const repriced = { ...sale, items: [{ id: 'p1', qty: 2, price: 1 }], subtotal: 2, total: 2, paid: 2 };
const S = (rec, deleted) => ({ t: 'sales', id: 's1', rec, deleted });

// sales
check('a cashier can record a new sale', await ok(cashier(S(sale))));
check('a cashier cannot change a past sale', !(await ok(cashier(S(repriced), sale))));
check('a cashier cannot refund (no sales.refund)', !(await ok(cashier(S(refunded), sale))));
check('a cashier may re-send an unchanged sale (older apps)', await ok(cashier(S({ ...sale, updatedAt: 'later' }), sale)));
check('a pharmacist can refund', await ok(pharmacist(S(refunded), sale)));
const refundOnlyRole = (ch, old) => decide(ch, old, 'refunder', (p) => p === 'sales.refund');
check('refund-only permission refunds, keeping the money as it was', await ok(refundOnlyRole(S(refunded), sale)));
check('refund-only permission cannot change the money while refunding', !(await ok(refundOnlyRole(S({ ...refunded, total: 1 }), sale))));
check('refund-only permission cannot re-price a sale', !(await ok(refundOnlyRole(S(repriced), sale))));
check('a pharmacist (sales.edit) can edit a past sale', await ok(pharmacist(S(repriced), sale)));
check('nobody but an admin deletes a sale: pharmacist refused', !(await ok(pharmacist(S(null, true), sale))));
check('nobody but an admin deletes a sale: manager refused', !(await ok(manager(S(null, true), sale))));
check('an admin can delete a sale', await ok(admin(S(null, true), sale)));
check('refund detection ignores key order and extra name fields', isRefundOnly(sale, { ...refunded, items: [{ price: 1000, qty: 2, id: 'p1' }] }));
check('refund detection: numbers sent as 2000.0 still match', isRefundOnly(sale, JSON.parse(JSON.stringify(refunded).replace('"total":2000', '"total":2000.0'))));

// prices, stock and money
const P = (rec, deleted) => ({ t: 'products', id: 'p1', rec, deleted });
check('a cashier cannot change a medicine price', !(await ok(cashier(P({ name: 'Amox', price: 1 })))));
check('a dispenser cannot change a medicine price', !(await ok(dispenser(P({ name: 'Amox', price: 1 })))));
check('a pharmacist (medicines.manage) can', await ok(pharmacist(P({ name: 'Amox', price: 1200 }))));
check('a cashier cannot delete a medicine', !(await ok(cashier(P(null, true)))));
check('a cashier cannot add an expense', !(await ok(cashier({ t: 'expenses', id: 'e1', rec: { amount: 50000 } }))));
check('a cashier cannot add a bank transaction', !(await ok(cashier({ t: 'bankTx', id: 'b1', rec: { amount: 1 } }))));
check('a manager (finance) can add an expense', await ok(manager({ t: 'expenses', id: 'e1', rec: { amount: 50000 } })));
check('payroll books salaries as expenses', await ok(decide({ t: 'expenses', id: 'e2', rec: {} }, null, 'hr', (p) => p === 'payroll')));
check('a cashier can add a customer (new client at the till)', await ok(cashier({ t: 'customers', id: 'c1', rec: { name: 'Ann' } })));
check('a cashier cannot add a supplier', !(await ok(cashier({ t: 'suppliers', id: 'x', rec: { name: 'X' } }))));
check('receiving stock may add a supplier on the spot', await ok(decide({ t: 'suppliers', id: 'x', rec: {} }, null, 'r', (p) => p === 'stock.receive')));
check('a customer debt payment can be recorded with customers', await ok(cashier({ t: 'payments', id: 'pay1', rec: { amount: 5 } })));
check('…but not changed afterwards without finance', !(await ok(cashier({ t: 'payments', id: 'pay1', rec: { amount: 500 } }, { amount: 5 }))));
check('a cashier cannot record a delivery', !(await ok(cashier({ t: 'purchases', id: 'g1', rec: { total: 1 } }))));
check('a pharmacist records a delivery', await ok(pharmacist({ t: 'purchases', id: 'g1', rec: { total: 1 } })));
check('changing a delivery needs purchases.edit', !(await ok(decide({ t: 'purchases', id: 'g1', rec: {} }, { total: 1 }, 'r', (p) => p === 'stock.receive'))));
check('a cashier can mark a proforma converted (selling it)', await ok(cashier({ t: 'proformas', id: 'pf', rec: { status: 'Converted' } })));
check('a cashier cannot delete a proforma', !(await ok(cashier({ t: 'proformas', id: 'pf', deleted: true }))));

// stock movements by type
const M = (type, qty = type === 'Refund' ? 1 : -1, ref = 'R-1') => ({ t: 'movements', id: 'm-' + type, rec: { type, qty, productId: 'p1', ref } }); // a refund puts stock back; both apps always name the receipt
check('a cashier records the stock movement of a sale', await ok(cashier(M('Sale'))));
check('…but not a Sale movement that names no receipt (2026-11-17 audit)', !(await ok(cashier(M('Sale', -1, '')))));
for (const type of ['Inventory edit', 'Expired write-off', 'Stock count', 'Purchase', 'Refund', 'Sale edit', 'Transfer out', 'Opening stock'])
  check(`a cashier cannot record a "${type}" movement`, !(await ok(cashier(M(type)))));
check('an unknown movement type needs stock.adjust', !(await ok(dispenser(M('Mystery')))) && (await ok(pharmacist(M('Mystery')))));
check('a pharmacist records refunds and write-offs', (await ok(pharmacist(M('Refund')))) && (await ok(pharmacist(M('Expired write-off')))));
check('every movement type the apps use has a rule', ['Adjustment', 'Sale', 'Sale edit', 'Refund', 'Purchase', 'Purchase edit', 'Opening stock', 'Inventory edit', 'Expired write-off', 'Stock count', 'Supplier return', 'Transfer in', 'Transfer out'].every((t) => MOVEMENT_RULES[t]));

// open tables stay open
check('chat, drafts and the calendar stay open to everyone', (await ok(cashier({ t: 'messages', id: 'x', rec: {} }))) && (await ok(cashier({ t: 'drafts', id: 'x', rec: {} }))) && (await ok(cashier({ t: 'events', id: 'x', rec: {} }))));
check('an admin can do everything', (await ok(admin(P(null, true)))) && (await ok(admin({ t: 'bankTx', id: 'b', deleted: true }))));

// step 22: insurers and their schemes
const I = (deleted) => ({ t: 'insurers', id: 'i1', rec: deleted ? undefined : { name: 'Jubilee', schemes: [] }, deleted });
check('insurers: staff who manage clients (or Finance) may add one; deleting needs Finance', (await ok(manager(I()))) && !(await ok(dispenser(I()))) === !permsOf('dispenser').has('customers') && (await ok(admin(I(true)))) && !(await ok(cashier(I(true)))));

// 2026-11 audit
check('a "Sale" movement must take stock out', !(await ok(cashier(M('Sale', 500)))) && (await ok(cashier(M('Sale', -2)))));
check('a "Refund" movement must put stock back', !(await ok(pharmacist(M('Refund', -3)))));
check('an unknown table is refused, even a prototype name', !(await ok(cashier({ t: 'zzJunk', id: 'x', rec: {} }))) && !(await ok(cashier({ t: '__proto__', id: 'x', rec: {} }))) && !(await ok(cashier({ t: 'constructor', id: 'x', rec: {} }))));
const S0 = { id: 's1', number: 'R-1', date: '2026-11-10T10:00:00Z', cashier: 'Ann', items: [{ id: 'p1', qty: 1, price: 1000 }], subtotal: 1000, total: 1000, paid: 1000, payment: 'Cash', status: 'completed' };
const cashierOld = (old, rec) => decide({ t: 'sales', id: 's1', rec }, old, 'cashier', (p) => ['pos.sell', 'sales.view'].includes(p)).then((v) => v.ok);
check('a cashier cannot move a sale to another day', !(await cashierOld(S0, { ...S0, date: '2025-01-01T09:00:00Z' })));
check('…put it under another cashier', !(await cashierOld(S0, { ...S0, cashier: 'Bob' })));
check('…or renumber it', !(await cashierOld(S0, { ...S0, number: 'R-2' })));
check('…but can send the same sale again', await cashierOld(S0, { ...S0, updatedAt: 'x' }));
check('a refund that also re-dates the sale is not a refund', !isRefundOnly(S0, { ...S0, status: 'refunded', date: '2025-01-01T00:00:00Z' }) && isRefundOnly(S0, { ...S0, status: 'refunded', refundedBy: 'Ann', refundedAt: 'now' }));
const PF = { id: 'pf', number: 'PF-1', status: 'Open', items: [{ id: 'p1', qty: 1, price: 1000 }], discount: 0, total: 1000 };
const pfBy = (role, can, old, rec, deleted = false) => decide({ t: 'proformas', id: 'pf', rec, deleted }, old, role, can).then((v) => v.ok);
const sells = (p) => p === 'pos.sell';
check('the classic till may still save a new proforma for anyone who sells', await pfBy('cashier', sells, null, PF));
check('a seller may sell (convert) a proforma', await pfBy('cashier', sells, PF, { ...PF, status: 'Converted', saleNumber: 'R-1' }));
check('…but not change its prices or discount', !(await pfBy('cashier', sells, PF, { ...PF, discount: 900 })) && !(await pfBy('cashier', sells, PF, { ...PF, items: [{ id: 'p1', qty: 1, price: 10 }] })));
check('someone with Proformas may edit it', await pfBy('pharmacist', (p) => p === 'proformas', PF, { ...PF, discount: 900 }));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

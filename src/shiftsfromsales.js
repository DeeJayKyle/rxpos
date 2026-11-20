// Past sales made outside any shift → the shifts they were (the owner's request, 2026-11-20): each person's sales at a
// branch on one day become one shift, from their first sale to their last. Pure (tested in tests/unit-shifts-from-sales.mjs).
// NOTHING is written by this module: Shifts → "Past sales without a shift" shows what it would create, and only the
// owner's approval saves it (the owner's law: no change to the pharmacy's data without their approval).
// A rebuilt shift has no opening float and no cash count (nobody counted the drawer then): `rebuilt: true`,
// `counted` and `variance` are null and it is shown as "rebuilt from sales", never as balanced or short.

const MAIN = 'main';
const localDay = (iso) => { const d = new Date(iso); return isNaN(d) ? String(iso || '').slice(0, 10) : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

/** Is a sale inside one of the existing shifts (the same person, branch and time, as Shifts' shiftSummary counts it)? */
const covered = (sale, shifts, nowIso) => shifts.some((sh) => sh.user === sale.cashier && (sh.branchId || MAIN) === (sale.branchId || MAIN)
  && sale.date >= sh.openedAt && sale.date <= (sh.closedAt || nowIso));

/**
 * The shifts to create: [{ key, user, userId, branchId, day, openedAt, closedAt, sales: n, total }], oldest first.
 * users: the pharmacy's people (to find each cashier's id by name); training sales and sales with no cashier are left out.
 */
export function shiftsFromSales(sales = [], shifts = [], users = [], nowIso = new Date().toISOString()) {
  const idOf = new Map(users.map((u) => [String(u.name || '').trim().toLowerCase(), u.id]));
  const groups = new Map();
  for (const s of sales) {
    if (!s || !s.date || !s.cashier || s.training || covered(s, shifts, nowIso)) continue;
    const branchId = s.branchId || MAIN, day = localDay(s.date), key = `${s.cashier}|${branchId}|${day}`;
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { key, user: s.cashier, userId: s.cashierId || idOf.get(String(s.cashier).trim().toLowerCase()) || '', branchId, day, openedAt: s.date, closedAt: s.date, sales: 0, total: 0 }));
    if (s.date < g.openedAt) g.openedAt = s.date;
    if (s.date > g.closedAt) g.closedAt = s.date;
    g.sales++;
    if (s.status !== 'refunded') g.total += Number(s.total) || 0;
  }
  return [...groups.values()].sort((a, b) => a.openedAt.localeCompare(b.openedAt) || a.user.localeCompare(b.user));
}

/** A planned shift → the shift record to save (summary added by the caller) */
export const rebuiltShift = (g, id) => ({ id, userId: g.userId, user: g.user, branchId: g.branchId, openedAt: g.openedAt, closedAt: g.closedAt, date: g.openedAt, float: 0, rebuilt: true, counts: {}, counted: null, variance: null, note: 'Rebuilt from past sales (no cash count)' });

// Role-based landing and navigation (UX review, Nov 2026). Where a person lands after signing in, and which pages
// sit in the phone's bottom bar, follow what their role does: people who sell and don't see reports (the built-in
// pharmacist, dispenser and cashier roles, or any custom role like them) land on the till; administrators and
// managers on the dashboard. The bottom bar only offers pages the role may open (a cashier had a "Stock" tab that
// sent them back home).
const TILL_ROLES = new Set(['pharmacist', 'dispenser', 'cashier']);

/** The page a person lands on after signing in. role: the role id; can: (permission) → bool */
export function homeFor(role, can) {
  if (!can('pos.sell')) return '/';
  if (TILL_ROLES.has(role)) return '/pos';
  if (role === 'admin' || role === 'manager') return '/';
  return can('reports') ? '/' : '/pos';
}

/** The phone's bottom bar: up to two pages either side of Sell, all ones this role may open. */
export function bottomTabs(can, has = () => true) {
  const ok = (perm, path) => (!perm || can(perm)) && has(path);
  const left = [['/', 'Home', null], ['/inventory', 'Stock', 'inventory.view'], ['/customers', 'Clients', 'customers'], ['/prescriptions', 'Rx', 'prescriptions']]
    .filter(([path, , perm]) => ok(perm, path)).slice(0, 2);
  const right = [['/sales', 'Sales', 'sales.view'], ['/shifts', 'Shift', 'shifts']].filter(([path, , perm]) => ok(perm, path)).slice(0, 1);
  return { left, sell: can('pos.sell') && has('/pos'), right };
}

/** F8 (UI batch 3): the pages a person may put in the phone's bottom bar: [path, label, permission] */
export const BAR_CHOICES = [['/', 'Home', null], ['/inventory', 'Stock', 'inventory.view'], ['/customers', 'Clients', 'customers'], ['/prescriptions', 'Rx', 'prescriptions'],
  ['/sales', 'Sales', 'sales.view'], ['/shifts', 'Shift', 'shifts'], ['/expiry', 'Expiry', 'inventory.view'], ['/add-stock', 'Add stock', 'stock.receive'],
  ['/chat', 'Chat', 'chat'], ['/reports', 'Reports', 'reports'], ['/expenses', 'Expenses', 'finance']];

/** F8: this device's own four bottom-bar pages (chosen: [path…]), two either side of Sell; More is always last. Pages
 *  this role may not open are left out; with no choice, the role's standard bar (bottomTabs). */
export function chosenTabs(chosen, can, has = () => true) {
  const ok = BAR_CHOICES.filter(([path, , perm]) => (!perm || can(perm)) && has(path));
  const picked = (chosen || []).filter(Boolean).map((p) => ok.find(([path]) => path === p)).filter(Boolean).slice(0, 4);
  if (!picked.length) return bottomTabs(can, has);
  return { left: picked.slice(0, 2), sell: can('pos.sell') && has('/pos'), right: picked.slice(2, 4) };
}

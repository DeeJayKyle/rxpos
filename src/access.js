// Roles, permissions and feature switches.
// A user's role (e.g. "dispenser") maps to a list of permission keys. Admin always has everything.
// Features are switched on or off per pharmacy by the RxPOS owner only (owner console → licence).

export const PERMISSIONS = [
  ['Selling', [
    ['pos.sell', 'Sell at the POS (retail)'],
    ['pos.wholesale', 'Sell wholesale'],
    ['pos.discount', 'Give discounts'],
    ['pos.price_edit', 'Change prices at the POS'],
    ['sales.view', 'See sales history'],
    ['sales.refund', 'Refund sales'],
    ['proformas', 'Proformas'],
    ['shifts', 'Open/close own shift (cash-up)'],
    ['shifts.all', 'See and close everyone\'s shifts'],
  ]],
  ['Patients & people', [
    ['prescriptions', 'Record & dispense prescriptions'],
    ['customers', 'Customers (view & add)'],
    ['suppliers', 'Suppliers'],
    ['reminders', 'Send reminders (WhatsApp / SMS)'],
    ['chat', 'Team chat & client messages'],
  ]],
  ['Medicines & stock', [
    ['inventory.view', 'See stock, expiry and stock cards'],
    ['medicines.manage', 'Add/edit medicines, prices, import, labels'],
    ['stock.receive', 'Receive stock, purchase orders, reorder'],
    ['stock.adjust', 'Stock counts, adjustments, write-offs'],
    ['transfers', 'Stock transfers between branches'],
  ]],
  ['Management', [
    ['finance', 'Finance (expenses, banks, loans, cash book)'],
    ['reports', 'Reports & dashboard money figures'],
    ['branches.view', 'See all branches'],
    ['audit', 'Audit log'],
    ['users.manage', 'Manage users & roles'],
    ['settings.manage', 'Settings & payment methods'],
    ['data.reset', 'Restore default settings'],
  ]],
];
export const ALL_PERMISSIONS = PERMISSIONS.flatMap(([, list]) => list.map(([k]) => k));

const t0 = '2000-01-01T00:00:00.000Z';
export const DEFAULT_ROLES = [
  { id: 'admin', name: 'Administrator', builtIn: true, permissions: ALL_PERMISSIONS },
  { id: 'manager', name: 'Manager', builtIn: true, permissions: ALL_PERMISSIONS.filter((p) => !['settings.manage', 'data.reset'].includes(p)) },
  { id: 'pharmacist', name: 'Pharmacist', builtIn: true, permissions: ['pos.sell', 'pos.wholesale', 'pos.discount', 'sales.view', 'sales.refund', 'proformas', 'shifts', 'prescriptions', 'customers', 'suppliers', 'reminders', 'chat', 'inventory.view', 'medicines.manage', 'stock.receive', 'stock.adjust', 'transfers', 'reports'] },
  { id: 'dispenser', name: 'Dispenser', builtIn: true, permissions: ['pos.sell', 'sales.view', 'shifts', 'prescriptions', 'customers', 'chat', 'inventory.view'] },
  { id: 'cashier', name: 'Cashier', builtIn: true, permissions: ['pos.sell', 'sales.view', 'shifts', 'customers', 'chat'] },
].map((r) => ({ ...r, updatedAt: t0 }));

export const FEATURES = [
  ['branches', 'Multiple branches & transfers', 'Off = single-branch pharmacy'],
  ['wholesale', 'Wholesale POS & prices'],
  ['proformas', 'Proformas / quotations'],
  ['prescriptions', 'Prescriptions & refills'],
  ['finance', 'Finance (expenses, banks, loans, debtors)'],
  ['reports', 'Reports'],
  ['reminders', 'WhatsApp / SMS reminders'],
  ['chat', 'Team chat & client messages'],
  ['labels', 'Barcode labels'],
  ['import', 'Import medicines'],
  ['reorder', 'Reorder & dead stock'],
  ['momo', 'Mobile Money payments'],
  ['drugInfo', 'Drug information & references'],
  ['shifts', 'Shifts & close-of-day cash-up'],
  ['promos', 'Idle-screen promotions & WhatsApp sharing', 'Shown only when the app is idle'],
  ['hourly', 'Hourly time reminders'],
  ['calendar', 'Calendar & calendar sync', 'Google / Outlook / phone'],
  ['weather', 'Weather & storage temperature log'],
];
export const DEFAULT_FEATURES = Object.fromEntries(FEATURES.map(([k]) => [k, true]));

/** Effective features: exactly what the RxPOS owner set for this pharmacy (anything new defaults to on). */
export function featureSet(db) {
  const lic = db.license?.[0]?.features || {};
  return Object.fromEntries(FEATURES.map(([k]) => [k, lic[k] !== false]));
}

/** Roles in use: defaults, overridden/extended by the pharmacy's own role records. */
export function rolesOf(db) {
  const custom = new Map((db.roles || []).map((r) => [r.id, r]));
  const base = DEFAULT_ROLES.map((r) => (custom.has(r.id) ? { ...r, ...custom.get(r.id), builtIn: true } : r));
  for (const r of custom.values()) if (!DEFAULT_ROLES.some((d) => d.id === r.id)) base.push(r);
  return base;
}

export function permissionsOf(db, role) {
  if (role === 'admin') return new Set(ALL_PERMISSIONS);
  return new Set(rolesOf(db).find((r) => r.id === role)?.permissions || []);
}

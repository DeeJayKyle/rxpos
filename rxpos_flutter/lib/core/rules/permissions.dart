// Roles and permissions, ported from src/access.js.
import '../entities/people.dart';

const allPermissions = [
  'pos.sell', 'pos.wholesale', 'pos.discount', 'pos.price_edit', 'sales.view', 'sales.refund', 'sales.edit', 'proformas',
  'shifts', 'shifts.all', 'prescriptions', 'customers', 'suppliers', 'reminders', 'chat', 'inventory.view',
  'medicines.manage', 'stock.receive', 'purchases.edit', 'inventory.edit', 'stock.count', 'stock.adjust', 'transfers',
  'finance', 'payroll', 'reports', 'reports.lines', 'branches.view', 'audit', 'day.close', 'users.manage', 'settings.manage', 'data.reset',
];

const _t0 = '2000-01-01T00:00:00.000Z';

final defaultRoles = <Role>[
  const Role(id: 'admin', name: 'Administrator', builtIn: true, permissions: allPermissions, updatedAt: _t0),
  Role(id: 'manager', name: 'Manager', builtIn: true, updatedAt: _t0,
      permissions: allPermissions.where((p) => p != 'settings.manage' && p != 'data.reset').toList()),
  const Role(id: 'pharmacist', name: 'Pharmacist', builtIn: true, updatedAt: _t0, permissions: [
    'pos.sell', 'pos.wholesale', 'pos.discount', 'sales.view', 'sales.refund', 'sales.edit', 'purchases.edit',
    'proformas', 'shifts', 'prescriptions', 'customers', 'suppliers', 'reminders', 'chat', 'inventory.view',
    'medicines.manage', 'stock.receive', 'stock.count', 'stock.adjust', 'transfers', 'reports',
  ]),
  const Role(id: 'dispenser', name: 'Dispenser', builtIn: true, updatedAt: _t0,
      permissions: ['pos.sell', 'sales.view', 'shifts', 'prescriptions', 'customers', 'chat', 'inventory.view', 'stock.count']),
  const Role(id: 'cashier', name: 'Cashier', builtIn: true, updatedAt: _t0,
      permissions: ['pos.sell', 'sales.view', 'shifts', 'customers', 'chat', 'reports.lines']),
];

/// Roles in use: the defaults, overridden or extended by the pharmacy's own role records.
List<Role> rolesOf(Iterable<Role> custom) {
  final byId = {for (final r in custom) r.id: r};
  final out = [
    for (final r in defaultRoles)
      if (byId[r.id] case final c?) c.copyWith(builtIn: true, name: c.name.isEmpty ? r.name : c.name) else r,
  ];
  out.addAll(custom.where((r) => !defaultRoles.any((d) => d.id == r.id)));
  return out;
}

/// What a role may do. The administrator may always do everything.
Set<String> permissionsOf(Iterable<Role> custom, String role) {
  if (role == 'admin') return allPermissions.toSet();
  return (rolesOf(custom).where((r) => r.id == role).firstOrNull?.permissions ?? const <String>[]).toSet();
}

const features = [
  'catalog', 'branches', 'wholesale', 'proformas', 'prescriptions', 'finance', 'reports', 'reminders', 'chat',
  'labels', 'import', 'reorder', 'momo', 'drugInfo', 'shifts', 'promos', 'hourly', 'calendar', 'weather', 'ai', 'newApp',
];

/// Features the RxPOS owner switched on for this pharmacy (anything not switched off is on).
Map<String, bool> featureSet(Map<String, Object?>? licenseFeatures) =>
    {for (final f in features) f: licenseFeatures?[f] != false};

/// The permissions in groups with their labels, as the role editor shows them (src/access.js PERMISSIONS).
const permissionGroups = [
  ('Selling', [
    ('pos.sell', 'Sell at the POS (retail)'), ('pos.wholesale', 'Sell wholesale'), ('pos.discount', 'Give discounts'), ('pos.price_edit', 'Change prices at the POS'),
    ('sales.view', 'See sales history'), ('sales.refund', 'Refund sales'), ('sales.edit', 'Edit past sales (items, quantities, prices, payment)'), ('proformas', 'Proformas'),
    ('shifts', 'Open/close own shift (cash-up)'), ('shifts.all', "See and close everyone's shifts"),
  ]),
  ('Patients & people', [
    ('prescriptions', 'Record & dispense prescriptions'), ('customers', 'Customers (view & add)'), ('suppliers', 'Suppliers'),
    ('reminders', 'Send reminders (WhatsApp / SMS)'), ('chat', 'Team chat & client messages'),
  ]),
  ('Medicines & stock', [
    ('inventory.view', 'See stock, expiry and stock cards'), ('medicines.manage', 'Add/edit medicines, prices, import, labels'),
    ('stock.receive', 'Receive stock, purchase orders, reorder'), ('purchases.edit', 'Edit past purchases (quantities, costs, batches)'),
    ('inventory.edit', 'Edit inventory (batches, expiry, quantities, prices)'), ('stock.count', 'Count stock (stock take); posting needs the next permission'),
    ('stock.adjust', 'Stock counts, adjustments, write-offs'), ('transfers', 'Stock transfers between branches'),
  ]),
  ('Management', [
    ('finance', 'Finance (expenses, banks, loans, cash book)'), ('payroll', 'Payroll & staff (salaries, attendance, advances)'), ('reports', 'Reports & dashboard money figures'),
    ('reports.lines', 'Sales lines report only (what was sold and by whom, no profit)'), ('branches.view', 'See all branches'), ('audit', 'Audit log'),
    ('users.manage', 'Manage users & roles'), ('settings.manage', 'Settings & payment methods'), ('data.reset', 'Restore default settings'),
  ]),
];

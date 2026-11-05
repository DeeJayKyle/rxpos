// Roles and permissions, ported from src/access.js.
import '../entities/people.dart';

const allPermissions = [
  'pos.sell', 'pos.wholesale', 'pos.discount', 'pos.price_edit', 'sales.view', 'sales.refund', 'sales.edit', 'proformas',
  'shifts', 'shifts.all', 'prescriptions', 'customers', 'suppliers', 'reminders', 'chat', 'inventory.view',
  'medicines.manage', 'stock.receive', 'purchases.edit', 'inventory.edit', 'stock.count', 'stock.adjust', 'transfers',
  'finance', 'reports', 'reports.lines', 'branches.view', 'audit', 'users.manage', 'settings.manage', 'data.reset',
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
  'labels', 'import', 'reorder', 'momo', 'drugInfo', 'shifts', 'promos', 'hourly', 'calendar', 'weather', 'ai',
];

/// Features the RxPOS owner switched on for this pharmacy (anything not switched off is on).
Map<String, bool> featureSet(Map<String, Object?>? licenseFeatures) =>
    {for (final f in features) f: licenseFeatures?[f] != false};

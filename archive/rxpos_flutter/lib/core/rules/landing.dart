// Role-based landing (src/landing.js): people who sell and don't see reports (the built-in pharmacist, dispenser and
// cashier roles, or a custom role like them) land on the till after signing in; administrators and managers on the
// dashboard.
const _tillRoles = {'pharmacist', 'dispenser', 'cashier'};

/// The page a person lands on after signing in. [can]: does their role have this permission?
String homeFor(String role, bool Function(String) can) {
  if (!can('pos.sell')) return '/';
  if (_tillRoles.contains(role)) return '/pos';
  if (role == 'admin' || role == 'manager') return '/';
  return can('reports') ? '/' : '/pos';
}

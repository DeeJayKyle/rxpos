// The pages of the RxPOS app (rxpos_flutter/lib/core/presentation/screens.dart, plus sign-in). An address that starts
// with one of these opens the app; any other unknown address (a pharmacy's own address, e.g. /citycare-ntinda) opens
// the classic site as before. Kept in step with screens.dart by rxpos_flutter/test/web/site_routes_test.dart.
export const FLUTTER_ROUTES = [
  'sign-in', 'pos', 'sales', 'shifts', 'proformas', 'prescriptions', 'scan', 'controlled', 'reminders', 'messages', 'chat',
  'customers', 'suppliers', 'medicines', 'formulations', 'inventory', 'add-stock', 'purchases', 'shelves', 'stock-count',
  'reorder', 'quick-edit', 'stock-card', 'expiry', 'returns', 'labels', 'import', 'storage', 'drug-info', 'quiz', 'calendar',
  'finance', 'weekly', 'reports', 'users', 'branches', 'settings', 'device', 'audit', 'sync',
];

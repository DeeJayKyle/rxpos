// The app's screens (see nav.dart). Each group of the rebuild adds its screens here.
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../features/branches/presentation/branches_screen.dart';
import '../../features/dashboard/presentation/dashboard_screen.dart';
import '../../features/settings/presentation/settings_screens.dart';
import '../../features/users/presentation/users_screen.dart';
import '../../features/extras/presentation/extras_screens.dart';
import '../../features/finance/presentation/finance_screen.dart';
import '../../features/inventory/presentation/inventory_screen.dart';
import '../../features/prescriptions/presentation/prescriptions_screen.dart';
import '../../features/proformas/presentation/proformas_screen.dart';
import '../../features/reports/presentation/reports_screen.dart';
import '../../features/people/presentation/people_screens.dart';
import '../../features/purchases/presentation/purchases_screens.dart';
import '../../features/returns/presentation/returns_screen.dart';
import '../../features/shifts/presentation/shifts_screen.dart';
import '../../features/stock_count/presentation/stock_count_screen.dart';
import '../../features/sales_history/presentation/sales_screen.dart';
import '../../features/sales_pos/presentation/pos_screen.dart';
import '../../features/stock/presentation/add_stock_screen.dart';
import '../../features/sync_status/presentation/sync_screen.dart';
import 'nav.dart';

final screens = <Screen>[
  Screen('/', 'Dashboard', Icons.space_dashboard_outlined, 'Sales', (_) => const DashboardScreen()),
  Screen('/pos', 'POS – Retail', Icons.point_of_sale, 'Sales', (_) => const PosScreen(key: ValueKey('retail')), permission: 'pos.sell', key: LogicalKeyboardKey.f2),
  Screen('/pos/wholesale', 'POS – Wholesale', Icons.local_shipping_outlined, 'Sales', (_) => const PosScreen(key: ValueKey('wholesale'), wholesale: true),
      permission: 'pos.wholesale', feature: 'wholesale', key: LogicalKeyboardKey.f3),
  Screen('/sales', 'Sales History', Icons.receipt_long_outlined, 'Sales', (_) => const SalesScreen(), permission: 'sales.view', key: LogicalKeyboardKey.f6),
  Screen('/shifts', 'Shifts & Cash-up', Icons.schedule_outlined, 'Sales', (_) => const ShiftsScreen(), permission: 'shifts', feature: 'shifts'),
  Screen('/proformas', 'Proformas', Icons.description_outlined, 'Sales', (_) => const ProformasScreen(), permission: 'proformas', feature: 'proformas'),
  Screen('/prescriptions', 'Prescriptions & Refills', Icons.medication_outlined, 'Sales', (_) => const PrescriptionsScreen(), permission: 'prescriptions', feature: 'prescriptions'),
  Screen('/controlled', 'Controlled drugs', Icons.gpp_good_outlined, 'Sales', (_) => const ControlledScreen(), permission: 'sales.view'),
  Screen('/reminders', 'Reminders', Icons.notifications_active_outlined, 'People', (_) => const RemindersScreen(), permission: 'reminders', feature: 'reminders'),
  Screen('/chat', 'Team chat', Icons.forum_outlined, 'People', (_) => const ChatScreen(), permission: 'chat', feature: 'chat'),
  Screen('/customers', 'Customers', Icons.people_outline, 'People', (_) => const PeopleScreen(suppliers: false), permission: 'customers'),
  Screen('/suppliers', 'Suppliers', Icons.factory_outlined, 'People', (_) => const PeopleScreen(suppliers: true), permission: 'suppliers'),
  Screen('/inventory', 'Inventory', Icons.inventory_2_outlined, 'Medicine inventory', (q) => InventoryScreen(key: ValueKey(q['filter']), filter: q['filter'] ?? 'instock'),
      permission: 'inventory.view', key: LogicalKeyboardKey.f7),
  Screen('/add-stock', 'Add Stock', Icons.add_box_outlined, 'Medicine inventory', (_) => const AddStockScreen(), permission: 'stock.receive', key: LogicalKeyboardKey.f4),
  Screen('/purchases', 'Purchase history', Icons.local_shipping_outlined, 'Medicine inventory', (_) => const PurchasesScreen(), permission: 'stock.receive'),
  Screen('/stock-count', 'Stock take', Icons.fact_check_outlined, 'Medicine inventory', (_) => const StockCountScreen(), permission: 'stock.count'),
  Screen('/reorder', 'Reorder', Icons.shopping_cart_checkout, 'Medicine inventory', (_) => const ReorderScreen(), permission: 'inventory.view', feature: 'reorder'),
  Screen('/expiry', 'Expiry', Icons.event_busy_outlined, 'Medicine inventory', (_) => const ExpiryScreen(), permission: 'inventory.view'),
  Screen('/returns', 'Returns to suppliers', Icons.assignment_return_outlined, 'Medicine inventory', (_) => const ReturnsScreen(), permission: 'stock.receive'),
  Screen('/labels', 'Barcode labels', Icons.qr_code_2, 'Medicine inventory', (_) => const LabelsScreen(), permission: 'medicines.manage', feature: 'labels'),
  Screen('/import', 'Import medicines', Icons.upload_file_outlined, 'Medicine inventory', (_) => const ImportScreen(), permission: 'medicines.manage', feature: 'import'),
  Screen('/storage', 'Storage temperature', Icons.thermostat_outlined, 'Medicine inventory', (_) => const StorageScreen(), permission: 'inventory.view', feature: 'weather'),
  Screen('/drug-info', 'Drug information', Icons.menu_book_outlined, 'Insights', (_) => const DrugInfoScreen(), feature: 'drugInfo'),
  Screen('/quiz', 'Drug quiz', Icons.quiz_outlined, 'Insights', (_) => const QuizScreen(), feature: 'ai'),
  Screen('/calendar', 'Calendar', Icons.calendar_month_outlined, 'Insights', (_) => const CalendarScreen(), feature: 'calendar'),
  Screen('/finance', 'Finance', Icons.account_balance_outlined, 'Finance', (_) => const FinanceScreen(), permission: 'finance', feature: 'finance'),
  Screen('/reports', 'Reports', Icons.insights_outlined, 'Insights', (_) => const ReportsScreen(), permission: 'reports', feature: 'reports'),
  Screen('/users', 'Users & Roles', Icons.manage_accounts_outlined, 'People', (_) => const UsersScreen(), permission: 'users.manage'),
  Screen('/branches', 'Branches & Transfers', Icons.store_mall_directory_outlined, 'Medicine inventory', (_) => const BranchesScreen(), permission: 'transfers', feature: 'branches'),
  Screen('/settings', 'Settings', Icons.settings_outlined, 'System', (_) => const SettingsScreen(), permission: 'settings.manage'),
  Screen('/device', 'This device', Icons.devices_outlined, 'System', (_) => const DeviceScreen()),
  Screen('/audit', 'Audit log', Icons.policy_outlined, 'System', (_) => const AuditScreen(), permission: 'audit'),
  Screen('/sync', 'Sync & storage', Icons.cloud_sync_outlined, 'System', (_) => const SyncScreen()),
];

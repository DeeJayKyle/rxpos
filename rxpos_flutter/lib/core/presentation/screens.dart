// The app's screens (see nav.dart). Each group of the rebuild adds its screens here.
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../features/dashboard/presentation/dashboard_screen.dart';
import '../../features/inventory/presentation/inventory_screen.dart';
import '../../features/people/presentation/people_screens.dart';
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
  Screen('/customers', 'Customers', Icons.people_outline, 'People', (_) => const PeopleScreen(suppliers: false), permission: 'customers'),
  Screen('/suppliers', 'Suppliers', Icons.factory_outlined, 'People', (_) => const PeopleScreen(suppliers: true), permission: 'suppliers'),
  Screen('/inventory', 'Inventory', Icons.inventory_2_outlined, 'Medicine inventory', (q) => InventoryScreen(key: ValueKey(q['filter']), filter: q['filter'] ?? 'instock'),
      permission: 'inventory.view', key: LogicalKeyboardKey.f7),
  Screen('/add-stock', 'Add Stock', Icons.add_box_outlined, 'Medicine inventory', (_) => const AddStockScreen(), permission: 'stock.receive', key: LogicalKeyboardKey.f4),
  Screen('/sync', 'Sync & storage', Icons.cloud_sync_outlined, 'System', (_) => const SyncScreen()),
];

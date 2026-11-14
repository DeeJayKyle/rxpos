// Every page as a bento sheet (src/components/NavMenus.jsx MegaMenu): More on the phone's tab bar opens it. Pages
// grouped as in the sidebar, each with a line on what it is for and its count; the pharmacy's most useful next step
// on top (expiring stock, low stock, the cash-up); Account & menu opens the full menu.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../features/alerts/application/alerts_provider.dart';
import '../../features/dashboard/presentation/bento_row.dart' show featuredAction;
import '../../features/auth/application/session_controller.dart';
import 'nav.dart';

/// A line under each page's name (src/components/NavMenus.jsx PAGE_INFO)
const pageInfo = {
  '/': 'Overview & insights', '/pos': 'Sell to walk-in customers', '/pos/wholesale': 'Bulk orders at trade prices', '/sales': 'Every receipt, refunds',
  '/shifts': 'Open, close and cash-up', '/proformas': 'Quotations for clients', '/prescriptions': 'Records and refills', '/scan': 'Read a prescription photo',
  '/controlled': 'Register and recalls', '/drug-info': 'Uses, doses, interactions', '/quiz': 'Train the team', '/customers': 'Clients, balances, allergies',
  '/suppliers': 'Who you buy from', '/insurers': 'Schemes and claims', '/chat': 'Team chat', '/reminders': 'Refill reminders', '/messages': 'SMS and WhatsApp',
  '/calendar': 'What is coming up', '/notes': 'SOPs, handovers, notes', '/medicines': 'The medicine list', '/formulations': 'Dosage forms', '/inventory': 'Stock on hand',
  '/add-stock': 'Receive a delivery', '/returns': 'Send stock back', '/purchases': 'Deliveries received', '/shelves': 'Where things are kept',
  '/stock-count': 'Count the shelves', '/expiry': 'Expiring and expired', '/reorder': 'What to buy, dead stock', '/quick-edit': 'Prices in bulk',
  '/stock-card': "One medicine's history", '/labels': 'Print barcodes', '/import': 'From a spreadsheet', '/storage': 'Temperature and humidity',
  '/branches': 'Branches and transfers', '/finance': 'Expenses, banks, loans', '/payroll': 'Salaries and attendance', '/weekly': 'The week at a glance',
  '/reports': 'Sales, profit, stock', '/users': 'Staff and permissions', '/settings': 'Pharmacy settings', '/audit': 'Who did what', '/device': 'This device, updates',
  '/sync': 'Sync and storage',
};

const _badges = {'/chat': 'chat', '/inventory': 'low', '/expiry': 'expiry', '/branches': 'transfers'};

Future<void> showPageSheet(BuildContext context, {required List<Screen> screens, VoidCallback? onFullMenu}) => showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => FractionallySizedBox(heightFactor: .88, child: PageSheet(screens: screens, onFullMenu: onFullMenu)),
    );

class PageSheet extends ConsumerWidget {
  const PageSheet({super.key, required this.screens, this.onFullMenu});
  final List<Screen> screens;
  final VoidCallback? onFullMenu;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = Theme.of(context);
    final counts = ref.watch(navCountsProvider);
    final can = ref.watch(permissionsProvider).value ?? const <String>{};
    final f = featuredAction(expiring: counts['expiry'] ?? 0, low: counts['low'] ?? 0, can: can);
    void go(String path) {
      Navigator.of(context).pop();
      GoRouter.of(context).go(path);
    }

    final groups = [for (final g in navGroups) (g, screens.where((s) => s.group == g).toList())].where((x) => x.$2.isNotEmpty);
    return ListView(key: const Key('page-sheet'), padding: const EdgeInsets.fromLTRB(16, 0, 16, 24), children: [
      Row(children: [
        Expanded(child: Text('ALL PAGES', style: t.textTheme.labelSmall?.copyWith(letterSpacing: .8, fontWeight: FontWeight.w700))),
        if (onFullMenu != null)
          OutlinedButton(key: const Key('page-sheet-menu'), onPressed: () {
            Navigator.of(context).pop();
            onFullMenu!();
          }, child: const Text('Account & menu')),
      ]),
      const SizedBox(height: 10),
      InkWell(
        key: const Key('page-sheet-featured'),
        borderRadius: BorderRadius.circular(18),
        onTap: () => go(f.to),
        child: Ink(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(borderRadius: BorderRadius.circular(18), gradient: LinearGradient(colors: [t.colorScheme.primary, Color.lerp(t.colorScheme.primary, Colors.black, .45)!])),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Icon(Icons.auto_awesome, color: t.colorScheme.onPrimary),
            const SizedBox(height: 6),
            Text(f.title, style: t.textTheme.titleMedium?.copyWith(color: t.colorScheme.onPrimary, fontWeight: FontWeight.w800)),
            Text(f.text, style: TextStyle(color: t.colorScheme.onPrimary.withValues(alpha: .85))),
            const SizedBox(height: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
              decoration: BoxDecoration(borderRadius: BorderRadius.circular(99), color: Colors.white),
              child: Text('${f.cta} →', style: const TextStyle(color: Color(0xFF0B0E14), fontWeight: FontWeight.w700, fontSize: 12)),
            ),
          ]),
        ),
      ),
      for (final (g, list) in groups)
        Card(
          margin: const EdgeInsets.only(top: 12),
          color: t.colorScheme.surfaceContainerLow,
          child: Padding(
            padding: const EdgeInsets.all(8),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Padding(padding: const EdgeInsets.fromLTRB(8, 4, 8, 6), child: Text(g.toUpperCase(), style: t.textTheme.labelSmall?.copyWith(letterSpacing: .8, fontWeight: FontWeight.w700))),
              for (final s in list)
                ListTile(
                  key: ValueKey('sheet-${s.path}'),
                  leading: Container(
                    width: 36, height: 36,
                    decoration: BoxDecoration(borderRadius: BorderRadius.circular(10), color: t.colorScheme.surface, border: Border.all(color: t.dividerColor)),
                    child: Icon(s.icon, size: 19, color: t.colorScheme.tertiary),
                  ),
                  title: Text(s.label, style: const TextStyle(fontWeight: FontWeight.w600)),
                  subtitle: pageInfo[s.path] == null ? null : Text(pageInfo[s.path]!),
                  trailing: (counts[_badges[s.path]] ?? 0) > 0 ? Badge(label: Text('${counts[_badges[s.path]]}')) : null,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  onTap: () => go(s.path),
                ),
            ]),
          ),
        ),
    ]);
  }
}

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../features/auth/application/session_controller.dart';
import '../../features/sync_status/presentation/sync_chip.dart';
import '../data/pharmacy_providers.dart';
import '../theme/theme_choice.dart';

/// The frame around every screen: a side rail on Windows and tablets, a bottom bar on phones; the pharmacy, who is
/// signed in, the sync status and the Premium UI switch. F2 retail, F3 wholesale, F4 Add Stock (as in the React app).
class AppShell extends ConsumerWidget {
  const AppShell({super.key, required this.location, required this.child});

  final String location;
  final Widget child;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final session = ref.watch(sessionControllerProvider).value;
    final can = ref.watch(permissionsProvider).value ?? const <String>{};
    final features = ref.watch(pharmacyProvider).value?.features ?? const {};
    final premium = ref.watch(premiumUiProvider).value ?? false;
    final dests = <(String, String, IconData, String?)>[
      if (can.contains('pos.sell')) ('/pos', 'Retail', Icons.point_of_sale, 'F2'),
      if (can.contains('pos.wholesale') && features['wholesale'] != false) ('/pos/wholesale', 'Wholesale', Icons.local_shipping_outlined, 'F3'),
      if (can.contains('stock.receive')) ('/add-stock', 'Add Stock', Icons.add_box_outlined, 'F4'),
      ('/sync', 'Sync & storage', Icons.cloud_sync_outlined, null),
    ];
    var index = dests.indexWhere((d) => d.$1 == location);
    if (index < 0) index = dests.length - 1;
    final wide = MediaQuery.sizeOf(context).width >= 760;
    final bar = AppBar(
      title: Text(session?.pharmacy.isNotEmpty == true ? session!.pharmacy : 'RxPOS', overflow: TextOverflow.ellipsis),
      actions: [
        const SyncChip(),
        const SizedBox(width: 8),
        Tooltip(
          message: 'Premium UI: the dark Midnight Pro look',
          child: Row(children: [
            const Icon(Icons.auto_awesome, size: 18),
            Switch(value: premium, onChanged: (v) => ref.read(premiumUiProvider.notifier).set(v)),
          ]),
        ),
        if (wide && session != null) Padding(padding: const EdgeInsets.symmetric(horizontal: 12), child: Center(child: Text(session.userName))),
      ],
    );
    final body = wide
        ? Row(children: [
            NavigationRail(
              selectedIndex: index,
              labelType: NavigationRailLabelType.all,
              onDestinationSelected: (i) => context.go(dests[i].$1),
              destinations: [
                for (final d in dests)
                  NavigationRailDestination(icon: Icon(d.$3), label: Text(d.$4 == null ? d.$2 : '${d.$2}  ${d.$4}')),
              ],
            ),
            const VerticalDivider(width: 1),
            Expanded(child: child),
          ])
        : child;
    return CallbackShortcuts(
      bindings: {
        for (final d in dests)
          if (d.$4 != null) SingleActivator(LogicalKeyboardKey.findKeyByKeyId(_fKey(d.$4!))!): () => context.go(d.$1),
      },
      child: Scaffold(
        appBar: bar,
        body: body,
        // a bottom bar needs at least two places to go (someone allowed only one screen gets none)
        bottomNavigationBar: wide || dests.length < 2
            ? null
            : NavigationBar(
                selectedIndex: index,
                onDestinationSelected: (i) => context.go(dests[i].$1),
                destinations: [for (final d in dests) NavigationDestination(icon: Icon(d.$3), label: d.$2)],
              ),
      ),
    );
  }

  static int _fKey(String f) => switch (f) {
        'F2' => LogicalKeyboardKey.f2.keyId,
        'F3' => LogicalKeyboardKey.f3.keyId,
        _ => LogicalKeyboardKey.f4.keyId,
      };
}

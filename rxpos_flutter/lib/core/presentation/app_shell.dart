import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../features/auth/application/session_controller.dart';
import '../../features/sync_status/presentation/sync_chip.dart';
import '../data/pharmacy_providers.dart';
import '../theme/theme_choice.dart';
import 'nav.dart';
import 'screens.dart';

/// The frame around every screen: the sidebar with its groups (Sales, People, Medicine inventory, Finance, Insights,
/// System) on Windows and tablets, a drawer on phones; the pharmacy, who is signed in, the sync status, the Premium UI
/// switch; the shortcut keys (F2 retail, F3 wholesale, F4 Add Stock, F6 Sales History, F7 Inventory).
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
    final visible = screens.where((s) => s.allowed(can, features)).toList();
    final wide = MediaQuery.sizeOf(context).width >= 900;
    final nav = _Sidebar(screens: visible, location: location, onGo: (p) {
      if (!wide) Navigator.of(context).maybePop();
      context.go(p);
    });
    final bar = AppBar(
      title: Text(session?.pharmacy.isNotEmpty == true ? session!.pharmacy : 'RxPOS', overflow: TextOverflow.ellipsis),
      automaticallyImplyLeading: !wide,
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
    return CallbackShortcuts(
      bindings: {for (final s in visible) if (s.key != null) SingleActivator(s.key!): () => context.go(s.path)},
      child: Scaffold(
        appBar: bar,
        drawer: wide ? null : Drawer(child: SafeArea(child: nav)),
        body: wide ? Row(children: [SizedBox(width: 240, child: Material(color: Theme.of(context).colorScheme.surfaceContainerLow, child: nav)), const VerticalDivider(width: 1), Expanded(child: child)]) : child,
      ),
    );
  }
}

class _Sidebar extends StatelessWidget {
  const _Sidebar({required this.screens, required this.location, required this.onGo});
  final List<Screen> screens;
  final String location;
  final ValueChanged<String> onGo;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    return ListView(padding: const EdgeInsets.symmetric(vertical: 8), children: [
      for (final g in navGroups)
        if (screens.any((s) => s.group == g)) ...[
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 12, 12, 4),
            child: Text(g.toUpperCase(), style: t.textTheme.labelSmall?.copyWith(letterSpacing: .8, fontWeight: FontWeight.w700)),
          ),
          for (final s in screens.where((s) => s.group == g))
            ListTile(
              dense: true,
              selected: s.path == location,
              leading: Icon(s.icon, size: 20),
              title: Text(s.label),
              trailing: s.key == null ? null : Text(s.keyLabel, style: t.textTheme.labelSmall),
              onTap: () => onGo(s.path),
            ),
        ],
    ]);
  }
}

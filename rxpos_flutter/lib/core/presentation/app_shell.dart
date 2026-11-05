import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../features/auth/application/session_controller.dart';
import '../../features/auth/presentation/account_menu.dart';
import '../../features/alerts/application/alerts_provider.dart';
import '../../features/alerts/presentation/notification_bell.dart';
import '../data/pharmacy_providers.dart';
import '../theme/theme_choice.dart';
import '../crash/crash_reports.dart';
import '../crash/crash_screen.dart';
import '../../features/sync_status/application/sync_controller.dart';
import '../../features/engage/application/popups.dart';
import '../../features/engage/presentation/spotlight.dart';
import '../../features/engage/presentation/watchers.dart';
import 'nav.dart';
import 'screens.dart';
import 'theme_menu.dart';
import '../theme/themes.dart';
import 'top_bar.dart';

/// The frame around every screen: the sidebar with its groups (Sales, People, Medicine inventory, Finance, Insights,
/// System) on Windows and tablets, a drawer on phones; the pharmacy, who is signed in, the sync status, the Premium UI
/// switch; the shortcut keys (F2 retail, F3 wholesale, F4 Add Stock, F6 Sales History, F7 Inventory).
class AppShell extends ConsumerWidget {
  const AppShell({super.key, required this.location, required this.child});

  final String location;
  final Widget child;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    ref.read(crashReportsProvider).page = location;
    final session = ref.watch(sessionControllerProvider).value;
    final can = ref.watch(permissionsProvider).value ?? const <String>{};
    final features = ref.watch(pharmacyProvider).value?.features ?? const {};
    final premium = ref.watch(premiumUiProvider).value ?? false;
    final visible = screens.where((s) => s.allowed(can, features)).toList();
    final wide = MediaQuery.sizeOf(context).width >= 900;
    final counts = ref.watch(navCountsProvider);
    final nav = _Sidebar(screens: visible, location: location, counts: counts, onGo: (p) {
      if (!wide) Navigator.of(context).maybePop();
      context.go(p);
    });
    final bar = AppBar(
      title: Text(session?.pharmacy.isNotEmpty == true ? session!.pharmacy : 'RxPOS', overflow: TextOverflow.ellipsis),
      automaticallyImplyLeading: !wide,
      actions: [
        if (wide)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 8),
            child: OutlinedButton.icon(
              key: const Key('search-trigger'),
              onPressed: () => openSearch(context, visible),
              icon: const Icon(Icons.search, size: 18),
              label: const Text('Search…  Ctrl K'),
            ),
          )
        else
          IconButton(key: const Key('search-trigger'), tooltip: 'Search (Ctrl+K)', onPressed: () => openSearch(context, visible), icon: const Icon(Icons.search)),
        if (wide) const BranchPill(),
        const SizedBox(width: 6),
        ClockPill(compact: !wide, date: MediaQuery.sizeOf(context).width >= 1280),
        const NotificationBell(),
        if (wide && allowedPalettes(ref.watch(brandingProvider)).any((p) => p.id == premiumTheme))
          Tooltip(
            message: 'Premium UI: the dark Midnight Pro look',
            child: Row(children: [
              const Icon(Icons.auto_awesome, size: 18),
              Switch(value: premium, onChanged: (v) => ref.read(premiumUiProvider.notifier).set(v)),
            ]),
          ),
        const ThemeMenuButton(),
        if (session != null) AccountMenu(session: session, showName: wide),
      ],
    );
    final body = Stack(children: [
      Column(children: [const OfflineBanner(), Expanded(child: child)]),
      const FirstDownload(),
      PopupHost(location: location),
      EngageWatchers(location: location),
    ]);
    return CallbackShortcuts(
      bindings: {
        for (final s in visible) if (s.key != null) SingleActivator(s.key!): () => context.go(s.path),
        const SingleActivator(LogicalKeyboardKey.keyK, control: true): () => openSearch(context, visible),
        const SingleActivator(LogicalKeyboardKey.keyK, meta: true): () => openSearch(context, visible),
        // F5 / Ctrl+R: send and fetch now (the page updates in place); Ctrl+Shift+R reloads the whole app
        const SingleActivator(LogicalKeyboardKey.f5): () => refreshNow(context, ref),
        const SingleActivator(LogicalKeyboardKey.keyR, control: true): () => refreshNow(context, ref),
        const SingleActivator(LogicalKeyboardKey.keyR, control: true, shift: true): () => ref.read(appCrashProvider.notifier).reload(),
      },
      // the idle screen covers the whole window
      child: Spotlight(
        child: Scaffold(
          appBar: bar,
          drawer: wide ? null : Drawer(child: SafeArea(child: nav)),
          body: wide ? Row(children: [SizedBox(width: 240, child: Material(color: Theme.of(context).colorScheme.surfaceContainerLow, child: nav)), const VerticalDivider(width: 1), Expanded(child: body)]) : body,
        ),
      ),
    );
  }
}

class _Sidebar extends StatelessWidget {
  const _Sidebar({required this.screens, required this.location, required this.onGo, this.counts = const {}});
  final List<Screen> screens;
  final Map<String, int> counts;
  static const _badges = {'/chat': 'chat', '/inventory': 'low', '/expiry': 'expiry', '/branches': 'transfers'};
  final String location;
  final ValueChanged<String> onGo;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    return ListView(key: const Key('sidebar'), padding: const EdgeInsets.symmetric(vertical: 8), children: [
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
              trailing: () {
                final n = counts[_badges[s.path]] ?? 0;
                final key = s.key == null ? null : Text(s.keyLabel, style: t.textTheme.labelSmall);
                if (n == 0) return key;
                return Row(mainAxisSize: MainAxisSize.min, children: [
                  Badge(key: ValueKey('count-${s.path}'), label: Text('$n'), backgroundColor: t.colorScheme.primary),
                  if (key != null) ...[const SizedBox(width: 6), key],
                ]);
              }(),
              onTap: () => onGo(s.path),
            ),
        ],
    ]);
  }
}

/// F5: sync now and say how it went (src/refresh.jsx).
Future<void> refreshNow(BuildContext context, WidgetRef ref) async {
  final messenger = ScaffoldMessenger.of(context);
  final r = await ref.read(syncControllerProvider.notifier).runNow();
  final text = switch (r.state) {
    SyncState.signedOut => 'This device is not linked to the cloud',
    SyncState.offline => 'Offline: your work is saved and goes up when the internet is back',
    SyncState.needsAttention || SyncState.signInAgain => r.error ?? 'Could not reach the cloud',
    _ => r.pending > 0 ? 'Up to date · ${r.pending} still waiting' : 'Up to date',
  };
  messenger.showSnackBar(SnackBar(content: Text(text)));
}

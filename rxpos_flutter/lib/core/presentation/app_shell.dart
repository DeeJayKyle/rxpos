import 'dart:convert';
import 'dart:ui' show ImageFilter;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../features/auth/application/session_controller.dart';
import '../../features/auth/presentation/account_menu.dart';
import '../../features/alerts/application/alerts_provider.dart';
import '../../features/alerts/presentation/notification_bell.dart';
import '../data/device_settings.dart';
import '../data/pharmacy_providers.dart';
import '../theme/theme_choice.dart';
import '../crash/crash_reports.dart';
import '../crash/crash_screen.dart';
import '../../features/sync_status/application/sync_controller.dart';
import '../../features/engage/application/popups.dart';
import '../../features/engage/presentation/spotlight.dart';
import '../../features/engage/presentation/watchers.dart';
import 'backdrop.dart';
import 'edge_swipe.dart';
import 'hardware_hud.dart';
import 'keymap.dart';
import 'keys_host.dart';
import 'nav.dart';
import 'page_sheet.dart';
import 'nav_history.dart';
import 'screens.dart';
import 'theme_menu.dart';
import '../theme/themes.dart';
import 'top_bar.dart';
import '../../features/calls/presentation/call_overlay.dart';
import '../update/update_pill.dart';

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
    final aurora = auroraOn(context);
    final counts = ref.watch(navCountsProvider);
    // the sidebar folds down to a rail of icons (kept on this device)
    final rail = wide && ref.watch(deviceValueProvider(navRailKey)).value == '1';
    void toggleRail() => ref.read(deviceValueProvider(navRailKey).notifier).set(rail ? null : '1');
    final nav = _Sidebar(screens: visible, location: location, counts: counts, rail: rail, onGo: (p) {
      if (!wide) Navigator.of(context).maybePop();
      context.go(p);
    });
    final history = ref.read(navHistoryProvider);
    final home = location == '/';
    // Back: to the previous page of this session (or the dashboard); on every page but the dashboard
    void back([double from = 0]) => history.back(GoRouter.of(context), from: from);
    final backButton = IconButton(
      key: const Key('nav-back'),
      tooltip: 'Back',
      onPressed: back,
      icon: const Icon(Icons.arrow_back_ios_new_rounded, size: 20),
    );
    final glassBar = Theme.of(context).appBarTheme.backgroundColor ?? Theme.of(context).colorScheme.surface;
    final bar = AppBar(
      // the pharmacy, then where you are (group › page) with the page's pin and the ? sheet; the title area shrinks first
      title: Row(children: [
        // the pharmacy's name: on a narrow screen up to two smaller lines, so a long name is read in full
        Flexible(
          child: Text(
            session?.pharmacy.isNotEmpty == true ? session!.pharmacy : 'RxPOS',
            key: const Key('appbar-pharmacy'),
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: wide ? null : Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700, height: 1.15),
          ),
        ),
        if (wide) ...[const SizedBox(width: 16), Flexible(child: _Crumbs(screens: visible, location: location))],
      ]),
      // phones: Back on the left (the menu is the More tab at the bottom); the sidebar's own button on wide screens
      automaticallyImplyLeading: false,
      leadingWidth: wide && !home ? 96 : null,
      titleSpacing: !wide && home ? 16 : null,
      leading: wide
          ? Row(mainAxisSize: MainAxisSize.min, children: [
              const SizedBox(width: 4),
              IconButton(key: const Key('sidebar-toggle'), tooltip: rail ? 'Show the menu (Ctrl+B)' : 'Fold the menu to icons (Ctrl+B)', onPressed: toggleRail,
                  icon: Icon(rail ? Icons.menu : Icons.menu_open)),
              if (!home) backButton,
            ])
          : home
              ? null
              : backButton,
      // frosted glass: the bar lets the page's colours through, blurred, under a hairline
      backgroundColor: glassBar.withValues(alpha: glassBar.a * .82),
      flexibleSpace: ClipRect(child: BackdropFilter(filter: ImageFilter.blur(sigmaX: 18, sigmaY: 18), child: const SizedBox.expand())),
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
          IconButton(key: const Key('search-trigger'), tooltip: 'Search or ask AI (Ctrl+K)', onPressed: () => openSearch(context, visible), icon: const Icon(Icons.auto_awesome)),
        if (wide) const BranchPill(),
        const SizedBox(width: 6),
        ClockPill(compact: !wide, date: MediaQuery.sizeOf(context).width >= 1280),
        const UpdatePill(),
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
      // the Hardware Diagnostic HUD design: a status bar (printer, scanner, connection, alerts) over every page
      Column(children: [
        if (tokensOf(context).hud) const HardwareHud(),
        const OfflineBanner(),
        // a finger from the screen's left edge pulls the page back (not on the dashboard, where it opens the menu)
        Expanded(child: EdgeSwipeBack(enabled: !wide && !home, onBack: (f) => history.back(GoRouter.of(context), from: f), child: child)),
      ]),
      const FirstDownload(),
      const HistoryLoading(),
      PopupHost(location: location),
      EngageWatchers(location: location),
      const CallOverlay(),
    ]);
    return CallbackShortcuts(
      bindings: {
        // the page keys, Ctrl+K, ?, back / forward and pin are the keyboard map's (keys_host.dart), changeable per device
        if (wide) const SingleActivator(LogicalKeyboardKey.keyB, control: true): toggleRail,
        // F5 / Ctrl+R: send and fetch now (the page updates in place); Ctrl+Shift+R reloads the whole app
        const SingleActivator(LogicalKeyboardKey.f5): () => refreshNow(context, ref),
        const SingleActivator(LogicalKeyboardKey.keyR, control: true): () => refreshNow(context, ref),
        const SingleActivator(LogicalKeyboardKey.keyR, control: true, shift: true): () => ref.read(appCrashProvider.notifier).reload(),
      },
      // the idle screen covers the whole window
      child: KeysHost(
        location: location,
        screens: visible,
        onPalette: () => openSearch(context, visible),
        child: Spotlight(
        child: AuroraBackground(
          child: Scaffold(
          backgroundColor: aurora ? Colors.transparent : null,
          appBar: bar,
          drawer: wide ? null : Drawer(child: SafeArea(child: nav)),
          // the left edge swipes back on the other pages; on the dashboard it opens the menu
          drawerEnableOpenDragGesture: home,
          // phones and tablets: the main pages at the thumb (Home · Stock · Sell · Sales · More), on every page
          bottomNavigationBar: wide ? null : TabBarBottom(screens: visible, location: location),
          body: Builder(
            // Android's back button: closes the menu or what is open on the page, else goes back a page; the app is
            // left only from the dashboard
            builder: (ctx) => BackButtonListener(onBackButtonPressed: () async => _systemBack(ctx, home: home, back: () => history.back(GoRouter.of(ctx))), child: wide
              ? Row(children: [
                  AnimatedContainer(
                    duration: const Duration(milliseconds: 200),
                    curve: Curves.easeOutCubic,
                    width: rail ? 72 : 240,
                    child: _SidebarSurface(aurora: aurora, child: nav),
                  ),
                  VerticalDivider(width: 1, color: aurora ? Theme.of(context).dividerColor.withValues(alpha: .4) : null),
                  Expanded(child: body),
                ])
              : body),
          ),
          ),
        ),
      ),
      ),
    );
  }
}

/// Whether the sidebar's groups start collapsed (all but Sales, as the React app) until someone opens or closes one;
/// the tests that find pages by name start with them open.
final sidebarStartsCollapsedProvider = Provider<bool>((_) => true);

/// The device key holding which sidebar groups are collapsed ({"People": true, ...}).
const navCollapsedKey = 'navCollapsed';

/// The device key that folds the sidebar to a rail of icons ('1').
const navRailKey = 'navRail';

class _Sidebar extends ConsumerWidget {
  const _Sidebar({required this.screens, required this.location, required this.onGo, this.counts = const {}, this.rail = false});
  final List<Screen> screens;
  /// only the icons (the name on hover)
  final bool rail;
  final Map<String, int> counts;
  static const _badges = {'/chat': 'chat', '/inventory': 'low', '/expiry': 'expiry', '/branches': 'transfers'};
  final String location;
  final ValueChanged<String> onGo;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = Theme.of(context);
    // which groups are folded away: saved on this device; at first every group but Sales (src/App.jsx collapsed)
    final saved = ref.watch(deviceValueProvider(navCollapsedKey)).value;
    Map<String, bool> collapsed;
    try {
      collapsed = saved == null
          ? {for (final g in navGroups) if (g != 'Sales') g: ref.watch(sidebarStartsCollapsedProvider)}
          : (jsonDecode(saved) as Map).map((k, v) => MapEntry('$k', v == true));
    } catch (_) {
      collapsed = const {};
    }
    void toggle(String g) => ref.read(deviceValueProvider(navCollapsedKey).notifier).set(jsonEncode({...collapsed, g: !(collapsed[g] ?? false)}));
    int badge(Screen s) => counts[_badges[s.path]] ?? 0;

    if (rail) {
      return ListView(key: const Key('sidebar'), padding: const EdgeInsets.symmetric(vertical: 8), children: [
        for (final g in navGroups)
          if (screens.any((s) => s.group == g)) ...[
            if (g != navGroups.first) const Divider(indent: 16, endIndent: 16, height: 12),
            for (final s in screens.where((s) => s.group == g))
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 2),
                child: Tooltip(
                  message: '${s.label}${ref.watch(keyMapProvider).keyOf('go:${s.path}').isEmpty ? '' : '  ${showKey(ref.watch(keyMapProvider).keyOf('go:${s.path}'))}'}',
                  preferBelow: false,
                  waitDuration: const Duration(milliseconds: 300),
                  child: Material(
                    color: s.path == location ? t.colorScheme.primaryContainer : Colors.transparent,
                    borderRadius: BorderRadius.circular(12),
                    child: InkWell(
                      key: ValueKey('rail-${s.path}'),
                      borderRadius: BorderRadius.circular(12),
                      onTap: () => onGo(s.path),
                      child: SizedBox(
                        height: 44,
                        child: Center(
                          child: Badge(
                            isLabelVisible: badge(s) > 0,
                            label: Text('${badge(s)}'),
                            backgroundColor: t.colorScheme.primary,
                            child: Icon(s.icon, size: 22, color: s.path == location ? t.colorScheme.onPrimaryContainer : t.colorScheme.onSurfaceVariant, semanticLabel: s.label),
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
          ],
      ]);
    }

    // pinned pages (G then G, or the pin in the top bar) and the last pages used, on this device
    final byPath = {for (final s in screens) s.path: s};
    final pinned = [for (final p in ref.watch(navPinsProvider)) ?byPath[p]];
    final recent = [for (final p in ref.watch(navRecentProvider)) if (p != location && !pinned.any((x) => x.path == p)) ?byPath[p]].take(4).toList();
    Widget quick(String title, List<Screen> list, String kind) => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Padding(padding: const EdgeInsets.fromLTRB(20, 12, 12, 6), child: Text(title.toUpperCase(), style: t.textTheme.labelSmall?.copyWith(letterSpacing: .8, fontWeight: FontWeight.w700))),
          for (final s in list)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 1),
              child: ListTile(
                key: ValueKey('nav-$kind-${s.path}'),
                dense: !tokensOf(context).touch,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                contentPadding: const EdgeInsets.symmetric(horizontal: 12),
                leading: Icon(s.icon, size: 20),
                title: Text(s.label),
                onTap: () => onGo(s.path),
              ),
            ),
        ]);
    return ListView(key: const Key('sidebar'), padding: const EdgeInsets.symmetric(vertical: 8), children: [
      if (pinned.isNotEmpty) quick('Pinned', pinned, 'pin'),
      if (recent.isNotEmpty) quick('Recent', recent, 'recent'),
      for (final g in navGroups)
        if (screens.any((s) => s.group == g)) ...[
          () {
            final shut = collapsed[g] ?? false;
            // a folded group still shows the page you are on and any page with a count (as the React app)
            final hidden = shut ? screens.where((s) => s.group == g && s.path != location && badge(s) == 0).length : 0;
            return Semantics(
              button: true,
              expanded: !shut,
              child: InkWell(
                key: ValueKey('nav-group-$g'),
                borderRadius: BorderRadius.circular(8),
                onTap: () => toggle(g),
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(20, 12, 12, 6),
                  child: Row(children: [
                    Expanded(child: Text(g.toUpperCase(), style: t.textTheme.labelSmall?.copyWith(letterSpacing: .8, fontWeight: FontWeight.w700))),
                    if (shut && hidden > 0) Text('$hidden', style: t.textTheme.labelSmall?.copyWith(color: t.colorScheme.onSurfaceVariant)),
                    const SizedBox(width: 4),
                    AnimatedRotation(
                      turns: shut ? -0.25 : 0,
                      duration: const Duration(milliseconds: 150),
                      child: Icon(Icons.expand_more, size: 18, color: t.colorScheme.onSurfaceVariant, semanticLabel: shut ? 'Show $g' : 'Hide $g'),
                    ),
                  ]),
                ),
              ),
            );
          }(),
          for (final s in screens.where((s) => s.group == g))
            if (!(collapsed[g] ?? false) || s.path == location || badge(s) > 0)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 1),
              child: ListTile(
              dense: !tokensOf(context).touch, // full-size rows under a finger
              selected: s.path == location,
              // the page you are on: a filled pill, not only a colour change
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
              contentPadding: const EdgeInsets.symmetric(horizontal: 12),
              selectedTileColor: t.colorScheme.primaryContainer,
              selectedColor: t.colorScheme.onPrimaryContainer,
              titleTextStyle: t.textTheme.bodyMedium?.copyWith(fontWeight: s.path == location ? FontWeight.w700 : FontWeight.w500),
              leading: Icon(s.icon, size: 20),
              title: Text(s.label),
              trailing: () {
                final n = badge(s);
                final k = ref.watch(keyMapProvider).keyOf('go:${s.path}');
                final key = k.isEmpty ? null : Text(showKey(k), style: t.textTheme.labelSmall);
                if (n == 0) return key;
                return Row(mainAxisSize: MainAxisSize.min, children: [
                  Badge(key: ValueKey('count-${s.path}'), label: Text('$n'), backgroundColor: t.colorScheme.primary),
                  if (key != null) ...[const SizedBox(width: 6), key],
                ]);
              }(),
              onTap: () => onGo(s.path),
            ),
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

/// Android's back button: whatever is open closes first (the menu, a sheet or menu on the page; a dialog is closed by
/// the router), then back a page; on the dashboard it is not handled, so the app is left.
bool _systemBack(BuildContext context, {required bool home, required bool Function() back}) {
  final route = ModalRoute.of(context);
  if (route != null && !route.isCurrent) return false; // a dialog on top: the router closes it
  final scaffold = Scaffold.maybeOf(context);
  if (scaffold != null && (scaffold.isDrawerOpen || scaffold.isEndDrawerOpen)) {
    scaffold.closeDrawer();
    scaffold.closeEndDrawer();
    return true;
  }
  final pages = shellNavigatorKey.currentState;
  if (pages != null && pages.canPop()) {
    pages.maybePop();
    return true;
  }
  if (home) return false;
  return back();
}

/// The phone's tab bar, on every page: Home, Stock, Sell, Sales (those this person may open) and More (the menu with
/// every page). Frosted glass with a hairline on top, the icons and their names always shown (iOS).
class TabBarBottom extends ConsumerWidget {
  const TabBarBottom({super.key, required this.screens, required this.location});
  final List<Screen> screens;
  final String location;

  static const _tabs = [
    ('/', 'Home', Icons.home_outlined, Icons.home_rounded),
    ('/inventory', 'Stock', Icons.inventory_2_outlined, Icons.inventory_2),
    ('/pos', 'Sell', Icons.point_of_sale_outlined, Icons.point_of_sale),
    ('/sales', 'Sales', Icons.receipt_long_outlined, Icons.receipt_long),
  ];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = Theme.of(context);
    final tabs = [for (final x in _tabs) if (screens.any((s) => s.path == x.$1)) x];
    final glass = t.appBarTheme.backgroundColor ?? t.colorScheme.surface;
    final on = t.colorScheme.tertiary, off = t.colorScheme.onSurfaceVariant;
    Widget item({required Key key, required String label, required String tip, required IconData icon, required bool selected, required VoidCallback onTap}) => Expanded(
          child: Semantics(
            button: true,
            selected: selected,
            label: label,
            excludeSemantics: true,
            child: Tooltip(
              message: tip,
              child: InkResponse(
                key: key,
                onTap: onTap,
                containedInkWell: true,
                highlightShape: BoxShape.rectangle,
                child: ConstrainedBox(
                  constraints: const BoxConstraints(minHeight: 50),
                  child: Column(mainAxisAlignment: MainAxisAlignment.center, mainAxisSize: MainAxisSize.min, children: [
                    AnimatedScale(
                      scale: selected ? 1.08 : 1,
                      duration: const Duration(milliseconds: 180),
                      curve: Curves.easeOutBack,
                      child: Icon(icon, size: 24, color: selected ? on : off),
                    ),
                    const SizedBox(height: 2),
                    Text(label, maxLines: 1, overflow: TextOverflow.ellipsis,
                        style: t.textTheme.labelSmall?.copyWith(fontSize: 11, color: selected ? on : off, fontWeight: selected ? FontWeight.w700 : FontWeight.w500)),
                  ]),
                ),
              ),
            ),
          ),
        );
    final selectedTab = tabs.where((x) => x.$1 == '/' ? location == '/' : location == x.$1 || (x.$1 == '/pos' && location.startsWith('/pos'))).firstOrNull;
    return MediaQuery.withClampedTextScaling(
      maxScaleFactor: 1.3, // the tab names stay on one line under large text, as iOS does
      // a floating pill above the page (the owner's design references), frosted, with a soft shadow
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 0, 12, 10),
          child: DecoratedBox(
            decoration: BoxDecoration(borderRadius: BorderRadius.circular(32), boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: .18), blurRadius: 24, offset: const Offset(0, 10))]),
            child: ClipRRect(
            borderRadius: BorderRadius.circular(32),
            child: BackdropFilter(
            filter: ImageFilter.blur(sigmaX: 18, sigmaY: 18),
            child: DecoratedBox(
            key: const Key('bottom-nav'),
            decoration: BoxDecoration(
              color: glass.withValues(alpha: glass.a * .9),
              borderRadius: BorderRadius.circular(32),
              border: Border.all(color: t.dividerColor.withValues(alpha: .7), width: .5),
            ),
            child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                child: Row(children: [
                  for (final x in tabs)
                    item(
                      key: ValueKey('tab-${x.$1}'),
                      label: x.$2,
                      tip: screens.firstWhere((s) => s.path == x.$1).label,
                      icon: x == selectedTab ? x.$4 : x.$3,
                      selected: x == selectedTab,
                      onTap: () {
                        if (location == x.$1) return;
                        ref.read(navHistoryProvider).go(GoRouter.of(context), x.$1, how: NavMotion.fade);
                      },
                    ),
                  item(
                    key: const Key('tab-more'),
                    label: 'More',
                    tip: 'Open navigation menu',
                    icon: Icons.menu_rounded,
                    selected: false,
                    // every page as a bento sheet; its Account & menu opens the full menu
                    onTap: () => showPageSheet(context, screens: screens, onFullMenu: () => Scaffold.of(context).openDrawer()),
                  ),
                ]),
              ),
            ),
          ),
        ),
      ),
        ),
      ),
    );
  }
}

/// The sidebar's panel: the theme's panel colour, or a design's deep colour (RxPOS Green) with white text on it.
class _SidebarSurface extends StatelessWidget {
  const _SidebarSurface({required this.child, required this.aurora});
  final Widget child;
  final bool aurora;
  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    final fill = tokensOf(context).sidebarFill;
    if (fill.isEmpty) return Material(color: t.colorScheme.surfaceContainerLow.withValues(alpha: aurora ? .55 : 1), child: child);
    const white = Colors.white;
    final cs = t.colorScheme.copyWith(
      onSurface: white, onSurfaceVariant: white.withValues(alpha: .78), primary: white,
      primaryContainer: white.withValues(alpha: .16), onPrimaryContainer: white,
    );
    return DecoratedBox(
      decoration: BoxDecoration(gradient: LinearGradient(colors: fill.length > 1 ? fill : [fill.first, fill.first], begin: Alignment.topCenter, end: Alignment.bottomCenter)),
      child: Theme(
        data: t.copyWith(
          colorScheme: cs,
          textTheme: t.textTheme.apply(bodyColor: white, displayColor: white),
          listTileTheme: t.listTileTheme.copyWith(iconColor: white.withValues(alpha: .82), textColor: white, selectedColor: white, selectedTileColor: white.withValues(alpha: .16)),
          iconTheme: const IconThemeData(color: white),
        ),
        child: Material(type: MaterialType.transparency, child: child),
      ),
    );
  }
}


/// Where you are (group › page), with the page's pin and the ? sheet, in the top bar.
class _Crumbs extends ConsumerWidget {
  const _Crumbs({required this.screens, required this.location});
  final List<Screen> screens;
  final String location;
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = screens.where((x) => x.path == location).firstOrNull;
    if (s == null) return const SizedBox();
    final pinned = ref.watch(navPinsProvider).contains(location);
    final map = ref.watch(keyMapProvider);
    final t = Theme.of(context);
    // shown only when there is room for it (the pharmacy's name, the clock and the menus come first)
    return LayoutBuilder(builder: (context, c) => c.maxWidth < 84 ? const SizedBox() : Row(mainAxisSize: MainAxisSize.min, children: [
      if (c.maxWidth >= 190) ...[
        Flexible(child: Text('${s.group} › ', style: t.textTheme.bodySmall, overflow: TextOverflow.ellipsis, maxLines: 1)),
        Flexible(child: Text(s.label, key: const Key('crumb-page'), style: t.textTheme.bodySmall?.copyWith(fontWeight: FontWeight.w700), overflow: TextOverflow.ellipsis, maxLines: 1)),
      ],
      IconButton(
        key: const Key('pin-page'),
        visualDensity: VisualDensity.compact,
        tooltip: '${pinned ? 'Unpin this page from' : 'Pin this page to'} the top of the menu (${showKey(map.keyOf('pin'))})',
        icon: Icon(pinned ? Icons.push_pin : Icons.push_pin_outlined, size: 18),
        onPressed: () => togglePin(ref, context, location),
      ),
      IconButton(
        key: const Key('keys-help'),
        visualDensity: VisualDensity.compact,
        tooltip: 'Keyboard and mouse (${showKey(map.keyOf('help'))})',
        icon: const Icon(Icons.keyboard_outlined, size: 18),
        onPressed: () => showKeysHelp(context, map, screens),
      ),
    ]));
  }
}

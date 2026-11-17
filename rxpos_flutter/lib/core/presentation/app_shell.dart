import 'dart:convert';
import 'dart:ui' show ImageFilter;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../features/auth/application/session_controller.dart';
import '../../features/auth/presentation/account_menu.dart';
import '../../features/auth/presentation/person_guard.dart';
import '../network/cloud_api.dart' show personGuard;
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
    ref.read(crashReportsProvider).page = location.split('?').first; // never the query (receipt numbers, ids)
    // audit P2-7: a borrowed sign-in confirms with its own password before a personal cloud call (person_guard.dart)
    personGuard = () => confirmPersonIfBorrowed(context, ref);
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
      title: wide
          // wide screens (as the React app): the search box, then where you are; the pharmacy is at the top of the menu
          ? Row(children: [
              Flexible(flex: 2, child: _SearchBox(onTap: () => openSearch(context, visible))),
              const SizedBox(width: 16),
              Flexible(flex: 3, child: _Crumbs(screens: visible, location: location)),
            ])
          : Row(children: [
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
      ]),
      // phones: Back on the left (the menu is the More tab at the bottom); the sidebar's own button on wide screens
      automaticallyImplyLeading: false,
      titleSpacing: (wide || home) ? 16 : null,
      leading: home ? null : backButton,
      // frosted glass: the bar lets the page's colours through, blurred, under a hairline
      backgroundColor: glassBar.withValues(alpha: glassBar.a * .82),
      flexibleSpace: ClipRect(child: BackdropFilter(filter: ImageFilter.blur(sigmaX: 18, sigmaY: 18), child: const SizedBox.expand())),
      actions: [
        if (!wide)
          IconButton(key: const Key('search-trigger'), tooltip: 'Search or ask AI (Ctrl+K)', onPressed: () => openSearch(context, visible), icon: const Icon(Icons.auto_awesome)),
        if (wide) const BranchPill(),
        const SizedBox(width: 6),
        ClockPill(compact: !wide, date: MediaQuery.sizeOf(context).width >= 1280),
        const UpdatePill(),
        const NotificationBell(),
        if (wide && allowedPalettes(ref.watch(brandingProvider)).any((p) => p.id == premiumTheme))
          Tooltip(
            message: 'Premium UI: the dark Midnight Pro look',
            // a pill as the React app's: the sparkle, the words and the switch
            child: Container(
              margin: const EdgeInsets.symmetric(horizontal: 4),
              padding: const EdgeInsets.only(left: 12),
              decoration: BoxDecoration(color: Theme.of(context).colorScheme.surface, borderRadius: BorderRadius.circular(99), border: Border.all(color: Theme.of(context).dividerColor)),
              child: Row(mainAxisSize: MainAxisSize.min, children: [
                Icon(Icons.auto_awesome, size: 16, color: Theme.of(context).colorScheme.onSurfaceVariant),
                const SizedBox(width: 6),
                Text('Premium UI', style: Theme.of(context).textTheme.labelLarge?.copyWith(color: Theme.of(context).colorScheme.onSurfaceVariant)),
                Transform.scale(scale: .78, child: Switch(value: premium, onChanged: (v) => ref.read(premiumUiProvider.notifier).set(v))),
              ]),
            ),
          ),
        const ThemeMenuButton(),
        // wide screens: the signed-in person is at the foot of the menu (as the React app)
        if (session != null && !wide) AccountMenu(session: session, showName: false),
        const SizedBox(width: 8),
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
          appBar: wide ? null : bar,
          drawer: wide ? null : Drawer(child: _SidebarSurface(aurora: aurora, header: SafeArea(bottom: false, child: _SideHeader(pharmacy: session?.pharmacy ?? '', rail: false)), child: nav)),
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
                    width: rail ? 72 : 236,
                    child: _SidebarSurface(
                      aurora: aurora,
                      header: _SideHeader(pharmacy: session?.pharmacy ?? '', rail: rail, onToggle: toggleRail),
                      footer: session == null ? null : Padding(padding: const EdgeInsets.all(10), child: AccountMenu(session: session, card: !rail, showName: false)),
                      child: nav,
                    ),
                  ),
                  // the top bar over the page only, beside the full-height menu (src/styles.css .main > .topbar)
                  Expanded(child: Column(children: [SizedBox(height: bar.preferredSize.height, child: bar), Expanded(child: body)])),
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
  static const _badges = {'/chat': 'chat', '/inventory': 'low', '/expiry': 'expiry', '/kits': 'kits', '/branches': 'transfers'};
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

    // pinned pages (G then G, or the pin in the top bar), on this device. The owner's choice (2026-11-15): no Recent list,
    // and Pinned folds like every other group
    final byPath = {for (final s in screens) s.path: s};
    final pinned = [for (final p in ref.watch(navPinsProvider)) ?byPath[p]];
    final pinShut = collapsed['Pinned'] ?? false;
    Widget quick(String title, List<Screen> list, String kind) => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          InkWell(
            key: const ValueKey('nav-group-Pinned'),
            borderRadius: BorderRadius.circular(8),
            onTap: () => toggle('Pinned'),
            child: _GroupHead(title: title, shut: pinShut, count: list.length),
          ),
          for (final s in list)
            if (!pinShut || s.path == location)
              _NavItem(key: ValueKey('nav-$kind-${s.path}'), icon: s.icon, label: s.label, selected: false, onTap: () => onGo(s.path)),
        ]);
    return ListView(key: const Key('sidebar'), padding: const EdgeInsets.symmetric(vertical: 8), children: [
      if (pinned.isNotEmpty) quick('Pinned', pinned, 'pin'),
      for (final g in navGroups)
        if (screens.any((s) => s.group == g)) ...[
          () {
            final shut = collapsed[g] ?? false;
            // a folded group still shows the page you are on and any page with a count (as the React app)
            return Semantics(
              button: true,
              expanded: !shut,
              child: InkWell(
                key: ValueKey('nav-group-$g'),
                borderRadius: BorderRadius.circular(8),
                onTap: () => toggle(g),
                child: _GroupHead(title: g, shut: shut, count: screens.where((s) => s.group == g).length),
              ),
            );
          }(),
          for (final s in screens.where((s) => s.group == g))
            if (!(collapsed[g] ?? false) || s.path == location || badge(s) > 0)
              _NavItem(
                icon: s.icon,
                label: s.label,
                selected: s.path == location,
                count: badge(s),
                countKey: ValueKey('count-${s.path}'),
                shortcut: () {
                  final k = ref.watch(keyMapProvider).keyOf('go:${s.path}');
                  return k.isEmpty ? '' : showKey(k);
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

/// The phone's tab bar, on every page: Home, Stock, Sell, Sales (or, for a role without some of them, Clients, Rx or
/// Shift: only pages this person may open) and More (the menu with
/// every page). Frosted glass with a hairline on top, the icons and their names always shown (iOS).
class TabBarBottom extends ConsumerWidget {
  const TabBarBottom({super.key, required this.screens, required this.location});
  final List<Screen> screens;
  final String location;

  // role-based (src/landing.js): up to two pages before Sell and one after, the first this person may open of each list
  static const _left = [
    ('/', 'Home', Icons.home_outlined, Icons.home_rounded),
    ('/inventory', 'Stock', Icons.inventory_2_outlined, Icons.inventory_2),
    ('/customers', 'Clients', Icons.people_outline, Icons.people),
    ('/prescriptions', 'Rx', Icons.medication_outlined, Icons.medication),
  ];
  static const _sell = ('/pos', 'Sell', Icons.point_of_sale_outlined, Icons.point_of_sale);
  static const _right = [
    ('/sales', 'Sales', Icons.receipt_long_outlined, Icons.receipt_long),
    ('/shifts', 'Shift', Icons.schedule_outlined, Icons.schedule),
  ];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = Theme.of(context);
    bool open((String, String, IconData, IconData) x) => screens.any((s) => s.path == x.$1);
    final tabs = [..._left.where(open).take(2), if (open(_sell)) _sell, ..._right.where(open).take(1)];
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

/// The menu's colours where the menu is: the theme's (React's navy menu), or a design's own deep colour.
SideColors sideColors(BuildContext context) {
  final fill = tokensOf(context).sidebarFill;
  final t = Theme.of(context);
  if (fill.isNotEmpty) return SideColors(top: fill.first, bottom: fill.last, text: Colors.white.withValues(alpha: .80), active: Colors.white, dark: true);
  return t.extension<SideColors>() ??
      SideColors(top: t.colorScheme.surfaceContainerLow, bottom: t.colorScheme.surfaceContainerLow, text: t.colorScheme.onSurfaceVariant, active: t.colorScheme.primary, dark: false);
}

/// The sidebar's panel (src/styles.css .sidebar): the palette's menu colours top to bottom, its text colour on them, and
/// the brand header and the signed-in person's card as the React app has them.
class _SidebarSurface extends StatelessWidget {
  const _SidebarSurface({required this.child, required this.aurora, this.header, this.footer});
  final Widget child;
  final bool aurora;
  final Widget? header, footer;
  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    final sc = sideColors(context);
    final on = sc.dark ? Colors.white : t.colorScheme.onSurface;
    final cs = t.colorScheme.copyWith(
      onSurface: on, onSurfaceVariant: sc.text, primary: sc.active,
      primaryContainer: sc.active.withValues(alpha: .16), onPrimaryContainer: on,
    );
    return DecoratedBox(
      decoration: BoxDecoration(gradient: LinearGradient(colors: [sc.top, sc.bottom], begin: Alignment.topCenter, end: Alignment.bottomCenter)),
      child: Theme(
        data: t.copyWith(
          colorScheme: cs,
          dividerColor: on.withValues(alpha: .10),
          dividerTheme: t.dividerTheme.copyWith(color: on.withValues(alpha: .10)),
          textTheme: t.textTheme.apply(bodyColor: sc.text, displayColor: sc.text),
          listTileTheme: t.listTileTheme.copyWith(iconColor: sc.text, textColor: sc.text, selectedColor: on, selectedTileColor: sc.active.withValues(alpha: .16)),
          iconTheme: IconThemeData(color: sc.text),
          iconButtonTheme: IconButtonThemeData(style: IconButton.styleFrom(foregroundColor: sc.text)),
        ),
        child: Material(
          type: MaterialType.transparency,
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            ?header,
            Expanded(child: child),
            if (footer != null) DecoratedBox(decoration: BoxDecoration(border: Border(top: BorderSide(color: on.withValues(alpha: .08)))), child: footer),
          ]),
        ),
      ),
    );
  }
}

/// The RxPOS mark: a white cross on the brand colours (src/App.jsx .brand-mark).
class RxMark extends StatelessWidget {
  const RxMark({super.key, this.size = 34});
  final double size;
  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(size * .3),
        gradient: LinearGradient(colors: [cs.primary, cs.secondary], begin: Alignment.topLeft, end: Alignment.bottomRight),
      ),
      child: Icon(Icons.add_rounded, color: Colors.white, size: size * .82, weight: 900),
    );
  }
}

/// The top of the menu: the mark, RxPOS, the pharmacy, and the button that folds the menu to icons.
class _SideHeader extends StatelessWidget {
  const _SideHeader({required this.pharmacy, required this.rail, this.onToggle});
  final String pharmacy;
  final bool rail;
  final VoidCallback? onToggle;
  @override
  Widget build(BuildContext context) {
    final sc = sideColors(context);
    final toggle = onToggle == null
        ? null
        : IconButton(key: const Key('sidebar-toggle'), tooltip: rail ? 'Show the menu (Ctrl+B)' : 'Fold the menu to icons (Ctrl+B)', onPressed: onToggle,
            icon: Icon(rail ? Icons.menu : Icons.view_sidebar_outlined, size: 20, color: sc.text));
    if (rail) return Padding(padding: const EdgeInsets.only(top: 12, bottom: 4), child: Column(children: [const RxMark(), ?toggle]));
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 14, 6, 10),
      child: Row(children: [
        const RxMark(),
        const SizedBox(width: 10),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
            Text.rich(TextSpan(children: [
              TextSpan(text: 'Rx', style: TextStyle(color: sc.dark ? Colors.white : Theme.of(context).colorScheme.onSurface)),
              TextSpan(text: 'POS', style: TextStyle(color: sc.active)),
            ]), style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800, letterSpacing: -.3, height: 1.2)),
            if (pharmacy.isNotEmpty)
              Text(pharmacy, key: const Key('sidebar-pharmacy'), maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 12.5, color: sc.text, height: 1.3)),
          ]),
        ),
        ?toggle,
      ]),
    );
  }
}

/// A group's heading in the menu: the fold arrow, the name in small capitals and how many pages it holds (as React).
class _GroupHead extends StatelessWidget {
  const _GroupHead({required this.title, required this.shut, required this.count});
  final String title;
  final bool shut;
  final int count;
  @override
  Widget build(BuildContext context) {
    final sc = sideColors(context);
    final dim = sc.text.withValues(alpha: .75);
    return Padding(
      padding: const EdgeInsets.fromLTRB(14, 14, 12, 6),
      child: Row(children: [
        AnimatedRotation(
          turns: shut ? -0.25 : 0,
          duration: const Duration(milliseconds: 150),
          child: Icon(Icons.expand_more, size: 15, color: dim, semanticLabel: shut ? 'Show $title' : 'Hide $title'),
        ),
        const SizedBox(width: 6),
        Flexible(child: Text(title.toUpperCase(), maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 11, letterSpacing: .9, fontWeight: FontWeight.w700, color: dim))),
        const SizedBox(width: 8),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
          decoration: BoxDecoration(color: sc.text.withValues(alpha: .14), borderRadius: BorderRadius.circular(99)),
          child: Text('$count', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: dim)),
        ),
        const Spacer(),
      ]),
    );
  }
}

/// One page in the menu (src/styles.css .sidebar nav a): 13.5 px, the page you are on lit in the brand colour with a bar
/// on its left, its count in amber and its shortcut key in a small key cap.
class _NavItem extends StatelessWidget {
  const _NavItem({super.key, required this.icon, required this.label, required this.selected, required this.onTap, this.count = 0, this.countKey, this.shortcut = ''});
  final IconData icon;
  final String label, shortcut;
  final bool selected;
  final int count;
  final Key? countKey;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    final sc = sideColors(context);
    final on = sc.dark ? Colors.white : Theme.of(context).colorScheme.onSurface;
    final touch = tokensOf(context).touch;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 1),
      child: Semantics(
        selected: selected,
        button: true,
        child: Material(
          color: selected ? sc.active.withValues(alpha: .16) : Colors.transparent,
          borderRadius: BorderRadius.circular(9),
          child: InkWell(
            borderRadius: BorderRadius.circular(9),
            hoverColor: on.withValues(alpha: .06),
            onTap: onTap,
            child: Stack(children: [
              if (selected) Positioned(left: 0, top: 8, bottom: 8, child: Container(width: 3, decoration: BoxDecoration(color: sc.active, borderRadius: BorderRadius.circular(3)))),
              SizedBox(
                height: touch ? 44 : 34,
                child: Row(children: [
                  const SizedBox(width: 10),
                  Icon(icon, size: 18, color: selected ? sc.active : sc.text),
                  const SizedBox(width: 11),
                  Expanded(
                    child: Text(label, maxLines: 1, overflow: TextOverflow.ellipsis,
                        style: TextStyle(fontSize: 13.5, fontWeight: selected ? FontWeight.w600 : FontWeight.w500, color: selected ? on : sc.text)),
                  ),
                  if (count > 0)
                    Container(
                      key: countKey,
                      margin: const EdgeInsets.only(left: 6),
                      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 1),
                      decoration: BoxDecoration(color: const Color(0xFFF59E0B), borderRadius: BorderRadius.circular(99)),
                      child: Text('$count', style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: Color(0xFF1F1300))),
                    ),
                  if (shortcut.isNotEmpty)
                    Container(
                      margin: const EdgeInsets.only(left: 6),
                      padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                      decoration: BoxDecoration(border: Border.all(color: sc.text.withValues(alpha: .28)), borderRadius: BorderRadius.circular(5)),
                      child: Text(shortcut, style: TextStyle(fontSize: 10, color: sc.text.withValues(alpha: .85))),
                    ),
                  const SizedBox(width: 8),
                ]),
              ),
            ]),
          ),
        ),
      ),
    );
  }
}

/// The search box at the left of the top bar (src/App.jsx .topbar-search): opens search and Ask AI (Ctrl+K).
class _SearchBox extends StatelessWidget {
  const _SearchBox({required this.onTap});
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    final muted = t.colorScheme.onSurfaceVariant;
    return Material(
      color: t.colorScheme.surface,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10), side: BorderSide(color: t.dividerColor)),
      child: InkWell(
        key: const Key('search-trigger'),
        borderRadius: BorderRadius.circular(10),
        onTap: onTap,
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 226, minHeight: 38, maxHeight: 38),
          // a narrow bar keeps the magnifier only
          child: LayoutBuilder(builder: (context, c) => c.maxWidth < 140 ? Center(child: Icon(Icons.search, size: 18, color: muted)) : Row(children: [
            const SizedBox(width: 12),
            Icon(Icons.search, size: 18, color: muted),
            const SizedBox(width: 8),
            Expanded(child: Text('Search or ask AI…', maxLines: 1, overflow: TextOverflow.ellipsis, style: t.textTheme.bodyMedium?.copyWith(color: muted))),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
              decoration: BoxDecoration(border: Border.all(color: t.dividerColor), borderRadius: BorderRadius.circular(5)),
              child: Text('Ctrl K', style: t.textTheme.labelSmall?.copyWith(color: muted)),
            ),
            const SizedBox(width: 8),
          ])),
        ),
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
        // as the React app: the group in the brand colour, the page in bold
        if (location != '/') ...[
          Flexible(child: Text(s.group, style: t.textTheme.bodyMedium?.copyWith(color: t.colorScheme.tertiary, fontWeight: FontWeight.w500), overflow: TextOverflow.ellipsis, maxLines: 1)),
          Text('  ›  ', style: t.textTheme.bodyMedium?.copyWith(color: t.colorScheme.onSurfaceVariant)),
        ],
        Flexible(child: Text(s.label, key: const Key('crumb-page'), style: t.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w700), overflow: TextOverflow.ellipsis, maxLines: 1)),
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

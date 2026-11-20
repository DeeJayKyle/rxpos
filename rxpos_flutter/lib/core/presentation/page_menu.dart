// Options on every page (src/pagemenu.js, the owner's request 2026-11-20): a right-click, or a long press on a phone
// or tablet, anywhere on a page opens what this page can do (registered with registerPageMenu while it is shown) and
// what every page can do (back, search, sync, pin). A row or card with its own long-press or menu keeps it.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../features/sync_status/application/sync_controller.dart';
import 'keys_host.dart' show togglePin, navPinsProvider;
import 'nav.dart' show Screen;
import 'top_bar.dart' show openSearch;

/// One option: [onTap] null shows it greyed.
typedef PageOption = ({String label, IconData icon, VoidCallback? onTap});

final _pages = <String, List<PageOption> Function()>{};

/// This page's own options (call it in the page's build; the latest one wins).
void registerPageMenu(String path, List<PageOption> Function() options) => _pages[path] = options;

/// Around every page: a right-click or a long press opens the options.
class PageOptions extends ConsumerWidget {
  const PageOptions({super.key, required this.location, required this.screens, required this.child});
  final String location;
  final List<Screen> screens;
  final Widget child;

  Future<void> _open(BuildContext context, WidgetRef ref, Offset at) async {
    final path = location.split('?').first;
    final own = _pages[path]?.call() ?? const <PageOption>[];
    final pinned = ref.read(navPinsProvider).contains(path);
    final all = <PageOption?>[
      ...own,
      null,
      if (path != '/') (label: 'Back', icon: Icons.arrow_back, onTap: () => context.canPop() ? context.pop() : context.go('/')),
      (label: 'Search or ask AI', icon: Icons.auto_awesome, onTap: () => openSearch(context, screens)),
      (label: 'Sync now', icon: Icons.sync, onTap: () => ref.read(syncControllerProvider.notifier).runNow()),
      if (path != '/' && screens.any((s) => s.path == path)) (label: pinned ? 'Unpin this page' : 'Pin this page', icon: Icons.push_pin_outlined, onTap: () => togglePin(ref, context, path)),
    ];
    final size = MediaQuery.sizeOf(context);
    final pick = await showMenu<VoidCallback?>(
      context: context,
      position: RelativeRect.fromLTRB(at.dx, at.dy, size.width - at.dx, size.height - at.dy),
      items: [
        for (final (i, o) in all.indexed)
          if (o == null) ...[if (i > 0 && i < all.length - 1 && own.isNotEmpty) const PopupMenuDivider()] else
            PopupMenuItem<VoidCallback?>(
              key: ValueKey('page-option-${o.label}'),
              enabled: o.onTap != null,
              value: o.onTap,
              child: Row(children: [Icon(o.icon, size: 18), const SizedBox(width: 10), Flexible(child: Text(o.label))]),
            ),
      ],
    );
    pick?.call();
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) => GestureDetector(
        key: const Key('page-options'),
        onSecondaryTapUp: (d) => _open(context, ref, d.globalPosition),
        onLongPressStart: (d) => _open(context, ref, d.globalPosition),
        child: child,
      );
}

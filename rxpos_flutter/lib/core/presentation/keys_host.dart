// The app's shortcuts (keymap.dart), back / forward, pinned and recent pages, and the ? sheet: as src/App.jsx.
import 'dart:convert';

import 'package:flutter/material.dart';
import 'app_dialog.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../data/device_settings.dart';
import 'keymap.dart';
import 'nav.dart';
import 'nav_history.dart';

/// The keys on this device (the defaults with this device's changes).
final keyMapProvider = Provider<KeyMap>((ref) => KeyMap(ref.watch(deviceValueProvider(keymapKey)).value));

/// Device keys: the pages pinned to the top of the menu, and the last pages opened (JSON lists of paths).
const navPinsKey = 'navPins', navRecentKey = 'navRecent';

List<String> _list(String? v) {
  try {
    return [for (final x in jsonDecode(v ?? '[]') as List) '$x'];
  } catch (_) {
    return const [];
  }
}

final navPinsProvider = Provider<List<String>>((ref) => _list(ref.watch(deviceValueProvider(navPinsKey)).value));
final navRecentProvider = Provider<List<String>>((ref) => _list(ref.watch(deviceValueProvider(navRecentKey)).value));

/// Pages that live inside another screen in this app (Expenses is a tab of Finance).
const _alias = {'/expenses': '/finance?tab=expenses'};

/// The till in its Advanced layout keeps Ctrl+K for its own command bar (as the React app); set by the till.
final tillOwnsCtrlK = ValueNotifier<bool>(false);

/// Pin or unpin a page.
void togglePin(WidgetRef ref, BuildContext context, String path) {
  final pins = ref.read(navPinsProvider);
  final on = pins.contains(path);
  final next = on ? pins.where((x) => x != path).toList() : [...pins, path].take(8).toList();
  ref.read(deviceValueProvider(navPinsKey).notifier).set(jsonEncode(next));
  ScaffoldMessenger.maybeOf(context)?.showSnackBar(SnackBar(content: Text(on ? 'Unpinned from the menu' : 'Pinned to the top of the menu')));
}

/// Listens for the app's shortcuts while it is shown; [onPalette] opens Ctrl+K search.
class KeysHost extends ConsumerStatefulWidget {
  const KeysHost({super.key, required this.location, required this.screens, required this.onPalette, required this.child});
  final String location;
  final List<Screen> screens;
  final VoidCallback onPalette;
  final Widget child;
  @override
  ConsumerState<KeysHost> createState() => _KeysHostState();
}

class _KeysHostState extends ConsumerState<KeysHost> {
  late final KeyMatcher _m = KeyMatcher(ref.read(keyMapProvider), [for (final a in keyActions) if (!a.$1.startsWith('list:')) a.$1]);

  @override
  void initState() {
    super.initState();
    HardwareKeyboard.instance.addHandler(_onKey);
    WidgetsBinding.instance.addPostFrameCallback((_) => _visited(widget.location));
  }

  @override
  void didUpdateWidget(KeysHost old) {
    super.didUpdateWidget(old);
    if (old.location != widget.location) WidgetsBinding.instance.addPostFrameCallback((_) => _visited(widget.location));
  }

  @override
  void dispose() {
    HardwareKeyboard.instance.removeHandler(_onKey);
    super.dispose();
  }

  void _visited(String path) {
    if (!mounted) return;
    final recent = [path, ...ref.read(navRecentProvider).where((x) => x != path)].take(6).toList();
    ref.read(deviceValueProvider(navRecentKey).notifier).set(jsonEncode(recent));
  }

  /// Alt+← / →: through this session's pages (nav_history.dart, shared with the Back button and the edge swipe).
  void _step(int by) {
    final h = ref.read(navHistoryProvider);
    if (by < 0 && h.canStepBack) h.back(GoRouter.of(context));
    if (by > 0) h.forward(GoRouter.of(context));
  }

  bool _onKey(KeyEvent e) {
    if (!mounted || e is KeyUpEvent) return false;
    // a dialog or a menu on top: the keys are its own
    if (ModalRoute.of(context)?.isCurrent == false) return false;
    _m.map = ref.read(keyMapProvider);
    final c = comboOf(e);
    if (c == null) return false;
    if (typingNow() && !c.contains('+') && c.length == 1) return false; // a letter typed in a box
    final id = _m.match(e);
    if (id == null) return false;
    final onTill = widget.location.startsWith('/pos');
    if (onTill && (id == 'help' || id == 'back' || id == 'forward')) return false; // the till has its own ? and Alt+←/→
    if (onTill && id == 'palette' && tillOwnsCtrlK.value) return false;
    if (id.startsWith('go:')) {
      final path = id.substring(3);
      final target = _alias[path] ?? path;
      final base = target.split('?').first;
      if (!widget.screens.any((s) => s.path == base)) return false;
      context.go(target);
    } else if (id == 'palette') {
      widget.onPalette();
    } else if (id == 'help') {
      showKeysHelp(context, ref.read(keyMapProvider), widget.screens);
    } else if (id == 'back') {
      _step(-1);
    } else if (id == 'forward') {
      _step(1);
    } else if (id == 'pin') {
      togglePin(ref, context, widget.location);
    }
    return true;
  }

  @override
  Widget build(BuildContext context) => widget.child;
}

/// ? on any page: the keys as they are on this device, and what the mouse does.
Future<void> showKeysHelp(BuildContext context, KeyMap map, List<Screen> screens) {
  final allowed = {for (final s in screens) 'go:${s.path}', if (screens.any((s) => s.path == '/finance')) 'go:/expenses'};
  Widget table(String group) => Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Padding(padding: const EdgeInsets.only(top: 12, bottom: 4), child: Text(group == 'Lists' ? 'IN LISTS (CUSTOMERS, MEDICINES, SALES…)' : group.toUpperCase(), style: Theme.of(context).textTheme.labelSmall)),
        for (final a in keyActions)
          if (a.$3 == group && (!a.$1.startsWith('go:') || allowed.contains(a.$1)) && map.keyOf(a.$1).isNotEmpty)
            Padding(padding: const EdgeInsets.symmetric(vertical: 2), child: Row(children: [SizedBox(width: 130, child: Text(showKey(map.keyOf(a.$1)), style: const TextStyle(fontWeight: FontWeight.w700))), Expanded(child: Text(a.$2))])),
      ]);
  return showAppDialog(
    context: context,
    builder: (c) => AlertDialog(
      title: const Text('Keyboard and mouse'),
      content: SizedBox(
        width: 560,
        child: SingleChildScrollView(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            table('Pages'), table('Anywhere'), table('Lists'),
            Padding(padding: const EdgeInsets.only(top: 12, bottom: 4), child: Text('MOUSE', style: Theme.of(context).textTheme.labelSmall)),
            for (final (k, v) in const [('Double-click', 'Open or edit a row'), ('Right-click', 'What you can do with a row'), ('Shift+click', 'Tick every row between two ticks'), ('Long press', 'The row\'s menu, on a touch screen')])
              Padding(padding: const EdgeInsets.symmetric(vertical: 2), child: Row(children: [SizedBox(width: 130, child: Text(k, style: const TextStyle(fontWeight: FontWeight.w700))), Expanded(child: Text(v))])),
            const SizedBox(height: 8),
            const Text('The till has its own keys: press ? there.'),
          ]),
        ),
      ),
      actions: [
        TextButton(onPressed: () {
          Navigator.pop(c);
          context.go('/device');
        }, child: const Text('Change the keys')),
        FilledButton(onPressed: () => Navigator.pop(c), child: const Text('Close')),
      ],
    ),
  );
}

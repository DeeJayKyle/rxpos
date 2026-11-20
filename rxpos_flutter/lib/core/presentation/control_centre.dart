// 1.18.0 (the owner's choice, iPhone-style; as the web app's ControlCentre.jsx, AppLibrary.jsx and LockScreen.jsx):
//   Control Centre  the device's quick switches in one panel from the top bar: dark mode, the gradient, Dynamic Island,
//                   sheets, sync, the App Library, lock the till and auto-lock
//   App Library     every page this person may open as app icons in folders by menu group, with a search A to Z
//   Till lock       a screen over everything with the time, the date and what is waiting; it opens with the quick PIN
//                   or the password (AuthRepository.approve: this device's verifier, else the cloud's sign-in closed at
//                   once). From Control Centre, Ctrl+Shift+L, or by itself after the idle minutes chosen. A restart keeps it.
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../features/alerts/application/alerts_provider.dart' show navCountsProvider;
import '../../features/auth/application/session_controller.dart';
import '../../features/sync_status/application/sync_controller.dart';
import '../data/device_settings.dart';
import '../data/pharmacy_providers.dart';
import '../theme/behaviour.dart';
import '../theme/theme_choice.dart';
import '../theme/themes.dart';
import 'app_dialog.dart';
import 'nav.dart';

/// Lock the till now (the person signed in holds the key to it)
Future<void> lockTill(WidgetRef ref) async {
  final s = ref.read(sessionControllerProvider).value;
  if (s != null) await ref.read(deviceValueProvider(lockedKey).notifier).set(s.userId);
}

class ControlCentreButton extends ConsumerWidget {
  const ControlCentreButton({super.key, required this.screens});
  final List<Screen> screens;
  @override
  Widget build(BuildContext context, WidgetRef ref) => IconButton(
        key: const Key('control-centre'),
        tooltip: 'Control Centre',
        icon: const Icon(Icons.tune),
        onPressed: () => showAppDialog<void>(context: context, builder: (_) => ControlCentre(screens: screens)),
      );
}

class ControlCentre extends ConsumerWidget {
  const ControlCentre({super.key, required this.screens});
  final List<Screen> screens;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = Theme.of(context);
    final look = ref.watch(lookProvider).value ?? const Look();
    final b = ref.watch(behaviourProvider);
    final ctl = ref.read(lookProvider.notifier);
    final dark = paletteById(look.theme).dark;
    final branding = ref.watch(brandingProvider);
    const grads = ['off', 'soft', 'bold'];
    void close() => Navigator.of(context).pop();
    Widget tile(String key, IconData icon, String label, {bool on = false, String? sub, required VoidCallback onTap, bool big = false, bool ink = false}) {
      final bg = on ? t.colorScheme.primary : ink ? t.colorScheme.onSurface : t.colorScheme.surfaceContainerHighest;
      final fg = on ? t.colorScheme.onPrimary : ink ? t.colorScheme.surface : t.colorScheme.onSurface;
      return Semantics(
        button: true,
        toggled: big || on ? on : null,
        child: Material(
          color: bg,
          borderRadius: BorderRadius.circular(18),
          child: InkWell(
            key: Key('cc-$key'),
            borderRadius: BorderRadius.circular(18),
            onTap: onTap,
            child: Padding(
              padding: big ? const EdgeInsets.symmetric(horizontal: 12, vertical: 6) : const EdgeInsets.all(8),
              child: big
                  ? Row(children: [
                      Icon(icon, color: fg),
                      const SizedBox(width: 10),
                      Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
                        Text(label, style: t.textTheme.labelLarge?.copyWith(color: fg, fontWeight: FontWeight.w700)),
                        if (sub != null) Text(sub, style: t.textTheme.bodySmall?.copyWith(color: fg)),
                      ])),
                    ])
                  : Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                      Icon(icon, color: fg, size: 22),
                      const SizedBox(height: 6),
                      Text(label, textAlign: TextAlign.center, maxLines: 2, style: t.textTheme.labelSmall?.copyWith(color: fg)),
                    ]),
            ),
          ),
        ),
      );
    }

    return Dialog(
      key: const Key('control-centre-panel'),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(26)),
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 380),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(14, 10, 14, 14),
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Row(children: [
              Expanded(child: Text('Control Centre', style: t.textTheme.titleMedium)),
              IconButton(tooltip: 'Close', onPressed: close, icon: const Icon(Icons.close)),
            ]),
            Row(children: [
              Expanded(child: SizedBox(height: 72, child: tile('dark', dark ? Icons.dark_mode : Icons.light_mode_outlined, 'Dark mode', sub: dark ? 'On' : 'Off', on: dark, big: true,
                  onTap: () => ctl.base(!dark, allowedPalettes(branding), preferred: '${branding?['defaultTheme'] ?? ''}')))),
              const SizedBox(width: 10),
              Expanded(child: SizedBox(height: 72, child: tile('gradient', Icons.gradient, 'Gradient', sub: '${look.gradient[0].toUpperCase()}${look.gradient.substring(1)}', on: look.gradient != 'off', big: true,
                  onTap: () => ctl.gradient(grads[(grads.indexOf(look.gradient) + 1) % grads.length])))),
            ]),
            const SizedBox(height: 10),
            GridView.count(
              crossAxisCount: 4,
              shrinkWrap: true,
              mainAxisSpacing: 10,
              crossAxisSpacing: 10,
              childAspectRatio: .8,
              physics: const NeverScrollableScrollPhysics(),
              children: [
                tile('sheets', Icons.view_agenda_outlined, 'Sheets & gestures', on: b.sheets, onTap: () => updateBehaviour(ref, (x) => x.copyWith(sheets: !x.sheets))),
                tile('island', Icons.sms_outlined, 'Dynamic Island', on: b.island, onTap: () => updateBehaviour(ref, (x) => x.copyWith(island: !x.island))),
                tile('sync', Icons.sync, 'Sync now', onTap: () {
                  close();
                  ref.read(syncControllerProvider.notifier).runNow();
                }),
                tile('library', Icons.apps, 'App Library', onTap: () {
                  close();
                  showAppDialog<void>(context: context, builder: (_) => AppLibrary(screens: screens));
                }),
              ],
            ),
            const SizedBox(height: 10),
            SizedBox(height: 52, child: tile('lock', Icons.lock_outline, 'Lock the till', big: true, ink: true, onTap: () {
              close();
              lockTill(ref);
            })),
            const Divider(height: 24),
            Text('Lock by itself after', style: t.textTheme.bodySmall),
            const SizedBox(height: 6),
            SegmentedButton<int>(
              key: const Key('auto-lock'),
              showSelectedIcon: false,
              segments: [for (final (m, l) in lockAfterChoices) ButtonSegment(value: m, label: Text(l))],
              selected: {b.lock},
              onSelectionChanged: (v) => updateBehaviour(ref, (x) => x.copyWith(lock: v.first)),
            ),
          ]),
        ),
      ),
    );
  }
}

/// Every page as app icons in folders by menu group, with a search that lists pages A to Z.
class AppLibrary extends StatefulWidget {
  const AppLibrary({super.key, required this.screens});
  final List<Screen> screens;
  @override
  State<AppLibrary> createState() => _AppLibraryState();
}

class _AppLibraryState extends State<AppLibrary> {
  String _q = '';
  String _open = '';

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    void go(Screen s) {
      Navigator.of(context).pop();
      context.go(s.path);
    }

    Widget app(Screen s, {bool big = true}) => InkWell(
          key: ValueKey('lib-${s.path}'),
          borderRadius: BorderRadius.circular(14),
          onTap: () => go(s),
          child: Padding(
            padding: const EdgeInsets.all(4),
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              Container(
                width: big ? 52 : 34,
                height: big ? 52 : 34,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(big ? 14 : 9),
                  gradient: LinearGradient(colors: [t.colorScheme.primary, t.colorScheme.secondary], begin: Alignment.topLeft, end: Alignment.bottomRight),
                ),
                child: Icon(s.icon, color: t.colorScheme.onPrimary, size: big ? 24 : 18),
              ),
              const SizedBox(height: 4),
              Text(s.label, maxLines: 2, textAlign: TextAlign.center, overflow: TextOverflow.ellipsis, style: t.textTheme.labelSmall),
            ]),
          ),
        );
    final q = _q.trim().toLowerCase();
    final found = q.isEmpty ? null : (widget.screens.where((s) => s.label.toLowerCase().contains(q)).toList()..sort((a, b) => a.label.compareTo(b.label)));
    final groups = [for (final g in ['Home', ...navGroups]) if (widget.screens.any((s) => (s.group.isEmpty ? 'Home' : s.group) == g)) g];
    List<Screen> of(String g) => widget.screens.where((s) => (s.group.isEmpty ? 'Home' : s.group) == g).toList();
    return Dialog(
      key: const Key('app-library'),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(28)),
      child: ConstrainedBox(
        constraints: BoxConstraints(maxWidth: 820, maxHeight: MediaQuery.sizeOf(context).height * .88),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Row(children: [
              Expanded(
                child: TextField(
                  key: const Key('lib-search'),
                  decoration: const InputDecoration(prefixIcon: Icon(Icons.search), hintText: 'App Library', isDense: true),
                  onChanged: (v) => setState(() => _q = v),
                ),
              ),
              IconButton(tooltip: 'Close', onPressed: () => Navigator.of(context).pop(), icon: const Icon(Icons.close)),
            ]),
            const SizedBox(height: 12),
            Flexible(
              child: found != null
                  ? ListView(shrinkWrap: true, children: [
                      for (final s in found) ListTile(key: ValueKey('lib-row-${s.path}'), leading: Icon(s.icon), title: Text(s.label), subtitle: Text(s.group.isEmpty ? 'Home' : s.group), onTap: () => go(s)),
                      if (found.isEmpty) Padding(padding: const EdgeInsets.all(12), child: Text('No page called “${_q.trim()}”', style: t.textTheme.bodySmall)),
                    ])
                  : _open.isNotEmpty
                      ? ListView(shrinkWrap: true, children: [
                          Align(alignment: Alignment.centerLeft, child: TextButton.icon(onPressed: () => setState(() => _open = ''), icon: const Icon(Icons.chevron_left), label: const Text('All folders'))),
                          Text(_open, style: t.textTheme.titleMedium),
                          const SizedBox(height: 8),
                          Wrap(spacing: 8, runSpacing: 8, children: [for (final s in of(_open)) SizedBox(width: 92, child: app(s))]),
                        ])
                      : GridView.extent(
                          shrinkWrap: true,
                          maxCrossAxisExtent: 200,
                          mainAxisSpacing: 12,
                          crossAxisSpacing: 12,
                          childAspectRatio: .86,
                          children: [
                            for (final g in groups)
                              Card(
                                key: ValueKey('lib-folder-$g'),
                                margin: EdgeInsets.zero,
                                child: Padding(
                                  padding: const EdgeInsets.fromLTRB(8, 8, 8, 4),
                                  child: Column(children: [
                                    Expanded(
                                      child: GridView.count(crossAxisCount: 2, physics: const NeverScrollableScrollPhysics(), childAspectRatio: .9, children: [
                                        for (final s in of(g).take(of(g).length > 4 ? 3 : 4)) app(s, big: false),
                                        if (of(g).length > 4)
                                          InkWell(
                                            key: ValueKey('lib-more-$g'),
                                            borderRadius: BorderRadius.circular(12),
                                            onTap: () => setState(() => _open = g),
                                            child: Center(child: Wrap(spacing: 2, runSpacing: 2, children: [for (final s in of(g).skip(3).take(4)) Icon(s.icon, size: 14, color: t.colorScheme.tertiary)])),
                                          ),
                                      ]),
                                    ),
                                    TextButton(onPressed: () => setState(() => _open = g), child: Text(g, style: t.textTheme.labelLarge?.copyWith(fontWeight: FontWeight.w700))),
                                  ]),
                                ),
                              ),
                          ],
                        ),
            ),
          ]),
        ),
      ),
    );
  }
}

/// Watches the till lock: shows the lock screen when this person locked it (also after a restart), locks by itself
/// after the idle minutes chosen, and Ctrl+Shift+L locks it.
class TillLockGuard extends ConsumerStatefulWidget {
  const TillLockGuard({super.key, required this.child});
  final Widget child;
  @override
  ConsumerState<TillLockGuard> createState() => _TillLockGuardState();
}

class _TillLockGuardState extends ConsumerState<TillLockGuard> {
  Timer? _idle;
  bool _shown = false;

  @override
  void initState() {
    super.initState();
    HardwareKeyboard.instance.addHandler(_onKey);
    WidgetsBinding.instance.addPostFrameCallback((_) { if (mounted) _arm(); });
  }

  @override
  void dispose() {
    _idle?.cancel();
    HardwareKeyboard.instance.removeHandler(_onKey);
    super.dispose();
  }

  bool _onKey(KeyEvent e) {
    _arm();
    final k = HardwareKeyboard.instance;
    if (e is KeyDownEvent && e.logicalKey == LogicalKeyboardKey.keyL && (k.isControlPressed || k.isMetaPressed) && k.isShiftPressed) {
      lockTill(ref);
      return true;
    }
    return false;
  }

  void _arm() {
    _idle?.cancel();
    final m = ref.read(behaviourProvider).lock;
    if (m > 0 && !_shown) _idle = Timer(Duration(minutes: m), () => lockTill(ref));
  }

  void _show() {
    if (_shown) return;
    _shown = true;
    _idle?.cancel();
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      if (!mounted) return;
      await Navigator.of(context, rootNavigator: true).push(PageRouteBuilder<void>(
        opaque: true,
        settings: const RouteSettings(name: 'till-lock'),
        pageBuilder: (_, _, _) => const LockScreen(),
        transitionsBuilder: (_, a, _, child) => FadeTransition(opacity: a, child: child),
      ));
      _shown = false;
      _arm();
    });
  }

  @override
  Widget build(BuildContext context) {
    final me = ref.watch(sessionControllerProvider).value;
    final locked = ref.watch(deviceValueProvider(lockedKey)).value;
    ref.listen(behaviourProvider.select((b) => b.lock), (_, _) => _arm());
    if (me != null && locked != null && locked == me.userId) _show();
    return Listener(behavior: HitTestBehavior.translucent, onPointerDown: (_) => _arm(), child: widget.child);
  }
}

class LockScreen extends ConsumerStatefulWidget {
  const LockScreen({super.key});
  @override
  ConsumerState<LockScreen> createState() => _LockScreenState();
}

class _LockScreenState extends ConsumerState<LockScreen> {
  final _c = TextEditingController();
  late Timer _tick;
  DateTime _now = DateTime.now();
  String _err = '';
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _tick = Timer.periodic(const Duration(seconds: 5), (_) => setState(() => _now = DateTime.now()));
  }

  @override
  void dispose() {
    _tick.cancel();
    _c.dispose();
    super.dispose();
  }

  Future<void> _unlock() async {
    final s = ref.read(sessionControllerProvider).value;
    if (s == null || _c.text.isEmpty || _busy) return;
    setState(() {
      _busy = true;
      _err = '';
    });
    final ok = await ref.read(authRepositoryProvider).approve(s.tenant, s.userId, _c.text);
    if (!mounted) return;
    if (ok) {
      await ref.read(deviceValueProvider(lockedKey).notifier).set(null);
      if (mounted) Navigator.of(context).pop();
    } else {
      setState(() {
        _busy = false;
        _err = 'Wrong PIN or password.';
        _c.clear();
      });
    }
  }

  Future<void> _signOut() async {
    await ref.read(deviceValueProvider(lockedKey).notifier).set(null);
    if (mounted) Navigator.of(context).pop();
    await ref.read(sessionControllerProvider.notifier).signOut();
  }

  @override
  Widget build(BuildContext context) {
    final s = ref.watch(sessionControllerProvider).value;
    final counts = ref.watch(navCountsProvider);
    final p = Theme.of(context).colorScheme;
    const white = Colors.white;
    String two(int v) => v.toString().padLeft(2, '0');
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    final waiting = [
      if ((counts['chat'] ?? 0) > 0) (Icons.forum_outlined, '${counts['chat']} unread message${counts['chat'] == 1 ? '' : 's'}'),
      if ((counts['expiry'] ?? 0) > 0) (Icons.event_busy_outlined, '${counts['expiry']} expiring or expired'),
      if ((counts['low'] ?? 0) > 0) (Icons.inventory_2_outlined, '${counts['low']} medicine${counts['low'] == 1 ? '' : 's'} low on stock'),
    ];
    return PopScope(
      canPop: false,
      child: Scaffold(
        key: const Key('lock-screen'),
        body: Container(
          decoration: BoxDecoration(gradient: LinearGradient(colors: [Color.lerp(p.primary, Colors.black, .55)!, Color.lerp(p.primary, Colors.black, .25)!], begin: Alignment.topCenter, end: Alignment.bottomCenter)),
          child: SafeArea(
            child: Center(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(20),
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 380),
                  child: DefaultTextStyle(
                    style: const TextStyle(color: white),
                    child: Column(mainAxisSize: MainAxisSize.min, children: [
                      const Icon(Icons.lock_outline, color: white),
                      const SizedBox(height: 6),
                      Text('${days[_now.weekday - 1]} ${_now.day} ${months[_now.month - 1]}', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600, color: white)),
                      Text('${two(_now.hour)}:${two(_now.minute)}', key: const Key('lock-time'),
                          style: const TextStyle(fontSize: 88, fontWeight: FontWeight.w700, height: 1.05, color: white, fontFeatures: [FontFeature.tabularFigures()])),
                      Text('${s?.pharmacy ?? ''} · locked by ${s?.userName ?? ''}', style: const TextStyle(color: white)),
                      const SizedBox(height: 14),
                      for (final (icon, text) in waiting)
                        Container(
                          margin: const EdgeInsets.only(bottom: 6),
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                          decoration: BoxDecoration(color: white.withValues(alpha: .14), borderRadius: BorderRadius.circular(14)),
                          child: Row(children: [Icon(icon, size: 18, color: white), const SizedBox(width: 10), Expanded(child: Text(text, style: const TextStyle(color: white)))]),
                        ),
                      const SizedBox(height: 8),
                      TextField(
                        key: const Key('lock-secret'),
                        controller: _c,
                        autofocus: true,
                        obscureText: true,
                        enabled: !_busy,
                        textAlign: TextAlign.center,
                        style: const TextStyle(color: white, fontSize: 20, letterSpacing: 3),
                        decoration: InputDecoration(
                          hintText: 'PIN or password',
                          hintStyle: TextStyle(color: white.withValues(alpha: .75), letterSpacing: 0),
                          filled: true,
                          fillColor: white.withValues(alpha: .12),
                          enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide(color: white.withValues(alpha: .4))),
                          focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: white, width: 2)),
                        ),
                        onSubmitted: (_) => _unlock(),
                      ),
                      if (_err.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 8), child: Text(_err, key: const Key('lock-error'), style: const TextStyle(color: white, fontWeight: FontWeight.w700))),
                      const SizedBox(height: 10),
                      SizedBox(
                        width: double.infinity,
                        child: FilledButton(
                          key: const Key('lock-unlock'),
                          style: FilledButton.styleFrom(backgroundColor: white, foregroundColor: Colors.black),
                          onPressed: _busy ? null : _unlock,
                          child: Text(_busy ? 'Checking…' : 'Unlock'),
                        ),
                      ),
                      const SizedBox(height: 10),
                      TextButton.icon(
                        key: const Key('lock-sign-out'),
                        style: TextButton.styleFrom(foregroundColor: white),
                        onPressed: _signOut,
                        icon: const Icon(Icons.logout, size: 16),
                        label: Text('Not ${(s?.userName ?? '').split(' ').first}? Sign out'),
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

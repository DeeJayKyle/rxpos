// Top bar pieces (src/App.jsx): the live clock with where this device's work stands, the "No internet connection"
// banner, the branch this device works as, and Ctrl+K search over pages, medicines, customers and receipts.
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../features/sync_status/application/sync_controller.dart';
import '../data/pharmacy_providers.dart';
import '../rules/money.dart';
import 'nav.dart';
import 'widgets.dart';

String _hms(DateTime d) => [d.hour, d.minute, d.second].map((v) => v.toString().padLeft(2, '0')).join(':');
const _wd = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], _mo = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/// Live clock plus where this device's work stands: Offline (with how many changes are waiting), Syncing, a count of
/// changes waiting, Synced, or Needs attention. The tooltip says why; tapping tries again (or opens Sync & storage).
class ClockPill extends ConsumerStatefulWidget {
  const ClockPill({super.key, this.compact = false, this.date = true});
  final bool compact, date;
  @override
  ConsumerState<ClockPill> createState() => _ClockPillState();
}

class _ClockPillState extends ConsumerState<ClockPill> {
  late Timer _t;
  DateTime _now = DateTime.now();

  @override
  void initState() {
    super.initState();
    _t = Timer.periodic(const Duration(seconds: 1), (_) => setState(() => _now = DateTime.now()));
  }

  @override
  void dispose() {
    _t.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final s = ref.watch(syncControllerProvider);
    final attention = s.state == SyncState.needsAttention || s.state == SyncState.signInAgain || s.rejected > 0;
    final color = attention
        ? Theme.of(context).colorScheme.error
        : s.state == SyncState.offline
            ? Colors.orange.shade800
            : s.state == SyncState.syncing || s.pending > 0
                ? Theme.of(context).colorScheme.primary
                : Colors.green.shade700;
    String time(String? iso) {
      final d = DateTime.tryParse(iso ?? '')?.toLocal();
      return d == null ? '' : _hms(d);
    }

    final tip = s.state == SyncState.signInAgain
        ? 'Signed out of the cloud: sign in again'
        : s.rejected > 0
            ? '${s.rejected} change(s) were refused by the cloud and kept on this device for review (Sync & storage)'
            : s.state == SyncState.needsAttention
                ? '${s.error ?? 'Sync needs attention'}${s.pending > 0 ? ' · ${s.pending} change(s) waiting, kept on this device' : ''}'
                : s.state == SyncState.offline
                    ? 'Offline: your work is saved on this device${s.pending > 0 ? ' (${s.pending} change(s) waiting)' : ''} and goes up when the internet is back'
                    : s.lastSync != null
                        ? '${s.pending > 0 ? '${s.pending} change(s) on their way · ' : ''}Up to date ${time(s.lastSync)}'
                        : 'Connecting…';
    final label = s.rejected > 0 ? 'Needs attention' : s.label;
    // on a phone the dot alone (its colour says it; the words are in the tooltip and read out), so the pharmacy name fits
    final dotOnly = widget.compact && MediaQuery.sizeOf(context).width < 480;
    return Semantics(
      label: 'Sync: $label',
      child: Tooltip(
      message: dotOnly ? '$label · $tip' : tip,
      child: InkWell(
        key: const Key('clock-pill'),
        borderRadius: BorderRadius.circular(20),
        onTap: () => attention ? context.go('/sync') : ref.read(syncControllerProvider.notifier).runNow(),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
          decoration: BoxDecoration(borderRadius: BorderRadius.circular(20), border: Border.all(color: color.withValues(alpha: .5))),
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            Container(width: dotOnly ? 10 : 8, height: dotOnly ? 10 : 8, decoration: BoxDecoration(color: color, shape: BoxShape.circle)),
            if (!dotOnly) ...[
              const SizedBox(width: 6),
              Text(label, style: TextStyle(color: color, fontWeight: FontWeight.w700, fontSize: 12)),
            ],
            if (!widget.compact) ...[
              const SizedBox(width: 8),
              Text(_hms(_now), style: const TextStyle(fontFeatures: [FontFeature.tabularFigures()], fontSize: 12)),
              if (widget.date) ...[
                const SizedBox(width: 6),
                Text('${_wd[_now.weekday - 1]} ${_now.day} ${_mo[_now.month - 1]}', style: Theme.of(context).textTheme.bodySmall),
              ],
            ],
          ]),
        ),
      ),
      ),
    );
  }
}

/// A strip under the top bar while the internet is down: the work is saved here and goes up later.
class OfflineBanner extends ConsumerWidget {
  const OfflineBanner({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = ref.watch(syncControllerProvider);
    if (s.state != SyncState.offline) return const SizedBox.shrink();
    return Material(
      key: const Key('offline-banner'),
      color: Colors.orange.shade100,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        child: Row(children: [
          Icon(Icons.wifi_off, size: 18, color: Colors.orange.shade900),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              'No internet connection. Keep working: everything is saved on this device${s.pending > 0 ? ' (${s.pending} change${s.pending == 1 ? '' : 's'} waiting)' : ''} and goes up when the internet is back.',
              style: TextStyle(color: Colors.orange.shade900),
            ),
          ),
          TextButton(onPressed: () => ref.read(syncControllerProvider.notifier).runNow(), child: const Text('Try again')),
        ]),
      ),
    );
  }
}

/// The branch this device works as, when the pharmacy has more than one (opens Branches & Transfers).
class BranchPill extends ConsumerWidget {
  const BranchPill({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final branches = ref.watch(tableProvider('branches')).value ?? const [];
    final d = ref.watch(pharmacyProvider).value;
    if (d == null || branches.length < 2) return const SizedBox.shrink();
    final name = '${branches.where((b) => b['id'] == d.branch).firstOrNull?['name'] ?? (d.branch == 'main' ? 'Main' : d.branch)}';
    return Tooltip(
      message: 'Branch this device works as',
      child: ActionChip(key: const Key('branch-pill'), avatar: const Icon(Icons.store_mall_directory_outlined, size: 16), label: Text(name), onPressed: () => context.go('/branches')),
    );
  }
}

class _Hit {
  const _Hit(this.section, this.label, this.icon, this.go, {this.hint = ''});
  final String section, label, hint;
  final IconData icon;
  final String go;
}

/// Ctrl+K: jump to any page, medicine, customer or receipt.
Future<void> openSearch(BuildContext context, List<Screen> pages) => showDialog<void>(context: context, builder: (_) => CommandPalette(pages: pages));

class CommandPalette extends ConsumerStatefulWidget {
  const CommandPalette({super.key, required this.pages});
  final List<Screen> pages;
  @override
  ConsumerState<CommandPalette> createState() => _CommandPaletteState();
}

class _CommandPaletteState extends ConsumerState<CommandPalette> {
  String _q = '';
  int _active = 0;

  List<_Hit> _results() {
    final s = _q.trim().toLowerCase();
    bool has(List<Object?> v) => v.join(' ').toLowerCase().contains(s);
    // the owner's request: Ctrl+K also runs commands ("new sale", "receive stock", "add a customer"…), as the React app
    final can = {for (final p in widget.pages) p.path};
    final commands = [
      if (can.contains('/pos')) ('New sale', 'sell till pos', Icons.point_of_sale, '/pos'),
      if (can.contains('/add-stock')) ('Receive stock', 'add stock delivery invoice purchase', Icons.add_box_outlined, '/add-stock'),
      if (can.contains('/customers')) ('Add a customer', 'new client patient', Icons.person_add_alt, '/customers?new=1'),
      if (can.contains('/suppliers')) ('Add a supplier', 'new supplier', Icons.local_shipping_outlined, '/suppliers?new=1'),
      if (can.contains('/device')) ('Change keyboard shortcuts', 'keys remap keyboard settings', Icons.keyboard_outlined, '/device'),
    ];
    final out = <_Hit>[
      for (final c in commands.where((c) => s.isNotEmpty ? has([c.$1, c.$2]) : true).take(s.isEmpty ? 3 : 5)) _Hit('Commands', c.$1, c.$3, c.$4),
      for (final p in widget.pages.where((p) => s.isEmpty || has([p.label])).take(s.isEmpty ? 8 : 6)) _Hit('Pages', p.label, p.icon, p.path, hint: p.keyLabel),
    ];
    if (s.isEmpty) return out;
    final d = ref.watch(pharmacyProvider).value;
    final sales = ref.watch(tableProvider('sales')).value ?? const [];
    if (d != null) {
      final st = d.settings;
      for (final p in d.products.where((p) => has([p.name, p.generic, p.barcode])).take(6)) {
        out.add(_Hit('Medicines', p.name, Icons.medication_outlined, '/stock-card?id=${Uri.encodeComponent(p.id)}', hint: '${formatQty(d.stockOf(p.id))} in stock · ${st.money(p.price)}'));
      }
      for (final c in d.customers.where((c) => has([c.name, c.phone])).take(4)) {
        out.add(_Hit('Customers', c.name, Icons.person_outline, '/customers?q=${Uri.encodeComponent(c.name)}', hint: c.phone));
      }
      for (final x in sales.where((x) => has([x['number']])).take(4)) {
        out.add(_Hit('Receipts', '${x['number']}', Icons.receipt_long_outlined, '/sales?q=${Uri.encodeComponent('${x['number']}')}', hint: st.money((x['total'] as num?) ?? 0)));
      }
    }
    return out;
  }

  void _pick(_Hit h) {
    Navigator.pop(context);
    context.go(h.go);
  }

  @override
  Widget build(BuildContext context) {
    final results = _results();
    final t = Theme.of(context);
    String? last;
    return Align(
      alignment: const Alignment(0, -.6),
      child: Material(
        elevation: 12,
        borderRadius: BorderRadius.circular(14),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 600, maxHeight: 480),
          child: Focus(
            onKeyEvent: (_, e) {
              if (e is! KeyDownEvent && e is! KeyRepeatEvent) return KeyEventResult.ignored;
              if (e.logicalKey == LogicalKeyboardKey.arrowDown) {
                setState(() => _active = (_active + 1).clamp(0, results.isEmpty ? 0 : results.length - 1));
                return KeyEventResult.handled;
              }
              if (e.logicalKey == LogicalKeyboardKey.arrowUp) {
                setState(() => _active = (_active - 1).clamp(0, results.isEmpty ? 0 : results.length - 1));
                return KeyEventResult.handled;
              }
              return KeyEventResult.ignored;
            },
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              Padding(
                padding: const EdgeInsets.all(12),
                child: TextField(
                  key: const Key('palette-input'),
                  autofocus: true,
                  decoration: const InputDecoration(prefixIcon: Icon(Icons.search), hintText: 'Search pages, medicines, customers, receipts…', suffixText: 'Esc'),
                  onChanged: (v) => setState(() {
                    _q = v;
                    _active = 0;
                  }),
                  onSubmitted: (_) {
                    if (results.isNotEmpty) _pick(results[_active.clamp(0, results.length - 1)]);
                  },
                ),
              ),
              Flexible(
                child: results.isEmpty
                    ? Padding(padding: const EdgeInsets.all(20), child: Text('Nothing found for “$_q”'))
                    : ListView(shrinkWrap: true, children: [
                        for (final (i, r) in results.indexed) ...[
                          if (r.section != last) Padding(padding: const EdgeInsets.fromLTRB(16, 8, 16, 2), child: Text(last = r.section, style: t.textTheme.labelSmall)),
                          ListTile(
                            dense: true,
                            selected: i == _active,
                            leading: Icon(r.icon, size: 18),
                            title: Text(r.label),
                            trailing: Row(mainAxisSize: MainAxisSize.min, children: [
                              if (r.hint.isNotEmpty) Text(r.hint, style: t.textTheme.bodySmall),
                              if (i == _active) const Padding(padding: EdgeInsets.only(left: 6), child: Icon(Icons.keyboard_return, size: 14)),
                            ]),
                            onTap: () => _pick(r),
                          ),
                        ],
                      ]),
              ),
            ]),
          ),
        ),
      ),
    );
  }
}

/// The first sign-in on a device downloads the whole pharmacy: progress instead of empty screens (src/App.jsx
/// FirstDownload). Shown while that first download runs and the medicine list is still small.
class FirstDownload extends ConsumerWidget {
  const FirstDownload({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = ref.watch(syncControllerProvider);
    final d = ref.watch(pharmacyProvider).value;
    // stage 2 of the faster sync: once the core (medicines, stock, clients, staff) is in, the app is ready to use
    if (!(s.first && s.state == SyncState.syncing) || s.history || (d != null && d.products.length > 50)) {
      return const SizedBox.shrink();
    }
    final name = d == null || d.settings.name == 'My Pharmacy' ? 'your pharmacy' : d.settings.name;
    final t = Theme.of(context);
    return Positioned.fill(
      child: ColoredBox(
        key: const Key('first-download'),
        color: t.colorScheme.surface.withValues(alpha: .96),
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              const CircularProgressIndicator(),
              const SizedBox(height: 16),
              Text('Setting up $name on this device…', textAlign: TextAlign.center, style: t.textTheme.titleLarge),
              const SizedBox(height: 8),
              Text(s.progress ?? 'Downloading medicines, stock and staff. This happens only once.', textAlign: TextAlign.center, style: t.textTheme.bodyMedium),
            ]),
          ),
        ),
      ),
    );
  }
}

/// While a full download brings the older records (stage 2 of the faster sync): say that reports may still grow
/// (src/App.jsx HistoryLoading).
class HistoryLoading extends ConsumerWidget {
  const HistoryLoading({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = ref.watch(syncControllerProvider);
    if (!(s.history && s.state == SyncState.syncing)) return const SizedBox.shrink();
    final t = Theme.of(context);
    return Positioned(
      left: 16, right: 16, bottom: 12,
      child: IgnorePointer(
        child: Center(
          child: Material(
            key: const Key('history-loading'),
            elevation: 3,
            color: t.colorScheme.surfaceContainerHigh,
            shape: const StadiumBorder(),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
              child: Semantics(
                liveRegion: true,
                child: Text('${s.progress ?? 'Downloading older records…'} · sales history and reports fill in as they arrive; selling and stock are ready',
                    textAlign: TextAlign.center, style: t.textTheme.bodySmall),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

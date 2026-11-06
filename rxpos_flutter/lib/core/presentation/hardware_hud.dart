// The Hardware Diagnostic HUD (design system "Hardware Diagnostic HUD"): a slim status bar over every page with the
// cloud connection, the receipt printer, the barcode scanner and the camera, and short alert banners (unsent work,
// low stock, expiring stock) that open the page that deals with them. It only reads what the app already knows.

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:printing/printing.dart';
import 'package:rxpos/core/platform.dart';

import '../../features/alerts/application/alerts_provider.dart';
import '../../features/sync_status/application/sync_controller.dart';

/// When a barcode last found a medicine on this device (a scanner works like a keyboard, so this is how it shows).
class LastScan extends Notifier<DateTime?> {
  @override
  DateTime? build() => null;
  void now() => state = DateTime.now();
}

final lastScanProvider = NotifierProvider<LastScan, DateTime?>(LastScan.new);

/// The printers this computer knows (the default first); empty where the system's print dialog is used instead.
final hudPrintersProvider = FutureProvider.autoDispose<List<Printer>>((_) async {
  if (kIsWeb || !onWindows) return const [];
  try {
    final list = await Printing.listPrinters();
    return [...list.where((p) => p.isDefault), ...list.where((p) => !p.isDefault)];
  } catch (_) {
    return const [];
  }
});

class HardwareHud extends ConsumerWidget {
  const HardwareHud({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final th = Theme.of(context);
    final sync = ref.watch(syncControllerProvider);
    final printers = ref.watch(hudPrintersProvider).value ?? const [];
    final scan = ref.watch(lastScanProvider);
    final counts = ref.watch(navCountsProvider);
    final ok = th.colorScheme.primary, warn = Colors.amber.shade600, bad = th.colorScheme.error;
    final online = sync.state == SyncState.synced || sync.state == SyncState.syncing;
    String ago(DateTime t) {
      final m = DateTime.now().difference(t).inMinutes;
      return m < 1 ? 'just now' : m < 60 ? '$m min ago' : '${m ~/ 60} h ago';
    }

    final android = !kIsWeb && onAndroid;
    final items = <Widget>[
      _Status(Icons.cloud_done_outlined, 'Cloud', sync.label, online ? ok : sync.state == SyncState.offline ? warn : bad, key: const Key('hud-cloud')),
      _Status(Icons.print_outlined, 'Printer', printers.isEmpty ? (android ? 'Android print service' : 'print dialog') : printers.first.name,
          printers.isEmpty || printers.first.isAvailable ? ok : warn, key: const Key('hud-printer')),
      _Status(Icons.qr_code_scanner, 'Scanner', scan == null ? 'ready, nothing scanned yet' : 'last scan ${ago(scan)}', ok, key: const Key('hud-scanner')),
      if (android) _Status(Icons.photo_camera_outlined, 'Camera', 'scanning by camera available', ok),
    ];
    final alerts = <Widget>[
      if (sync.pending > 0) _Alert('${sync.pending} change${sync.pending == 1 ? '' : 's'} not sent yet', warn, () => context.go('/sync')),
      if (sync.rejected > 0) _Alert('${sync.rejected} refused by the cloud', bad, () => context.go('/sync')),
      if ((counts['low'] ?? 0) > 0) _Alert('${counts['low']} low on stock', warn, () => context.go('/inventory?filter=low')),
      if ((counts['expiry'] ?? 0) > 0) _Alert('${counts['expiry']} expiring or expired', bad, () => context.go('/expiry')),
    ];
    return Material(
      key: const Key('hardware-hud'),
      color: th.colorScheme.surfaceContainerHighest,
      child: SizedBox(
        height: 34,
        child: ListView(scrollDirection: Axis.horizontal, padding: const EdgeInsets.symmetric(horizontal: 10), children: [
          for (final w in items) ...[w, const SizedBox(width: 14)],
          if (alerts.isNotEmpty) Padding(padding: const EdgeInsets.symmetric(vertical: 8), child: VerticalDivider(width: 14, color: th.dividerColor)),
          for (final a in alerts) ...[a, const SizedBox(width: 6)],
        ]),
      ),
    );
  }
}

class _Status extends StatelessWidget {
  const _Status(this.icon, this.label, this.value, this.color, {super.key});
  final IconData icon;
  final String label, value;
  final Color color;
  @override
  Widget build(BuildContext context) {
    final th = Theme.of(context);
    return Semantics(
      label: '$label: $value',
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        // a status light: the colour and the words say the same thing (never colour alone)
        Container(width: 8, height: 8, decoration: BoxDecoration(color: color, shape: BoxShape.circle, boxShadow: [BoxShadow(color: color.withValues(alpha: .6), blurRadius: 6)])),
        const SizedBox(width: 6),
        Icon(icon, size: 16, color: th.colorScheme.onSurfaceVariant),
        const SizedBox(width: 4),
        Text('$label: ', style: th.textTheme.labelSmall?.copyWith(fontWeight: FontWeight.w700, letterSpacing: .4)),
        Text(value, style: th.textTheme.labelSmall?.copyWith(fontFamily: 'monospace', fontFamilyFallback: const ['Consolas', 'Roboto Mono'])),
      ]),
    );
  }
}

class _Alert extends StatelessWidget {
  const _Alert(this.text, this.color, this.onTap);
  final String text;
  final Color color;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) => Center(
        child: Material(
          color: color.withValues(alpha: .16),
          shape: StadiumBorder(side: BorderSide(color: color.withValues(alpha: .7))),
          child: InkWell(
            customBorder: const StadiumBorder(),
            onTap: onTap,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
              child: Row(mainAxisSize: MainAxisSize.min, children: [
                Icon(Icons.warning_amber_rounded, size: 14, color: color),
                const SizedBox(width: 4),
                Text(text, style: Theme.of(context).textTheme.labelSmall?.copyWith(fontWeight: FontWeight.w700)),
              ]),
            ),
          ),
        ),
      );
}

// The bell in the top bar (src/engage.jsx NotificationBell): today's alerts grouped as Urgent, Needs attention and
// For information, each opening its page; the count on the bell (red when something is urgent); sounds on this device.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/data/device_settings.dart';
import '../../../core/sound/sounds.dart';
import '../application/alerts_provider.dart';
import '../domain/alerts.dart';

Color toneColor(BuildContext context, String tone) => switch (tone) {
      'danger' => Theme.of(context).colorScheme.error,
      'warn' => Colors.orange.shade800,
      'ok' => Colors.green.shade700,
      _ => Theme.of(context).colorScheme.primary,
    };

class NotificationBell extends ConsumerWidget {
  const NotificationBell({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final alerts = ref.watch(alertsProvider);
    final urgent = alerts.where((a) => a.tone == 'danger').length;
    return IconButton(
      key: const Key('bell'),
      tooltip: 'Notifications${alerts.isEmpty ? '' : ': ${alerts.length}${urgent > 0 ? ', $urgent urgent' : ''}'}',
      onPressed: () => showDialog<void>(context: context, builder: (_) => const _BellMenu()),
      icon: Badge(
        isLabelVisible: alerts.isNotEmpty,
        backgroundColor: urgent > 0 ? Theme.of(context).colorScheme.error : Colors.orange.shade800,
        label: Text('${alerts.length}'),
        child: const Icon(Icons.notifications_outlined),
      ),
    );
  }
}

class _BellMenu extends ConsumerWidget {
  const _BellMenu();
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final alerts = ref.watch(alertsProvider);
    final prefs = SoundPrefs.parse(ref.watch(deviceValueProvider(soundPrefsKey)).value);
    final t = Theme.of(context);
    return Align(
      alignment: Alignment.topRight,
      child: Padding(
        padding: const EdgeInsets.only(top: 56, right: 8, left: 8),
        child: Material(
          elevation: 8,
          borderRadius: BorderRadius.circular(12),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 420, maxHeight: 560),
            child: ListView(shrinkWrap: true, padding: const EdgeInsets.symmetric(vertical: 8), children: [
              for (final (tone, head) in toneHeads)
                if (alerts.any((a) => a.tone == tone)) ...[
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
                    child: Text('$head · ${alerts.where((a) => a.tone == tone).length}', style: t.textTheme.labelLarge?.copyWith(color: toneColor(context, tone), fontWeight: FontWeight.w800)),
                  ),
                  for (final a in alerts.where((a) => a.tone == tone))
                    ListTile(
                      key: ValueKey('alert-${a.key}'),
                      dense: true,
                      leading: Icon(a.icon, color: toneColor(context, a.tone)),
                      title: Text(a.text),
                      subtitle: a.why.isEmpty ? null : Text(a.why, style: t.textTheme.bodySmall),
                      trailing: const Icon(Icons.chevron_right, size: 16),
                      onTap: () {
                        Navigator.pop(context);
                        context.go(a.to);
                      },
                    ),
                ],
              if (alerts.isEmpty) const Padding(padding: EdgeInsets.all(20), child: Text('All quiet. Nothing needs you right now.', textAlign: TextAlign.center)),
              const Divider(),
              SwitchListTile(
                dense: true,
                title: const Text('Sounds on this device'),
                value: prefs.on,
                onChanged: (v) => ref.read(deviceValueProvider(soundPrefsKey).notifier).set(prefs.copyWith(on: v).encode()),
              ),
            ]),
          ),
        ),
      ),
    );
  }
}

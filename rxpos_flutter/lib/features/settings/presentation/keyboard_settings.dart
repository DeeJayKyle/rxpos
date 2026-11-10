// This device → Keyboard (the owner's request, 2026-11-10), as the React app's KeyboardCard: every shortcut, its key
// now, and Change / Default / Off. A letter and then another within a moment makes a two-key shortcut (G then S).
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/data/device_settings.dart';
import '../../../core/presentation/keymap.dart';
import '../../../core/presentation/keys_host.dart';

class KeyboardSettings extends ConsumerWidget {
  const KeyboardSettings({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final map = ref.watch(keyMapProvider);
    Future<void> save(String id, String key) => ref.read(deviceValueProvider(keymapKey).notifier).set(map.withKey(id, key));
    final t = Theme.of(context);
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      const Text('The shortcuts on this device. Press ? on any page to see them. Change one, then press the new key: a letter and then another (G then S) makes a two-key shortcut.'),
      for (final g in const ['Pages', 'Anywhere', 'Lists']) ...[
        Padding(padding: const EdgeInsets.only(top: 12, bottom: 4), child: Text(g.toUpperCase(), style: t.textTheme.labelSmall)),
        for (final a in keyActions.where((a) => a.$3 == g))
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 1),
            child: Row(children: [
              Expanded(child: Text(a.$2)),
              SizedBox(width: 110, child: Text(showKey(map.keyOf(a.$1)) + (map.isDefault(a.$1) ? '' : ' ·'), key: ValueKey('key-${a.$1}'), style: const TextStyle(fontWeight: FontWeight.w700))),
              TextButton(
                key: ValueKey('change-${a.$1}'),
                onPressed: () async {
                  final k = await recordKey(context, a.$2, sequence: !a.$1.startsWith('list:'));
                  if (k != null) await save(a.$1, k);
                },
                child: const Text('Change'),
              ),
              if (!map.isDefault(a.$1)) TextButton(onPressed: () => save(a.$1, a.$4), child: const Text('Default')),
              if (map.keyOf(a.$1).isNotEmpty) TextButton(onPressed: () => save(a.$1, ''), child: const Text('Off')),
            ]),
          ),
      ],
      if (map.changed.isNotEmpty)
        OutlinedButton(onPressed: () => ref.read(deviceValueProvider(keymapKey).notifier).set(null), child: const Text('Reset all keys')),
    ]);
  }
}

/// Wait for the new key ([sequence]: a letter may be followed by another within 1.2 s). Null when cancelled (Esc).
Future<String?> recordKey(BuildContext context, String label, {bool sequence = true}) {
  return showDialog<String>(
    context: context,
    builder: (c) {
      var first = '';
      Timer? timer;
      return AlertDialog(
        title: Text('New key for $label'),
        content: Focus(
          autofocus: true,
          onKeyEvent: (_, e) {
            if (e is KeyUpEvent) return KeyEventResult.handled;
            final k = comboOf(e);
            if (k == null) return KeyEventResult.handled;
            if (k == 'Escape' && first.isEmpty) {
              Navigator.pop(c);
              return KeyEventResult.handled;
            }
            final plain = k.length == 1 && k != ' ' && k != '?';
            if (first.isNotEmpty) {
              timer?.cancel();
              Navigator.pop(c, plain ? '$first $k' : first);
            } else if (plain && sequence) {
              first = k;
              timer = Timer(const Duration(milliseconds: 1200), () => Navigator.pop(c, first));
            } else {
              Navigator.pop(c, k);
            }
            return KeyEventResult.handled;
          },
          child: const Text('Press the new key now (Esc to cancel).'),
        ),
      );
    },
  );
}

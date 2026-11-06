// A tip shown the first time someone opens a page; dismissed once with "Got it", remembered on this device
// (src/ui.jsx PageTip).
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/device_settings.dart';

/// Whether page tips are shown (switched off in tests that don't look at them).
final pageTipsOnProvider = Provider<bool>((_) => true);

class PageTip extends ConsumerWidget {
  const PageTip({super.key, required this.id, required this.title, required this.text});
  final String id, title, text;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (!ref.watch(pageTipsOnProvider)) return const SizedBox.shrink();
    final seen = ref.watch(deviceValueProvider('tip:$id'));
    if (!seen.hasValue || seen.value != null) return const SizedBox.shrink();
    final scheme = Theme.of(context).colorScheme;
    return Card(
      key: Key('tip-$id'),
      color: scheme.secondaryContainer,
      margin: const EdgeInsets.only(bottom: 8),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(12, 8, 4, 8),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Padding(padding: const EdgeInsets.only(top: 2), child: Icon(Icons.lightbulb_outline, size: 18, color: scheme.onSecondaryContainer)),
          const SizedBox(width: 8),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(title, style: TextStyle(fontWeight: FontWeight.w700, color: scheme.onSecondaryContainer)),
              Text(text, style: Theme.of(context).textTheme.bodySmall?.copyWith(color: scheme.onSecondaryContainer)),
            ]),
          ),
          TextButton(onPressed: () => ref.read(deviceValueProvider('tip:$id').notifier).set('1'), child: const Text('Got it')),
        ]),
      ),
    );
  }
}

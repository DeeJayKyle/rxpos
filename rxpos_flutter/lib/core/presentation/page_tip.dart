// A tip shown the first time someone opens a page; dismissed once with "Got it", remembered on this device
// (src/ui.jsx PageTip).
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/device_settings.dart';

/// Whether page tips are shown (switched off in tests that don't look at them).
final pageTipsOnProvider = Provider<bool>((_) => true);

class PageTip extends ConsumerStatefulWidget {
  const PageTip({super.key, required this.id, required this.title, required this.text});
  final String id, title, text;

  @override
  ConsumerState<PageTip> createState() => _PageTipState();
}

/// Shown once only (2026-11-18): the first visit marks the tip seen, so it stays for this visit and is gone on the next.
class _PageTipState extends ConsumerState<PageTip> {
  bool _showing = false, _closed = false;

  @override
  Widget build(BuildContext context) {
    final id = widget.id, title = widget.title, text = widget.text;
    if (!ref.watch(pageTipsOnProvider) || _closed) return const SizedBox.shrink();
    final seen = ref.watch(deviceValueProvider('tip:$id'));
    if (!_showing) {
      if (!seen.hasValue || seen.value != null) return const SizedBox.shrink();
      _showing = true;
      WidgetsBinding.instance.addPostFrameCallback((_) { if (mounted) ref.read(deviceValueProvider('tip:$id').notifier).set('1'); });
    }
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
          TextButton(onPressed: () => setState(() => _closed = true), child: const Text('Got it')),
        ]),
      ),
    );
  }
}

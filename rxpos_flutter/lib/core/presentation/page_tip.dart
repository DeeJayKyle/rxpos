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

/// A short guided tour (src/components/Tour.jsx): step cards with Next / Skip, shown once per person on this device,
/// before the page's tip. It never takes the cursor (a scanner still types into the search).
class PageTour extends ConsumerStatefulWidget {
  const PageTour({super.key, required this.id, required this.userId, required this.steps});
  final String id, userId;
  final List<(String title, String text)> steps;
  @override
  ConsumerState<PageTour> createState() => _PageTourState();
}

class _PageTourState extends ConsumerState<PageTour> {
  int _i = 0;
  bool _closed = false;
  bool? _show;

  String get _key => 'tour:${widget.id}:${widget.userId}';

  void _close() {
    ref.read(deviceValueProvider(_key).notifier).set('1');
    setState(() => _closed = true);
  }

  @override
  Widget build(BuildContext context) {
    if (!ref.watch(pageTipsOnProvider) || _closed) return const SizedBox.shrink();
    // decided once, as the page opens: someone who already saw this page's tip (or the tour) knows the page (the tip
    // marks itself seen as it shows, so it is not watched after that)
    if (_show == null) {
      final seen = ref.watch(deviceValueProvider(_key));
      final tipSeen = ref.watch(deviceValueProvider('tip:${widget.id}'));
      if (!seen.hasValue || !tipSeen.hasValue) return const SizedBox.shrink();
      _show = seen.value == null && tipSeen.value == null;
    }
    if (_show != true) return const SizedBox.shrink();
    final scheme = Theme.of(context).colorScheme;
    final (title, text) = widget.steps[_i];
    final last = _i == widget.steps.length - 1;
    return Card(
      key: Key('tour-${widget.id}'),
      margin: const EdgeInsets.only(bottom: 8),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18), side: BorderSide(color: scheme.primary, width: 1.5)),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 10, 8, 8),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('${_i + 1} of ${widget.steps.length}', style: Theme.of(context).textTheme.bodySmall),
          Text(title, style: const TextStyle(fontWeight: FontWeight.w800)),
          Text(text),
          Row(mainAxisAlignment: MainAxisAlignment.end, children: [
            TextButton(onPressed: _close, child: const Text('Skip')),
            FilledButton(onPressed: last ? _close : () => setState(() => _i++), child: Text(last ? 'Done' : 'Next')),
          ]),
        ]),
      ),
    );
  }
}

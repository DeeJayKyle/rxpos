// A page's side views (held sales, drafts, supplier prices) behind a button, and "‹ back" while one is open
// (src/ui.jsx SubViews; the owner's choice, 2026-11-15: a button instead of a tab).
import 'package:flutter/material.dart';

class SubViews extends StatelessWidget {
  const SubViews({super.key, required this.value, required this.main, required this.mainLabel, required this.views, required this.onChange});
  final String value, main, mainLabel;
  /// (key, label, icon)
  final List<(String, String, IconData)> views;
  final ValueChanged<String> onChange;

  @override
  Widget build(BuildContext context) {
    final open = views.where((v) => v.$1 == value).firstOrNull;
    if (value != main && open != null) {
      return Row(children: [
        TextButton.icon(key: const Key('subview-back'), onPressed: () => onChange(main), icon: const Icon(Icons.chevron_left), label: Text(mainLabel)),
        const SizedBox(width: 8),
        Flexible(child: Text(open.$2.replaceAll(RegExp(r' \(\d+\)$'), ''), style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700))),
      ]);
    }
    return Align(
      alignment: Alignment.centerRight,
      child: Wrap(spacing: 8, runSpacing: 6, children: [
        for (final (k, label, icon) in views)
          OutlinedButton.icon(key: ValueKey('subview-$k'), style: const ButtonStyle(visualDensity: VisualDensity.compact), onPressed: () => onChange(k), icon: Icon(icon, size: 16), label: Text(label)),
      ]),
    );
  }
}

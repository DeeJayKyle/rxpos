// Database views (src/components/DataViews.jsx): the same list as a list, a board (cards in columns by a field:
// stock status…) or a gallery of cards. The choice is kept per page on this device (deviceValueProvider 'view:…').
import 'package:flutter/material.dart';

const viewKinds = [('list', 'List', Icons.view_list_outlined), ('board', 'Board', Icons.view_kanban_outlined), ('gallery', 'Gallery', Icons.grid_view_outlined)];

class ViewSwitch extends StatelessWidget {
  const ViewSwitch({super.key, required this.value, required this.onChanged});
  final String value;
  final ValueChanged<String> onChanged;
  @override
  Widget build(BuildContext context) => SegmentedButton<String>(
        key: const Key('view-switch'),
        showSelectedIcon: false,
        segments: [for (final (k, label, icon) in viewKinds) ButtonSegment(value: k, icon: Icon(icon, size: 18), tooltip: label, label: MediaQuery.sizeOf(context).width < 600 ? null : Text(label))],
        selected: {value},
        onSelectionChanged: (v) => onChanged(v.first),
      );
}

/// What a card shows
class CardData {
  const CardData({required this.title, this.sub = '', this.value = '', this.chips = const [], this.actions = const []});
  final String title, sub, value;
  /// (text, colour or null)
  final List<(String, Color?)> chips;
  /// the row's actions (the ⋯ menu): (label, run)
  final List<(String, VoidCallback)> actions;
}

class DataCard extends StatelessWidget {
  const DataCard({super.key, required this.data, this.onTap});
  final CardData data;
  final VoidCallback? onTap;
  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    return Card(
      margin: EdgeInsets.zero,
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 10, 4, 10),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
                Text(data.title, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700)),
                if (data.sub.isNotEmpty) Text(data.sub, maxLines: 2, overflow: TextOverflow.ellipsis, style: t.textTheme.bodySmall),
                if (data.chips.isNotEmpty) ...[
                  const SizedBox(height: 6),
                  Wrap(spacing: 4, runSpacing: 4, children: [
                    for (final (text, color) in data.chips)
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                        decoration: BoxDecoration(borderRadius: BorderRadius.circular(99), color: (color ?? t.colorScheme.secondary).withValues(alpha: .14)),
                        child: Text(text, style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w600, color: color ?? t.colorScheme.onSurfaceVariant)),
                      ),
                  ]),
                ],
                if (data.value.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 6), child: Text(data.value, style: const TextStyle(fontWeight: FontWeight.w800))),
              ]),
            ),
            if (data.actions.isNotEmpty)
              PopupMenuButton<int>(
                tooltip: 'Actions for ${data.title}',
                icon: const Icon(Icons.more_horiz, size: 18),
                onSelected: (i) => data.actions[i].$2(),
                itemBuilder: (_) => [for (final (i, a) in data.actions.indexed) PopupMenuItem(value: i, child: Text(a.$1))],
              ),
          ]),
        ),
      ),
    );
  }
}

/// Columns of cards, one per group: (key, label, colour)
class BoardView<T> extends StatelessWidget {
  const BoardView({super.key, required this.items, required this.groups, required this.groupOf, required this.card, this.onTap});
  final List<T> items;
  final List<(String, String, Color?)> groups;
  final String Function(T) groupOf;
  final CardData Function(T) card;
  final void Function(T)? onTap;
  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    final by = {for (final g in groups) g.$1: <T>[]};
    for (final x in items) {
      by[groupOf(x)]?.add(x);
    }
    return LayoutBuilder(builder: (context, c) {
      final w = c.maxWidth < 600 ? c.maxWidth * .86 : 300.0;
      return ListView(key: const Key('board-view'), scrollDirection: Axis.horizontal, children: [
        for (final (key, label, color) in groups)
          Container(
            key: ValueKey('board-col-$key'),
            width: w,
            margin: const EdgeInsets.only(right: 12, bottom: 8),
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(borderRadius: BorderRadius.circular(16), color: t.colorScheme.surfaceContainerLow, border: Border.all(color: t.dividerColor)),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Row(children: [
                Container(width: 9, height: 9, decoration: BoxDecoration(shape: BoxShape.circle, color: color ?? t.disabledColor)),
                const SizedBox(width: 8),
                Expanded(child: Text(label, style: const TextStyle(fontWeight: FontWeight.w700))),
                Text('${by[key]!.length}', style: t.textTheme.bodySmall),
              ]),
              const SizedBox(height: 8),
              Expanded(
                child: by[key]!.isEmpty
                    ? Text('None', style: t.textTheme.bodySmall)
                    : ListView.separated(
                        itemCount: by[key]!.length.clamp(0, 120),
                        separatorBuilder: (_, _) => const SizedBox(height: 8),
                        itemBuilder: (_, i) => DataCard(data: card(by[key]![i]), onTap: onTap == null ? null : () => onTap!(by[key]![i])),
                      ),
              ),
            ]),
          ),
      ]);
    });
  }
}

class GalleryView<T> extends StatelessWidget {
  const GalleryView({super.key, required this.items, required this.card, this.onTap});
  final List<T> items;
  final CardData Function(T) card;
  final void Function(T)? onTap;
  @override
  Widget build(BuildContext context) => GridView.builder(
        key: const Key('gallery-view'),
        gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(maxCrossAxisExtent: 260, mainAxisExtent: 150, crossAxisSpacing: 12, mainAxisSpacing: 12),
        itemCount: items.length.clamp(0, 240),
        itemBuilder: (_, i) => DataCard(data: card(items[i]), onTap: onTap == null ? null : () => onTap!(items[i])),
      );
}

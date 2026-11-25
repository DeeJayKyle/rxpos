// The expiry calendar (UI batch 3, F1; as src/components/ExpiryCalendar.jsx): a month grid with each batch in stock
// on its expiry date, shaded by how soon it expires; a batch opens its medicine's stock card.
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../core/entities/product.dart';
import '../../../core/rules/fefo.dart' show BatchStock;
import 'package:rxpos/core/theme/themes.dart' show TonesOfContext;

/// expired, urgent (30 days), soon (the warning), later
String urgencyOf(int days, int warn) => days < 0 ? 'expired' : days <= 30 ? 'urgent' : days <= warn ? 'soon' : 'later';

/// The weeks of a month (Monday first): each day as 'YYYY-MM-DD', or null outside the month
List<List<String?>> monthGrid(int year, int month) {
  String two(int n) => n.toString().padLeft(2, '0');
  final days = DateTime(year, month + 1, 0).day, lead = DateTime(year, month, 1).weekday - 1;
  final cells = <String?>[for (var i = 0; i < lead; i++) null, for (var d = 1; d <= days; d++) '$year-${two(month)}-${two(d)}'];
  while (cells.length % 7 != 0) {
    cells.add(null);
  }
  return [for (var w = 0; w < cells.length ~/ 7; w++) cells.sublist(w * 7, w * 7 + 7)];
}

class ExpiryCalendar extends StatefulWidget {
  const ExpiryCalendar({super.key, required this.batches, required this.warn});
  /// every batch in stock with an expiry: (medicine, batch, days left)
  final List<(Product, BatchStock, int)> batches;
  final int warn;
  @override
  State<ExpiryCalendar> createState() => _ExpiryCalendarState();
}

class _ExpiryCalendarState extends State<ExpiryCalendar> {
  late DateTime _month = () {
    final next = widget.batches.where((x) => x.$3 >= 0).toList()..sort((a, b) => a.$2.expiry.compareTo(b.$2.expiry));
    final d = next.isEmpty ? DateTime.now() : DateTime.tryParse(next.first.$2.expiry.length == 7 ? '${next.first.$2.expiry}-01' : next.first.$2.expiry) ?? DateTime.now();
    return DateTime(d.year, d.month);
  }();

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    final byDay = <String, List<(Product, BatchStock, int)>>{};
    for (final x in widget.batches) {
      final e = x.$2.expiry.length == 7 ? '${x.$2.expiry}-01' : x.$2.expiry.substring(0, x.$2.expiry.length.clamp(0, 10));
      (byDay[e] ??= []).add(x);
    }
    Color bg(String u) => switch (u) {
          'expired' => t.colorScheme.error.withValues(alpha: .16),
          'urgent' => context.tones.warn.withValues(alpha: .18),
          'soon' => t.colorScheme.primary.withValues(alpha: .28),
          _ => t.colorScheme.primary.withValues(alpha: .12),
        };
    const names = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    return Card(
      key: const Key('expiry-calendar'),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(children: [
          Row(children: [
            IconButton(tooltip: 'Previous month', onPressed: () => setState(() => _month = DateTime(_month.year, _month.month - 1)), icon: const Icon(Icons.chevron_left)),
            Expanded(child: Text('${names[_month.month - 1]} ${_month.year}', textAlign: TextAlign.center, style: t.textTheme.titleMedium)),
            IconButton(tooltip: 'Next month', onPressed: () => setState(() => _month = DateTime(_month.year, _month.month + 1)), icon: const Icon(Icons.chevron_right)),
          ]),
          Row(children: [for (final d in const ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']) Expanded(child: Text(d, textAlign: TextAlign.center, style: t.textTheme.labelSmall))]),
          for (final week in monthGrid(_month.year, _month.month))
            Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              for (final d in week)
                Expanded(
                  child: Container(
                    margin: const EdgeInsets.all(2),
                    padding: const EdgeInsets.all(3),
                    constraints: const BoxConstraints(minHeight: 64),
                    decoration: BoxDecoration(color: d == null ? null : t.colorScheme.surfaceContainerHighest, borderRadius: BorderRadius.circular(8)),
                    child: d == null
                        ? null
                        : Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                            Text('${int.parse(d.substring(8))}', style: t.textTheme.labelSmall),
                            for (final x in (byDay[d] ?? const []).take(3))
                              Tooltip(
                                message: '${x.$1.name} · batch ${x.$2.batch} · ${x.$3 < 0 ? 'expired ${-x.$3} days ago' : 'expires in ${x.$3} days'}',
                                child: InkWell(
                                  key: ValueKey('exp-${x.$1.id}-${x.$2.batch}'),
                                  onTap: () => context.go('/stock-card?id=${x.$1.id}'),
                                  child: Container(
                                    margin: const EdgeInsets.only(top: 2),
                                    padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
                                    decoration: BoxDecoration(color: bg(urgencyOf(x.$3, widget.warn)), borderRadius: BorderRadius.circular(5)),
                                    child: Text(x.$1.name, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600)),
                                  ),
                                ),
                              ),
                            if ((byDay[d] ?? const []).length > 3) Text('+${byDay[d]!.length - 3} more', style: t.textTheme.labelSmall),
                          ]),
                  ),
                ),
            ]),
        ]),
      ),
    );
  }
}

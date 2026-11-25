// Dashboard additions of UI batch 3, as src/components/DashExtras.jsx: the busy-hours heatmap (B5), the setup
// checklist of a new pharmacy (B7) and the What's new card after an update (B8).
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/config/whats_new.dart';
import '../../../core/data/device_settings.dart';
import '../../../core/entities/sale.dart';
import '../../../core/entities/settings.dart';
import '../../../core/rules/dates.dart';
import 'package:rxpos/core/theme/themes.dart' show TonesOfContext;

const _days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/// Sales by weekday (Mon = 0) and hour from day key [from] on, and the hours to show: 8:00 to 20:00 widened to any
/// hour that had a sale
({List<List<int>> grid, List<int> hours, int max}) busyGrid(List<Sale> sales, String branch, String from) {
  final grid = [for (var i = 0; i < 7; i++) List.filled(24, 0)];
  var lo = 8, hi = 19, max = 0;
  for (final s in sales) {
    if (s.status == 'refunded' || s.branchId != branch) continue;
    final d = DateTime.tryParse(s.date)?.toLocal();
    if (d == null || localDate(d).compareTo(from) < 0) continue;
    final v = ++grid[d.weekday - 1][d.hour];
    if (v > max) max = v;
    if (d.hour < lo) lo = d.hour;
    if (d.hour > hi) hi = d.hour;
  }
  return (grid: grid, hours: [for (var h = lo; h <= hi; h++) h], max: max);
}

/// B5: when the pharmacy sells: 7 days × opening hours, shaded by how many sales
class BusyHoursCard extends StatelessWidget {
  const BusyHoursCard({super.key, required this.sales, required this.branch, required this.from, required this.words});
  final List<Sale> sales;
  final String branch, from, words;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    final g = busyGrid(sales, branch, from);
    String hh(int h) => '${h.toString().padLeft(2, '0')}:00';
    Color shade(int v) => v == 0 ? t.colorScheme.surfaceContainerHighest : Color.lerp(t.colorScheme.surfaceContainerHighest, t.colorScheme.primary, .15 + .85 * v / g.max)!;
    return Card(
      key: const Key('busy-hours'),
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Text('Busy hours', style: t.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
            const SizedBox(width: 10),
            Expanded(child: Text('sales $words', textAlign: TextAlign.right, maxLines: 1, overflow: TextOverflow.ellipsis, style: t.textTheme.bodySmall)),
          ]),
          const SizedBox(height: 10),
          if (g.max == 0)
            Text('No sales $words yet: the busy hours show here once you sell.', style: t.textTheme.bodySmall)
          else
            LayoutBuilder(builder: (context, box) {
              final w = box.maxWidth < 420 ? 420.0 : box.maxWidth;
              final cell = (w - 40) / g.hours.length;
              return SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: SizedBox(
                  width: w,
                  child: Column(children: [
                    Row(children: [
                      const SizedBox(width: 40),
                      for (final h in g.hours) SizedBox(width: cell, child: Text(h.isEven ? h.toString().padLeft(2, '0') : '', textAlign: TextAlign.center, style: t.textTheme.labelSmall)),
                    ]),
                    for (var d = 0; d < 7; d++)
                      Row(children: [
                        SizedBox(width: 40, child: Text(_days[d], style: t.textTheme.labelSmall)),
                        for (final h in g.hours)
                          Tooltip(
                            message: '${_days[d]} ${hh(h)} · ${g.grid[d][h]} sale${g.grid[d][h] == 1 ? '' : 's'}',
                            child: Container(
                              key: g.grid[d][h] > 0 ? Key('busy-${_days[d]}-$h') : null,
                              width: cell - 3,
                              height: 20,
                              margin: const EdgeInsets.all(1.5),
                              decoration: BoxDecoration(color: shade(g.grid[d][h]), borderRadius: BorderRadius.circular(5)),
                            ),
                          ),
                      ]),
                  ]),
                ),
              );
            }),
        ]),
      ),
    );
  }
}

/// The setup steps of a new pharmacy, each ticked from the data: (id, label, done, route)
List<(String, String, bool, String)> setupSteps({required int products, required bool stocked, required int users, required PharmacySettings settings, required int tills}) {
  final pm = settings.paymentMethods;
  final pmDefault = pm.isEmpty || (pm.length == defaultPaymentMethods.length && [for (var i = 0; i < pm.length; i++) pm[i] == defaultPaymentMethods[i]].every((x) => x));
  return [
    ('medicines', 'Add your medicines', products > 0, '/medicines'),
    ('stock', 'Add stock', stocked, '/add-stock'),
    ('staff', 'Add your staff', users > 1, '/users'),
    ('payments', 'Set your payment methods', !pmDefault, '/settings'),
    ('receipt', 'Receipt details (phone and address)', settings.phone.isNotEmpty && settings.address.isNotEmpty, '/settings'),
    ('device', 'Sign in on a second device', tills >= 2, '/device'),
  ];
}

/// B7: a new pharmacy's checklist at the top of the dashboard; Hide puts it away on this device; gone once all done
class SetupChecklistCard extends ConsumerWidget {
  const SetupChecklistCard({super.key, required this.steps});
  final List<(String, String, bool, String)> steps;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final hidden = ref.watch(deviceValueProvider('setupHidden')).value == '1';
    final done = steps.where((x) => x.$3).length;
    if (hidden || done == steps.length) return const SizedBox.shrink();
    final t = Theme.of(context);
    return Card(
      key: const Key('setup-checklist'),
      margin: const EdgeInsets.only(top: 12),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Icon(Icons.checklist, size: 18, color: t.colorScheme.tertiary),
            const SizedBox(width: 8),
            Expanded(child: Text.rich(maxLines: 2, overflow: TextOverflow.ellipsis, TextSpan(children: [
              TextSpan(text: 'Set up your pharmacy  ', style: t.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
              TextSpan(text: '$done of ${steps.length} done', style: t.textTheme.bodySmall),
            ]))),
            TextButton.icon(key: const Key('setup-hide'), onPressed: () => ref.read(deviceValueProvider('setupHidden').notifier).set('1'), icon: const Icon(Icons.close, size: 16), label: const Text('Hide')),
          ]),
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 8),
            child: ClipRRect(borderRadius: BorderRadius.circular(99), child: LinearProgressIndicator(value: done / steps.length, minHeight: 6)),
          ),
          Wrap(spacing: 16, runSpacing: 4, children: [
            for (final (id, label, ok, to) in steps)
              ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 260),
                child: InkWell(
                  key: Key('setup-$id'),
                  onTap: ok ? null : () => context.go(to),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(vertical: 6),
                    child: Row(children: [
                      Icon(ok ? Icons.check_circle : Icons.radio_button_unchecked, size: 18, color: ok ? context.tones.ok : t.hintColor, semanticLabel: ok ? 'done' : 'to do'),
                      const SizedBox(width: 8),
                      Flexible(child: Text(label, style: TextStyle(decoration: ok ? TextDecoration.lineThrough : null, color: ok ? t.hintColor : t.colorScheme.tertiary, fontWeight: ok ? null : FontWeight.w600))),
                    ]),
                  ),
                ),
              ),
          ]),
        ]),
      ),
    );
  }
}

bool? _shownThisVisit; // decided once per visit: the dashboard opening again keeps the answer

/// B8: after an update, the release's highlights once on this device, with "Show me" links
class WhatsNewCard extends ConsumerStatefulWidget {
  const WhatsNewCard({super.key, required this.usedBefore});
  final bool usedBefore;
  @override
  ConsumerState<WhatsNewCard> createState() => _WhatsNewCardState();
}

class _WhatsNewCardState extends ConsumerState<WhatsNewCard> {
  @override
  Widget build(BuildContext context) {
    final seen = ref.watch(deviceValueProvider('whatsNewSeen'));
    if (seen.isLoading && _shownThisVisit == null) return const SizedBox.shrink();
    if (_shownThisVisit == null) {
      _shownThisVisit = whatsNewDue(seen.value, usedBefore: widget.usedBefore);
      // this device marks the release seen at once: the card shows on this visit only
      if (seen.value != whatsNewVersion) Future.microtask(() => ref.read(deviceValueProvider('whatsNewSeen').notifier).set(whatsNewVersion));
    }
    if (_shownThisVisit != true) return const SizedBox.shrink();
    final t = Theme.of(context);
    void close() => setState(() => _shownThisVisit = false);
    return Card(
      key: const Key('whats-new'),
      margin: const EdgeInsets.only(top: 12),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18), side: BorderSide(color: t.colorScheme.primary, width: 1.5)),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 8, 8, 10),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Icon(Icons.auto_awesome, size: 18, color: t.colorScheme.tertiary),
            const SizedBox(width: 8),
            Expanded(child: Text("What's new in $whatsNewVersion", style: t.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700))),
            IconButton(key: const Key('whats-new-close'), tooltip: "Close what's new", onPressed: close, icon: const Icon(Icons.close, size: 18)),
          ]),
          for (final (text, to) in whatsNewItems)
            Row(children: [
              Expanded(child: Text(text)),
              TextButton(onPressed: () { close(); context.go(to); }, child: const Text('Show me')),
            ]),
        ]),
      ),
    );
  }
}

/// For tests: forget this visit's answer, as a restart does
void resetWhatsNewVisit() => _shownThisVisit = null;

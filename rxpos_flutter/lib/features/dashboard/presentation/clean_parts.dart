// The clean dashboard's parts (src/pages/Dashboard.jsx; the owner's choice, 2026-11-15): stock health with a gauge,
// the top medicines of the period, cards rising in one after another (the reference video) and Edit widgets.
import 'package:rxpos/core/theme/themes.dart' show TonesOfContext;
import 'dart:convert';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../core/rules/money.dart';
import '../domain/clean_dashboard.dart';
import '../domain/figures.dart';

/// The dashboard's cards: id, name, columns of 12 on a wide screen, shown at first
const dashWidgets = [
  ('figures', 'Figures for the period', 12, true),
  // the bento row stays (the owner's request, 2026-11-15: "Maintain the bento UI")
  ('bento', 'Sales at a glance (dark card, daily bars, latest receipts, next step)', 12, true),
  ('chart', 'Sales chart', 8, true),
  ('health', 'Stock health', 4, true),
  ('top', 'Top medicines', 6, true),
  ('recent', 'Latest sales', 6, true),
  // UI batch 3, B5: sales by weekday and hour
  ('busy', 'Busy hours (sales by day and hour)', 12, true),
  ('checks', 'Sales to check (when there are some)', 12, true),
  ('alerts', 'Stock alert tiles', 12, false),
  ('promote', 'Promote today', 6, false),
  ('weather', 'Weather and storage', 6, false),
  ('totals', 'Medicines, stock value, customers, this month', 12, false),
];

/// This device's dashboard (deviceValueProvider 'dash'): the period chip, the cards' order and which are shown
class DashLayout {
  const DashLayout({this.period = 'today', required this.order, required this.shown});
  final String period;
  final List<String> order;
  final Set<String> shown;

  factory DashLayout.parse(String? raw) {
    Map<String, Object?> j = const {};
    try {
      if (raw != null && raw.isNotEmpty) j = (jsonDecode(raw) as Map).cast<String, Object?>();
    } catch (_) {}
    final ids = [for (final w in dashWidgets) w.$1];
    final saved = [for (final x in (j['order'] as List? ?? const [])) if (ids.contains('$x')) '$x'];
    final shown = j['shown'] is List ? {for (final x in j['shown'] as List) '$x'} : {for (final w in dashWidgets) if (w.$4) w.$1};
    final p = '${j['period'] ?? 'today'}';
    return DashLayout(period: periods.any((x) => x.$1 == p) ? p : 'today', order: [...saved, ...ids.where((i) => !saved.contains(i))], shown: shown);
  }

  String encode({String? period, List<String>? order, Set<String>? shown}) =>
      jsonEncode({'period': period ?? this.period, 'order': order ?? this.order, 'shown': [...(shown ?? this.shown)]});
}

/// A card rising in with a soft fade, one after another by [index] (off with reduced motion)
class RiseIn extends StatelessWidget {
  const RiseIn({super.key, required this.index, required this.child});
  final int index;
  final Widget child;
  @override
  Widget build(BuildContext context) {
    if (MediaQuery.of(context).disableAnimations) return child;
    final ms = 420 + index * 70;
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0, end: 1),
      duration: Duration(milliseconds: ms),
      curve: Interval((index * 70) / ms, 1, curve: Curves.easeOutCubic),
      builder: (_, k, c) => Opacity(opacity: k, child: Transform.translate(offset: Offset(0, 14 * (1 - k)), child: c)),
      child: child,
    );
  }
}

/// "▲ 12% vs yesterday" for a figure's line
String deltaText(double now, double before, String vs) {
  final d = deltaPercent(now, before);
  return d == null ? '' : ' · ${d >= 0 ? '▲ +' : '▼ −'}${d.abs().toStringAsFixed(0)}% $vs';
}

/// Stock health: a gauge that fills, the biggest problem in words, what drives it and the stock figures
class HealthCard extends StatelessWidget {
  const HealthCard({super.key, required this.health, required this.rows});
  final StockHealth health;
  /// (label, value, hint, route)
  final List<(String, String, String, String)> rows;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    final cs = t.colorScheme;
    final tone = health.score >= 80 ? context.tones.ok : health.score >= 60 ? context.tones.warn : cs.error;
    return Card(
      key: const Key('stock-health'),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text('Stock health', style: t.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
          const SizedBox(height: 8),
          Wrap(spacing: 14, runSpacing: 8, crossAxisAlignment: WrapCrossAlignment.center, children: [
            TweenAnimationBuilder<double>(
              tween: Tween(begin: 0, end: health.score / 100),
              duration: MediaQuery.of(context).disableAnimations ? Duration.zero : const Duration(milliseconds: 1100),
              curve: Curves.easeOutCubic,
              builder: (_, k, _) => SizedBox(
                width: 124,
                height: 72,
                child: CustomPaint(
                  painter: _GaugePainter(k, tone, cs.onSurface.withValues(alpha: .09)),
                  child: Align(alignment: const Alignment(0, .75), child: Text('${(k * 100).round()}%', key: const Key('health-score'), style: t.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800))),
                ),
              ),
            ),
            ConstrainedBox(
              constraints: const BoxConstraints(minWidth: 160, maxWidth: 360),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
                Text(health.title, style: t.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700, color: health.score < 60 ? cs.error : null)),
                const SizedBox(height: 2),
                Text(health.text, style: t.textTheme.bodySmall?.copyWith(color: cs.onSurfaceVariant)),
              ]),
            ),
          ]),
          if (health.drivers.isNotEmpty) ...[
            const SizedBox(height: 8),
            Wrap(spacing: 6, runSpacing: 6, crossAxisAlignment: WrapCrossAlignment.center, children: [
              Text('Driven by', style: t.textTheme.bodySmall?.copyWith(color: cs.onSurfaceVariant)),
              for (final d in health.drivers)
                ActionChip(
                  visualDensity: VisualDensity.compact,
                  label: Text(d.label),
                  labelStyle: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: d.danger ? cs.error : context.tones.warn),
                  backgroundColor: (d.danger ? cs.error : context.tones.warn).withValues(alpha: .12),
                  side: BorderSide.none,
                  onPressed: () => context.go(d.to),
                ),
            ]),
          ],
          const SizedBox(height: 6),
          for (final (i, (label, value, hint, route)) in rows.indexed) ...[
            if (i > 0) const Divider(height: 1),
            InkWell(
              key: Key('alert-$label'),
              onTap: () => context.go(route),
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 8),
                child: Row(children: [
                  Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(label, style: t.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w600)),
                    Text(hint, style: t.textTheme.bodySmall?.copyWith(color: cs.onSurfaceVariant)),
                  ])),
                  Text(value, style: t.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w800)),
                ]),
              ),
            ),
          ],
        ]),
      ),
    );
  }
}

class _GaugePainter extends CustomPainter {
  _GaugePainter(this.k, this.color, this.track);
  final double k;
  final Color color, track;
  @override
  void paint(Canvas c, Size s) {
    final r = Rect.fromCircle(center: Offset(s.width / 2, s.height - 6), radius: s.width / 2 - 8);
    final p = Paint()..style = PaintingStyle.stroke..strokeWidth = 11..strokeCap = StrokeCap.round;
    c.drawArc(r, math.pi, math.pi, false, p..color = track);
    if (k > 0) c.drawArc(r, math.pi, math.pi * k, false, p..color = color);
  }

  @override
  bool shouldRepaint(_GaugePainter o) => o.k != k || o.color != color;
}

/// The top medicines of the period, with a bar each and View all
class TopMedicinesCard extends StatelessWidget {
  const TopMedicinesCard({super.key, required this.top, required this.words, required this.by, required this.onBy, required this.money, required this.canProfit, this.onAll});
  final List<TopSeller> top;
  final String words, by;
  final ValueChanged<String> onBy;
  final String Function(num) money;
  final bool canProfit;
  final VoidCallback? onAll;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    double v(TopSeller x) => switch (by) { 'qty' => x.qty, 'profit' => x.profit, _ => x.amount };
    final mx = top.isEmpty ? 1.0 : top.map(v).fold<double>(1, math.max);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Wrap(spacing: 8, runSpacing: 6, crossAxisAlignment: WrapCrossAlignment.center, alignment: WrapAlignment.spaceBetween, children: [
            Text('Top medicines · $words', style: t.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
            SegmentedButton<String>(
              showSelectedIcon: false,
              style: const ButtonStyle(visualDensity: VisualDensity.compact),
              segments: [
                const ButtonSegment(value: 'amount', label: Text('Amount')),
                const ButtonSegment(value: 'qty', label: Text('Quantity')),
                if (canProfit) const ButtonSegment(value: 'profit', label: Text('Profit')),
              ],
              selected: {by},
              onSelectionChanged: (s) => onBy(s.first),
            ),
          ]),
          const SizedBox(height: 6),
          if (top.isEmpty) Padding(padding: const EdgeInsets.symmetric(vertical: 16), child: Text('No sales $words yet', style: t.textTheme.bodySmall)),
          for (final (i, x) in top.indexed)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 6),
              child: Row(children: [
                SizedBox(width: 22, child: Text('${i + 1}', style: t.textTheme.bodySmall)),
                Expanded(flex: 5, child: Text(x.name, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w600))),
                const SizedBox(width: 8),
                Expanded(flex: 3, child: TweenAnimationBuilder<double>(
                  tween: Tween(begin: 0, end: (v(x) / mx).clamp(0, 1).toDouble()),
                  duration: const Duration(milliseconds: 700),
                  curve: Curves.easeOutCubic,
                  builder: (_, k, _) => LinearProgressIndicator(value: k, minHeight: 7, borderRadius: BorderRadius.circular(9)),
                )),
                const SizedBox(width: 10),
                Text(by == 'qty' ? formatQty(x.qty) : money(v(x)), style: const TextStyle(fontWeight: FontWeight.w700)),
              ]),
            ),
          if (onAll != null) Align(alignment: Alignment.centerRight, child: TextButton.icon(onPressed: onAll, iconAlignment: IconAlignment.end, icon: const Icon(Icons.arrow_forward, size: 16), label: const Text('View all'))),
        ]),
      ),
    );
  }
}

/// Edit widgets: show or hide each card and move it up or down (this device)
Future<void> showEditWidgets(BuildContext context, DashLayout layout, ValueChanged<String> save) => showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (_) => StatefulBuilder(builder: (context, set) {
        var l = layout;
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
            child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Text('Edit widgets', style: Theme.of(context).textTheme.titleLarge),
              const Text('Choose the cards on your dashboard and their order. Only this device changes.'),
              const SizedBox(height: 8),
              Flexible(
                child: ReorderableListView(
                  key: const Key('edit-widgets'),
                  shrinkWrap: true,
                  buildDefaultDragHandles: true,
                  onReorderItem: (a, b) {
                    final o = [...l.order];
                    final x = o.removeAt(a);
                    o.insert(b, x);
                    save(l.encode(order: o));
                    set(() => layout = DashLayout(period: l.period, order: o, shown: l.shown));
                  },
                  children: [
                    for (final id in l.order)
                      SwitchListTile(
                        key: ValueKey('w-$id'),
                        dense: true,
                        title: Text(dashWidgets.firstWhere((w) => w.$1 == id).$2),
                        value: l.shown.contains(id),
                        onChanged: (v) {
                          final s = {...l.shown};
                          v ? s.add(id) : s.remove(id);
                          save(l.encode(shown: s));
                          set(() => layout = DashLayout(period: l.period, order: l.order, shown: s));
                        },
                      ),
                  ],
                ),
              ),
              const SizedBox(height: 8),
              Row(children: [
                TextButton(key: const Key('edit-widgets-reset'), onPressed: () {
                  save(jsonEncode({'period': l.period}));
                  Navigator.pop(context);
                }, child: const Text('Back to the standard dashboard')),
                const Spacer(),
                FilledButton(onPressed: () => Navigator.pop(context), child: const Text('Done')),
              ]),
            ]),
          ),
        );
      }),
    );

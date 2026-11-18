// The bento row at the top of the Dashboard (src/components/BentoDashboard.jsx): period chips (today, 7 days, 30
// days), a dark hero card with the period's sales against the period before, daily bars with today picked out (tap
// a day for its sales), the latest receipts with a Paid / Owing / Refunded pill, and the pharmacy's next step.
import 'package:rxpos/core/theme/themes.dart' show TonesOfContext, SideColors;
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../core/entities/sale.dart';
import '../../../core/rules/dates.dart';
import '../domain/figures.dart';

/// Paid, owing (on credit or part-paid) or refunded, as src/components/BentoDashboard.jsx saleStatus
String saleStatusOf(Sale s) {
  if (s.status == 'refunded') return 'refunded';
  final paid = s.raw['paid'] == null ? s.total : s.paid;
  if (paid < s.total - 0.5 && s.insuredShare == 0) return 'owing';
  return 'paid';
}

/// The sales of the last [n] days (from [offset] days back) and how many receipts
({double total, int count}) periodSums(Map<String, DayFigures> byDay, int n, {int offset = 0, DateTime? now}) {
  final base = now ?? DateTime.now();
  var total = 0.0, count = 0;
  for (var i = offset; i < offset + n; i++) {
    final d = byDay[localDate(base.subtract(Duration(days: i)))];
    if (d != null) {
      total += d.total;
      count += d.count;
    }
  }
  return (total: total, count: count);
}

/// The most useful next step right now, as src/components/NavMenus.jsx featuredAction
({String to, String title, String text, String cta}) featuredAction({required int expiring, required int low, required Set<String> can}) {
  if (expiring > 0 && can.contains('inventory.view')) {
    return (to: '/expiry', title: '$expiring batch${expiring == 1 ? '' : 'es'} expiring', text: 'Sell first or return them before they expire.', cta: 'Review');
  }
  if (low > 0 && can.contains('stock.receive')) {
    return (to: '/reorder', title: '$low medicine${low == 1 ? '' : 's'} running low', text: 'A reorder list is ready from your sales.', cta: 'Reorder');
  }
  if (can.contains('shifts')) return (to: '/shifts', title: 'Close the day', text: 'Count the cash and close your shift.', cta: 'Cash-up');
  return (to: '/pos', title: 'Ready to sell', text: 'Open the till and serve the next customer.', cta: 'Open till');
}

/// The busiest hour of the sales from day key [from] on: (hour, count), or null (UI batch 3, B4)
(int, int)? busiestHour(List<Sale> sales, String branch, String from) {
  final h = List.filled(24, 0);
  for (final s in sales) {
    if (s.status == 'refunded' || s.branchId != branch) continue;
    final d = DateTime.tryParse(s.date)?.toLocal();
    if (d == null || localDate(d).compareTo(from) < 0) continue;
    h[d.hour]++;
  }
  var best = 0;
  for (var i = 1; i < 24; i++) {
    if (h[i] > h[best]) best = i;
  }
  return h[best] == 0 ? null : (best, h[best]);
}

const _wd = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
String _shortDay(String k) { final d = DateTime.parse(k); return '${_wd[d.weekday - 1]} ${d.day}'; }

/// A faint dashed line across the bars at the average (UI batch 3, B1)
class _DashLine extends CustomPainter {
  const _DashLine(this.color);
  final Color color;
  @override
  void paint(Canvas c, Size s) {
    final p = Paint()..color = color..strokeWidth = 1.5;
    for (var x = 0.0; x < s.width; x += 7) {
      c.drawLine(Offset(x, 0), Offset((x + 4).clamp(0, s.width), 0), p);
    }
  }
  @override
  bool shouldRepaint(_DashLine o) => o.color != color;
}

class BentoRow extends StatefulWidget {
  const BentoRow({super.key, required this.byDay, required this.sales, required this.branch, required this.money, this.moneyShort, required this.expiring, required this.low, required this.can});
  final Map<String, DayFigures> byDay;
  final List<Sale> sales;
  final String branch;
  final String Function(num) money;
  final String Function(num)? moneyShort;
  final int expiring, low;
  final Set<String> can;
  @override
  State<BentoRow> createState() => _BentoRowState();
}

class _BentoRowState extends State<BentoRow> {
  int _n = 7;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    final cur = periodSums(widget.byDay, _n), prev = periodSums(widget.byDay, _n, offset: _n);
    final delta = prev.total > 0 ? (cur.total - prev.total) / prev.total * 100 : null;
    final now = DateTime.now();
    final bars = [for (var i = (_n == 30 ? 29 : 6); i >= 0; i--) localDate(now.subtract(Duration(days: i)))];
    final maxV = bars.map((k) => widget.byDay[k]?.total ?? 0).fold<double>(1, (a, b) => b > a ? b : a);
    final recent = (widget.sales.where((s) => s.branchId == widget.branch).toList()..sort((a, b) => b.date.compareTo(a.date))).take(5).toList();
    final f = featuredAction(expiring: widget.expiring, low: widget.low, can: widget.can);
    final from = localDate(now.subtract(Duration(days: _n - 1)));
    const white = Colors.white;
    final short = widget.moneyShort ?? widget.money;
    // B1: the average of the bars shown; B4: the period's best day and busiest hour
    final avg = bars.fold<double>(0, (a, k) => a + (widget.byDay[k]?.total ?? 0)) / bars.length;
    final bestDay = [for (var i = 0; i < _n; i++) localDate(now.subtract(Duration(days: i)))].reduce((b, k) => (widget.byDay[k]?.total ?? 0) > (widget.byDay[b]?.total ?? 0) ? k : b);
    final peak = busiestHour(widget.sales, widget.branch, from);
    final labelled = bars.length <= 7;

    final hero = InkWell(
      key: const Key('bento-hero'),
      borderRadius: BorderRadius.circular(20),
      onTap: () => context.go('/sales?from=$from&to=${today()}'),
      child: Ink(
        padding: const EdgeInsets.all(18),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(20),
          gradient: RadialGradient(center: Alignment.topRight, radius: 1.3, colors: [t.colorScheme.primary.withValues(alpha: .45), t.extension<SideColors>()?.top ?? const Color(0xFF05070B)], stops: const [0, .7]),
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
          Text('SALES · ${_n == 1 ? 'TODAY' : '$_n DAYS'}', style: t.textTheme.labelSmall?.copyWith(color: white.withValues(alpha: .7), letterSpacing: .8)),
          const SizedBox(height: 6),
          FittedBox(fit: BoxFit.scaleDown, alignment: Alignment.centerLeft, child: Text(widget.money(cur.total), key: const Key('bento-total'), style: t.textTheme.headlineMedium?.copyWith(color: white, fontWeight: FontWeight.w800))),
          const SizedBox(height: 6),
          Wrap(spacing: 8, crossAxisAlignment: WrapCrossAlignment.center, children: [
            if (delta != null)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                decoration: BoxDecoration(borderRadius: BorderRadius.circular(99), color: Colors.white.withValues(alpha: .2)),
                child: Text('${delta >= 0 ? '▲ +' : '▼ −'}${delta.abs().toStringAsFixed(1)}%', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 12)),
              ),
            Text(delta != null ? 'vs the ${_n == 1 ? 'day' : '$_n days'} before' : 'nothing to compare with yet', style: TextStyle(color: white.withValues(alpha: .7), fontSize: 12)),
          ]),
          if (cur.count > 0) ...[
            const SizedBox(height: 8),
            for (final (k, label, v) in [
              if (_n > 1 && (widget.byDay[bestDay]?.total ?? 0) > 0) ('bento-best-day', 'Best day', '${_shortDay(bestDay)} · ${short(widget.byDay[bestDay]!.total)}'),
              if (peak != null) ('bento-busiest', 'Busiest hour', '${peak.$1.toString().padLeft(2, '0')}:00 · ${peak.$2} sale${peak.$2 == 1 ? '' : 's'}'),
            ])
              Container(
                key: Key(k),
                padding: const EdgeInsets.symmetric(vertical: 6),
                decoration: BoxDecoration(border: Border(top: BorderSide(color: white.withValues(alpha: .12)))),
                child: Row(children: [
                  Text(label, style: TextStyle(color: white.withValues(alpha: .7), fontSize: 12)),
                  const SizedBox(width: 10),
                  Expanded(child: Text(v, textAlign: TextAlign.right, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: white, fontWeight: FontWeight.w700, fontSize: 13.5))),
                ]),
              ),
          ],
          const SizedBox(height: 12),
          Row(children: [
            for (final (label, v) in [('Receipts', '${cur.count}'), ('Average sale', widget.money(cur.count == 0 ? 0 : cur.total / cur.count))])
              Expanded(
                child: Container(
                  margin: const EdgeInsets.only(right: 8),
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(borderRadius: BorderRadius.circular(12), color: white.withValues(alpha: .07)),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(label, style: TextStyle(color: white.withValues(alpha: .65), fontSize: 11.5)),
                    FittedBox(fit: BoxFit.scaleDown, child: Text(v, style: const TextStyle(color: white, fontWeight: FontWeight.w700))),
                  ]),
                ),
              ),
          ]),
        ]),
      ),
    );

    final chart = Card(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('Daily sales', style: t.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
          const SizedBox(height: 10),
          SizedBox(
            height: 150,
            child: LayoutBuilder(builder: (context, box) {
              const top = 18.0;
              final lab = labelled ? 18.0 : 0.0;
              final area = box.maxHeight - top - lab;
              return Stack(children: [
                Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
                  for (final k in bars)
                    Expanded(
                      child: Tooltip(
                        // B1: the day and its amount on hover, long-press and focus
                        message: '${_shortDay(k)} · ${widget.money(widget.byDay[k]?.total ?? 0)}',
                        child: InkWell(
                          onTap: () => context.go('/sales?from=$k&to=$k'),
                          child: Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 2),
                            child: Column(children: [
                              SizedBox(
                                height: top,
                                child: k == today() && (widget.byDay[k]?.total ?? 0) > 0
                                    ? FittedBox(fit: BoxFit.scaleDown, child: Text(short(widget.byDay[k]!.total), key: const Key('bento-today-value'), style: t.textTheme.labelSmall?.copyWith(fontWeight: FontWeight.w700)))
                                    : null,
                              ),
                              SizedBox(
                                height: area,
                                child: Align(
                                  alignment: Alignment.bottomCenter,
                                  child: FractionallySizedBox(
                                    heightFactor: ((widget.byDay[k]?.total ?? 0) / maxV).clamp(.03, 1),
                                    child: Container(
                                      key: k == today() ? const Key('bento-bar-today') : null,
                                      decoration: BoxDecoration(
                                        borderRadius: const BorderRadius.vertical(top: Radius.circular(8), bottom: Radius.circular(4)),
                                        // the theme's colour at full strength, today a deeper shade (the owner's review, 18 Nov 2026)
                                        color: k == today() ? Color.lerp(t.colorScheme.primary, Colors.black, .25) : t.colorScheme.primary.withValues(alpha: .85),
                                      ),
                                    ),
                                  ),
                                ),
                              ),
                              if (labelled) SizedBox(height: lab, child: Text(_wd[DateTime.parse(k).weekday - 1], style: t.textTheme.labelSmall)),
                            ]),
                          ),
                        ),
                      ),
                    ),
                ]),
                if (avg > 0)
                  Positioned(
                    key: const Key('bento-avg'),
                    left: 0,
                    right: 0,
                    bottom: lab + area * (avg / maxV).clamp(0, 1),
                    child: IgnorePointer(child: CustomPaint(size: const Size(double.infinity, 1.5), painter: _DashLine(t.colorScheme.onSurface.withValues(alpha: .45)))),
                  ),
              ]);
            }),
          ),
          if (avg > 0) Padding(padding: const EdgeInsets.only(top: 6), child: Text('- - Average ${widget.money(avg)} a day', style: t.textTheme.bodySmall)),
        ]),
      ),
    );

    Color pill(String st) => switch (st) { 'owing' => context.tones.warn, 'refunded' => t.colorScheme.error, _ => context.tones.ok };
    final latest = Card(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 10, 14, 10),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(children: [
            Expanded(child: Text('Latest sales', style: t.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700))),
            TextButton(onPressed: () => context.go('/sales'), child: const Text('All')),
          ]),
          if (recent.isEmpty) const Padding(padding: EdgeInsets.all(8), child: Text('No sales yet')),
          for (final s in recent)
            Padding(
              key: ValueKey('bento-sale-${s.id}'),
              padding: const EdgeInsets.symmetric(vertical: 5),
              child: Row(children: [
                // B3: the Owing pill beside the name, the amounts in one right column, nothing wrapping
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Row(children: [
                      Flexible(child: Text(s.customerName.isEmpty ? 'Walk-in' : s.customerName, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w600))),
                      Builder(builder: (_) {
                        final st = saleStatusOf(s);
                        // only unusual states carry a pill (2026-11-18)
                        if (st == 'paid') return const SizedBox.shrink();
                        return Container(
                          margin: const EdgeInsets.only(left: 6),
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                          decoration: BoxDecoration(borderRadius: BorderRadius.circular(99), color: pill(st).withValues(alpha: .14)),
                          child: Text(switch (st) { 'owing' => 'Owing', 'refunded' => 'Refunded', _ => 'Paid' }, style: TextStyle(color: pill(st), fontSize: 11.5, fontWeight: FontWeight.w700)),
                        );
                      }),
                    ]),
                    Text(s.number, maxLines: 1, overflow: TextOverflow.ellipsis, style: t.textTheme.bodySmall),
                  ]),
                ),
                const SizedBox(width: 12),
                ConstrainedBox(
                  constraints: const BoxConstraints(minWidth: 88),
                  child: Text(widget.money(s.total), key: const Key('bento-amount'), textAlign: TextAlign.right, maxLines: 1, style: const TextStyle(fontWeight: FontWeight.w700, fontFeatures: [FontFeature.tabularFigures()])),
                ),
              ]),
            ),
        ]),
      ),
    );

    final action = InkWell(
      key: const Key('bento-action'),
      borderRadius: BorderRadius.circular(20),
      onTap: () => context.go(f.to),
      child: Ink(
        padding: const EdgeInsets.all(18),
        decoration: BoxDecoration(borderRadius: BorderRadius.circular(20), gradient: LinearGradient(colors: [t.colorScheme.primary, Color.lerp(t.colorScheme.primary, Colors.black, .45)!], begin: Alignment.topLeft, end: Alignment.bottomRight)),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
          Icon(Icons.auto_awesome, color: t.colorScheme.onPrimary),
          const SizedBox(height: 8),
          Text(f.title, style: t.textTheme.titleMedium?.copyWith(color: t.colorScheme.onPrimary, fontWeight: FontWeight.w800)),
          Text(f.text, style: TextStyle(color: t.colorScheme.onPrimary.withValues(alpha: .85))),
          const SizedBox(height: 10),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
            decoration: BoxDecoration(borderRadius: BorderRadius.circular(99), color: Colors.white),
            child: Text('${f.cta} →', style: const TextStyle(color: Color(0xFF0B0E14), fontWeight: FontWeight.w700, fontSize: 12)),
          ),
        ]),
      ),
    );

    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      SegmentedButton<int>(
        key: const Key('bento-period'),
        showSelectedIcon: false,
        segments: const [ButtonSegment(value: 1, label: Text('Today')), ButtonSegment(value: 7, label: Text('7 days')), ButtonSegment(value: 30, label: Text('30 days'))],
        selected: {_n},
        onSelectionChanged: (v) => setState(() => _n = v.first),
      ),
      const SizedBox(height: 12),
      LayoutBuilder(builder: (context, c) {
        final cols = c.maxWidth >= 1200 ? 4 : c.maxWidth >= 640 ? 2 : 1;
        final w = (c.maxWidth - 14 * (cols - 1)) / cols;
        return Wrap(spacing: 14, runSpacing: 14, children: [for (final x in [hero, chart, latest, action]) SizedBox(width: w, child: x)]);
      }),
    ]);
  }
}

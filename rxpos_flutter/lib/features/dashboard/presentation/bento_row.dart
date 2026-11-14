// The bento row at the top of the Dashboard (src/components/BentoDashboard.jsx): period chips (today, 7 days, 30
// days), a dark hero card with the period's sales against the period before, daily bars with today picked out (tap
// a day for its sales), the latest receipts with a Paid / Owing / Refunded pill, and the pharmacy's next step.
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

class BentoRow extends StatefulWidget {
  const BentoRow({super.key, required this.byDay, required this.sales, required this.branch, required this.money, required this.expiring, required this.low, required this.can});
  final Map<String, DayFigures> byDay;
  final List<Sale> sales;
  final String branch;
  final String Function(num) money;
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

    final hero = InkWell(
      key: const Key('bento-hero'),
      borderRadius: BorderRadius.circular(20),
      onTap: () => context.go('/sales?from=$from&to=${today()}'),
      child: Ink(
        padding: const EdgeInsets.all(18),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(20),
          gradient: RadialGradient(center: Alignment.topRight, radius: 1.3, colors: [t.colorScheme.primary.withValues(alpha: .45), const Color(0xFF05070B)], stops: const [0, .7]),
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
                decoration: BoxDecoration(borderRadius: BorderRadius.circular(99), color: (delta >= 0 ? Colors.green : Colors.red).withValues(alpha: .2)),
                child: Text('${delta >= 0 ? '↗' : '↘'} ${delta.abs().toStringAsFixed(1)}%', style: TextStyle(color: delta >= 0 ? const Color(0xFF86EFAC) : const Color(0xFFFCA5A5), fontWeight: FontWeight.w700, fontSize: 12)),
              ),
            Text(delta != null ? 'vs the ${_n == 1 ? 'day' : '$_n days'} before' : 'nothing to compare with yet', style: TextStyle(color: white.withValues(alpha: .7), fontSize: 12)),
          ]),
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
            height: 130,
            child: Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
              for (final k in bars)
                Expanded(
                  child: Tooltip(
                    message: '$k: ${widget.money(widget.byDay[k]?.total ?? 0)}',
                    child: InkWell(
                      onTap: () => context.go('/sales?from=$k&to=$k'),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 2),
                        child: Column(mainAxisAlignment: MainAxisAlignment.end, children: [
                          Flexible(
                            child: FractionallySizedBox(
                              heightFactor: ((widget.byDay[k]?.total ?? 0) / maxV).clamp(.03, 1),
                              child: Container(
                                key: k == today() ? const Key('bento-bar-today') : null,
                                decoration: BoxDecoration(
                                  borderRadius: const BorderRadius.vertical(top: Radius.circular(8), bottom: Radius.circular(4)),
                                  color: k == today() ? t.colorScheme.primary : t.colorScheme.primary.withValues(alpha: .22),
                                ),
                              ),
                            ),
                          ),
                          if (bars.length <= 7) Text(DateTime.parse(k).day.toString(), style: t.textTheme.labelSmall),
                        ]),
                      ),
                    ),
                  ),
                ),
            ]),
          ),
        ]),
      ),
    );

    Color pill(String st) => switch (st) { 'owing' => Colors.orange.shade800, 'refunded' => t.colorScheme.error, _ => Colors.green.shade700 };
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
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(s.customerName.isEmpty ? 'Walk-in' : s.customerName, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w600)),
                    Text(s.number, style: t.textTheme.bodySmall),
                  ]),
                ),
                Builder(builder: (_) {
                  final st = saleStatusOf(s);
                  return Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                    decoration: BoxDecoration(borderRadius: BorderRadius.circular(99), color: pill(st).withValues(alpha: .14)),
                    child: Text(switch (st) { 'owing' => 'Owing', 'refunded' => 'Refunded', _ => 'Paid' }, style: TextStyle(color: pill(st), fontSize: 11.5, fontWeight: FontWeight.w700)),
                  );
                }),
                const SizedBox(width: 8),
                Text(widget.money(s.total), style: const TextStyle(fontWeight: FontWeight.w700)),
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

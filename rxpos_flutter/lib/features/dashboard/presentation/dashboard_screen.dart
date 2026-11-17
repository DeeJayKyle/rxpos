import 'package:rxpos/core/theme/themes.dart' show TonesOfContext;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/rules/kits.dart';
import '../../../core/data/pharmacy_providers.dart';
import '../../../core/entities/sale.dart';
import '../../../core/presentation/widgets.dart';
import '../../../core/rules/dates.dart';
import '../../../core/rules/stock.dart';
import '../../auth/application/session_controller.dart';
import '../../sales_history/presentation/sales_screen.dart' show ageText, isOldDraft;
import '../../../core/presentation/charts.dart';
import '../domain/figures.dart';
import '../domain/insights.dart';
import 'bento_row.dart';
import 'dashboard_panels.dart';
import 'sale_checks.dart';
import 'clean_parts.dart';
import '../domain/clean_dashboard.dart';
import '../../../core/data/device_settings.dart';
import '../../storage/presentation/storage_screen.dart';

/// Home, the clean dashboard (src/pages/Dashboard.jsx; the owner's choice, 2026-11-15): period chips, the four figures
/// against the period before, one sales chart (Daily / Monthly), stock health, the top medicines and the latest sales.
/// The other cards are widgets that can be switched back on (Edit widgets, kept on this device).
class DashboardScreen extends ConsumerStatefulWidget {
  const DashboardScreen({super.key});
  @override
  ConsumerState<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends ConsumerState<DashboardScreen> {
  String _topBy = 'amount', _chart = 'daily';

  @override
  Widget build(BuildContext context) {
    final data = ref.watch(pharmacyProvider).value;
    final sales = ref.watch(tableProvider('sales')).value;
    final expenses = ref.watch(tableProvider('expenses')).value;
    final purchases = ref.watch(tableProvider('purchases')).value ?? const [];
    final session = ref.watch(sessionControllerProvider).value;
    final can = ref.watch(permissionsProvider).value ?? const <String>{};
    final layout = DashLayout.parse(ref.watch(deviceValueProvider('dash')).value);
    void save(String v) => ref.read(deviceValueProvider('dash').notifier).set(v);
    if (data == null || sales == null || expenses == null) return const Center(child: CircularProgressIndicator());
    final s = data.settings;
    final saleList = sales.map(Sale.fromRecord).toList();
    final f = Figures.of(saleList, expenses, branch: data.branch, purchases: purchases);
    final period = layout.period;
    final pf = periodFigures(f.byDay, period);
    final c = pf.cur, pv = pf.prev, vs = vsWords[period]!;
    final isToday = period == 'today';
    final branchRows = ref.watch(tableProvider('branches')).value ?? const [];
    final multiBranch = branchRows.length > 1; // expenses are pharmacy-wide
    final branchName = multiBranch ? '${branchRows.where((b) => b['id'] == data.branch).firstOrNull?['name'] ?? 'Main branch'} · ' : '';
    final day = today();
    final range = pf.range;
    final topFrom = isToday ? '${day.substring(0, 8)}01' : range.from, topWords = isToday ? 'this month' : periodWords[period]!;
    final top = topMedicines(saleList, topFrom, day, branch: data.branch, by: _topBy);
    final drafts = data.drafts.where((x) => session?.role != 'cashier' || x.userId == session?.userId).toList();
    final oldDrafts = drafts.where(isOldDraft).toList();
    final oldest = drafts.isEmpty ? null : drafts.reduce((a, b) => a.startedAt.compareTo(b.startedAt) <= 0 ? a : b);
    final stocked = data.products.where((p) => data.stockOf(p.id) > 0).toList();
    final low = stocked.where((p) => isLowStock(p, data.stockOf(p.id))).length;
    final warn = s.expiryWarnDays.round();
    final exp = expiryBatches(stocked, data.stock.batchesOf, data.stockOf, warn);
    final value = stockValue(stocked, data.stock.batchesOf);
    final soonN = exp.soon.map((x) => x.$1.id).toSet().length, expiredN = exp.expired.map((x) => x.$1.id).toSet().length;
    final health = stockHealth(data.products, data.stock.batchesOf, data.stockOf, warn: warn);
    final m = f.month(monthOf(day));
    final draftsTo = drafts.any((x) => x.kind == 'delivery') && (oldDrafts.any((x) => x.kind == 'delivery') || !drafts.any((x) => x.kind == 'sale')) ? '/purchases?tab=drafts' : '/sales';
    final promote = data.features['promos'] == false ? const <Insight>[] : promoteToday(insights(data.products, data.stockOf, data.stock.batchesOf, saleList, s));
    final checks = can.contains('audit');

    Widget? card(String id) => switch (id) {
          'figures' => StatGrid(children: [
              StatCard(label: isToday ? 'Today\'s sales' : 'Sales', value: s.money(c.total), sub: '${c.count} sale${c.count == 1 ? '' : 's'}${deltaText(c.total, pv.total, vs)}', icon: Icons.payments_outlined,
                  onTap: can.contains('sales.view') ? () => context.go('/sales?from=${range.from}&to=${range.to}') : null),
              if (can.contains('reports'))
                StatCard(label: isToday ? 'Gross profit today' : 'Gross profit', value: s.money(c.grossProfit), sub: 'after cost of goods${deltaText(c.grossProfit, pv.grossProfit, vs)}', icon: Icons.trending_up, color: context.tones.violet,
                    onTap: () => context.go('/reports?tab=profit&from=${range.from}&to=${range.to}')),
              if (can.contains('finance') || can.contains('reports'))
                StatCard(label: isToday ? 'Today\'s expenses' : 'Expenses', value: s.money(c.expenses), sub: '${multiBranch ? 'Whole pharmacy (expenses have no branch) · sales here − expenses' : 'Sales − expenses'}: ${s.money(c.total - c.expenses)}', icon: Icons.account_balance_wallet_outlined, color: context.tones.warn,
                    onTap: () => context.go(can.contains('finance') ? '/finance?tab=expenses' : '/reports?tab=expenses&from=${range.from}&to=${range.to}')),
              StatCard(label: 'Transactions', value: '${c.count}', sub: 'receipts ${isToday ? 'today' : periodWords[period]}${deltaText(c.count.toDouble(), pv.count.toDouble(), vs)}', icon: Icons.receipt_long_outlined, color: context.tones.info,
                  onTap: can.contains('sales.view') ? () => context.go('/sales?from=${range.from}&to=${range.to}') : null),
            ]),
          'chart' => Card(child: Padding(padding: const EdgeInsets.all(12), child: () {
              final pick = SegmentedButton<String>(
                key: const Key('chart-kind'),
                showSelectedIcon: false,
                style: const ButtonStyle(visualDensity: VisualDensity.compact),
                segments: const [ButtonSegment(value: 'daily', label: Text('Daily')), ButtonSegment(value: 'monthly', label: Text('Monthly'))],
                selected: {_chart},
                onSelectionChanged: (v) => setState(() => _chart = v.first),
              );
              return _chart == 'daily'
                  ? DailyTrend(byDay: {for (final e in f.byDay.entries) e.key: e.value.total}, keysFor: (n) => lastDays(n), money: s.money, extra: pick, onDay: (k) => context.go('/sales?from=$k&to=$k'))
                  : MonthLines(money: s.money, monthKeys: (n) => lastMonths(n), extra: pick, series: [
                      ('Sales', moneyIn, {for (final e in f.byMonth.entries) e.key: e.value.total}),
                      if (can.contains('reports')) ('Purchases', purchasesColor, f.purchasesByMonth),
                      if (can.contains('finance') || can.contains('reports')) ('Expenses', expensesColor, {for (final e in f.byMonth.entries) e.key: e.value.expenses}),
                      if (can.contains('reports')) ('Gross profit', profitColor, {for (final e in f.byMonth.entries) e.key: e.value.grossProfit}),
                    ]);
            }())),
          'health' => HealthCard(health: health, rows: [
              if (can.contains('reports')) ('Stock value', s.money(value.value), 'at cost, expired not included', '/reports?tab=stock'),
              ('Low stock', '$low', 'at or below the reorder level', '/inventory?filter=low'),
              ('Soon expiring', '$soonN', 'within $warn days', '/inventory?filter=expiring'),
              ('Expired', '$expiredN', expiredN == 0 ? 'nothing expired in stock' : 'in stock: return or write off', '/inventory?filter=expired'),
              if (drafts.isNotEmpty) ('Open drafts', '${drafts.length}', oldDrafts.isNotEmpty ? '${oldDrafts.length} waiting too long · oldest ${ageText(oldest!.startedAt)}' : 'held sales and deliveries', draftsTo),
            ]),
          'top' => TopMedicinesCard(top: top, words: topWords, by: _topBy, onBy: (v) => setState(() => _topBy = v), money: s.money, canProfit: can.contains('reports'),
              onAll: can.contains('reports') ? () => context.go('/reports?tab=products&from=$topFrom&to=$day') : null),
          'recent' => can.contains('sales.view')
              ? RecentSalesCard(sales: (saleList.where((x) => x.branchId == data.branch && x.status != 'refunded').toList()..sort((a, b) => b.date.compareTo(a.date))).take(5).toList(), settings: s)
              : null,
          'checks' => checks ? SaleChecksCard(branch: data.branch, money: s.money) : null,
          'bento' => BentoRow(byDay: f.byDay, sales: saleList, branch: data.branch, money: s.money, expiring: soonN + expiredN, low: low, can: can),
          'alerts' => StatGrid(children: [
              StatCard(label: 'Low stock', value: '$low', sub: 'in stock, at or below reorder level', icon: Icons.inventory_2_outlined, color: low > 0 ? context.tones.warn : null, onTap: () => context.go('/inventory?filter=low')),
              StatCard(label: 'Soon expiring', value: '$soonN', sub: 'within $warn days', icon: Icons.event_outlined, color: soonN > 0 ? context.tones.warn : null, onTap: () => context.go('/inventory?filter=expiring')),
              StatCard(label: 'Expired', value: '$expiredN', sub: expiredN == 0 ? 'nothing expired in stock' : 'in stock: return or write off', icon: Icons.gpp_maybe_outlined,
                  color: expiredN > 0 ? Theme.of(context).colorScheme.error : context.tones.ok, onTap: () => context.go('/inventory?filter=expired')),
            ]),
          'promote' => promote.isEmpty
              ? null
              : Card(child: Padding(padding: const EdgeInsets.all(12), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text('Promote today', style: Theme.of(context).textTheme.titleMedium),
                  for (final x in promote)
                    ListTile(
                      dense: true,
                      title: Text(x.p.name, style: const TextStyle(fontWeight: FontWeight.w700)),
                      subtitle: Text('${x.staff} · ${x.note}'),
                      trailing: Row(mainAxisSize: MainAxisSize.min, children: [
                        Text(s.money(x.p.price)),
                        IconButton(tooltip: 'Share ${x.p.name} on WhatsApp', icon: const Icon(Icons.share_outlined),
                            onPressed: () => launchUrl(Uri.parse('https://wa.me/?text=${Uri.encodeComponent(shareText(x.p, s))}'), mode: LaunchMode.externalApplication)),
                      ]),
                    ),
                ]))),
          'weather' => data.features['weather'] != false ? const WeatherCard(compact: true) : null,
          'totals' => StatGrid(children: [
              StatCard(label: 'Products', value: '${data.products.length}', icon: Icons.medication_outlined, onTap: () => context.go('/medicines')),
              StatCard(label: 'Customers', value: '${data.customers.where((x) => x.id != 'walk-in').length}', icon: Icons.people_outline, onTap: () => context.go('/customers')),
              StatCard(label: 'This month', value: s.money(m.total), sub: '${m.count} sales', icon: Icons.calendar_month_outlined),
            ]),
          _ => null,
        };
    final spans = {for (final w in dashWidgets) w.$1: w.$3};

    return PageFrame(
      title: '',
      scroll: true,
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        RiseIn(index: 0, child: SizedBox(width: double.infinity, child: GreetingCard(pharmacy: s.name, name: session?.userName ?? '', canSell: can.contains('pos.sell')))),
        const SizedBox(height: 12),
        LayoutBuilder(builder: (context, box) {
          // the period chips share the row; on a phone Edit widgets is an icon so all five chips fit
          final narrow = box.maxWidth < 520;
          final chips = SegmentedButton<String>(
            key: const Key('period-chips'),
            style: const ButtonStyle(visualDensity: VisualDensity.compact),
            showSelectedIcon: false,
            segments: [for (final (k, l) in periods) ButtonSegment(value: k, label: Text(l))],
            selected: {period},
            onSelectionChanged: (v) => save(layout.encode(period: v.first)),
          );
          return Row(children: [
            if (narrow) Expanded(child: chips) else Expanded(child: Align(alignment: Alignment.centerLeft, child: SingleChildScrollView(scrollDirection: Axis.horizontal, child: chips))),
            const SizedBox(width: 6),
            narrow
                ? IconButton.outlined(key: const Key('edit-widgets-open'), tooltip: 'Edit widgets', onPressed: () => showEditWidgets(context, layout, save), icon: const Icon(Icons.tune, size: 18))
                : TextButton.icon(key: const Key('edit-widgets-open'), onPressed: () => showEditWidgets(context, layout, save), icon: const Icon(Icons.tune, size: 18), label: const Text('Edit widgets')),
          ]);
        }),
        // what the figures cover, in words
        Padding(
          padding: const EdgeInsets.only(top: 4),
          child: Text('$branchName${isToday ? 'today' : periodWords[period]} · sales incl. tax, refunds left out · gross profit = sales less tax and cost of goods',
              key: const Key('dash-scope'), style: Theme.of(context).textTheme.bodySmall),
        ),
        // recommendation 6 (1.10, as src/pages/Dashboard.jsx): kits that can be made 3 times or fewer, with what holds them back
        if ([for (final k in data.tillKits) if (k.canMake != null && k.canMake! <= 3) k] case final low when low.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 10),
            child: Material(
              key: const Key('kit-low-alert'),
              color: Colors.orange.withValues(alpha: .12),
              borderRadius: BorderRadius.circular(10),
              child: InkWell(
                borderRadius: BorderRadius.circular(10),
                onTap: () => context.go('/kits'),
                child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Icon(Icons.inventory_outlined, size: 18, color: context.tones.warn),
                    const SizedBox(width: 8),
                    Expanded(child: Text.rich(TextSpan(children: [
                      const TextSpan(text: 'Kits running low: ', style: TextStyle(fontWeight: FontWeight.w800)),
                      TextSpan(text: [
                        for (final k in low.take(4))
                          '${k.name}: ${k.canMake == 0 ? 'none can be made' : 'only ${k.canMake} can be made'}${kitShortText(k).isEmpty ? '' : ', ${kitShortText(k)}'}',
                      ].join('; ') + (low.length > 4 ? ' and ${low.length - 4} more' : '')),
                      const TextSpan(text: '  Open kits', style: TextStyle(decoration: TextDecoration.underline)),
                    ]))),
                  ]),
                ),
              ),
            ),
          ),
        const SizedBox(height: 12),
        LayoutBuilder(builder: (context, box) {
          final cols = box.maxWidth >= 1100 ? 12 : box.maxWidth >= 760 ? 6 : 1;
          const gap = 14.0;
          double width(int span) {
            if (cols == 1) return box.maxWidth;
            final sp = cols == 6 ? (span >= 8 || span == 12 ? 6 : span == 4 ? 6 : 3) : span;
            final w = (box.maxWidth - gap * (cols / sp - 1)) * sp / cols;
            return w.floorToDouble();
          }
          var i = 0;
          return Wrap(spacing: gap, runSpacing: gap, children: [
            for (final id in layout.order)
              if (layout.shown.contains(id))
                if (card(id) case final Widget w) SizedBox(key: ValueKey('widget-$id'), width: width(spans[id]!), child: RiseIn(index: ++i, child: w)),
          ]);
        }),
      ]),
    );
  }
}

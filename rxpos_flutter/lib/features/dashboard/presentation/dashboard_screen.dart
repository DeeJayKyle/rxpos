import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/data/pharmacy_providers.dart';
import '../../../core/entities/sale.dart';
import '../../../core/presentation/widgets.dart';
import '../../../core/rules/dates.dart';
import '../../../core/rules/money.dart';
import '../../../core/rules/stock.dart';
import '../../auth/application/session_controller.dart';
import '../../sales_history/presentation/sales_screen.dart' show ageText, isOldDraft;
import '../../../core/presentation/charts.dart';
import '../domain/figures.dart';
import '../domain/insights.dart';
import 'dashboard_panels.dart';
import 'sale_checks.dart';
import '../../storage/presentation/storage_screen.dart';

/// Home: today's figures against yesterday, stock alerts, this month's best sellers.
class DashboardScreen extends ConsumerStatefulWidget {
  const DashboardScreen({super.key});
  @override
  ConsumerState<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends ConsumerState<DashboardScreen> {
  String _topBy = 'amount';

  @override
  Widget build(BuildContext context) {
    final data = ref.watch(pharmacyProvider).value;
    final sales = ref.watch(tableProvider('sales')).value;
    final expenses = ref.watch(tableProvider('expenses')).value;
    final purchases = ref.watch(tableProvider('purchases')).value ?? const [];
    final session = ref.watch(sessionControllerProvider).value;
    final can = ref.watch(permissionsProvider).value ?? const <String>{};
    if (data == null || sales == null || expenses == null) return const Center(child: CircularProgressIndicator());
    final s = data.settings;
    final saleList = sales.map(Sale.fromRecord).toList();
    final f = Figures.of(saleList, expenses, branch: data.branch, purchases: purchases);
    final drafts = data.drafts.where((x) => session?.role != 'cashier' || x.userId == session?.userId).toList();
    final oldDrafts = drafts.where(isOldDraft).toList();
    final oldest = drafts.isEmpty ? null : drafts.reduce((a, b) => a.startedAt.compareTo(b.startedAt) <= 0 ? a : b);
    final promote = data.features['promos'] == false ? const <Insight>[] : promoteToday(insights(data.products, data.stockOf, data.stock.batchesOf, saleList, s));
    final top = [...f.top]..sort((a, b) => (switch (_topBy) { 'qty' => b.qty.compareTo(a.qty), 'profit' => b.profit.compareTo(a.profit), _ => b.amount.compareTo(a.amount) }));
    double topVal(TopSeller x) => switch (_topBy) { 'qty' => x.qty, 'profit' => x.profit, _ => x.amount };
    final topMax = top.isEmpty ? 1.0 : top.take(10).map(topVal).fold<double>(1, (a, b) => b > a ? b : a);
    final now = DateTime.now();
    final t = f.day(today()), y = f.day(localDate(now.subtract(const Duration(days: 1)))), m = f.month(monthOf(today()));
    final day = today();
    String delta(double a, double b) {
      final d = deltaPercent(a, b);
      return d == null ? '' : ' · ${d >= 0 ? '▲' : '▼'} ${d.abs().toStringAsFixed(0)}% vs yesterday';
    }

    final stocked = data.products.where((p) => data.stockOf(p.id) > 0).toList();
    final low = stocked.where((p) => isLowStock(p, data.stockOf(p.id))).length;
    final warn = s.expiryWarnDays.round();
    final exp = expiryBatches(stocked, data.stock.batchesOf, data.stockOf, warn);
    final value = stockValue(stocked, data.stock.batchesOf);
    return PageFrame(
      title: '',
      scroll: true,
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        SizedBox(width: double.infinity, child: GreetingCard(pharmacy: s.name, name: session?.userName ?? '', canSell: can.contains('pos.sell'))),
        const SizedBox(height: 16),
        StatGrid(children: [
          StatCard(label: 'Today\'s sales', value: s.money(t.total), sub: '${t.count} sale${t.count == 1 ? '' : 's'}${delta(t.total, y.total)}', icon: Icons.payments_outlined,
              onTap: can.contains('sales.view') ? () => context.go('/sales?from=$day&to=$day') : null),
          if (can.contains('reports'))
            StatCard(label: 'Gross profit today', value: s.money(t.grossProfit), sub: 'after cost of goods, before expenses', icon: Icons.trending_up, color: Colors.deepPurple,
                onTap: () => context.go('/reports?tab=profit&from=$day&to=$day')),
          if (can.contains('finance') || can.contains('reports'))
            StatCard(label: 'Today\'s expenses', value: s.money(t.expenses), sub: 'Sales − expenses: ${s.money(t.total - t.expenses)}', icon: Icons.account_balance_wallet_outlined, color: Colors.orange.shade800,
                onTap: () => context.go(can.contains('finance') ? '/finance?tab=expenses' : '/reports?tab=expenses&from=$day&to=$day')),
          StatCard(label: 'Transactions', value: '${t.count}', sub: 'receipts today${delta(t.count.toDouble(), y.count.toDouble())}', icon: Icons.receipt_long_outlined, color: Colors.blue,
              onTap: can.contains('sales.view') ? () => context.go('/sales?from=$day&to=$day') : null),
        ]),
        const SizedBox(height: 16),
        StatGrid(children: [
          StatCard(label: 'Low stock', value: '$low', sub: 'in stock, at or below reorder level', icon: Icons.inventory_2_outlined, color: low > 0 ? Colors.orange.shade800 : null,
              onTap: () => context.go('/inventory?filter=low')),
          StatCard(label: 'Soon expiring', value: '${exp.soon.map((x) => x.$1.id).toSet().length}', sub: 'within $warn days', icon: Icons.event_outlined,
              color: exp.soon.isNotEmpty ? Colors.orange.shade800 : null, onTap: () => context.go('/inventory?filter=expiring')),
          StatCard(label: 'Expired', value: '${exp.expired.map((x) => x.$1.id).toSet().length}', sub: exp.expired.isEmpty ? 'nothing expired in stock' : 'in stock: return or write off',
              icon: Icons.gpp_maybe_outlined, color: exp.expired.isNotEmpty ? Theme.of(context).colorScheme.error : Colors.green, onTap: () => context.go('/inventory?filter=expired')),
          if (can.contains('reports'))
            StatCard(label: 'Inventory value', value: s.money(value.value), sub: value.expired > 0 ? '+ ${s.money(value.expired)} expired' : 'at current cost', icon: Icons.warehouse_outlined,
                onTap: () => context.go('/reports?tab=stock')),
          StatCard(label: 'This month', value: s.money(m.total), sub: '${m.count} sales', icon: Icons.calendar_month_outlined,
              onTap: can.contains('reports') ? () => context.go('/reports?tab=sales&from=${day.substring(0, 8)}01&to=$day') : can.contains('sales.view') ? () => context.go('/sales?from=${day.substring(0, 8)}01&to=$day') : null),
        ]),
        if (drafts.isNotEmpty) ...[
          const SizedBox(height: 12),
          StatCard(label: 'Open drafts', value: '${drafts.length}',
              sub: oldDrafts.isNotEmpty ? '${oldDrafts.length} waiting too long · oldest ${ageText(oldest!.startedAt)}' : 'held sales and unfinished deliveries · oldest ${ageText(oldest!.startedAt)}',
              icon: Icons.pause_circle_outline, color: oldDrafts.isNotEmpty ? Theme.of(context).colorScheme.error : Colors.orange.shade800,
              onTap: () => context.go(drafts.any((x) => x.kind == 'delivery') && (oldDrafts.any((x) => x.kind == 'delivery') || !drafts.any((x) => x.kind == 'sale')) ? '/purchases?tab=drafts' : '/sales')),
        ],
        if (can.contains('audit')) ...[const SizedBox(height: 16), SaleChecksCard(branch: data.branch, money: s.money)],
        if (promote.isNotEmpty) ...[
          const SizedBox(height: 16),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
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
              ]),
            ),
          ),
        ],
        if (data.features['weather'] != false) ...[const SizedBox(height: 16), const WeatherCard(compact: true)],
        const SizedBox(height: 16),
        Wrap(spacing: 12, runSpacing: 12, children: [
          SizedBox(
            width: MediaQuery.sizeOf(context).width < 700 ? MediaQuery.sizeOf(context).width - 32 : 640,
            child: Card(child: Padding(padding: const EdgeInsets.all(12), child: DailyTrend(
              byDay: {for (final e in f.byDay.entries) e.key: e.value.total},
              keysFor: (n) => lastDays(n),
              money: s.money,
              onDay: (k) => context.go('/sales?from=$k&to=$k'),
            ))),
          ),
          SizedBox(
            width: MediaQuery.sizeOf(context).width < 700 ? MediaQuery.sizeOf(context).width - 32 : 520,
            child: StockAlertsCard(low: stocked.where((p) => isLowStock(p, data.stockOf(p.id))).toList()..sort((a, b) => data.stockOf(a.id).compareTo(data.stockOf(b.id))),
                soon: exp.soon, stockOf: data.stockOf),
          ),
          SizedBox(
            width: MediaQuery.sizeOf(context).width < 700 ? MediaQuery.sizeOf(context).width - 32 : 640,
            child: Card(child: Padding(padding: const EdgeInsets.all(12), child: MonthLines(
              money: s.money,
              monthKeys: (n) => lastMonths(n),
              series: [
                ('Sales', moneyIn, {for (final e in f.byMonth.entries) e.key: e.value.total}),
                if (can.contains('reports')) ('Purchases', purchasesColor, f.purchasesByMonth),
                if (can.contains('finance') || can.contains('reports')) ('Expenses', expensesColor, {for (final e in f.byMonth.entries) e.key: e.value.expenses}),
                if (can.contains('reports')) ('Gross profit', profitColor, {for (final e in f.byMonth.entries) e.key: e.value.grossProfit}),
              ],
            ))),
          ),
        ]),
        if (can.contains('sales.view')) ...[
          const SizedBox(height: 16),
          RecentSalesCard(
            sales: (saleList.where((x) => x.branchId == data.branch && x.status != 'refunded').toList()..sort((a, b) => b.date.compareTo(a.date))).take(6).toList(),
            settings: s,
          ),
        ],
        const SizedBox(height: 16),
        StatGrid(children: [
          StatCard(label: 'Products', value: '${data.products.length}', icon: Icons.medication_outlined, onTap: () => context.go('/medicines')),
          StatCard(label: 'Customers', value: '${data.customers.where((c) => c.id != 'walk-in').length}', icon: Icons.people_outline, onTap: () => context.go('/customers')),
        ]),
        const SizedBox(height: 20),
        Wrap(spacing: 8, runSpacing: 6, crossAxisAlignment: WrapCrossAlignment.center, children: [
          Text('Top 10 medicines this month', style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
          SegmentedButton<String>(
            segments: [
              const ButtonSegment(value: 'amount', label: Text('Amount')),
              const ButtonSegment(value: 'qty', label: Text('Quantity')),
              if (can.contains('reports')) const ButtonSegment(value: 'profit', label: Text('Profit')),
            ],
            selected: {_topBy},
            onSelectionChanged: (v) => setState(() => _topBy = v.first),
          ),
        ]),
        const SizedBox(height: 6),
        if (top.isEmpty)
          const Text('No sales this month yet')
        else
          Card(
            child: Column(children: [
              for (final (i, x) in top.take(10).indexed)
                ListTile(
                  dense: true,
                  leading: CircleAvatar(radius: 13, child: Text('${i + 1}', style: const TextStyle(fontSize: 12))),
                  title: Text(x.name),
                  subtitle: LinearProgressIndicator(value: (topVal(x) / topMax).clamp(0, 1).toDouble(), minHeight: 6),
                  trailing: Text(_topBy == 'qty' ? formatQty(x.qty) : s.money(topVal(x)), style: const TextStyle(fontWeight: FontWeight.w700)),
                ),
            ]),
          ),
      ]),
    );
  }
}

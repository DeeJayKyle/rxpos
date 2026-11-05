import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/data/pharmacy_providers.dart';
import '../../../core/entities/sale.dart';
import '../../../core/presentation/widgets.dart';
import '../../../core/rules/dates.dart';
import '../../../core/rules/money.dart';
import '../../../core/rules/stock.dart';
import '../../auth/application/session_controller.dart';
import '../domain/figures.dart';

/// Home: today's figures against yesterday, stock alerts, this month's best sellers.
class DashboardScreen extends ConsumerWidget {
  const DashboardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final data = ref.watch(pharmacyProvider).value;
    final sales = ref.watch(tableProvider('sales')).value;
    final expenses = ref.watch(tableProvider('expenses')).value;
    final session = ref.watch(sessionControllerProvider).value;
    final can = ref.watch(permissionsProvider).value ?? const <String>{};
    if (data == null || sales == null || expenses == null) return const Center(child: CircularProgressIndicator());
    final s = data.settings;
    final f = Figures.of(sales.map(Sale.fromRecord), expenses);
    final now = DateTime.now();
    final t = f.day(today()), y = f.day(localDate(now.subtract(const Duration(days: 1)))), m = f.month(monthOf(today()));
    String delta(double a, double b) {
      final d = deltaPercent(a, b);
      return d == null ? '' : ' · ${d >= 0 ? '▲' : '▼'} ${d.abs().toStringAsFixed(0)}% vs yesterday';
    }

    final stocked = data.products.where((p) => data.stockOf(p.id) > 0).toList();
    final low = stocked.where((p) => isLowStock(p, data.stockOf(p.id))).length;
    final warn = s.expiryWarnDays.round();
    final exp = expiryBatches(stocked, data.stock.batchesOf, data.stockOf, warn);
    final value = stockValue(stocked, data.stock.batchesOf);
    final hour = now.hour;
    return PageFrame(
      title: '${hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'}${session == null ? '' : ', ${session.userName.split(' ').first}'}',
      subtitle: s.name,
      actions: [if (can.contains('pos.sell')) FilledButton.icon(onPressed: () => context.go('/pos'), icon: const Icon(Icons.point_of_sale), label: const Text('New sale'))],
      scroll: true,
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Wrap(spacing: 12, runSpacing: 12, children: [
          StatCard(label: 'Today\'s sales', value: s.money(t.total), sub: '${t.count} sale${t.count == 1 ? '' : 's'}${delta(t.total, y.total)}', icon: Icons.payments_outlined,
              onTap: can.contains('sales.view') ? () => context.go('/sales') : null),
          if (can.contains('reports'))
            StatCard(label: 'Gross profit today', value: s.money(t.grossProfit), sub: 'after cost of goods, before expenses', icon: Icons.trending_up, color: Colors.deepPurple),
          if (can.contains('finance') || can.contains('reports'))
            StatCard(label: 'Today\'s expenses', value: s.money(t.expenses), sub: 'Sales − expenses: ${s.money(t.total - t.expenses)}', icon: Icons.account_balance_wallet_outlined, color: Colors.orange.shade800),
          StatCard(label: 'Transactions', value: '${t.count}', sub: 'receipts today${delta(t.count.toDouble(), y.count.toDouble())}', icon: Icons.receipt_long_outlined, color: Colors.blue),
        ]),
        const SizedBox(height: 16),
        Wrap(spacing: 12, runSpacing: 12, children: [
          StatCard(label: 'Low stock', value: '$low', sub: 'in stock, at or below reorder level', icon: Icons.inventory_2_outlined, color: low > 0 ? Colors.orange.shade800 : null,
              onTap: () => context.go('/inventory?filter=low')),
          StatCard(label: 'Soon expiring', value: '${exp.soon.map((x) => x.$1.id).toSet().length}', sub: 'within $warn days', icon: Icons.event_outlined,
              color: exp.soon.isNotEmpty ? Colors.orange.shade800 : null, onTap: () => context.go('/inventory?filter=expiring')),
          StatCard(label: 'Expired', value: '${exp.expired.map((x) => x.$1.id).toSet().length}', sub: exp.expired.isEmpty ? 'nothing expired in stock' : 'in stock: return or write off',
              icon: Icons.gpp_maybe_outlined, color: exp.expired.isNotEmpty ? Theme.of(context).colorScheme.error : Colors.green, onTap: () => context.go('/inventory?filter=expired')),
          if (can.contains('reports')) StatCard(label: 'Inventory value', value: s.money(value.value), sub: value.expired > 0 ? '+ ${s.money(value.expired)} expired' : 'at current cost', icon: Icons.warehouse_outlined),
          StatCard(label: 'This month', value: s.money(m.total), sub: '${m.count} sales', icon: Icons.calendar_month_outlined),
        ]),
        const SizedBox(height: 20),
        Text('Best sellers this month', style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
        const SizedBox(height: 6),
        if (f.top.isEmpty)
          const Text('No sales yet this month.')
        else
          Card(
            child: Column(children: [
              for (final (i, x) in f.top.take(8).indexed)
                ListTile(dense: true, leading: CircleAvatar(radius: 13, child: Text('${i + 1}', style: const TextStyle(fontSize: 12))), title: Text(x.name),
                    subtitle: Text('${formatQty(x.qty)} sold${can.contains('reports') ? ' · profit ${s.money(x.profit)}' : ''}'), trailing: Text(s.money(x.amount))),
            ]),
          ),
      ]),
    );
  }
}

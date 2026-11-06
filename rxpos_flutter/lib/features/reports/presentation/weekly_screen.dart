import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:printing/printing.dart';

import '../../../core/data/device_settings.dart';
import '../../../core/data/pharmacy_providers.dart';
import '../../../core/entities/sale.dart';
import '../../../core/entities/settings.dart';
import '../../../core/presentation/charts.dart';
import '../../../core/presentation/export.dart';
import '../../../core/presentation/widgets.dart';
import '../../../core/rules/money.dart';
import '../../auth/application/session_controller.dart';
import '../domain/weekly.dart';

/// Weekly summary (src/pages/Weekly.jsx): a week against the week before; earlier / later weeks; per branch; PDF.
class WeeklyScreen extends ConsumerStatefulWidget {
  const WeeklyScreen({super.key});
  @override
  ConsumerState<WeeklyScreen> createState() => _WeeklyScreenState();
}

class _WeeklyScreenState extends ConsumerState<WeeklyScreen> {
  int _offset = -1;
  String? _branch;

  @override
  Widget build(BuildContext context) {
    final sales = ref.watch(tableProvider('sales')).value;
    final branches = ref.watch(tableProvider('branches')).value ?? const [];
    final st = ref.watch(settingsProvider).value ?? const PharmacySettings();
    final session = ref.watch(sessionControllerProvider).value;
    final device = ref.watch(deviceBranchProvider).value ?? 'main';
    if (sales == null) return const Center(child: CircularProgressIndicator());
    final branch = _branch ?? (session?.role == 'cashier' ? device : 'all');
    final w = weeklyStats(sales.map(Sale.fromRecord), weekStart(DateTime.now(), _offset), branch: branch);
    String delta(double a, double b) {
      final p = pct(a, b);
      return '${p >= 0 ? '▲' : '▼'} ${p.abs().round()}% vs week before';
    }

    Widget bars(String title, List<(String, double, String)> rows, {String empty = 'No sales'}) {
      final max = rows.isEmpty ? 1.0 : rows.map((r) => r.$2).fold<double>(1, (a, b) => b > a ? b : a);
      return Card(
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Text(title, style: Theme.of(context).textTheme.titleMedium),
            if (rows.isEmpty) Text(empty),
            for (final (name, v, note) in rows)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 3),
                child: Row(children: [
                  SizedBox(width: 160, child: Text(name, overflow: TextOverflow.ellipsis)),
                  Expanded(child: LinearProgressIndicator(value: (v / max).clamp(0, 1).toDouble(), minHeight: 8)),
                  SizedBox(width: 180, child: Text('${st.money(v)} $note', textAlign: TextAlign.right)),
                ]),
              ),
          ]),
        ),
      );
    }

    return PageFrame(
      title: 'Weekly summary',
      subtitle: '${w.start} → ${w.end} · compared with the week before',
      actions: [
        if (branches.length > 1)
          DropdownButton<String>(value: branch, items: [const DropdownMenuItem(value: 'all', child: Text('All branches')), for (final b in branches) DropdownMenuItem(value: '${b['id']}', child: Text('${b['name']}'))],
              onChanged: (v) => setState(() => _branch = v)),
        OutlinedButton.icon(onPressed: () => setState(() => _offset--), icon: const Icon(Icons.chevron_left), label: const Text('Earlier')),
        OutlinedButton.icon(onPressed: _offset >= 0 ? null : () => setState(() => _offset++), icon: const Icon(Icons.chevron_right), label: const Text('Later')),
        OutlinedButton.icon(
          onPressed: () => Printing.layoutPdf(name: 'Weekly summary', onLayout: (_) => tablesPdf(st, title: 'Weekly summary', subtitle: '${w.start} → ${w.end}', tables: [
            PdfTable(head: const ['', 'This week', 'Week before'], numeric: const [1, 2], body: [
              ['Sales', st.money(w.total), st.money(w.prevTotal)], ['Transactions', '${w.count}', '${w.prevCount}'], ['Gross profit', st.money(w.profit), st.money(w.prevProfit)],
              for (final (d, a, b) in w.byDay) [d, st.money(a), st.money(b)],
            ]),
            PdfTable(heading: 'Top sellers', head: const ['Medicine', 'Qty', 'Amount'], numeric: const [1, 2], body: [for (final r in w.top) [r.name, formatQty(r.qty), st.money(r.amount)]]),
            PdfTable(heading: 'Team', head: const ['Staff', 'Sales', 'Amount'], numeric: const [1, 2], body: [for (final (n, c, a) in w.staff) [n, '$c', st.money(a)]]),
          ])),
          icon: const Icon(Icons.print_outlined),
          label: const Text('PDF'),
        ),
      ],
      scroll: true,
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        StatGrid(children: [
          StatCard(label: 'Sales', value: st.money(w.total), sub: delta(w.total, w.prevTotal), icon: Icons.payments_outlined),
          StatCard(label: 'Transactions', value: '${w.count}', sub: delta(w.count.toDouble(), w.prevCount.toDouble()), icon: Icons.receipt_long_outlined, color: Colors.deepPurple),
          StatCard(label: 'Average basket', value: st.money(w.basket), sub: 'per sale', icon: Icons.shopping_basket_outlined),
          StatCard(label: 'Gross profit', value: st.money(w.profit), sub: '${delta(w.profit, w.prevProfit)} · sales − cost − discounts', icon: Icons.trending_up, color: Colors.orange.shade800),
        ]),
        const SizedBox(height: 12),
        Card(child: Padding(padding: const EdgeInsets.all(12), child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text('Sales by day (best: ${w.best.$1})', style: Theme.of(context).textTheme.titleMedium),
          BarChart(data: [for (final (d, a, _) in w.byDay) (d, a)], money: st.money),
          Text('Week before: ${w.byDay.map((x) => '${x.$1} ${st.money(x.$3)}').join(' · ')}', style: Theme.of(context).textTheme.bodySmall),
        ]))),
        bars('Top sellers', [for (final r in w.top) (r.name, r.amount, '· ${formatQty(r.qty)}')], empty: 'No sales this week'),
        bars('Items that stood out', [for (final r in w.risers) (r.name, r.amount, r.before != 0 ? '↑ ${r.growth.round()}%' : '· new')], empty: 'Nothing stood out'),
        if (w.fallers.isNotEmpty) bars('Slowed down', [for (final r in w.fallers) (r.name, r.amount, '↓ ${r.growth.abs().round()}%')]),
        bars('Team performance', [for (final (n, c, a) in w.staff) (n, a, '· $c sales')]),
        if (w.payments.isNotEmpty) bars('Payment methods', [for (final (n, a) in w.payments) (n, a, '')]),
        Text('The summary pops up at the start of each week. More detail in Reports.', style: Theme.of(context).textTheme.bodySmall),
      ]),
    );
  }
}

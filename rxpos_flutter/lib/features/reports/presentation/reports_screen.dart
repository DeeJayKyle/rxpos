import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:printing/printing.dart';

import '../../../core/data/pharmacy_providers.dart';
import '../../../core/entities/movement.dart';
import '../../../core/entities/sale.dart';
import '../../../core/entities/settings.dart';
import '../../../core/presentation/charts.dart';
import '../../../core/presentation/export.dart';
import '../../../core/presentation/widgets.dart';
import '../../../core/rules/dates.dart';
import '../../../core/rules/money.dart';
import '../../auth/application/session_controller.dart';
import '../../sales_history/presentation/sales_lines.dart';
import '../domain/report_tabs.dart';

const reportTabs = [
  ('sales', 'Sales Report'), ('lines', 'Sales lines'), ('products', 'Sales by Product'), ('consumption', 'Consumption (ABC)'), ('purchases', 'Purchase Report'),
  ('expenses', 'Expenses Report'), ('profit', 'Profit & margins'), ('stock', 'Stock Valuation'), ('income', 'Income Statement'),
];

/// Reports (src/pages/Reports.jsx): a period (and branch); Sales Report, Sales lines, Sales by Product, Consumption
/// (ABC), Purchase Report, Expenses Report, Profit & margins, Stock Valuation, Income Statement; every tab prints or
/// exports. Staff with only "reports.lines" see the Sales lines tab, without profit.
class ReportsScreen extends ConsumerStatefulWidget {
  const ReportsScreen({super.key, this.tab = '', this.from = '', this.to = ''});
  final String tab, from, to;
  @override
  ConsumerState<ReportsScreen> createState() => _ReportsScreenState();
}

class _ReportsScreenState extends ConsumerState<ReportsScreen> {
  late String _from = widget.from.isEmpty ? '${today().substring(0, 7)}-01' : widget.from, _to = widget.to.isEmpty ? today() : widget.to;
  String _branch = 'all';
  String? _tab;
  bool _byCategory = false, _showIdle = false;

  @override
  Widget build(BuildContext context) {
    final can = ref.watch(permissionsProvider).value ?? const <String>{};
    final full = can.contains('reports');
    final tab = !full ? 'lines' : (_tab ?? (widget.tab.isEmpty ? 'sales' : widget.tab));
    final d = ref.watch(pharmacyProvider).value;
    final sales = ref.watch(tableProvider('sales')).value;
    final purchases = ref.watch(tableProvider('purchases')).value ?? const [];
    final expenses = ref.watch(tableProvider('expenses')).value ?? const [];
    final cats = ref.watch(tableProvider('expenseCategories')).value ?? const [];
    final moves = ref.watch(tableProvider('movements')).value ?? const [];
    final branches = ref.watch(tableProvider('branches')).value ?? const [];
    if (d == null || sales == null) return const Center(child: CircularProgressIndicator());
    final st = d.settings;
    final per = Period(from: _from, to: _to, branch: _branch, sales: sales.map(Sale.fromRecord), purchases: purchases, expenses: expenses, movements: moves.map(Movement.fromRecord));
    String catName(Object? id) => '${cats.where((c) => c['id'] == id).firstOrNull?['name'] ?? 'Other'}';
    final title = reportTabs.firstWhere((x) => x.$1 == tab).$2;
    final body = switch (tab) {
      'lines' => SalesLinesView(key: ValueKey('$_from|$_to|$_branch'), from: _from, to: _to, branch: _branch, money: full),
      'products' => _products(per, st),
      'consumption' => _consumption(per, d, st),
      'purchases' => _purchases(per, st),
      'expenses' => _expenses(per, st, catName),
      'profit' => _profit(per, d, st),
      'stock' => _stock(d, st),
      'income' => _income(per, d, st, catName),
      _ => _sales(per, st),
    };
    return PageFrame(
      title: 'Reports',
      subtitle: tab == 'stock' ? 'As at ${today()}' : '$_from to $_to',
      actions: [
        if (tab != 'stock') ...[
          if (branches.length > 1)
            DropdownButton<String>(
              value: _branch,
              items: [const DropdownMenuItem(value: 'all', child: Text('All branches')), for (final b in branches) DropdownMenuItem(value: '${b['id']}', child: Text('${b['name']}'))],
              onChanged: (v) => setState(() => _branch = v ?? 'all'),
            ),
          DateBox(label: 'From', value: _from, onChanged: (v) => setState(() => _from = v.isEmpty ? _from : v)),
          DateBox(label: 'To', value: _to, onChanged: (v) => setState(() => _to = v.isEmpty ? _to : v)),
        ],
        if (tab != 'lines')
          OutlinedButton.icon(
            onPressed: () => Printing.layoutPdf(name: title, onLayout: (_) => tablesPdf(st, title: title, subtitle: tab == 'stock' ? 'As at ${today()}' : '$_from to $_to', tables: _pdf(tab, per, d, st, catName))),
            icon: const Icon(Icons.print_outlined),
            label: const Text('Print / PDF'),
          ),
      ],
      scroll: true,
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        if (full)
          ExpansionTile(
            title: const Text('Reading your figures'),
            children: const [Padding(padding: EdgeInsets.all(8), child: Text('Pick the dates at the top right. Profit & margins shows what each medicine earns and lists prices below your target margin; every table prints to PDF, and lists export to CSV.'))],
          ),
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Wrap(spacing: 6, children: [
            for (final (k, l) in full ? reportTabs : reportTabs.where((x) => x.$1 == 'lines'))
              ChoiceChip(label: Text(l), selected: tab == k, onSelected: (_) => setState(() => _tab = k)),
          ]),
        ),
        const SizedBox(height: 12),
        body,
      ]),
    );
  }

  Widget _card(String title, List<Widget> children, {Widget? action}) => Card(
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Row(children: [Expanded(child: Text(title, style: Theme.of(context).textTheme.titleMedium)), ?action]),
            const SizedBox(height: 6),
            ...children,
          ]),
        ),
      );

  Widget _row(String k, String v, {bool bold = false, Color? color}) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 2),
        child: Row(children: [
          Expanded(child: Text(k, style: TextStyle(fontWeight: bold ? FontWeight.w800 : null, color: color))),
          Text(v, style: TextStyle(fontWeight: bold ? FontWeight.w800 : FontWeight.w600, color: color)),
        ]),
      );

  Widget _sales(Period p, PharmacySettings st) {
    final all = p.revenue + p.tax;
    final byPay = sumBy(p.sales, (s) => s.payment, (s) => s.total);
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      StatGrid(children: [
        StatCard(label: 'Sales', value: st.money(all), sub: '${p.sales.length} receipts', icon: Icons.payments_outlined),
        StatCard(label: 'Average sale', value: st.money(p.sales.isEmpty ? 0 : all / p.sales.length), icon: Icons.receipt_outlined, color: Colors.blue),
        StatCard(label: 'Discounts given', value: st.money(p.discounts), icon: Icons.percent, color: Colors.deepPurple),
        StatCard(label: 'Refunds', value: st.money(p.refunds.fold<double>(0, (a, s) => a + s.total)), sub: '${p.refunds.length} receipts', icon: Icons.undo, color: Theme.of(context).colorScheme.error),
      ]),
      const SizedBox(height: 12),
      _card('Daily sales', [BarChart(key: ValueKey('${p.from}${p.to}${p.branch}'), data: p.daily(), money: st.money)]),
      Wrap(spacing: 12, runSpacing: 12, children: [
        SizedBox(width: 520, child: _card('By payment method', [Center(child: Donut(parts: byPay)), ShareTable(parts: byPay, money: st.money)])),
        SizedBox(width: 420, child: _card('By cashier', [
          for (final (k, v) in sumBy(p.sales, (s) => s.cashier, (s) => s.total)) _row(k, st.money(v)),
          const SizedBox(height: 12),
          Text('Retail vs wholesale', style: Theme.of(context).textTheme.titleSmall),
          for (final (k, v) in sumBy(p.sales, (s) => s.type.isEmpty ? 'retail' : s.type, (s) => s.total)) _row(k, st.money(v)),
        ])),
      ]),
    ]);
  }

  Widget _products(Period p, PharmacySettings st) {
    final rows = salesByProduct(p.sales);
    return _card('Sales by product', [
      if (rows.isEmpty) const Text('No sales in this period'),
      for (final r in rows.take(500))
        ListTile(dense: true, title: Text(r.product), subtitle: Text('${formatQty(r.qty)} sold · cost ${st.money(r.cost)} · profit ${st.money(r.profit)}'), trailing: Text(st.money(r.revenue))),
    ], action: ExportButtons(name: 'sales-by-product', settings: st, csv: () => [for (final r in rows) {'product': r.product, 'qty': r.qty, 'revenue': r.revenue, 'cost': r.cost, 'profit': r.profit}]));
  }

  Widget _consumption(Period p, PharmacyData d, PharmacySettings st) {
    final c = consumption(p.sales, d.byId, d.stockOf, from: p.from, to: p.to);
    final days = DateTime.parse(p.to).difference(DateTime.parse(p.from)).inDays + 1;
    int count(String k) => c.rows.where((r) => r.cls == k).length;
    double value(String k) => c.rows.where((r) => r.cls == k).fold(0.0, (a, r) => a + r.value);
    final soon = c.rows.where((r) => r.daysLeft != null && r.daysLeft! < 14).toList()..sort((a, b) => a.daysLeft!.compareTo(b.daysLeft!));
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      StatGrid(children: [
        StatCard(label: 'Consumption (at cost)', value: st.money(c.total), sub: '${formatQty(c.rows.fold<double>(0, (a, r) => a + r.qty))} units · $days days'),
        StatCard(label: 'Class A', value: '${count('A')}', sub: '${st.money(value('A'))} · the vital few', color: Colors.deepPurple),
        StatCard(label: 'Running out (<14 days)', value: '${soon.length}', sub: 'at this rate', color: soon.isNotEmpty ? Colors.orange.shade800 : null),
        StatCard(label: 'Not sold (in stock)', value: '${c.idle.length}', sub: '${st.money(c.idle.fold<double>(0, (a, r) => a + r.value))} tied up', color: c.idle.isNotEmpty ? Theme.of(context).colorScheme.error : null),
      ]),
      if (soon.isNotEmpty)
        _card('Fast movers about to run out', [
          for (final r in soon.take(20)) _row('${r.name}${r.cls == 'A' ? '  (A)' : ''} · ${r.perDay.toStringAsFixed(1)}/day · ${formatQty(r.stock ?? 0)} in stock', '${r.daysLeft!.round()} days left',
              color: r.daysLeft! < 7 ? Theme.of(context).colorScheme.error : Colors.orange.shade800),
          const Text('Based on how fast each item sold in this period. Reorder the class A items first.', style: TextStyle(fontSize: 12)),
        ]),
      _card('Consumption by medicine (A/B/C by value)', [
        if (c.rows.isEmpty) const Text('Nothing was sold in this period'),
        for (final r in c.rows.take(500))
          ListTile(
            dense: true,
            leading: CircleAvatar(radius: 13, child: Text(r.cls, style: const TextStyle(fontSize: 12))),
            title: Text('${r.name}${r.form.isEmpty ? '' : ' · ${r.form}'}'),
            subtitle: Text('used ${formatQty(r.qty)} · ${r.perDay.toStringAsFixed(1)}/day · ${(r.value / (c.total == 0 ? 1 : c.total) * 100).toStringAsFixed(1)}% · in stock ${r.stock == null ? '—' : formatQty(r.stock!)}'
                '${r.daysLeft == null ? '' : ' · ${r.daysLeft!.round()} days left'}'),
            trailing: Text(st.money(r.value)),
          ),
        const Text('Class A is the top 80% of consumption value — few items, most of the money, so watch them closely. B is the next 15%, C the last 5%. Value is units used × cost.',
            style: TextStyle(fontSize: 12)),
      ], action: ExportButtons(name: 'consumption-abc-${p.from}-to-${p.to}', settings: st, csv: () => [
        for (final r in c.rows)
          {'class': r.cls, 'medicine': r.name, 'form': r.form, 'usedInPeriod': r.qty, 'perDay': r.perDay.toStringAsFixed(2), 'costValue': r.value.round(), 'revenue': r.revenue.round(),
            'shareOfValuePct': (r.value / (c.total == 0 ? 1 : c.total) * 100).toStringAsFixed(1), 'inStock': r.stock ?? '', 'daysOfStockLeft': r.daysLeft?.round() ?? ''},
      ])),
      if (c.idle.isNotEmpty)
        _card('In stock but not sold this period (${c.idle.length})', [
          if (_showIdle) for (final r in c.idle.take(300)) _row('${r.p.name}${r.p.form.isEmpty ? '' : ' · ${r.p.form}'} · ${formatQty(r.stock)} in stock', st.money(r.value)),
        ], action: TextButton(onPressed: () => setState(() => _showIdle = !_showIdle), child: Text(_showIdle ? 'Hide' : 'Show'))),
    ]);
  }

  Widget _purchases(Period p, PharmacySettings st) {
    double n(Object? v) => (v as num?)?.toDouble() ?? 0;
    final total = p.purchases.fold<double>(0, (a, x) => a + n(x['total'])), paid = p.purchases.fold<double>(0, (a, x) => a + n(x['paid'] ?? x['total']));
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      StatGrid(children: [
        StatCard(label: 'Purchases', value: st.money(total), sub: '${p.purchases.length} deliveries'),
        StatCard(label: 'Paid', value: st.money(paid)),
        StatCard(label: 'On credit', value: st.money(total - paid)),
      ]),
      _card('By supplier', [
        if (p.purchases.isEmpty) const Text('No purchases in this period'),
        for (final (k, v) in sumBy(p.purchases, (x) => '${x['supplierName'] ?? '—'}', (x) => n(x['total']))) _row(k, st.money(v)),
      ]),
    ]);
  }

  Widget _expenses(Period p, PharmacySettings st, String Function(Object?) cat) {
    final total = p.expenseTotal;
    return _card('Expenses by category – total ${st.money(total)}', [
      if (p.expenses.isEmpty) const Text('No expenses in this period'),
      for (final (k, v) in sumBy(p.expenses, (e) => cat(e['categoryId']), (e) => (e['amount'] as num?)?.toDouble() ?? 0))
        _row('$k · ${total == 0 ? 0 : (v / total * 100).round()}%', st.money(v)),
    ]);
  }

  Widget _profit(Period p, PharmacyData d, PharmacySettings st) {
    final target = (st.raw['minMargin'] as num?)?.toDouble() ?? 20;
    final rows = profitRows(p.sales, d.byId, byCategory: _byCategory);
    final revenue = rows.fold<double>(0, (a, r) => a + r.revenue), cost = rows.fold<double>(0, (a, r) => a + r.cost);
    final check = priceCheck(d.products, d.stockOf, target);
    final err = Theme.of(context).colorScheme.error;
    Color? low(double m) => m < 0 ? err : m < target ? Colors.orange.shade800 : null;
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      StatGrid(children: [
        StatCard(label: 'Gross profit', value: st.money(revenue - cost), sub: 'on ${st.money(revenue)} sales'),
        StatCard(label: 'Gross margin', value: '${revenue == 0 ? 0 : ((revenue - cost) / revenue * 100).round()}%', sub: 'target ${formatQty(target)}% (Settings)'),
        StatCard(label: 'Priced below cost', value: '${check.where((r) => r.margin < 0).length}', sub: 'in stock now', color: check.any((r) => r.margin < 0) ? err : null),
        StatCard(label: 'Below ${formatQty(target)}% margin', value: '${check.where((r) => r.margin >= 0).length}', sub: 'in stock now', color: Colors.orange.shade800),
      ]),
      if (check.isNotEmpty)
        _card('Price check: ${check.length} medicine${check.length == 1 ? '' : 's'} below the ${formatQty(target)}% margin', [
          for (final r in check.take(100))
            ListTile(
              dense: true,
              title: Text(r.p.name, style: const TextStyle(fontWeight: FontWeight.w700)),
              subtitle: Text('cost ${st.money(r.p.cost)} · retail ${st.money(r.p.price)} · price for ${formatQty(target)}%: ${st.money(priceForMargin(r.p.cost, target))} · ${formatQty(r.stock)} in stock'),
              trailing: Text(r.margin < 0 ? 'below cost' : '${r.margin.round()}%', style: TextStyle(fontWeight: FontWeight.w800, color: low(r.margin))),
            ),
          const Text('Change prices in Quick Edit. The margin here is profit as a share of the selling price.', style: TextStyle(fontSize: 12)),
        ]),
      _card('Profit by ${_byCategory ? 'category' : 'medicine'}', [
        if (rows.isEmpty) const Text('No sales in this period'),
        for (final r in rows.take(300))
          ListTile(dense: true, title: Text(r.name), subtitle: Text('${formatQty(r.qty)} · sales ${st.money(r.revenue)} · cost ${st.money(r.cost)}'),
              trailing: Text('${st.money(r.profit)} · ${r.margin.round()}%', style: TextStyle(color: low(r.margin)))),
      ], action: Row(mainAxisSize: MainAxisSize.min, children: [
        SegmentedButton<bool>(segments: const [ButtonSegment(value: false, label: Text('Medicine')), ButtonSegment(value: true, label: Text('Category'))], selected: {_byCategory},
            onSelectionChanged: (v) => setState(() => _byCategory = v.first)),
        ExportButtons(name: 'profit-by-${_byCategory ? 'category' : 'product'}', settings: st, csv: () => [
          for (final r in rows) {_byCategory ? 'category' : 'product': r.name, 'qty': r.qty, 'revenue': r.revenue.round(), 'cost': r.cost.round(), 'profit': r.profit.round(), 'marginPct': r.margin.toStringAsFixed(1)},
        ]),
      ])),
    ]);
  }

  Widget _stock(PharmacyData d, PharmacySettings st) {
    final v = stockValuation(d.products, d.stock);
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      StatGrid(children: [
        StatCard(label: 'Stock at cost', value: st.money(v.cost), sub: '${v.items} items · each batch at its cost · expired not included'),
        StatCard(label: 'Stock at retail', value: st.money(v.retail), sub: "unexpired stock at today's prices"),
        StatCard(label: 'Potential profit', value: st.money(v.retail - v.cost), sub: 'retail less cost, unexpired stock'),
        StatCard(label: 'Expired stock (cost)', value: st.money(v.expired), sub: 'expired batches still in stock', color: Theme.of(context).colorScheme.error),
      ]),
      _card('By formulation (at cost, expired not included)', [for (final (k, x) in v.byForm) _row(k, st.money(x))]),
    ]);
  }

  Widget _income(Period p, PharmacyData d, PharmacySettings st, String Function(Object?) cat) {
    final w = p.writeOffs(d.byId);
    final net = p.revenue - p.cogs - p.expenseTotal - w;
    return _card('Income statement · ${p.from} to ${p.to}', [
      _row('Sales (excluding tax)', st.money(p.revenue)),
      _row('Less: cost of goods sold', '(${st.money(p.cogs)})'),
      _row('Gross profit', st.money(p.revenue - p.cogs), bold: true),
      for (final (k, v) in sumBy(p.expenses, (e) => cat(e['categoryId']), (e) => (e['amount'] as num?)?.toDouble() ?? 0)) _row('    $k', '(${st.money(v)})'),
      if (w > 0) _row('    Expired stock written off', '(${st.money(w)})'),
      _row('Total operating expenses', '(${st.money(p.expenseTotal + w)})', bold: true),
      _row('Net profit', st.money(net), bold: true, color: net < 0 ? Theme.of(context).colorScheme.error : Colors.green.shade700),
      _row('Tax collected (not income)', st.money(p.tax), color: Colors.grey),
    ]);
  }

  List<PdfTable> _pdf(String tab, Period p, PharmacyData d, PharmacySettings st, String Function(Object?) cat) {
    double n(Object? v) => (v as num?)?.toDouble() ?? 0;
    PdfTable pairs(String heading, List<(String, double)> rows) => PdfTable(heading: heading, head: const ['', 'Amount'], numeric: const [1], body: [for (final (k, v) in rows) [k, st.money(v)]]);
    switch (tab) {
      case 'products':
        final rows = salesByProduct(p.sales);
        return [PdfTable(head: const ['Product', 'Qty', 'Revenue', 'Cost', 'Profit'], numeric: const [1, 2, 3, 4], body: [for (final r in rows) [r.product, formatQty(r.qty), st.money(r.revenue), st.money(r.cost), st.money(r.profit)]])];
      case 'consumption':
        final c = consumption(p.sales, d.byId, d.stockOf, from: p.from, to: p.to);
        return [PdfTable(head: const ['Class', 'Medicine', 'Used', 'Per day', 'Value (cost)', 'In stock', 'Days left'], numeric: const [2, 3, 4, 5, 6], body: [
          for (final r in c.rows) [r.cls, r.name, formatQty(r.qty), r.perDay.toStringAsFixed(1), st.money(r.value), r.stock == null ? '—' : formatQty(r.stock!), r.daysLeft == null ? '—' : '${r.daysLeft!.round()}'],
        ])];
      case 'purchases':
        return [pairs('By supplier', sumBy(p.purchases, (x) => '${x['supplierName'] ?? '—'}', (x) => n(x['total'])))];
      case 'expenses':
        return [pairs('Expenses by category', sumBy(p.expenses, (e) => cat(e['categoryId']), (e) => n(e['amount'])))];
      case 'profit':
        final rows = profitRows(p.sales, d.byId, byCategory: _byCategory);
        return [PdfTable(head: [_byCategory ? 'Category' : 'Medicine', 'Qty', 'Sales', 'Cost', 'Profit', 'Margin'], numeric: const [1, 2, 3, 4, 5], body: [
          for (final r in rows) [r.name, formatQty(r.qty), st.money(r.revenue), st.money(r.cost), st.money(r.profit), '${r.margin.round()}%'],
        ])];
      case 'stock':
        final v = stockValuation(d.products, d.stock);
        return [
          pairs('Stock value', [('Stock at cost', v.cost), ('Stock at retail', v.retail), ('Potential profit', v.retail - v.cost), ('Expired stock (cost)', v.expired)]),
          pairs('By formulation (at cost)', v.byForm),
        ];
      case 'income':
        final w = p.writeOffs(d.byId);
        return [PdfTable(head: const ['', 'Amount'], numeric: const [1], body: [
          ['Sales (excluding tax)', st.money(p.revenue)], ['Less: cost of goods sold', '(${st.money(p.cogs)})'], ['Gross profit', st.money(p.revenue - p.cogs)],
          for (final (k, v) in sumBy(p.expenses, (e) => cat(e['categoryId']), (e) => n(e['amount']))) ['  $k', '(${st.money(v)})'],
          if (w > 0) ['  Expired stock written off', '(${st.money(w)})'],
          ['Total operating expenses', '(${st.money(p.expenseTotal + w)})'], ['Net profit', st.money(p.revenue - p.cogs - p.expenseTotal - w)], ['Tax collected (not income)', st.money(p.tax)],
        ])];
      default:
        return [
          pairs('Summary', [('Sales', p.revenue + p.tax), ('Discounts given', p.discounts), ('Refunds', p.refunds.fold<double>(0, (a, s) => a + s.total))]),
          pairs('By payment method', sumBy(p.sales, (s) => s.payment, (s) => s.total)),
          pairs('By cashier', sumBy(p.sales, (s) => s.cashier, (s) => s.total)),
          pairs('Retail vs wholesale', sumBy(p.sales, (s) => s.type.isEmpty ? 'retail' : s.type, (s) => s.total)),
          pairs('Daily sales', p.daily()),
        ];
    }
  }
}

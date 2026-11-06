import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/data/pharmacy_providers.dart';
import '../../../core/entities/sale.dart';
import '../../../core/entities/settings.dart';
import '../../../core/presentation/export.dart';
import '../../../core/presentation/widgets.dart';
import '../../../core/rules/dates.dart';
import '../../../core/rules/money.dart';
import '../../../core/rules/stock.dart';
import '../domain/sale_edit.dart';

/// Reports → Sales lines (src/pages/SalesLines.jsx): every medicine sold in the period, one row per line of a sale,
/// with who sold it and what it earned; filters combine; tap a receipt to open the sale. [money] shows profit and
/// margins (off for staff who may see the lines but not cost prices).
class SalesLinesView extends ConsumerStatefulWidget {
  const SalesLinesView({super.key, required this.from, required this.to, this.branch = 'all', this.money = true});
  final String from, to, branch;
  final bool money;
  @override
  ConsumerState<SalesLinesView> createState() => _SalesLinesViewState();
}

class _SalesLinesViewState extends ConsumerState<SalesLinesView> {
  String _cashier = '', _type = '', _payment = '', _customer = '', _medicine = '';

  @override
  Widget build(BuildContext context) {
    final rows = ref.watch(tableProvider('sales')).value ?? const [];
    final d = ref.watch(pharmacyProvider).value;
    final st = ref.watch(settingsProvider).value ?? const PharmacySettings();
    final sales = rows.map(Sale.fromRecord).where((s) {
      final day = dayOf(s.date);
      return s.status != 'refunded' && day.compareTo(widget.from) >= 0 && day.compareTo(widget.to) <= 0 &&
          (widget.branch == 'all' || (s.branchId.isEmpty ? mainBranch : s.branchId) == widget.branch);
    });
    final lines = saleLines(sales, {for (final p in [...?d?.products]) p.id: p.generic});
    List<String> opts(String Function(SoldLine) f) => ({for (final l in lines) f(l)}..remove('')).toList()..sort();
    final med = _medicine.trim().toLowerCase();
    final shown = lines.where((l) => (_cashier.isEmpty || l.cashier == _cashier) && (_type.isEmpty || l.type == _type) && (_payment.isEmpty || l.payment == _payment) &&
        (_customer.isEmpty || l.customer == _customer) && (med.isEmpty || '${l.name} ${l.generic}'.toLowerCase().contains(med))).toList()
      ..sort((a, b) => b.date.compareTo(a.date));
    final qty = shown.fold<double>(0, (a, l) => a + l.qty), amount = shown.fold<double>(0, (a, l) => a + l.amount), profit = shown.fold<double>(0, (a, l) => a + l.profit);
    final losses = shown.where((l) => l.profit < 0 && l.cost > 0).length;
    String pct(double x, double of) => of == 0 ? '—' : '${(x / of * 100).round()}%';
    final title = 'Sales lines from ${widget.from} to ${widget.to}';
    final filters = [
      if (_cashier.isNotEmpty) 'dispenser $_cashier', if (_type.isNotEmpty) _type, if (_payment.isNotEmpty) 'paid by $_payment',
      if (_customer.isNotEmpty) 'customer $_customer', if (med.isNotEmpty) 'medicine "$_medicine"',
    ].join(' · ');
    Widget pick(String label, String value, List<(String, String)> items, ValueChanged<String> set) => SizedBox(
          width: 170,
          child: DropdownButtonFormField<String>(
            initialValue: value,
            isExpanded: true,
            decoration: InputDecoration(labelText: label, isDense: true),
            items: [for (final (k, l) in [('', 'All'), ...items]) DropdownMenuItem(value: k, child: Text(l, overflow: TextOverflow.ellipsis))],
            onChanged: (v) => setState(() => set(v ?? '')),
          ),
        );
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Wrap(spacing: 8, runSpacing: 8, crossAxisAlignment: WrapCrossAlignment.end, children: [
        pick('Dispenser', _cashier, [for (final x in opts((l) => l.cashier)) (x, x)], (v) => _cashier = v),
        pick('Sales type', _type, const [('retail', 'Retail'), ('wholesale', 'Wholesale')], (v) => _type = v),
        pick('Payment', _payment, [for (final x in opts((l) => l.payment)) (x, x)], (v) => _payment = v),
        pick('Customer', _customer, [for (final x in opts((l) => l.customer)) (x, x)], (v) => _customer = v),
        SizedBox(width: 200, child: TextField(key: const Key('lines-medicine'), decoration: const InputDecoration(labelText: 'Medicine', hintText: 'Any (type to search)', isDense: true),
            onChanged: (v) => setState(() => _medicine = v))),
        ExportButtons(
          name: 'sales-lines-${widget.from}-${widget.to}',
          settings: st,
          title: title,
          subtitle: filters.isEmpty ? 'All sales lines' : filters,
          csv: () => [
            for (final l in shown)
              {
                'date': l.date, 'customer': l.customer, 'dispenser': l.cashier, 'receipt': l.number, 'trade_name': l.name, 'generic_name': l.generic,
                'qty': l.qty, 'payment': l.payment, 'amount': l.amount.round(), if (widget.money) 'profit': l.profit.round(), if (widget.money) 'margin': pct(l.profit, l.amount),
              },
          ],
          pdf: () => [
            PdfTable(
              head: ['Date & time', 'Customer', 'Dispenser', 'Receipt', 'Trade name', 'Generic name', 'Qty', 'Payment', 'Amount', if (widget.money) 'Profit'],
              numeric: widget.money ? const [6, 8, 9] : const [6, 8],
              body: [for (final l in shown) [l.date.replaceFirst('T', ' ').split('.').first, l.customer, l.cashier, l.number, l.name, l.generic, formatQty(l.qty), l.payment, st.money(l.amount), if (widget.money) st.money(l.profit)]],
              foot: ['Total', '', '', '', '', '', formatQty(qty), '', st.money(amount), if (widget.money) st.money(profit)],
            ),
          ],
        ),
      ]),
      const SizedBox(height: 12),
      StatGrid(children: [
        StatCard(label: 'Amount', value: st.money(amount), sub: '${shown.length} lines · ${{for (final l in shown) l.saleId}.length} receipts'),
        if (widget.money) StatCard(label: 'Profit', value: st.money(profit), sub: '${pct(profit, amount)} margin', color: Colors.deepPurple),
        StatCard(label: 'Quantity sold', value: formatQty(qty), sub: '${{for (final l in shown) l.name}.length} medicines'),
        if (widget.money)
          StatCard(label: 'Sold below cost', value: '$losses', sub: losses > 0 ? 'lines with a loss: check the price' : 'no line sold at a loss',
              color: losses > 0 ? Theme.of(context).colorScheme.error : Colors.green.shade700),
      ]),
      const SizedBox(height: 8),
      Text(filters.isEmpty ? title : '$title · $filters', style: Theme.of(context).textTheme.titleSmall),
      if (shown.isEmpty) const Padding(padding: EdgeInsets.all(12), child: Text('No sales lines match these filters in this period')),
      for (final l in shown.take(500))
        ListTile(
          dense: true,
          title: Text('${l.name}${l.generic.isEmpty ? '' : ' · ${l.generic}'}', style: const TextStyle(fontWeight: FontWeight.w700)),
          subtitle: Wrap(spacing: 6, children: [
            Text('${l.date.replaceFirst('T', ' ').split('.').first} · ${l.customer} · ${l.cashier} · ${l.payment} ·'),
            InkWell(onTap: () => context.go('/sales?q=${Uri.encodeQueryComponent(l.number)}'), child: Text(l.number, style: TextStyle(color: Theme.of(context).colorScheme.primary, decoration: TextDecoration.underline))),
          ]),
          trailing: Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.end, children: [
            Text('${formatQty(l.qty)} · ${st.money(l.amount)}', style: const TextStyle(fontWeight: FontWeight.w700)),
            if (widget.money)
              Text(l.profit < 0 && l.cost > 0 ? 'loss ${st.money(l.profit)}' : 'profit ${st.money(l.profit)} · ${pct(l.profit, l.amount)}',
                  style: TextStyle(fontSize: 12, color: l.profit < 0 ? Theme.of(context).colorScheme.error : null)),
          ]),
        ),
      if (shown.length > 500) Text('Showing the newest 500 of ${shown.length} lines; the CSV and PDF have them all.', style: Theme.of(context).textTheme.bodySmall),
    ]);
  }
}

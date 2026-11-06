// Dashboard panels: the greeting card (pharmacy, greeting, date, New sale), stock alerts (low stock and expiring
// batches, each with a way to act on it) and the most recent sales as a table. Colours come from the theme, so
// every look and design system draws them its own way.
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../core/entities/product.dart';
import '../../../core/entities/sale.dart';
import '../../../core/entities/settings.dart';
import '../../../core/rules/drug_class.dart';
import '../../../core/rules/fefo.dart';
import '../../../core/rules/money.dart';
import '../../../core/presentation/widgets.dart';
import '../../../core/theme/design_tokens.dart';

const _months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const _days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/// "Good morning, Tia 👋" with the pharmacy and today's date, and New sale.
class GreetingCard extends StatelessWidget {
  const GreetingCard({super.key, required this.pharmacy, required this.name, required this.canSell, this.now});
  final String pharmacy, name;
  final bool canSell;
  final DateTime? now;

  @override
  Widget build(BuildContext context) {
    final th = Theme.of(context);
    final cs = th.colorScheme;
    final t = now ?? DateTime.now();
    final greet = t.hour < 12 ? 'Good morning' : t.hour < 17 ? 'Good afternoon' : 'Good evening';
    final first = name.trim().split(' ').first;
    final r = tokensOf(context).radius + 4;
    return Card(
      key: const Key('greeting'),
      margin: EdgeInsets.zero,
      clipBehavior: Clip.antiAlias,
      child: Container(
        decoration: BoxDecoration(
          gradient: LinearGradient(colors: [cs.primary.withValues(alpha: .14), cs.secondary.withValues(alpha: .05)], begin: Alignment.topLeft, end: Alignment.bottomRight),
          borderRadius: BorderRadius.circular(r),
        ),
        child: Stack(children: [
          // a soft circle in the corner, as on the figure tiles
          Positioned(right: -40, top: -60, child: Container(width: 220, height: 220, decoration: BoxDecoration(shape: BoxShape.circle, color: cs.primary.withValues(alpha: .07)))),
          Padding(
            padding: const EdgeInsets.fromLTRB(22, 18, 22, 18),
            child: Wrap(spacing: 16, runSpacing: 12, alignment: WrapAlignment.spaceBetween, runAlignment: WrapAlignment.center, crossAxisAlignment: WrapCrossAlignment.center, children: [
              Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
                if (pharmacy.isNotEmpty)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(color: cs.primary.withValues(alpha: .14), borderRadius: BorderRadius.circular(999)),
                    child: Row(mainAxisSize: MainAxisSize.min, children: [
                      Icon(Icons.storefront_outlined, size: 14, color: cs.tertiary),
                      const SizedBox(width: 6),
                      Text(pharmacy.toUpperCase(), style: th.textTheme.labelSmall?.copyWith(color: cs.tertiary, fontWeight: FontWeight.w800, letterSpacing: .6)),
                    ]),
                  ),
                const SizedBox(height: 8),
                Text('$greet${first.isEmpty ? '' : ', $first'} 👋', style: th.textTheme.headlineSmall),
                Text('${_days[t.weekday - 1]}, ${_months[t.month - 1]} ${t.day}, ${t.year}', style: th.textTheme.bodyMedium?.copyWith(color: cs.onSurfaceVariant)),
              ]),
              if (canSell)
                FilledButton.icon(key: const Key('greeting-new-sale'), onPressed: () => context.go('/pos'), icon: const Icon(Icons.shopping_cart_outlined), label: const Text('New sale')),
            ]),
          ),
        ]),
      ),
    );
  }
}

/// Stock alerts: what is low (with Reorder) and what expires soon (with its batch), in two tabs.
class StockAlertsCard extends StatefulWidget {
  const StockAlertsCard({super.key, required this.low, required this.soon, required this.stockOf});
  final List<Product> low;
  final List<(Product, BatchStock, int)> soon;
  final double Function(String) stockOf;
  @override
  State<StockAlertsCard> createState() => _StockAlertsCardState();
}

class _StockAlertsCardState extends State<StockAlertsCard> {
  bool _expiring = false;

  @override
  Widget build(BuildContext context) {
    final th = Theme.of(context);
    final head = th.textTheme.labelMedium?.copyWith(color: th.colorScheme.onSurfaceVariant);
    TableRow row(List<Widget> cells) => TableRow(children: [for (final c in cells) Padding(padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 4), child: c)]);
    final rows = _expiring
        ? [
            row([Text('Medicine', style: head), Text('Batch', style: head), Text('Expires', style: head), Text('Qty', style: head, textAlign: TextAlign.end)]),
            for (final (p, b, days) in widget.soon.take(6))
              row([
                _Name(p),
                Text(b.batch.isEmpty ? '—' : b.batch),
                Text(days <= 0 ? 'today' : 'in $days d', style: TextStyle(color: days <= 30 ? th.colorScheme.error : Colors.orange.shade800, fontWeight: FontWeight.w700)),
                Text(formatQty(b.qty), textAlign: TextAlign.end),
              ]),
          ]
        : [
            row([Text('Medicine', style: head), Text('In stock', style: head, textAlign: TextAlign.end), Text('Min. level', style: head, textAlign: TextAlign.end), const SizedBox()]),
            for (final p in widget.low.take(6))
              row([
                _Name(p),
                Text(formatQty(widget.stockOf(p.id)), textAlign: TextAlign.end, style: TextStyle(color: th.colorScheme.error, fontWeight: FontWeight.w800)),
                Text(formatQty(p.reorder), textAlign: TextAlign.end),
                Align(
                  alignment: Alignment.centerRight,
                  child: OutlinedButton.icon(
                      style: OutlinedButton.styleFrom(minimumSize: const Size(0, 34), padding: const EdgeInsets.symmetric(horizontal: 10), visualDensity: VisualDensity.compact),
                      onPressed: () => context.go('/reorder'),
                      icon: const Icon(Icons.add_shopping_cart, size: 16),
                      label: const Text('Reorder')),
                ),
              ]),
          ];
    final empty = _expiring ? widget.soon.isEmpty : widget.low.isEmpty;
    return Card(
      key: const Key('stock-alerts'),
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(children: [
            Expanded(child: Text('Stock alerts', style: th.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800))),
            TextButton(onPressed: () => context.go(_expiring ? '/expiry' : '/inventory?filter=low'), child: const Text('View inventory →')),
          ]),
          const SizedBox(height: 6),
          SegmentedButton<bool>(
            showSelectedIcon: false,
            segments: [
              ButtonSegment(value: false, label: Text('Low stock (${widget.low.length})')),
              ButtonSegment(value: true, label: Text('Expiring soon (${widget.soon.length})')),
            ],
            selected: {_expiring},
            onSelectionChanged: (v) => setState(() => _expiring = v.first),
          ),
          const SizedBox(height: 6),
          if (empty)
            Padding(padding: const EdgeInsets.all(16), child: Text(_expiring ? 'Nothing expires soon' : 'Nothing is low on stock', textAlign: TextAlign.center))
          else
            Table(
              columnWidths: _expiring
                  ? const {0: FlexColumnWidth(3), 1: FlexColumnWidth(1.2), 2: FlexColumnWidth(1.2), 3: FlexColumnWidth(.8)}
                  : const {0: FlexColumnWidth(3), 1: FlexColumnWidth(1), 2: FlexColumnWidth(1), 3: IntrinsicColumnWidth()},
              defaultVerticalAlignment: TableCellVerticalAlignment.middle,
              border: TableBorder(horizontalInside: BorderSide(color: th.dividerColor.withValues(alpha: .6))),
              children: rows,
            ),
        ]),
      ),
    );
  }
}

class _Name extends StatelessWidget {
  const _Name(this.p);
  final Product p;
  @override
  Widget build(BuildContext context) {
    final c = drugClassOf(p).cls;
    return Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
      Text(p.name, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700)),
      Text([if (c != unclassified) c, p.form].where((x) => x.isNotEmpty).join(' · '), maxLines: 1, overflow: TextOverflow.ellipsis, style: Theme.of(context).textTheme.bodySmall),
    ]);
  }
}

/// The latest sales as a table: time, receipt, items, customer, payment and amount; tap one to open it.
class RecentSalesCard extends StatelessWidget {
  const RecentSalesCard({super.key, required this.sales, required this.settings});
  final List<Sale> sales;
  final PharmacySettings settings;

  @override
  Widget build(BuildContext context) {
    final th = Theme.of(context);
    final narrow = MediaQuery.sizeOf(context).width < 760;
    final head = th.textTheme.labelMedium?.copyWith(color: th.colorScheme.onSurfaceVariant);
    String time(String iso) {
      final d = DateTime.tryParse(iso)?.toLocal();
      if (d == null) return '';
      final h = d.hour % 12 == 0 ? 12 : d.hour % 12;
      return '$h:${d.minute.toString().padLeft(2, '0')} ${d.hour < 12 ? 'AM' : 'PM'}';
    }

    String items(Sale s) => s.items.map((i) => '${i.name} ×${formatQty(i.qty)}').join(', ');
    Widget pay(String m) {
      final mobile = m.toLowerCase().contains('mobile') || m.toLowerCase().contains('momo');
      final c = mobile ? Colors.blue : m.toLowerCase().contains('cash') ? Colors.green : Colors.purple;
      return Align(
        alignment: Alignment.centerLeft,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
          decoration: BoxDecoration(color: c.withValues(alpha: .14), borderRadius: BorderRadius.circular(999)),
          child: Text(m.isEmpty ? '—' : m, style: th.textTheme.labelSmall?.copyWith(fontWeight: FontWeight.w700)),
        ),
      );
    }

    TableRow row(List<Widget> cells) => TableRow(children: [for (final c in cells) Padding(padding: const EdgeInsets.symmetric(vertical: 7, horizontal: 4), child: c)]);
    return Card(
      key: const Key('recent-sales'),
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(children: [
            Expanded(child: Text('Recent transactions', style: th.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800))),
            TextButton(onPressed: () => context.go('/sales'), child: const Text('View all sales →')),
          ]),
          if (sales.isEmpty)
            const Padding(padding: EdgeInsets.all(16), child: Text('No sales yet', textAlign: TextAlign.center))
          else
            Table(
              columnWidths: narrow
                  ? const {0: FlexColumnWidth(1.4), 1: FlexColumnWidth(3), 2: FlexColumnWidth(1.6)}
                  : const {0: FlexColumnWidth(1), 1: FlexColumnWidth(1.3), 2: FlexColumnWidth(4), 3: FlexColumnWidth(1.6), 4: FlexColumnWidth(1.4), 5: FlexColumnWidth(1.4)},
              defaultVerticalAlignment: TableCellVerticalAlignment.middle,
              border: TableBorder(horizontalInside: BorderSide(color: th.dividerColor.withValues(alpha: .6))),
              children: [
                row(narrow
                    ? [Text('Receipt', style: head), Text('Items', style: head), Text('Amount', style: head, textAlign: TextAlign.end)]
                    : [Text('Time', style: head), Text('Receipt', style: head), Text('Items', style: head), Text('Customer', style: head), Text('Payment', style: head),
                        Text('Amount', style: head, textAlign: TextAlign.end)]),
                for (final s in sales)
                  row(narrow
                      ? [
                          Text(s.number, style: TextStyle(color: th.colorScheme.tertiary, fontWeight: FontWeight.w800)),
                          Text(items(s), maxLines: 2, overflow: TextOverflow.ellipsis),
                          Text(settings.money(s.total), textAlign: TextAlign.end, style: const TextStyle(fontWeight: FontWeight.w800)),
                        ]
                      : [
                          Text(time(s.date)),
                          InkWell(onTap: () => context.go('/sales?q=${Uri.encodeComponent(s.number)}'),
                              child: Text(s.number, style: TextStyle(color: th.colorScheme.tertiary, fontWeight: FontWeight.w800))),
                          Text(items(s), maxLines: 1, overflow: TextOverflow.ellipsis),
                          Text(s.customerName.isEmpty || s.customerId == 'walk-in' ? 'Walk-in' : s.customerName, maxLines: 1, overflow: TextOverflow.ellipsis),
                          pay(s.payment),
                          Text(settings.money(s.total), textAlign: TextAlign.end, style: const TextStyle(fontWeight: FontWeight.w800)),
                        ]),
              ],
            ),
        ]),
      ),
    );
  }
}

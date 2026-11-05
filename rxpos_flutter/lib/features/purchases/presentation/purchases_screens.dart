import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/data/pharmacy_providers.dart';
import '../../../core/data/record_store.dart';
import '../../../core/entities/purchase.dart';
import '../../../core/entities/sale.dart';
import '../../../core/entities/settings.dart';
import '../../../core/entities/product.dart';
import '../../../core/presentation/export.dart';
import '../../../core/presentation/widgets.dart';
import '../../../core/rules/fefo.dart';
import '../../inventory/domain/medicines.dart';
import '../../../core/rules/money.dart';
import '../../../core/rules/stock.dart';
import '../../auth/application/session_controller.dart';
import '../../returns/presentation/returns_screen.dart';
import '../domain/reorder.dart';

/// Purchase history: every delivery received (newest first), what is still owed on each.
class PurchasesScreen extends ConsumerStatefulWidget {
  const PurchasesScreen({super.key});
  @override
  ConsumerState<PurchasesScreen> createState() => _PurchasesScreenState();
}

class _PurchasesScreenState extends ConsumerState<PurchasesScreen> {
  String _q = '';
  @override
  Widget build(BuildContext context) {
    final rows = ref.watch(tableProvider('purchases')).value;
    final st = ref.watch(settingsProvider).value ?? const PharmacySettings();
    if (rows == null) return const Center(child: CircularProgressIndicator());
    final q = _q.trim().toLowerCase();
    final list = rows.map(Purchase.fromRecord).where((p) => q.isEmpty || [p.number, p.invoice, p.supplierName, ...p.items.map((i) => i.name)].any((x) => x.toLowerCase().contains(q))).toList()
      ..sort((a, b) => b.date.compareTo(a.date));
    final owed = list.fold(0.0, (a, p) => a + (p.total - p.paid));
    return PageFrame(
      title: 'Purchase history',
      subtitle: '${list.length} deliveries · ${st.money(list.fold(0.0, (a, p) => a + p.total))}${owed > 0 ? ' · ${st.money(owed)} unpaid' : ''}',
      actions: [SearchField(onChanged: (v) => setState(() => _q = v), hint: 'Supplier, invoice, medicine…')],
      child: list.isEmpty
          ? const EmptyState('No deliveries yet')
          : ListView.separated(
              itemCount: list.length,
              separatorBuilder: (_, _) => const Divider(height: 1),
              itemBuilder: (_, i) {
                final p = list[i];
                return ExpansionTile(
                  title: Text('${p.number} · ${p.supplierName}'),
                  subtitle: Text('${p.date} · invoice ${p.invoice.isEmpty ? '—' : p.invoice} · ${p.items.length} lines · by ${p.receivedBy}${p.paid < p.total ? ' · ${st.money(p.total - p.paid)} unpaid' : ''}'),
                  trailing: Text(st.money(p.total), style: const TextStyle(fontWeight: FontWeight.w700)),
                  children: [
                    for (final it in p.items)
                      ListTile(dense: true, title: Text(it.name), subtitle: Text('batch ${it.batch} · expires ${it.expiry}'),
                          trailing: Text('${it.pack != null ? '${formatQty(it.pack!.count)} ${it.pack!.name} = ' : ''}${formatQty(it.qty)} @ ${st.money(it.cost)}')),
                  ],
                );
              },
            ),
    );
  }
}

/// Reorder: medicines at or below their reorder level with how many to order; reorder levels worked out from sales.
class ReorderScreen extends ConsumerWidget {
  const ReorderScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final d = ref.watch(pharmacyProvider).value;
    final sales = ref.watch(tableProvider('sales')).value;
    final can = ref.watch(permissionsProvider).value ?? const <String>{};
    if (d == null || sales == null) return const Center(child: CircularProgressIndicator());
    final low = d.products.where((p) => p.reorder > 0 && d.stockOf(p.id) <= p.reorder && !(p.isCatalog && d.stockOf(p.id) <= 0 && p.raw['_base'] == true)).toList()
      ..sort((a, b) => (d.stockOf(a.id) / a.reorder).compareTo(d.stockOf(b.id) / b.reorder));
    final changes = computeReorderLevels(sales.map(Sale.fromRecord), d.products);
    return PageFrame(
      title: 'Reorder',
      subtitle: '${low.length} medicines at or below their reorder level',
      actions: [
        if (can.contains('medicines.manage') && changes.isNotEmpty)
          OutlinedButton.icon(onPressed: () async {
            final user = (await ref.read(sessionControllerProvider.future))?.userName ?? '';
            await applyReorderLevels(ref.read(recordStoreProvider), changes, user: user);
            if (context.mounted) say(context, 'Reorder levels updated for ${changes.length} medicines from the last 30 days of sales');
          }, icon: const Icon(Icons.auto_fix_high), label: Text('Set ${changes.length} levels from sales')),
      ],
      child: low.isEmpty
          ? const EmptyState('Nothing to reorder')
          : ListView.separated(
              itemCount: low.length,
              separatorBuilder: (_, _) => const Divider(height: 1),
              itemBuilder: (_, i) {
                final p = low[i];
                final st = d.stockOf(p.id);
                return ListTile(title: Text(p.name), subtitle: Text('in stock ${formatQty(st)} · reorder level ${formatQty(p.reorder)}'),
                    trailing: Text('order ${formatQty(suggestedOrder(p, st))}', style: const TextStyle(fontWeight: FontWeight.w700)));
              },
            ),
    );
  }
}

/// Expiring / Expired (src/pages/Inventory.jsx Expiry): batches in stock expiring within the warning days, or expired,
/// earliest first; return one to the supplier, or write off an expired one; PDF.
class ExpiryScreen extends ConsumerStatefulWidget {
  const ExpiryScreen({super.key});
  @override
  ConsumerState<ExpiryScreen> createState() => _ExpiryScreenState();
}

class _ExpiryScreenState extends ConsumerState<ExpiryScreen> {
  String _tab = 'soon';

  @override
  Widget build(BuildContext context) {
    final d = ref.watch(pharmacyProvider).value;
    final can = ref.watch(permissionsProvider).value ?? const <String>{};
    final session = ref.watch(sessionControllerProvider).value;
    if (d == null) return const Center(child: CircularProgressIndicator());
    final st = d.settings;
    final warn = st.expiryWarnDays.round();
    final e = expiryBatches(d.products.where((p) => d.stockOf(p.id) > 0), d.stock.batchesOf, d.stockOf, warn);
    final rows = _tab == 'expired' ? e.expired : e.soon;
    double worth((Product, BatchStock, int) x) => x.$2.qty * (x.$2.cost != 0 ? x.$2.cost : x.$1.cost);
    final value = rows.fold(0.0, (a, x) => a + worth(x));
    final title = _tab == 'expired' ? 'Expired stock' : 'Expiring within $warn days';
    return PageFrame(
      title: 'Expiring / Expired',
      subtitle: '${rows.length} batches · ${st.money(value)} at cost',
      actions: [
        ExportButtons(
          name: _tab == 'expired' ? 'expired-stock' : 'expiring-stock',
          settings: st,
          title: title,
          subtitle: '${rows.length} batches in stock · ${st.money(value)} at cost',
          pdf: () => [
            PdfTable(head: const ['Medicine', 'Batch', 'Expiry', 'When', 'Qty', 'Value'], numeric: const [4, 5], body: [
              for (final (p, b, days) in rows) [p.name, b.batch, b.expiry, days < 0 ? '${-days} days ago' : days == 0 ? 'today' : 'in $days days', formatQty(b.qty), st.money(b.qty * (b.cost != 0 ? b.cost : p.cost))],
            ]),
          ],
        ),
      ],
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Align(
          alignment: Alignment.centerLeft,
          child: SegmentedButton<String>(
            segments: [ButtonSegment(value: 'soon', label: Text('Expiring within $warn days (${e.soon.length})')), ButtonSegment(value: 'expired', label: Text('Expired (${e.expired.length})'))],
            selected: {_tab},
            onSelectionChanged: (v) => setState(() => _tab = v.first),
          ),
        ),
        const SizedBox(height: 8),
        Expanded(
          child: rows.isEmpty
              ? EmptyState(_tab == 'expired' ? 'No expired stock 🎉' : 'Nothing expiring soon 🎉')
              : ListView.separated(
                  itemCount: rows.length,
                  separatorBuilder: (_, _) => const Divider(height: 1),
                  itemBuilder: (_, i) {
                    final (p, b, days) = rows[i];
                    return ListTile(
                      title: Text(p.name),
                      subtitle: Text('batch ${b.batch} · ${formatQty(b.qty)} in stock · ${st.money(b.qty * (b.cost != 0 ? b.cost : p.cost))} · expires ${b.expiry} (${days < 0 ? '${-days} days ago' : days == 0 ? 'today' : 'in $days days'})'),
                      leading: Icon(days < 0 ? Icons.error_outline : Icons.schedule, color: days < 0 ? Theme.of(context).colorScheme.error : Colors.orange.shade800),
                      trailing: Wrap(spacing: 4, children: [
                        if (can.contains('stock.receive') || can.contains('stock.adjust'))
                          TextButton(onPressed: () => returnDialog(context, ref, p, b, days < 0 ? 'Expired' : 'Short expiry'), child: const Text('Return')),
                        if (_tab == 'expired' && session?.role != 'cashier')
                          TextButton(
                            style: TextButton.styleFrom(foregroundColor: Theme.of(context).colorScheme.error),
                            onPressed: () async {
                              if (!await confirmAction(context, 'Write off expired stock?', '${formatQty(b.qty)} × ${p.name} (batch ${b.batch}) will be removed from stock.', 'Write off')) return;
                              await writeOffBatch(ref.read(recordStoreProvider), p, b, settings: st, user: session?.userName ?? '', branchId: d.branch);
                              if (context.mounted) say(context, '${p.name} batch ${b.batch} written off');
                            },
                            child: const Text('Write off'),
                          ),
                      ]),
                    );
                  },
                ),
        ),
      ]),
    );
  }
}


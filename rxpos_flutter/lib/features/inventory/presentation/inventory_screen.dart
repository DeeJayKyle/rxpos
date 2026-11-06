import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/data/pharmacy_providers.dart';
import '../../../core/entities/product.dart';
import '../../../core/presentation/widgets.dart';
import '../../../core/rules/dates.dart';
import '../../../core/rules/money.dart';
import '../../../core/rules/search.dart';
import '../../../core/rules/stock.dart';
import '../../auth/application/session_controller.dart';
import '../../../core/presentation/export.dart';
import 'medicine_screens.dart';

/// Inventory: every medicine with its stock here, filtered (in stock, low, out, expiring, expired); open one for its
/// batches, to count or adjust stock, or to edit it. Add medicines.
class InventoryScreen extends ConsumerStatefulWidget {
  const InventoryScreen({super.key, this.filter = 'instock'});
  final String filter;
  @override
  ConsumerState<InventoryScreen> createState() => _InventoryScreenState();
}

class _InventoryScreenState extends ConsumerState<InventoryScreen> {
  late String _filter = widget.filter;
  String _q = '';

  static const _filters = [('all', 'All'), ('instock', 'In stock'), ('low', 'Low'), ('out', 'Out of stock'), ('expiring', 'Expiring'), ('expired', 'Expired')];

  @override
  Widget build(BuildContext context) {
    final d = ref.watch(pharmacyProvider).value;
    final can = ref.watch(permissionsProvider).value ?? const <String>{};
    if (d == null) return const Center(child: CircularProgressIndicator());
    final s = d.settings;
    final warn = s.expiryWarnDays.round();
    int? soonest(Product p) {
      int? best;
      for (final b in d.stock.batchesOf(p.id)) {
        if (b.qty > 0 && b.expiry.isNotEmpty) {
          final days = daysUntil(b.expiry);
          if (best == null || days < best) best = days;
        }
      }
      return best;
    }

    var list = _q.trim().isEmpty ? d.products : searchProducts(d.products, _q, stockOf: (p) => d.stockOf(p.id));
    list = list.where((p) {
      final st = d.stockOf(p.id);
      return switch (_filter) {
        'instock' => st > 0,
        'low' => isLowStock(p, st),
        'out' => st <= 0 && !p.isCatalog,
        'expiring' => st > 0 && ((soonest(p) ?? 9999) >= 0 && (soonest(p) ?? 9999) <= warn),
        'expired' => st > 0 && (soonest(p) ?? 0) < 0,
        _ => true,
      };
    }).take(300).toList();
    final value = stockValue(d.products.where((p) => d.stockOf(p.id) > 0), d.stock.batchesOf);
    final shownValue = stockValue(list, d.stock.batchesOf);
    final retail = list.fold<double>(0, (a, p) => a + (d.stockOf(p.id) > 0 ? d.stockOf(p.id) : 0) * p.price);
    return PageFrame(
      title: 'Inventory',
      subtitle: can.contains('reports')
          ? '${list.length} items · ${s.money(shownValue.value)} at cost · ${s.money(retail)} at retail · all stock ${s.money(value.value)}${value.expired > 0 ? ' · ${s.money(value.expired)} expired (not included)' : ''}'
          : '${list.length} items',
      actions: [
        SearchField(onChanged: (v) => setState(() => _q = v), hint: 'Medicine, generic, barcode…'),
        ExportButtons(
          name: 'inventory',
          settings: s,
          title: const {'instock': 'Stock in hand', 'low': 'Low stock', 'out': 'Out of stock', 'all': 'All medicines', 'expiring': 'Expiring soon', 'expired': 'Expired'}[_filter] ?? 'Inventory',
          subtitle: '${list.length} items · ${s.money(shownValue.value)} at cost · ${s.money(retail)} at retail${shownValue.expired > 0 ? ' · ${s.money(shownValue.expired)} expired (not included)' : ''}',
          csv: () => inventoryCsv(list, d),
          pdf: () => [inventoryTable(list, d, s)],
        ),
        if (can.contains('medicines.manage')) FilledButton.icon(onPressed: () => editMedicine(context, ref, null), icon: const Icon(Icons.add), label: const Text('Add medicine')),
      ],
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Wrap(spacing: 6, children: [for (final (k, l) in _filters) ChoiceChip(label: Text(l), selected: _filter == k, onSelected: (_) => setState(() => _filter = k))]),
        const SizedBox(height: 8),
        Expanded(
          child: list.isEmpty
              ? const EmptyState('No medicines here')
              : ListView.separated(
                  itemCount: list.length,
                  separatorBuilder: (_, _) => const Divider(height: 1),
                  itemBuilder: (_, i) {
                    final p = list[i];
                    final st = d.stockOf(p.id);
                    final days = soonest(p);
                    return ListTile(
                      title: Text(p.name),
                      subtitle: Text([p.generic, p.form, if (days != null) days < 0 ? 'EXPIRED' : 'expires in $days days'].where((x) => x.isNotEmpty).join(' · ')),
                      trailing: Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.end, children: [
                        Text(formatQty(st, '${p.unit.isEmpty ? 'unit' : p.unit.toLowerCase()}s'),
                            style: TextStyle(fontWeight: FontWeight.w700, color: st <= 0 ? Theme.of(context).colorScheme.error : isLowStock(p, st) ? Colors.orange.shade800 : null)),
                        Text(s.money(p.price), style: Theme.of(context).textTheme.bodySmall),
                      ]),
                      onTap: () => _open(p),
                    );
                  },
                ),
        ),
      ]),
    );
  }

  Future<void> _open(Product p) async {
    final d = await ref.read(pharmacyProvider.future);
    final can = ref.read(permissionsProvider).value ?? const <String>{};
    if (!mounted) return;
    final batches = d.stock.batchesOf(p.id).where((b) => b.qty != 0).toList();
    final warn = d.settings.expiryWarnDays.round();
    await showDialog<void>(
      context: context,
      builder: (c) => AlertDialog(
        title: Text('${p.name} – batches here'),
        content: SizedBox(
          width: 500,
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('${[p.generic, p.form, p.unit].where((x) => x.isNotEmpty).join(' · ')}\nBarcode ${p.barcode.isEmpty ? '—' : p.barcode}'),
            Text('Price ${d.settings.money(p.price)} · wholesale ${d.settings.money(p.wholesale)}${can.contains('reports') ? ' · cost ${d.settings.money(p.cost)}' : ''}'),
            const Divider(),
            Text('Stock here: ${formatQty(d.stockOf(p.id))}', style: const TextStyle(fontWeight: FontWeight.w700)),
            for (var i = 0; i < batches.length; i++)
              Row(children: [
                Expanded(child: Text('Batch ${batches[i].batch}${batches[i].expiry.isEmpty ? '' : ' · expires ${batches[i].expiry}'} · ${d.settings.money(batches[i].cost != 0 ? batches[i].cost : p.cost)}',
                    style: TextStyle(color: batches[i].expiry.isEmpty ? null : daysUntil(batches[i].expiry) < 0 ? Theme.of(c).colorScheme.error : daysUntil(batches[i].expiry) <= warn ? Colors.orange.shade800 : null))),
                if (i == 0 && batches[i].qty > 0) const Padding(padding: EdgeInsets.only(right: 8), child: Chip(label: Text('Sells next'), visualDensity: VisualDensity.compact)),
                Text(formatQty(batches[i].qty), style: const TextStyle(fontWeight: FontWeight.w700)),
              ]),
            if (batches.isEmpty) const Text('No stock at this branch'),
          ]),
        ),
        actions: [
          TextButton(onPressed: () {
            Navigator.pop(c);
            context.go('/stock-card?id=${p.id}');
          }, child: const Text('Stock card')),
          if (can.contains('stock.adjust'))
            TextButton(onPressed: () async {
              Navigator.pop(c);
              await adjustDialog(context, ref, p);
            }, child: const Text('Count / adjust')),
          if (can.contains('inventory.edit'))
            TextButton(onPressed: () async {
              Navigator.pop(c);
              await inventoryEditor(context, ref, p);
            }, child: const Text('Edit stock')),
          if (can.contains('medicines.manage'))
            TextButton(onPressed: () async {
              Navigator.pop(c);
              await editMedicine(context, ref, p);
            }, child: const Text('Edit')),
          FilledButton(onPressed: () => Navigator.pop(c), child: const Text('Close')),
        ],
      ),
    );
  }
}

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/data/pharmacy_providers.dart';
import '../../../core/data/record_store.dart';
import '../../../core/entities/product.dart';
import '../../../core/presentation/widgets.dart';
import '../../../core/rules/dates.dart';
import '../../../core/rules/fefo.dart';
import '../../../core/rules/ids.dart';
import '../../../core/rules/money.dart';
import '../../../core/rules/search.dart';
import '../../../core/rules/stock.dart';
import '../../auth/application/session_controller.dart';
import '../domain/adjust.dart';

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
    return PageFrame(
      title: 'Inventory',
      subtitle: can.contains('reports') ? 'Stock value ${s.money(value.value)}${value.expired > 0 ? ' · expired ${s.money(value.expired)}' : ''}' : null,
      actions: [
        SearchField(onChanged: (v) => setState(() => _q = v), hint: 'Medicine, generic, barcode…'),
        if (can.contains('medicines.manage')) FilledButton.icon(onPressed: () => _edit(null), icon: const Icon(Icons.add), label: const Text('Add medicine')),
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
    final batches = d.stock.batchesOf(p.id);
    await showDialog<void>(
      context: context,
      builder: (c) => AlertDialog(
        title: Text(p.name),
        content: SizedBox(
          width: 460,
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('${[p.generic, p.form, p.unit].where((x) => x.isNotEmpty).join(' · ')}\nBarcode ${p.barcode.isEmpty ? '—' : p.barcode}'),
            Text('Price ${d.settings.money(p.price)} · wholesale ${d.settings.money(p.wholesale)}${can.contains('reports') ? ' · cost ${d.settings.money(p.cost)}' : ''}'),
            const Divider(),
            Text('Stock here: ${formatQty(d.stockOf(p.id))}', style: const TextStyle(fontWeight: FontWeight.w700)),
            for (final b in batches.where((b) => b.qty != 0))
              Text('Batch ${b.batch}${b.expiry.isEmpty ? '' : ' · expires ${b.expiry}'} · ${formatQty(b.qty)}'),
            if (batches.every((b) => b.qty == 0)) const Text('No stock recorded.'),
          ]),
        ),
        actions: [
          if (can.contains('stock.adjust'))
            TextButton(onPressed: () async {
              Navigator.pop(c);
              await _adjust(p, batches);
            }, child: const Text('Count / adjust')),
          if (can.contains('medicines.manage'))
            TextButton(onPressed: () async {
              Navigator.pop(c);
              await _edit(p);
            }, child: const Text('Edit')),
          FilledButton(onPressed: () => Navigator.pop(c), child: const Text('Close')),
        ],
      ),
    );
  }

  Future<void> _adjust(Product p, List<BatchStock> batches) async {
    final opts = [for (final b in batches) (b.id, '${b.batch}${b.expiry.isEmpty ? '' : ' (exp ${b.expiry})'} · ${formatQty(b.qty)}'), ('new', 'A new batch')];
    final v = await editRecord(context, title: 'Count / adjust ${p.name}', save: 'Save', initial: {
      'mode': 'count', 'batchId': batches.where((b) => b.qty > 0).firstOrNull?.id ?? (batches.isEmpty ? 'new' : batches.first.id),
    }, fields: [
      const FormFieldSpec('mode', 'What to do', kind: FieldKind.choice, required: true, options: [('count', 'Count: set to what is on the shelf'), ('add', 'Add'), ('remove', 'Remove')]),
      FormFieldSpec('batchId', 'Batch', kind: FieldKind.choice, required: true, options: opts),
      const FormFieldSpec('qty', 'Quantity (counted, added or removed)', kind: FieldKind.number, required: true),
      const FormFieldSpec('reason', 'Reason', required: true, hint: 'e.g. damaged, stock take, sample'),
      const FormFieldSpec('newBatch', 'New batch number (only for a new batch)'),
      const FormFieldSpec('newExpiry', 'New batch expiry (only for a new batch)', kind: FieldKind.date),
    ]);
    if (v == null || !mounted) return;
    final mode = AdjustMode.values.byName(v['mode'] as String);
    final qty = (v['qty'] as num).toDouble();
    try {
      final user = (await ref.read(sessionControllerProvider.future))?.userName ?? '';
      final diff = await adjustStock(ref.read(recordStoreProvider), product: p, batches: batches, mode: mode, batchId: v['batchId'] as String,
          counted: qty, qty: qty, reason: '${v['reason']}', user: user, branchId: (await ref.read(pharmacyProvider.future)).branch, newBatch: '${v['newBatch'] ?? ''}', newExpiry: '${v['newExpiry'] ?? ''}');
      if (mounted) say(context, diff == 0 ? 'No change' : 'Stock updated (${diff > 0 ? '+' : ''}${formatQty(diff)})');
    } on AdjustProblem catch (e) {
      if (mounted) say(context, e.message, error: true);
    }
  }

  Future<void> _edit(Product? p) async {
    final v = await editRecord(context, title: p == null ? 'Add medicine' : 'Edit ${p.name}', initial: p?.toRecord() ?? {'unit': 'Unit', 'form': 'Tablets'}, fields: const [
      FormFieldSpec('name', 'Name (brand)', required: true),
      FormFieldSpec('generic', 'Generic name'),
      FormFieldSpec('form', 'Form (Tablets, Syrups…)'),
      FormFieldSpec('unit', 'Unit (Tablet, Bottle…)'),
      FormFieldSpec('barcode', 'Barcode'),
      FormFieldSpec('price', 'Retail price', kind: FieldKind.number, required: true),
      FormFieldSpec('wholesale', 'Wholesale price', kind: FieldKind.number),
      FormFieldSpec('cost', 'Cost', kind: FieldKind.number),
      FormFieldSpec('reorder', 'Reorder level', kind: FieldKind.number),
      FormFieldSpec('rx', 'Prescription only (Rx)', kind: FieldKind.flag),
      FormFieldSpec('controlled', 'Controlled drug', kind: FieldKind.flag),
    ]);
    if (v == null || !mounted) return;
    final d = await ref.read(pharmacyProvider.future);
    final name = '${v['name']}'.trim();
    if (d.products.any((x) => x.id != p?.id && x.name.trim().toLowerCase() == name.toLowerCase())) {
      if (mounted) say(context, '"$name" is already in your medicine list', error: true);
      return;
    }
    final code = '${v['barcode'] ?? ''}'.trim();
    if (code.isNotEmpty && d.products.any((x) => x.id != p?.id && x.barcode == code)) {
      if (mounted) say(context, 'Another medicine already has the barcode $code', error: true);
      return;
    }
    final user = (await ref.read(sessionControllerProvider.future))?.userName ?? '';
    await ref.read(recordStoreProvider).update((x) {
      final rec = p == null ? {...v, 'id': uid(), 'name': name} : Product.fromRecord({...p.toRecord(), ...v, 'name': name}).copyWith(raw: {...p.raw, ...v}).toRecord();
      x.put('products', rec);
      x.audit(user, p == null ? 'Medicine added' : 'Medicine edited', name);
    });
    if (mounted) say(context, p == null ? '$name added' : '$name saved');
  }
}

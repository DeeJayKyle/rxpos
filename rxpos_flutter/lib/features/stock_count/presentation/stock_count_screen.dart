import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/data/pharmacy_providers.dart';
import '../../../core/data/record_store.dart';
import '../../../core/presentation/widgets.dart';
import '../../../core/rules/money.dart';
import '../../../core/rules/stock.dart';
import '../../auth/application/session_controller.dart';
import '../../sales_pos/presentation/checkout_dialogs.dart';
import '../domain/stock_count.dart';

/// Stock take: start a count (all medicines in stock, or low ones), count each medicine per batch, review the
/// differences and post them so stock matches the shelf.
class StockCountScreen extends ConsumerStatefulWidget {
  const StockCountScreen({super.key});
  @override
  ConsumerState<StockCountScreen> createState() => _StockCountScreenState();
}

class _StockCountScreenState extends ConsumerState<StockCountScreen> {
  @override
  Widget build(BuildContext context) {
    final counts = ref.watch(tableProvider('stockCounts')).value;
    final items = ref.watch(tableProvider('countItems')).value ?? const [];
    final d = ref.watch(pharmacyProvider).value;
    final can = ref.watch(permissionsProvider).value ?? const <String>{};
    if (counts == null || d == null) return const Center(child: CircularProgressIndicator());
    final open = counts.where((c) => c['status'] == 'open').firstOrNull;
    if (open == null) {
      final past = [...counts]..sort((a, b) => '${b['date']}'.compareTo('${a['date']}'));
      return PageFrame(
        title: 'Stock take',
        actions: [FilledButton.icon(onPressed: () => _start(d), icon: const Icon(Icons.playlist_add_check), label: const Text('Start a count'))],
        child: past.isEmpty
            ? const EmptyState('No stock counts yet')
            : ListView(children: [
                for (final c in past)
                  ListTile(title: Text('${c['name']} · ${c['status']}'), subtitle: Text('${'${c['date']}'.split('T').first} · ${(c['productIds'] as List?)?.length ?? 0} medicines · by ${c['startedBy']}')),
              ]),
      );
    }
    final scope = ((open['productIds'] as List?) ?? const []).cast<String>();
    final counted = {
      for (final i in items.where((i) => i['countId'] == open['id']))
        '${i['productId']}': [for (final l in ((i['lines'] as List?) ?? const []).cast<Map>()) CountLine.fromJson(l.cast<String, Object?>())],
    };
    return PageFrame(
      title: '${open['name']}',
      subtitle: '${counted.length} of ${scope.length} counted${open['blind'] == true ? ' · blind count' : ''}',
      actions: [
        if (can.contains('stock.adjust')) FilledButton.icon(onPressed: () => _review(open, counted, scope, d), icon: const Icon(Icons.fact_check_outlined), label: const Text('Review & post')),
        OutlinedButton(onPressed: () async {
          if (!await confirm(context, 'Cancel this count?', 'Nothing will change in stock.', 'Cancel count')) return;
          await ref.read(recordStoreProvider).update((x) => x.put('stockCounts', {...open, 'status': 'cancelled'}));
        }, child: const Text('Cancel count')),
      ],
      child: ListView.separated(
        itemCount: scope.length,
        separatorBuilder: (_, _) => const Divider(height: 1),
        itemBuilder: (_, i) {
          final p = d.byId[scope[i]];
          if (p == null) return const SizedBox.shrink();
          final lines = counted[p.id];
          return ListTile(
            title: Text(p.name),
            subtitle: Text(lines == null ? 'not counted yet' : 'counted ${formatQty(lines.fold<double>(0, (a, l) => a + l.qty))}'),
            trailing: open['blind'] == true ? null : Text('system ${formatQty(d.stockOf(p.id))}'),
            leading: Icon(lines == null ? Icons.radio_button_unchecked : Icons.check_circle, color: lines == null ? null : Colors.green),
            onTap: () => _count(open, p.id, d),
          );
        },
      ),
    );
  }

  Future<void> _start(PharmacyData d) async {
    final v = await editRecord(context, title: 'Start a stock count', save: 'Start', initial: {'scope': 'instock'}, fields: const [
      FormFieldSpec('name', 'Name (e.g. Shelf A, end of month)'),
      FormFieldSpec('scope', 'What to count', kind: FieldKind.choice, options: [('instock', 'Every medicine in stock'), ('low', 'Low stock only')]),
      FormFieldSpec('blind', 'Blind count (counters do not see the system quantity)', kind: FieldKind.flag),
    ]);
    if (v == null) return;
    final list = d.products.where((p) => v['scope'] == 'low' ? isLowStock(p, d.stockOf(p.id)) : d.stockOf(p.id) > 0).map((p) => p.id).toList();
    final user = (await ref.read(sessionControllerProvider.future))?.userName ?? '';
    await startCount(ref.read(recordStoreProvider), name: '${v['name'] ?? ''}', productIds: list, user: user, blind: v['blind'] == true,
        scopeLabel: v['scope'] == 'low' ? 'Low stock' : 'In stock');
  }

  Future<void> _count(Map<String, Object?> count, String productId, PharmacyData d) async {
    final p = d.byId[productId]!;
    final batches = d.stock.batchesOf(productId);
    final v = await editRecord(context, title: 'Count ${p.name}', save: 'Save count', fields: [
      for (final b in batches) FormFieldSpec(b.id, 'Batch ${b.batch}${b.expiry.isEmpty ? '' : ' (exp ${b.expiry})'}', kind: FieldKind.number),
      const FormFieldSpec('_newBatch', 'A batch found on the shelf (number)'),
      const FormFieldSpec('_newExpiry', 'Its expiry', kind: FieldKind.date),
      const FormFieldSpec('_newQty', 'How many of it', kind: FieldKind.number),
    ]);
    if (v == null) return;
    final lines = [
      for (final b in batches) CountLine(batchId: b.id, batch: b.batch, expiry: b.expiry, qty: ((v[b.id] as num?) ?? 0).toDouble()),
      if ('${v['_newBatch'] ?? ''}'.trim().isNotEmpty && ((v['_newQty'] as num?) ?? 0) > 0)
        CountLine(batch: '${v['_newBatch']}'.trim(), expiry: '${v['_newExpiry'] ?? ''}', qty: (v['_newQty'] as num).toDouble()),
    ];
    final by = (await ref.read(sessionControllerProvider.future))?.userName ?? '';
    await saveCountItem(ref.read(recordStoreProvider), countId: count['id'] as String, product: p, lines: lines, by: by);
  }

  Future<void> _review(Map<String, Object?> count, Map<String, List<CountLine>> counted, List<String> scope, PharmacyData d) async {
    final r = countDifferences(d.byId, counted, scope, d.stock.batchesOf);
    final st = d.settings;
    var zero = false;
    final go = await showDialog<bool>(
      context: context,
      builder: (c) => StatefulBuilder(
        builder: (c, set) => AlertDialog(
          title: const Text('Differences to post'),
          content: SizedBox(
            width: 480,
            child: ListView(shrinkWrap: true, children: [
              if (r.diffs.isEmpty) const Text('Everything counted matches.'),
              for (final x in r.diffs)
                ListTile(dense: true, title: Text('${x.product.name} · ${x.batch}${x.found ? ' (found)' : ''}'),
                    subtitle: Text('system ${formatQty(x.system)} → counted ${formatQty(x.counted)}'),
                    trailing: Text('${x.diff > 0 ? '+' : ''}${formatQty(x.diff)} · ${st.money(x.value)}')),
              if (r.uncounted.isNotEmpty)
                CheckboxListTile(value: zero, onChanged: (v) => set(() => zero = v ?? false),
                    title: Text('Set the ${r.uncounted.length} uncounted batches to 0'), subtitle: const Text('Only if they are really not on the shelf')),
            ]),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Back')),
            FilledButton(onPressed: () => Navigator.pop(c, true), child: const Text('Post')),
          ],
        ),
      ),
    );
    if (go != true) return;
    final user = (await ref.read(sessionControllerProvider.future))?.userName ?? '';
    await postCount(ref.read(recordStoreProvider), count: count, diffs: r.diffs, zero: zero ? r.uncounted : const [], user: user);
    if (mounted) say(context, 'Stock count posted: stock now matches what was counted');
  }
}

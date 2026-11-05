import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/data/pharmacy_providers.dart';
import '../../../core/data/record_store.dart';
import '../../../core/presentation/widgets.dart';
import '../../../core/rules/ids.dart';
import '../../../core/rules/money.dart';
import '../../../core/rules/search.dart';
import '../../auth/application/session_controller.dart';
import '../domain/transfers.dart';

/// Branches & transfers: the pharmacy's branches; send stock to another branch; receive what was sent here.
class BranchesScreen extends ConsumerWidget {
  const BranchesScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final branches = ref.watch(tableProvider('branches')).value;
    final transfers = ref.watch(tableProvider('transfers')).value ?? const [];
    final d = ref.watch(pharmacyProvider).value;
    if (branches == null || d == null) return const Center(child: CircularProgressIndicator());
    String nameOf(Object? id) => '${branches.where((b) => b['id'] == id).firstOrNull?['name'] ?? id}';
    Future<String> by() async => (await ref.read(sessionControllerProvider.future))?.userName ?? '';
    final incoming = transfers.where((t) => t['toId'] == d.branch && t['status'] == 'In transit').toList();
    final list = [...transfers]..sort((a, b) => '${b['date']}'.compareTo('${a['date']}'));
    return PageFrame(
      title: 'Branches & transfers',
      subtitle: 'This device works as ${nameOf(d.branch)}',
      actions: [
        OutlinedButton.icon(onPressed: () async {
          final v = await editRecord(context, title: 'New branch', fields: const [FormFieldSpec('name', 'Name', required: true), FormFieldSpec('address', 'Address'), FormFieldSpec('phone', 'Phone')]);
          if (v != null) await ref.read(recordStoreProvider).update((x) => x.put('branches', {...v, 'id': uid()}));
        }, icon: const Icon(Icons.add_business_outlined), label: const Text('Add branch')),
        if (branches.length > 1) FilledButton.icon(onPressed: () => _send(context, ref, d, branches, by), icon: const Icon(Icons.send_outlined), label: const Text('Send stock')),
      ],
      scroll: true,
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        for (final b in branches) ListTile(dense: true, leading: Icon(b['id'] == d.branch ? Icons.radio_button_checked : Icons.store_outlined), title: Text('${b['name']}'), subtitle: Text('${b['address'] ?? ''}')),
        if (incoming.isNotEmpty) ...[
          const Divider(),
          Text('Arriving here', style: Theme.of(context).textTheme.titleMedium),
          for (final t in incoming)
            ListTile(title: Text('${t['number']} from ${nameOf(t['fromId'])}'), subtitle: Text('${((t['items'] as List?) ?? const []).length} lines · sent by ${t['sentBy']}'),
                trailing: FilledButton(onPressed: () async {
                  final items = ((t['items'] as List?) ?? const []).cast<Map>();
                  final v = await editRecord(context, title: 'Receive ${t['number']}', save: 'Receive', initial: {for (var n = 0; n < items.length; n++) '$n': items[n]['qty']},
                      fields: [for (var n = 0; n < items.length; n++) FormFieldSpec('$n', '${items[n]['name']} (sent ${formatQty((items[n]['qty'] as num?) ?? 0)})', kind: FieldKind.number)]);
                  if (v == null) return;
                  await receiveTransfer(ref.read(recordStoreProvider), t, received: {for (final e in v.entries) int.parse(e.key): ((e.value as num?) ?? 0).toDouble()},
                      fromName: nameOf(t['fromId']), by: await by());
                }, child: const Text('Receive'))),
        ],
        const Divider(),
        Text('Transfers', style: Theme.of(context).textTheme.titleMedium),
        if (list.isEmpty) const Text('No transfers yet.'),
        for (final t in list) ListTile(dense: true, title: Text('${t['number']} · ${nameOf(t['fromId'])} → ${nameOf(t['toId'])}'), subtitle: Text('${'${t['date']}'.split('T').first} · ${t['status']}')),
      ]),
    );
  }

  Future<void> _send(BuildContext context, WidgetRef ref, PharmacyData d, List<Map<String, Object?>> branches, Future<String> Function() by) async {
    final others = branches.where((b) => b['id'] != d.branch).toList();
    var to = '${others.first['id']}';
    final lines = <String, double>{};
    var q = '';
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => StatefulBuilder(builder: (c, set) {
        final found = searchProducts(d.products.where((p) => d.stockOf(p.id) > 0).toList(), q, stockOf: (p) => d.stockOf(p.id)).take(20);
        return AlertDialog(
          title: const Text('Send stock to another branch'),
          content: SizedBox(
            width: 460, height: 460,
            child: Column(children: [
              DropdownButtonFormField<String>(initialValue: to, decoration: const InputDecoration(labelText: 'To'),
                  items: [for (final b in others) DropdownMenuItem(value: '${b['id']}', child: Text('${b['name']}'))], onChanged: (v) => to = v!),
              TextField(decoration: const InputDecoration(prefixIcon: Icon(Icons.search), hintText: 'Medicine…'), onChanged: (v) => set(() => q = v)),
              Expanded(child: ListView(children: [
                for (final p in found)
                  ListTile(dense: true, title: Text(p.name), subtitle: Text('${formatQty(d.stockOf(p.id))} in stock'),
                      trailing: SizedBox(width: 80, child: TextFormField(initialValue: lines[p.id] == null ? '' : formatQty(lines[p.id]!), keyboardType: TextInputType.number,
                          decoration: const InputDecoration(hintText: 'qty', isDense: true), onChanged: (v) => lines[p.id] = double.tryParse(v) ?? 0))),
              ])),
            ]),
          ),
          actions: [TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Cancel')), FilledButton(onPressed: () => Navigator.pop(c, true), child: const Text('Send'))],
        );
      }),
    );
    if (ok != true) return;
    try {
      final t = await sendTransfer(ref.read(recordStoreProvider), fromId: d.branch, toId: to, toName: '${others.firstWhere((b) => b['id'] == to)['name']}', by: await by(),
          lines: [for (final e in lines.entries) if (e.value > 0) (productId: e.key, name: d.byId[e.key]!.name, qty: e.value, stock: d.stockOf(e.key), batches: d.stock.batchesOf(e.key))]);
      if (context.mounted) say(context, '${t['number']} sent');
    } on TransferProblem catch (e) {
      if (context.mounted) say(context, e.message, error: true);
    }
  }
}

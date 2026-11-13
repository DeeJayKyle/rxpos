import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/data/device_settings.dart';
import '../../../core/data/pharmacy_providers.dart';
import '../../../core/entities/batch.dart';
import '../../../core/entities/sale.dart';
import '../../../core/data/record_store.dart';
import '../../../core/presentation/widgets.dart';
import '../../../core/rules/dates.dart';
import '../../../core/rules/money.dart';
import '../../../core/rules/stock.dart';
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
    final batches = (ref.watch(tableProvider('batches')).value ?? const []).map(Batch.fromRecord).toList();
    final sales = (ref.watch(tableProvider('sales')).value ?? const []).map(Sale.fromRecord).where((x) => x.status != 'refunded').toList();
    final st = d.settings;
    final month = today().substring(0, 7);
    final stats = [
      for (final b in branches)
        () {
          final id = '${b['id']}';
          final view = StockView(products: d.products, batches: batches, index: d.stock.index, branch: id);
          final stocked = d.products.where((p) => view.stockOf(p.id) > 0);
          final value = stockValue(stocked, view.batchesOf);
          final low = d.products.where((p) => !p.isCatalog && view.stockOf(p.id) <= p.reorder).length;
          final here = sales.where((x) => (x.branchId.isEmpty ? mainBranch : x.branchId) == id);
          final todays = here.where((x) => dayOf(x.date) == today());
          return (b: b, value: value.value, expired: value.expired, low: low, today: todays.fold<double>(0, (a, x) => a + x.total), todayN: todays.length,
            month: here.where((x) => dayOf(x.date).startsWith(month)).fold<double>(0, (a, x) => a + x.total));
        }(),
    ];
    return PageFrame(
      title: 'Branches & transfers',
      subtitle: 'All branches at a glance · this device works as ${nameOf(d.branch)}',
      actions: [
        if (branches.length > 1) FilledButton.icon(onPressed: () => _send(context, ref, d, branches, by), icon: const Icon(Icons.send_outlined), label: const Text('Send stock')),
      ],
      scroll: true,
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        StatGrid(children: [
          StatCard(label: 'Sales today – all branches', value: st.money(stats.fold<double>(0, (a, x) => a + x.today))),
          StatCard(label: 'Sales this month', value: st.money(stats.fold<double>(0, (a, x) => a + x.month)), color: Colors.deepPurple),
          StatCard(label: 'Stock value – all branches', value: st.money(stats.fold<double>(0, (a, x) => a + x.value)),
              sub: 'at cost · expired ${st.money(stats.fold<double>(0, (a, x) => a + x.expired))} not included'),
        ]),
        const SizedBox(height: 12),
        Wrap(spacing: 12, runSpacing: 12, children: [
          for (final x in stats)
            SizedBox(
              width: 300,
              child: Card(
                shape: x.b['id'] == d.branch ? RoundedRectangleBorder(side: BorderSide(color: Theme.of(context).colorScheme.primary, width: 2), borderRadius: BorderRadius.circular(12)) : null,
                child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text('${x.b['name']}', style: Theme.of(context).textTheme.titleMedium),
                    if ('${x.b['address'] ?? ''}'.isNotEmpty) Text('${x.b['address']}', style: Theme.of(context).textTheme.bodySmall),
                    const SizedBox(height: 6),
                    Text('Today ${st.money(x.today)} · ${x.todayN} sales'),
                    Text('This month ${st.money(x.month)}'),
                    Text('Stock value ${st.money(x.value)}${x.expired > 0 ? ' + ${st.money(x.expired)} expired' : ''}'),
                    Text('Low / out of stock ${x.low}', style: TextStyle(color: x.low > 0 ? Colors.orange.shade800 : null)),
                    const SizedBox(height: 6),
                    if (x.b['id'] == d.branch)
                      const Chip(label: Text('This device'))
                    else
                      OutlinedButton(
                        onPressed: () async {
                          if (!await confirmAction(context, 'Switch this device to ${x.b['name']}?', 'Sales, stock and receipts on this device will be recorded for that branch.', 'Switch')) return;
                          await ref.read(deviceBranchProvider.notifier).set('${x.b['id']}');
                          if (context.mounted) say(context, 'This device now works as ${x.b['name']}');
                        },
                        child: const Text('Use on this device'),
                      ),
                  ]),
                ),
              ),
            ),
        ]),
        const SizedBox(height: 8),
        Text('To add, rename or remove a branch, contact your RxPOS provider.', style: Theme.of(context).textTheme.bodySmall),
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
        Text('Stock transfers', style: Theme.of(context).textTheme.titleMedium),
        if (list.isEmpty) const Text('No transfers yet.'),
        for (final t in list)
          ListTile(dense: true, title: Text('${t['number']} · ${nameOf(t['fromId'])} → ${nameOf(t['toId'])}${t['toId'] == d.branch ? ' (incoming)' : t['fromId'] == d.branch ? ' (outgoing)' : ''}'),
              subtitle: Text('${'${t['date']}'.split('T').first} · ${((t['items'] as List?) ?? const []).length} lines · sent by ${t['sentBy'] ?? ''}${t['receivedBy'] != null ? ' · received by ${t['receivedBy']}' : ''}'),
              trailing: Text('${t['status']}', style: TextStyle(color: t['status'] == 'In transit' ? Colors.orange.shade800 : t['status'] == 'Received' ? Colors.green.shade700 : Theme.of(context).colorScheme.error))),
      ]),
    );
  }

  Future<void> _send(BuildContext context, WidgetRef ref, PharmacyData d, List<Map<String, Object?>> branches, Future<String> Function() by) async {
    final others = branches.where((b) => b['id'] != d.branch).toList();
    var to = '${others.first['id']}';
    final lines = <String, double>{};
    var q = '';
    final ok = await showAppDialog<bool>(
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

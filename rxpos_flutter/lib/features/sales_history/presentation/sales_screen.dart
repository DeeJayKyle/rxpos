import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/data/pharmacy_providers.dart';
import '../../../core/data/record_store.dart';
import '../../../core/entities/sale.dart';
import '../../../core/entities/settings.dart';
import '../../../core/presentation/widgets.dart';
import '../../../core/rules/dates.dart';
import '../../../core/rules/money.dart';
import '../../auth/application/session_controller.dart';
import '../../sales_pos/presentation/checkout_dialogs.dart';
import '../../sales_pos/presentation/receipt.dart';
import '../domain/refund.dart';

/// Sales History: every sale (newest first), search by receipt / client / cashier / medicine, a date range; open a
/// sale to see, print or send its receipt, or refund it.
class SalesScreen extends ConsumerStatefulWidget {
  const SalesScreen({super.key});
  @override
  ConsumerState<SalesScreen> createState() => _SalesScreenState();
}

class _SalesScreenState extends ConsumerState<SalesScreen> {
  String _q = '', _from = '', _to = '';

  @override
  Widget build(BuildContext context) {
    final rows = ref.watch(tableProvider('sales')).value;
    final settings = ref.watch(settingsProvider).value ?? const PharmacySettings();
    if (rows == null) return const Center(child: CircularProgressIndicator());
    final q = _q.trim().toLowerCase();
    final sales = rows.map(Sale.fromRecord).where((s) {
      final d = dayOf(s.date);
      if (_from.isNotEmpty && d.compareTo(_from) < 0) return false;
      if (_to.isNotEmpty && d.compareTo(_to) > 0) return false;
      if (q.isEmpty) return true;
      return [s.number, s.customerName, s.cashier, s.payment, ...s.items.map((i) => i.name)].any((x) => x.toLowerCase().contains(q));
    }).toList()
      ..sort((a, b) => b.date.compareTo(a.date));
    final valid = sales.where((s) => s.status != 'refunded');
    return PageFrame(
      title: 'Sales History',
      subtitle: '${valid.length} sales · ${settings.money(valid.fold(0.0, (a, s) => a + s.total))}',
      actions: [
        SearchField(onChanged: (v) => setState(() => _q = v), hint: 'Receipt, client, medicine…'),
        SizedBox(width: 130, child: TextField(decoration: const InputDecoration(labelText: 'From', hintText: 'YYYY-MM-DD', isDense: true), onChanged: (v) => setState(() => _from = v.trim()))),
        SizedBox(width: 130, child: TextField(decoration: const InputDecoration(labelText: 'To', hintText: 'YYYY-MM-DD', isDense: true), onChanged: (v) => setState(() => _to = v.trim()))),
      ],
      child: sales.isEmpty
          ? const EmptyState('No sales match')
          : ListView.separated(
              itemCount: sales.length,
              separatorBuilder: (_, _) => const Divider(height: 1),
              itemBuilder: (_, i) {
                final s = sales[i];
                final refunded = s.status == 'refunded';
                return ListTile(
                  title: Text('${s.number} · ${s.customerName}', style: TextStyle(decoration: refunded ? TextDecoration.lineThrough : null)),
                  subtitle: Text('${s.date.replaceFirst('T', ' ').split('.').first} · ${s.cashier} · ${s.payment} · ${s.items.length} item${s.items.length == 1 ? '' : 's'}${refunded ? ' · REFUNDED' : ''}${s.paid < s.total && !refunded ? ' · ${settings.money(s.total - s.paid)} on credit' : ''}'),
                  trailing: Text(settings.money(s.total), style: const TextStyle(fontWeight: FontWeight.w700)),
                  onTap: () => _open(s, settings),
                );
              },
            ),
    );
  }

  Future<void> _open(Sale s, PharmacySettings st) async {
    final can = ref.read(permissionsProvider).value ?? const <String>{};
    await showDialog<void>(
      context: context,
      builder: (c) => AlertDialog(
        title: Text('Receipt ${s.number}'),
        content: SizedBox(
          width: 420,
          child: SingleChildScrollView(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('${s.date.replaceFirst('T', ' ').split('.').first} · ${s.cashier}'),
            Text('Client: ${s.customerName} · ${s.type}'),
            const Divider(),
            for (final i in s.items)
              Row(children: [
                Expanded(child: Text('${i.name} × ${i.pack != null ? '${formatQty(i.pack!.count)} ${i.pack!.name}' : formatQty(i.qty)}')),
                Text(st.money(i.price * i.qty)),
              ]),
            const Divider(),
            if (s.discount > 0) Text('Discount −${st.money(s.discount)}'),
            if (s.tax > 0) Text('Tax ${st.money(s.tax)}'),
            Text('Total ${st.money(s.total)}', style: const TextStyle(fontWeight: FontWeight.w800)),
            Text('Paid ${st.money(s.paid)} by ${s.payment}'),
            if (s.status == 'refunded') Text('Refunded by ${s.raw['refundedBy'] ?? ''}', style: TextStyle(color: Theme.of(c).colorScheme.error)),
          ])),
        ),
        actions: [
          TextButton.icon(onPressed: () => showReceipt(c, s.toRecord(), st), icon: const Icon(Icons.print_outlined), label: const Text('Receipt')),
          if (can.contains('sales.refund') && s.status != 'refunded')
            TextButton.icon(
              style: TextButton.styleFrom(foregroundColor: Theme.of(c).colorScheme.error),
              onPressed: () async {
                if (!await confirm(c, 'Refund ${s.number}?', '${st.money(s.total)} will be refunded and the items returned to stock (same batches).', 'Refund')) return;
                final user = (await ref.read(sessionControllerProvider.future))?.userName ?? '';
                try {
                  await refundSale(ref.read(recordStoreProvider), s, user: user, settings: st);
                  if (c.mounted) Navigator.pop(c);
                  if (mounted) say(context, '${s.number} refunded and items returned to stock');
                } catch (e) {
                  if (mounted) say(context, '$e', error: true);
                }
              },
              icon: const Icon(Icons.undo),
              label: const Text('Refund'),
            ),
          FilledButton(onPressed: () => Navigator.pop(c), child: const Text('Close')),
        ],
      ),
    );
  }
}

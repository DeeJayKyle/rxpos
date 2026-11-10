import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/data/pharmacy_providers.dart';
import '../../../core/data/record_store.dart';
import '../../../core/rules/stock.dart';
import '../../auth/application/session_controller.dart';

/// What the cloud found when it re-checked a sale (worker/anomalies.js, as src/pages/Dashboard.jsx SaleChecks). Only
/// roles with the audit log receive these records; the sale itself was kept as it was sold. "Checked" keeps the
/// finding, marked, in the audit trail.
const saleCheckKinds = {
  'totals': 'Totals don’t add up',
  'discount': 'Discount without permission',
  'price': 'Sold below price',
  'paid': 'Paid more than the total',
  'invalid': 'Invalid amounts',
  'credit': 'Over credit limit',
  'late': 'Recorded after the day was closed',
  'closed-refund': 'Refund from a closed day',
};

class SaleChecksCard extends ConsumerWidget {
  const SaleChecksCard({super.key, required this.branch, required this.money});
  final String branch;
  final String Function(num) money;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final rows = ref.watch(tableProvider('anomalies')).value ?? const [];
    final open = rows.where((a) => a['reviewed'] != true).toList()
      ..sort((a, b) => '${b['saleDate'] ?? ''}'.compareTo('${a['saleDate'] ?? ''}'));
    if (open.isEmpty) return const SizedBox.shrink();
    final here = open.where((a) => '${a['branchId'] ?? ''}'.isEmpty ? branch == mainBranch : a['branchId'] == branch).toList();
    final list = (here.isNotEmpty ? here : open).take(8).toList();
    final user = ref.watch(sessionControllerProvider).value?.userName ?? '';
    final theme = Theme.of(context);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Text('Sales to check', style: theme.textTheme.titleMedium),
            const SizedBox(width: 8),
            Chip(label: Text('${open.length}'), visualDensity: VisualDensity.compact),
          ]),
          Text('The cloud re-checks every sale. These were kept as sold; look at each one and mark it checked.', style: theme.textTheme.bodySmall),
          for (final a in list)
            ListTile(
              dense: true,
              contentPadding: EdgeInsets.zero,
              title: Text('${a['saleNumber'] ?? '—'} · ${saleCheckKinds[a['kind']] ?? a['kind']}', style: const TextStyle(fontWeight: FontWeight.w700)),
              subtitle: Text('${a['detail'] ?? ''}\n${'${a['saleDate'] ?? ''}'.replaceFirst('T', ' ').padRight(16).substring(0, 16).trim()} · ${a['cashier'] ?? a['pushedBy'] ?? ''}'),
              isThreeLine: true,
              trailing: Row(mainAxisSize: MainAxisSize.min, children: [
                if ((a['amount'] as num? ?? 0) > 0) Text(money(a['amount'] as num)),
                const SizedBox(width: 8),
                OutlinedButton(
                  onPressed: () => ref.read(recordStoreProvider).update((d) {
                    d.put('anomalies', {...a, 'reviewed': true, 'reviewedBy': user, 'reviewedAt': d.now});
                    d.audit(user, 'Sale check reviewed', '${a['saleNumber'] ?? ''}: ${saleCheckKinds[a['kind']] ?? a['kind']}',
                        '${a['branchId'] ?? ''}'.isEmpty ? branch : '${a['branchId']}');
                  }),
                  child: const Text('Checked'),
                ),
              ]),
            ),
          if (open.length > list.length) Text('${open.length - list.length} more after these.', style: theme.textTheme.bodySmall),
        ]),
      ),
    );
  }
}

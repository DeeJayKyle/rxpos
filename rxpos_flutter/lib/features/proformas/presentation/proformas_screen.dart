import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/data/pharmacy_providers.dart';
import '../../../core/data/record_store.dart';
import '../../../core/entities/settings.dart';
import '../../../core/presentation/widgets.dart';
import '../../sales_pos/application/sale_controller.dart';

/// Proformas (quotations) saved at the till: open ones can be sold (they open in the till) or cancelled.
class ProformasScreen extends ConsumerWidget {
  const ProformasScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final rows = ref.watch(tableProvider('proformas')).value;
    final st = ref.watch(settingsProvider).value ?? const PharmacySettings();
    if (rows == null) return const Center(child: CircularProgressIndicator());
    final list = [...rows]..sort((a, b) => '${b['date']}'.compareTo('${a['date']}'));
    return PageFrame(
      title: 'Proformas',
      subtitle: 'Save one from the till with "Proforma"',
      child: list.isEmpty
          ? const EmptyState('No proformas yet')
          : ListView.separated(
              itemCount: list.length,
              separatorBuilder: (_, _) => const Divider(height: 1),
              itemBuilder: (_, i) {
                final pf = list[i];
                final open = pf['status'] == 'Open';
                return ListTile(
                  title: Text('${pf['number']} · ${pf['customerName']} · ${pf['status']}'),
                  subtitle: Text('${'${pf['date']}'.split('T').first} · ${((pf['items'] as List?) ?? const []).length} items · by ${pf['createdBy']}'
                      '${pf['saleNumber'] == null ? '' : ' · sold as ${pf['saleNumber']}'}'),
                  trailing: Row(mainAxisSize: MainAxisSize.min, children: [
                    Text(st.money((pf['total'] as num?) ?? 0), style: const TextStyle(fontWeight: FontWeight.w700)),
                    if (open) ...[
                      TextButton(onPressed: () async {
                        final wholesale = pf['type'] == 'wholesale';
                        await ref.read(saleControllerProvider(wholesale).notifier).loadProforma(pf);
                        if (context.mounted) context.go(wholesale ? '/pos/wholesale' : '/pos');
                      }, child: const Text('Sell')),
                      IconButton(tooltip: 'Cancel', icon: const Icon(Icons.close), onPressed: () =>
                          ref.read(recordStoreProvider).update((d) => d.put('proformas', {...pf, 'status': 'Cancelled'}))),
                    ],
                  ]),
                );
              },
            ),
    );
  }
}

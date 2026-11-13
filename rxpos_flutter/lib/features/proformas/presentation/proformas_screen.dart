import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:printing/printing.dart';

import '../../../core/data/pharmacy_providers.dart';
import '../../../core/data/record_store.dart';
import '../../../core/entities/sale.dart';
import '../../../core/entities/settings.dart';
import '../../../core/presentation/widgets.dart';
import '../../../core/rules/money.dart';
import '../../sales_pos/application/sale_controller.dart';
import '../../sales_pos/presentation/receipt.dart';

/// Proformas (src/pages/Proformas.jsx): quotations saved at the till; search, view, print / PDF as a proforma
/// invoice, sell (opens the till with it), delete.
class ProformasScreen extends ConsumerStatefulWidget {
  const ProformasScreen({super.key});
  @override
  ConsumerState<ProformasScreen> createState() => _ProformasScreenState();
}

class _ProformasScreenState extends ConsumerState<ProformasScreen> {
  String _q = '';

  @override
  Widget build(BuildContext context) {
    final rows = ref.watch(tableProvider('proformas')).value;
    final st = ref.watch(settingsProvider).value ?? const PharmacySettings();
    if (rows == null) return const Center(child: CircularProgressIndicator());
    final q = _q.trim().toLowerCase();
    final list = rows.where((p) => q.isEmpty || '${p['number']} ${p['customerName']}'.toLowerCase().contains(q)).toList()..sort((a, b) => '${b['date']}'.compareTo('${a['date']}'));
    return PageFrame(
      title: 'Proformas',
      subtitle: 'Create a proforma from the POS with the "Proforma" button. Convert it to a sale when the customer pays.',
      actions: [SearchField(onChanged: (v) => setState(() => _q = v))],
      child: list.isEmpty
          ? EmptyState(rows.isEmpty ? 'No proformas yet. Build a sale at the POS and press Proforma to give a customer a quotation; sell it later in one tap.' : 'No proformas match')
          : ListView.separated(
              itemCount: list.length,
              separatorBuilder: (_, _) => const Divider(height: 1),
              itemBuilder: (_, i) {
                final pf = list[i];
                final converted = pf['status'] == 'Converted';
                return ListTile(
                  title: Text('${pf['number']} · ${pf['customerName']}'),
                  subtitle: Text('${'${pf['date']}'.split('T').first} · ${((pf['items'] as List?) ?? const []).length} items · ${pf['status']}'
                      '${pf['saleNumber'] == null ? '' : ' → ${pf['saleNumber']}'} · by ${pf['createdBy'] ?? ''}'),
                  trailing: Row(mainAxisSize: MainAxisSize.min, children: [
                    Text(st.money((pf['total'] as num?) ?? 0), style: const TextStyle(fontWeight: FontWeight.w700)),
                    TextButton(onPressed: () => _view(pf, st), child: const Text('View')),
                    if (!converted)
                      TextButton(onPressed: () async {
                        final wholesale = pf['type'] == 'wholesale';
                        await ref.read(saleControllerProvider(wholesale).notifier).loadProforma(pf);
                        if (context.mounted) context.go(wholesale ? '/pos/wholesale' : '/pos');
                      }, child: const Text('Sell')),
                    IconButton(tooltip: 'Delete', icon: const Icon(Icons.delete_outline), onPressed: () async {
                      if (!await confirmAction(context, 'Delete this proforma?', '${pf['number']} · ${pf['customerName']}', 'Delete')) return;
                      await ref.read(recordStoreProvider).update((d) => d.del('proformas', '${pf['id']}'));
                    }),
                  ]),
                  onTap: () => _view(pf, st),
                );
              },
            ),
    );
  }

  Future<void> _view(Map<String, Object?> pf, PharmacySettings st) {
    final s = Sale.fromRecord({...pf, 'proforma': true, 'cashier': pf['createdBy'] ?? '', 'paid': pf['total']});
    return showAppDialog<void>(
      context: context,
      builder: (c) => AlertDialog(
        title: Text('Proforma ${pf['number']}'),
        content: SizedBox(
          width: 420,
          child: SingleChildScrollView(child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('PROFORMA INVOICE', style: TextStyle(fontWeight: FontWeight.w800)),
            Text('${st.name} · ${'${pf['date']}'.split('T').first} · prepared by ${pf['createdBy'] ?? ''}'),
            Text('Customer: ${pf['customerName']}'),
            const Divider(),
            for (final i in s.items) Row(children: [Expanded(child: Text('${i.name} × ${formatQty(i.qty)}')), Text(st.money(i.qty * i.price))]),
            const Divider(),
            if (s.discount > 0) Text('Discount −${st.money(s.discount)}'),
            if (s.tax > 0) Text('Tax ${st.money(s.tax)}'),
            Text('Total ${st.money(s.total)}', style: const TextStyle(fontWeight: FontWeight.w800)),
            const Text('Prices valid for 7 days.'),
          ])),
        ),
        actions: [
          TextButton.icon(onPressed: () async => Printing.sharePdf(bytes: await receiptPdf(s, st), filename: '${pf['number']}.pdf'), icon: const Icon(Icons.picture_as_pdf_outlined), label: const Text('PDF')),
          FilledButton.icon(onPressed: () => Printing.layoutPdf(name: '${pf['number']}', onLayout: (_) => receiptPdf(s, st)), icon: const Icon(Icons.print), label: const Text('Print')),
        ],
      ),
    );
  }
}

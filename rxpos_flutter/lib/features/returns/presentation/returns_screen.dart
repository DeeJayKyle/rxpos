import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/data/pharmacy_providers.dart';
import '../../../core/data/record_store.dart';
import '../../../core/entities/product.dart';
import '../../../core/entities/settings.dart';
import '../../../core/presentation/widgets.dart';
import '../../../core/rules/dates.dart';
import '../../../core/rules/fefo.dart';
import '../../../core/rules/money.dart';
import '../../auth/application/session_controller.dart';
import '../domain/supplier_return.dart';

/// Returns to suppliers: what went back, to whom, and how it was settled.
class ReturnsScreen extends ConsumerWidget {
  const ReturnsScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final rows = ref.watch(tableProvider('supplierReturns')).value;
    final st = ref.watch(settingsProvider).value ?? const PharmacySettings();
    if (rows == null) return const Center(child: CircularProgressIndicator());
    final list = [...rows]..sort((a, b) => '${b['date']}'.compareTo('${a['date']}'));
    return PageFrame(
      title: 'Returns to suppliers',
      subtitle: 'Return a batch from Expiry or Inventory',
      child: list.isEmpty
          ? const EmptyState('No returns yet')
          : ListView(children: [
              for (final r in list)
                ListTile(
                  title: Text('${r['number']} · ${r['supplierName']}'),
                  subtitle: Text('${r['date']} · ${((r['items'] as List?) ?? const []).length} lines · ${r['settle'] == 'cash' ? 'refunded' : 'credit note'} · by ${r['by']}'),
                  trailing: Text(st.money((r['total'] as num?) ?? 0)),
                ),
            ]),
    );
  }
}

/// Return one batch to a supplier (from Expiry or Inventory).
Future<void> returnDialog(BuildContext context, WidgetRef ref, Product p, BatchStock b, String reason) async {
  final d = await ref.read(pharmacyProvider.future);
  if (!context.mounted) return;
  if (d.suppliers.isEmpty) return say(context, 'Add the supplier first (People → Suppliers)', error: true);
  final v = await editRecord(context, title: 'Return ${p.name} (batch ${b.batch})', save: 'Return', initial: {
    'qty': b.qty, 'credit': p.cost != 0 ? p.cost : b.cost, 'settle': 'credit', 'reason': reason, 'supplierId': d.suppliers.first.id,
  }, fields: [
    FormFieldSpec('supplierId', 'Supplier', kind: FieldKind.choice, required: true, options: [for (final s in d.suppliers) (s.id, s.name)]),
    FormFieldSpec('qty', 'Quantity (of ${formatQty(b.qty)})', kind: FieldKind.number, required: true),
    const FormFieldSpec('credit', 'Credit per unit', kind: FieldKind.number, required: true),
    const FormFieldSpec('settle', 'Settled as', kind: FieldKind.choice, options: [('credit', 'Credit note (less owed)'), ('cash', 'Refund')]),
    const FormFieldSpec('reason', 'Reason'),
    const FormFieldSpec('creditNote', 'Credit note no.'),
  ]);
  if (v == null || !context.mounted) return;
  final sup = d.suppliers.firstWhere((s) => s.id == v['supplierId']);
  final by = (await ref.read(sessionControllerProvider.future))?.userName ?? '';
  try {
    final rec = await returnToSupplier(ref.read(recordStoreProvider), supplierId: sup.id, supplierName: sup.name, settle: '${v['settle']}', by: by, date: today(),
        creditNote: '${v['creditNote'] ?? ''}',
        lines: [ReturnLine(productId: p.id, name: p.name, batch: b, qty: (v['qty'] as num).toDouble(), credit: (v['credit'] as num).toDouble(), reason: '${v['reason'] ?? reason}')]);
    if (context.mounted) say(context, 'Return ${rec['number']} saved: stock taken out, ${d.settings.money(rec['total'] as num)} ${v['settle'] == 'cash' ? 'refunded' : 'off what you owe ${sup.name}'}');
  } on ReturnProblem catch (e) {
    if (context.mounted) say(context, e.message, error: true);
  }
}

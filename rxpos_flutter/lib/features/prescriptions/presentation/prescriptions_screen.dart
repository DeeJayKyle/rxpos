import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/data/pharmacy_providers.dart';
import '../../../core/data/record_store.dart';
import '../../../core/presentation/widgets.dart';
import '../../../core/rules/dates.dart';
import '../../../core/rules/ids.dart';
import '../../auth/application/session_controller.dart';
import '../domain/prescriptions.dart';

/// Prescriptions & refills: record a prescription for a client, record refills, see when the next one is due.
class PrescriptionsScreen extends ConsumerWidget {
  const PrescriptionsScreen({super.key});

  static const _fields = [
    FormFieldSpec('date', 'Date', kind: FieldKind.date, required: true),
    FormFieldSpec('doctor', 'Prescriber'),
    FormFieldSpec('facility', 'Facility'),
    FormFieldSpec('diagnosis', 'Diagnosis'),
    FormFieldSpec('medicationsText', 'Medicines and directions (one per line)', kind: FieldKind.multiline),
    FormFieldSpec('refillsAllowed', 'Refills allowed', kind: FieldKind.number),
    FormFieldSpec('refillDays', 'Days between refills', kind: FieldKind.number),
    FormFieldSpec('status', 'Status', kind: FieldKind.choice, options: [('Pending', 'Pending'), ('Dispensed', 'Dispensed'), ('Completed', 'Completed'), ('Cancelled', 'Cancelled')]),
    FormFieldSpec('notes', 'Notes', kind: FieldKind.multiline),
  ];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final rows = ref.watch(tableProvider('prescriptions')).value;
    final customers = ref.watch(tableProvider('customers')).value ?? const [];
    if (rows == null) return const Center(child: CircularProgressIndicator());
    String nameOf(Object? id) => '${customers.where((c) => c['id'] == id).firstOrNull?['name'] ?? '—'}';
    final list = [...rows]..sort((a, b) => '${b['date']}'.compareTo('${a['date']}'));

    Future<void> edit(Map<String, Object?>? r) async {
      final meds = ((r?['medications'] as List?) ?? const []).map((m) => m is Map ? [m['name'], m['dose'], m['freq'], m['days']].where((x) => x != null && '$x'.isNotEmpty).join(' ') : '$m').join('\n');
      final v = await editRecord(context, title: r == null ? 'New prescription' : 'Edit prescription', initial: {
        ...?r, 'medicationsText': meds, 'date': r?['date'] ?? today(), 'status': r?['status'] ?? 'Pending', 'customerId': r?['customerId'],
      }, fields: [
        FormFieldSpec('customerId', 'Client', kind: FieldKind.choice, required: true, options: [for (final c in customers.where((c) => c['id'] != 'walk-in')) ('${c['id']}', '${c['name']}')]),
        ..._fields,
      ]);
      if (v == null) return;
      final medications = [for (final l in '${v.remove('medicationsText') ?? ''}'.split('\n').map((x) => x.trim()).where((x) => x.isNotEmpty)) {'name': l}];
      await ref.read(recordStoreProvider).update((d) => d.put('prescriptions', {...?r, ...v, 'medications': medications, 'id': r?['id'] ?? uid(),
        'refillsUsed': r?['refillsUsed'] ?? 0}));
    }

    return PageFrame(
      title: 'Prescriptions & refills',
      actions: [FilledButton.icon(onPressed: () => edit(null), icon: const Icon(Icons.add), label: const Text('Add prescription'))],
      child: list.isEmpty
          ? const EmptyState('No prescriptions yet')
          : ListView.separated(
              itemCount: list.length,
              separatorBuilder: (_, _) => const Divider(height: 1),
              itemBuilder: (_, i) {
                final r = list[i];
                final due = nextRefillDue(r);
                return ListTile(
                  title: Text('${nameOf(r['customerId'])} · ${r['status']}'),
                  subtitle: Text('${r['date']} · ${r['doctor'] ?? ''}${r['diagnosis'] == null || '${r['diagnosis']}'.isEmpty ? '' : ' · ${r['diagnosis']}'}'
                      ' · refills ${r['refillsUsed'] ?? 0}/${r['refillsAllowed'] ?? 0}${due == null ? '' : ' · next due $due'}'),
                  onTap: () => edit(r),
                  trailing: canRecordRefill(r)
                      ? TextButton(onPressed: () async {
                          final user = (await ref.read(sessionControllerProvider.future))?.userName ?? '';
                          try {
                            await recordRefill(ref.read(recordStoreProvider), r, user: user, patient: nameOf(r['customerId']));
                            if (context.mounted) say(context, 'Refill recorded. Dispense the medicines at the till as usual.');
                          } on RefillProblem catch (e) {
                            if (context.mounted) say(context, e.message, error: true);
                          }
                        }, child: const Text('Record refill'))
                      : null,
                );
              },
            ),
    );
  }
}

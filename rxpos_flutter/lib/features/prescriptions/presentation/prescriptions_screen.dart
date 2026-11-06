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
    FormFieldSpec('date', 'Date issued', kind: FieldKind.date),
    FormFieldSpec('doctor', 'Prescriber', required: true),
    FormFieldSpec('facility', 'Hospital / clinic'),
    FormFieldSpec('diagnosis', 'Diagnosis'),
    FormFieldSpec('status', 'Status', kind: FieldKind.choice, options: [('Pending', 'Pending'), ('Dispensed', 'Dispensed'), ('Completed', 'Completed'), ('Cancelled', 'Cancelled')]),
    FormFieldSpec('refillsAllowed', 'Refills allowed (0 = none)', kind: FieldKind.number),
    FormFieldSpec('refillDays', 'Refill every (days)', kind: FieldKind.number, hint: 'e.g. 30'),
    FormFieldSpec('medications', 'Medications, dose & directions', kind: FieldKind.multiline, required: true),
    FormFieldSpec('notes', 'Pharmacist notes / counselling', kind: FieldKind.multiline),
  ];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final rows = ref.watch(tableProvider('prescriptions')).value;
    final customers = ref.watch(tableProvider('customers')).value ?? const [];
    if (rows == null) return const Center(child: CircularProgressIndicator());
    String nameOf(Object? id) => '${customers.where((c) => c['id'] == id).firstOrNull?['name'] ?? '—'}';
    final list = [...rows]..sort((a, b) => '${b['date']}'.compareTo('${a['date']}'));

    Future<void> edit(Map<String, Object?>? r) async {
      final v = await editRecord(context, title: r == null ? 'New prescription' : 'Edit prescription', delete: r == null ? null : 'prescription', initial: {
        ...?r, 'medications': medicationsText(r?['medications']), 'date': r?['date'] ?? today(), 'status': r?['status'] ?? 'Pending', 'customerId': r?['customerId'],
        'refillsAllowed': r?['refillsAllowed'] ?? 0,
      }, fields: [
        FormFieldSpec('customerId', 'Patient', kind: FieldKind.choice, required: true,
            options: [for (final c in customers.where((c) => c['id'] != 'walk-in')) ('${c['id']}', '${c['name']}${'${c['phone'] ?? ''}'.isEmpty ? '' : ' · ${c['phone']}'}')]),
        ..._fields,
      ]);
      if (v == null) return;
      if (identical(v, deleteRecord) && r != null) {
        await ref.read(recordStoreProvider).update((d) => d.del('prescriptions', '${r['id']}'));
        if (context.mounted) say(context, 'Prescription deleted');
        return;
      }
      // as the React app keeps them: medications as one text
      await ref.read(recordStoreProvider).update((d) => d.put('prescriptions', {...?r, ...v, 'id': r?['id'] ?? uid(), 'refillsUsed': r?['refillsUsed'] ?? 0}));
    }

    return PageFrame(
      title: 'Prescriptions & Refills',
      subtitle: 'Record prescriptions, dispense them and track refills. Due refills appear in Reminders.',
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
                      ' · refills ${r['refillsUsed'] ?? 0}/${r['refillsAllowed'] ?? 0}${due == null ? '' : ' · next due $due'}\n${medicationsText(r['medications'])}', maxLines: 3, overflow: TextOverflow.ellipsis),
                  onTap: () => edit(r),
                  trailing: r['status'] == 'Pending'
                      ? FilledButton.tonal(onPressed: () => ref.read(recordStoreProvider).update((d) => d.put('prescriptions', {...r, 'status': 'Dispensed', 'dispensedOn': today()})),
                          child: const Text('Dispense'))
                      : r['status'] == 'Dispensed' && canRecordRefill(r)
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

/// The medications as text (the React app's field); older Flutter records kept a list.
String medicationsText(Object? m) => m is List
    ? m.map((x) => x is Map ? [x['name'], x['dose'], x['freq'], x['days']].where((y) => y != null && '$y'.isNotEmpty).join(' ') : '$x').join('\n')
    : '${m ?? ''}';

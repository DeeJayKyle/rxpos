import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/data/pharmacy_providers.dart';
import '../../../core/data/record_store.dart';
import '../../../core/entities/sale.dart';
import '../../../core/entities/settings.dart';
import '../../../core/entities/shift.dart';
import '../../../core/presentation/widgets.dart';
import '../../auth/application/session_controller.dart';
import '../domain/shifts.dart';

/// Shifts & cash-up: open a shift with a float, see it live, close it by counting the drawer; past shifts.
class ShiftsScreen extends ConsumerWidget {
  const ShiftsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final rows = ref.watch(tableProvider('shifts')).value;
    final sales = (ref.watch(tableProvider('sales')).value ?? const []).map(Sale.fromRecord).toList();
    final st = ref.watch(settingsProvider).value ?? const PharmacySettings();
    final session = ref.watch(sessionControllerProvider).value;
    final can = ref.watch(permissionsProvider).value ?? const <String>{};
    if (rows == null || session == null) return const Center(child: CircularProgressIndicator());
    final shifts = rows.map(Shift.fromRecord).where((s) => can.contains('shifts.all') || s.userId == session.userId).toList()
      ..sort((a, b) => b.openedAt.compareTo(a.openedAt));
    final open = shifts.where((s) => s.userId == session.userId && s.isOpen).firstOrNull;
    final live = open == null ? null : shiftSummary(open, sales);
    return PageFrame(
      title: 'Shifts & cash-up',
      actions: [
        if (open == null)
          FilledButton.icon(onPressed: () async {
            final v = await editRecord(context, title: 'Open a shift', save: 'Open shift', fields: const [FormFieldSpec('float', 'Float in the drawer', kind: FieldKind.number, required: true)]);
            if (v == null) return;
            await openShift(ref.read(recordStoreProvider), userId: session.userId, user: session.userName, float: (v['float'] as num).toDouble());
          }, icon: const Icon(Icons.play_arrow), label: const Text('Open shift'))
        else
          FilledButton.icon(onPressed: () => _close(context, ref, open, sales, st), icon: const Icon(Icons.lock_outline), label: const Text('Close shift')),
      ],
      scroll: true,
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        if (live != null) ...[
          Wrap(spacing: 12, runSpacing: 12, children: [
            StatCard(label: 'Sales this shift', value: st.money(live.total), sub: '${live.count} sales'),
            StatCard(label: 'Expected cash', value: st.money(live.expectedCash), sub: 'float ${st.money(open!.float)} + cash − refunds'),
            StatCard(label: 'On credit', value: st.money(live.credit)),
            for (final e in live.byMethod.entries) StatCard(label: e.key, value: st.money(e.value)),
          ]),
          const SizedBox(height: 16),
        ],
        Text('Shifts', style: Theme.of(context).textTheme.titleMedium),
        if (shifts.isEmpty) const Text('No shifts yet.'),
        for (final x in shifts)
          ListTile(
            title: Text('${x.user} · ${x.openedAt.replaceFirst('T', ' ').split('.').first}${x.isOpen ? ' · OPEN' : ''}'),
            subtitle: Text(x.isOpen ? 'Float ${st.money(x.float)}' : 'Counted ${st.money(x.counted)} · expected ${st.money(x.expected)}'),
            trailing: x.isOpen ? null : Text('${x.variance >= 0 ? '+' : ''}${st.money(x.variance)}',
                style: TextStyle(fontWeight: FontWeight.w700, color: x.variance.abs() < 1 ? Colors.green : x.variance < 0 ? Theme.of(context).colorScheme.error : Colors.orange.shade800)),
          ),
      ]),
    );
  }

  Future<void> _close(BuildContext context, WidgetRef ref, Shift open, List<Sale> sales, PharmacySettings st) async {
    final v = await editRecord(context, title: 'Count the drawer', save: 'Close shift', fields: [
      for (final n in notes) FormFieldSpec('$n', '${st.money(n)} notes / coins (how many)', kind: FieldKind.number),
      const FormFieldSpec('coins', 'Other coins (amount)', kind: FieldKind.number),
      const FormFieldSpec('note', 'Note'),
    ]);
    if (v == null) return;
    final rec = await closeShift(ref.read(recordStoreProvider), open, sales,
        counts: {for (final e in v.entries) if (e.value is num) e.key: e.value as num}, note: '${v['note'] ?? ''}');
    if (context.mounted) say(context, 'Shift closed: counted ${st.money(rec['counted'] as num)}, ${((rec['variance'] as num) >= 0) ? 'over' : 'short'} ${st.money((rec['variance'] as num).abs())}');
  }
}

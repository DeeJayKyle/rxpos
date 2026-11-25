import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/data/pharmacy_providers.dart';
import '../../../core/data/record_store.dart';
import '../../../core/entities/settings.dart';
import '../../../core/presentation/widgets.dart';
import '../../../core/rules/dates.dart';
import '../../../core/rules/day_close.dart';
import '../../auth/application/session_controller.dart';

/// Step 18 (core/rules/day_close.dart, as src/pages/Shifts.jsx DayClose): close a day for this branch. After that its
/// sales, expenses, payments and stock can't be changed or deleted from any device; a refund, or something recorded
/// late, is flagged in "Sales to check". The close keeps the day's totals. Reopening needs an administrator and a reason.
class DayCloseCard extends ConsumerWidget {
  const DayCloseCard({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final closes = ref.watch(tableProvider('dayCloses')).value ?? const [];
    final data = ref.watch(pharmacyProvider).value;
    final session = ref.watch(sessionControllerProvider).value;
    final st = ref.watch(settingsProvider).value ?? const PharmacySettings();
    if (data == null || session == null) return const SizedBox.shrink();
    final branch = data.branch;
    final byDay = {for (final c in closes) if (closeId(c['branchId'] as String?, '${c['day']}') == closeId(branch, '${c['day']}')) '${c['day']}': c};
    final now = DateTime.now();
    final days = [for (var i = 0; i < 7; i++) localDate(now.subtract(Duration(days: i)))];
    final admin = session.role == 'admin';
    final theme = Theme.of(context);

    Future<void> close(String day) async {
      final store = ref.read(recordStoreProvider);
      final snap = daySnapshot(await store.rows('sales'), await store.rows('expenses'), branch, day);
      if (!context.mounted) return;
      final n = snap['sales'] as int;
      final ok = await confirmAction(context, 'Close $day?',
          '$n sale${n == 1 ? '' : 's'}, ${st.money(snap['total'] as num)}. After closing, this day\'s sales, expenses, payments and stock '
              'can\'t be changed on any device. Anything recorded for it later is shown to the owner.',
          'Close the day');
      if (!ok) return;
      await store.update((d) {
        d.put('dayCloses', {'id': closeId(branch, day), 'branchId': branch, 'day': day, 'open': false, 'closedBy': session.userName, 'closedAt': d.now, 'snapshot': snap});
        d.audit(session.userName, 'Day closed', '$day: $n sales, ${st.money(snap['total'] as num)}', branch);
      });
    }

    Future<void> reopen(Map<String, Object?> c) async {
      final v = await editRecord(context, title: 'Reopen ${c['day']}?', save: 'Reopen',
          fields: const [FormFieldSpec('reason', 'Why reopen it? (written to the audit log)', required: true)]);
      final reason = '${v?['reason'] ?? ''}'.trim();
      if (reason.length < 3) return;
      await ref.read(recordStoreProvider).update((d) {
        d.put('dayCloses', {...c, 'open': true, 'reopenedBy': session.userName, 'reopenedAt': d.now, 'reason': reason});
        d.audit(session.userName, 'Day reopened', '${c['day']}: $reason', branch);
      });
    }

    return Card(
      key: const Key('day-close'),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('Close the day', style: theme.textTheme.titleMedium),
          Text('A closed day\'s sales, expenses, payments and stock can\'t be changed any more. Refunds and anything recorded late are shown in "Sales to check".',
              style: theme.textTheme.bodySmall),
          for (final day in days)
            Builder(builder: (_) {
              final c = byDay[day];
              final shut = c != null && c['open'] != true;
              final snap = (c?['snapshot'] as Map?)?.cast<String, Object?>();
              return ListTile(
                dense: true,
                contentPadding: EdgeInsets.zero,
                title: Text('$day${day == today() ? ' · today' : ''}', style: const TextStyle(fontWeight: FontWeight.w700)),
                subtitle: Text(shut
                    ? 'Closed by ${c['closedBy']} · ${'${c['closedAt'] ?? ''}'.padRight(16).substring(11, 16)}${snap == null ? '' : ' · ${snap['sales']} sales · ${st.money((snap['total'] as num?) ?? 0)}'}'
                    : c != null ? 'Reopened by ${c['reopenedBy']}: ${c['reason']}' : 'Open'),
                trailing: shut
                    ? (admin ? OutlinedButton.icon(onPressed: () => reopen(c), icon: const Icon(Icons.lock_open, size: 16), label: const Text('Reopen')) : const Icon(Icons.lock_outline))
                    : FilledButton.tonalIcon(onPressed: () => close(day), icon: const Icon(Icons.lock_outline, size: 16), label: const Text('Close')),
              );
            }),
        ]),
      ),
    );
  }
}

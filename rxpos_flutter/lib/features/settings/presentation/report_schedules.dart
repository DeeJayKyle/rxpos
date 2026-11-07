// Scheduled email reports (Settings → Alerts): each schedule emails an Excel workbook every evening at 9 pm (daily),
// on Sundays (the week) or on the last day of the month (the month), built by the cloud (worker/reports.js). A
// schedule can be previewed or sent at once. Only people who manage settings can change them (the cloud checks too).
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/data/pharmacy_providers.dart';
import '../../../core/data/record_store.dart';
import '../../../core/network/cloud_api.dart';
import '../../../core/presentation/widgets.dart';
import '../../../core/rules/ids.dart';
import '../../auth/application/session_controller.dart';

const reportSchedulesTable = 'reportSchedules';
const reportKinds = [('summary', 'Summary (sales, profit, expenses, net)'), ('sales', 'Every sale'), ('items', 'Sales by medicine'), ('expenses', 'Expenses'),
  ('stock', 'Expiring and low stock')];
const reportFrequencies = [('daily', 'Every evening (that day)'), ('weekly', 'Sundays (the last 7 days)'), ('monthly', 'Last day of the month (the month)')];

class ReportSchedulesCard extends ConsumerStatefulWidget {
  const ReportSchedulesCard({super.key});
  @override
  ConsumerState<ReportSchedulesCard> createState() => _ReportSchedulesCardState();
}

class _ReportSchedulesCardState extends ConsumerState<ReportSchedulesCard> {
  String? _busy;

  Future<void> _edit(Map<String, Object?>? s) async {
    final kinds = ((s?['reports'] as List?) ?? const ['summary', 'sales', 'items', 'expenses', 'stock']).map((e) => '$e').toSet();
    final v = await editRecord(context, title: s == null ? 'New report email' : 'Edit ${s['name']}', delete: s == null ? null : 'report email',
        initial: {...?s, if (s == null) 'frequency': 'weekly', 'active': s?['active'] ?? true, for (final (k, _) in reportKinds) 'r_$k': kinds.contains(k)},
        fields: [
          const FormFieldSpec('name', 'Name', required: true, hint: 'Weekly report'),
          const FormFieldSpec('emails', 'Email it to (separated by commas)', required: true, hint: 'owner@example.com, accountant@example.com'),
          FormFieldSpec('frequency', 'When', kind: FieldKind.choice, required: true, options: reportFrequencies),
          for (final (k, l) in reportKinds) FormFieldSpec('r_$k', l, kind: FieldKind.flag),
          const FormFieldSpec('active', 'Send it', kind: FieldKind.flag),
        ]);
    if (v == null) return;
    final by = (await ref.read(sessionControllerProvider.future))?.userName ?? '';
    final store = ref.read(recordStoreProvider);
    await store.update((d) {
      if (identical(v, deleteRecord) && s != null) {
        d.del(reportSchedulesTable, '${s['id']}');
        d.audit(by, 'Report email removed', '${s['name']}');
        return;
      }
      d.put(reportSchedulesTable, {
        'id': s?['id'] ?? uid(), 'name': '${v['name']}'.trim(), 'emails': '${v['emails']}'.trim(), 'frequency': v['frequency'] ?? 'weekly',
        'reports': [for (final (k, _) in reportKinds) if (v['r_$k'] == true) k], 'active': v['active'] != false,
      });
      d.audit(by, s == null ? 'Report email added' : 'Report email changed', '${v['name']}: ${v['frequency']} to ${v['emails']}');
    });
  }

  /// Preview (what would be sent) or send now; the schedule must have reached the cloud first.
  Future<void> _send(Map<String, Object?> s, bool send) async {
    setState(() => _busy = '${s['id']}');
    try {
      final api = ref.read(cloudApiProvider);
      final r = send ? await api.post('/api/reports/send', {'id': s['id']}) : await api.get('/api/reports/send?id=${Uri.encodeQueryComponent('${s['id']}')}');
      if (!mounted) return;
      final sheets = [for (final x in (r['sheets'] as List?) ?? const []) '${(x as Map)['name']} (${x['rows']})'].join(', ');
      final n = (r['sent'] as num?)?.toInt() ?? 0;
      say(context, send
          ? (n > 0 ? '${r['file']} emailed to $n address${n > 1 ? 'es' : ''}' : '${r['error'] ?? 'Not sent'}')
          : '${r['period']}: $sheets → ${(r['to'] as List?)?.join(', ') ?? ''}');
    } catch (e) {
      if (mounted) say(context, '$e'.replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _busy = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final rows = [...(ref.watch(tableProvider(reportSchedulesTable)).value ?? const <Map<String, Object?>>[])]
      ..sort((a, b) => '${a['name']}'.compareTo('${b['name']}'));
    final th = Theme.of(context);
    String when(Object? f) => reportFrequencies.where((x) => x.$1 == f).firstOrNull?.$2 ?? '$f';
    return Card(
      key: const Key('report-schedules'),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            const Icon(Icons.forward_to_inbox_outlined),
            const SizedBox(width: 8),
            Expanded(child: Text('Scheduled report emails (Excel)', style: th.textTheme.titleMedium)),
            FilledButton.tonalIcon(key: const Key('add-report-schedule'), onPressed: () => _edit(null), icon: const Icon(Icons.add), label: const Text('Add')),
          ]),
          const SizedBox(height: 4),
          Text('An Excel workbook by email, at 9 pm: every evening, every Sunday for the week, or on the last day of the month for the month.',
              style: th.textTheme.bodySmall),
          for (final s in rows)
            ListTile(
              contentPadding: EdgeInsets.zero,
              title: Text('${s['name']}${s['active'] == false ? ' (paused)' : ''}'),
              subtitle: Text('${when(s['frequency'])} → ${s['emails']}'),
              onTap: () => _edit(s),
              trailing: Wrap(spacing: 4, children: [
                TextButton(onPressed: _busy != null ? null : () => _send(s, false), child: const Text('Preview')),
                TextButton(onPressed: _busy != null ? null : () => _send(s, true), child: Text(_busy == s['id'] ? 'Sending…' : 'Send now')),
              ]),
            ),
        ]),
      ),
    );
  }
}

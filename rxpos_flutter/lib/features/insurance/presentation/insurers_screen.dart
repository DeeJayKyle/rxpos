import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/data/pharmacy_providers.dart';
import '../../../core/data/record_store.dart';
import '../../../core/entities/settings.dart';
import '../../../core/presentation/widgets.dart';
import '../../../core/rules/dates.dart';
import '../../../core/rules/ids.dart';
import '../../../core/rules/insurance.dart';
import '../../auth/application/session_controller.dart';
import '../../people/domain/balances.dart';

/// Insurers and their schemes (workplan step 22, src/pages/Insurers.jsx): what each scheme's patient pays at the till,
/// what each insurer owes for the sales billed to it, and its payments (kind 'insurer').
class InsurersScreen extends ConsumerStatefulWidget {
  const InsurersScreen({super.key});
  @override
  ConsumerState<InsurersScreen> createState() => _InsurersScreenState();
}

const _methods = ['Cash', 'Mobile Money', 'Bank Transfer', 'Cheque', 'Card'];

double _n(Object? v) => v is num ? v.toDouble() : double.tryParse('${v ?? ''}') ?? 0;

class _InsurersScreenState extends ConsumerState<InsurersScreen> {
  String _show = '';

  RecordStore get _store => ref.read(recordStoreProvider);

  String _describe(Map s, String Function(num) fmt) {
    final parts = [if (_n(s['copayPct']) > 0) '${_fmtNum(_n(s['copayPct']))}%', if (_n(s['copayFixed']) > 0) 'at least ${fmt(_n(s['copayFixed']))}'];
    return [parts.isEmpty ? 'no co-pay' : parts.join(', '), if (_n(s['limit']) > 0) 'cover up to ${fmt(_n(s['limit']))}'].join(' · ');
  }

  String _fmtNum(double v) => v == v.roundToDouble() ? '${v.toInt()}' : '$v';

  Future<void> _save(Map<String, Object?> rec, String action) async {
    final who = (await ref.read(sessionControllerProvider.future))?.userName ?? '';
    final branch = (await ref.read(pharmacyProvider.future)).branch;
    await _store.update((d) {
      d.put('insurers', rec);
      d.audit(who, action, '${rec['name']}: ${((rec['schemes'] as List?) ?? const []).map((s) => (s as Map)['name']).join(', ')}', branch);
    });
  }

  Future<void> _editInsurer(Map<String, Object?>? i) async {
    final v = await editRecord(context, title: i == null ? 'Add insurer' : 'Edit ${i['name']}', initial: i ?? const {}, fields: [
      const FormFieldSpec('name', 'Name', required: true, hint: 'e.g. Jubilee Health'),
      const FormFieldSpec('phone', 'Phone'),
      const FormFieldSpec('email', 'Email (for claims)'),
      if (i != null) const FormFieldSpec('archived', 'Archived (not offered at the till)', kind: FieldKind.flag),
    ]);
    if (v == null || !mounted) return;
    final rec = {...?i, ...v, 'id': i?['id'] ?? uid(), 'name': '${v['name']}'.trim(), 'schemes': i?['schemes'] ?? const []};
    await _save(rec, i == null ? 'Insurer added' : 'Insurer changed');
    if (i == null && mounted) await _editScheme(rec, null); // a new insurer needs a scheme to be billed
  }

  Future<void> _editScheme(Map<String, Object?> insurer, Map<String, Object?>? scheme) async {
    final v = await editRecord(context, title: scheme == null ? 'New scheme for ${insurer['name']}' : 'Scheme ${scheme['name']}',
        initial: scheme ?? const {'copayPct': 10, 'copayFixed': 0, 'limit': 0}, delete: scheme == null ? null : 'scheme', fields: const [
      FormFieldSpec('name', 'Scheme', required: true, hint: 'e.g. Gold'),
      FormFieldSpec('copayPct', 'Co-pay %', kind: FieldKind.number),
      FormFieldSpec('copayFixed', 'Fixed co-pay (the patient pays this if it is more)', kind: FieldKind.number),
      FormFieldSpec('limit', 'Cover limit per sale (0 = no limit)', kind: FieldKind.number),
    ]);
    if (v == null || !mounted) return;
    final schemes = [for (final s in (insurer['schemes'] as List? ?? const [])) (s as Map).cast<String, Object?>()];
    if (identical(v, deleteRecord)) {
      schemes.removeWhere((s) => s['id'] == scheme!['id']);
    } else {
      final pct = _n(v['copayPct']);
      if (pct < 0 || pct > 100) return say(context, 'A co-pay is between 0 and 100%', error: true);
      final s = {'id': scheme?['id'] ?? uid(), 'name': '${v['name']}'.trim(), 'copayPct': _numOut(pct), 'copayFixed': _numOut(_n(v['copayFixed'])), 'limit': _numOut(_n(v['limit']))};
      final at = schemes.indexWhere((x) => x['id'] == s['id']);
      at < 0 ? schemes.add(s) : schemes[at] = s;
    }
    await _save({...insurer, 'schemes': schemes}, 'Insurer changed');
  }

  Object _numOut(double v) => v == v.roundToDouble() ? v.toInt() : v;

  Future<void> _receive(Map<String, Object?> i, double owed, List<Map<String, Object?>> banks, PharmacySettings st) async {
    final v = await editRecord(context, title: 'Payment from ${i['name']} (owes ${st.money(owed)})', save: 'Record payment',
        initial: {'date': today(), 'amount': owed, 'method': 'Cash', 'bankId': 'cash-drawer'}, fields: [
      const FormFieldSpec('date', 'Date', kind: FieldKind.date, required: true),
      const FormFieldSpec('amount', 'Amount', kind: FieldKind.number, required: true),
      FormFieldSpec('method', 'Method', kind: FieldKind.choice, options: [for (final m in _methods) (m, m)]),
      FormFieldSpec('bankId', 'Received into', kind: FieldKind.choice, options: [for (final b in banks) ('${b['id']}', '${b['name']}')]),
      const FormFieldSpec('note', 'Note'),
    ]);
    if (v == null || !mounted) return;
    final by = (await ref.read(sessionControllerProvider.future))?.userName ?? '';
    try {
      await recordPayment(_store, kind: 'insurer', partyId: '${i['id']}', amount: _n(v['amount']), date: '${v['date']}', method: '${v['method'] ?? 'Cash'}',
          bankId: '${v['bankId'] ?? 'cash-drawer'}', note: '${v['note'] ?? ''}'.trim(), by: by);
      if (mounted) say(context, 'Payment from ${i['name']} recorded');
    } on ArgumentError catch (e) {
      if (mounted) say(context, '${e.message}', error: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final insurers = ref.watch(tableProvider('insurers')).value;
    final sales = ref.watch(tableProvider('sales')).value ?? const [];
    final payments = ref.watch(tableProvider('payments')).value ?? const [];
    final banks = ref.watch(tableProvider('banks')).value ?? const [];
    final st = ref.watch(settingsProvider).value ?? const PharmacySettings();
    final can = ref.watch(permissionsProvider).value ?? const <String>{};
    final editable = can.contains('customers') || can.contains('finance');
    if (insurers == null) return const Center(child: CircularProgressIndicator());
    String fmt(num v) => st.money(v);
    final rows = [
      for (final i in insurers) (i: i, owed: insurerBalance(sales, payments, '${i['id']}')),
    ]..sort((a, b) => (a.i['archived'] == true ? 1 : 0) - (b.i['archived'] == true ? 1 : 0) != 0
        ? (a.i['archived'] == true ? 1 : 0) - (b.i['archived'] == true ? 1 : 0)
        : b.owed.compareTo(a.owed));
    final billed = sales.where((s) => s['insurance'] is Map && (_show.isEmpty || (s['insurance'] as Map)['insurerId'] == _show)).toList()
      ..sort((a, b) => '${b['date']}'.compareTo('${a['date']}'));
    return PageFrame(
      title: 'Insurers',
      subtitle: 'At the till the patient pays the co-pay; the rest is owed by the insurer until it pays.',
      actions: [if (editable) FilledButton.icon(key: const Key('add-insurer'), onPressed: () => _editInsurer(null), icon: const Icon(Icons.add), label: const Text('Add insurer'))],
      scroll: true,
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        if (rows.isEmpty) const EmptyState('No insurers yet. Add one to bill insured clients at the till.'),
        for (final r in rows)
          Card(
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [
                  Expanded(
                    child: Text('${r.i['name']}${r.i['archived'] == true ? ' · archived' : ''}', style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
                  ),
                  Text('Owes ${fmt(r.owed)}', style: TextStyle(fontWeight: FontWeight.w800, color: r.owed > 0.5 ? Colors.orange.shade800 : null)),
                ]),
                if ('${r.i['phone'] ?? ''}${r.i['email'] ?? ''}'.isNotEmpty)
                  Text([r.i['phone'], r.i['email']].where((x) => '${x ?? ''}'.isNotEmpty).join(' · '), style: Theme.of(context).textTheme.bodySmall),
                for (final s in ((r.i['schemes'] as List?) ?? const []).whereType<Map>())
                  ListTile(
                    dense: true,
                    contentPadding: EdgeInsets.zero,
                    title: Text('${s['name']}'),
                    subtitle: Text(_describe(s, fmt)),
                    trailing: editable ? IconButton(tooltip: 'Edit scheme', icon: const Icon(Icons.edit_outlined, size: 18), onPressed: () => _editScheme(r.i, s.cast<String, Object?>())) : null,
                  ),
                Wrap(spacing: 8, runSpacing: 4, children: [
                  OutlinedButton(onPressed: () => setState(() => _show = _show == r.i['id'] ? '' : '${r.i['id']}'), child: Text(_show == r.i['id'] ? 'All sales' : 'Sales')),
                  if (editable) OutlinedButton(onPressed: () => _editInsurer(r.i), child: const Text('Edit')),
                  if (editable) OutlinedButton(onPressed: () => _editScheme(r.i, null), child: const Text('Add scheme')),
                  if (r.owed > 0.5 && editable) FilledButton(onPressed: () => _receive(r.i, r.owed, banks, st), child: const Text('Receive payment')),
                ]),
              ]),
            ),
          ),
        const SizedBox(height: 12),
        Text(_show.isEmpty ? 'Sales billed to insurers' : 'Sales billed to ${insurers.where((i) => i['id'] == _show).firstOrNull?['name'] ?? ''}', style: Theme.of(context).textTheme.titleMedium),
        if (billed.isEmpty) const Padding(padding: EdgeInsets.all(12), child: Text('No insured sales yet')),
        for (final s in billed.take(200))
          ListTile(
            dense: true,
            title: Text('${s['number']} · ${s['customerName'] ?? ''}${s['status'] == 'refunded' ? ' · refunded' : ''}'),
            subtitle: Text('${'${s['date']}'.split('T').first} · ${(s['insurance'] as Map)['insurer']} · ${(s['insurance'] as Map)['scheme']} · member ${(s['insurance'] as Map)['memberNo']}'),
            trailing: Text('client ${fmt(_n(s['paid']))} · insurer ${fmt(insurerShare(s))}'),
          ),
      ]),
    );
  }
}

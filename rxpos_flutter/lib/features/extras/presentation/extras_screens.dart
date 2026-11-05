// The remaining screens: reminders, calendar, team chat, the controlled-drugs register,
// barcode labels, importing medicines and drug information.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/data/pharmacy_providers.dart';
import '../../../core/data/record_store.dart';
import '../../../core/presentation/export.dart';
import '../../../core/entities/movement.dart';
import '../../../core/entities/sale.dart';
import '../../../core/entities/settings.dart';
import '../../../core/presentation/widgets.dart';
import '../../../core/rules/dates.dart';
import '../../../core/rules/ids.dart';
import '../../../core/rules/money.dart';
import '../../auth/application/session_controller.dart';

Future<String> _me(WidgetRef ref) async => (await ref.read(sessionControllerProvider.future))?.userName ?? '';

/// Calendar: the pharmacy's events (deliveries, inspections, meetings…), upcoming first.
class CalendarScreen extends ConsumerWidget {
  const CalendarScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final rows = ref.watch(tableProvider('events')).value;
    if (rows == null) return const Center(child: CircularProgressIndicator());
    final t = today();
    final upcoming = rows.where((e) => '${e['date']}'.compareTo(t) >= 0).toList()..sort((a, b) => '${a['date']} ${a['time'] ?? ''}'.compareTo('${b['date']} ${b['time'] ?? ''}'));
    Future<void> edit(Map<String, Object?>? e) async {
      final v = await editRecord(context, title: e == null ? 'New event' : 'Edit event', initial: e ?? {'date': t}, fields: const [
        FormFieldSpec('title', 'What', required: true),
        FormFieldSpec('date', 'Date', kind: FieldKind.date, required: true),
        FormFieldSpec('time', 'Time (e.g. 14:30)'),
        FormFieldSpec('note', 'Note', kind: FieldKind.multiline),
      ]);
      if (v == null) return;
      final by = await _me(ref);
      await ref.read(recordStoreProvider).update((x) {
        x.put('events', {...?e, ...v, 'id': e?['id'] ?? uid(), 'title': '${v['title']}'.trim(), 'createdBy': e?['createdBy'] ?? by});
        x.audit(by, e == null ? 'Calendar event added' : 'Calendar event changed', '${v['title']} ${v['date']}');
      });
    }

    return PageFrame(
      title: 'Calendar',
      actions: [FilledButton.icon(onPressed: () => edit(null), icon: const Icon(Icons.event), label: const Text('Add event'))],
      child: upcoming.isEmpty
          ? const EmptyState('Nothing coming up')
          : ListView(children: [
              for (final e in upcoming)
                ListTile(title: Text('${e['title']}'), subtitle: Text('${e['date']} ${e['time'] ?? ''} · ${e['note'] ?? ''}'), onTap: () => edit(e)),
            ]),
    );
  }
}

/// Controlled Drugs & Recalls (src/pages/Controlled.jsx): every dose of a controlled medicine in and out at this branch
/// with the running balance and, for each sale, the patient, prescriber and prescription; and a batch recall lookup:
/// where a batch is, and every sale from it (to call the patients back).
class ControlledScreen extends ConsumerStatefulWidget {
  const ControlledScreen({super.key});
  @override
  ConsumerState<ControlledScreen> createState() => _ControlledScreenState();
}

class _ControlledScreenState extends ConsumerState<ControlledScreen> {
  String _tab = 'register', _id = '', _q = '';

  @override
  Widget build(BuildContext context) {
    final d = ref.watch(pharmacyProvider).value;
    final sales = ref.watch(tableProvider('sales')).value;
    final moves = ref.watch(tableProvider('movements')).value ?? const [];
    final batches = ref.watch(tableProvider('batches')).value ?? const [];
    if (d == null || sales == null) return const Center(child: CircularProgressIndicator());
    final st = d.settings;
    final saleList = sales.map(Sale.fromRecord).toList();
    return PageFrame(
      title: 'Controlled Drugs & Recalls',
      subtitle: 'Every dose in and out with a running balance, plus a quick batch look-up for recalls',
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Align(
          alignment: Alignment.centerLeft,
          child: SegmentedButton<String>(
            segments: const [ButtonSegment(value: 'register', label: Text('Controlled drugs register')), ButtonSegment(value: 'recall', label: Text('Batch recall lookup'))],
            selected: {_tab},
            onSelectionChanged: (v) => setState(() => _tab = v.first),
          ),
        ),
        const SizedBox(height: 8),
        Expanded(child: _tab == 'register' ? _register(d, saleList, moves, batches, st) : _recall(d, saleList, batches, st)),
      ]),
    );
  }

  Widget _register(PharmacyData d, List<Sale> sales, List<Map<String, Object?>> moves, List<Map<String, Object?>> batches, PharmacySettings st) {
    final list = d.products.where((p) => p.controlled).toList()..sort((a, b) => a.name.compareTo(b.name));
    if (list.isEmpty) return const EmptyState('No medicine is marked as a controlled drug. Tick "Controlled drug" on a medicine in the Medicine List.');
    final id = list.any((p) => p.id == _id) ? _id : list.first.id;
    final p = d.byId[id]!;
    final saleBy = {for (final s in sales) s.number: s};
    final batchName = {for (final b in batches) '${b['id']}': '${b['batch']}'};
    var bal = 0.0;
    final lines = [
      for (final m in moves.map(Movement.fromRecord).where((m) => m.productId == id && (m.branchId.isEmpty ? 'main' : m.branchId) == d.branch).toList()..sort((a, b) => a.date.compareTo(b.date)))
        (m: m, bal: bal += m.qty, c: m.type == 'Sale' ? (saleBy[m.ref]?.raw['controlled'] as Map?) : null),
    ];
    final rows = lines.reversed.take(500).toList();
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Wrap(spacing: 12, crossAxisAlignment: WrapCrossAlignment.center, children: [
        DropdownButton<String>(value: id, items: [for (final x in list) DropdownMenuItem(value: x.id, child: Text(x.name))], onChanged: (v) => setState(() => _id = v ?? id)),
        Text('Balance now ${formatQty(d.stockOf(id))}', style: const TextStyle(fontWeight: FontWeight.w700)),
        ExportButtons(
          name: 'register-${p.name.replaceAll(RegExp(r'\W+'), '-')}',
          settings: st,
          title: 'Controlled drugs register – ${p.name}',
          subtitle: 'Balance ${formatQty(d.stockOf(id))}',
          csv: () => [
            for (final x in lines)
              {'date': x.m.date, 'type': x.m.type, 'reference': x.m.ref, 'batch': batchName[x.m.batchId] ?? '', 'in': x.m.qty > 0 ? x.m.qty : '', 'out': x.m.qty < 0 ? -x.m.qty : '', 'balance': x.bal,
                'patient': x.c?['patient'] ?? '', 'patientId': x.c?['idNo'] ?? '', 'prescriber': x.c?['prescriber'] ?? '', 'prescriberReg': x.c?['prescriberReg'] ?? '', 'prescriptionNo': x.c?['rxNo'] ?? '', 'by': x.m.user},
          ],
          pdf: () => [
            PdfTable(head: const ['Date', 'Type', 'Reference', 'Batch', 'Patient · ID', 'Prescriber · Rx', 'In', 'Out', 'Balance', 'By'], numeric: const [6, 7, 8], body: [
              for (final x in lines.reversed)
                [x.m.date.replaceFirst('T', ' ').split('.').first, x.m.type, x.m.ref, batchName[x.m.batchId] ?? '—', x.c == null ? (x.m.type == 'Sale' ? 'not recorded' : '') : '${x.c!['patient']} ${x.c!['idNo'] ?? ''}',
                  x.c == null ? '' : '${x.c!['prescriber']} ${x.c!['prescriberReg'] ?? ''} · Rx ${x.c!['rxNo'] ?? ''}', x.m.qty > 0 ? formatQty(x.m.qty) : '', x.m.qty < 0 ? formatQty(-x.m.qty) : '', formatQty(x.bal), x.m.user],
            ]),
          ],
        ),
      ]),
      Expanded(
        child: rows.isEmpty
            ? const EmptyState('No movements of this medicine at this branch yet')
            : ListView.separated(
                itemCount: rows.length,
                separatorBuilder: (_, _) => const Divider(height: 1),
                itemBuilder: (_, i) {
                  final x = rows[i];
                  return ListTile(
                    dense: true,
                    title: Text('${x.m.type} · ${x.m.ref}${x.m.note.isEmpty ? '' : ' (${x.m.note})'} · batch ${batchName[x.m.batchId] ?? '—'}'),
                    subtitle: Text('${x.m.date.replaceFirst('T', ' ').split('.').first} · by ${x.m.user}'
                        '${x.c != null ? '\nPatient ${x.c!['patient']} ${x.c!['idNo'] ?? ''} · prescriber ${x.c!['prescriber']}${'${x.c!['prescriberReg'] ?? ''}'.isEmpty ? '' : ' (${x.c!['prescriberReg']})'} · Rx ${x.c!['rxNo'] ?? ''}' : x.m.type == 'Sale' ? '\nPatient not recorded' : ''}'),
                    trailing: Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.end, children: [
                      Text(x.m.qty > 0 ? 'In ${formatQty(x.m.qty)}' : 'Out ${formatQty(-x.m.qty)}', style: TextStyle(color: x.m.qty > 0 ? Colors.green.shade700 : Theme.of(context).colorScheme.error)),
                      Text('Balance ${formatQty(x.bal)}', style: const TextStyle(fontWeight: FontWeight.w700)),
                    ]),
                  );
                },
              ),
      ),
    ]);
  }

  Widget _recall(PharmacyData d, List<Sale> sales, List<Map<String, Object?>> batches, PharmacySettings st) {
    final code = _q.trim().toLowerCase();
    final found = code.length < 2 ? <Map<String, Object?>>[] : batches.where((b) => '${b['batch'] ?? ''}'.toLowerCase() == code).toList();
    final ids = {for (final b in found) '${b['id']}'};
    final phoneOf = {for (final c in d.customers) c.id: c.phone};
    final sold = [
      for (final s in sales.where((s) => s.status != 'refunded'))
        for (final i in s.items)
          for (final a in i.alloc.where((a) => ids.contains(a.batchId)))
            (s: s, i: i, qty: a.qty, phone: (phoneOf[s.customerId] ?? '').isNotEmpty ? phoneOf[s.customerId]! : '${(s.raw['controlled'] as Map?)?['idNo'] ?? ''}'),
    ];
    String who(Sale s) => '${(s.raw['controlled'] as Map?)?['patient'] ?? s.customerName}';
    return ListView(children: [
      Row(children: [
        Expanded(child: TextField(key: const Key('recall-batch'), decoration: const InputDecoration(prefixIcon: Icon(Icons.search), hintText: 'Batch number, exactly as on the recall notice'),
            onChanged: (v) => setState(() => _q = v))),
        if (found.isNotEmpty)
          ExportButtons(name: 'recall-${_q.trim()}', settings: st, title: 'Batch recall – ${_q.trim()}', subtitle: '${sold.length} sales', pdf: () => [
            PdfTable(head: const ['Date', 'Receipt', 'Customer', 'Phone / ID', 'Medicine', 'Qty', 'Value'], numeric: const [5, 6], body: [
              for (final r in sold) [dayOf(r.s.date), r.s.number, who(r.s), r.phone, r.i.name, formatQty(r.qty), st.money(r.qty * r.i.price)],
            ]),
          ]),
      ]),
      if (code.length >= 2 && found.isEmpty) Padding(padding: const EdgeInsets.all(16), child: Text('No batch numbered “${_q.trim()}”')),
      for (final b in found)
        Card(
          child: ListTile(
            leading: const Icon(Icons.gpp_maybe_outlined),
            title: Text('${d.byId['${b['productId']}']?.name ?? '—'} · batch ${b['batch']} · expiry ${'${b['expiry'] ?? ''}'.isEmpty ? '—' : b['expiry']}'),
            subtitle: Text('Still in stock here: ${formatQty(d.stock.batchesOf('${b['productId']}').where((x) => x.id == b['id']).firstOrNull?.qty ?? 0)} '
                '(take it off the shelf: Expiring / Expired → Return, or Returns to Supplier) · received ${b['received'] ?? '—'}'),
          ),
        ),
      if (found.isNotEmpty) ...[
        Padding(padding: const EdgeInsets.all(8), child: Text('Sold from this batch: ${sold.length} sale${sold.length == 1 ? '' : 's'}', style: Theme.of(context).textTheme.titleMedium)),
        if (sold.isEmpty) const Padding(padding: EdgeInsets.all(8), child: Text('Nothing sold from this batch')),
        for (final r in sold)
          ListTile(dense: true, title: Text('${who(r.s)}${r.phone.isEmpty ? '' : ' · ${r.phone}'}'), subtitle: Text('${dayOf(r.s.date)} · ${r.s.number} · ${r.i.name} × ${formatQty(r.qty)}'),
              trailing: Text(st.money(r.qty * r.i.price))),
      ],
    ]);
  }
}

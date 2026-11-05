// The remaining screens: storage temperature, reminders, calendar, team chat, the controlled-drugs register,
// barcode labels, importing medicines, drug information and the AI drug quiz.
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/data/pharmacy_providers.dart';
import '../../../core/data/record_store.dart';
import '../../../core/entities/product.dart';
import '../../../core/presentation/export.dart';
import '../../../core/entities/movement.dart';
import '../../../core/entities/sale.dart';
import '../../../core/entities/settings.dart';
import '../../../core/network/dio_client.dart';
import '../../../core/presentation/widgets.dart';
import '../../../core/rules/dates.dart';
import '../../../core/rules/ids.dart';
import '../../../core/rules/money.dart';
import '../../../core/rules/search.dart';
import '../../../core/sync/sync_engine.dart';
import '../../auth/application/session_controller.dart';
import '../../prescriptions/presentation/prescriptions_screen.dart' show medicationsText;
import '../../people/domain/balances.dart';
import '../../prescriptions/domain/prescriptions.dart';
import '../domain/extras.dart';

Future<String> _me(WidgetRef ref) async => (await ref.read(sessionControllerProvider.future))?.userName ?? '';

/// Storage temperature: log fridge and room readings; out-of-range readings stand out and go in the audit log.
class StorageScreen extends ConsumerWidget {
  const StorageScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final rows = ref.watch(tableProvider('tempLogs')).value;
    final d = ref.watch(pharmacyProvider).value;
    if (rows == null || d == null) return const Center(child: CircularProgressIndicator());
    final st = d.settings;
    final list = rows.where((r) => (r['branchId'] ?? 'main') == d.branch).toList()..sort((a, b) => '${b['at']}'.compareTo('${a['at']}'));
    final l = storageLimits(st);
    return PageFrame(
      title: 'Storage temperature',
      subtitle: 'Fridge ${l.fridgeMin.round()}–${l.fridgeMax.round()}°C · room below ${l.roomMax.round()}°C',
      actions: [FilledButton.icon(onPressed: () async {
        final v = await editRecord(context, title: 'Log a reading', initial: {'place': 'Fridge'}, fields: const [
          FormFieldSpec('place', 'Where', kind: FieldKind.choice, required: true, options: [('Fridge', 'Fridge'), ('Room', 'Room / shelves')]),
          FormFieldSpec('temp', 'Temperature (°C)', kind: FieldKind.number, required: true),
          FormFieldSpec('humidity', 'Humidity (%)', kind: FieldKind.number),
          FormFieldSpec('note', 'Note'),
        ]);
        if (v == null) return;
        final by = await _me(ref);
        final temp = (v['temp'] as num).toDouble();
        final ok = tempInRange('${v['place']}', temp, st);
        await ref.read(recordStoreProvider).update((x) {
          x.put('tempLogs', {'id': uid(), 'at': x.now, 'place': v['place'], 'temp': v['temp'], 'humidity': v['humidity'] == 0 ? null : v['humidity'], 'note': v['note'] ?? '', 'by': by, 'branchId': d.branch});
          if (!ok) x.audit(by, 'Storage temperature out of range', '${v['place']} $temp°C', d.branch);
        });
        if (context.mounted) say(context, ok ? 'Reading saved' : 'Out of range! Check the ${'${v['place']}'.toLowerCase()} now', error: !ok);
      }, icon: const Icon(Icons.thermostat), label: const Text('Log a reading'))],
      child: list.isEmpty
          ? const EmptyState('No readings yet')
          : ListView(children: [
              for (final r in list.take(200))
                ListTile(
                  dense: true,
                  leading: Icon(tempInRange('${r['place']}', ((r['temp'] as num?) ?? 0).toDouble(), st) ? Icons.check_circle_outline : Icons.warning_amber, color:
                      tempInRange('${r['place']}', ((r['temp'] as num?) ?? 0).toDouble(), st) ? Colors.green : Theme.of(context).colorScheme.error),
                  title: Text('${r['place']} · ${r['temp']}°C${r['humidity'] == null ? '' : ' · ${r['humidity']}%'}'),
                  subtitle: Text('${'${r['at']}'.replaceFirst('T', ' ').split('.').first} · ${r['by'] ?? ''} ${r['note'] ?? ''}'),
                ),
            ]),
    );
  }
}

/// Reminders: refills coming due and clients who owe, with a WhatsApp message ready to send.
class RemindersScreen extends ConsumerWidget {
  const RemindersScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final rx = ref.watch(tableProvider('prescriptions')).value;
    final customers = ref.watch(tableProvider('customers')).value ?? const [];
    final sales = (ref.watch(tableProvider('sales')).value ?? const []).map(Sale.fromRecord).toList();
    final payments = ref.watch(tableProvider('payments')).value ?? const [];
    final st = ref.watch(settingsProvider).value ?? const PharmacySettings();
    if (rx == null) return const Center(child: CircularProgressIndicator());
    Map<String, Object?>? client(Object? id) => customers.where((c) => c['id'] == id).firstOrNull;
    final soon = localDate(DateTime.now().add(const Duration(days: 7)));
    final refills = [for (final r in rx) if (nextRefillDue(r) case final due? when due.compareTo(soon) <= 0) (r, due)]..sort((a, b) => a.$2.compareTo(b.$2));
    final debts = [for (final c in customers) if (c['id'] != 'walk-in') (c, customerBalance('${c['id']}', sales, payments))].where((x) => x.$2 > 0.5).toList()
      ..sort((a, b) => b.$2.compareTo(a.$2));
    Widget send(Map<String, Object?>? c, String text) {
      final phone = normalizePhone('${c?['phone'] ?? ''}');
      return IconButton(tooltip: 'WhatsApp', icon: const Icon(Icons.chat_outlined),
          onPressed: phone.length < 12 ? null : () => launchUrl(Uri.parse(whatsappLink(phone, text)), mode: LaunchMode.externalApplication));
    }

    return PageFrame(
      title: 'Reminders',
      scroll: true,
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('Refills due within a week (${refills.length})', style: Theme.of(context).textTheme.titleMedium),
        for (final (r, due) in refills)
          ListTile(dense: true, title: Text('${client(r['customerId'])?['name'] ?? '—'} · due $due'),
              subtitle: Text(medicationsText(r['medications']).replaceAll('\n', ', ')),
              trailing: send(client(r['customerId']), fillTemplate('${st.raw['smsRefill'] ?? defaultRefillMessage}', {
                'name': '${client(r['customerId'])?['name'] ?? ''}', 'pharmacy': st.name, 'medicine': medicationsText(r['medications']).replaceAll('\n', ', '), 'date': due}))),
        const Divider(),
        Text('Clients who owe (${debts.length})', style: Theme.of(context).textTheme.titleMedium),
        for (final (c, owed) in debts)
          ListTile(dense: true, title: Text('${c['name']}'), subtitle: Text('${c['phone'] ?? ''}'), trailing: Row(mainAxisSize: MainAxisSize.min, children: [
            Text(st.money(owed)),
            send(c, fillTemplate('${st.raw['smsDebt'] ?? defaultDebtMessage}', {'name': '${c['name']}', 'pharmacy': st.name, 'amount': st.money(owed)})),
          ])),
      ]),
    );
  }
}

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

/// Team chat: the pharmacy's team conversation (it travels with sync).
class ChatScreen extends ConsumerStatefulWidget {
  const ChatScreen({super.key});
  @override
  ConsumerState<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends ConsumerState<ChatScreen> {
  final _text = TextEditingController();
  @override
  Widget build(BuildContext context) {
    final rows = ref.watch(tableProvider('messages')).value;
    final me = ref.watch(sessionControllerProvider).value;
    if (rows == null || me == null) return const Center(child: CircularProgressIndicator());
    final list = rows.where((m) => m['conv'] == 'team' && m['deleted'] != true).toList()..sort((a, b) => '${a['date']}'.compareTo('${b['date']}'));
    Future<void> send() async {
      final t = _text.text.trim();
      if (t.isEmpty) return;
      _text.clear();
      final branch = (await ref.read(pharmacyProvider.future)).branch;
      await ref.read(recordStoreProvider).update((x) => x.put('messages', {'id': uid(), 'date': x.now, 'fromId': me.userId, 'fromName': me.userName, 'conv': 'team',
        'branchId': branch, 'channel': 'team', 'text': t}));
    }

    return PageFrame(
      title: 'Team chat',
      child: Column(children: [
        Expanded(
          child: ListView(reverse: true, children: [
            for (final m in list.reversed.take(300))
              Align(
                alignment: m['fromId'] == me.userId ? Alignment.centerRight : Alignment.centerLeft,
                child: Card(
                  color: m['fromId'] == me.userId ? Theme.of(context).colorScheme.primaryContainer : null,
                  child: Padding(padding: const EdgeInsets.all(10), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text('${m['fromName']} · ${'${m['date']}'.replaceFirst('T', ' ').substring(0, 16)}', style: Theme.of(context).textTheme.labelSmall),
                    Text('${m['text'] ?? (m['call'] != null ? 'Call' : '')}'),
                  ])),
                ),
              ),
          ]),
        ),
        Row(children: [
          Expanded(child: TextField(controller: _text, decoration: const InputDecoration(hintText: 'Message the team…'), onSubmitted: (_) => send())),
          IconButton(onPressed: send, icon: const Icon(Icons.send)),
        ]),
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

/// Barcode labels: choose medicines and how many labels; print them (Code 128) as a PDF.
class LabelsScreen extends ConsumerStatefulWidget {
  const LabelsScreen({super.key});
  @override
  ConsumerState<LabelsScreen> createState() => _LabelsScreenState();
}

class _LabelsScreenState extends ConsumerState<LabelsScreen> {
  final _count = <String, int>{};
  String _q = '';
  @override
  Widget build(BuildContext context) {
    final d = ref.watch(pharmacyProvider).value;
    if (d == null) return const Center(child: CircularProgressIndicator());
    final found = searchProducts(d.products.where((p) => p.barcode.isNotEmpty).toList(), _q, stockOf: (p) => d.stockOf(p.id)).take(60).toList();
    final total = _count.values.fold(0, (a, b) => a + b);
    return PageFrame(
      title: 'Barcode labels',
      subtitle: '$total labels chosen',
      actions: [
        SearchField(onChanged: (v) => setState(() => _q = v), hint: 'Medicine…'),
        FilledButton.icon(onPressed: total == 0 ? null : () => Printing.layoutPdf(onLayout: (_) => _pdf(d)), icon: const Icon(Icons.print), label: const Text('Print labels')),
      ],
      child: ListView(children: [
        for (final p in found)
          ListTile(dense: true, title: Text(p.name), subtitle: Text('${p.barcode} · ${d.settings.money(p.price)}'), trailing: SizedBox(width: 120, child: Row(children: [
            IconButton(onPressed: () => setState(() => _count[p.id] = ((_count[p.id] ?? 0) - 1).clamp(0, 999)), icon: const Icon(Icons.remove)),
            Text('${_count[p.id] ?? 0}'),
            IconButton(onPressed: () => setState(() => _count[p.id] = (_count[p.id] ?? 0) + 1), icon: const Icon(Icons.add)),
          ]))),
      ]),
    );
  }

  Future<Uint8List> _pdf(PharmacyData d) {
    final doc = pw.Document();
    final labels = [for (final e in _count.entries) for (var i = 0; i < e.value; i++) d.byId[e.key]!];
    doc.addPage(pw.MultiPage(pageFormat: PdfPageFormat.a4, build: (_) => [
      pw.Wrap(spacing: 8, runSpacing: 8, children: [
        for (final p in labels)
          pw.Container(width: 160, padding: const pw.EdgeInsets.all(4), decoration: pw.BoxDecoration(border: pw.Border.all(width: .5)), child: pw.Column(children: [
            pw.Text(p.name, maxLines: 1, style: const pw.TextStyle(fontSize: 8)),
            pw.BarcodeWidget(barcode: pw.Barcode.code128(), data: p.barcode, height: 32, textStyle: const pw.TextStyle(fontSize: 7)),
            pw.Text(d.settings.money(p.price), style: pw.TextStyle(fontSize: 9, fontWeight: pw.FontWeight.bold)),
          ])),
      ]),
    ]));
    return doc.save();
  }
}

/// Import medicines: paste rows from a spreadsheet (name, generic, form, price, cost, barcode, unit; tab or comma
/// separated); medicines already in the list (same name) are skipped.
class ImportScreen extends ConsumerStatefulWidget {
  const ImportScreen({super.key});
  @override
  ConsumerState<ImportScreen> createState() => _ImportScreenState();
}

class _ImportScreenState extends ConsumerState<ImportScreen> {
  final _text = TextEditingController();
  @override
  Widget build(BuildContext context) => PageFrame(
        title: 'Import medicines',
        subtitle: 'Columns: name, generic, form, price, cost, barcode, unit (copy them from Excel and paste below)',
        actions: [FilledButton.icon(onPressed: _import, icon: const Icon(Icons.upload), label: const Text('Import'))],
        child: TextField(controller: _text, maxLines: null, expands: true, decoration: const InputDecoration(border: OutlineInputBorder(), hintText: 'Amoxa 500mg Caps\tAmoxicillin\tCapsules\t500\t300\t6001001\tCapsule')),
      );

  Future<void> _import() async {
    final d = await ref.read(pharmacyProvider.future);
    final have = {for (final p in d.products) p.name.trim().toLowerCase()};
    final rows = <Map<String, Object?>>[];
    for (final line in _text.text.split('\n')) {
      final c = line.contains('\t') ? line.split('\t') : line.split(',');
      final name = c.isNotEmpty ? c[0].trim() : '';
      if (name.length < 2 || name.toLowerCase() == 'name' || !have.add(name.toLowerCase())) continue;
      String at(int i) => i < c.length ? c[i].trim() : '';
      final price = double.tryParse(at(3).replaceAll(',', '')) ?? 0, cost = double.tryParse(at(4).replaceAll(',', '')) ?? 0;
      rows.add({'id': uid(), 'name': name, 'generic': at(1), 'form': at(2).isEmpty ? 'Others' : at(2), 'price': price, 'wholesale': price, 'cost': cost,
        'barcode': at(5), 'unit': at(6).isEmpty ? 'Unit' : at(6), 'reorder': 0});
    }
    if (rows.isEmpty) {
      if (mounted) say(context, 'Nothing new to import', error: true);
      return;
    }
    final by = await _me(ref);
    await ref.read(recordStoreProvider).update((x) {
      for (final r in rows) {
        x.put('products', r);
      }
      x.audit(by, 'Medicines imported', '${rows.length} medicines');
    });
    _text.clear();
    if (mounted) say(context, '${rows.length} medicines imported');
  }
}

/// Drug information: find a medicine and see what the pharmacy knows about it (generic, form, prices, stock, batches).
class DrugInfoScreen extends ConsumerStatefulWidget {
  const DrugInfoScreen({super.key});
  @override
  ConsumerState<DrugInfoScreen> createState() => _DrugInfoScreenState();
}

class _DrugInfoScreenState extends ConsumerState<DrugInfoScreen> {
  String _q = '';
  @override
  Widget build(BuildContext context) {
    final d = ref.watch(pharmacyProvider).value;
    if (d == null) return const Center(child: CircularProgressIndicator());
    final found = _q.trim().length < 2 ? const <Product>[] : searchProducts(d.products, _q, stockOf: (p) => d.stockOf(p.id)).take(30).toList();
    return PageFrame(
      title: 'Drug information',
      actions: [SearchField(onChanged: (v) => setState(() => _q = v), hint: 'Brand or generic name…')],
      child: ListView(children: [
        for (final p in found)
          ExpansionTile(title: Text(p.name), subtitle: Text([p.generic, p.form, p.strength].where((x) => x.isNotEmpty).join(' · ')), children: [
            ListTile(dense: true, title: Text('Price ${d.settings.money(p.price)} · wholesale ${d.settings.money(p.wholesale)} · ${p.rx ? 'prescription only' : 'over the counter'}${p.controlled ? ' · controlled' : ''}')),
            ListTile(dense: true, title: Text('In stock ${formatQty(d.stockOf(p.id))}${p.barcode.isEmpty ? '' : ' · barcode ${p.barcode}'}')),
            ListTile(dense: true, title: Text('Other medicines with ${p.generic.isEmpty ? 'this name' : p.generic}: ${d.products.where((x) => x.id != p.id && x.generic.isNotEmpty && x.generic.toLowerCase() == p.generic.toLowerCase()).map((x) => x.name).take(8).join(', ')}')),
          ]),
      ]),
    );
  }
}

/// Drug quiz: questions about the pharmacy's best-selling medicines, made by the cloud's AI (needs internet).
class QuizScreen extends ConsumerStatefulWidget {
  const QuizScreen({super.key});
  @override
  ConsumerState<QuizScreen> createState() => _QuizScreenState();
}

class _QuizScreenState extends ConsumerState<QuizScreen> {
  List<Map<String, Object?>> _qs = const [];
  final _answers = <int, int>{};
  bool _busy = false;

  Future<void> _make() async {
    setState(() => _busy = true);
    try {
      final d = await ref.read(pharmacyProvider.future);
      final drugs = d.products.where((p) => d.stockOf(p.id) > 0).map((p) => p.generic.isEmpty ? p.name : p.generic).toSet().take(12).toList();
      final res = await ref.read(dioProvider).post<Object?>('${syncBase(ref.read(appConfigProvider).cloudUrl)}/api/ai/quiz', data: {'drugs': drugs, 'count': 8},
          options: Options(receiveTimeout: const Duration(seconds: 90)));
      final list = ((res.data as Map?)?['questions'] as List?) ?? const [];
      setState(() {
        _qs = [for (final q in list) if (q is Map) q.cast<String, Object?>()];
        _answers.clear();
      });
    } catch (e) {
      if (mounted) say(context, 'The quiz could not be made: $e', error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => PageFrame(
        title: 'Drug quiz',
        subtitle: _qs.isEmpty ? 'Questions about medicines you stock' : '${_answers.entries.where((e) => e.value == ((_qs[e.key]['answer'] as num?) ?? -1)).length} of ${_qs.length} right',
        actions: [FilledButton.icon(onPressed: _busy ? null : _make, icon: const Icon(Icons.quiz_outlined), label: Text(_busy ? 'Making questions…' : 'New quiz'))],
        child: ListView(children: [
          for (var i = 0; i < _qs.length; i++)
            Card(child: Padding(padding: const EdgeInsets.all(12), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('${i + 1}. ${_qs[i]['question']}', style: const TextStyle(fontWeight: FontWeight.w700)),
              for (final (j, o) in ((_qs[i]['options'] as List?) ?? const []).indexed)
                ListTile(dense: true, title: Text('$o'), onTap: _answers.containsKey(i) ? null : () => setState(() => _answers[i] = j),
                    leading: Icon(!_answers.containsKey(i) ? Icons.radio_button_unchecked : j == _qs[i]['answer'] ? Icons.check_circle : _answers[i] == j ? Icons.cancel : Icons.radio_button_unchecked,
                        color: !_answers.containsKey(i) ? null : j == _qs[i]['answer'] ? Colors.green : _answers[i] == j ? Colors.red : null)),
              if (_answers.containsKey(i) && _qs[i]['explain'] != null) Text('${_qs[i]['explain']}', style: Theme.of(context).textTheme.bodySmall),
            ]))),
        ]),
      );
}

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:printing/printing.dart';

import '../../../core/data/pharmacy_providers.dart';
import '../../../core/data/record_store.dart';
import '../../../core/entities/product.dart';
import '../../../core/entities/settings.dart';
import '../../../core/presentation/export.dart';
import '../../../core/presentation/widgets.dart';
import '../../../core/rules/dates.dart';
import '../../../core/rules/fefo.dart';
import '../../../core/rules/ids.dart';
import '../../../core/rules/money.dart';
import '../../../core/rules/search.dart';
import '../../auth/application/session_controller.dart';
import '../domain/supplier_return.dart';

const returnReasons = ['Expired', 'Short expiry', 'Damaged', 'Wrong item delivered', 'Recall', 'Other'];

/// Returns to Supplier (src/pages/Returns.jsx): expired, damaged or wrong stock goes back; the supplier gives a credit
/// note (we owe them less) or refunds the money. New return with several lines from any medicine; view a return and
/// its return note (PDF); CSV.
class ReturnsScreen extends ConsumerStatefulWidget {
  const ReturnsScreen({super.key});
  @override
  ConsumerState<ReturnsScreen> createState() => _ReturnsScreenState();
}

class _ReturnsScreenState extends ConsumerState<ReturnsScreen> {
  String _q = '';

  @override
  Widget build(BuildContext context) {
    final rows = ref.watch(tableProvider('supplierReturns')).value;
    final st = ref.watch(settingsProvider).value ?? const PharmacySettings();
    if (rows == null) return const Center(child: CircularProgressIndicator());
    final q = _q.trim().toLowerCase();
    List<Map> items(Map r) => ((r['items'] as List?) ?? const []).cast<Map>();
    final list = rows.where((r) => q.isEmpty || [r['number'], r['supplierName'], r['creditNote'], ...items(r).map((i) => i['name'])].join(' ').toLowerCase().contains(q)).toList()
      ..sort((a, b) => '${b['date']}${b['at']}'.compareTo('${a['date']}${a['at']}'));
    return PageFrame(
      title: 'Returns to Supplier',
      subtitle: '${rows.length} returns · ${st.money(rows.fold<double>(0, (a, r) => a + ((r['total'] as num?) ?? 0)))} credited or refunded',
      actions: [
        SearchField(onChanged: (v) => setState(() => _q = v)),
        ExportButtons(name: 'supplier-returns', settings: st, csv: () => [
          for (final r in list)
            for (final i in items(r))
              {'date': r['date'], 'number': r['number'], 'supplier': r['supplierName'], 'creditNote': r['creditNote'], 'settled': r['settle'] == 'cash' ? 'Refund' : 'Credit note',
                'medicine': i['name'], 'batch': i['batch'], 'expiry': i['expiry'], 'qty': i['qty'], 'credit': i['credit'], 'reason': i['reason']},
        ]),
        FilledButton.icon(onPressed: () => showReturnForm(context, ref), icon: const Icon(Icons.add), label: const Text('New return')),
      ],
      child: list.isEmpty
          ? const EmptyState('No returns yet. Expired or damaged stock can go back to the supplier for a credit note or refund.')
          : ListView.separated(
              itemCount: list.length,
              separatorBuilder: (_, _) => const Divider(height: 1),
              itemBuilder: (_, i) {
                final r = list[i];
                final names = items(r).map((x) => '${x['name']}').toList();
                return ListTile(
                  title: Text('${r['number']} · ${r['supplierName']}'),
                  subtitle: Text('${r['date']} · ${names.take(2).join(', ')}${names.length > 2 ? ' +${names.length - 2}' : ''} · '
                      '${r['settle'] == 'cash' ? 'Refund' : 'Credit note${'${r['creditNote'] ?? ''}'.isEmpty ? '' : ' ${r['creditNote']}'}'}'),
                  trailing: Row(mainAxisSize: MainAxisSize.min, children: [
                    Text(st.money((r['total'] as num?) ?? 0), style: const TextStyle(fontWeight: FontWeight.w700)),
                    TextButton(onPressed: () => _view(r, st), child: const Text('View')),
                  ]),
                  onTap: () => _view(r, st),
                );
              },
            ),
    );
  }

  Future<void> _view(Map<String, Object?> r, PharmacySettings st) async {
    final banks = await ref.read(recordStoreProvider).rows('banks');
    if (!mounted) return;
    final items = ((r['items'] as List?) ?? const []).cast<Map>();
    final bank = banks.where((b) => b['id'] == r['bankId']).firstOrNull?['name'] ?? 'Cash at hand';
    List<String> row(Map i) => ['${i['name']}', '${i['batch'] ?? ''}', '${i['expiry'] ?? ''}', '${i['reason'] ?? ''}', formatQty(i['qty'] as num? ?? 0), st.money(i['credit'] as num? ?? 0),
      st.money(((i['qty'] as num?) ?? 0) * ((i['credit'] as num?) ?? 0))];
    await showAppDialog<void>(
      context: context,
      builder: (c) => AlertDialog(
        title: Text('Return ${r['number']}'),
        content: SizedBox(
          width: 600,
          child: SingleChildScrollView(child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Text('${r['date']} · ${r['supplierName']} · ${r['settle'] == 'cash' ? 'refund to $bank' : 'credit note ${'${r['creditNote'] ?? ''}'.isEmpty ? '(number to follow)' : r['creditNote']}'} · by ${r['by']}'),
            const Divider(),
            for (final i in items)
              ListTile(dense: true, title: Text('${i['name']} · batch ${i['batch'] ?? '—'}${'${i['expiry'] ?? ''}'.isEmpty ? '' : ' · exp ${i['expiry']}'}'),
                  subtitle: Text('${i['reason'] ?? ''} · ${formatQty(i['qty'] as num? ?? 0)} × ${st.money(i['credit'] as num? ?? 0)}'),
                  trailing: Text(st.money(((i['qty'] as num?) ?? 0) * ((i['credit'] as num?) ?? 0)))),
            if ('${r['note'] ?? ''}'.isNotEmpty) Text('${r['note']}'),
            Text('Total ${st.money((r['total'] as num?) ?? 0)}', style: const TextStyle(fontWeight: FontWeight.w800)),
          ])),
        ),
        actions: [
          TextButton.icon(
            onPressed: () => Printing.layoutPdf(name: 'Return note ${r['number']}', onLayout: (_) => tablesPdf(st, title: 'Return note ${r['number']}', subtitle: '${st.name} → ${r['supplierName']} · ${r['date']}', tables: [
              PdfTable(heading: 'Return ${r['number']} to ${r['supplierName']}', head: const ['Medicine', 'Batch', 'Expiry', 'Reason', 'Qty', 'Credit / unit', 'Total'], numeric: const [4, 5, 6],
                  body: [for (final i in items) row(i)], foot: ['', '', '', '', '', 'Total', st.money((r['total'] as num?) ?? 0)]),
            ])),
            icon: const Icon(Icons.picture_as_pdf_outlined),
            label: const Text('Return note (PDF)'),
          ),
          FilledButton(onPressed: () => Navigator.pop(c), child: const Text('Close')),
        ],
      ),
    );
  }
}

/// Return one batch to a supplier (from Expiring / Expired or Inventory): the return form with that line.
Future<void> returnDialog(BuildContext context, WidgetRef ref, Product p, BatchStock b, String reason) => showReturnForm(context, ref, pre: (p: p, b: b, reason: reason));

/// The supplier that delivered a batch (from the purchase that received it).
String supplierOfBatch(List<Map<String, Object?>> purchases, String? batchId) => batchId == null
    ? ''
    : '${purchases.where((p) => ((p['items'] as List?) ?? const []).cast<Map>().any((i) => i['batchId'] == batchId)).firstOrNull?['supplierId'] ?? ''}';

class _Line {
  _Line(this.p, this.b, {required this.reason}) : qty = TextEditingController(text: formatQty(b == null ? 1 : (b.qty < 1 ? 1 : b.qty))),
      credit = TextEditingController(text: formatQty(b != null && b.cost != 0 ? b.cost : p.cost));
  final String key = uid();
  final Product p;
  BatchStock? b;
  String reason;
  final TextEditingController qty, credit;
}

Future<void> showReturnForm(BuildContext context, WidgetRef ref, {({Product p, BatchStock b, String reason})? pre}) async {
  final d = await ref.read(pharmacyProvider.future);
  final purchases = await ref.read(recordStoreProvider).rows('purchases');
  final banks = await ref.read(recordStoreProvider).rows('banks');
  if (!context.mounted) return;
  if (d.suppliers.isEmpty) return say(context, 'Add the supplier first (People → Suppliers)', error: true);
  String reasonFor(BatchStock? b) => b != null && b.expiry.isNotEmpty && daysUntil(b.expiry) < 0 ? 'Expired' : 'Damaged';
  final lines = <_Line>[if (pre != null) _Line(pre.p, pre.b, reason: pre.reason)];
  var supplierId = pre == null ? '' : supplierOfBatch(purchases, pre.b.id);
  var settle = 'credit', bankId = banks.isEmpty ? 'cash-drawer' : '${banks.first['id']}';
  var date = today();
  final creditNote = TextEditingController(), note = TextEditingController();
  var q = '';
  final ok = await showAppDialog<bool>(
    context: context,
    builder: (c) => StatefulBuilder(builder: (c, set) {
      final matches = q.trim().isEmpty ? <Product>[] : searchProducts(d.products, q, stockOf: (p) => d.stockOf(p.id)).where((p) => d.stockOf(p.id) > 0).take(8).toList();
      double total() => lines.fold<double>(0, (a, l) => a + (double.tryParse(l.qty.text) ?? 0) * (double.tryParse(l.credit.text) ?? 0));
      return AlertDialog(
        title: const Text('Return stock to a supplier'),
        content: SizedBox(
          width: 760,
          child: SingleChildScrollView(child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Wrap(spacing: 12, runSpacing: 8, children: [
              SizedBox(width: 220, child: DropdownButtonFormField<String>(
                key: const Key('return-supplier'),
                initialValue: d.suppliers.any((s) => s.id == supplierId) ? supplierId : null,
                isExpanded: true,
                decoration: const InputDecoration(labelText: 'Supplier'),
                items: [for (final s in d.suppliers) DropdownMenuItem(value: s.id, child: Text(s.name))],
                onChanged: (v) => set(() => supplierId = v ?? ''),
              )),
              DateBox(label: 'Date', value: date, onChanged: (v) => set(() => date = v)),
              SizedBox(width: 230, child: DropdownButtonFormField<String>(
                initialValue: settle,
                isExpanded: true,
                decoration: const InputDecoration(labelText: 'Settled by'),
                items: const [DropdownMenuItem(value: 'credit', child: Text('Credit note (we owe them less)')), DropdownMenuItem(value: 'cash', child: Text('Refund (money back)'))],
                onChanged: (v) => set(() => settle = v ?? 'credit'),
              )),
              if (settle == 'credit')
                SizedBox(width: 200, child: TextField(controller: creditNote, decoration: const InputDecoration(labelText: 'Credit note no. (if you have it)')))
              else
                SizedBox(width: 200, child: DropdownButtonFormField<String>(
                  initialValue: banks.any((b) => b['id'] == bankId) ? bankId : null,
                  isExpanded: true,
                  decoration: const InputDecoration(labelText: 'Refund received into'),
                  items: [for (final b in banks) DropdownMenuItem(value: '${b['id']}', child: Text('${b['name']}'))],
                  onChanged: (v) => set(() => bankId = v ?? bankId),
                )),
            ]),
            const SizedBox(height: 8),
            TextField(key: const Key('return-search'), decoration: const InputDecoration(prefixIcon: Icon(Icons.search), hintText: 'Search a medicine in stock to return…'),
                onChanged: (v) => set(() => q = v)),
            for (final p in matches)
              ListTile(dense: true, title: Text(p.name), subtitle: Text('${formatQty(d.stockOf(p.id))} in stock'), onTap: () => set(() {
                final b = d.stock.batchesOf(p.id).where((x) => x.qty > 0).firstOrNull;
                if (supplierId.isEmpty) supplierId = supplierOfBatch(purchases, b?.id);
                lines.add(_Line(p, b, reason: reasonFor(b)));
                q = '';
              })),
            if (lines.isEmpty) const Padding(padding: EdgeInsets.all(12), child: Text('Search above to add the medicines going back')),
            for (final l in lines)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 4),
                child: Row(children: [
                  SizedBox(width: 150, child: Text(l.p.name, style: const TextStyle(fontWeight: FontWeight.w700))),
                  Expanded(child: DropdownButton<String>(
                    isExpanded: true,
                    value: l.b?.id,
                    hint: const Text('Batch'),
                    items: [for (final b in d.stock.batchesOf(l.p.id).where((b) => b.qty > 0)) DropdownMenuItem(value: b.id, child: Text('${b.batch} · exp ${b.expiry.isEmpty ? '—' : b.expiry} · ${formatQty(b.qty)} in stock', overflow: TextOverflow.ellipsis))],
                    onChanged: (v) => set(() {
                      l.b = d.stock.batchesOf(l.p.id).firstWhere((b) => b.id == v);
                      if (l.b!.cost != 0) l.credit.text = formatQty(l.b!.cost);
                    }),
                  )),
                  SizedBox(width: 60, child: TextField(controller: l.qty, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Qty', isDense: true), onChanged: (_) => set(() {}))),
                  const SizedBox(width: 6),
                  SizedBox(width: 90, child: TextField(controller: l.credit, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Credit / unit', isDense: true), onChanged: (_) => set(() {}))),
                  const SizedBox(width: 6),
                  DropdownButton<String>(value: l.reason, items: [for (final r in returnReasons) DropdownMenuItem(value: r, child: Text(r))], onChanged: (v) => set(() => l.reason = v ?? l.reason)),
                  IconButton(tooltip: 'Remove line', icon: const Icon(Icons.close), onPressed: () => set(() => lines.remove(l))),
                ]),
              ),
            TextField(controller: note, decoration: const InputDecoration(labelText: 'Note (optional)', hintText: "e.g. collected by the supplier's rep")),
            const SizedBox(height: 8),
            Text('Total ${d.settings.money(total())}', style: const TextStyle(fontWeight: FontWeight.w800)),
          ])),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Cancel')),
          FilledButton.icon(onPressed: () => Navigator.pop(c, true), icon: const Icon(Icons.undo), label: const Text('Save return')),
        ],
      );
    }),
  );
  if (ok != true || !context.mounted) return;
  final sup = d.suppliers.where((s) => s.id == supplierId).firstOrNull;
  if (sup == null) return say(context, 'Choose the supplier the stock goes back to', error: true);
  for (final l in lines) {
    if (l.b == null) return say(context, '${l.p.name}: choose the batch', error: true);
  }
  final by = (await ref.read(sessionControllerProvider.future))?.userName ?? '';
  try {
    final rec = await returnToSupplier(ref.read(recordStoreProvider), supplierId: sup.id, supplierName: sup.name, settle: settle, bankId: bankId, by: by, date: date.isEmpty ? today() : date,
        creditNote: creditNote.text, note: note.text, settings: d.settings, branchId: d.branch,
        lines: [for (final l in lines) ReturnLine(productId: l.p.id, name: l.p.name, batch: l.b!, qty: double.tryParse(l.qty.text) ?? 0, credit: double.tryParse(l.credit.text) ?? 0, reason: l.reason)]);
    if (context.mounted) {
      say(context, 'Return ${rec['number']} saved: stock taken out, ${d.settings.money(rec['total'] as num)} ${settle == 'cash' ? 'refunded' : 'off what you owe ${sup.name}'}');
    }
  } on ReturnProblem catch (e) {
    if (context.mounted) say(context, e.message, error: true);
  }
}

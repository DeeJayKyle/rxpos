import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:printing/printing.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/data/device_settings.dart';
import '../../../core/data/pharmacy_providers.dart';
import '../../../core/data/record_store.dart';
import '../../../core/entities/purchase.dart';
import '../../../core/entities/sale.dart';
import '../../../core/entities/settings.dart';
import '../../../core/entities/product.dart';
import '../../../core/presentation/export.dart';
import '../../../core/presentation/widgets.dart';
import '../../../core/rules/fefo.dart';
import '../../inventory/domain/medicines.dart';
import '../../../core/rules/dates.dart';
import '../../../core/rules/money.dart';
import '../../extras/domain/extras.dart';
import '../../../core/rules/stock.dart';
import '../../auth/application/session_controller.dart';
import '../../returns/presentation/returns_screen.dart';
import '../../../core/entities/batch.dart';
import '../../../core/entities/draft.dart';
import '../../../core/rules/search.dart';
import '../../sales_history/presentation/sales_screen.dart' show ageText, isOldDraft;
import '../../stock/domain/delivery.dart';
import '../../stock/domain/purchase_edit.dart';
import '../domain/reorder.dart';

/// Purchase History (src/pages/Purchases.jsx): deliveries with dates / supplier filters, payment type and what is
/// unpaid, CSV and PDF, view, edit a delivery (purchases.edit); the Drafts tab (deliveries to finish, scanned invoices
/// to review); Supplier prices (each medicine bought from more than one supplier, cheapest first).
class PurchasesScreen extends ConsumerStatefulWidget {
  const PurchasesScreen({super.key, this.tab = 'history'});
  final String tab;
  @override
  ConsumerState<PurchasesScreen> createState() => _PurchasesScreenState();
}

class _PurchasesScreenState extends ConsumerState<PurchasesScreen> {
  String _q = '', _from = '', _to = '', _supplier = '';
  late String _tab = widget.tab;

  @override
  Widget build(BuildContext context) {
    final rows = ref.watch(tableProvider('purchases')).value;
    final banks = ref.watch(tableProvider('banks')).value ?? const [];
    final st = ref.watch(settingsProvider).value ?? const PharmacySettings();
    final can = ref.watch(permissionsProvider).value ?? const <String>{};
    final d = ref.watch(pharmacyProvider).value;
    final session = ref.watch(sessionControllerProvider).value;
    if (rows == null || d == null) return const Center(child: CircularProgressIndicator());
    String payType(Purchase p) {
      if (p.paid <= 0) return 'Credit';
      return '${banks.where((b) => b['id'] == p.bankId).firstOrNull?['name'] ?? 'Cash'}${p.paid < p.total ? ' + credit' : ''}';
    }

    final q = _q.trim().toLowerCase();
    final all = rows.map(Purchase.fromRecord).toList();
    final suppliers = ({for (final p in all) p.supplierName}..remove('')).toList()..sort();
    final list = all.where((p) => (q.isEmpty || [p.supplierName, p.invoice, p.number, p.notes, p.receivedBy, ...p.items.map((i) => i.name)].join(' ').toLowerCase().contains(q)) &&
        (_from.isEmpty || p.date.compareTo(_from) >= 0) && (_to.isEmpty || p.date.compareTo(_to) <= 0) && (_supplier.isEmpty || p.supplierName == _supplier)).toList()
      ..sort((a, b) => '${b.date}${b.number}'.compareTo('${a.date}${a.number}'));
    final total = list.fold(0.0, (a, p) => a + p.total), owed = list.fold(0.0, (a, p) => a + (p.total - p.paid > 0 ? p.total - p.paid : 0));
    final drafts = d.drafts.where((x) => x.kind == 'delivery' && (session?.role != 'cashier' || x.userId == session?.userId)).toList();
    return PageFrame(
      title: 'Purchase History',
      subtitle: '${list.length} deliveries · ${st.money(total)}${owed > 0 ? ' · ${st.money(owed)} unpaid' : ''}',
      actions: [
        SearchField(onChanged: (v) => setState(() => _q = v), hint: 'Supplier, invoice, medicine…'),
        ExportButtons(
          name: 'purchases',
          settings: st,
          title: 'Purchase history',
          subtitle: '${list.length} deliveries · ${st.money(total)}',
          csv: () => [
            for (final p in list)
              {'date': p.date, 'number': p.number, 'supplier': p.supplierName, 'invoice': p.invoice, 'paymentType': payType(p), 'items': p.items.length, 'total': p.total, 'paid': p.paid,
                'receivedBy': p.receivedBy, 'notes': p.notes},
          ],
          pdf: () => [
            PdfTable(head: const ['Date', 'GRN', 'Supplier', 'Payment', 'Invoice', 'Items', 'Received by', 'Total', 'Unpaid'], numeric: const [5, 7, 8], body: [
              for (final p in list) [p.date, p.number, p.supplierName, payType(p), p.invoice, '${p.items.length}', p.receivedBy, st.money(p.total), p.total > p.paid ? st.money(p.total - p.paid) : '—'],
            ], foot: ['Total', '', '', '', '', '', '', st.money(total), st.money(owed)]),
          ],
        ),
      ],
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Align(
          alignment: Alignment.centerLeft,
          child: SegmentedButton<String>(
            segments: [
              const ButtonSegment(value: 'history', label: Text('Deliveries')),
              ButtonSegment(value: 'drafts', label: Text('Drafts${drafts.isEmpty ? '' : ' (${drafts.length})'}')),
              const ButtonSegment(value: 'prices', label: Text('Supplier prices')),
            ],
            selected: {_tab},
            onSelectionChanged: (v) => setState(() => _tab = v.first),
          ),
        ),
        const SizedBox(height: 8),
        if (_tab == 'drafts') Expanded(child: _DeliveryDrafts(drafts: drafts, settings: st)),
        if (_tab == 'prices') Expanded(child: _SupplierPrices(rows: rows, q: _q, names: {for (final p in d.products) p.id: p.name}, settings: st)),
        if (_tab == 'history') ...[
          Wrap(spacing: 8, runSpacing: 8, children: [
            DateBox(label: 'From', value: _from, onChanged: (v) => setState(() => _from = v)),
            DateBox(label: 'To', value: _to, onChanged: (v) => setState(() => _to = v)),
            SizedBox(width: 220, child: DropdownButtonFormField<String>(
              initialValue: _supplier,
              isExpanded: true,
              decoration: const InputDecoration(labelText: 'Supplier', isDense: true),
              items: [const DropdownMenuItem(value: '', child: Text('All')), for (final x in suppliers) DropdownMenuItem(value: x, child: Text(x))],
              onChanged: (v) => setState(() => _supplier = v ?? ''),
            )),
          ]),
          const SizedBox(height: 8),
          Expanded(
            child: list.isEmpty
                ? EmptyState(all.isEmpty ? 'No deliveries yet. Each delivery you receive in Add Stock is kept here with its invoice, to view or correct.' : 'No deliveries match')
                : ListView.separated(
                    itemCount: list.length + 1,
                    separatorBuilder: (_, _) => const Divider(height: 1),
                    itemBuilder: (_, i) {
                      if (i == list.length) {
                        return ListTile(title: Text('Total · ${list.length} deliveries', style: const TextStyle(fontWeight: FontWeight.w700)),
                            trailing: Text('${st.money(total)}${owed > 0 ? ' · unpaid ${st.money(owed)}' : ''}', style: const TextStyle(fontWeight: FontWeight.w800)));
                      }
                      final p = list[i];
                      return ListTile(
                        title: Text('${p.number} · ${p.supplierName}${p.raw['editedAt'] != null ? ' · edited' : ''}'),
                        subtitle: Text('${p.date} · ${payType(p)} · invoice ${p.invoice.isEmpty ? '—' : p.invoice} · ${p.items.length} lines · by ${p.receivedBy}${p.notes.isEmpty ? '' : ' · ${p.notes}'}'),
                        trailing: Row(mainAxisSize: MainAxisSize.min, children: [
                          Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.end, children: [
                            Text(st.money(p.total), style: const TextStyle(fontWeight: FontWeight.w700)),
                            if (p.total > p.paid) Text('${st.money(p.total - p.paid)} unpaid', style: TextStyle(color: Colors.orange.shade800, fontSize: 12)),
                          ]),
                          TextButton(onPressed: () => _view(p, st, payType(p)), child: const Text('View')),
                          if (can.contains('purchases.edit') && p.raw['imported'] == null)
                            TextButton(key: Key('edit-${p.number}'), onPressed: () => showDialog<void>(context: context, builder: (_) => PurchaseEditor(purchase: p.toRecord())), child: const Text('Edit')),
                        ]),
                        onTap: () => _view(p, st, payType(p)),
                      );
                    },
                  ),
          ),
        ],
      ]),
    );
  }

  Future<void> _view(Purchase p, PharmacySettings st, String pay) => showDialog<void>(
        context: context,
        builder: (c) => AlertDialog(
          title: Text('Purchase ${p.number}'),
          content: SizedBox(
            width: 600,
            child: SingleChildScrollView(child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('${p.supplierName} · invoice ${p.invoice.isEmpty ? '—' : p.invoice} · ${p.date} · $pay'),
              if (p.notes.isNotEmpty) Text('Notes: ${p.notes}'),
              const Divider(),
              for (final it in p.items)
                ListTile(dense: true, title: Text(it.name), subtitle: Text('batch ${it.batch.isEmpty ? '—' : it.batch} · expires ${it.expiry.isEmpty ? '—' : it.expiry}'),
                    trailing: Text('${it.pack != null ? '${formatQty(it.pack!.count)} ${it.pack!.name} = ' : ''}${formatQty(it.qty)} × ${st.money(it.cost)} = ${st.money(it.qty * it.cost)}')),
              Text('Total ${st.money(p.total)} · paid ${st.money(p.paid)}', style: const TextStyle(fontWeight: FontWeight.w800)),
            ])),
          ),
          actions: [FilledButton(onPressed: () => Navigator.pop(c), child: const Text('Close'))],
        ),
      );
}

class _DeliveryDrafts extends ConsumerWidget {
  const _DeliveryDrafts({required this.drafts, required this.settings});
  final List<Draft> drafts;
  final PharmacySettings settings;
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final session = ref.watch(sessionControllerProvider).value;
    if (drafts.isEmpty) return const EmptyState('No delivery drafts. In Add Stock, "Save as draft" keeps a delivery to finish later or on another device.');
    final list = [...drafts]..sort((a, b) => a.order.compareTo(b.order));
    return ListView(children: [
      for (final x in list)
        Card(
          child: ListTile(
            leading: Icon(x.raw['scan'] != null ? Icons.document_scanner_outlined : Icons.inventory_2_outlined),
            title: Text(x.title),
            subtitle: Text([
              '${x.count.round()} item${x.count.round() == 1 ? '' : 's'}',
              if ('${x.raw['invoice'] ?? ''}'.isNotEmpty) 'invoice ${x.raw['invoice']}',
              x.userId == session?.userId ? 'started by you' : 'started by ${x.userName}',
              ageText(x.startedAt),
              if (x.raw['scan'] case final Map scan) 'scanned · ${(scan['unclear'] as num? ?? 0) > 0 ? '${scan['unclear']} line(s) to check' : 'every line read clearly'}${scan['totalMatches'] == false ? ' · lines don\'t add up to the invoice total' : ''}',
            ].join(' · '), style: TextStyle(color: isOldDraft(x) ? Theme.of(context).colorScheme.error : null)),
            trailing: Wrap(spacing: 4, crossAxisAlignment: WrapCrossAlignment.center, children: [
              Text(settings.money(x.total)),
              FilledButton.tonal(onPressed: () => context.go('/add-stock?draft=${x.id}'), child: Text(x.userId == session?.userId ? 'Continue' : 'Take over')),
              IconButton(tooltip: 'Discard', icon: const Icon(Icons.delete_outline), onPressed: () async {
                if (!await confirmAction(context, 'Discard this delivery draft?', '${x.title} · ${x.count.round()} item(s) · ${settings.money(x.total)}. Nothing in stock changes.', 'Discard')) return;
                final branch = (await ref.read(pharmacyProvider.future)).branch;
                await ref.read(recordStoreProvider).update((dd) {
                  dd.del('drafts', x.id);
                  dd.audit(session?.userName ?? '', 'Draft discarded', 'Delivery "${x.title}" (${x.count.round()} items, ${settings.money(x.total)}) started by ${x.userName} ${ageText(x.startedAt)}', branch);
                });
              }),
            ]),
          ),
        ),
    ]);
  }
}

class _SupplierPrices extends StatelessWidget {
  const _SupplierPrices({required this.rows, required this.q, required this.names, required this.settings});
  final List<Map<String, Object?>> rows;
  final String q;
  final Map<String, String> names;
  final PharmacySettings settings;
  @override
  Widget build(BuildContext context) {
    final list = [
      for (final e in supplierPrices(rows).entries)
        if (e.value.length > 1)
          (pid: e.key, name: names[e.key] ?? '—', list: e.value, gap: e.value.last.cost - e.value.first.cost, pct: ((e.value.last.cost - e.value.first.cost) / e.value.first.cost * 100).round()),
    ].where((r) => q.trim().isEmpty || r.name.toLowerCase().contains(q.trim().toLowerCase())).toList()
      ..sort((a, b) => b.pct.compareTo(a.pct));
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Row(children: [
        const Expanded(child: Text('Medicines you have bought from more than one supplier, with the price each charged last time. Reorder buys from the cheapest by default.')),
        ExportButtons(name: 'supplier-prices', settings: settings, title: 'Supplier prices', subtitle: '${list.length} medicines with more than one supplier', pdf: () => [
          PdfTable(head: const ['Medicine', 'Cheapest', 'Others (last price)', 'Price gap'], body: [
            for (final r in list)
              [r.name, '${r.list.first.supplierName} ${settings.money(r.list.first.cost)}', r.list.skip(1).map((o) => '${o.supplierName}: ${settings.money(o.cost)}').join('; '), '${r.pct}%'],
          ]),
        ]),
      ]),
      Expanded(
        child: list.isEmpty
            ? const EmptyState('Buy the same medicine from two suppliers and their prices are compared here.')
            : ListView(children: [
                for (final r in list)
                  ListTile(
                    title: Text(r.name, style: const TextStyle(fontWeight: FontWeight.w700)),
                    subtitle: Text('Cheapest: ${r.list.first.supplierName} ${settings.money(r.list.first.cost)} (${r.list.first.date})\n'
                        '${r.list.skip(1).map((o) => '${o.supplierName}: ${settings.money(o.cost)} (${o.date})').join('\n')}'),
                    isThreeLine: true,
                    trailing: Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.end, children: [
                      Text('${r.pct}%', style: TextStyle(fontWeight: FontWeight.w800, color: r.pct >= 10 ? Colors.orange.shade800 : null)),
                      Text('${settings.money(r.gap)} per unit', style: const TextStyle(fontSize: 12)),
                    ]),
                  ),
              ]),
      ),
    ]);
  }
}

/// Correct a past delivery (purchases.edit): change any line, remove lines, add lines that were missed; a reason.
/// Or delete it entirely (its stock goes back out).
class PurchaseEditor extends ConsumerStatefulWidget {
  const PurchaseEditor({super.key, required this.purchase});
  final Map<String, Object?> purchase;
  @override
  ConsumerState<PurchaseEditor> createState() => _PurchaseEditorState();
}

class _PurchaseEditorState extends ConsumerState<PurchaseEditor> {
  late var _lines = editLinesOf(widget.purchase);
  late String _supplierId = '${widget.purchase['supplierId'] ?? ''}';
  late final _invoice = TextEditingController(text: '${widget.purchase['invoice'] ?? ''}'), _notes = TextEditingController(text: '${widget.purchase['notes'] ?? ''}');
  late final _paid = TextEditingController(text: formatQty((widget.purchase['paid'] ?? widget.purchase['total']) as num? ?? 0));
  late String _date = '${widget.purchase['date'] ?? today()}';
  final _reason = TextEditingController();
  int _round = 0;

  @override
  Widget build(BuildContext context) {
    final d = ref.watch(pharmacyProvider).value;
    if (d == null) return const SizedBox();
    final st = d.settings;
    final pu = widget.purchase;
    final orig = ((pu['items'] as List?) ?? const []).cast<Map>();
    final total = _lines.where((l) => !l.removed).fold<double>(0, (a, l) => a + l.qty * l.cost);
    Widget numBox(String key, double v, ValueChanged<double> on, {double w = 80, String label = ''}) => SizedBox(
        width: w,
        child: TextFormField(key: Key('$key-$_round'), initialValue: formatQty(v), keyboardType: TextInputType.number, decoration: InputDecoration(labelText: label, isDense: true),
            onChanged: (x) => setState(() => on(double.tryParse(x) ?? 0))));
    return AlertDialog(
      title: Text('Edit purchase ${pu['number']}'),
      content: SizedBox(
        width: 820,
        child: SingleChildScrollView(child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Wrap(spacing: 12, runSpacing: 8, children: [
            SizedBox(width: 220, child: DropdownButtonFormField<String>(
              initialValue: d.suppliers.any((x) => x.id == _supplierId) ? _supplierId : null,
              isExpanded: true,
              decoration: const InputDecoration(labelText: 'Supplier'),
              items: [for (final x in [...d.suppliers]..sort((a, b) => a.name.compareTo(b.name))) DropdownMenuItem(value: x.id, child: Text(x.name))],
              onChanged: (v) => setState(() => _supplierId = v ?? ''),
            )),
            SizedBox(width: 140, child: TextField(controller: _invoice, decoration: const InputDecoration(labelText: 'Invoice no.'))),
            SizedBox(width: 200, child: TextField(controller: _notes, decoration: const InputDecoration(labelText: 'Notes'))),
            DateBox(label: 'Date', value: _date, onChanged: (v) => setState(() => _date = v)),
            SizedBox(width: 120, child: TextField(controller: _paid, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Amount paid'))),
          ]),
          const SizedBox(height: 8),
          for (final (k, l) in _lines.indexed)
            Opacity(
              opacity: l.removed ? .5 : 1,
              child: Row(children: [
                SizedBox(
                  width: 220,
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    OutlinedButton(
                      onPressed: l.removed ? null : () async {
                        final p = await showDialog<Product>(context: context, builder: (_) => _PickMedicine(data: d));
                        if (p != null) setState(() => _lines[k] = _lines[k].copyWith(productId: p.id, name: p.name, cost: l.orig == null && l.cost == 0 ? p.cost : null));
                      },
                      child: Text(l.name.isEmpty ? 'Choose medicine…' : l.name, overflow: TextOverflow.ellipsis),
                    ),
                    if (!l.removed && l.orig != null && l.productId != '${orig[l.orig!]['productId']}')
                      Text('was ${orig[l.orig!]['name']}: its stock is taken back, this one is added', style: TextStyle(fontSize: 11, color: Colors.orange.shade800)),
                    if (!l.removed && l.orig == null) const Text('added on this edit', style: TextStyle(fontSize: 11)),
                  ]),
                ),
                const SizedBox(width: 6),
                SizedBox(width: 100, child: TextFormField(key: Key('b-$k-$_round'), initialValue: l.batch, enabled: !l.removed, decoration: const InputDecoration(labelText: 'Batch', isDense: true),
                    onChanged: (v) => _lines[k] = _lines[k].copyWith(batch: v))),
                const SizedBox(width: 6),
                SizedBox(width: 120, child: TextFormField(key: Key('e-$k-$_round'), initialValue: l.expiry, enabled: !l.removed, decoration: const InputDecoration(labelText: 'Expiry', hintText: 'YYYY-MM-DD', isDense: true),
                    onChanged: (v) => _lines[k] = _lines[k].copyWith(expiry: v.trim()))),
                const SizedBox(width: 6),
                numBox('q-$k', l.qty, (v) => _lines[k] = _lines[k].copyWith(qty: v), label: 'Qty'),
                const SizedBox(width: 6),
                numBox('c-$k', l.cost, (v) => _lines[k] = _lines[k].copyWith(cost: v), label: 'Cost', w: 100),
                SizedBox(width: 110, child: Text(l.removed ? 'removed' : st.money(l.qty * l.cost), textAlign: TextAlign.right)),
                l.removed
                    ? TextButton(onPressed: () => setState(() => _lines[k] = l.copyWith(removed: false)), child: const Text('Undo'))
                    : IconButton(tooltip: 'Remove this line', icon: const Icon(Icons.delete_outline), onPressed: () => setState(() {
                        if (l.orig == null) {
                          _lines = [..._lines]..removeAt(k);
                          _round++;
                        } else {
                          _lines[k] = l.copyWith(removed: true);
                        }
                      })),
              ]),
            ),
          Row(children: [
            TextButton.icon(onPressed: () => setState(() => _lines = [..._lines, const PurchaseEditLine(productId: '', name: '', qty: 1, cost: 0)]), icon: const Icon(Icons.add), label: const Text('Add an item')),
            const Expanded(child: Text("A removed line takes its stock back out; an added line puts stock in. Stock already sold can't be taken back.", style: TextStyle(fontSize: 12))),
          ]),
          TextField(key: const Key('purchase-reason'), controller: _reason, decoration: const InputDecoration(labelText: 'Reason for the change (kept in the audit log)', hintText: 'e.g. invoice quantity was 50 not 60; 2 items were missed')),
          const SizedBox(height: 8),
          Row(children: [const Expanded(child: Text('Was')), Text(st.money((pu['total'] as num?) ?? 0))]),
          Row(children: [const Expanded(child: Text('New total', style: TextStyle(fontWeight: FontWeight.w800))), Text(st.money(total), style: const TextStyle(fontWeight: FontWeight.w800))]),
        ])),
      ),
      actions: [
        TextButton.icon(
          key: const Key('purchase-delete'),
          style: TextButton.styleFrom(foregroundColor: Theme.of(context).colorScheme.error),
          icon: const Icon(Icons.delete_outline),
          label: const Text('Delete delivery'),
          onPressed: () async {
            if (_reason.text.trim().isEmpty) return say(context, 'Say why the delivery is being deleted (in the reason box)', error: true);
            final ok = await confirmAction(context, 'Delete ${pu['number']}?',
                'Its stock (${orig.length} line${orig.length == 1 ? '' : 's'}) goes back out of the batches it came in, and the delivery is removed on every device. '
                    'Payments already made to the supplier stay as they are. The audit log keeps what it was.',
                'Delete');
            if (!ok || !context.mounted) return;
            final user = (await ref.read(sessionControllerProvider.future))?.userName ?? '';
            final batches = (await ref.read(recordStoreProvider).rows('batches')).map(Batch.fromRecord).toList();
            try {
              await deletePurchase(ref.read(recordStoreProvider), pu, reason: _reason.text, user: user, settings: st,
                  batchesOf: (id, br) => StockView(products: d.products, batches: batches, index: d.stock.index, branch: br).batchesOf(id));
              if (!context.mounted) return;
              Navigator.pop(context);
              say(context, '${pu['number']} deleted; its stock was taken back out');
            } on DeliveryProblem catch (e) {
              if (context.mounted) say(context, e.message, error: true);
            }
          },
        ),
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
        FilledButton(
          onPressed: () async {
            final user = (await ref.read(sessionControllerProvider.future))?.userName ?? '';
            final sup = d.suppliers.where((x) => x.id == _supplierId).firstOrNull;
            final batches = (await ref.read(recordStoreProvider).rows('batches')).map(Batch.fromRecord).toList();
            try {
              await editPurchase(ref.read(recordStoreProvider), pu, _lines, supplierId: _supplierId, supplierName: sup?.name ?? '', invoice: _invoice.text.trim(), notes: _notes.text,
                  date: _date, paid: double.tryParse(_paid.text) ?? 0, reason: _reason.text, user: user, settings: st,
                  batchesOf: (id, br) => StockView(products: d.products, batches: batches, index: d.stock.index, branch: br).batchesOf(id));
              if (!context.mounted) return;
              Navigator.pop(context);
              say(context, '${pu['number']} updated; stock adjusted');
            } on DeliveryProblem catch (e) {
              if (context.mounted) say(context, e.message, error: true);
            }
          },
          child: const Text('Save changes'),
        ),
      ],
    );
  }
}

class _PickMedicine extends StatefulWidget {
  const _PickMedicine({required this.data});
  final PharmacyData data;
  @override
  State<_PickMedicine> createState() => _PickMedicineState();
}

class _PickMedicineState extends State<_PickMedicine> {
  String _q = '';
  @override
  Widget build(BuildContext context) {
    final d = widget.data;
    final found = searchProducts(d.products, _q, stockOf: (p) => d.stockOf(p.id)).take(40).toList();
    return AlertDialog(
      title: TextField(autofocus: true, decoration: const InputDecoration(prefixIcon: Icon(Icons.search), hintText: 'Search medicine…'), onChanged: (v) => setState(() => _q = v)),
      content: SizedBox(width: 440, height: 380, child: ListView(children: [
        for (final p in found) ListTile(title: Text(p.name), trailing: Text('${formatQty(d.stockOf(p.id))} in stock'), onTap: () => Navigator.pop(context, p)),
      ])),
    );
  }
}

/// Reorder & dead stock (src/pages/Reorder.jsx): suggestions from how fast each item really sells (buy from the
/// cheapest or the last supplier, or pick one), reorder levels from sales, dead stock, purchase orders (create, open,
/// print, WhatsApp to the supplier, receive, delete).
class ReorderScreen extends ConsumerStatefulWidget {
  const ReorderScreen({super.key});
  @override
  ConsumerState<ReorderScreen> createState() => _ReorderScreenState();
}

class _ReorderScreenState extends ConsumerState<ReorderScreen> {
  String _tab = 'reorder';
  int _window = 30;
  int? _lead, _cover, _dead;
  bool _cheapest = true;
  double _z = 1.65, _orderCost = 20000, _holding = 25;
  final _picked = <String, bool>{};
  final _chosen = <String, String>{};

  @override
  Widget build(BuildContext context) {
    final d = ref.watch(pharmacyProvider).value;
    final sales = ref.watch(tableProvider('sales')).value;
    final purchases = ref.watch(tableProvider('purchases')).value;
    final pos = ref.watch(tableProvider('purchaseOrders')).value ?? const [];
    final can = ref.watch(permissionsProvider).value ?? const <String>{};
    if (d == null || sales == null || purchases == null) return const Center(child: CircularProgressIndicator());
    final st = d.settings;
    int setting(String k, int def) => (st.raw[k] as num?)?.round() ?? def;
    final lead = _lead ?? setting('leadDays', 7), cover = _cover ?? setting('coverDays', 30), deadDays = _dead ?? setting('deadDays', 90);
    final saleList = sales.map(Sale.fromRecord).toList();
    final v = salesVelocity(saleList, days: _window, branch: d.branch);
    final prices = supplierPrices(purchases);
    final method = OrderMethod.values.where((m) => m.name == ref.watch(deviceValueProvider('orderMethod')).value).firstOrNull ?? OrderMethod.cover;
    final suggestions = orderSuggestions(d.products, d.stockOf, dailyDemand(saleList, days: _window, branch: d.branch), method: method, window: _window, lead: lead,
        cover: cover, z: _z, orderCost: _orderCost, holdingRate: _holding / 100, prices: prices, last: lastBuys(purchases), fromCheapest: _cheapest, chosen: _chosen);
    final dead = deadStock(d.products, d.stockOf, v.lastSale, deadDays: deadDays);
    final chosen = suggestions.where((r) => _picked[r.p.id] ?? true).toList();
    final orders = pos.where((o) => (o['branchId'] ?? 'main') == d.branch).toList()..sort((a, b) => '${b['date']}'.compareTo('${a['date']}'));
    final deadValue = dead.fold<double>(0, (a, r) => a + r.value);
    Widget numBox(String label, int value, ValueChanged<int> set) => SizedBox(width: 170,
        child: TextFormField(initialValue: '$value', keyboardType: TextInputType.number, decoration: InputDecoration(labelText: label, isDense: true), onChanged: (x) => setState(() => set(int.tryParse(x) ?? value))));
    return PageFrame(
      title: 'Reorder & dead stock',
      subtitle: 'Based on how fast each item really sells',
      scroll: true,
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        StatGrid(children: [
          StatCard(label: 'Need reordering', value: '${suggestions.length}', sub: 'cover ${lead + cover} days', color: Colors.orange.shade800),
          StatCard(label: 'Est. order value', value: st.money(suggestions.fold<double>(0, (a, r) => a + r.cost))),
          StatCard(label: 'Dead stock', value: '${dead.length}', sub: '${st.money(deadValue)} tied up', color: Theme.of(context).colorScheme.error),
          StatCard(label: 'Open purchase orders', value: '${orders.where((o) => o['status'] != 'Received').length}', color: Colors.deepPurple),
        ]),
        const SizedBox(height: 12),
        Align(
          alignment: Alignment.centerLeft,
          child: SegmentedButton<String>(
            segments: const [ButtonSegment(value: 'reorder', label: Text('Reorder suggestions')), ButtonSegment(value: 'dead', label: Text('Dead stock')), ButtonSegment(value: 'orders', label: Text('Purchase orders'))],
            selected: {_tab},
            onSelectionChanged: (x) => setState(() => _tab = x.first),
          ),
        ),
        const SizedBox(height: 8),
        if (_tab == 'reorder') ...[
          Wrap(spacing: 12, runSpacing: 8, crossAxisAlignment: WrapCrossAlignment.end, children: [
            DropdownButton<int>(value: _window, items: const [DropdownMenuItem(value: 30, child: Text('Last 30 days')), DropdownMenuItem(value: 60, child: Text('Last 60 days')), DropdownMenuItem(value: 90, child: Text('Last 90 days'))],
                onChanged: (x) => setState(() => _window = x ?? 30)),
            numBox('Supplier lead time (days)', lead, (x) => _lead = x),
            numBox('Order enough for (days)', cover, (x) => _cover = x),
            ExportButtons(name: 'reorder', settings: st, csv: () => [
              for (final r in chosen)
                {'medicine': r.p.name, 'inStock': r.stock, 'soldPerDay': r.perDay.toStringAsFixed(2), 'daysLeft': r.daysLeft.isFinite ? r.daysLeft.floor() : '', 'orderQty': r.qty,
                  'supplier': r.buy?.supplierName ?? '', 'lastCost': (r.buy?.cost ?? 0) > 0 ? r.buy!.cost : r.p.cost},
            ]),
            if (can.contains('medicines.manage'))
              OutlinedButton.icon(onPressed: () => _levels(saleList, d), icon: const Icon(Icons.auto_fix_high), label: const Text('Set reorder levels from sales')),
            FilledButton.icon(
              onPressed: chosen.isEmpty ? null : () async {
                final groups = {for (final r in chosen) r.buy?.supplierId ?? ''}.length;
                if (!await confirmAction(context, 'Create $groups purchase order${groups == 1 ? '' : 's'}?', '${chosen.length} medicines, grouped by the supplier you buy each from.', 'Create')) return;
                final user = (await ref.read(sessionControllerProvider.future))?.userName ?? '';
                await createPurchaseOrders(ref.read(recordStoreProvider), chosen, supplierNames: {for (final x in d.suppliers) x.id: x.name}, user: user, branchId: d.branch);
                if (!context.mounted) return;
                say(context, 'Purchase orders created');
                setState(() => _tab = 'orders');
              },
              icon: const Icon(Icons.assignment_outlined),
              label: Text('Create purchase orders (${chosen.length})'),
            ),
          ]),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                Wrap(spacing: 12, runSpacing: 8, crossAxisAlignment: WrapCrossAlignment.center, children: [
                  const Text('Order quantity method', style: TextStyle(fontWeight: FontWeight.w700)),
                  DropdownButton<OrderMethod>(
                    key: const Key('order-method'),
                    value: method,
                    items: [for (final m in OrderMethod.values) DropdownMenuItem(value: m, child: Text(orderMethodInfo[m]!.$1))],
                    onChanged: (m) => ref.read(deviceValueProvider('orderMethod').notifier).set(m?.name),
                  ),
                  if (method != OrderMethod.cover && method != OrderMethod.minMax)
                    DropdownButton<double>(
                      value: _z,
                      items: [for (final (l, z) in serviceLevels) DropdownMenuItem(value: z, child: Text('Service level $l'))],
                      onChanged: (z) => setState(() => _z = z ?? 1.65),
                    ),
                  if (method == OrderMethod.eoq) ...[
                    SizedBox(width: 170, child: TextFormField(initialValue: formatQty(_orderCost), keyboardType: TextInputType.number,
                        decoration: InputDecoration(labelText: 'Cost of one order (${st.currency})', isDense: true), onChanged: (x) => setState(() => _orderCost = double.tryParse(x) ?? _orderCost))),
                    SizedBox(width: 170, child: TextFormField(initialValue: formatQty(_holding), keyboardType: TextInputType.number,
                        decoration: const InputDecoration(labelText: 'Holding cost a year (%)', isDense: true), onChanged: (x) => setState(() => _holding = double.tryParse(x) ?? _holding))),
                  ],
                ]),
                const SizedBox(height: 4),
                Text(orderMethodInfo[method]!.$2, style: Theme.of(context).textTheme.bodySmall),
                ExpansionTile(
                  tilePadding: EdgeInsets.zero,
                  title: const Text('Which method to use?'),
                  children: [
                    Text('Recommended: Smart mix. Most medicines in a busy pharmacy sell every day, and a safety stock sized to how much their sales vary '
                        'protects against stock-outs; slow movers are better kept with a simple Min / Max so money and shelf life are not tied up. '
                        'Use EOQ when each order is expensive to place (transport from Kampala, a minimum order value); use Order-up-to when you order on '
                        'fixed days. A higher service level means fewer stock-outs but more stock on the shelf. Whatever the method, the reorder level on '
                        'each medicine still drives the Low stock alerts.\n', style: Theme.of(context).textTheme.bodySmall),
                    for (final m in OrderMethod.values)
                      ListTile(dense: true, contentPadding: EdgeInsets.zero, selected: m == method, title: Text(orderMethodInfo[m]!.$1), subtitle: Text(orderMethodInfo[m]!.$2),
                          onTap: () => ref.read(deviceValueProvider('orderMethod').notifier).set(m.name)),
                  ],
                ),
              ]),
            ),
          ),
          Row(children: [
            const Text('Order each medicine from  '),
            SegmentedButton<bool>(segments: const [ButtonSegment(value: true, label: Text('Cheapest supplier')), ButtonSegment(value: false, label: Text('Last supplier'))],
                selected: {_cheapest}, onSelectionChanged: (x) => setState(() {
                  _cheapest = x.first;
                  _chosen.clear();
                })),
          ]),
          if (suggestions.isEmpty) const Padding(padding: EdgeInsets.all(16), child: Text('Stock levels look healthy. Nothing needs ordering.')),
          for (final r in suggestions)
            ListTile(
              leading: Checkbox(value: _picked[r.p.id] ?? true, onChanged: (x) => setState(() => _picked[r.p.id] = x ?? false)),
              title: Text(r.p.name, style: const TextStyle(fontWeight: FontWeight.w700)),
              subtitle: Wrap(crossAxisAlignment: WrapCrossAlignment.center, spacing: 8, children: [
                if (r.why.isNotEmpty) SizedBox(width: double.infinity, child: Text(r.why, style: Theme.of(context).textTheme.bodySmall?.copyWith(color: Theme.of(context).colorScheme.tertiary))),
                Text('in stock ${formatQty(r.stock)} · sells ${r.perDay.toStringAsFixed(1)}/day · days left ${r.daysLeft.isFinite ? r.daysLeft.floor() : '—'} · buy from'),
                if (r.options.length > 1)
                  DropdownButton<String>(
                    value: r.buy?.supplierId,
                    isDense: true,
                    items: [for (final (n, o) in r.options.indexed) DropdownMenuItem(value: o.supplierId, child: Text('${n == 0 ? '★ ' : ''}${o.supplierName} · ${st.money(o.cost)}'))],
                    onChanged: (x) => setState(() => _chosen[r.p.id] = x ?? ''),
                  )
                else
                  Text(r.buy?.supplierName ?? '—'),
                if (r.options.length > 1 && r.buy != null && r.buy!.cost > r.options.first.cost)
                  Text('${st.money(r.buy!.cost - r.options.first.cost)} more than ${r.options.first.supplierName}', style: TextStyle(color: Colors.orange.shade800, fontSize: 12)),
              ]),
              trailing: Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.end, children: [
                Text('order ${formatQty(r.qty)}', style: const TextStyle(fontWeight: FontWeight.w800)),
                Text(st.money(r.cost), style: Theme.of(context).textTheme.bodySmall),
              ]),
            ),
        ],
        if (_tab == 'dead') ...[
          Wrap(spacing: 12, crossAxisAlignment: WrapCrossAlignment.center, children: [
            numBox('Not sold for at least (days)', deadDays, (x) => _dead = x < 7 ? 90 : x),
            const Text('Consider returning these to the supplier, discounting them, or moving them to a branch where they sell.'),
          ]),
          if (dead.isEmpty) const Padding(padding: EdgeInsets.all(16), child: Text('No dead stock. Everything is moving.')),
          for (final r in dead)
            ListTile(
              title: Text(r.p.name, style: const TextStyle(fontWeight: FontWeight.w700)),
              subtitle: Text('last sold ${r.last.isEmpty ? 'never' : '${dayOf(r.last)} (${r.idle} days)'} · in stock ${formatQty(r.stock)}'
                  '${d.stock.batchesOf(r.p.id).where((b) => b.qty > 0 && b.expiry.isNotEmpty).firstOrNull?.expiry.let((e) => ' · next expiry $e') ?? ''}'),
              trailing: Text(st.money(r.value), style: const TextStyle(fontWeight: FontWeight.w700)),
            ),
        ],
        if (_tab == 'orders') ...[
          if (orders.isEmpty) const Padding(padding: EdgeInsets.all(16), child: Text('No purchase orders yet. Create them from Reorder suggestions.')),
          for (final po in orders)
            ListTile(
              title: Text('${po['number']} · ${po['supplierName']}', style: const TextStyle(fontWeight: FontWeight.w700)),
              subtitle: Text('${dayOf('${po['date']}')} · ${((po['items'] as List?) ?? const []).length} lines · ${po['status']}'),
              trailing: Wrap(spacing: 6, crossAxisAlignment: WrapCrossAlignment.center, children: [
                Text(st.money(_poValue(po))),
                TextButton(onPressed: () => _openPo(po, d), child: const Text('Open')),
                if (po['status'] != 'Received') FilledButton.tonal(onPressed: () => context.go('/add-stock?po=${po['id']}'), child: const Text('Receive')),
              ]),
            ),
        ],
      ]),
    );
  }

  double _poValue(Map<String, Object?> po) => ((po['items'] as List?) ?? const []).cast<Map>().fold<double>(0, (a, i) => a + ((i['qty'] as num?) ?? 0) * ((i['cost'] as num?) ?? 0));

  Future<void> _levels(List<Sale> sales, PharmacyData d) async {
    final st = d.settings;
    final days = (st.raw['autoReorderDays'] as num?)?.round() ?? 30, lead = (st.raw['leadDays'] as num?)?.round() ?? 7, safety = (st.raw['safetyDays'] as num?)?.round() ?? 7;
    final changes = computeReorderLevels(sales, d.products, days: days, lead: lead, safety: safety, branch: d.branch);
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('Reorder levels from sales'),
        content: SizedBox(
          width: 520,
          child: ListView(shrinkWrap: true, children: [
            Text('Level = average daily sales over the last $days days × (lead time $lead + safety $safety days). Only medicines that sold are changed. '
                '${st.raw['autoReorder'] == false ? 'Weekly automatic updates are off (Settings → Receipts & stock).' : 'RxPOS also does this automatically every week.'}'),
            if (changes.isEmpty) const Padding(padding: EdgeInsets.all(12), child: Text('All reorder levels already match recent sales.')),
            for (final x in changes)
              ListTile(dense: true, title: Text(x.product.name), subtitle: Text('sold ${formatQty(x.sold)} · ${x.perDay.toStringAsFixed(1)} a day'),
                  trailing: Text('${formatQty(x.product.reorder)} → ${x.level}', style: const TextStyle(fontWeight: FontWeight.w700))),
          ]),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Cancel')),
          FilledButton(onPressed: changes.isEmpty ? null : () => Navigator.pop(c, true), child: Text('Apply ${changes.length} change${changes.length == 1 ? '' : 's'}')),
        ],
      ),
    );
    if (ok != true) return;
    final user = (await ref.read(sessionControllerProvider.future))?.userName ?? '';
    await applyReorderLevels(ref.read(recordStoreProvider), changes, user: user, branchId: d.branch);
    if (mounted) say(context, '${changes.length} reorder levels updated');
  }

  Future<void> _openPo(Map<String, Object?> po, PharmacyData d) async {
    final st = d.settings;
    final supplier = d.suppliers.where((x) => x.id == po['supplierId']).firstOrNull;
    final phone = normalizePhone(supplier?.phone ?? '');
    final items = ((po['items'] as List?) ?? const []).cast<Map>();
    Future<void> markSent() async {
      if (po['status'] == 'Draft') await ref.read(recordStoreProvider).update((x) => x.put('purchaseOrders', {...po, 'status': 'Sent'}));
    }

    await showDialog<void>(
      context: context,
      builder: (c) => AlertDialog(
        title: Text('Purchase order ${po['number']}'),
        content: SizedBox(
          width: 520,
          child: SingleChildScrollView(child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Text('${st.name} · ${dayOf('${po['date']}')}\nTo: ${po['supplierName']} · ${po['status']}'),
            const Divider(),
            for (final (n, i) in items.indexed)
              Row(children: [Expanded(child: Text('${n + 1}. ${i['name']} × ${formatQty(i['qty'] as num? ?? 0)} @ ${st.money(i['cost'] as num? ?? 0)}')), Text(st.money(((i['qty'] as num?) ?? 0) * ((i['cost'] as num?) ?? 0)))]),
            const Divider(),
            Text('Estimated total ${st.money(_poValue(po))}', style: const TextStyle(fontWeight: FontWeight.w800), textAlign: TextAlign.right),
          ])),
        ),
        actions: [
          if (po['status'] != 'Received')
            TextButton(
              style: TextButton.styleFrom(foregroundColor: Theme.of(c).colorScheme.error),
              onPressed: () async {
                if (!await confirmAction(c, 'Delete this purchase order?', '${po['number']} · ${po['supplierName']}', 'Delete')) return;
                await ref.read(recordStoreProvider).update((x) => x.del('purchaseOrders', po['id'] as String));
                if (c.mounted) Navigator.pop(c);
              },
              child: const Text('Delete'),
            ),
          TextButton.icon(
            onPressed: phone.length < 12 ? null : () async {
              await markSent();
              await launchUrl(Uri.parse(whatsappLink(phone, poText(po, st.name))), mode: LaunchMode.externalApplication);
            },
            icon: const Icon(Icons.chat_outlined),
            label: Text(phone.length < 12 ? 'Add the supplier’s phone number first' : 'WhatsApp to supplier'),
          ),
          FilledButton.icon(
            onPressed: () async {
              await markSent();
              await Printing.layoutPdf(name: '${po['number']}', onLayout: (_) => tablesPdf(st, title: 'Purchase order ${po['number']}', subtitle: 'To: ${po['supplierName']} · ${dayOf('${po['date']}')}', tables: [
                PdfTable(head: const ['#', 'Medicine', 'Qty', 'Last cost', 'Total'], numeric: const [2, 3, 4], body: [
                  for (final (n, i) in items.indexed) ['${n + 1}', '${i['name']}', formatQty(i['qty'] as num? ?? 0), st.money(i['cost'] as num? ?? 0), st.money(((i['qty'] as num?) ?? 0) * ((i['cost'] as num?) ?? 0))],
                ], foot: ['', '', '', 'Estimated total', st.money(_poValue(po))]),
              ]));
            },
            icon: const Icon(Icons.print),
            label: const Text('Print'),
          ),
        ],
      ),
    );
  }
}

extension _Let<T> on T {
  R let<R>(R Function(T) f) => f(this);
}

/// Expiring / Expired (src/pages/Inventory.jsx Expiry): batches in stock expiring within the warning days, or expired,
/// earliest first; return one to the supplier, or write off an expired one; PDF.
class ExpiryScreen extends ConsumerStatefulWidget {
  const ExpiryScreen({super.key});
  @override
  ConsumerState<ExpiryScreen> createState() => _ExpiryScreenState();
}

class _ExpiryScreenState extends ConsumerState<ExpiryScreen> {
  String _tab = 'soon';

  @override
  Widget build(BuildContext context) {
    final d = ref.watch(pharmacyProvider).value;
    final can = ref.watch(permissionsProvider).value ?? const <String>{};
    final session = ref.watch(sessionControllerProvider).value;
    if (d == null) return const Center(child: CircularProgressIndicator());
    final st = d.settings;
    final warn = st.expiryWarnDays.round();
    final e = expiryBatches(d.products.where((p) => d.stockOf(p.id) > 0), d.stock.batchesOf, d.stockOf, warn);
    final rows = _tab == 'expired' ? e.expired : e.soon;
    double worth((Product, BatchStock, int) x) => x.$2.qty * (x.$2.cost != 0 ? x.$2.cost : x.$1.cost);
    final value = rows.fold(0.0, (a, x) => a + worth(x));
    final title = _tab == 'expired' ? 'Expired stock' : 'Expiring within $warn days';
    return PageFrame(
      title: 'Expiring / Expired',
      subtitle: '${rows.length} batches · ${st.money(value)} at cost',
      actions: [
        ExportButtons(
          name: _tab == 'expired' ? 'expired-stock' : 'expiring-stock',
          settings: st,
          title: title,
          subtitle: '${rows.length} batches in stock · ${st.money(value)} at cost',
          pdf: () => [
            PdfTable(head: const ['Medicine', 'Batch', 'Expiry', 'When', 'Qty', 'Value'], numeric: const [4, 5], body: [
              for (final (p, b, days) in rows) [p.name, b.batch, b.expiry, days < 0 ? '${-days} days ago' : days == 0 ? 'today' : 'in $days days', formatQty(b.qty), st.money(b.qty * (b.cost != 0 ? b.cost : p.cost))],
            ]),
          ],
        ),
      ],
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Align(
          alignment: Alignment.centerLeft,
          child: SegmentedButton<String>(
            segments: [ButtonSegment(value: 'soon', label: Text('Expiring within $warn days (${e.soon.length})')), ButtonSegment(value: 'expired', label: Text('Expired (${e.expired.length})'))],
            selected: {_tab},
            onSelectionChanged: (v) => setState(() => _tab = v.first),
          ),
        ),
        const SizedBox(height: 8),
        Expanded(
          child: rows.isEmpty
              ? EmptyState(_tab == 'expired' ? 'No expired stock 🎉' : 'Nothing expiring soon 🎉')
              : ListView.separated(
                  itemCount: rows.length,
                  separatorBuilder: (_, _) => const Divider(height: 1),
                  itemBuilder: (_, i) {
                    final (p, b, days) = rows[i];
                    return ListTile(
                      title: Text(p.name),
                      subtitle: Text('batch ${b.batch} · ${formatQty(b.qty)} in stock · ${st.money(b.qty * (b.cost != 0 ? b.cost : p.cost))} · expires ${b.expiry} (${days < 0 ? '${-days} days ago' : days == 0 ? 'today' : 'in $days days'})'),
                      leading: Icon(days < 0 ? Icons.error_outline : Icons.schedule, color: days < 0 ? Theme.of(context).colorScheme.error : Colors.orange.shade800),
                      trailing: Wrap(spacing: 4, children: [
                        if (can.contains('stock.receive') || can.contains('stock.adjust'))
                          TextButton(onPressed: () => returnDialog(context, ref, p, b, days < 0 ? 'Expired' : 'Short expiry'), child: const Text('Return')),
                        if (_tab == 'expired' && session?.role != 'cashier')
                          TextButton(
                            style: TextButton.styleFrom(foregroundColor: Theme.of(context).colorScheme.error),
                            onPressed: () async {
                              if (!await confirmAction(context, 'Write off expired stock?', '${formatQty(b.qty)} × ${p.name} (batch ${b.batch}) will be removed from stock.', 'Write off')) return;
                              await writeOffBatch(ref.read(recordStoreProvider), p, b, settings: st, user: session?.userName ?? '', branchId: d.branch);
                              if (context.mounted) say(context, '${p.name} batch ${b.batch} written off');
                            },
                            child: const Text('Write off'),
                          ),
                      ]),
                    );
                  },
                ),
        ),
      ]),
    );
  }
}


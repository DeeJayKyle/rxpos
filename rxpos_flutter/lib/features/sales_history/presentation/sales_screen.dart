import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:printing/printing.dart';

import '../../../core/rules/day_close.dart';
import '../../../core/data/device_settings.dart';
import '../../../core/data/pharmacy_providers.dart';
import '../../../core/data/record_store.dart';
import '../../../core/entities/draft.dart';
import '../../../core/entities/sale.dart';
import '../../../core/entities/settings.dart';
import '../../../core/presentation/export.dart';
import '../../../core/presentation/widgets.dart';
import '../../../core/rules/dates.dart';
import '../../../core/rules/money.dart';
import '../../../core/rules/search.dart';
import '../../../core/rules/stock.dart';
import '../../auth/application/session_controller.dart';
import '../../auth/domain/session.dart';
import '../../sales_pos/domain/cart.dart' show walkIn;
import '../../sales_pos/application/sale_controller.dart';
import '../../sales_pos/presentation/checkout_dialogs.dart';
import '../../sales_pos/presentation/receipt.dart';
import '../domain/refund.dart';
import '../domain/sale_edit.dart';

/// Sales History (src/pages/Sales.jsx): every sale, newest first; search, dates, branch, cashier, payment, client and
/// status (completed / refunded / edited); CSV and PDF; open a sale to see its receipt and change history, print the
/// receipt or a full-page invoice, edit it (with a reason) or refund it. The Held sales tab lists drafts.
class SalesScreen extends ConsumerStatefulWidget {
  const SalesScreen({super.key, this.q = '', this.from = '', this.to = ''});
  /// a receipt number to look for (from Sales lines); a day from the dashboard's chart
  final String q, from, to;
  @override
  ConsumerState<SalesScreen> createState() => _SalesScreenState();
}

const _statuses = [('', 'All statuses'), ('completed', 'Completed'), ('refunded', 'Refunded'), ('edited', 'Edited')];

class _SalesScreenState extends ConsumerState<SalesScreen> {
  late String _q = widget.q;
  late String _from = widget.from, _to = widget.to;
  String _cashier = '', _payment = '', _customer = '', _status = '', _tab = 'sales';
  String? _branch;

  @override
  Widget build(BuildContext context) {
    final rows = ref.watch(tableProvider('sales')).value;
    ref.watch(tableProvider('dayCloses')); // step 18: Edit goes away when the day is closed
    final st = ref.watch(settingsProvider).value ?? const PharmacySettings();
    final branches = ref.watch(tableProvider('branches')).value ?? const [];
    final session = ref.watch(sessionControllerProvider).value;
    final deviceBranch = ref.watch(deviceBranchProvider).value ?? mainBranch;
    final data = ref.watch(pharmacyProvider).value;
    if (rows == null) return const Center(child: CircularProgressIndicator());
    final cashier = session?.role == 'cashier';
    final branch = _branch ?? (cashier ? deviceBranch : 'all');
    String branchName(String id) => '${branches.where((b) => b['id'] == (id.isEmpty ? mainBranch : id)).firstOrNull?['name'] ?? '—'}';
    final phoneOf = {for (final c in [...?data?.customers]) c.id: c.phone};

    final inScope = rows.map(Sale.fromRecord).where((s) {
      final d = dayOf(s.date);
      return (branch == 'all' || (s.branchId.isEmpty ? mainBranch : s.branchId) == branch) &&
          (_from.isEmpty || d.compareTo(_from) >= 0) && (_to.isEmpty || d.compareTo(_to) <= 0);
    }).toList();
    List<String> opts(String Function(Sale) f) => ({for (final s in inScope) f(s)}..remove('')).toList()..sort();
    final q = _q.trim().toLowerCase();
    bool edited(Sale s) => ((s.raw['edits'] as List?) ?? const []).isNotEmpty;
    final sales = inScope.where((s) {
      if (q.isNotEmpty && ![s.number, s.customerName, s.cashier, s.payment, s.type, '${(s.raw['momo'] as Map?)?['txid'] ?? ''}', ...s.items.map((i) => i.name)].join(' ').toLowerCase().contains(q)) {
        return false;
      }
      return (_cashier.isEmpty || s.cashier == _cashier) && (_payment.isEmpty || s.payment == _payment) && (_customer.isEmpty || s.customerName == _customer) &&
          (_status.isEmpty || (_status == 'edited' ? edited(s) : _status == 'refunded' ? s.status == 'refunded' : s.status != 'refunded'));
    }).toList()
      ..sort((a, b) => b.date.compareTo(a.date));
    final valid = sales.where((s) => s.status != 'refunded').toList();
    final sum = valid.fold(0.0, (a, s) => a + s.total);
    final held = data == null ? const <Draft>[] : _draftsFor(data.drafts, session, all: false);

    Widget pick(String label, String value, List<String> options, ValueChanged<String> set, {List<(String, String)>? labelled}) => SizedBox(
          width: 170,
          child: DropdownButtonFormField<String>(
            key: Key('filter-$label'),
            initialValue: value,
            isExpanded: true,
            decoration: InputDecoration(labelText: label, isDense: true),
            items: [
              for (final (k, l) in labelled ?? [('', 'All'), for (final o in options) (o, o)]) DropdownMenuItem(value: k, child: Text(l, overflow: TextOverflow.ellipsis)),
            ],
            onChanged: (v) => setState(() => set(v ?? '')),
          ),
        );

    return PageFrame(
      title: 'Sales History',
      subtitle: '${valid.length} sales · ${st.money(sum)}',
      actions: [
        if (branches.length > 1 && !cashier)
          DropdownButton<String>(
            value: branch,
            items: [const DropdownMenuItem(value: 'all', child: Text('All branches')), for (final b in branches) DropdownMenuItem(value: '${b['id']}', child: Text('${b['name']}'))],
            onChanged: (v) => setState(() => _branch = v),
          ),
        SearchField(key: ValueKey('q-${widget.q}'), onChanged: (v) => setState(() => _q = v), hint: 'Receipt, customer, medicine…', initial: widget.q),
        DateBox(label: 'From', value: _from, onChanged: (v) => setState(() => _from = v)),
        DateBox(label: 'To', value: _to, onChanged: (v) => setState(() => _to = v)),
        ExportButtons(
          name: 'sales',
          settings: st,
          title: 'Sales history',
          subtitle: [
            if (_from.isNotEmpty || _to.isNotEmpty) '${_from.isEmpty ? 'start' : _from} to ${_to.isEmpty ? 'today' : _to}' else 'All dates',
            if (_q.trim().isNotEmpty) 'search "${_q.trim()}"',
            if (_status == 'edited') 'edited sales only',
            '${valid.length} sales · ${st.money(sum)}',
          ].join(' · '),
          csv: () => [
            for (final s in sales)
              {
                'receipt': s.number, 'date': s.date, 'branch': branchName(s.branchId), 'type': s.type.isEmpty ? 'retail' : s.type, 'customer': s.customerName,
                'cashier': s.cashier, 'payment': s.payment, 'momoRef': '${(s.raw['momo'] as Map?)?['txid'] ?? ''}', 'items': s.items.length, 'discount': s.discount,
                'tax': s.tax, 'total': s.total, 'paid': s.paid, 'status': s.status,
              },
          ],
          pdf: () => [
            PdfTable(
              head: const ['Receipt', 'Date', 'Customer', 'Cashier', 'Payment', 'Status', 'Total'],
              numeric: const [6],
              body: [for (final s in sales) [s.number, _when(s.date), s.customerName, s.cashier, s.payment, s.status + (edited(s) ? ' (edited)' : ''), st.money(s.total)]],
              foot: ['', '', '', '', '', 'Total (excl. refunds)', st.money(sum)],
            ),
          ],
        ),
      ],
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Align(
          alignment: Alignment.centerLeft,
          child: SegmentedButton<String>(
            segments: [const ButtonSegment(value: 'sales', label: Text('Sales')), ButtonSegment(value: 'drafts', label: Text('Held sales${held.isEmpty ? '' : ' (${held.length})'}'))],
            selected: {_tab},
            onSelectionChanged: (v) => setState(() => _tab = v.first),
          ),
        ),
        const SizedBox(height: 8),
        if (_tab == 'drafts')
          Expanded(child: HeldSalesList(kind: 'sale'))
        else ...[
          Wrap(spacing: 8, runSpacing: 8, children: [
            pick('Cashier', _cashier, opts((s) => s.cashier), (v) => _cashier = v),
            pick('Payment', _payment, opts((s) => s.payment), (v) => _payment = v),
            pick('Customer', _customer, opts((s) => s.customerName), (v) => _customer = v),
            pick('Status', _status, const [], (v) => _status = v, labelled: _statuses),
          ]),
          const SizedBox(height: 8),
          Expanded(
            child: sales.isEmpty
                ? EmptyState(rows.isEmpty
                    ? 'No sales yet. Every sale rung up at the POS appears here with its receipt, to reprint, refund or correct.'
                    : 'No sales match. Try another receipt number, customer, filter or date.')
                : ListView.separated(
                    itemCount: sales.length + 1,
                    separatorBuilder: (_, _) => const Divider(height: 1),
                    itemBuilder: (_, i) {
                      if (i == sales.length) {
                        return ListTile(
                          title: Text('Total (excl. refunds) · ${valid.length} sales', style: const TextStyle(fontWeight: FontWeight.w700)),
                          trailing: Text(st.money(sum), style: const TextStyle(fontWeight: FontWeight.w800)),
                        );
                      }
                      final s = sales[i];
                      final refunded = s.status == 'refunded';
                      final n = ((s.raw['edits'] as List?) ?? const []).length;
                      final momo = '${(s.raw['momo'] as Map?)?['txid'] ?? ''}';
                      return ListTile(
                        title: Wrap(spacing: 8, crossAxisAlignment: WrapCrossAlignment.center, children: [
                          Text('${s.number} · ${s.customerName}', style: TextStyle(fontWeight: FontWeight.w700, decoration: refunded ? TextDecoration.lineThrough : null)),
                          _Badge(refunded ? 'refunded' : s.status, error: refunded),
                          if (n > 0)
                            InkWell(onTap: () => _open(s, st), child: _Badge('Edited${n > 1 ? ' ×$n' : ''}', warn: true)),
                        ]),
                        subtitle: Text([
                          _when(s.date), s.type.isEmpty ? 'retail' : s.type, if (branches.length > 1) branchName(s.branchId),
                          if ((phoneOf[s.customerId] ?? '').isNotEmpty) phoneOf[s.customerId]!, '${s.payment}${momo.isEmpty ? '' : ' $momo'}', s.cashier,
                          '${s.items.length} item${s.items.length == 1 ? '' : 's'}',
                          if (s.paid < s.total && !refunded) '${st.money(s.total - s.paid)} on credit',
                        ].join(' · ')),
                        trailing: Row(mainAxisSize: MainAxisSize.min, children: [
                          Text(st.money(s.total), style: const TextStyle(fontWeight: FontWeight.w700)),
                          PopupMenuButton<String>(
                            tooltip: 'Actions for ${s.number}',
                            onSelected: (v) => switch (v) {
                              'receipt' => Printing.layoutPdf(onLayout: (_) => receiptPdf(s, st), name: s.number),
                              'invoice' => _invoice(s, st),
                              'edit' => _edit(s, st),
                              _ => _open(s, st),
                            },
                            itemBuilder: (_) => [
                              const PopupMenuItem(value: 'view', child: Text('View')),
                              const PopupMenuItem(value: 'receipt', child: Text('Print receipt')),
                              const PopupMenuItem(value: 'invoice', child: Text('Invoice (A4)')),
                              if (!refunded && _can('sales.edit') && !_locked(s)) const PopupMenuItem(value: 'edit', child: Text('Edit')),
                            ],
                          ),
                        ]),
                        onTap: () => _open(s, st),
                      );
                    },
                  ),
          ),
        ],
      ]),
    );
  }

  bool _can(String p) => (ref.read(permissionsProvider).value ?? const <String>{}).contains(p);
  /// step 18: a closed day's sale can't be edited (a refund still can, and the owner is told)
  bool _locked(Sale s) => inClosedDay(s.raw, closedSet(ref.read(tableProvider('dayCloses')).value ?? const []));

  Future<void> _invoice(Sale s, PharmacySettings st) async {
    final c = (await ref.read(pharmacyProvider.future)).customers.where((x) => x.id == s.customerId).firstOrNull;
    await Printing.layoutPdf(onLayout: (_) => invoicePdf(s, st, customerPhone: c?.phone ?? '', customerAddress: c?.raw['address'] as String? ?? ''), name: 'Invoice ${s.number}');
  }

  Future<void> _open(Sale s, PharmacySettings st) async {
    final session = await ref.read(sessionControllerProvider.future);
    if (!mounted) return;
    final changes = editHistory(s);
    await showDialog<void>(
      context: context,
      builder: (c) => AlertDialog(
        title: Text('Receipt ${s.number}'),
        content: SizedBox(
          width: 460,
          child: SingleChildScrollView(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('${_when(s.date)} · ${s.cashier}'),
            Text('Client: ${s.customerName} · ${s.type}'),
            const Divider(),
            for (final i in s.items)
              Row(children: [
                Expanded(child: Text('${i.name} × ${i.pack != null ? '${formatQty(i.pack!.count)} ${i.pack!.name}' : formatQty(i.qty)}')),
                Text(st.money(i.price * i.qty)),
              ]),
            const Divider(),
            if (s.discount > 0) Text('Discount −${st.money(s.discount)}'),
            if (s.tax > 0) Text('Tax ${st.money(s.tax)}'),
            Text('Total ${st.money(s.total)}', style: const TextStyle(fontWeight: FontWeight.w800)),
            Text('Paid ${st.money(s.paid)} by ${s.payment}'),
            if (s.raw['momo'] case final Map m)
              Text(m['confirmed'] == true ? 'Mobile Money ${m['txid'] ?? ''} · confirmed by the mobile network' : 'Mobile Money ${m['txid'] ?? ''} · recorded by staff (not confirmed by the network)'),
            if (s.status == 'refunded') Text('Refunded by ${s.raw['refundedBy'] ?? ''}', style: TextStyle(color: Theme.of(c).colorScheme.error)),
            if ('${s.raw['imported'] ?? ''}'.isNotEmpty) Text('Copied from ${s.raw['imported']}', style: Theme.of(c).textTheme.bodySmall),
            if (changes.isNotEmpty) ...[const SizedBox(height: 12), EditHistoryView(changes: changes, settings: st)],
          ])),
        ),
        actions: [
          if (s.status != 'refunded' && _can('sales.edit') && !_locked(s))
            TextButton.icon(onPressed: () {
              Navigator.pop(c);
              _edit(s, st);
            }, icon: const Icon(Icons.edit_outlined), label: const Text('Edit sale')),
          if (s.status != 'refunded' && '${s.raw['imported'] ?? ''}'.isEmpty && session?.role != 'cashier' && _can('sales.refund'))
            TextButton.icon(
              style: TextButton.styleFrom(foregroundColor: Theme.of(c).colorScheme.error),
              onPressed: () async {
                if (!await confirm(c, 'Refund ${s.number}?', '${st.money(s.total)} will be refunded and the items returned to stock (same batches).', 'Refund')) return;
                try {
                  await refundSale(ref.read(recordStoreProvider), s, user: session?.userName ?? '', settings: st);
                  if (c.mounted) Navigator.pop(c);
                  if (mounted) say(context, '${s.number} refunded and items returned to stock');
                } catch (e) {
                  if (mounted) say(context, '$e', error: true);
                }
              },
              icon: const Icon(Icons.undo),
              label: const Text('Refund'),
            ),
          TextButton.icon(onPressed: () async => Printing.sharePdf(bytes: await receiptPdf(s, st), filename: '${s.number}.pdf'), icon: const Icon(Icons.picture_as_pdf_outlined), label: const Text('PDF')),
          TextButton.icon(onPressed: () => _invoice(s, st), icon: const Icon(Icons.description_outlined), label: const Text('Invoice')),
          TextButton.icon(onPressed: () => showReceipt(c, s.toRecord(), st, phone: ''), icon: const Icon(Icons.send_outlined), label: const Text('Send')),
          FilledButton.icon(onPressed: () => Printing.layoutPdf(onLayout: (_) => receiptPdf(s, st), name: s.number), icon: const Icon(Icons.print), label: const Text('Print')),
        ],
      ),
    );
  }

  Future<void> _edit(Sale s, PharmacySettings st) async {
    final saved = await showDialog<bool>(context: context, builder: (_) => SaleEditor(sale: s));
    if (saved == true && mounted) say(context, s.raw['imported'] != null ? '${s.number} corrected (record only)' : '${s.number} updated; stock adjusted');
  }
}

String _when(String iso) {
  final d = DateTime.tryParse(iso)?.toLocal();
  if (d == null) return iso;
  String two(int n) => n.toString().padLeft(2, '0');
  return '${d.year}-${two(d.month)}-${two(d.day)} ${two(d.hour)}:${two(d.minute)}';
}

class _Badge extends StatelessWidget {
  const _Badge(this.text, {this.error = false, this.warn = false});
  final String text;
  final bool error, warn;
  @override
  Widget build(BuildContext context) {
    final c = Theme.of(context).colorScheme;
    final bg = error ? c.errorContainer : warn ? Colors.amber.shade100 : c.secondaryContainer;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(6)),
      child: Text(text, style: TextStyle(fontSize: 11, color: warn ? Colors.brown.shade800 : null)),
    );
  }
}

/// Who changed a sale, when, why, and what it was before and after.
class EditHistoryView extends StatelessWidget {
  const EditHistoryView({super.key, required this.changes, required this.settings});
  final List<SaleChange> changes;
  final PharmacySettings settings;
  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    String money(Object? v) => v == null ? '—' : settings.money(v is num ? v : num.tryParse('$v') ?? 0);
    TableRow row(String k, String a, String b, bool changed) => TableRow(children: [
          Text(k, style: t.textTheme.bodySmall?.copyWith(fontWeight: FontWeight.w700)),
          Text(a, style: t.textTheme.bodySmall),
          Text(b, style: t.textTheme.bodySmall?.copyWith(fontWeight: changed ? FontWeight.w800 : null, color: changed ? Colors.orange.shade900 : null)),
        ]);
    return Card(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(10),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('Edit history (${changes.length})', style: t.textTheme.titleSmall),
          for (final x in changes) ...[
            const Divider(),
            Text('${x.by}${x.role.isEmpty ? '' : ' · ${x.role}'} · ${_when(x.at)}', style: const TextStyle(fontWeight: FontWeight.w700)),
            if (x.reason.isNotEmpty) Text('Reason: ${x.reason}'),
            if (x.recordOnly) Text('Record only (stock not moved)', style: t.textTheme.bodySmall),
            Table(columnWidths: const {0: FixedColumnWidth(80)}, children: [
              row('Total', money(x.before?['total']), money(x.after?['total']), x.changed('total')),
              if (x.before?['items'] != null || x.after?['items'] != null) row('Items', '${x.before?['items'] ?? '—'}', '${x.after?['items'] ?? '—'}', x.changed('items')),
              if (x.changed('payment')) row('Payment', '${x.before!['payment']}', '${x.after!['payment']}', true),
              if (x.changed('customer')) row('Customer', '${x.before!['customer']}', '${x.after!['customer']}', true),
              if (x.changed('discount')) row('Discount', money(x.before!['discount']), money(x.after!['discount']), true),
            ]),
          ],
        ]),
      ),
    );
  }
}

/// Correct a past sale: lines, quantities, prices, client, payment, discount, with a reason (sales.edit).
class SaleEditor extends ConsumerStatefulWidget {
  const SaleEditor({super.key, required this.sale});
  final Sale sale;
  @override
  ConsumerState<SaleEditor> createState() => _SaleEditorState();
}

class _SaleEditorState extends ConsumerState<SaleEditor> {
  late List<EditLine> _lines = [for (final i in widget.sale.items) EditLine(id: i.id, name: i.name, price: i.price, qty: i.qty, cost: i.cost, original: i)];
  late String _customerId = widget.sale.customerId, _payment = widget.sale.payment;
  late double _discount = widget.sale.discount, _paid = widget.sale.paid;
  final _reason = TextEditingController();
  String _q = '';
  bool _saving = false;

  @override
  Widget build(BuildContext context) {
    final d = ref.watch(pharmacyProvider).value;
    if (d == null) return const Center(child: CircularProgressIndicator());
    final s = widget.sale, st = d.settings;
    final methods = d.settings.methods;
    final type = methods.where((m) => m.name == _payment).firstOrNull?.type ?? (_payment == 'Credit' ? 'credit' : 'cash');
    final base = s.subtotal - s.discount;
    final rate = s.tax > 0 && base > 0 ? s.tax / base : 0.0;
    final subtotal = _lines.fold<double>(0, (a, l) => a + l.qty.roundToDouble() * l.price);
    final disc = _discount.clamp(0, subtotal).toDouble();
    final total = subtotal - disc + (subtotal - disc) * rate;
    final matches = _q.trim().isEmpty
        ? d.products.take(0).toList()
        : searchProducts(d.products, _q, stockOf: (p) => d.stockOf(p.id)).where((p) => d.stockOf(p.id) > 0 && !_lines.any((l) => l.id == p.id)).take(8).toList();
    final recordOnly = '${s.raw['imported'] ?? ''}'.isNotEmpty;
    Widget num(String key, double v, ValueChanged<double> set, {double width = 90}) => SizedBox(
          width: width,
          child: TextFormField(
            key: Key(key),
            initialValue: v == v.roundToDouble() ? '${v.toInt()}' : '$v',
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            decoration: const InputDecoration(isDense: true),
            onChanged: (x) => setState(() => set(double.tryParse(x.replaceAll(',', '')) ?? 0)),
          ),
        );
    return AlertDialog(
      title: Text('Edit sale ${s.number}'),
      content: SizedBox(
        width: 640,
        child: SingleChildScrollView(child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Wrap(spacing: 12, runSpacing: 8, children: [
            SizedBox(width: 260, child: DropdownButtonFormField<String>(
              initialValue: d.customers.any((c) => c.id == _customerId) ? _customerId : null,
              isExpanded: true,
              decoration: const InputDecoration(labelText: 'Customer'),
              items: [for (final c in d.customers) DropdownMenuItem(value: c.id, child: Text(c.name))],
              onChanged: (v) => setState(() => _customerId = v ?? walkIn),
            )),
            SizedBox(width: 200, child: DropdownButtonFormField<String>(
              initialValue: _payment,
              isExpanded: true,
              decoration: const InputDecoration(labelText: 'Payment'),
              items: [for (final m in {...methods.map((m) => m.name), s.payment}) DropdownMenuItem(value: m, child: Text(m))],
              onChanged: (v) => setState(() => _payment = v ?? _payment),
            )),
          ]),
          const SizedBox(height: 10),
          for (var k = 0; k < _lines.length; k++)
            Row(children: [
              Expanded(child: Text(_lines[k].name)),
              const Text('Qty '),
              num('edit-qty-${_lines[k].id}', _lines[k].qty, (v) => _lines[k] = _lines[k].copyWith(qty: v), width: 70),
              const Text('  Price '),
              num('edit-price-${_lines[k].id}', _lines[k].price, (v) => _lines[k] = _lines[k].copyWith(price: v)),
              SizedBox(width: 110, child: Text(st.money(_lines[k].qty.roundToDouble() * _lines[k].price), textAlign: TextAlign.right)),
              IconButton(tooltip: 'Remove', icon: const Icon(Icons.delete_outline, size: 18), onPressed: () => setState(() => _lines = [..._lines]..removeAt(k))),
            ]),
          const SizedBox(height: 6),
          TextField(decoration: const InputDecoration(prefixIcon: Icon(Icons.search), hintText: 'Add a medicine to this sale…', isDense: true), onChanged: (v) => setState(() => _q = v)),
          for (final p in matches)
            ListTile(
              dense: true,
              leading: const Icon(Icons.add, size: 18),
              title: Text(p.name),
              subtitle: Text('${formatQty(d.stockOf(p.id))} in stock · ${st.money(p.price)}'),
              onTap: () => setState(() {
                _lines = [..._lines, EditLine(id: p.id, name: p.name, price: p.price, qty: 1, cost: p.cost)];
                _q = '';
              }),
            ),
          const SizedBox(height: 8),
          Wrap(spacing: 16, runSpacing: 8, crossAxisAlignment: WrapCrossAlignment.end, children: [
            Column(crossAxisAlignment: CrossAxisAlignment.start, children: [const Text('Discount'), num('edit-discount', _discount, (v) => _discount = v, width: 120)]),
            if (type == 'credit') Column(crossAxisAlignment: CrossAxisAlignment.start, children: [const Text('Amount paid (rest on credit)'), num('edit-paid', _paid, (v) => _paid = v, width: 140)]),
          ]),
          TextField(
            key: const Key('edit-reason'),
            controller: _reason,
            onChanged: (_) => setState(() {}),
            decoration: const InputDecoration(labelText: 'Reason for the change (kept in the audit log)', hintText: 'e.g. wrong quantity entered, price correction'),
          ),
          const SizedBox(height: 10),
          Row(children: [const Expanded(child: Text('Was')), Text(st.money(s.total))]),
          Row(children: [const Expanded(child: Text('New total', style: TextStyle(fontWeight: FontWeight.w800))), Text(st.money(total), style: const TextStyle(fontWeight: FontWeight.w800))]),
          if (recordOnly) Text('This sale was copied from ${s.raw['imported']}. Changes correct the record only; stock is not moved.', style: Theme.of(context).textTheme.bodySmall),
          if (editHistory(s).isNotEmpty) ExpansionTile(title: Text('Earlier changes (${editHistory(s).length})'), children: [EditHistoryView(changes: editHistory(s), settings: st)]),
        ])),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
        FilledButton(
          onPressed: _saving ? null : () async {
            setState(() => _saving = true);
            final session = await ref.read(sessionControllerProvider.future);
            try {
              await editSale(ref.read(recordStoreProvider), s, lines: _lines, customerId: _customerId,
                  customerName: d.customers.where((c) => c.id == _customerId).firstOrNull?.name ?? 'Walk-in Customer', payment: _payment, methodType: type,
                  discount: _discount, paid: _paid, reason: _reason.text, user: session?.userName ?? '', role: session?.role ?? '', stock: d.stock, settings: st);
              if (context.mounted) Navigator.pop(context, true);
            } on SaleEditProblem catch (e) {
              if (context.mounted) say(context, e.message, error: true);
            } finally {
              if (mounted) setState(() => _saving = false);
            }
          },
          child: const Text('Save changes'),
        ),
      ],
    );
  }
}

/// Held sales: mine, or everyone's at this branch for a supervisor (src/drafts.js draftsFor), oldest first.
List<Draft> _draftsFor(List<Draft> drafts, Session? session, {required bool all, String kind = 'sale'}) {
  final userId = session?.userId ?? '';
  final everyone = all && session?.role != 'cashier';
  return drafts.where((d) => d.kind == kind && (everyone || d.userId == userId)).toList()..sort((a, b) => a.order.compareTo(b.order));
}

/// "just now", "12 min ago", "3 h ago", "2 days ago"
String ageText(String startedAt, {DateTime? now}) {
  final at = DateTime.tryParse(startedAt);
  if (at == null) return '';
  final m = ((now ?? DateTime.now()).difference(at).inSeconds / 60).round();
  if (m < 1) return 'just now';
  if (m < 60) return '$m min ago';
  final h = (m / 60).round();
  return h < 48 ? '$h h ago' : '${(h / 24).round()} days ago';
}

bool isOldDraft(Draft d, {DateTime? now}) {
  final at = DateTime.tryParse(d.startedAt);
  return at != null && (now ?? DateTime.now()).difference(at).inMinutes / 60 >= (d.kind == 'sale' ? 4 : 24);
}

/// The Held sales tab (src/pages/Drafts.jsx): carry on (or take over), view, discard (audit).
class HeldSalesList extends ConsumerStatefulWidget {
  const HeldSalesList({super.key, required this.kind});
  final String kind;
  @override
  ConsumerState<HeldSalesList> createState() => _HeldSalesListState();
}

class _HeldSalesListState extends ConsumerState<HeldSalesList> {
  bool? _all;

  @override
  Widget build(BuildContext context) {
    final d = ref.watch(pharmacyProvider).value;
    final session = ref.watch(sessionControllerProvider).value;
    if (d == null) return const SizedBox();
    final supervisor = session != null && session.role != 'cashier';
    final all = _all ?? supervisor;
    final list = _draftsFor(d.drafts, session, all: all, kind: widget.kind);
    final st = d.settings;
    bool mine(Draft x) => x.userId == session?.userId;
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      if (supervisor)
        Align(
          alignment: Alignment.centerLeft,
          child: SegmentedButton<bool>(
            segments: const [ButtonSegment(value: false, label: Text('Mine')), ButtonSegment(value: true, label: Text('Everyone at this branch'))],
            selected: {all},
            onSelectionChanged: (v) => setState(() => _all = v.first),
          ),
        ),
      const SizedBox(height: 8),
      Expanded(
        child: list.isEmpty
            ? const EmptyState('No held sales. Put a sale on hold at the till (Alt+H) to serve the next customer; it waits here.')
            : ListView(children: [
                for (final x in list)
                  Card(
                    child: ListTile(
                      leading: const Icon(Icons.pause_circle_outline),
                      title: Text(x.title),
                      subtitle: Text([
                        '${x.count.round()} item${x.count.round() == 1 ? '' : 's'}',
                        mine(x) ? 'started by you' : 'started by ${x.userName}',
                        ageText(x.startedAt),
                        if (x.mode == 'wholesale') 'wholesale',
                      ].join(' · '), style: TextStyle(color: isOldDraft(x) ? Theme.of(context).colorScheme.error : null)),
                      trailing: Wrap(spacing: 4, crossAxisAlignment: WrapCrossAlignment.center, children: [
                        Text(st.money(x.total), style: const TextStyle(fontWeight: FontWeight.w700)),
                        FilledButton.tonal(onPressed: () => _carryOn(x), child: Text(mine(x) ? 'Continue' : 'Take over')),
                        IconButton(tooltip: 'View', icon: const Icon(Icons.visibility_outlined), onPressed: () => _view(x, st)),
                        IconButton(tooltip: 'Discard', icon: const Icon(Icons.delete_outline), onPressed: () => _discard(x, st, mine(x))),
                      ]),
                    ),
                  ),
              ]),
      ),
    ]);
  }

  Future<void> _carryOn(Draft x) async {
    final wholesale = x.mode == 'wholesale';
    await ref.read(saleControllerProvider(wholesale).notifier).resume(x);
    if (mounted) context.go(wholesale ? '/pos/wholesale' : '/pos');
  }

  Future<void> _view(Draft x, PharmacySettings st) => showDialog<void>(
        context: context,
        builder: (c) => AlertDialog(
          title: Text(x.title),
          content: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('${x.userName} · ${ageText(x.startedAt)} · ${st.money(x.total)}'),
            const Divider(),
            for (final l in ((x.data?['cart'] as List?) ?? const []).cast<Map>())
              Row(children: [Expanded(child: Text('${l['name'] ?? '—'}')), Text(formatQty(((l['qty'] as num?) ?? 0).toDouble()))]),
          ]),
          actions: [FilledButton(onPressed: () {
            Navigator.pop(c);
            _carryOn(x);
          }, child: Text(x.userId == ref.read(sessionControllerProvider).value?.userId ? 'Continue' : 'Take over'))],
        ),
      );

  Future<void> _discard(Draft x, PharmacySettings st, bool mine) async {
    if (!await confirm(context, 'Discard this held sale?', '${x.title} · ${x.count.round()} item(s) · ${st.money(x.total)}${mine ? '' : ' · started by ${x.userName}'}. Nothing in stock changes.', 'Discard')) return;
    final session = await ref.read(sessionControllerProvider.future);
    final branch = await ref.read(deviceBranchProvider.future);
    await ref.read(recordStoreProvider).update((d) {
      d.del('drafts', x.id);
      d.audit(session?.userName ?? '', 'Draft discarded', 'Held sale "${x.title}" (${x.count.round()} items, ${st.money(x.total)}) started by ${x.userName} ${ageText(x.startedAt)}', branch);
    });
    if (mounted) say(context, 'Draft discarded');
  }
}

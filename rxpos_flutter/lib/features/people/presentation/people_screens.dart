import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/data/pharmacy_providers.dart';
import '../../../core/data/record_store.dart';
import '../../../core/entities/purchase.dart';
import '../../../core/entities/sale.dart';
import '../../../core/entities/settings.dart';
import '../../../core/presentation/widgets.dart';
import '../../../core/rules/dates.dart';
import '../../../core/rules/ids.dart';
import '../../auth/application/session_controller.dart';
import '../domain/balances.dart';
import '../../../core/presentation/list_controls.dart';

/// Customers or Suppliers: the list with what each owes, add / edit, record a payment.
class PeopleScreen extends ConsumerStatefulWidget {
  const PeopleScreen({super.key, required this.suppliers, this.q = '', this.create = false});
  final bool suppliers;
  /// Opened from a Ctrl+K command ("Add a customer"): the form opens at once.
  final bool create;
  /// Opened from search (Ctrl+K) with a name already typed.
  final String q;
  @override
  ConsumerState<PeopleScreen> createState() => _PeopleScreenState();
}

class _PeopleScreenState extends ConsumerState<PeopleScreen> {
  late String _q = widget.q;
  late final _search = TextEditingController(text: widget.q);
  final _searchFocus = FocusNode();

  @override
  void initState() {
    super.initState();
    if (widget.create) WidgetsBinding.instance.addPostFrameCallback((_) => _edit(null));
  }

  @override
  void dispose() {
    _search.dispose();
    _searchFocus.dispose();
    super.dispose();
  }
  String get _t => widget.suppliers ? 'suppliers' : 'customers';

  List<FormFieldSpec> get _fields => widget.suppliers
      // the same fields as the React app (src/pages/People.jsx)
      ? const [FormFieldSpec('name', 'Company name', required: true), FormFieldSpec('contact', 'Contact person'), FormFieldSpec('phone', 'Phone'),
          FormFieldSpec('email', 'Email'), FormFieldSpec('tin', 'TIN / tax number'), FormFieldSpec('address', 'Address', kind: FieldKind.multiline)]
      : const [
          FormFieldSpec('name', 'Full name / company', required: true), FormFieldSpec('phone', 'Phone'), FormFieldSpec('email', 'Email'),
          FormFieldSpec('address', 'Address'), FormFieldSpec('dob', 'Date of birth', kind: FieldKind.date),
          FormFieldSpec('type', 'Type', kind: FieldKind.choice, options: [('Retail', 'Retail'), ('Wholesale', 'Wholesale'), ('Clinic / Hospital', 'Clinic / Hospital'), ('Insurance', 'Insurance')]),
          FormFieldSpec('insurance', 'Insurance / HMO'), FormFieldSpec('insuranceNo', 'Policy number'), FormFieldSpec('creditLimit', 'Credit limit', kind: FieldKind.number),
          FormFieldSpec('allergies', 'Allergies', kind: FieldKind.multiline), FormFieldSpec('notes', 'Notes', kind: FieldKind.multiline),
        ];

  @override
  Widget build(BuildContext context) {
    final rows = ref.watch(tableProvider(_t)).value;
    final sales = ref.watch(tableProvider('sales')).value ?? const [];
    final purchases = ref.watch(tableProvider('purchases')).value ?? const [];
    final payments = ref.watch(tableProvider('payments')).value ?? const [];
    final returns = ref.watch(tableProvider('supplierReturns')).value ?? const [];
    final settings = ref.watch(settingsProvider).value ?? const PharmacySettings();
    final can = ref.watch(permissionsProvider).value ?? const <String>{};
    if (rows == null) return const Center(child: CircularProgressIndicator());
    final saleList = sales.map(Sale.fromRecord).toList();
    final purchaseList = purchases.map(Purchase.fromRecord).toList();
    final win = ref.watch(balanceWindowProvider).value; // stage 4: a device keeping recent history
    double owes(String id) => widget.suppliers ? supplierBalance(id, purchaseList, payments, returns, win: win) : customerBalance(id, saleList, payments, win: win);
    final q = _q.trim().toLowerCase();
    final list = rows.where((r) => r['id'] != 'walk-in' && (q.isEmpty || '${r['name']} ${r['phone'] ?? ''}'.toLowerCase().contains(q))).toList()
      ..sort((a, b) => '${a['name']}'.toLowerCase().compareTo('${b['name']}'.toLowerCase()));
    final total = list.fold(0.0, (a, r) => a + owes('${r['id']}'));
    return PageFrame(
      title: widget.suppliers ? 'Suppliers' : 'Customers',
      subtitle: '${list.length} · ${widget.suppliers ? 'we owe' : 'they owe'} ${settings.money(total)}',
      actions: [
        SearchField(controller: _search, focusNode: _searchFocus, onChanged: (v) => setState(() => _q = v), hint: 'Name or phone…'),
        FilledButton.icon(onPressed: () => _edit(null), icon: const Icon(Icons.add), label: Text(widget.suppliers ? 'Add supplier' : 'Add client')),
      ],
      // the owner's request: keys, double-click, right-click and ticks, as every list (list_controls.dart)
      child: list.isEmpty
          ? EmptyState(widget.suppliers ? 'No suppliers yet' : 'No clients yet')
          : ListControls(
              ids: [for (final r in list) '${r['id']}'],
              search: _searchFocus,
              onClearSearch: () => setState(() {
                _search.clear();
                _q = '';
              }),
              onEdit: (i) => _edit(list[i]),
              onNew: () => _edit(null),
              menu: (i) => [
                RowAction('Edit', Icons.edit_outlined, () => _edit(list[i]), keyId: 'list:edit'),
                if (owes('${list[i]['id']}') > 0.5 && (can.contains('finance') || can.contains('customers')))
                  RowAction(widget.suppliers ? 'Pay supplier' : 'Record payment', Icons.payments_outlined, () => _pay(list[i], owes('${list[i]['id']}'), settings)),
                RowAction('Copy name and phone', Icons.copy, () => Clipboard.setData(ClipboardData(text: [list[i]['name'], list[i]['phone']].where((x) => '${x ?? ''}'.isNotEmpty).join(' · ')))),
              ],
              bulk: (rows) => [
                ('Copy', Icons.copy, (rows, done) {
                  Clipboard.setData(ClipboardData(text: [for (final i in rows) '${list[i]['name']}\t${list[i]['phone'] ?? ''}'].join('\n')));
                  say(context, '${rows.length} copied');
                  done();
                }),
              ],
              builder: (context, row) => ListView.separated(
              itemCount: list.length,
              separatorBuilder: (_, _) => const Divider(height: 1),
              itemBuilder: (_, i) {
                final r = list[i];
                final bal = owes('${r['id']}');
                final st = row(i);
                return st.wrap(ListTile(
                  leading: st.tickBox,
                  title: Text('${r['name']}'),
                  subtitle: Text([r['phone'], widget.suppliers ? r['contact'] : r['allergies'] == null || '${r['allergies']}'.isEmpty ? null : 'Allergies: ${r['allergies']}']
                      .where((x) => x != null && '$x'.isNotEmpty).join(' · ')),
                  trailing: Row(mainAxisSize: MainAxisSize.min, children: [
                    if (bal.abs() > 0.5) Text(settings.money(bal), style: TextStyle(fontWeight: FontWeight.w700, color: Colors.orange.shade800)),
                    if (bal > 0.5 && (can.contains('finance') || can.contains('customers')))
                      IconButton(tooltip: widget.suppliers ? 'Pay supplier' : 'Record payment', icon: const Icon(Icons.payments_outlined), onPressed: () => _pay(r, bal, settings)),
                    IconButton(tooltip: 'Edit', icon: const Icon(Icons.edit_outlined), onPressed: () => _edit(r)),
                  ]),
                ));
              },
            ),
            ),
    );
  }

  Future<void> _edit(Map<String, Object?>? r) async {
    final v = await editRecord(context, title: r == null ? (widget.suppliers ? 'New supplier' : 'New client') : 'Edit ${r['name']}', fields: _fields, initial: r ?? const {});
    if (v == null) return;
    await ref.read(recordStoreProvider).update((d) => d.put(_t, {...?r, ...v, 'id': r?['id'] ?? uid()}));
    if (mounted) say(context, '${v['name']} saved');
  }

  Future<void> _pay(Map<String, Object?> r, double owed, PharmacySettings st) async {
    final v = await editRecord(context, title: widget.suppliers ? 'Pay ${r['name']}' : 'Payment from ${r['name']}', save: 'Record payment',
        initial: {'amount': owed, 'date': today(), 'method': 'Cash'}, fields: const [
          FormFieldSpec('amount', 'Amount', kind: FieldKind.number, required: true),
          FormFieldSpec('date', 'Date', kind: FieldKind.date, required: true),
          FormFieldSpec('method', 'Method', kind: FieldKind.choice, options: [('Cash', 'Cash'), ('Mobile Money', 'Mobile Money'), ('Bank', 'Bank'), ('Card', 'Card')]),
          FormFieldSpec('note', 'Note'),
        ]);
    if (v == null) return;
    final by = (await ref.read(sessionControllerProvider.future))?.userName ?? '';
    try {
      await recordPayment(ref.read(recordStoreProvider), kind: widget.suppliers ? 'supplier' : 'customer', partyId: '${r['id']}',
          amount: (v['amount'] as num).toDouble(), date: '${v['date']}', method: '${v['method'] ?? 'Cash'}', note: '${v['note'] ?? ''}', by: by);
      if (mounted) say(context, 'Payment of ${st.money(v['amount'] as num)} recorded');
    } catch (e) {
      if (mounted) say(context, '$e', error: true);
    }
  }
}

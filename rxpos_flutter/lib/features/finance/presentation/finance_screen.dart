import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/data/pharmacy_providers.dart';
import '../../../core/data/record_store.dart';
import '../../../core/entities/purchase.dart';
import '../../../core/entities/sale.dart';
import '../../../core/entities/settings.dart';
import '../../../core/presentation/export.dart';
import '../../../core/presentation/widgets.dart';
import '../../../core/rules/dates.dart';
import '../../../core/rules/ids.dart';
import '../../auth/application/session_controller.dart';
import '../../people/domain/balances.dart';
import '../domain/ledger.dart';

const _tables = ['sales', 'purchases', 'supplierReturns', 'expenses', 'expenseCategories', 'payments', 'loans', 'bankTx', 'banks', 'customers', 'suppliers'];
const payMethods = ['Cash', 'Mobile Money', 'Bank Transfer', 'Cheque', 'Card'];
const financeTabs = [
  ('accounts', 'Banks'), ('cashbook', 'Cash Book'), ('expenses', 'Expenses'), ('categories', 'Expense Categories'), ('banking', 'Deposits & Withdrawals'), ('loans', 'Loans'),
  ('debtors', 'Debtors'), ('creditors', 'Creditors'), ('payments', 'Payment history'),
];

/// Finance (src/pages/Finance.jsx): banks and their balances, the cash book of an account, expenses (by month),
/// expense categories, deposits / withdrawals / transfers, loans and repayments, debtors (customers owe), creditors
/// (we owe) with payments, and every payment received or made. Lists export to CSV.
class FinanceScreen extends ConsumerStatefulWidget {
  const FinanceScreen({super.key, this.tab = 'accounts'});
  final String tab;
  @override
  ConsumerState<FinanceScreen> createState() => _FinanceScreenState();
}

class _FinanceScreenState extends ConsumerState<FinanceScreen> {
  late String _tab = widget.tab;
  String _month = today().substring(0, 7);
  String _account = cashDrawer;
  String _from = '${today().substring(0, 7)}-01', _to = today();

  RecordStore get _store => ref.read(recordStoreProvider);
  Future<String> _who() async => (await ref.read(sessionControllerProvider.future))?.userName ?? '';

  @override
  Widget build(BuildContext context) {
    final t = {for (final n in _tables) n: ref.watch(tableProvider(n)).value};
    final st = ref.watch(settingsProvider).value ?? const PharmacySettings();
    if (t.values.any((v) => v == null)) return const Center(child: CircularProgressIndicator());
    final data = {for (final e in t.entries) e.key: e.value!};
    final banks = [...data['banks']!];
    if (!banks.any((b) => b['id'] == cashDrawer)) banks.insert(0, {'id': cashDrawer, 'name': 'Cash at hand'});
    final all = {...data, 'banks': banks};
    final bal = accountBalances(all);
    final bankOpts = [for (final b in banks) ('${b['id']}', '${b['name']}')];
    final cats = [for (final c in data['expenseCategories']!) ('${c['id']}', '${c['name']}')];
    String bankName(Object? id) => bankOpts.where((b) => b.$1 == (id ?? cashDrawer)).firstOrNull?.$2 ?? '—';
    final body = switch (_tab) {
      'cashbook' => _cashBook(all, banks, st),
      'expenses' => _expenses(data, cats, bankOpts, bankName, st),
      'categories' => _categories(data, st),
      'banking' => _banking(data, bankOpts, bankName, st),
      'loans' => _loans(data, bankOpts, st),
      'debtors' => _balances(data, bankOpts, st, customers: true),
      'creditors' => _balances(data, bankOpts, st, customers: false),
      'payments' => _payments(data, bankName, st),
      _ => _accounts(banks, bal, st),
    };
    return PageFrame(
      title: 'Finance',
      subtitle: 'Total in all accounts ${st.money(bal.values.fold(0.0, (a, b) => a + b))}',
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(children: [
            for (final (k, l) in financeTabs) Padding(padding: const EdgeInsets.only(right: 6), child: ChoiceChip(label: Text(l), selected: _tab == k, onSelected: (_) => setState(() => _tab = k))),
          ]),
        ),
        const SizedBox(height: 8),
        Expanded(child: body),
      ]),
    );
  }

  Widget _head(List<Widget> children) => Padding(padding: const EdgeInsets.only(bottom: 8), child: Wrap(spacing: 8, runSpacing: 8, crossAxisAlignment: WrapCrossAlignment.center, children: children));

  Widget _list(List<Widget> rows, String empty) => rows.isEmpty ? EmptyState(empty) : ListView.separated(itemCount: rows.length, separatorBuilder: (_, _) => const Divider(height: 1), itemBuilder: (_, i) => rows[i]);

  Future<void> _delete(String table, Map<String, Object?> r, String what) async {
    if (!await confirmAction(context, 'Delete this $what?', 'It is removed on every device.', 'Delete')) return;
    final by = await _who();
    await _store.update((d) {
      d.del(table, '${r['id']}');
      d.audit(by, '${what[0].toUpperCase()}${what.substring(1)} deleted', '${r['description'] ?? r['name'] ?? r['lender'] ?? r['type'] ?? ''} ${r['amount'] ?? ''}'.trim());
    });
  }

  // ---- Banks ----
  Widget _accounts(List<Map<String, Object?>> banks, Map<String, double> bal, PharmacySettings st) {
    Future<void> edit(Map<String, Object?>? b) async {
      final v = await editRecord(context, title: b == null ? 'New bank / account' : 'Edit ${b['name']}', initial: b ?? const {}, fields: const [
        FormFieldSpec('name', 'Bank / account name', required: true),
        FormFieldSpec('account', 'Account number'),
        FormFieldSpec('branch', 'Branch'),
        FormFieldSpec('opening', 'Opening balance', kind: FieldKind.number),
      ]);
      if (v != null) await _store.update((d) => d.put('banks', {...?b, ...v, 'id': b?['id'] ?? uid()}));
    }

    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      _head([FilledButton.icon(onPressed: () => edit(null), icon: const Icon(Icons.add), label: const Text('Add bank / account')), Text('Total ${st.money(bal.values.fold(0.0, (a, b) => a + b))}')]),
      Expanded(child: _list([
        for (final b in banks)
          ListTile(
            title: Text('${b['name']}'),
            subtitle: Text([b['account'], b['branch']].where((x) => x != null && '$x'.isNotEmpty).join(' · ')),
            trailing: Text(st.money(bal['${b['id']}'] ?? 0), style: TextStyle(fontWeight: FontWeight.w800, color: (bal['${b['id']}'] ?? 0) < 0 ? Theme.of(context).colorScheme.error : null)),
            onTap: () => edit(b),
          ),
      ], 'No accounts')),
    ]);
  }

  // ---- Cash book ----
  Widget _cashBook(Map<String, List<Map<String, Object?>>> all, List<Map<String, Object?>> banks, PharmacySettings st) {
    final bank = banks.where((b) => b['id'] == _account).firstOrNull;
    final book = cashBook(all, _account, from: _from, to: _to, opening: (bank?['opening'] as num?)?.toDouble() ?? 0);
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      _head([
        DropdownButton<String>(value: banks.any((b) => b['id'] == _account) ? _account : cashDrawer, items: [for (final b in banks) DropdownMenuItem(value: '${b['id']}', child: Text('${b['name']}'))],
            onChanged: (v) => setState(() => _account = v ?? cashDrawer)),
        DateBox(label: 'From', value: _from, onChanged: (v) => setState(() => _from = v.isEmpty ? _from : v)),
        DateBox(label: 'To', value: _to, onChanged: (v) => setState(() => _to = v.isEmpty ? _to : v)),
        ExportButtons(name: 'cash-book', settings: st, title: 'Cash Book – ${bank?['name'] ?? ''}', subtitle: '$_from to $_to',
            csv: () => [for (final (e, b) in book.rows) {'date': e.date, 'description': e.desc, 'type': e.kind, 'in': e.inAmount, 'out': e.outAmount, 'balance': b}],
            pdf: () => [PdfTable(head: const ['Date', 'Description', 'Type', 'Money in', 'Money out', 'Balance'], numeric: const [3, 4, 5], body: [
              ['', 'Opening balance', '', '', '', st.money(book.opening)],
              for (final (e, b) in book.rows) [dayOf(e.date), e.desc, e.kind, e.inAmount > 0 ? st.money(e.inAmount) : '', e.outAmount > 0 ? st.money(e.outAmount) : '', st.money(b)],
            ], foot: ['', 'Totals', '', st.money(book.totalIn), st.money(book.totalOut), st.money(book.closing)])]),
      ]),
      Expanded(child: ListView(children: [
        ListTile(dense: true, title: const Text('Opening balance'), trailing: Text(st.money(book.opening))),
        for (final (e, b) in book.rows)
          ListTile(
            dense: true,
            title: Text(e.desc),
            subtitle: Text('${dayOf(e.date)} · ${e.kind}'),
            trailing: Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.end, children: [
              Text(e.inAmount > 0 ? '+${st.money(e.inAmount)}' : '−${st.money(e.outAmount)}', style: TextStyle(color: e.inAmount > 0 ? Colors.green.shade700 : Theme.of(context).colorScheme.error)),
              Text(st.money(b), style: const TextStyle(fontWeight: FontWeight.w700)),
            ]),
          ),
        ListTile(title: const Text('Totals', style: TextStyle(fontWeight: FontWeight.w800)),
            trailing: Text('in ${st.money(book.totalIn)} · out ${st.money(book.totalOut)} · ${st.money(book.closing)}', style: const TextStyle(fontWeight: FontWeight.w800))),
      ])),
    ]);
  }

  // ---- Expenses ----
  Widget _expenses(Map<String, List<Map<String, Object?>>> data, List<(String, String)> cats, List<(String, String)> bankOpts, String Function(Object?) bankName, PharmacySettings st) {
    final rows = data['expenses']!.where((e) => _month.isEmpty || '${e['date']}'.startsWith(_month)).toList()..sort((a, b) => '${b['date']}'.compareTo('${a['date']}'));
    final total = rows.fold<double>(0, (a, e) => a + ((e['amount'] as num?)?.toDouble() ?? 0));
    String cat(Object? id) => cats.where((c) => c.$1 == id).firstOrNull?.$2 ?? 'Expense';
    Future<void> edit(Map<String, Object?>? e) async {
      final by = await _who();
      if (!mounted) return;
      final v = await editRecord(context, title: e == null ? 'New expense' : 'Edit expense', initial: e ?? {'date': today(), 'bankId': cashDrawer, 'method': 'Cash'}, fields: [
        const FormFieldSpec('date', 'Date', kind: FieldKind.date, required: true),
        FormFieldSpec('categoryId', 'Category', kind: FieldKind.choice, required: true, options: cats),
        const FormFieldSpec('description', 'What for', required: true),
        const FormFieldSpec('amount', 'Amount', kind: FieldKind.number, required: true),
        FormFieldSpec('method', 'Payment method', kind: FieldKind.choice, options: [for (final m in payMethods) (m, m)]),
        FormFieldSpec('bankId', 'Paid from', kind: FieldKind.choice, options: bankOpts),
        const FormFieldSpec('payee', 'Paid to'),
      ]);
      if (v == null) return;
      await _store.update((d) {
        d.put('expenses', {...?e, ...v, 'id': e?['id'] ?? uid(), 'recordedBy': e?['recordedBy'] ?? by});
        d.audit(by, e == null ? 'Expense recorded' : 'Expense edited', '${v['description']}: ${st.money((v['amount'] as num?) ?? 0)}');
      });
    }

    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      _head([
        FilledButton.icon(onPressed: () => edit(null), icon: const Icon(Icons.add), label: const Text('Add expense')),
        SizedBox(width: 140, child: TextFormField(initialValue: _month, decoration: const InputDecoration(labelText: 'Month', hintText: 'YYYY-MM', isDense: true),
            onChanged: (v) => setState(() => _month = RegExp(r'^\d{4}-\d{2}$').hasMatch(v.trim()) ? v.trim() : (v.trim().isEmpty ? '' : _month)))),
        Text('Total ${st.money(total)}'),
        ExportButtons(name: 'expenses-$_month', settings: st, csv: () => [
          for (final e in rows) {'date': e['date'], 'category': cat(e['categoryId']), 'description': e['description'], 'paidTo': e['payee'], 'from': bankName(e['bankId']), 'amount': e['amount']},
        ]),
      ]),
      Expanded(child: _list([
        for (final e in rows)
          ListTile(
            title: Text('${cat(e['categoryId'])}: ${e['description'] ?? ''}'),
            subtitle: Text('${e['date']}${'${e['payee'] ?? ''}'.isEmpty ? '' : ' · to ${e['payee']}'} · from ${bankName(e['bankId'])}${e['method'] == null ? '' : ' · ${e['method']}'}'),
            trailing: Row(mainAxisSize: MainAxisSize.min, children: [
              Text(st.money((e['amount'] as num?) ?? 0)),
              IconButton(tooltip: 'Delete', icon: const Icon(Icons.delete_outline), onPressed: () => _delete('expenses', e, 'expense')),
            ]),
            onTap: () => edit(e),
          ),
      ], 'No expenses this month')),
    ]);
  }

  Widget _categories(Map<String, List<Map<String, Object?>>> data, PharmacySettings st) {
    Future<void> edit(Map<String, Object?>? c) async {
      final v = await editRecord(context, title: c == null ? 'New category' : 'Edit ${c['name']}', initial: c ?? const {}, fields: const [FormFieldSpec('name', 'Name', required: true)]);
      if (v != null) await _store.update((d) => d.put('expenseCategories', {...?c, ...v, 'id': c?['id'] ?? uid()}));
    }

    double spent(Object? id) => data['expenses']!.where((e) => e['categoryId'] == id).fold(0.0, (a, e) => a + ((e['amount'] as num?)?.toDouble() ?? 0));
    final cats = [...data['expenseCategories']!]..sort((a, b) => '${a['name']}'.compareTo('${b['name']}'));
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      _head([FilledButton.icon(onPressed: () => edit(null), icon: const Icon(Icons.add), label: const Text('Add category'))]),
      Expanded(child: _list([
        for (final c in cats) ListTile(title: Text('${c['name']}'), trailing: Text('Total spent ${st.money(spent(c['id']))}'), onTap: () => edit(c)),
      ], 'No categories')),
    ]);
  }

  Widget _banking(Map<String, List<Map<String, Object?>>> data, List<(String, String)> bankOpts, String Function(Object?) bankName, PharmacySettings st) {
    final rows = [...data['bankTx']!]..sort((a, b) => '${b['date']}'.compareTo('${a['date']}'));
    String where(Map<String, Object?> x) => x['type'] == 'Transfer' ? '${bankName(x['fromId'])} → ${bankName(x['toId'])}' : x['type'] == 'Deposit' ? 'Cash → ${bankName(x['bankId'])}' : '${bankName(x['bankId'])} → Cash';
    Future<void> edit(Map<String, Object?>? x) async {
      final by = await _who();
      if (!mounted) return;
      final v = await editRecord(context, title: x == null ? 'Move money' : 'Edit ${x['type']}', initial: x ?? {'date': today(), 'type': 'Deposit'}, fields: [
        const FormFieldSpec('type', 'Type', kind: FieldKind.choice, required: true, options: [('Deposit', 'Deposit (cash → account)'), ('Withdrawal', 'Withdrawal (account → cash)'), ('Transfer', 'Transfer between accounts')]),
        const FormFieldSpec('date', 'Date', kind: FieldKind.date, required: true),
        FormFieldSpec('bankId', 'Bank account (deposit / withdrawal)', kind: FieldKind.choice, options: bankOpts),
        FormFieldSpec('fromId', 'From account (transfer)', kind: FieldKind.choice, options: bankOpts),
        FormFieldSpec('toId', 'To account (transfer)', kind: FieldKind.choice, options: bankOpts),
        const FormFieldSpec('amount', 'Amount', kind: FieldKind.number, required: true),
        const FormFieldSpec('ref', 'Slip / reference'),
        const FormFieldSpec('note', 'Note'),
      ]);
      if (v != null) await _store.update((d) => d.put('bankTx', {...?x, ...v, 'id': x?['id'] ?? uid(), 'by': x?['by'] ?? by}));
    }

    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      _head([FilledButton.icon(onPressed: () => edit(null), icon: const Icon(Icons.add), label: const Text('Deposit / withdraw / transfer'))]),
      Expanded(child: _list([
        for (final x in rows)
          ListTile(
            title: Text('${x['type']} · ${where(x)}'),
            subtitle: Text('${x['date']}${'${x['ref'] ?? ''}'.isEmpty ? '' : ' · ref ${x['ref']}'}${'${x['note'] ?? ''}'.isEmpty ? '' : ' · ${x['note']}'}'),
            trailing: Row(mainAxisSize: MainAxisSize.min, children: [
              Text(st.money((x['amount'] as num?) ?? 0)),
              IconButton(tooltip: 'Delete', icon: const Icon(Icons.delete_outline), onPressed: () => _delete('bankTx', x, 'transaction')),
            ]),
            onTap: () => edit(x),
          ),
      ], 'Nothing here yet')),
    ]);
  }

  Future<void> _pay({required String title, required String kind, required String partyId, required double max, required List<(String, String)> bankOpts, required PharmacySettings st}) async {
    final by = await _who();
    if (!mounted) return;
    final v = await editRecord(context, title: '$title (outstanding ${st.money(max)})', save: 'Record payment', initial: {'date': today(), 'amount': max > 0 ? max : 0, 'method': 'Cash', 'bankId': cashDrawer}, fields: [
      const FormFieldSpec('date', 'Date', kind: FieldKind.date, required: true),
      const FormFieldSpec('amount', 'Amount', kind: FieldKind.number, required: true),
      FormFieldSpec('method', 'Method', kind: FieldKind.choice, options: [for (final m in payMethods) (m, m)]),
      FormFieldSpec('bankId', kind == 'customer' ? 'Received into' : 'Paid from', kind: FieldKind.choice, options: bankOpts),
      const FormFieldSpec('note', 'Note'),
    ]);
    if (v == null) return;
    await _store.update((d) => d.put('payments', {...v, 'id': uid(), 'kind': kind, 'partyId': partyId, 'by': by}));
  }

  Widget _loans(Map<String, List<Map<String, Object?>>> data, List<(String, String)> bankOpts, PharmacySettings st) {
    Future<void> edit(Map<String, Object?>? l) async {
      final v = await editRecord(context, title: l == null ? 'New loan' : 'Edit loan', initial: l ?? {'date': today(), 'bankId': cashDrawer, 'interestRate': 0}, fields: [
        const FormFieldSpec('lender', 'Lender', required: true),
        const FormFieldSpec('date', 'Date received', kind: FieldKind.date, required: true),
        const FormFieldSpec('amount', 'Amount', kind: FieldKind.number, required: true),
        const FormFieldSpec('interestRate', 'Total interest (%)', kind: FieldKind.number),
        const FormFieldSpec('dueDate', 'Due date', kind: FieldKind.date),
        FormFieldSpec('bankId', 'Received into', kind: FieldKind.choice, options: bankOpts),
        const FormFieldSpec('purpose', 'Purpose'),
      ]);
      if (v != null) await _store.update((d) => d.put('loans', {...?l, ...v, 'id': l?['id'] ?? uid()}));
    }

    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      _head([FilledButton.icon(onPressed: () => edit(null), icon: const Icon(Icons.add), label: const Text('Add loan'))]),
      Expanded(child: _list([
        for (final l in data['loans']!)
          () {
            final b = loanBalance(l, data['payments']!);
            return ListTile(
              title: Text('${l['lender']}${'${l['purpose'] ?? ''}'.isEmpty ? '' : ' · ${l['purpose']}'}'),
              subtitle: Text('${l['date']}${'${l['dueDate'] ?? ''}'.isEmpty ? '' : ' · due ${l['dueDate']}'} · ${st.money((l['amount'] as num?) ?? 0)} · total due ${st.money(b.total)} · repaid ${st.money(b.repaid)}'),
              trailing: Row(mainAxisSize: MainAxisSize.min, children: [
                Text(st.money(b.balance), style: const TextStyle(fontWeight: FontWeight.w800)),
                if (b.balance > 0)
                  TextButton(onPressed: () => _pay(title: 'Repay ${l['lender']}', kind: 'loan', partyId: '${l['id']}', max: b.balance, bankOpts: bankOpts, st: st), child: const Text('Repay')),
              ]),
              onTap: () => edit(l),
            );
          }(),
      ], 'No loans')),
    ]);
  }

  Widget _balances(Map<String, List<Map<String, Object?>>> data, List<(String, String)> bankOpts, PharmacySettings st, {required bool customers}) {
    final parties = data[customers ? 'customers' : 'suppliers']!.where((p) => p['id'] != 'walk-in').toList();
    final sales = data['sales']!.map(Sale.fromRecord).toList(), purchases = data['purchases']!.map(Purchase.fromRecord).toList();
    final rows = [
      for (final p in parties)
        (p, customers ? customerBalance('${p['id']}', sales, data['payments']!) : supplierBalance('${p['id']}', purchases, data['payments']!, data['supplierReturns']!)),
    ].where((x) => x.$2.abs() > 0.001).toList()
      ..sort((a, b) => b.$2.compareTo(a.$2));
    final kind = customers ? 'customer' : 'supplier';
    final history = data['payments']!.where((p) => p['kind'] == kind).toList()..sort((a, b) => '${b['date']}'.compareTo('${a['date']}'));
    String nameOf(Object? id) => '${parties.where((p) => p['id'] == id).firstOrNull?['name'] ?? ''}';
    return ListView(children: [
      Text(customers ? 'Debtors (customers owe)' : 'Creditors (we owe)', style: Theme.of(context).textTheme.titleMedium),
      Text(customers ? 'Credit sales not yet paid. Record payments as customers pay.' : 'Unpaid supplier purchases. Record payments as you pay suppliers.',
          style: Theme.of(context).textTheme.bodySmall),
      _head([
        Text('Total ${st.money(rows.fold<double>(0, (a, r) => a + r.$2))}', style: const TextStyle(fontWeight: FontWeight.w800)),
        ExportButtons(name: customers ? 'debtors' : 'creditors', settings: st, csv: () => [for (final (p, b) in rows) {'name': p['name'], 'phone': p['phone'], 'balance': b}]),
      ]),
      if (rows.isEmpty) const Padding(padding: EdgeInsets.all(12), child: Text('No outstanding balances')),
      for (final (p, b) in rows)
        ListTile(
          title: Text('${p['name']}'),
          subtitle: Text('${p['phone'] ?? ''}'),
          trailing: Row(mainAxisSize: MainAxisSize.min, children: [
            Text(st.money(b), style: const TextStyle(fontWeight: FontWeight.w800)),
            const SizedBox(width: 8),
            FilledButton.tonal(
              onPressed: () => _pay(title: '${customers ? 'Payment from' : 'Payment to'} ${p['name']}', kind: kind, partyId: '${p['id']}', max: b, bankOpts: bankOpts, st: st),
              child: Text(customers ? 'Receive payment' : 'Pay'),
            ),
          ]),
        ),
      const Divider(),
      Text('Payment history', style: Theme.of(context).textTheme.titleMedium),
      if (history.isEmpty) const Padding(padding: EdgeInsets.all(12), child: Text('No payments yet')),
      for (final p in history.take(200))
        ListTile(dense: true, title: Text(nameOf(p['partyId'])), subtitle: Text('${p['date']} · ${p['method'] ?? ''}${'${p['note'] ?? ''}'.isEmpty ? '' : ' · ${p['note']}'}'),
            trailing: Text(st.money((p['amount'] as num?) ?? 0))),
    ]);
  }

  Widget _payments(Map<String, List<Map<String, Object?>>> data, String Function(Object?) bankName, PharmacySettings st) {
    String who(Map<String, Object?> p) {
      final table = switch (p['kind']) { 'customer' => 'customers', 'supplier' => 'suppliers', _ => 'loans' };
      final r = data[table]!.where((x) => x['id'] == p['partyId']).firstOrNull;
      return '${r?['name'] ?? r?['lender'] ?? '—'}';
    }

    const label = {'customer': 'From customer', 'supplier': 'To supplier', 'loan': 'Loan repayment'};
    final rows = [...data['payments']!]..sort((a, b) => '${b['date']}'.compareTo('${a['date']}'));
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      _head([
        Text('${rows.length} payments'),
        ExportButtons(name: 'payments', settings: st, csv: () => [
          for (final p in rows) {'date': p['date'], 'type': label[p['kind']] ?? p['kind'], 'name': who(p), 'method': p['method'], 'account': bankName(p['bankId']), 'note': p['note'], 'amount': p['amount'], 'by': p['by']},
        ]),
      ]),
      Expanded(child: _list([
        for (final p in rows)
          ListTile(
            dense: true,
            title: Text('${label[p['kind']] ?? p['kind']} · ${who(p)}'),
            subtitle: Text('${p['date']} · ${p['method'] ?? ''} · ${bankName(p['bankId'])}${'${p['note'] ?? ''}'.isEmpty ? '' : ' · ${p['note']}'}${p['by'] == null ? '' : ' · by ${p['by']}'}'),
            trailing: Text('${p['kind'] == 'customer' ? '+' : '−'}${st.money((p['amount'] as num?) ?? 0)}',
                style: TextStyle(color: p['kind'] == 'customer' ? Colors.green.shade700 : Theme.of(context).colorScheme.error)),
          ),
      ], 'No payments yet')),
    ]);
  }
}

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/data/pharmacy_providers.dart';
import '../../../core/data/record_store.dart';
import '../../../core/entities/settings.dart';
import '../../../core/presentation/widgets.dart';
import '../../../core/rules/dates.dart';
import '../../../core/rules/ids.dart';
import '../../auth/application/session_controller.dart';
import '../domain/ledger.dart';

const _tables = ['sales', 'purchases', 'supplierReturns', 'expenses', 'expenseCategories', 'payments', 'loans', 'bankTx', 'banks', 'customers', 'suppliers'];

/// Finance: account balances (cash drawer, banks, mobile money) with each account's statement; expenses; deposits,
/// withdrawals and transfers; loans and repayments.
class FinanceScreen extends ConsumerStatefulWidget {
  const FinanceScreen({super.key});
  @override
  ConsumerState<FinanceScreen> createState() => _FinanceScreenState();
}

class _FinanceScreenState extends ConsumerState<FinanceScreen> with SingleTickerProviderStateMixin {
  late final _tabs = TabController(length: 4, vsync: this);

  @override
  Widget build(BuildContext context) {
    final t = {for (final n in _tables) n: ref.watch(tableProvider(n)).value};
    final st = ref.watch(settingsProvider).value ?? const PharmacySettings();
    if (t.values.any((v) => v == null)) return const Center(child: CircularProgressIndicator());
    final data = {for (final e in t.entries) e.key: e.value!};
    final banks = [...data['banks']!];
    if (!banks.any((b) => b['id'] == 'cash-drawer')) banks.insert(0, {'id': 'cash-drawer', 'name': 'Cash drawer'});
    final bal = accountBalances({...data, 'banks': banks});
    final entries = ledger(data);
    final store = ref.read(recordStoreProvider);
    Future<String> who() async => (await ref.read(sessionControllerProvider.future))?.userName ?? '';
    final bankOpts = [for (final b in banks) ('${b['id']}', '${b['name']}')];
    final cats = [for (final c in data['expenseCategories']!) ('${c['id']}', '${c['name']}')];

    return PageFrame(
      title: 'Finance',
      subtitle: 'Total in all accounts ${st.money(bal.values.fold(0.0, (a, b) => a + b))}',
      child: Column(children: [
        TabBar(controller: _tabs, isScrollable: true, tabs: const [Tab(text: 'Accounts'), Tab(text: 'Expenses'), Tab(text: 'Banking'), Tab(text: 'Loans')]),
        Expanded(
          child: TabBarView(controller: _tabs, children: [
            // accounts
            ListView(children: [
              for (final b in banks)
                ExpansionTile(
                  title: Text('${b['name']}'),
                  trailing: Text(st.money(bal['${b['id']}'] ?? 0), style: const TextStyle(fontWeight: FontWeight.w800)),
                  children: [
                    for (final e in entries.where((e) => e.account == b['id']).toList().reversed.take(50))
                      ListTile(dense: true, title: Text(e.desc), subtitle: Text('${dayOf(e.date)} · ${e.kind}'),
                          trailing: Text(e.inAmount > 0 ? '+${st.money(e.inAmount)}' : '−${st.money(e.outAmount)}',
                              style: TextStyle(color: e.inAmount > 0 ? Colors.green.shade700 : Theme.of(context).colorScheme.error))),
                  ],
                ),
              Padding(
                padding: const EdgeInsets.all(12),
                child: OutlinedButton.icon(onPressed: () async {
                  final v = await editRecord(context, title: 'New account', fields: const [
                    FormFieldSpec('name', 'Name (e.g. Stanbic, MTN MoMo merchant)', required: true),
                    FormFieldSpec('account', 'Account no.'),
                    FormFieldSpec('opening', 'Opening balance', kind: FieldKind.number),
                  ]);
                  if (v != null) await store.update((d) => d.put('banks', {...v, 'id': uid()}));
                }, icon: const Icon(Icons.add), label: const Text('Add account')),
              ),
            ]),
            // expenses
            _ListWithAdd(
              add: 'Add expense',
              rows: [...data['expenses']!]..sort((a, b) => '${b['date']}'.compareTo('${a['date']}')),
              title: (r) => '${cats.where((c) => c.$1 == r['categoryId']).firstOrNull?.$2 ?? 'Expense'}: ${r['description'] ?? ''}',
              subtitle: (r) => '${r['date']} · ${r['payee'] ?? ''} · from ${bankOpts.where((b) => b.$1 == (r['bankId'] ?? 'cash-drawer')).firstOrNull?.$2 ?? ''}',
              trailing: (r) => st.money((r['amount'] as num?) ?? 0),
              onAdd: () async {
                final v = await editRecord(context, title: 'New expense', initial: {'date': today(), 'bankId': 'cash-drawer'}, fields: [
                  const FormFieldSpec('date', 'Date', kind: FieldKind.date, required: true),
                  FormFieldSpec('categoryId', 'Category', kind: FieldKind.choice, options: cats),
                  const FormFieldSpec('description', 'What for', required: true),
                  const FormFieldSpec('payee', 'Paid to'),
                  const FormFieldSpec('amount', 'Amount', kind: FieldKind.number, required: true),
                  FormFieldSpec('bankId', 'Paid from', kind: FieldKind.choice, options: bankOpts),
                ]);
                if (v == null) return;
                final by = await who();
                await store.update((d) {
                  d.put('expenses', {...v, 'id': uid(), 'by': by});
                  d.audit(by, 'Expense recorded', '${v['description']}: ${v['amount']}');
                });
              },
            ),
            // banking
            _ListWithAdd(
              add: 'Deposit / withdraw / transfer',
              rows: [...data['bankTx']!]..sort((a, b) => '${b['date']}'.compareTo('${a['date']}')),
              title: (r) => '${r['type']}${r['note'] == null || '${r['note']}'.isEmpty ? '' : ' – ${r['note']}'}',
              subtitle: (r) => '${r['date']}',
              trailing: (r) => st.money((r['amount'] as num?) ?? 0),
              onAdd: () async {
                final v = await editRecord(context, title: 'Move money', initial: {'date': today(), 'type': 'Deposit'}, fields: [
                  const FormFieldSpec('type', 'What', kind: FieldKind.choice, required: true, options: [('Deposit', 'Deposit (cash drawer → account)'), ('Withdrawal', 'Withdrawal (account → cash drawer)'), ('Transfer', 'Transfer between accounts')]),
                  FormFieldSpec('bankId', 'Account (deposit / withdrawal)', kind: FieldKind.choice, options: bankOpts),
                  FormFieldSpec('fromId', 'From (transfer)', kind: FieldKind.choice, options: bankOpts),
                  FormFieldSpec('toId', 'To (transfer)', kind: FieldKind.choice, options: bankOpts),
                  const FormFieldSpec('amount', 'Amount', kind: FieldKind.number, required: true),
                  const FormFieldSpec('date', 'Date', kind: FieldKind.date, required: true),
                  const FormFieldSpec('note', 'Note'),
                ]);
                if (v != null) await store.update((d) => d.put('bankTx', {...v, 'id': uid()}));
              },
            ),
            // loans
            _ListWithAdd(
              add: 'Add loan',
              rows: data['loans']!,
              title: (r) => '${r['lender']} · ${r['purpose'] ?? ''}',
              subtitle: (r) {
                final l = loanBalance(r, data['payments']!);
                return '${r['date']} · ${st.money(l.total)} with interest · repaid ${st.money(l.repaid)}';
              },
              trailing: (r) => st.money(loanBalance(r, data['payments']!).balance),
              onTap: (r) async {
                final l = loanBalance(r, data['payments']!);
                if (l.balance <= 0) return;
                final v = await editRecord(context, title: 'Repay ${r['lender']}', save: 'Record repayment', initial: {'amount': l.balance, 'date': today(), 'bankId': 'cash-drawer'}, fields: [
                  const FormFieldSpec('amount', 'Amount', kind: FieldKind.number, required: true),
                  const FormFieldSpec('date', 'Date', kind: FieldKind.date, required: true),
                  FormFieldSpec('bankId', 'Paid from', kind: FieldKind.choice, options: bankOpts),
                ]);
                if (v == null) return;
                final by = await who();
                await store.update((d) => d.put('payments', {...v, 'id': uid(), 'kind': 'loan', 'partyId': r['id'], 'method': 'Cash', 'by': by}));
              },
              onAdd: () async {
                final v = await editRecord(context, title: 'New loan', initial: {'date': today(), 'bankId': 'cash-drawer'}, fields: [
                  const FormFieldSpec('lender', 'Lender', required: true),
                  const FormFieldSpec('amount', 'Amount received', kind: FieldKind.number, required: true),
                  const FormFieldSpec('interestRate', 'Interest (%)', kind: FieldKind.number),
                  const FormFieldSpec('date', 'Date', kind: FieldKind.date, required: true),
                  const FormFieldSpec('dueDate', 'Due date', kind: FieldKind.date),
                  FormFieldSpec('bankId', 'Received into', kind: FieldKind.choice, options: bankOpts),
                  const FormFieldSpec('purpose', 'Purpose'),
                ]);
                if (v != null) await store.update((d) => d.put('loans', {...v, 'id': uid()}));
              },
            ),
          ]),
        ),
      ]),
    );
  }
}

class _ListWithAdd extends StatelessWidget {
  const _ListWithAdd({required this.add, required this.rows, required this.title, required this.subtitle, required this.trailing, required this.onAdd, this.onTap});
  final String add;
  final List<Map<String, Object?>> rows;
  final String Function(Map<String, Object?>) title, subtitle, trailing;
  final VoidCallback onAdd;
  final void Function(Map<String, Object?>)? onTap;
  @override
  Widget build(BuildContext context) => Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Padding(padding: const EdgeInsets.symmetric(vertical: 8), child: FilledButton.icon(onPressed: onAdd, icon: const Icon(Icons.add), label: Text(add))),
        Expanded(
          child: rows.isEmpty
              ? const EmptyState('Nothing here yet')
              : ListView.separated(
                  itemCount: rows.length,
                  separatorBuilder: (_, _) => const Divider(height: 1),
                  itemBuilder: (_, i) => ListTile(title: Text(title(rows[i])), subtitle: Text(subtitle(rows[i])), trailing: Text(trailing(rows[i])),
                      onTap: onTap == null ? null : () => onTap!(rows[i])),
                ),
        ),
      ]);
}

// Money in and out of each account (src/finance.js ledger / accountBalances / loanBalance): sales paid in, refunds,
// purchases paid, supplier refunds, expenses, client / supplier / loan payments, loans received, deposits, withdrawals
// and transfers between accounts. Each account starts from its opening balance.
import '../../../core/rules/money.dart';

const cashDrawer = 'cash-drawer';

class LedgerEntry {
  const LedgerEntry({required this.date, required this.desc, required this.inAmount, required this.outAmount, required this.account, required this.kind});
  final String date, desc, account, kind;
  final double inAmount, outAmount;
}

double _n(Object? v) => (v as num?)?.toDouble() ?? 0;
String _acct(Object? v) => v == null || '$v'.isEmpty ? cashDrawer : '$v';

List<LedgerEntry> ledger(Map<String, List<Map<String, Object?>>> t) {
  final e = <LedgerEntry>[];
  String nameOf(String table, Object? id, [String field = 'name']) => '${(t[table] ?? const []).where((x) => x['id'] == id).firstOrNull?[field] ?? ''}';
  for (final s in t['sales'] ?? const <Map<String, Object?>>[]) {
    if (s['imported'] == true) continue;
    final paid = s['paid'] == null ? _n(s['total']) : _n(s['paid']);
    final who = '${s['customerName'] ?? ''}';
    if (paid > 0) e.add(LedgerEntry(date: '${s['date']}', desc: 'Sale ${s['number']}${who.isEmpty ? '' : ' – $who'}', inAmount: paid, outAmount: 0, account: _acct(s['bankId']), kind: 'Sales'));
    if (s['status'] == 'refunded') {
      e.add(LedgerEntry(date: '${s['refundedAt'] ?? s['date']}', desc: 'Refund ${s['number']}', inAmount: 0, outAmount: paid, account: _acct(s['bankId']), kind: 'Refunds'));
    }
  }
  for (final p in t['purchases'] ?? const <Map<String, Object?>>[]) {
    if (p['imported'] == true) continue;
    final paid = p['paid'] == null ? _n(p['total']) : _n(p['paid']);
    if (paid > 0) e.add(LedgerEntry(date: '${p['date']}', desc: 'Purchase ${p['invoice'] ?? ''} – ${p['supplierName']}', inAmount: 0, outAmount: paid, account: _acct(p['bankId']), kind: 'Purchases'));
  }
  for (final r in t['supplierReturns'] ?? const <Map<String, Object?>>[]) {
    if (r['settle'] == 'cash' && _n(r['total']) > 0) {
      e.add(LedgerEntry(date: '${r['date']}', desc: 'Refund for return ${r['number']} – ${r['supplierName']}', inAmount: _n(r['total']), outAmount: 0, account: _acct(r['bankId']), kind: 'Supplier returns'));
    }
  }
  for (final x in t['expenses'] ?? const <Map<String, Object?>>[]) {
    final cat = nameOf('expenseCategories', x['categoryId']);
    e.add(LedgerEntry(date: '${x['date']}', desc: '${cat.isEmpty ? 'Expense' : cat}: ${x['description'] ?? ''}', inAmount: 0, outAmount: _n(x['amount']), account: _acct(x['bankId']), kind: 'Expenses'));
  }
  for (final p in t['payments'] ?? const <Map<String, Object?>>[]) {
    final kind = '${p['kind']}';
    final who = kind == 'customer' ? nameOf('customers', p['partyId']) : kind == 'supplier' ? nameOf('suppliers', p['partyId']) : nameOf('loans', p['partyId'], 'lender');
    final incoming = kind == 'customer';
    final label = {'customer': 'Payment from', 'supplier': 'Payment to', 'loan': 'Loan repayment to'}[kind] ?? 'Payment';
    e.add(LedgerEntry(date: '${p['date']}', desc: '$label $who', inAmount: incoming ? _n(p['amount']) : 0, outAmount: incoming ? 0 : _n(p['amount']), account: _acct(p['bankId']), kind: 'Payments'));
  }
  for (final l in t['loans'] ?? const <Map<String, Object?>>[]) {
    e.add(LedgerEntry(date: '${l['date']}', desc: 'Loan received from ${l['lender']}', inAmount: _n(l['amount']), outAmount: 0, account: _acct(l['bankId']), kind: 'Loans'));
  }
  for (final x in t['bankTx'] ?? const <Map<String, Object?>>[]) {
    final type = '${x['type']}';
    final from = type == 'Deposit' ? cashDrawer : '${x['fromId'] ?? x['bankId']}';
    final to = type == 'Withdrawal' ? cashDrawer : type == 'Deposit' ? '${x['bankId']}' : '${x['toId']}';
    final desc = '$type${x['note'] == null || '${x['note']}'.isEmpty ? '' : ' – ${x['note']}'}';
    e.add(LedgerEntry(date: '${x['date']}', desc: desc, inAmount: 0, outAmount: _n(x['amount']), account: from, kind: 'Banking'));
    e.add(LedgerEntry(date: '${x['date']}', desc: desc, inAmount: _n(x['amount']), outAmount: 0, account: to, kind: 'Banking'));
  }
  return e..sort((a, b) => a.date.compareTo(b.date));
}

Map<String, double> accountBalances(Map<String, List<Map<String, Object?>>> t) {
  final bal = {for (final b in t['banks'] ?? const <Map<String, Object?>>[]) '${b['id']}': _n(b['opening'])};
  for (final x in ledger(t)) {
    bal[x.account] = (bal[x.account] ?? 0) + x.inAmount - x.outAmount;
  }
  return bal;
}

({double total, double repaid, double balance}) loanBalance(Map<String, Object?> loan, Iterable<Map<String, Object?>> payments) {
  final repaid = payments.where((p) => p['kind'] == 'loan' && p['partyId'] == loan['id']).fold(0.0, (a, p) => a + _n(p['amount']));
  // rounded to cents: 50,000 × 1.10 must be 55,000, not 55,000.00000000001
  final total = round(_n(loan['amount']) * (1 + _n(loan['interestRate']) / 100), 2);
  return (total: total, repaid: repaid, balance: total - repaid);
}

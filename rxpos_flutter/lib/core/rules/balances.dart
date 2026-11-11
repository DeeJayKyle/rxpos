// Every balance as a sum of dated entries (faster sync, stage 4: docs/SYNC-HISTORY-WINDOW.md). Same rules as the
// React app's src/balances.js, checked against the shared cases in tests/balance-cases.json.
//
// Stock is the sum of stock movements; what a client, supplier or insurer owes, each cash or bank account and each
// loan are sums of what sales, purchases, payments, expenses, returns, loans and bank transfers put on them. With
// recent history on a device (a window starting at W), the cloud adds up the entries dated before W ("brought
// forward") and the device adds the entries dated from W; splitting by the date of each ENTRY keeps them exact.
import 'insurance.dart';

const cashAccount = 'cash-drawer';
const _mainBranch = 'main';

/// The tables whose records make entries.
const entryTables = ['movements', 'sales', 'purchases', 'supplierReturns', 'expenses', 'payments', 'loans', 'bankTx'];

/// One entry: what a record puts on a balance at a date. Stock entries also carry the product and branch.
class Entry {
  const Entry({required this.kind, required this.key, required this.date, required this.amount, this.product, this.branch});
  final String kind, key, date;
  final double amount;
  final String? product, branch;

  Map<String, Object?> toJson() => {'kind': kind, 'key': key, if (product != null) 'product': product, if (branch != null) 'branch': branch, 'date': date, 'amount': amount};
}

double _n(Object? v) => v is num ? v.toDouble() : double.tryParse('${v ?? ''}') ?? 0;
String _s(Object? v) => v == null ? '' : '$v';
String _acct(Object? v) => v == null || v == '' ? cashAccount : '$v';

/// The entries one record of table [t] makes (none for a deleted record or a table that makes none).
List<Entry> entriesOf(String t, Map<String, Object?>? r) {
  if (r == null || r['deleted'] == true) return const [];
  final out = <Entry>[];
  void money(Object? account, String date, double amount) {
    if (amount != 0) out.add(Entry(kind: 'account', key: _acct(account), date: date, amount: amount));
  }

  final date = _s(r['date']);
  switch (t) {
    case 'movements':
      final branch = r['branchId'] == null || r['branchId'] == '' ? _mainBranch : '${r['branchId']}';
      final batch = r['batchId'] == null || r['batchId'] == '' ? 'lb-${r['productId']}' : '${r['batchId']}';
      out.add(Entry(kind: 'stock', key: '$branch|$batch', product: _s(r['productId']), branch: branch, date: date, amount: _n(r['qty'])));
    case 'sales':
      final customer = r['customerId'];
      if (customer != null && customer != '') {
        final owes = clientOwes(r);
        if (owes != 0) out.add(Entry(kind: 'customer', key: '$customer', date: date, amount: owes));
      }
      final ins = r['insurance'];
      final insurerId = ins is Map ? ins['insurerId'] : null;
      if (insurerId != null && insurerId != '') {
        final share = insurerShare(r);
        if (share != 0) out.add(Entry(kind: 'insurer', key: '$insurerId', date: date, amount: share));
      }
      if (r['imported'] != true) {
        final paid = _n(r['paid'] ?? r['total']);
        if (paid > 0) money(r['bankId'], date, paid);
        if (r['status'] == 'refunded') money(r['bankId'], r['refundedAt'] == null || r['refundedAt'] == '' ? date : '${r['refundedAt']}', -paid);
      }
    case 'purchases':
      final owed = _n(r['total']) - _n(r['paid'] ?? r['total']);
      final supplier = r['supplierId'];
      if (owed != 0 && supplier != null && supplier != '') out.add(Entry(kind: 'supplier', key: '$supplier', date: date, amount: owed));
      if (r['imported'] != true) {
        final paid = _n(r['paid'] ?? r['total']);
        if (paid > 0) money(r['bankId'], date, -paid);
      }
    case 'supplierReturns':
      final total = _n(r['total']);
      final supplier = r['supplierId'];
      if (r['settle'] == 'credit' && supplier != null && supplier != '' && total != 0) {
        out.add(Entry(kind: 'supplier', key: '$supplier', date: date, amount: -total));
      }
      if (r['settle'] == 'cash' && total > 0) money(r['bankId'], date, total);
    case 'expenses':
      money(r['bankId'], date, -_n(r['amount']));
    case 'payments':
      final a = _n(r['amount']);
      final kind = r['kind'];
      if (kind == 'customer' || kind == 'supplier' || kind == 'insurer') {
        if (a != 0) out.add(Entry(kind: '$kind', key: _s(r['partyId']), date: date, amount: -a));
      } else if (kind == 'loan' && a != 0) {
        out.add(Entry(kind: 'loan', key: _s(r['partyId']), date: date, amount: a)); // repaid
      }
      money(r['bankId'], date, kind == 'customer' || kind == 'insurer' ? a : -a);
    case 'loans':
      money(r['bankId'], date, _n(r['amount']));
    case 'bankTx':
      final type = r['type'];
      final from = type == 'Deposit' ? cashAccount : (r['fromId'] ?? r['bankId']);
      final to = type == 'Withdrawal' ? cashAccount : type == 'Deposit' ? r['bankId'] : r['toId'];
      money(from, date, -_n(r['amount']));
      money(to, date, _n(r['amount']));
  }
  return out;
}

/// Totals by kind and key; [keep] chooses which entries count.
Map<String, Map<String, double>> sumEntries(Map<String, Iterable<Map<String, Object?>>> tables, {bool Function(Entry)? keep}) {
  final sums = {for (final k in ['stock', 'customer', 'supplier', 'insurer', 'account', 'loan']) k: <String, double>{}};
  for (final t in entryTables) {
    for (final r in tables[t] ?? const <Map<String, Object?>>[]) {
      for (final e in entriesOf(t, r)) {
        if (keep != null && !keep(e)) continue;
        final m = sums[e.kind]!;
        m[e.key] = (m[e.key] ?? 0) + e.amount;
      }
    }
  }
  return sums;
}

/// Brought-forward figures at window start [w]: the entries dated before it (what the cloud sends).
Map<String, Map<String, double>> broughtForward(Map<String, Iterable<Map<String, Object?>>> tables, String w) =>
    sumEntries(tables, keep: (e) => e.date.compareTo(w) < 0);

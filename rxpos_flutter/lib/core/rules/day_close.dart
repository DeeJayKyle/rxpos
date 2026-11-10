// Closing a day (workplan step 18), the same rules as src/dayclose.js: after an admin or manager closes a day for a
// branch, its sales, expenses, payments, bank transactions and stock can't be changed or deleted from any device (the
// cloud refuses it); a refund of its sale, or something new recorded for it later, is kept and flagged for the owner.
// The close keeps the day's totals as they were. Reopening needs an administrator and a reason.
import 'dates.dart';
import 'stock.dart';

String closeId(String? branchId, String day) => '${(branchId == null || branchId.isEmpty) ? mainBranch : branchId}:$day';

/// The closed `branch:day` keys (a reopened day is open again).
Set<String> closedSet(Iterable<Map<String, Object?>> closes) => {
      for (final c in closes)
        if ('${c['day'] ?? ''}'.isNotEmpty && c['open'] != true) closeId(c['branchId'] as String?, '${c['day']}'),
    };

/// The local day a record belongs to (its date), or null.
String? recordDay(Map<String, Object?> rec) {
  final d = dayOf(rec['date'] as String?);
  return d.isEmpty ? null : d;
}

bool inClosedDay(Map<String, Object?> rec, Set<String> closed) {
  final day = recordDay(rec);
  return day != null && closed.contains(closeId(rec['branchId'] as String?, day));
}

/// The day's totals at closing (kept on the close record): sales, by payment method, refunds, expenses.
Map<String, Object?> daySnapshot(Iterable<Map<String, Object?>> sales, Iterable<Map<String, Object?>> expenses, String branchId, String day) {
  bool at(Map<String, Object?> r) => ('${r['branchId'] ?? ''}'.isEmpty ? mainBranch : r['branchId']) == branchId && recordDay(r) == day;
  final mine = sales.where(at).toList();
  final done = mine.where((s) => s['status'] != 'refunded').toList();
  final byPayment = <String, num>{};
  for (final s in done) {
    final k = '${s['payment'] ?? 'Other'}';
    byPayment[k] = (byPayment[k] ?? 0) + ((s['total'] as num?) ?? 0);
  }
  return {
    'sales': done.length,
    'total': done.fold<num>(0, (a, s) => a + ((s['total'] as num?) ?? 0)),
    'byPayment': byPayment,
    'refunded': mine.length - done.length,
    'expenses': expenses.where(at).fold<num>(0, (a, e) => a + ((e['amount'] as num?) ?? 0)),
  };
}

// Shifts and cash-up (src/pages/Shifts.jsx): a cashier opens a shift with a float and closes it by counting the drawer;
// the expected cash is the float + their cash sales − their cash refunds during the shift.
import '../../../core/data/record_store.dart';
import '../../../core/entities/sale.dart';
import '../../../core/entities/shift.dart';
import '../../../core/rules/ids.dart';
import '../../../core/rules/stock.dart';

/// Ugandan notes and coins counted at close (src/pages/Shifts.jsx NOTES); the rest is typed as "coins".
const notes = [50000, 20000, 10000, 5000, 2000, 1000, 500, 200, 100, 50];

class ShiftSummary {
  const ShiftSummary({required this.count, required this.total, required this.byMethod, required this.discounts, required this.refunds,
      required this.refundTotal, required this.expectedCash, required this.credit});
  final int count, refunds;
  final double total, discounts, refundTotal, expectedCash, credit;
  final Map<String, double> byMethod;
  Map<String, Object?> toJson() => {'count': count, 'total': total, 'byMethod': byMethod, 'discounts': discounts, 'refunds': refunds,
    'refundTotal': refundTotal, 'expectedCash': expectedCash, 'credit': credit};
}

ShiftSummary shiftSummary(Shift shift, Iterable<Sale> sales, {String? now}) {
  final end = shift.closedAt ?? now ?? DateTime.now().toUtc().toIso8601String();
  final branch = shift.branchId.isEmpty ? mainBranch : shift.branchId;
  bool inShift(Sale s) => s.date.compareTo(shift.openedAt) >= 0 && s.date.compareTo(end) <= 0 && (s.branchId.isEmpty ? mainBranch : s.branchId) == branch;
  final mine = sales.where((s) => s.cashier == shift.user && inShift(s)).toList();
  final valid = mine.where((s) => s.status != 'refunded').toList();
  final byMethod = <String, double>{};
  for (final s in valid) {
    byMethod[s.payment] = (byMethod[s.payment] ?? 0) + s.paid;
  }
  final refunds = sales.where((s) => s.status == 'refunded' && s.raw['refundedBy'] == shift.user &&
      '${s.raw['refundedAt']}'.compareTo(shift.openedAt) >= 0 && '${s.raw['refundedAt']}'.compareTo(end) <= 0).toList();
  double cash(Iterable<Sale> x) => x.where((s) => s.payment == 'Cash').fold(0.0, (a, s) => a + s.paid);
  return ShiftSummary(
    count: valid.length, total: valid.fold(0.0, (a, s) => a + s.total), byMethod: byMethod, discounts: valid.fold(0.0, (a, s) => a + s.discount),
    refunds: refunds.length, refundTotal: refunds.fold(0.0, (a, s) => a + s.total),
    expectedCash: shift.float + cash(valid) - cash(refunds), credit: valid.fold(0.0, (a, s) => a + (s.total - s.paid)),
  );
}

Future<Map<String, Object?>> openShift(RecordStore store, {required String userId, required String user, required double float, String branchId = mainBranch}) =>
    store.update((d) {
      final s = d.put('shifts', {'id': uid(), 'userId': userId, 'user': user, 'branchId': branchId, 'openedAt': d.now, 'float': float, 'date': d.now});
      d.audit(user, 'Shift opened', 'Float $float', branchId);
      return s;
    });

/// Close a shift with the cash counted ([counts]: note value → how many, plus 'coins' as an amount).
Future<Map<String, Object?>> closeShift(RecordStore store, Shift open, Iterable<Sale> sales, {required Map<String, num> counts, String note = '', bool blind = false}) {
  final counted = notes.fold<double>(0, (a, n) => a + n * (counts['$n'] ?? 0)) + (counts['coins'] ?? 0);
  final sum = shiftSummary(open, sales);
  return store.update((d) {
    final rec = d.put('shifts', {...open.toRecord(), 'closedAt': d.now, 'counts': counts, 'counted': counted, 'expected': sum.expectedCash,
      'variance': counted - sum.expectedCash, 'note': note, 'summary': sum.toJson(), if (blind) 'blind': true}); // step 20: counted before the expected cash was shown
    d.audit(open.user, blind ? 'Shift closed (blind count)' : 'Shift closed', 'Counted $counted, expected ${sum.expectedCash} (${counted - sum.expectedCash >= 0 ? '+' : ''}${counted - sum.expectedCash})', open.branchId);
    return rec;
  });
}

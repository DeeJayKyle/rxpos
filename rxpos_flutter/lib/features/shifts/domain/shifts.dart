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
      required this.refundTotal, required this.expectedCash, required this.credit, this.insured = 0});
  final int count, refunds;
  /// step 22: billed to insurers (owed by them, not the clients)
  final double total, discounts, refundTotal, expectedCash, credit, insured;
  final Map<String, double> byMethod;
  Map<String, Object?> toJson() => {'count': count, 'total': total, 'byMethod': byMethod, 'discounts': discounts, 'refunds': refunds,
    'refundTotal': refundTotal, 'expectedCash': expectedCash, 'credit': credit, if (insured > 0) 'insured': insured};
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
    expectedCash: shift.float + cash(valid) - cash(refunds), credit: valid.fold(0.0, (a, s) => a + s.balance),
    insured: valid.fold(0.0, (a, s) => a + s.insuredShare),
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

/// A day of a person's work with sales outside any shift: one shift to create (src/shiftsfromsales.js).
class PlannedShift {
  PlannedShift({required this.user, required this.userId, required this.branchId, required this.day, required this.openedAt, required this.closedAt});
  final String user, userId, branchId, day;
  String openedAt, closedAt;
  int sales = 0;
  double total = 0;
}

String _localDay(String iso) {
  final d = DateTime.tryParse(iso)?.toLocal();
  return d == null ? (iso.length >= 10 ? iso.substring(0, 10) : iso) : '${d.year}-${'${d.month}'.padLeft(2, '0')}-${'${d.day}'.padLeft(2, '0')}';
}

/// Past sales made outside any shift → one shift per person, branch and day, first sale to last (the owner's request,
/// 2026-11-20). Writes nothing: the owner reviews the list and approves it (the owner's law: no change without approval).
List<PlannedShift> shiftsFromSales(Iterable<Sale> sales, Iterable<Shift> shifts, Map<String, String> userIdByName, {String? now}) {
  final end = now ?? DateTime.now().toUtc().toIso8601String();
  String br(String b) => b.isEmpty ? mainBranch : b;
  final list = shifts.toList();
  bool covered(Sale s) => list.any((sh) => sh.user == s.cashier && br(sh.branchId) == br(s.branchId) && s.date.compareTo(sh.openedAt) >= 0 && s.date.compareTo(sh.closedAt ?? end) <= 0);
  final groups = <String, PlannedShift>{};
  for (final s in sales) {
    if (s.date.isEmpty || s.cashier.isEmpty || s.raw['training'] == true || covered(s)) continue;
    final day = _localDay(s.date), key = '${s.cashier}|${br(s.branchId)}|$day';
    final g = groups.putIfAbsent(key, () => PlannedShift(user: s.cashier, userId: '${s.raw['cashierId'] ?? userIdByName[s.cashier.trim().toLowerCase()] ?? ''}', branchId: br(s.branchId), day: day, openedAt: s.date, closedAt: s.date));
    if (s.date.compareTo(g.openedAt) < 0) g.openedAt = s.date;
    if (s.date.compareTo(g.closedAt) > 0) g.closedAt = s.date;
    g.sales++;
    if (s.status != 'refunded') g.total += s.total;
  }
  return groups.values.toList()..sort((a, b) => a.openedAt.compareTo(b.openedAt) != 0 ? a.openedAt.compareTo(b.openedAt) : a.user.compareTo(b.user));
}

/// Save the approved shifts: no float, no cash count ("rebuilt"), each with what its sales add up to; one audit line.
Future<void> createRebuiltShifts(RecordStore store, List<PlannedShift> plan, Iterable<Sale> sales, {required String approvedBy}) => store.update((d) {
      for (final g in plan) {
        final rec = {'id': uid(), 'userId': g.userId, 'user': g.user, 'branchId': g.branchId, 'openedAt': g.openedAt, 'closedAt': g.closedAt, 'date': g.openedAt, 'float': 0,
          'rebuilt': true, 'counts': const <String, Object?>{}, 'counted': null, 'variance': null, 'note': 'Rebuilt from past sales (no cash count)'};
        final sum = shiftSummary(Shift.fromRecord(rec), sales);
        d.put('shifts', {...rec, 'summary': sum.toJson(), 'expected': sum.expectedCash});
      }
      d.audit(approvedBy, 'Shifts rebuilt from past sales (approved by the owner)',
          '${plan.length} shift(s): ${plan.take(20).map((g) => '${g.user} ${g.day}').join('; ')}${plan.length > 20 ? '…' : ''}', mainBranch);
    });

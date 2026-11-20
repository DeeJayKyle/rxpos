// Past sales outside any shift → one shift per person, branch and day (lib/features/shifts/domain/shifts.dart, as
// src/shiftsfromsales.js); nothing is written until the owner approves.
import 'package:flutter_test/flutter_test.dart';
import 'package:rxpos/core/entities/sale.dart';
import 'package:rxpos/core/entities/shift.dart';
import 'package:rxpos/features/shifts/domain/shifts.dart';

Sale sale(String id, String cashier, String date, {String status = 'completed', bool training = false}) =>
    Sale.fromRecord({'id': id, 'cashier': cashier, 'date': date, 'total': 1000, 'status': status, 'branchId': 'main', if (training) 'training': true});

void main() {
  test('each person\'s sales on a day become one shift, first sale to last', () {
    final r = shiftsFromSales([sale('a', 'Amina', '2026-11-01T08:10:00Z'), sale('b', 'Amina', '2026-11-01T12:00:00Z'), sale('c', 'Henry', '2026-11-01T09:00:00Z')], const [], {'amina': 'u1'});
    expect(r, hasLength(2));
    final a = r.firstWhere((x) => x.user == 'Amina');
    expect([a.userId, a.openedAt, a.closedAt, a.sales, a.total], ['u1', '2026-11-01T08:10:00Z', '2026-11-01T12:00:00Z', 2, 2000]);
  });
  test('sales inside a shift, training sales and refunds are handled', () {
    final shifts = [Shift.fromRecord({'id': 's', 'user': 'Amina', 'branchId': 'main', 'openedAt': '2026-11-01T07:00:00Z', 'closedAt': '2026-11-01T10:00:00Z'})];
    final r = shiftsFromSales([sale('a', 'Amina', '2026-11-01T08:00:00Z'), sale('b', 'Amina', '2026-11-01T13:00:00Z', status: 'refunded'), sale('c', 'Amina', '2026-11-01T14:00:00Z', training: true)], shifts, const {});
    expect(r, hasLength(1));
    expect([r.single.sales, r.single.total], [1, 0]);
  });
}

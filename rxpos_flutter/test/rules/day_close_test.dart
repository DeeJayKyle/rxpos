// Step 18: closing a day (core/rules/day_close.dart, as src/dayclose.js).
import 'package:flutter_test/flutter_test.dart';
import 'package:rxpos/core/rules/day_close.dart';

void main() {
  final closes = [
    {'id': 'main:2026-11-09', 'branchId': 'main', 'day': '2026-11-09', 'open': false},
    {'id': 'kla:2026-11-09', 'branchId': 'kla', 'day': '2026-11-09', 'open': true}, // reopened
    {'id': 'main:2026-11-08', 'branchId': 'main', 'day': '2026-11-08'},
  ];
  final closed = closedSet(closes);

  test('closed days per branch; a reopened day is open', () {
    expect(closed, {'main:2026-11-09', 'main:2026-11-08'});
  });

  test('a record is in a closed day by its date and branch (a record without a branch is the main branch)', () {
    expect(inClosedDay({'date': '2026-11-09', 'branchId': 'main'}, closed), isTrue);
    expect(inClosedDay({'date': '2026-11-09'}, closed), isTrue);
    expect(inClosedDay({'date': '2026-11-09', 'branchId': 'kla'}, closed), isFalse);
    expect(inClosedDay({'date': '2026-11-10', 'branchId': 'main'}, closed), isFalse);
    expect(inClosedDay({'amount': 5}, closed), isFalse, reason: 'no date');
  });

  test('the frozen totals: sales (not refunded), by payment, refunds, expenses of that branch and day', () {
    final sales = [
      {'date': '2026-11-09', 'branchId': 'main', 'total': 500, 'payment': 'Cash'},
      {'date': '2026-11-09', 'total': 700, 'payment': 'MTN MoMo'},
      {'date': '2026-11-09', 'total': 300, 'payment': 'Cash', 'status': 'refunded'},
      {'date': '2026-11-09', 'branchId': 'kla', 'total': 9999, 'payment': 'Cash'},
      {'date': '2026-11-08', 'total': 9999, 'payment': 'Cash'},
    ];
    final s = daySnapshot(sales, [{'date': '2026-11-09', 'amount': 4000}, {'date': '2026-11-08', 'amount': 1}], 'main', '2026-11-09');
    expect((s['sales'], s['total'], s['refunded'], s['expenses']), (2, 1200, 1, 4000));
    expect(s['byPayment'], {'Cash': 500, 'MTN MoMo': 700});
  });
}

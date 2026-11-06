// People parity: refill reminders (prescriptions and chronic medicines) and the day's health tip, as the React app.
import 'package:flutter_test/flutter_test.dart';
import 'package:rxpos/core/entities/product.dart';
import 'package:rxpos/core/entities/sale.dart';
import 'package:rxpos/core/rules/health_tips.dart';
import 'package:rxpos/core/rules/permissions.dart';
import 'package:rxpos/features/people/domain/reminders.dart';

void main() {
  test('the day\'s health tip is the React app\'s (same date, same slot)', () {
    expect(tipFor('2026-11-05', 8).text, startsWith('Protect your skin and eyes from strong s'));
    expect(tipFor('2026-11-05', 14).text, startsWith('Cut down on sugary drinks; water is the'));
    expect(greetingMessage(pharmacy: 'Sample Pharmacy', phone: '0700', slot: 8, date: '2026-11-05'), startsWith('Good morning from Sample Pharmacy! 💚\n\nHealth tip: Protect'));
  });

  test('refills due: active prescriptions with an interval, chronic medicines from the last purchase; within 7 days or 30 overdue', () {
    final now = DateTime(2026, 11, 5);
    final rx = [
      {'id': 'r1', 'customerId': 'c1', 'status': 'Dispensed', 'dispensedOn': '2026-10-08', 'refillDays': 30, 'medications': 'Metformin 500mg bd\nother'},
      {'id': 'r2', 'customerId': 'c1', 'status': 'Pending', 'date': '2026-10-08', 'refillDays': 30, 'medications': 'x'},
      {'id': 'r3', 'customerId': 'c2', 'status': 'Dispensed', 'dispensedOn': '2026-06-01', 'refillDays': 30, 'medications': 'long ago'},
    ];
    final amlo = Product.fromRecord({'id': 'p1', 'name': 'Amlodipine 5mg', 'chronic': true, 'refillDays': 28});
    final sales = [
      Sale.fromRecord({'id': 's', 'date': '2026-10-10T10:00:00Z', 'customerId': 'c2', 'items': [{'id': 'p1', 'qty': 28}]}),
      Sale.fromRecord({'id': 'w', 'date': '2026-10-10T10:00:00Z', 'customerId': 'walk-in', 'items': [{'id': 'p1', 'qty': 28}]}),
    ];
    final due = refillsDue(rx, sales, [amlo], {'c1', 'c2'}, now: now);
    expect(due.map((r) => (r.customerId, r.medicine, r.due, r.days)), [('c1', 'Metformin 500mg bd', '2026-11-07', 2), ('c2', 'Amlodipine 5mg', '2026-11-07', 2)]);
    expect(reminderActive({'refillDays': 30, 'status': 'Completed'}), isFalse);
  });

  test('permission groups cover every permission once', () {
    final listed = [for (final (_, list) in permissionGroups) for (final (k, _) in list) k];
    expect(listed.toSet(), allPermissions.toSet());
    expect(listed.length, allPermissions.length);
  });
}

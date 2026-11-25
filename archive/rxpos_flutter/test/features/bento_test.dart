// The Dashboard's bento row and the page sheet's next step (src/components/BentoDashboard.jsx, NavMenus.jsx): a
// sale's status pill, the period's sales against the period before, and the most useful next step. Fictional sales.
import 'package:flutter_test/flutter_test.dart';
import 'package:rxpos/core/entities/sale.dart';
import 'package:rxpos/core/rules/dates.dart';
import 'package:rxpos/features/dashboard/domain/figures.dart';
import 'package:rxpos/features/dashboard/presentation/bento_row.dart';

void main() {
  test('a sale is paid, owing or refunded', () {
    expect(saleStatusOf(Sale.fromRecord({'id': 's1', 'total': 1000, 'paid': 1000})), 'paid');
    expect(saleStatusOf(Sale.fromRecord({'id': 's2', 'total': 1000})), 'paid', reason: 'no paid amount recorded: paid in full (as the React app)');
    expect(saleStatusOf(Sale.fromRecord({'id': 's3', 'total': 1000, 'paid': 0})), 'owing');
    expect(saleStatusOf(Sale.fromRecord({'id': 's4', 'total': 1000, 'paid': 1000, 'status': 'refunded'})), 'refunded');
  });

  test('the period\'s sales and the period before', () {
    final now = DateTime(2026, 11, 14, 12);
    String back(int d) => localDate(now.subtract(Duration(days: d)));
    final byDay = {
      back(0): const DayFigures().add(n: 2, total: 3000, gp: 0),
      back(3): const DayFigures().add(n: 1, total: 1000, gp: 0),
      back(8): const DayFigures().add(n: 4, total: 2000, gp: 0),
    };
    expect(periodSums(byDay, 1, now: now), (total: 3000.0, count: 2));
    expect(periodSums(byDay, 7, now: now), (total: 4000.0, count: 3));
    expect(periodSums(byDay, 7, offset: 7, now: now), (total: 2000.0, count: 4));
  });

  test('the next step: expiring, then low stock, then the cash-up, by what this person may do', () {
    expect(featuredAction(expiring: 2, low: 5, can: {'inventory.view', 'stock.receive'}).to, '/expiry');
    expect(featuredAction(expiring: 1, low: 0, can: {'inventory.view'}).title, '1 batch expiring');
    expect(featuredAction(expiring: 2, low: 5, can: {'stock.receive'}).to, '/reorder');
    expect(featuredAction(expiring: 0, low: 0, can: {'shifts'}).to, '/shifts');
    expect(featuredAction(expiring: 3, low: 3, can: {}).to, '/pos');
  });
}

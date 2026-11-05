// Reports for a date range (src/pages/Reports.jsx): sales, refunds, discounts, tax, cost of goods, gross profit,
// expenses and net profit; by day, by payment method, by medicine (sales lines) and by cashier. Per branch.
import '../../../core/entities/sale.dart';
import '../../../core/rules/dates.dart';
import '../../../core/rules/stock.dart';

class Line {
  Line(this.key);
  final String key;
  int sales = 0;
  double qty = 0, amount = 0, cost = 0;
  double get profit => amount - cost;
}

class Report {
  Report({required this.from, required this.to});
  final String from, to;
  int count = 0, refunds = 0;
  double sales = 0, refundTotal = 0, discounts = 0, tax = 0, cogs = 0, expenses = 0, credit = 0;
  double get grossProfit => sales - tax - cogs;
  double get netProfit => grossProfit - expenses;
  final byDay = <String, Line>{}, byMethod = <String, Line>{}, byMedicine = <String, Line>{}, byCashier = <String, Line>{};
}

Report report(Iterable<Sale> sales, Iterable<Map<String, Object?>> expenses, {required String from, required String to, String branch = mainBranch}) {
  final r = Report(from: from, to: to);
  bool inRange(String d) => d.compareTo(from) >= 0 && d.compareTo(to) <= 0;
  for (final s in sales) {
    final d = dayOf(s.date);
    if (!inRange(d) || (s.branchId.isEmpty ? mainBranch : s.branchId) != branch) continue;
    if (s.status == 'refunded') {
      r.refunds++;
      r.refundTotal += s.total;
      continue;
    }
    final cost = s.items.fold(0.0, (a, i) => a + i.cost * i.qty);
    r
      ..count += 1
      ..sales += s.total
      ..discounts += s.discount
      ..tax += s.tax
      ..cogs += cost
      ..credit += s.total - s.paid;
    void add(Map<String, Line> m, String k, double amount, double c, [double qty = 0]) {
      final l = m.putIfAbsent(k, () => Line(k));
      l
        ..sales += 1
        ..amount += amount
        ..cost += c
        ..qty += qty;
    }

    add(r.byDay, d, s.total, cost);
    add(r.byMethod, s.payment, s.paid, 0);
    add(r.byCashier, s.cashier, s.total, cost);
    for (final i in s.items) {
      add(r.byMedicine, i.name, i.price * i.qty, i.cost * i.qty, i.qty);
    }
  }
  for (final e in expenses) {
    if (inRange(dayOf('${e['date'] ?? ''}'))) r.expenses += (e['amount'] as num?)?.toDouble() ?? 0;
  }
  return r;
}

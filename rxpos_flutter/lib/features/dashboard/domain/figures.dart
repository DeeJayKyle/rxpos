// The day's and month's figures (src/pages/Dashboard.jsx): sales, gross profit (sales less tax, less each line's cost),
// expenses, transactions; refunded sales never count. Per branch.
import '../../../core/entities/sale.dart';
import '../../../core/rules/dates.dart';
import '../../../core/rules/stock.dart';

class DayFigures {
  const DayFigures({this.count = 0, this.total = 0, this.grossProfit = 0, this.expenses = 0});
  final int count;
  final double total, grossProfit, expenses;
  DayFigures add({int n = 0, double total = 0, double gp = 0, double exp = 0}) =>
      DayFigures(count: count + n, total: this.total + total, grossProfit: grossProfit + gp, expenses: expenses + exp);
}

/// Gross profit of a sale: what was paid for it, less tax, less what its lines cost.
double grossProfitOf(Sale s) => s.total - s.tax - s.items.fold(0.0, (a, i) => a + i.cost * i.qty);

class TopSeller {
  TopSeller(this.name);
  final String name;
  double qty = 0, amount = 0, cost = 0;
  double get profit => amount - cost;
}

class Figures {
  Figures({required this.byDay, required this.byMonth, required this.top});
  final Map<String, DayFigures> byDay, byMonth;
  final List<TopSeller> top;

  DayFigures day(String d) => byDay[d] ?? const DayFigures();
  DayFigures month(String m) => byMonth[m] ?? const DayFigures();

  /// [sales] and [expenses] as records; [now] fixes "today" in tests.
  factory Figures.of(Iterable<Sale> sales, Iterable<Map<String, Object?>> expenses, {String branch = mainBranch, DateTime? now}) {
    final byDay = <String, DayFigures>{}, byMonth = <String, DayFigures>{}, top = <String, TopSeller>{};
    final thisMonth = today(now).substring(0, 7);
    for (final s in sales) {
      if (s.status == 'refunded' || (s.branchId.isEmpty ? mainBranch : s.branchId) != branch) continue;
      final d = dayOf(s.date), m = monthOf(s.date), gp = grossProfitOf(s);
      byDay[d] = (byDay[d] ?? const DayFigures()).add(n: 1, total: s.total, gp: gp);
      byMonth[m] = (byMonth[m] ?? const DayFigures()).add(n: 1, total: s.total, gp: gp);
      if (m == thisMonth) {
        for (final i in s.items) {
          final t = top.putIfAbsent(i.name, () => TopSeller(i.name));
          t.qty += i.qty;
          t.amount += i.qty * i.price;
          t.cost += i.qty * i.cost;
        }
      }
    }
    for (final e in expenses) {
      final d = dayOf('${e['date'] ?? ''}'), m = monthOf('${e['date'] ?? ''}');
      final amount = (e['amount'] as num?)?.toDouble() ?? 0;
      byDay[d] = (byDay[d] ?? const DayFigures()).add(exp: amount);
      byMonth[m] = (byMonth[m] ?? const DayFigures()).add(exp: amount);
    }
    return Figures(byDay: byDay, byMonth: byMonth, top: top.values.toList()..sort((a, b) => b.amount.compareTo(a.amount)));
  }
}

/// Change against yesterday in %, or null when yesterday had nothing.
double? deltaPercent(double now, double before) => before > 0 ? (now - before) / before * 100 : null;

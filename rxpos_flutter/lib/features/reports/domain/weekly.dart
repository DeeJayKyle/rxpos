// The weekly summary (src/pages/Weekly.jsx weeklyStats): a week (Monday–Sunday) against the week before: totals,
// sales by day, top sellers, items that stood out or slowed down, the team, payment methods.
import '../../../core/entities/sale.dart';
import '../../../core/rules/dates.dart';
import '../../../core/rules/stock.dart';

const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/// Monday of the week containing [date], shifted by [weeks].
DateTime weekStart(DateTime date, [int weeks = 0]) {
  final d = DateTime(date.year, date.month, date.day);
  return DateTime(d.year, d.month, d.day - (d.weekday - 1) + weeks * 7);
}

double pct(double a, double b) => b != 0 ? (a - b) / b * 100 : (a != 0 ? 100 : 0);

typedef WeekItem = ({String id, String name, double qty, double amount, double before, double growth});

class WeekStats {
  WeekStats({required this.start, required this.end, required this.total, required this.prevTotal, required this.count, required this.prevCount, required this.profit,
      required this.prevProfit, required this.byDay, required this.top, required this.risers, required this.fallers, required this.staff, required this.payments});
  final String start, end;
  final double total, prevTotal, profit, prevProfit;
  final int count, prevCount;
  final List<(String, double, double)> byDay;
  final List<WeekItem> top, risers, fallers;
  final List<(String, int, double)> staff;
  final List<(String, double)> payments;
  double get basket => count == 0 ? 0 : total / count;
  (String, double, double) get best => byDay.reduce((a, d) => d.$2 > a.$2 ? d : a);
}

WeekStats weeklyStats(Iterable<Sale> all, DateTime start, {String branch = 'all'}) {
  String iso(DateTime d) => localDate(d);
  DateTime day(int n) => DateTime(start.year, start.month, start.day + n);
  final s = iso(start), e = iso(day(7)), ps = iso(day(-7));
  final sales = all.where((x) => x.status != 'refunded' && (branch == 'all' || (x.branchId.isEmpty ? mainBranch : x.branchId) == branch)).toList();
  final cur = sales.where((x) => dayOf(x.date).compareTo(s) >= 0 && dayOf(x.date).compareTo(e) < 0).toList();
  final prev = sales.where((x) => dayOf(x.date).compareTo(ps) >= 0 && dayOf(x.date).compareTo(s) < 0).toList();
  double sum(Iterable<Sale> l) => l.fold(0, (a, x) => a + x.total);
  double profit(Iterable<Sale> l) => l.fold(0, (a, x) => a + x.items.fold<double>(0, (b, i) => b + i.qty * (i.price - i.cost)) - x.discount);
  final byDay = [
    for (var i = 0; i < 7; i++) (weekDays[i], sum(cur.where((x) => dayOf(x.date) == iso(day(i)))), sum(prev.where((x) => dayOf(x.date) == iso(day(i - 7))))),
  ];
  Map<String, ({String name, double qty, double amount})> items(List<Sale> l) {
    final m = <String, ({String name, double qty, double amount})>{};
    for (final x in l) {
      for (final i in x.items) {
        final r = m[i.id] ?? (name: i.name, qty: 0.0, amount: 0.0);
        m[i.id] = (name: r.name, qty: r.qty + i.qty, amount: r.amount + i.qty * i.price);
      }
    }
    return m;
  }

  final ci = items(cur), pi = items(prev);
  final top = [for (final e in ci.entries) (id: e.key, name: e.value.name, qty: e.value.qty, amount: e.value.amount, before: pi[e.key]?.amount ?? 0.0, growth: 0.0)]
    ..sort((a, b) => b.amount.compareTo(a.amount));
  final risers = [
    for (final r in top)
      if (r.amount >= 1000) (id: r.id, name: r.name, qty: r.qty, amount: r.amount, before: r.before, growth: pct(r.amount, r.before)),
  ]..sort((a, b) => b.growth.compareTo(a.growth));
  final fallers = [
    for (final e in pi.entries)
      if (pct(ci[e.key]?.amount ?? 0, e.value.amount) < -30)
        (id: e.key, name: e.value.name, qty: ci[e.key]?.qty ?? 0.0, amount: ci[e.key]?.amount ?? 0.0, before: e.value.amount, growth: pct(ci[e.key]?.amount ?? 0, e.value.amount)),
  ]..sort((a, b) => a.growth.compareTo(b.growth));
  final staff = <String, (int, double)>{}, pay = <String, double>{};
  for (final x in cur) {
    final k = x.cashier.isEmpty ? '—' : x.cashier;
    final r = staff[k] ?? (0, 0.0);
    staff[k] = (r.$1 + 1, r.$2 + x.total);
    final p = x.payment.isEmpty ? 'Cash' : x.payment;
    pay[p] = (pay[p] ?? 0) + x.total;
  }
  return WeekStats(
    start: s, end: iso(day(6)), total: sum(cur), prevTotal: sum(prev), count: cur.length, prevCount: prev.length, profit: profit(cur), prevProfit: profit(prev),
    byDay: byDay, top: top.take(8).toList(), risers: risers.take(4).toList(), fallers: fallers.take(4).toList(),
    staff: [for (final e in staff.entries) (e.key, e.value.$1, e.value.$2)]..sort((a, b) => b.$3.compareTo(a.$3)),
    payments: [for (final e in pay.entries) (e.key, e.value)]..sort((a, b) => b.$2.compareTo(a.$2)),
  );
}

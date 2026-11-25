// The clean dashboard (src/dashboard.js; the owner's choice, 2026-11-15): period chips, each figure against the period
// before, the top medicines of the period and the stock health score with what drives it.
import '../../../core/entities/product.dart';
import '../../../core/entities/sale.dart';
import '../../../core/rules/dates.dart';
import '../../../core/rules/fefo.dart';
import 'figures.dart';

const periods = [('today', 'Today'), ('1m', '1M'), ('6m', '6M'), ('12m', '12M'), ('ytd', 'YTD')];
const periodWords = {'today': 'today', '1m': 'last 30 days', '6m': 'last 6 months', '12m': 'last 12 months', 'ytd': 'this year'};
const vsWords = {'today': 'vs yesterday', '1m': 'vs the 30 days before', '6m': 'vs the 6 months before', '12m': 'vs the 12 months before', 'ytd': 'vs the same days last year'};

DateTime _addMonths(DateTime d, int n) => DateTime(d.year, d.month + n, d.day);

/// The days of a period and of the period before it (inclusive local dates)
({String from, String to, String prevFrom, String prevTo}) periodRange(String period, {DateTime? now}) {
  final n = now ?? DateTime.now();
  final end = DateTime(n.year, n.month, n.day);
  DateTime start, prevStart, prevEnd;
  if (period == 'ytd') {
    start = DateTime(end.year, 1, 1);
    prevStart = DateTime(end.year - 1, 1, 1);
    prevEnd = DateTime(end.year - 1, end.month, end.day);
  } else if (period == '6m' || period == '12m') {
    final m = period == '6m' ? 6 : 12;
    start = _addMonths(end, -m).add(const Duration(days: 1));
    prevEnd = start.subtract(const Duration(days: 1));
    prevStart = _addMonths(prevEnd, -m).add(const Duration(days: 1));
  } else {
    final days = period == '1m' ? 30 : 1;
    start = DateTime(end.year, end.month, end.day - (days - 1));
    prevEnd = DateTime(start.year, start.month, start.day - 1);
    prevStart = DateTime(prevEnd.year, prevEnd.month, prevEnd.day - (days - 1));
  }
  return (from: localDate(start), to: localDate(end), prevFrom: localDate(prevStart), prevTo: localDate(prevEnd));
}

/// Totals of the day buckets between two dates
DayFigures sumDays(Map<String, DayFigures> byDay, String from, String to) {
  var out = const DayFigures();
  for (final e in byDay.entries) {
    if (e.key.compareTo(from) < 0 || e.key.compareTo(to) > 0) continue;
    out = out.add(n: e.value.count, total: e.value.total, gp: e.value.grossProfit, exp: e.value.expenses);
  }
  return out;
}

/// The period's figures and the period before
({DayFigures cur, DayFigures prev, ({String from, String to, String prevFrom, String prevTo}) range}) periodFigures(Map<String, DayFigures> byDay, String period, {DateTime? now}) {
  final r = periodRange(period, now: now);
  return (cur: sumDays(byDay, r.from, r.to), prev: sumDays(byDay, r.prevFrom, r.prevTo), range: r);
}

/// The best-selling medicines between two dates (sales not refunded, this branch)
List<TopSeller> topMedicines(Iterable<Sale> sales, String from, String to, {String branch = 'main', String by = 'amount', int limit = 5}) {
  final top = <String, TopSeller>{};
  for (final s in sales) {
    if (s.status == 'refunded' || (s.branchId.isEmpty ? 'main' : s.branchId) != branch) continue;
    final d = dayOf(s.date);
    if (d.compareTo(from) < 0 || d.compareTo(to) > 0) continue;
    for (final i in s.items) {
      final t = top.putIfAbsent(i.name, () => TopSeller(i.name));
      t.qty += i.qty;
      t.amount += i.qty * i.price;
      t.cost += i.qty * i.cost;
    }
  }
  double v(TopSeller x) => switch (by) { 'qty' => x.qty, 'profit' => x.profit, _ => x.amount };
  return (top.values.toList()..sort((a, b) => v(b).compareTo(v(a)))).take(limit).toList();
}

class HealthDriver {
  const HealthDriver(this.key, this.label, this.danger, this.to);
  final String key, label, to;
  final bool danger;
}

class StockHealth {
  const StockHealth({required this.score, required this.good, required this.soon, required this.expired, required this.low, required this.out, required this.tracked,
      required this.drivers, required this.title, required this.text, required this.to});
  final int score, low, out, tracked;
  final double good, soon, expired;
  final List<HealthDriver> drivers;
  final String title, text, to;
}

/// Stock health 0-100 (src/dashboard.js stockHealth): the share of the stock's value not expired or expiring within
/// [warn] days, lowered by the share of re-ordered medicines that are low or out; plus the biggest problem in words
StockHealth stockHealth(Iterable<Product> products, List<BatchStock> Function(String id) batchesOf, double Function(String id) stockOf, {int warn = 90, DateTime? now}) {
  var good = 0.0, soon = 0.0, expired = 0.0;
  var tracked = 0, low = 0, out = 0;
  final soonBy = <String, double>{};
  for (final p in products) {
    final st = stockOf(p.id);
    if (p.reorder > 0) {
      tracked++;
      if (!(st > 0)) {
        out++;
      } else if (st <= p.reorder) {
        low++;
      }
    }
    if (!(st > 0)) continue;
    for (final b in batchesOf(p.id)) {
      if (!(b.qty > 0)) continue;
      final v = b.qty * (p.cost != 0 ? p.cost : b.cost);
      final days = b.expiry.isEmpty ? 1 << 30 : daysUntil(b.expiry, now: now);
      if (days < 0) {
        expired += v;
      } else if (days <= warn) {
        soon += v;
        soonBy[p.name] = (soonBy[p.name] ?? 0) + v;
      } else {
        good += v;
      }
    }
  }
  final all = good + soon + expired;
  final valueShare = all > 0 ? good / all : 1.0;
  final shortShare = tracked > 0 ? (low + out) / tracked : 0.0;
  final score = (valueShare * (1 - 0.5 * shortShare) * 100).round().clamp(0, 100);
  int pct(double v) => all > 0 ? (v / all * 100).round() : 0;
  final drivers = [
    if (expired > 0) HealthDriver('expired', 'Expired ${pct(expired)}%', true, '/inventory?filter=expired'),
    if (soon > 0) HealthDriver('expiring', 'Expiring ${pct(soon)}%', false, '/inventory?filter=expiring'),
    if (out > 0) HealthDriver('out', '$out out of stock', false, '/inventory?filter=out'),
    if (low > 0) HealthDriver('low', '$low low', false, '/inventory?filter=low'),
  ];
  String title, text, to;
  final topSoon = soonBy.entries.toList()..sort((a, b) => b.value.compareTo(a.value));
  if (expired > 0 && expired >= soon) {
    (title, text, to) = ('Expired stock is the biggest loss', '${pct(expired)}% of the stock\'s value has expired. Return it to the supplier or write it off.', '/inventory?filter=expired');
  } else if (soon > 0 && pct(soon) >= 5) {
    final three = topSoon.take(3).toList();
    final share = (three.fold<double>(0, (a, e) => a + e.value) / soon * 100).round();
    final who = three.length == 1 ? '${three.first.key} holds' : '${three.length} medicines hold';
    text = '${pct(soon)}% of the stock\'s value expires within $warn days; $who $share% of it${three.length > 1 ? ' (${three.map((e) => e.key).join(', ')})' : ''}. Sell them first or return them.';
    (title, to) = ('Expiring stock is the biggest risk', '/inventory?filter=expiring');
  } else if (low + out > 0) {
    (title, text, to) = ('Running short', '${low + out} of the $tracked medicines with a reorder level are low or out of stock. Order them before customers are turned away.', '/reorder');
  } else {
    (title, text, to) = ('Stock is in good shape', 'Nothing expired, little expiring and nothing short.', '/inventory');
  }
  return StockHealth(score: score, good: good, soon: soon, expired: expired, low: low, out: out, tracked: tracked, drivers: drivers, title: title, text: text, to: to);
}

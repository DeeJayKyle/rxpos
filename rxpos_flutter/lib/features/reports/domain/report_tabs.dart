// The figures of every Reports tab, ported from src/pages/Reports.jsx: Sales Report, Sales by Product, Consumption
// (ABC), Purchase Report, Expenses Report, Profit & margins, Stock Valuation and the Income Statement. A period
// (from–to, inclusive) and a branch ('all' or one).
import '../../../core/entities/movement.dart';
import '../../../core/entities/product.dart';
import '../../../core/entities/sale.dart';
import '../../../core/rules/dates.dart';
import '../../../core/rules/fefo.dart';
import '../../../core/rules/stock.dart';

/// Totals by a key, largest first.
List<(String, double)> sumBy<T>(Iterable<T> xs, String Function(T) key, double Function(T) value) {
  final m = <String, double>{};
  for (final x in xs) {
    m[key(x)] = (m[key(x)] ?? 0) + value(x);
  }
  return m.entries.map((e) => (e.key, e.value)).toList()..sort((a, b) => b.$2.compareTo(a.$2));
}

double _n(Object? v) => v is num ? v.toDouble() : double.tryParse('${v ?? ''}') ?? 0;

/// The records of the period and branch.
class Period {
  Period({required this.from, required this.to, this.branch = 'all', required Iterable<Sale> sales, required Iterable<Map<String, Object?>> purchases,
      required Iterable<Map<String, Object?>> expenses, required Iterable<Movement> movements})
      : sales = [for (final s in sales) if (s.status != 'refunded' && _in(s.date, s.branchId, from, to, branch)) s],
        refunds = [for (final s in sales) if (s.status == 'refunded' && _in(s.date, s.branchId, from, to, branch)) s],
        purchases = [for (final p in purchases) if (_in('${p['date']}', '${p['branchId'] ?? ''}', from, to, branch)) p],
        expenses = [for (final e in expenses) if (_in('${e['date']}', '${e['branchId'] ?? ''}', from, to, branch)) e],
        movements = [for (final m in movements) if (_in(m.date, m.branchId, from, to, branch)) m];
  final String from, to, branch;
  final List<Sale> sales, refunds;
  final List<Map<String, Object?>> purchases, expenses;
  final List<Movement> movements;

  static bool _in(String date, String br, String from, String to, String branch) {
    final d = dayOf(date);
    return d.compareTo(from) >= 0 && d.compareTo(to) <= 0 && (branch == 'all' || (br.isEmpty ? mainBranch : br) == branch);
  }

  double get revenue => sales.fold(0, (a, s) => a + s.total - s.tax); // excluding tax
  double get tax => sales.fold(0, (a, s) => a + s.tax);
  double get cogs => sales.fold(0, (a, s) => a + s.items.fold<double>(0, (b, i) => b + i.cost * i.qty));
  double get expenseTotal => expenses.fold(0, (a, e) => a + _n(e['amount']));
  double get discounts => sales.fold(0, (a, s) => a + s.discount);
  double writeOffs(Map<String, Product> byId) =>
      movements.where((m) => m.type == 'Expired write-off').fold(0, (a, m) => a + -m.qty * (byId[m.productId]?.cost ?? 0));

  /// Every day of the period (at most 366) with its sales.
  List<(String, double)> daily() {
    final out = <(String, double)>[];
    final byDay = <String, double>{};
    for (final s in sales) {
      byDay[dayOf(s.date)] = (byDay[dayOf(s.date)] ?? 0) + s.total;
    }
    var d = DateTime.parse(from);
    final end = DateTime.parse(to);
    while (!d.isAfter(end) && out.length < 366) {
      final k = localDate(d);
      out.add((k, byDay[k] ?? 0));
      d = DateTime(d.year, d.month, d.day + 1);
    }
    return out;
  }
}

/// Sales by product (name): quantity, revenue, cost, profit, largest revenue first.
List<({String product, double qty, double revenue, double cost, double profit})> salesByProduct(List<Sale> sales) {
  final m = <String, ({double qty, double revenue, double cost})>{};
  for (final s in sales) {
    for (final i in s.items) {
      final r = m[i.name] ?? (qty: 0.0, revenue: 0.0, cost: 0.0);
      m[i.name] = (qty: r.qty + i.qty, revenue: r.revenue + i.qty * i.price, cost: r.cost + i.qty * i.cost);
    }
  }
  return [for (final e in m.entries) (product: e.key, qty: e.value.qty, revenue: e.value.revenue, cost: e.value.cost, profit: e.value.revenue - e.value.cost)]
    ..sort((a, b) => b.revenue.compareTo(a.revenue));
}

class ProfitRow {
  ProfitRow(this.key, this.name);
  final String key, name;
  double qty = 0, revenue = 0, cost = 0;
  double get profit => revenue - cost;
  double get margin => revenue > 0 ? (revenue - cost) / revenue * 100 : 0;
}

/// Profit per medicine or per category (the line's share of a sale discount comes off its revenue).
List<ProfitRow> profitRows(List<Sale> sales, Map<String, Product> byId, {bool byCategory = false}) {
  final m = <String, ProfitRow>{};
  for (final s in sales) {
    for (final i in s.items) {
      final p = byId[i.id];
      final key = !byCategory ? (i.id.isEmpty ? i.name : i.id) : ((p?.category ?? '').isNotEmpty ? p!.category : (p?.form ?? '').isNotEmpty ? p!.form : 'Other');
      final r = m.putIfAbsent(key, () => ProfitRow(key, byCategory ? key : i.name));
      final share = s.subtotal > 0 ? i.qty * i.price / s.subtotal : 0;
      r.qty += i.qty;
      r.revenue += i.qty * i.price - s.discount * share;
      r.cost += i.qty * i.cost;
    }
  }
  return m.values.toList()..sort((a, b) => b.profit.compareTo(a.profit));
}

/// In-stock medicines whose price today is below cost or below the target margin, worst first.
List<({Product p, double margin, double stock})> priceCheck(Iterable<Product> products, double Function(String) stockOf, double target) => [
      for (final p in products)
        if (stockOf(p.id) > 0 && p.price > 0 && p.cost > 0 && (p.price - p.cost) / p.price * 100 < target) (p: p, margin: (p.price - p.cost) / p.price * 100, stock: stockOf(p.id)),
    ]..sort((a, b) => a.margin.compareTo(b.margin));

/// The price that gives the target margin.
double priceForMargin(double cost, double target) => (cost / (1 - target / 100)).ceilToDouble();

class AbcRow {
  AbcRow(this.id, this.name, this.form, this.cost, this.stock);
  final String id, name, form;
  double qty = 0, revenue = 0, cost;
  final double? stock;
  double value = 0, perDay = 0, cumPct = 0;
  double? daysLeft;
  String cls = 'C';
}

/// Consumption & ABC: units used × cost per medicine, ranked; class by where an item starts (A below 80% of the value
/// so far, B below 95%, C the rest); fast movers about to run out; medicines in stock that did not sell.
({List<AbcRow> rows, double total, List<({Product p, double stock, double value})> idle}) consumption(List<Sale> sales, Map<String, Product> byId,
    double Function(String) stockOf, {required String from, required String to}) {
  final days = DateTime.parse(to).difference(DateTime.parse(from)).inDays + 1;
  final periodDays = days < 1 ? 1 : days;
  final m = <String, AbcRow>{};
  for (final s in sales) {
    for (final i in s.items) {
      final p = byId[i.id];
      final key = i.id.isEmpty ? i.name : i.id;
      final r = m.putIfAbsent(key, () => AbcRow(i.id, i.name, p?.form ?? '', p?.cost != null && p!.cost != 0 ? p.cost : i.cost, p == null ? null : stockOf(p.id)));
      r.qty += i.qty;
      r.revenue += i.qty * i.price;
      if ((p?.cost ?? 0) != 0) r.cost = p!.cost;
    }
  }
  final list = m.values.toList();
  for (final r in list) {
    r.value = r.qty * r.cost;
    r.perDay = r.qty / periodDays;
    r.daysLeft = r.perDay > 0 && r.stock != null ? r.stock! / r.perDay : null;
  }
  list.sort((a, b) => b.value.compareTo(a.value));
  final total = list.fold<double>(0, (a, r) => a + r.value);
  final denom = total == 0 ? 1 : total;
  var cum = 0.0;
  for (final r in list) {
    final before = cum / denom * 100;
    cum += r.value;
    r.cumPct = cum / denom * 100;
    r.cls = before < 80 ? 'A' : before < 95 ? 'B' : 'C';
  }
  final sold = {for (final r in list) r.id};
  final idle = [for (final p in byId.values) if (stockOf(p.id) > 0 && !sold.contains(p.id)) (p: p, stock: stockOf(p.id), value: stockOf(p.id) * p.cost)]
    ..sort((a, b) => b.value.compareTo(a.value));
  return (rows: list, total: total, idle: idle);
}

/// Stock valuation now: at cost (each batch, expired apart), at retail (unexpired stock at today's prices), by formulation.
({double cost, double retail, double expired, int items, List<(String, double)> byForm}) stockValuation(Iterable<Product> products, StockView stock, {DateTime? now}) {
  final inStock = products.where((p) => stock.stockOf(p.id) > 0).toList();
  final sv = stockValue(inStock, stock.batchesOf, now: now);
  double sellable(Product p) => stock.batchesOf(p.id).fold<double>(0, (a, b) => a + (b.qty > 0 && !(b.expiry.isNotEmpty && daysUntil(b.expiry, now: now) < 0) ? b.qty : 0));
  final retail = inStock.fold<double>(0, (a, p) => a + sellable(p) * p.price);
  return (
    cost: sv.value, retail: retail, expired: sv.expired, items: inStock.length,
    byForm: sumBy(inStock, (p) => p.form.isEmpty ? '—' : p.form, (p) => batchValue(p, stock.batchesOf(p.id), now: now).value),
  );
}

/// The batches of a medicine for a list of [BatchStock] (kept for callers that build their own views).
List<BatchStock> batchesFor(StockView v, String id) => v.batchesOf(id);

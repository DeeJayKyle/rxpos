// Reorder levels from real sales (src/reorder.js): level = average daily sales over the period × (supplier lead time +
// safety days). Only medicines that sold in the period change.
import 'dart:math';

import '../../../core/data/record_store.dart';
import '../../../core/rules/money.dart';
import '../../../core/entities/product.dart';
import '../../../core/entities/sale.dart';
import '../../../core/rules/dates.dart';
import '../../../core/rules/ids.dart';
import '../../../core/rules/stock.dart';

class ReorderChange {
  const ReorderChange(this.product, this.sold, this.perDay, this.level);
  final Product product;
  final double sold, perDay;
  final int level;
}

List<ReorderChange> computeReorderLevels(Iterable<Sale> sales, Iterable<Product> products, {int days = 30, int lead = 7, int safety = 7,
    String branch = mainBranch, DateTime? now}) {
  final since = (now ?? DateTime.now()).subtract(Duration(days: days));
  final sold = <String, double>{};
  for (final s in sales) {
    if (s.status == 'refunded' || (s.branchId.isEmpty ? mainBranch : s.branchId) != branch) continue;
    final at = DateTime.tryParse(s.date);
    if (at == null || at.isBefore(since)) continue;
    for (final i in s.items) {
      sold[i.id] = (sold[i.id] ?? 0) + i.qty;
    }
  }
  final out = <ReorderChange>[];
  for (final p in products) {
    final n = sold[p.id];
    if (n == null || n == 0) continue;
    final perDay = n / days;
    final level = (perDay * (lead + safety)).ceil().clamp(1, 1 << 30);
    if (level != p.reorder.round()) out.add(ReorderChange(p, n, perDay, level));
  }
  return out..sort((a, b) => b.perDay.compareTo(a.perDay));
}

/// Save the new levels (src/reorder.js applyReorderLevels): the products, when it was done (settings.autoReorderAt, so the
/// weekly automatic update waits a week) and the audit log.
Future<void> applyReorderLevels(RecordStore store, List<ReorderChange> changes, {required String user, String branchId = mainBranch, bool auto = false}) async {
  if (changes.isEmpty) return;
  final settings = await store.settingsRecord();
  await store.update((d) {
    for (final c in changes) {
      d.put('products', c.product.copyWith(reorder: c.level.toDouble()).toRecord());
    }
    d.saveSettings({...settings, 'autoReorderAt': d.now});
    d.audit(user, auto ? 'Reorder levels updated automatically' : 'Reorder levels updated from sales', '${changes.length} medicines', branchId);
  });
}

/// How many to order for a low medicine: up to twice its reorder level.
double suggestedOrder(Product p, double stock) => (p.reorder * 2 - stock).clamp(0, double.infinity).ceilToDouble();

// ---- Reorder suggestions, dead stock and purchase orders (src/pages/Reorder.jsx) ----

/// What a supplier last charged for a medicine.
typedef SupplierPrice = ({String supplierId, String supplierName, double cost, String date});

/// productId → what each supplier last charged, cheapest first (src/store.jsx supplierPrices).
Map<String, List<SupplierPrice>> supplierPrices(Iterable<Map<String, Object?>> purchases) {
  final m = <String, Map<String, SupplierPrice>>{};
  for (final p in purchases) {
    final sid = '${p['supplierId'] ?? ''}';
    if (sid.isEmpty) continue;
    for (final i in ((p['items'] as List?) ?? const []).cast<Map>()) {
      final cost = (i['cost'] as num?)?.toDouble() ?? 0;
      if (!(cost > 0)) continue;
      final per = m.putIfAbsent('${i['productId']}', () => {});
      final cur = per[sid];
      final date = '${p['date'] ?? ''}';
      if (cur == null || date.compareTo(cur.date) >= 0) per[sid] = (supplierId: sid, supplierName: '${p['supplierName'] ?? ''}', cost: cost, date: date);
    }
  }
  return {for (final e in m.entries) e.key: e.value.values.toList()..sort((a, b) => a.cost.compareTo(b.cost))};
}

/// productId → the last purchase of it (supplier and cost).
Map<String, SupplierPrice> lastBuys(Iterable<Map<String, Object?>> purchases) {
  final list = [...purchases]..sort((a, b) => '${a['date']}'.compareTo('${b['date']}'));
  return {
    for (final p in list)
      for (final i in ((p['items'] as List?) ?? const []).cast<Map>())
        '${i['productId']}': (supplierId: '${p['supplierId'] ?? ''}', supplierName: '${p['supplierName'] ?? ''}', cost: (i['cost'] as num?)?.toDouble() ?? 0, date: '${p['date'] ?? ''}'),
  };
}

/// Units sold per medicine at a branch in the last [days], and when each last sold.
({Map<String, double> sold, Map<String, String> lastSale}) salesVelocity(Iterable<Sale> sales, {required int days, String branch = mainBranch, DateTime? now}) {
  final since = (now ?? DateTime.now()).subtract(Duration(days: days));
  final sold = <String, double>{}, last = <String, String>{};
  for (final s in sales) {
    if (s.status == 'refunded' || (s.branchId.isEmpty ? mainBranch : s.branchId) != branch) continue;
    final at = DateTime.tryParse(s.date);
    for (final i in s.items) {
      if (at != null && !at.isBefore(since)) sold[i.id] = (sold[i.id] ?? 0) + i.qty;
      if ((last[i.id] ?? '').compareTo(s.date) < 0) last[i.id] = s.date;
    }
  }
  return (sold: sold, lastSale: last);
}

class Suggestion {
  const Suggestion(this.p, this.stock, this.perDay, this.daysLeft, this.qty, this.buy, this.options, {this.why = ''});
  final Product p;
  final double stock, perDay, daysLeft, qty;
  final SupplierPrice? buy;
  final List<SupplierPrice> options;
  /// how the quantity was worked out (the other methods than [OrderMethod.cover])
  final String why;
  double get cost => qty * ((buy?.cost ?? 0) > 0 ? buy!.cost : p.cost);
}

/// What to order: sells a day × (lead + cover days) − in stock (rounded up); a medicine with no sales but at or below
/// its reorder level: 2 × level − stock. Listed when stock lasts lead + cover days or less, or is at or below the level.
/// [fromCheapest]: buy from the cheapest supplier (else the last one); [chosen]: productId → supplierId picked by hand.
List<Suggestion> reorderSuggestions(Iterable<Product> products, double Function(String) stockOf, Map<String, double> sold,
    {required int window, required int lead, required int cover, required Map<String, List<SupplierPrice>> prices, required Map<String, SupplierPrice> last,
    bool fromCheapest = true, Map<String, String> chosen = const {}}) {
  final out = <Suggestion>[];
  for (final p in products) {
    final stock = stockOf(p.id);
    final perDay = (sold[p.id] ?? 0) / window;
    final daysLeft = perDay > 0 ? stock / perDay : double.infinity;
    final target = (perDay * (lead + cover)).ceilToDouble();
    final low = p.reorder > 0 && stock <= p.reorder && perDay == 0 ? p.reorder * 2 - stock : 0.0;
    final qty = [0.0, target - (stock > 0 ? stock : 0), low].reduce((a, b) => a > b ? a : b);
    if (!(qty > 0 && (stock > 0 || perDay > 0) && (daysLeft <= lead + cover || stock <= p.reorder))) continue;
    final options = prices[p.id] ?? const [];
    final hand = chosen[p.id] == null ? null : options.where((x) => x.supplierId == chosen[p.id]).firstOrNull;
    out.add(Suggestion(p, stock, perDay, daysLeft, qty, hand ?? (fromCheapest ? options.firstOrNull : null) ?? last[p.id], options));
  }
  return out..sort((a, b) => a.daysLeft.compareTo(b.daysLeft));
}

/// Medicines in stock not sold for at least [deadDays], the most money tied up first.
List<({Product p, double stock, String last, int idle, double value})> deadStock(Iterable<Product> products, double Function(String) stockOf, Map<String, String> lastSale,
    {required int deadDays, DateTime? now}) {
  final out = [
    for (final p in products)
      if (stockOf(p.id) > 0)
        (p: p, stock: stockOf(p.id), last: lastSale[p.id] ?? '', idle: lastSale[p.id] == null ? 1 << 30 : daysSince(lastSale[p.id]!, now: now), value: stockOf(p.id) * p.cost),
  ].where((r) => r.idle >= deadDays).toList();
  return out..sort((a, b) => b.value.compareTo(a.value));
}

/// One purchase order per supplier for the chosen suggestions (status Draft).
Future<int> createPurchaseOrders(RecordStore store, List<Suggestion> chosen, {required Map<String, String> supplierNames, required String user, String branchId = mainBranch}) {
  final by = <String, List<Suggestion>>{};
  for (final r in chosen) {
    (by[r.buy?.supplierId ?? ''] ??= []).add(r);
  }
  return store.update((d) async {
    for (final e in by.entries) {
      d.put('purchaseOrders', {
        'id': uid(), 'number': await d.number('PO', branchId: branchId), 'date': d.now, 'status': 'Draft',
        'branchId': branchId, 'supplierId': e.key, 'supplierName': supplierNames[e.key] ?? 'Any supplier', 'createdBy': user,
        'items': [for (final r in e.value) {'productId': r.p.id, 'name': r.p.name, 'qty': r.qty, 'cost': (r.buy?.cost ?? 0) > 0 ? r.buy!.cost : r.p.cost}],
      });
    }
    d.audit(user, 'Purchase orders created', '${by.length} order(s), ${chosen.length} lines', branchId);
    return by.length;
  });
}

/// The order as a WhatsApp message to the supplier.
String poText(Map<String, Object?> po, String pharmacy, {String branchName = ''}) =>
    'Purchase order ${po['number']} from $pharmacy${branchName.isEmpty ? '' : ' – $branchName'}\n'
    '${((po['items'] as List?) ?? const []).cast<Map>().map((i) => '• ${i['name']} × ${_q(i['qty'])}').join('\n')}\n'
    'Please confirm availability and prices. Thank you.';

String _q(Object? v) => v is num && v == v.roundToDouble() ? '${v.toInt()}' : '$v';


// ---------- ways to work out how much to order ----------

/// How the order quantity is worked out (Reorder → "Order quantity method"; kept on this device).
enum OrderMethod { cover, smart, safety, minMax, eoq, upTo }

const orderMethodInfo = <OrderMethod, (String, String)>{
  OrderMethod.cover: ('Days of cover (as the current app)',
      'Order what sells in lead time + cover days, less what is in stock. Simple, and the same as the current RxPOS app; no safety margin for busy weeks.'),
  OrderMethod.smart: ('Smart mix (recommended)',
      'For each medicine: reorder point with safety stock when it sells most days, Min / Max when it sells now and then. Fewer stock-outs on '
          'fast movers without over-stocking slow ones.'),
  OrderMethod.safety: ('Reorder point + safety stock',
      'Order when stock falls to (sales a day × lead time) + safety stock; the safety stock covers busier-than-usual days at the chosen service '
          'level. Then order enough for lead time + cover days. Best for medicines that sell every day (antimalarials, painkillers, ORS).'),
  OrderMethod.minMax: ('Min / Max',
      'Order when stock reaches the minimum (the medicine\'s reorder level, or lead-time sales + safety stock), up to the maximum (twice the '
          'minimum, or cover-days sales). Easy to check on the shelf; good for slow and irregular sellers.'),
  OrderMethod.eoq: ('Economic order quantity (EOQ)',
      'Order at the reorder point, the quantity that keeps ordering costs (transport, time) and holding costs (money tied up, expiry risk) lowest: '
          '√(2 × yearly sales × cost per order ÷ holding cost per item a year). Useful when each order costs a lot to place.'),
  OrderMethod.upTo: ('Order-up-to (fixed order days)',
      'For pharmacies that order on fixed days (e.g. every Monday): every medicine that sells is topped up to lead time + cover days of sales + '
          'safety stock, whatever its level today.'),
};

/// The safety factor (z) for a service level: how often a delivery should arrive before the stock runs out.
const serviceLevels = <(String, double)>[('90%', 1.28), ('95%', 1.65), ('98%', 2.05), ('99%', 2.33)];

/// Units sold each day of the last [days] (oldest first) per medicine at a branch.
Map<String, List<double>> dailyDemand(Iterable<Sale> sales, {required int days, String branch = mainBranch, DateTime? now}) {
  final end = now ?? DateTime.now();
  final today = DateTime(end.year, end.month, end.day);
  final out = <String, List<double>>{};
  for (final s in sales) {
    if (s.status == 'refunded' || (s.branchId.isEmpty ? mainBranch : s.branchId) != branch) continue;
    final at = DateTime.tryParse(s.date)?.toLocal();
    if (at == null) continue;
    final ago = today.difference(DateTime(at.year, at.month, at.day)).inDays;
    if (ago < 0 || ago >= days) continue;
    for (final i in s.items) {
      (out[i.id] ??= List.filled(days, 0.0))[days - 1 - ago] += i.qty;
    }
  }
  return out;
}

/// Order suggestions by [method] ([OrderMethod.cover] is [reorderSuggestions]). [demand]: units sold each day of the
/// window per medicine; [z]: the safety factor of the service level; [orderCost]: what placing one order costs;
/// [holdingRate]: a year's holding cost as a share of the medicine's cost (0.25 = 25%).
List<Suggestion> orderSuggestions(Iterable<Product> products, double Function(String) stockOf, Map<String, List<double>> demand,
    {required OrderMethod method, required int window, required int lead, required int cover, double z = 1.65, double orderCost = 20000, double holdingRate = 0.25,
    required Map<String, List<SupplierPrice>> prices, required Map<String, SupplierPrice> last, bool fromCheapest = true, Map<String, String> chosen = const {}}) {
  if (method == OrderMethod.cover) {
    return reorderSuggestions(products, stockOf, {for (final e in demand.entries) e.key: e.value.fold(0.0, (a, b) => a + b)},
        window: window, lead: lead, cover: cover, prices: prices, last: last, fromCheapest: fromCheapest, chosen: chosen);
  }
  final out = <Suggestion>[];
  String n(double v) => formatQty(v.ceilToDouble());
  for (final p in products) {
    final stock = stockOf(p.id), have = stock > 0 ? stock : 0.0;
    final series = demand[p.id] ?? const <double>[];
    final perDay = series.fold(0.0, (a, b) => a + b) / window;
    final daysSold = series.where((x) => x > 0).length;
    var variance = 0.0;
    for (var i = 0; i < window; i++) {
      final x = i < series.length ? series[i] : 0.0;
      variance += (x - perDay) * (x - perDay);
    }
    final sd = window > 1 ? sqrt(variance / (window - 1)) : 0.0;
    final safety = (z * sd * sqrt(lead.toDouble())).ceilToDouble();
    final daysLeft = perDay > 0 ? stock / perDay : double.infinity;
    final m = method == OrderMethod.smart ? (daysSold >= window * 0.3 ? OrderMethod.safety : OrderMethod.minMax) : method;
    final tag = method == OrderMethod.smart ? (m == OrderMethod.safety ? 'sells most days: ' : 'sells now and then: ') : '';
    var qty = 0.0;
    var why = '';
    if (perDay == 0) {
      // no sales in the window: only the reorder level can say it is low (as the current app)
      if (p.reorder > 0 && stock <= p.reorder && stock > 0) {
        qty = p.reorder * 2 - stock;
        why = 'no sales in $window days; at or below its reorder level ${n(p.reorder)}: up to twice the level';
      }
    } else {
      final rop = (perDay * lead + safety).ceilToDouble();
      final upTo = (perDay * (lead + cover) + safety).ceilToDouble();
      switch (m) {
        case OrderMethod.safety:
          if (stock <= rop) {
            qty = upTo - have;
            why = '${tag}reorder point ${n(rop)} = ${perDay.toStringAsFixed(1)}/day × $lead days + safety ${n(safety)}; up to ${n(upTo)}';
          }
        case OrderMethod.minMax:
          final min = p.reorder > 0 ? p.reorder : rop;
          final max = [min * 2, (perDay * (lead + cover)).ceilToDouble()].reduce((a, b) => a > b ? a : b);
          if (stock <= min) {
            qty = max - have;
            why = '${tag}min ${n(min)}${p.reorder > 0 ? ' (reorder level)' : ''}, max ${n(max)}';
          }
        case OrderMethod.eoq:
          final h = p.cost * holdingRate;
          final eoq = h > 0 ? sqrt(2 * perDay * 365 * orderCost / h).ceilToDouble() : (perDay * cover).ceilToDouble();
          if (stock <= rop) {
            qty = [eoq, rop - have + 1].reduce((a, b) => a > b ? a : b);
            why = 'reorder point ${n(rop)}; EOQ ${n(eoq)} = √(2 × ${n(perDay * 365)} a year × ${formatQty(orderCost)} an order ÷ ${h.toStringAsFixed(0)} to hold one a year)';
          }
        case OrderMethod.upTo:
          qty = upTo - have;
          why = 'topped up to ${n(upTo)} = ${perDay.toStringAsFixed(1)}/day × ${lead + cover} days + safety ${n(safety)}';
        case OrderMethod.cover || OrderMethod.smart:
          break;
      }
    }
    qty = qty.ceilToDouble();
    if (!(qty > 0)) continue;
    final options = prices[p.id] ?? const [];
    final hand = chosen[p.id] == null ? null : options.where((x) => x.supplierId == chosen[p.id]).firstOrNull;
    out.add(Suggestion(p, stock, perDay, daysLeft, qty, hand ?? (fromCheapest ? options.firstOrNull : null) ?? last[p.id], options, why: why));
  }
  return out..sort((a, b) => a.daysLeft.compareTo(b.daysLeft));
}

// Reorder levels from real sales (src/reorder.js): level = average daily sales over the period × (supplier lead time +
// safety days). Only medicines that sold in the period change.
import '../../../core/data/record_store.dart';
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
  const Suggestion(this.p, this.stock, this.perDay, this.daysLeft, this.qty, this.buy, this.options);
  final Product p;
  final double stock, perDay, daysLeft, qty;
  final SupplierPrice? buy;
  final List<SupplierPrice> options;
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
  return store.update((d) {
    var n = 0;
    for (final e in by.entries) {
      d.put('purchaseOrders', {
        'id': uid(), 'number': 'PO${DateTime.now().millisecondsSinceEpoch.toRadixString(36).toUpperCase().substring(2)}${n++}', 'date': d.now, 'status': 'Draft',
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

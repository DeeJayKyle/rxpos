// Stock is never stored: it is the sum of stock movements, per branch and per batch (src/store.jsx stockIndex,
// batchesOf, products; src/stockvalue.js). Two devices selling offline both deduct, so nothing is lost or doubled.
import '../entities/batch.dart';
import '../entities/movement.dart';
import '../entities/product.dart';
import 'dates.dart';
import 'fefo.dart';

const mainBranch = 'main';

/// Quantities summed from movements: per branch + batch, per branch + medicine, and per medicine everywhere.
class StockIndex {
  StockIndex._(this._batch, this._product, this._total);

  factory StockIndex.of(Iterable<Movement> movements) {
    final batch = <String, double>{}, product = <String, double>{}, total = <String, double>{};
    for (final m in movements) {
      final br = m.branchId.isEmpty ? mainBranch : m.branchId;
      final bk = '$br|${m.batchId ?? 'lb-${m.productId}'}';
      batch[bk] = (batch[bk] ?? 0) + m.qty;
      final pk = '$br|${m.productId}';
      product[pk] = (product[pk] ?? 0) + m.qty;
      total[m.productId] = (total[m.productId] ?? 0) + m.qty;
    }
    return StockIndex._(batch, product, total);
  }

  final Map<String, double> _batch, _product, _total;

  double ofBatch(String branch, String batchId) => _batch['$branch|$batchId'] ?? 0;
  double ofProduct(String branch, String productId) => _product['$branch|$productId'] ?? 0;
  double everywhere(String productId) => _total[productId] ?? 0;
}

/// The pharmacy's stock as one branch sees it.
class StockView {
  StockView({required Iterable<Product> products, required Iterable<Batch> batches, required this.index, this.branch = mainBranch})
      : _products = {for (final p in products) p.id: p} {
    for (final b in batches) {
      (_batches[b.productId] ??= []).add(b);
    }
  }

  final StockIndex index;
  final String branch;
  final Map<String, Product> _products;
  final Map<String, List<Batch>> _batches = {};

  /// A medicine's batches with their quantities here, earliest expiry first (no expiry last).
  List<BatchStock> batchesOf(String productId, {String? atBranch}) {
    final br = atBranch ?? branch;
    final list = [
      for (final b in _batches[productId] ?? const <Batch>[])
        BatchStock(id: b.id, productId: productId, batch: b.batch, expiry: b.expiry, cost: b.cost, qty: index.ofBatch(br, b.id)),
    ];
    final legacy = index.ofBatch(br, 'lb-$productId');
    if (legacy != 0) {
      final p = _products[productId];
      final raw = p?.raw ?? const {};
      list.add(BatchStock(
          id: 'lb-$productId', productId: productId, legacy: true, qty: legacy, cost: p?.cost ?? 0,
          batch: (raw['batch'] as String?) ?? '—', expiry: (raw['expiry'] as String?) ?? ''));
    }
    String key(BatchStock b) => b.expiry.isEmpty ? '9999' : b.expiry;
    list.sort((a, b) => key(a).compareTo(key(b)));
    return list;
  }

  double stockOf(String productId) => index.ofProduct(branch, productId);
}

/// Low stock: in stock, but at or below its reorder level (never-stocked medicines are not "low").
bool isLowStock(Product p, double stock) => stock > 0 && p.reorder > 0 && stock <= p.reorder;

/// What one medicine's stock is worth: physical stock × the medicine's current cost (a batch's own cost only when the
/// medicine has none); expired stock kept apart. Same rule as the React app and the daily stock sheet.
({double value, double expired}) batchValue(Product p, List<BatchStock> batches, {DateTime? now}) {
  var value = 0.0, expired = 0.0;
  for (final b in batches) {
    if (!(b.qty > 0)) continue;
    final v = b.qty * (p.cost != 0 ? p.cost : b.cost);
    if (b.expiry.isNotEmpty && daysUntil(b.expiry, now: now) < 0) {
      expired += v;
    } else {
      value += v;
    }
  }
  return (value: value, expired: expired);
}

({double value, double expired}) stockValue(Iterable<Product> products, List<BatchStock> Function(String id) batchesOf, {DateTime? now}) {
  var value = 0.0, expired = 0.0;
  for (final p in products) {
    final v = batchValue(p, batchesOf(p.id), now: now);
    value += v.value;
    expired += v.expired;
  }
  return (value: value, expired: expired);
}

/// Batches with stock that expire within [warnDays] (soon) or already have (expired), earliest first.
({List<(Product, BatchStock, int)> soon, List<(Product, BatchStock, int)> expired}) expiryBatches(
    Iterable<Product> products, List<BatchStock> Function(String id) batchesOf, double Function(String id) stockOf, int warnDays, {DateTime? now}) {
  final soon = <(Product, BatchStock, int)>[], expired = <(Product, BatchStock, int)>[];
  for (final p in products) {
    if (!(stockOf(p.id) > 0)) continue;
    for (final b in batchesOf(p.id)) {
      if (!(b.qty > 0) || b.expiry.isEmpty) continue;
      final days = daysUntil(b.expiry, now: now);
      if (days < 0) {
        expired.add((p, b, days));
      } else if (days <= warnDays) {
        soon.add((p, b, days));
      }
    }
  }
  int byExpiry((Product, BatchStock, int) a, (Product, BatchStock, int) b) => a.$2.expiry.compareTo(b.$2.expiry);
  return (soon: soon..sort(byExpiry), expired: expired..sort(byExpiry));
}

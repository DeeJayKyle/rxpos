// First-expiry-first-out allocation, ported from src/fefo.js.
import '../entities/sale.dart';
import 'dates.dart';

/// A batch with how much of it is in stock at a branch.
class BatchStock {
  const BatchStock({required this.id, required this.qty, this.productId = '', this.batch = '', this.expiry = '', this.cost = 0, this.legacy = false});

  final String id;
  final String productId;
  final String batch;
  final String expiry;
  final double cost;
  final double qty;
  /// stock recorded without a batch (older data): its id is `lb-<productId>`
  final bool legacy;
}

/// Below this a difference between a quantity and the stock is rounding (pack and decimal arithmetic), not an oversale.
const stockTolerance = 1e-9;

String _qty(double v) {
  final r = (v * 100).round() / 100;
  return r == r.roundToDouble() ? '${r.toInt()}' : '$r';
}

/// The stock that may be sold from [batches]: expired batches only when [allowExpired].
double sellable(List<BatchStock> batches, {bool allowExpired = false, DateTime? now}) =>
    batches.where((b) => b.qty > 0 && (allowExpired || b.expiry.isEmpty || daysUntil(b.expiry, now: now) >= 0)).fold(0.0, (t, b) => t + b.qty);

/// Split [qty] across [batches] (already in expiry order). Expired batches are skipped unless [allowExpired].
/// More than the sellable stock this device knows of is refused with [NotEnoughStock]: an oversale is never booked
/// against a batch it isn't in (the pharmacy's policy: a sale can't go beyond the stock, even offline).
/// Step 21: a scanned pack's batch first (when it is there), the others after in their order (src/fefo.js preferFirst).
List<BatchStock> preferFirst(List<BatchStock> batches, String? batchId) =>
    batchId == null ? batches : [...batches.where((b) => b.id == batchId), ...batches.where((b) => b.id != batchId)];

List<Allocation> allocate(List<BatchStock> batches, double qty, {bool allowExpired = false, DateTime? now}) {
  if (qty <= 0) return const [];
  bool ok(BatchStock b) => allowExpired || b.expiry.isEmpty || daysUntil(b.expiry, now: now) >= 0;
  final available = sellable(batches, allowExpired: allowExpired, now: now);
  if (qty > available + stockTolerance) throw NotEnoughStock("Only ${_qty(available)} sellable in stock: you can't sell ${_qty(qty)}.");
  final out = <Allocation>[];
  var left = qty;
  for (final b in batches) {
    if (left <= stockTolerance) break;
    if (b.qty <= 0 || !ok(b)) continue;
    final take = b.qty < left ? b.qty : left;
    out.add(Allocation(batchId: b.id, qty: take, batch: b.batch, expiry: b.expiry));
    left -= take;
  }
  return out;
}

class NotEnoughStock implements Exception {
  NotEnoughStock(this.message);
  final String message;
  @override
  String toString() => message;
}

/// Stock to remove from a medicine, starting with the chosen batch, never taking a batch below zero. Throws
/// [NotEnoughStock] when the medicine does not have that much in total.
List<({String? batchId, double qty, String batch})> removalSplit(List<BatchStock> batches, String chosenId, double qty) {
  final stocked = batches.where((b) => b.qty > 0).toList();
  final total = stocked.fold(0.0, (a, b) => a + b.qty);
  if (qty > total + 1e-9) {
    final shown = (total * 100).round() / 100;
    throw NotEnoughStock("Only ${shown == shown.roundToDouble() ? shown.toInt() : shown} in stock: you can't remove ${qty == qty.roundToDouble() ? qty.toInt() : qty}.");
  }
  final order = [...stocked.where((b) => b.id == chosenId), ...stocked.where((b) => b.id != chosenId)];
  final out = <({String? batchId, double qty, String batch})>[];
  var left = qty;
  for (final b in order) {
    if (left <= 0) break;
    final take = b.qty < left ? b.qty : left;
    out.add((batchId: b.legacy || b.id.startsWith('lb-') ? null : b.id, qty: take, batch: b.batch));
    left -= take;
  }
  return out;
}

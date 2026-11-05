// Reorder levels from real sales (src/reorder.js): level = average daily sales over the period × (supplier lead time +
// safety days). Only medicines that sold in the period change.
import '../../../core/data/record_store.dart';
import '../../../core/entities/product.dart';
import '../../../core/entities/sale.dart';
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

Future<void> applyReorderLevels(RecordStore store, List<ReorderChange> changes, {required String user, String branchId = mainBranch}) =>
    store.update((d) {
      for (final c in changes) {
        d.put('products', c.product.copyWith(reorder: c.level.toDouble()).toRecord());
      }
      d.audit(user, 'Reorder levels updated', '${changes.length} medicines', branchId);
    });

/// How many to order for a low medicine: up to twice its reorder level.
double suggestedOrder(Product p, double stock) => (p.reorder * 2 - stock).clamp(0, double.infinity).ceilToDouble();

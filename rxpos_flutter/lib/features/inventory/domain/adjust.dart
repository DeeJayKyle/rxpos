// Counting or adjusting a medicine's stock (src/pages/Inventory.jsx saveAdjust). Count: set a batch to what was counted.
// Add: into a batch (or a new one). Remove: never more than a batch holds; the rest comes from the medicine's other
// batches, earliest expiry first. Every change is a stock movement with the reason, and an audit line.
import '../../../core/data/record_store.dart';
import '../../../core/entities/product.dart';
import '../../../core/rules/fefo.dart';
import '../../../core/rules/stock.dart';

enum AdjustMode { count, add, remove }

class AdjustProblem implements Exception {
  AdjustProblem(this.message);
  final String message;
  @override
  String toString() => message;
}

/// Returns the change made (+ / −), 0 when nothing changed.
Future<double> adjustStock(RecordStore store, {required Product product, required List<BatchStock> batches, required AdjustMode mode,
    required String batchId, double counted = 0, double qty = 0, required String reason, required String user,
    String newBatch = '', String newExpiry = '', String branchId = mainBranch}) async {
  if (reason.trim().isEmpty) throw AdjustProblem('Give a reason (e.g. damaged, stock take, sample)');
  final b = batches.where((x) => x.id == batchId).firstOrNull;
  final diff = switch (mode) { AdjustMode.count => counted - (b?.qty ?? 0), AdjustMode.add => qty, AdjustMode.remove => -qty };
  if (diff == 0) return 0;
  if (mode == AdjustMode.add && batchId == 'new' && newExpiry.isEmpty) throw AdjustProblem('Enter the new batch\'s expiry date');
  List<({String? batchId, double qty, String batch})>? parts;
  if (mode == AdjustMode.remove) {
    try {
      parts = removalSplit(batches, batchId, -diff);
    } on NotEnoughStock catch (e) {
      throw AdjustProblem(e.message);
    }
  }
  final type = mode == AdjustMode.count ? 'Stock count' : 'Adjustment';
  await store.update((d) async {
    var target = b != null && !b.legacy ? b.id : null;
    if (mode == AdjustMode.add && batchId == 'new') {
      target = (await d.addBatch(productId: product.id, batch: newBatch, expiry: newExpiry, cost: product.cost))['id'] as String;
    }
    if (parts != null) {
      for (final x in parts) {
        d.move(productId: product.id, qty: -x.qty, type: type, note: reason.trim(), user: user, batchId: x.batchId, branchId: branchId);
      }
    } else {
      d.move(productId: product.id, qty: diff, type: type, note: reason.trim(), user: user, batchId: target, branchId: branchId);
    }
    final where = parts != null ? parts.map((x) => '${x.batch.isEmpty ? '—' : x.batch} −${_n(x.qty)}').join(', ') : (b?.batch ?? newBatch);
    d.audit(user, mode == AdjustMode.count ? 'Stock count' : 'Stock adjusted', '${product.name} $where: ${diff > 0 ? '+' : ''}${_n(diff)} (${reason.trim()})', branchId);
  });
  return diff;
}

String _n(double v) => v == v.roundToDouble() ? '${v.toInt()}' : '$v';

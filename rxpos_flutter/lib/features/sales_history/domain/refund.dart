// Refunding a sale (src/pages/Sales.jsx refund): the sale is marked refunded, every unit goes back to stock in the same
// batches it came from, and the audit log says so: one transaction.
import '../../../core/data/record_store.dart';
import '../../../core/entities/sale.dart';
import '../../../core/entities/settings.dart';
import '../../../core/presentation/widgets.dart';
import '../../../core/rules/kits.dart';
import '../../../core/rules/stock.dart';

class RefundProblem implements Exception {
  RefundProblem(this.message);
  final String message;
  @override
  String toString() => message;
}

Future<void> refundSale(RecordStore store, Sale sale, {required String user, required PharmacySettings settings}) async {
  if (sale.status == 'refunded') throw RefundProblem('${sale.number} was already refunded');
  final branch = sale.branchId.isEmpty ? mainBranch : sale.branchId;
  await store.update((d) {
    d.put('sales', {...sale.toRecord(), 'status': 'refunded', 'refundedBy': user, 'refundedAt': d.now});
    final raw = rawSaleItems(sale.raw);
    for (var n = 0; n < sale.items.length; n++) {
      final i = sale.items[n];
      // a kit line (sold in the React app): each of its medicines goes back to the batches it came from
      final kit = n < raw.length ? kitStockParts(raw[n]) : null;
      if (kit != null) {
        for (final (productId, batchId, qty) in kit) {
          d.move(productId: productId, qty: qty, type: 'Refund', ref: sale.number, user: user, batchId: batchId, branchId: branch);
        }
        continue;
      }
      final parts = i.alloc.isNotEmpty ? [for (final a in i.alloc) (a.batchId, a.qty)] : [(null, i.qty)];
      for (final (batchId, qty) in parts) {
        d.move(productId: i.id, qty: qty, type: 'Refund', ref: sale.number, user: user, batchId: batchId, branchId: branch);
      }
    }
    d.audit(user, 'Refund', '${sale.number} · ${settings.money(sale.total)}', branch);
  });
}

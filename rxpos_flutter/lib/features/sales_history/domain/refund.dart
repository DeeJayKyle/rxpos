// Refunding a sale (src/pages/Sales.jsx refund): the sale is marked refunded, every unit goes back to stock in the same
// batches it came from, and the audit log says so: one transaction.
import '../../../core/data/record_store.dart';
import '../../../core/entities/sale.dart';
import '../../../core/entities/settings.dart';
import '../../../core/presentation/widgets.dart';
import '../../../core/rules/insurance.dart';
import '../../../core/rules/kits.dart';
import '../../../core/rules/stock.dart';

class RefundProblem implements Exception {
  RefundProblem(this.message);
  final String message;
  @override
  String toString() => message;
}

/// The reasons the refund sheet offers (the same as src/components/RefundSheet.jsx).
const refundReasons = ['Customer returned it', 'Wrong medicine or strength', 'Wrong price or quantity', 'Side effect or reaction', 'Sold twice by mistake', 'Other'];

/// What a refund gives back: money to the customer, a debt cancelled, a share no longer billed to the insurer.
({double back, double unpaid, double insurer}) refundMoney(Sale sale) {
  final insurer = insurerShare(sale.raw);
  final back = sale.paid;
  final unpaid = sale.total - back - insurer;
  return (back: back, unpaid: unpaid > 0 ? unpaid : 0.0, insurer: insurer);
}

/// How the money goes back, in the cashier's words.
String refundHow(Sale sale, double back, String Function(num) money) {
  if (back <= 0) return 'Nothing was paid, so no money goes back.';
  final p = sale.payment.isEmpty ? 'Cash' : sale.payment;
  if (RegExp('mobile|momo|airtel|mtn', caseSensitive: false).hasMatch(p)) {
    return 'Send ${money(back)} back to the customer by Mobile Money. RxPOS records the refund; it does not send the money.';
  }
  if (RegExp('cash', caseSensitive: false).hasMatch(p)) return 'Give ${money(back)} back from the cash drawer.';
  return 'Pay ${money(back)} back the way it was paid ($p).';
}

/// [reason] (from the refund sheet) is kept on the sale and in the audit log.
Future<void> refundSale(RecordStore store, Sale sale, {required String user, required PharmacySettings settings, String reason = ''}) async {
  if (sale.status == 'refunded') throw RefundProblem('${sale.number} was already refunded');
  final branch = sale.branchId.isEmpty ? mainBranch : sale.branchId;
  await store.update((d) {
    final why = reason.trim().length > 240 ? reason.trim().substring(0, 240) : reason.trim();
    d.put('sales', {...sale.toRecord(), 'status': 'refunded', 'refundedBy': user, 'refundedAt': d.now, if (why.isNotEmpty) 'refundReason': why});
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
    d.audit(user, 'Refund', '${sale.number} · ${settings.money(sale.total)}${why.isEmpty ? '' : ' · $why'}', branch);
  });
}

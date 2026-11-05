// Returning stock to a supplier (src/pages/Returns.jsx): each line leaves stock from its batch ("Supplier return"),
// the return is settled as a credit note (less owed to the supplier) or a refund, with an audit line.
import '../../../core/data/record_store.dart';
import '../../../core/rules/fefo.dart';
import '../../../core/rules/ids.dart';
import '../../../core/rules/stock.dart';

class ReturnLine {
  const ReturnLine({required this.productId, required this.name, required this.batch, required this.qty, required this.credit, this.reason = 'Expired'});
  final String productId, name;
  final BatchStock batch;
  final double qty, credit;
  final String reason;
}

class ReturnProblem implements Exception {
  ReturnProblem(this.message);
  final String message;
  @override
  String toString() => message;
}

Future<Map<String, Object?>> returnToSupplier(RecordStore store, {required String supplierId, required String supplierName, required List<ReturnLine> lines,
    required String settle, String creditNote = '', String note = '', String bankId = 'cash-drawer', required String by, required String date, String branchId = mainBranch}) {
  if (lines.isEmpty) throw ReturnProblem('Add what is going back');
  for (final l in lines) {
    if (!(l.qty > 0) || l.qty > l.batch.qty) throw ReturnProblem('${l.name}: return between 1 and ${l.batch.qty.round()} (in stock in batch ${l.batch.batch})');
  }
  return store.update((d) {
    final items = [
      for (final l in lines)
        {'productId': l.productId, 'name': l.name, 'batchId': l.batch.legacy ? null : l.batch.id, 'batch': l.batch.batch, 'expiry': l.batch.expiry,
          'qty': l.qty.round(), 'credit': l.credit, 'reason': l.reason},
    ];
    final total = lines.fold(0.0, (a, l) => a + l.qty.roundToDouble() * l.credit);
    final rec = d.put('supplierReturns', {'id': uid(), 'number': docNumber('RT'), 'date': date, 'supplierId': supplierId, 'supplierName': supplierName,
      'creditNote': creditNote.trim(), 'settle': settle, if (settle == 'cash') 'bankId': bankId, 'note': note.trim(), 'items': items, 'total': total,
      'branchId': branchId, 'by': by, 'at': d.now});
    for (final i in items) {
      d.move(productId: i['productId'] as String, qty: -((i['qty'] as int).toDouble()), type: 'Supplier return', ref: rec['number'] as String,
          note: '${i['reason']}', user: by, batchId: i['batchId'] as String?, branchId: branchId);
    }
    d.audit(by, 'Returned to supplier', '${rec['number']} to $supplierName: ${items.length} line${items.length > 1 ? 's' : ''}, $total (${settle == 'cash' ? 'refund' : 'credit note'})', branchId);
    return rec;
  });
}

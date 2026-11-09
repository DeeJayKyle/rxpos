// Stock transfers between branches (src/pages/Branches.jsx): sent stock leaves the sending branch first-expiry-first-out
// ("Transfer out"); the receiving branch takes in what arrived into the same batches ("Transfer in"), short noted.
import '../../../core/data/record_store.dart';
import '../../../core/rules/fefo.dart';
import '../../../core/rules/ids.dart';

class TransferProblem implements Exception {
  TransferProblem(this.message);
  final String message;
  @override
  String toString() => message;
}

Future<Map<String, Object?>> sendTransfer(RecordStore store, {required String fromId, required String toId, required String toName,
    required List<({String productId, String name, double qty, double stock, List<BatchStock> batches})> lines, required String by, String note = ''}) {
  final use = lines.where((l) => l.qty > 0).toList();
  if (toId.isEmpty || toId == fromId) throw TransferProblem('Choose the branch to send to');
  if (use.isEmpty) throw TransferProblem('Add at least one medicine');
  for (final l in use) {
    if (l.qty > l.stock) throw TransferProblem('Only ${l.stock.round()} ${l.name} in stock');
  }
  return store.update((d) async {
    final number = await d.number('TR', branchId: fromId);
    final items = <Map<String, Object?>>[];
    for (final l in use) {
      final alloc = allocate(l.batches, l.qty);
      items.add({'productId': l.productId, 'name': l.name, 'qty': l.qty, 'alloc': [for (final a in alloc) a.toJson()]});
      for (final a in alloc) {
        d.move(productId: l.productId, qty: -a.qty, type: 'Transfer out', ref: '$number → $toName', user: by, batchId: a.batchId, branchId: fromId);
      }
    }
    final t = d.put('transfers', {'id': uid(), 'number': number, 'date': d.now, 'fromId': fromId, 'toId': toId, 'status': 'In transit', 'sentBy': by, 'note': note, 'items': items});
    d.audit(by, 'Stock transfer sent', '$number to $toName: ${use.length} lines', fromId);
    return t;
  });
}

/// Receive a transfer: [received] per line (index → quantity that arrived).
Future<void> receiveTransfer(RecordStore store, Map<String, Object?> t, {required Map<int, double> received, required String fromName, required String by}) =>
    store.update((d) {
      final items = ((t['items'] as List?) ?? const []).cast<Map>();
      final toId = '${t['toId']}';
      var short = 0.0;
      for (var n = 0; n < items.length; n++) {
        final i = items[n];
        var left = received[n] ?? ((i['qty'] as num?) ?? 0).toDouble();
        short += ((i['qty'] as num?) ?? 0).toDouble() - left;
        for (final a in ((i['alloc'] as List?) ?? const []).cast<Map>()) {
          final aq = ((a['qty'] as num?) ?? 0).toDouble();
          final qty = aq < left ? aq : left;
          if (qty > 0) d.move(productId: '${i['productId']}', qty: qty, type: 'Transfer in', ref: '${t['number']} ← $fromName', user: by, batchId: a['batchId'] as String?, branchId: toId);
          left -= qty;
        }
      }
      d.put('transfers', {...t, 'status': short > 0 ? 'Received (short)' : 'Received', 'receivedBy': by, 'receivedAt': d.now,
        'receivedQty': {for (final e in received.entries) '${e.key}': e.value}});
      d.audit(by, 'Stock transfer received', '${t['number']} from $fromName${short > 0 ? ' – ${short.round()} units short' : ''}', toId);
    });

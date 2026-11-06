// Correcting a past delivery (src/pages/Purchases.jsx PurchaseEditor): change any line (medicine, batch, expiry,
// quantity, cost), remove lines and add lines that were missed. Every change moves stock with a "Purchase edit"
// movement on the right batch; stock already sold cannot be taken back.
import '../../../core/data/record_store.dart';
import '../../../core/entities/settings.dart';
import '../../../core/presentation/widgets.dart';
import '../../../core/rules/fefo.dart';
import '../../../core/rules/money.dart';
import '../../../core/rules/stock.dart';
import 'delivery.dart';

/// A line on the editor. [orig]: the index of the delivery's line it started as (null: added now).
class PurchaseEditLine {
  const PurchaseEditLine({this.orig, required this.productId, required this.name, this.batch = '', this.expiry = '', required this.qty, required this.cost, this.removed = false});
  final int? orig;
  final String productId, name, batch, expiry;
  final double qty, cost;
  final bool removed;
  PurchaseEditLine copyWith({String? productId, String? name, String? batch, String? expiry, double? qty, double? cost, bool? removed}) => PurchaseEditLine(
      orig: orig, productId: productId ?? this.productId, name: name ?? this.name, batch: batch ?? this.batch, expiry: expiry ?? this.expiry,
      qty: qty ?? this.qty, cost: cost ?? this.cost, removed: removed ?? this.removed);
}

List<PurchaseEditLine> editLinesOf(Map<String, Object?> purchase) => [
      for (final (n, i) in ((purchase['items'] as List?) ?? const []).cast<Map>().indexed)
        PurchaseEditLine(orig: n, productId: '${i['productId']}', name: '${i['name']}', batch: '${i['batch'] ?? ''}', expiry: '${i['expiry'] ?? ''}',
            qty: ((i['qty'] as num?) ?? 0).toDouble(), cost: ((i['cost'] as num?) ?? 0).toDouble()),
    ];

Future<Map<String, Object?>> editPurchase(RecordStore store, Map<String, Object?> purchase, List<PurchaseEditLine> lines,
    {required String supplierId, required String supplierName, required String invoice, required String notes, required String date, required double paid,
    required String reason, required String user, required List<BatchStock> Function(String productId, String branch) batchesOf, required PharmacySettings settings}) async {
  if (reason.trim().isEmpty) throw DeliveryProblem('Say why the delivery is being changed');
  final orig = ((purchase['items'] as List?) ?? const []).cast<Map>();
  final br = '${purchase['branchId'] ?? mainBranch}';
  final added = lines.where((i) => !i.removed && (i.orig == null || i.productId != '${orig[i.orig!]['productId']}') && (i.productId.isNotEmpty || i.qty > 0)).toList();
  for (final i in added) {
    if (i.productId.isEmpty) throw DeliveryProblem('Choose the medicine for every added line (or remove the line)');
    if (!(i.qty > 0)) throw DeliveryProblem('${i.name}: type the quantity received');
  }
  if (!lines.any((i) => !i.removed && i.productId.isNotEmpty && i.qty > 0)) {
    throw DeliveryProblem('A delivery needs at least one line. To cancel it completely, return the stock to the supplier instead.');
  }
  final batches = await store.rows('batches');
  Map<String, Object?>? findBatch(Map o) =>
      batches.where((b) => b['id'] == o['batchId']).firstOrNull ??
      batches.where((b) => b['productId'] == o['productId'] && b['batch'] == '${o['batch'] ?? ''}'.trim() && (b['expiry'] ?? '') == (o['expiry'] ?? '')).firstOrNull;
  final plan = [
    for (var n = 0; n < orig.length; n++)
      () {
        final i = lines.where((x) => x.orig == n).firstOrNull;
        final out = i == null || i.removed || !(i.qty > 0) || i.productId != '${orig[n]['productId']}';
        return (o: orig[n], i: i, out: out);
      }(),
  ];
  for (final x in plan) {
    final oq = ((x.o['qty'] as num?) ?? 0).toDouble();
    final moved = !x.out && (x.i!.batch != '${x.o['batch'] ?? ''}' || x.i!.expiry != '${x.o['expiry'] ?? ''}');
    final less = x.out ? oq : oq - x.i!.qty;
    final b = findBatch(x.o);
    final have = b == null ? 0.0 : (batchesOf('${x.o['productId']}', br).where((s) => s.id == b['id']).firstOrNull?.qty ?? 0);
    final need = moved ? oq : less;
    if (need > 0 && need > have) {
      throw DeliveryProblem('${x.o['name']}: only ${formatQty(have)} of batch ${x.o['batch']} left (some was already sold), so it can\'t be ${x.out ? 'removed' : 'reduced by more than ${formatQty(have)}'}.');
    }
  }
  return store.update((d) async {
    final items = <Map<String, Object?>>[];
    void mv(String productId, double qty, String? batchId, [String note = '']) =>
        d.move(productId: productId, qty: qty, type: 'Purchase edit', ref: '${purchase['number']}', note: note, user: user, batchId: batchId, branchId: br);
    for (final x in plan) {
      final o = x.o, i = x.i;
      final old = findBatch(o);
      final oq = ((o['qty'] as num?) ?? 0).toDouble();
      if (x.out) {
        if (old != null) mv('${o['productId']}', -oq, old['id'] as String, i != null && !i.removed && i.qty > 0 ? 'medicine corrected' : 'line removed');
        continue;
      }
      final qty = i!.qty.roundToDouble() < 0 ? 0.0 : i.qty.roundToDouble(), cost = i.cost;
      var batchId = old?['id'] as String?;
      if ((i.batch != '${o['batch'] ?? ''}' || i.expiry != '${o['expiry'] ?? ''}') && old != null) {
        mv('${o['productId']}', -oq, old['id'] as String, 'batch corrected');
        batchId = (await d.addBatch(productId: '${o['productId']}', batch: i.batch, expiry: i.expiry, cost: cost))['id'] as String;
        if (qty > 0) mv('${o['productId']}', qty, batchId, 'batch corrected');
      } else if (qty != oq) {
        batchId ??= (await d.addBatch(productId: '${o['productId']}', batch: i.batch, expiry: i.expiry, cost: cost))['id'] as String;
        mv('${o['productId']}', qty - oq, batchId);
      }
      if (batchId != null && cost != ((o['cost'] as num?) ?? 0)) {
        final b = batches.where((x) => x['id'] == batchId).firstOrNull;
        if (b != null) d.put('batches', {...b, 'cost': cost});
      }
      items.add({...o.cast<String, Object?>(), 'productId': i.productId, 'name': i.name, 'batch': i.batch, 'expiry': i.expiry, 'qty': qty, 'cost': cost, 'batchId': batchId});
    }
    for (final i in added) {
      final qty = i.qty.roundToDouble();
      final b = await d.addBatch(productId: i.productId, batch: i.batch, expiry: i.expiry, cost: i.cost);
      mv(i.productId, qty, b['id'] as String, i.orig == null ? 'line added' : 'medicine corrected');
      items.add({'productId': i.productId, 'name': i.name, 'batch': i.batch, 'expiry': i.expiry, 'qty': qty, 'cost': i.cost, 'batchId': b['id']});
    }
    final total = items.fold<double>(0, (a, i) => a + (i['qty'] as double) * (i['cost'] as double));
    final rec = {
      ...purchase, 'supplierId': supplierId, 'supplierName': supplierName.isEmpty ? purchase['supplierName'] : supplierName, 'invoice': invoice, 'notes': notes.trim(),
      'date': date, 'items': items, 'total': total, 'paid': paid < total ? paid : total, 'editedBy': user, 'editedAt': d.now,
      'edits': [...((purchase['edits'] as List?) ?? const []), {'at': d.now, 'by': user, 'reason': reason.trim(), 'before': {'total': purchase['total'], 'lines': orig.length}}],
    };
    d.put('purchases', rec);
    final removedN = plan.where((x) => x.out && !(x.i != null && !x.i!.removed && x.i!.qty > 0)).length;
    final addedN = added.where((i) => i.orig == null).length, swapped = added.length - addedN;
    final changes = [if (removedN > 0) '$removedN line${removedN > 1 ? 's' : ''} removed', if (addedN > 0) '$addedN added', if (swapped > 0) '$swapped medicine${swapped > 1 ? 's' : ''} corrected'];
    d.audit(user, 'Purchase edited', '${purchase['number']}: ${settings.money((purchase['total'] as num?) ?? 0)} → ${settings.money(total)}${changes.isEmpty ? '' : ', ${changes.join(', ')}'} (${reason.trim()})', br);
    return rec;
  });
}

/// Delete a whole delivery (purchases.edit): every line's stock goes back out of its batch with a "Purchase deleted"
/// movement, the record is removed (on every device) and the audit log keeps what it was and why. Refused when stock
/// from it was already sold, used or moved: then only the rest can be corrected with [editPurchase].
Future<void> deletePurchase(RecordStore store, Map<String, Object?> purchase,
    {required String reason, required String user, required List<BatchStock> Function(String productId, String branch) batchesOf, required PharmacySettings settings}) async {
  if (reason.trim().isEmpty) throw DeliveryProblem('Say why the delivery is being deleted');
  final items = ((purchase['items'] as List?) ?? const []).cast<Map>();
  final br = '${purchase['branchId'] ?? mainBranch}';
  final batches = await store.rows('batches');
  Map<String, Object?>? findBatch(Map o) =>
      batches.where((b) => b['id'] == o['batchId']).firstOrNull ??
      batches.where((b) => b['productId'] == o['productId'] && b['batch'] == '${o['batch'] ?? ''}'.trim() && (b['expiry'] ?? '') == (o['expiry'] ?? '')).firstOrNull;
  // what each batch must give back (two lines can share a batch)
  final need = <String, double>{};
  for (final o in items) {
    final b = findBatch(o);
    if (b != null) need[b['id'] as String] = (need[b['id']] ?? 0) + ((o['qty'] as num?) ?? 0).toDouble();
  }
  for (final o in items) {
    final b = findBatch(o);
    if (b == null) continue;
    final have = batchesOf('${o['productId']}', br).where((s) => s.id == b['id']).firstOrNull?.qty ?? 0;
    if (need[b['id']]! > have) {
      throw DeliveryProblem('${o['name']}: only ${formatQty(have)} of batch ${o['batch']} left (some was already sold or moved), so this delivery '
          'can\'t be deleted. Correct it with Edit instead.');
    }
  }
  final ref = '${purchase['number']}';
  await store.update((d) {
    for (final o in items) {
      final b = findBatch(o);
      final qty = ((o['qty'] as num?) ?? 0).toDouble();
      if (b != null && qty != 0) {
        d.move(productId: '${o['productId']}', qty: -qty, type: 'Purchase edit', ref: ref, note: 'delivery deleted', user: user, batchId: b['id'] as String, branchId: br);
      }
    }
    d.del('purchases', purchase['id'] as String);
    d.audit(user, 'Purchase deleted',
        '$ref from ${purchase['supplierName'] ?? ''} (invoice ${'${purchase['invoice'] ?? ''}'.isEmpty ? '—' : purchase['invoice']}, ${items.length} lines, '
        '${settings.money((purchase['total'] as num?) ?? 0)}): ${reason.trim()}',
        br);
  });
}

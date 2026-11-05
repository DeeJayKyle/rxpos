// Stock take (src/pages/StockCount.jsx): start a count of some medicines, record what is on the shelf per batch, then
// post: every batch whose count differs gets a "Stock count" movement, so stock matches what was counted. Medicines in
// the count that nobody counted can be set to 0 ([zeroUncounted]).
import '../../../core/data/record_store.dart';
import '../../../core/entities/product.dart';
import '../../../core/rules/fefo.dart';
import '../../../core/rules/ids.dart';
import '../../../core/rules/stock.dart';

String countItemId(String countId, String productId) => '$countId:$productId';

Future<Map<String, Object?>> startCount(RecordStore store, {required String name, required List<String> productIds, required String user,
    bool blind = false, String scopeLabel = 'Chosen medicines', String branchId = mainBranch}) => store.update((d) {
      final rec = d.put('stockCounts', {'id': uid(), 'number': 'SC${DateTime.now().millisecondsSinceEpoch.toRadixString(36).toUpperCase().substring(2)}',
        'name': name.trim().isEmpty ? 'Stock count' : name.trim(), 'date': d.now, 'branchId': branchId, 'scope': 'custom', 'scopeLabel': scopeLabel,
        'productIds': productIds, 'blind': blind, 'status': 'open', 'startedBy': user, 'startedAt': d.now});
      d.audit(user, 'Stock count started', '${rec['name']} ($scopeLabel, ${productIds.length} items)', branchId);
      return rec;
    });

/// One counted line: a batch (or a batch found on the shelf that RxPOS did not know: [batchId] null).
class CountLine {
  const CountLine({this.batchId, required this.batch, this.expiry = '', required this.qty});
  final String? batchId;
  final String batch, expiry;
  final double qty;
  Map<String, Object?> toJson() => {'batchId': batchId, 'batch': batch, 'expiry': expiry, 'qty': qty, if (batchId == null) 'found': true};
  factory CountLine.fromJson(Map<String, Object?> j) =>
      CountLine(batchId: j['batchId'] as String?, batch: '${j['batch'] ?? ''}', expiry: '${j['expiry'] ?? ''}', qty: ((j['qty'] as num?) ?? 0).toDouble());
}

Future<void> saveCountItem(RecordStore store, {required String countId, required Product product, required List<CountLine> lines, required String by, String branchId = mainBranch}) =>
    store.update((d) => d.put('countItems', {'id': countItemId(countId, product.id), 'countId': countId, 'productId': product.id, 'name': product.name,
      'branchId': branchId, 'lines': [for (final l in lines) l.toJson()], 'total': lines.fold<double>(0, (a, l) => a + l.qty), 'by': by, 'at': d.now}));

/// A difference to post: counted − system for one batch.
class CountDiff {
  const CountDiff({required this.product, required this.batchId, required this.batch, required this.expiry, required this.system, required this.counted, this.found = false});
  final Product product;
  final String? batchId;
  final String batch, expiry;
  final double system, counted;
  final bool found;
  double get diff => counted - system;
  double get value => diff * product.cost;
}

/// The differences for counted medicines ([items]: productId → counted lines), and the stock of uncounted medicines.
({List<CountDiff> diffs, List<CountDiff> uncounted}) countDifferences(Map<String, Product> products, Map<String, List<CountLine>> items,
    List<String> scope, List<BatchStock> Function(String productId) batchesOf) {
  final diffs = <CountDiff>[], uncounted = <CountDiff>[];
  for (final pid in scope) {
    final p = products[pid];
    if (p == null) continue;
    final batches = batchesOf(pid);
    final lines = items[pid];
    if (lines == null) {
      for (final b in batches.where((b) => b.qty > 0)) {
        uncounted.add(CountDiff(product: p, batchId: b.id, batch: b.batch, expiry: b.expiry, system: b.qty, counted: 0));
      }
      continue;
    }
    for (final b in batches) {
      final counted = lines.where((l) => l.batchId == b.id).fold(0.0, (a, l) => a + l.qty);
      if (counted != b.qty) diffs.add(CountDiff(product: p, batchId: b.id, batch: b.batch, expiry: b.expiry, system: b.qty, counted: counted));
    }
    for (final l in lines.where((l) => l.batchId == null && l.qty > 0)) {
      diffs.add(CountDiff(product: p, batchId: null, batch: l.batch, expiry: l.expiry, system: 0, counted: l.qty, found: true));
    }
  }
  return (diffs: diffs, uncounted: uncounted);
}

Future<void> postCount(RecordStore store, {required Map<String, Object?> count, required List<CountDiff> diffs, List<CountDiff> zero = const [],
    required String user, String branchId = mainBranch}) => store.update((d) async {
      final ref = '${count['number'] ?? count['name']}';
      for (final r in diffs) {
        var batchId = r.batchId != null && !r.batchId!.startsWith('lb-') ? r.batchId : null;
        if (r.found) batchId = (await d.addBatch(productId: r.product.id, batch: r.batch, expiry: r.expiry, cost: r.product.cost))['id'] as String;
        d.move(productId: r.product.id, qty: r.diff, type: 'Stock count', ref: ref, note: '${count['name']}', user: user, batchId: batchId, branchId: branchId);
      }
      for (final z in zero) {
        d.move(productId: z.product.id, qty: -z.system, type: 'Stock count', ref: ref, note: '${count['name']} (not found)', user: user,
            batchId: z.batchId != null && !z.batchId!.startsWith('lb-') ? z.batchId : null, branchId: branchId);
      }
      final short = diffs.where((x) => x.diff < 0), over = diffs.where((x) => x.diff > 0);
      final summary = {'counted': diffs.map((x) => x.product.id).toSet().length, 'short': short.length, 'over': over.length,
        'shortValue': short.fold(0.0, (a, x) => a + x.value) - zero.fold(0.0, (a, x) => a + x.system * x.product.cost),
        'overValue': over.fold(0.0, (a, x) => a + x.value), 'zeroed': zero.length};
      d.put('stockCounts', {...count, 'status': 'posted', 'postedBy': user, 'postedAt': d.now, 'summary': summary});
      d.audit(user, 'Stock count posted', '${count['name']}: ${short.length} short, ${over.length} extra${zero.isNotEmpty ? ', ${zero.length} set to 0' : ''}', branchId);
    });

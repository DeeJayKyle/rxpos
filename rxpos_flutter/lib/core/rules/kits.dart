// Kits (1.10.0, the React app's src/kits.js): a kit is a `products` record with a `kit` recipe and no stock of its
// own. A kit sale line keeps `kit.components`, each with the batches its stock came from. This app does not sell or
// build kits yet (PARITY.md): it keeps them out of its medicine lists, gives a kit's medicines back on a refund, and
// leaves the correcting of a kit sale to the React app (its lines would lose their contents here).

/// Is this stored product record a kit?
bool isKitRecord(Map<String, Object?> rec) => rec['kit'] is Map;

/// The sale's stored lines, as they were saved (with fields this app does not model, such as `kit`).
List<Map<String, Object?>> rawSaleItems(Map<String, Object?> sale) => [
  for (final x in (sale['items'] is List ? sale['items'] as List : const [])) x is Map ? x.cast<String, Object?>() : <String, Object?>{},
];

/// Does the sale hold a kit line?
bool saleHasKit(Map<String, Object?> sale) => rawSaleItems(sale).any((i) => i['kit'] is Map);

double _num(Object? v) => v is num ? v.toDouble() : double.tryParse('${v ?? ''}') ?? 0;

/// The stock a kit line moved, as (productId, batchId, qty); null for a line that is not a kit.
List<(String, String?, double)>? kitStockParts(Map<String, Object?> item) {
  final kit = item['kit'];
  if (kit is! Map) return null;
  final comps = kit['components'];
  final out = <(String, String?, double)>[];
  if (comps is! List) return out;
  for (final c in comps) {
    if (c is! Map) continue;
    final id = '${c['id'] ?? ''}';
    if (id.isEmpty) continue;
    final alloc = c['alloc'];
    if (alloc is List && alloc.isNotEmpty) {
      for (final a in alloc) {
        if (a is! Map) continue;
        final b = a['batchId'];
        out.add((id, b == null ? null : '$b', _num(a['qty'])));
      }
    } else {
      out.add((id, null, _num(c['qty'])));
    }
  }
  return out;
}

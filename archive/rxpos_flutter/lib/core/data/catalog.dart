// The standard medicine catalogue (9,710 medicines) is built into the app, not stored per pharmacy in the cloud.
// Each device lays it underneath the pharmacy's own medicines; only medicines a pharmacy adds or changes are synced
// (src/store.jsx withCatalog). Same file as the React app: src/data/catalog.json → assets/catalog.json.
import 'dart:convert';

import 'package:flutter/services.dart' show rootBundle;

import '../entities/product.dart';

/// The time untouched catalogue medicines carry: anything newer is the pharmacy's own edit.
const baseAt = '2000-01-01T00:00:00.000Z';

bool isCatalogId(String id) => RegExp(r'^cat-\d+$').hasMatch(id);

/// One catalogue row → a medicine record, exactly as the React app builds it (same ids, barcodes and costs, so both
/// apps agree on every catalogue medicine).
Map<String, Object?> catalogRecord(List<Object?> row, int i) {
  final name = row[0], generic = row[1], form = row[2], unit = row[7];
  final price = (row[3] as num?) ?? 0, wholesale = (row[4] as num?) ?? 0, cost = (row[5] as num?) ?? 0;
  final barcode = (row[6] as String?) ?? '';
  final w = wholesale != 0 ? wholesale : price;
  return {
    'id': 'cat-${i + 1}', 'name': name, 'generic': generic, 'form': form, 'price': price, 'wholesale': w,
    'cost': cost != 0 ? cost : (w * 0.8 + 0.5).floor(),
    'barcode': barcode.isNotEmpty ? barcode : '2${(i + 1).toString().padLeft(11, '0')}', 'unit': unit, 'reorder': 0,
    'fromCatalog': true, '_base': true, 'updatedAt': baseAt,
  };
}

List<Product> catalogProducts(Map<String, Object?> catalog) {
  final rows = (catalog['rows'] as List).cast<List<Object?>>();
  return [for (var i = 0; i < rows.length; i++) Product.fromRecord(catalogRecord(rows[i], i))];
}

Future<List<Product>> loadCatalog() async =>
    catalogProducts((jsonDecode(await rootBundle.loadString('assets/catalog.json')) as Map).cast<String, Object?>());

/// The pharmacy's medicines with the catalogue underneath: the pharmacy's own record of a catalogue medicine wins;
/// catalogue medicines the pharmacy removed ([hidden]) or all of them when the owner switched the catalogue off
/// ([on] false) are left out.
List<Product> withCatalog(List<Product> own, List<Product> catalog, {Set<String> hidden = const {}, bool on = true}) {
  if (!on) return own.where((p) => !(p.raw['_base'] == true && p.updatedAt == baseAt)).toList();
  final have = {for (final p in own) p.id};
  return [...own, for (final c in catalog) if (!have.contains(c.id) && !hidden.contains(c.id)) c];
}

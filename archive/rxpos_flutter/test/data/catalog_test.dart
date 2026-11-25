// The built-in catalogue: same ids, barcodes and costs as the React app (src/store.jsx baseProduct).
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:rxpos/core/data/catalog.dart';
import 'package:rxpos/core/entities/product.dart';

void main() {
  final cat = (jsonDecode(File('assets/catalog.json').readAsStringSync()) as Map).cast<String, Object?>();
  final all = catalogProducts(cat);

  test('the whole catalogue loads with the React app\'s ids', () {
    expect(all.length, (cat['rows'] as List).length);
    expect(all.length, greaterThan(9000));
    expect(all.first.id, 'cat-1');
    expect(all.first.isCatalog, isTrue);
  });
  test('a missing barcode and cost are made the same way as in the React app', () {
    final r = catalogRecord(['Test', 'test', 'Tablets', 1000, 600, 0, '', 'Unit'], 41);
    expect(r['barcode'], '200000000042');
    expect(r['cost'], 480, reason: 'Math.round(600 × 0.8)');
    expect(r['wholesale'], 600);
    expect(catalogRecord(['T', '', 'Tablets', 1000, 0, 0, '', 'Unit'], 0)['wholesale'], 1000);
  });
  test('the pharmacy\'s own record wins; removed ones and a switched-off catalogue are left out', () {
    final own = [Product.fromRecord({'id': 'cat-1', 'name': 'Renamed', 'price': 1500, 'updatedAt': '2026-11-01T00:00:00Z'}), const Product(id: 'p-own')];
    final merged = withCatalog(own, all.take(5).toList(), hidden: {'cat-3'});
    expect(merged.map((p) => p.id), ['cat-1', 'p-own', 'cat-2', 'cat-4', 'cat-5']);
    expect(merged.first.name, 'Renamed');
    expect(withCatalog(own, all.take(5).toList(), on: false).map((p) => p.id), ['cat-1', 'p-own']);
  });
}

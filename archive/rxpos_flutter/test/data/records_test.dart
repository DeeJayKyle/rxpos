// Records written by the React app must come back out of this app exactly as they went in, unknown fields included.
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:rxpos/core/data/record_merge.dart';
import 'package:rxpos/core/entities/product.dart';
import 'package:rxpos/core/entities/purchase.dart';
import 'package:rxpos/core/entities/sale.dart';

Map<String, Object?> js(String s) => (jsonDecode(s) as Map).cast<String, Object?>();

void main() {
  // shaped as src/pages/POS.jsx writes a sale (one line by the pack, one with directions and a field from a newer app)
  final sale = js('''{"id":"0f6e2c1a-4b7d-4c1e-9a2b-7c3d5e6f7a8b","number":"R1A2B3CX","date":"2026-11-05T07:12:00.000Z","type":"retail",
    "branchId":"main","items":[
      {"id":"cat-120","name":"Amoxyl 500mg caps","price":500,"cost":300,"qty":20,"pack":{"name":"Strip","size":10,"count":2,"price":5000},
       "alloc":[{"batchId":"b1","qty":15,"batch":"AX1","expiry":"2027-01-31"},{"batchId":"b2","qty":5,"batch":"AX2","expiry":"2027-06-30"}]},
      {"id":"p-own-1","name":"Calpol Syrup","price":"6000","cost":4000,"qty":1,"directions":{"dose":"5ml","freq":"tds","days":"5","notes":[]},
       "alloc":[{"batchId":null,"qty":1,"batch":"","expiry":""}],"labelPrinted":true}],
    "subtotal":16000,"discount":500,"tax":0,"total":15500,"payment":"Cash","paid":15500,"tendered":20000,"bankId":"cash-drawer",
    "customerId":"walk-in","customerName":"Walk-in Customer","cashier":"Tia Admin","status":"completed","expiredOverride":false,
    "updatedAt":"2026-11-05T07:12:00.000Z","futureField":{"x":1}}''');

  test('a sale decodes with its lines, packs, batch allocations and loose values', () {
    final s = Sale.fromRecord(sale);
    expect(s.items, hasLength(2));
    expect(s.items[0].pack, const SalePack(name: 'Strip', size: 10, count: 2, price: 5000));
    expect(s.items[0].alloc.map((a) => (a.batchId, a.qty)), [('b1', 15.0), ('b2', 5.0)]);
    expect(s.items[1].price, 6000, reason: 'a price saved as text');
    expect(s.items[1].alloc.single.batchId, isNull);
    expect(s.items[1].directions?['dose'], '5ml');
    expect(s.total, 15500);
    expect(s.balance, 0);
  });

  test('an unchanged sale is written back exactly as it was read (unknown fields kept)', () {
    final out = Sale.fromRecord(sale).toRecord();
    final again = jsonDecode(jsonEncode(out)) as Map;
    final lines = (again['items'] as List).cast<Map<String, Object?>>();
    expect(again['futureField'], {'x': 1});
    expect(lines[1]['labelPrinted'], isTrue, reason: 'a field inside a line the app does not know');
    expect(lines[1]['price'], 6000, reason: 'the loose text price is written back as a number');
    expect(again['expiredOverride'], isFalse);
    expect(again['updatedAt'], sale['updatedAt'], reason: 'the store stamps updatedAt, entities never change it');
  });

  test('editing one field changes only that field', () {
    final p = Product.fromRecord(js('{"id":"p1","name":"Amoxyl","price":500,"cost":300,"supplierCode":"SUP-77","fromCatalog":true}'));
    final out = p.copyWith(price: 550).toRecord();
    expect(out, {'id': 'p1', 'name': 'Amoxyl', 'price': 550, 'cost': 300, 'supplierCode': 'SUP-77', 'fromCatalog': true});
  });

  test('defaults are not added to records that never had the field', () {
    final out = Product.fromRecord(js('{"id":"p1","name":"A"}')).toRecord();
    expect(out, {'id': 'p1', 'name': 'A'});
  });

  test('a delivery from Add Stock decodes, packs included', () {
    final p = Purchase.fromRecord(js('''{"id":"pu1","number":"GRN1A2B3C","supplierId":"s1","supplierName":"Sample Wholesalers","invoice":"INV-9",
      "date":"2026-11-04","receivedBy":"Tia","total":64000,"paid":64000,"bankId":"cash-drawer","branchId":"main",
      "items":[{"productId":"p1","name":"Paramol","qty":200,"cost":32,"batch":"PM2","expiry":"2030-12-31","batchId":"b9",
        "pack":{"name":"Box","size":100,"count":2,"cost":3200}}]}'''));
    expect(p.items.single.pack?.count, 2);
    expect(p.items.single.qty, 200);
    expect(p.toRecord()['items'], isA<List<Object?>>());
  });

  group('mergeRecord', () {
    test('a known field set to null is removed', () => expect(mergeRecord({'a': 1, 'b': 2}, {'b': null}), {'a': 1}));
    test('maps merge field by field', () => expect(mergeRecord({'m': {'x': 1, 'y': 2}}, {'m': {'x': 5}}), {'m': {'x': 5, 'y': 2}}));
    test('a list of a different length replaces the old one', () => expect(mergeRecord({'l': [{'a': 1, 'k': 9}, {'a': 2}]}, {'l': [{'a': 3}]}), {'l': [{'a': 3}]}));
  });
}

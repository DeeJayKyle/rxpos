// Ported from tests/unit-search.mjs.
import 'package:flutter_test/flutter_test.dart';
import 'package:rxpos/core/entities/product.dart';
import 'package:rxpos/core/rules/search.dart';

void main() {
  final p = [
    const Product(id: '1', name: 'Amoxyl 500mg caps', generic: 'Amoxicillin', form: 'Capsules', barcode: '6001001'),
    const Product(id: '2', name: 'Panadol Extra', generic: 'Paracetamol + Caffeine', form: 'Tablets'),
    const Product(id: '3', name: 'Ferrous Sulphate 200 mg', generic: 'Iron', form: 'Tablets'),
    const Product(id: '4', name: 'Calpol Paediatric', generic: 'Paracetamol', form: 'Syrup'),
    const Product(id: '5', name: 'Paracetamol 500mg', generic: 'Paracetamol', form: 'Tablets'),
  ];
  const stock = {'1': 10.0, '2': 0.0, '3': 5.0, '4': 3.0, '5': 50.0};
  String ids(String q) => searchProducts(p, q, stockOf: (x) => stock[x.id]!).map((x) => x.id).join(',');

  test('brand, generic and spelling variants', () {
    expect(ids('amoxyl'), '1');
    expect(ids('amoxicillin'), '1');
    expect(ids('amoxycillin'), '1');
    expect(ids('ferrous sulfate'), '3');
    expect(ids('calpol pediatric'), '4');
  });
  test('strength with or without a space', () {
    expect(ids('500 mg').split(','), contains('1'));
    expect(ids('500mg').split(','), contains('5'));
    expect(ids('200mg'), '3');
  });
  test('several words in any order, and barcodes', () {
    expect(ids('500mg amox'), '1');
    expect(ids('6001001'), '1');
  });
  test('ranking: name starting with the query first; in stock first within a rank', () {
    expect(ids('paracetamol').split(',').first, '5');
    expect(ids('panadol'), '2');
    final r = ids('paracetamol').split(',');
    expect(r.indexOf('4'), lessThan(r.indexOf('2')));
  });
  test('empty query returns the list', () => expect(searchProducts(p, '  ', stockOf: (_) => 0).length, p.length));
  test('fold', () => expect(fold('Café-Ämox  500 MG'), 'cafe amox 500mg'));
}

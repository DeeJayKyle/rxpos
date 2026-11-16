// Kits (1.10.0, lib/core/rules/kits.dart): a kit record is told apart, and a kit sale line's stock is its medicines'
// batches, as in the React app's src/kits.js stockParts.
import 'package:flutter_test/flutter_test.dart';
import 'package:rxpos/core/rules/kits.dart';

void main() {
  test('a product with a kit recipe is a kit', () {
    expect(isKitRecord({'id': 'k1', 'kit': {'items': []}}), isTrue);
    expect(isKitRecord({'id': 'p1', 'name': 'Paracetamol'}), isFalse);
  });

  test('a kit line moved each medicine from its batches', () {
    final parts = kitStockParts({
      'id': 'k1', 'qty': 2,
      'kit': {'components': [
        {'id': 'strip', 'qty': 2, 'alloc': [{'batchId': 'b1', 'qty': 1}, {'batchId': 'b2', 'qty': 1}]},
        {'id': 'lancet', 'qty': 4, 'alloc': []},
      ]},
    });
    expect(parts, [('strip', 'b1', 1.0), ('strip', 'b2', 1.0), ('lancet', null, 4.0)]);
  });

  test('a plain line is not a kit', () {
    expect(kitStockParts({'id': 'p1', 'qty': 3}), isNull);
  });

  test('a sale with a kit line is found', () {
    expect(saleHasKit({'items': [{'id': 'p1'}, {'id': 'k1', 'kit': {'components': []}}]}), isTrue);
    expect(saleHasKit({'items': [{'id': 'p1'}]}), isFalse);
    expect(rawSaleItems({}), isEmpty);
  });
}

// Stock from movements (src/store.jsx) and stock value, ported from tests/unit-stockvalue.mjs.
import 'package:flutter_test/flutter_test.dart';
import 'package:rxpos/core/entities/batch.dart';
import 'package:rxpos/core/entities/movement.dart';
import 'package:rxpos/core/entities/product.dart';
import 'package:rxpos/core/rules/fefo.dart';
import 'package:rxpos/core/rules/stock.dart';

void main() {
  final now = DateTime(2026, 11, 5);
  const future = '2099-01-01', past = '2000-01-01';

  group('stock value: physical stock × the medicine\'s current cost', () {
    const batches = {
      'p1': [BatchStock(id: 'b1', qty: 10, cost: 80, expiry: future), BatchStock(id: 'b2', qty: 5, cost: 95, expiry: future)],
      'p2': [BatchStock(id: 'b3', qty: 4, cost: 30, expiry: past), BatchStock(id: 'b4', qty: 0, cost: 30, expiry: future)],
    };
    List<BatchStock> of(String id) => batches[id] ?? const [];
    test('at the current cost, not each batch\'s', () => expect(batchValue(const Product(id: 'p1', cost: 100), of('p1'), now: now), (value: 1500.0, expired: 0.0)));
    test('a new cost changes the value at once', () => expect(batchValue(const Product(id: 'p1', cost: 120), of('p1'), now: now).value, 1800));
    test('no cost: each batch\'s own', () => expect(batchValue(const Product(id: 'p1'), of('p1'), now: now).value, 10 * 80 + 5 * 95));
    test('expired kept apart', () => expect(batchValue(const Product(id: 'p2', cost: 50), of('p2'), now: now), (value: 0.0, expired: 200.0)));
    test('a cost stored as text still counts', () => expect(batchValue(Product.fromRecord({'id': 'p1', 'cost': '100'}), of('p1'), now: now).value, 1500));
    test('the total adds every medicine', () => expect(stockValue([const Product(id: 'p1', cost: 100), const Product(id: 'p2', cost: 50)], of, now: now), (value: 1500.0, expired: 200.0)));
  });

  group('stock is the sum of movements', () {
    final moves = [
      const Movement(id: 'm1', productId: 'p', qty: 100, batchId: 'b-late', branchId: 'main'),
      const Movement(id: 'm2', productId: 'p', qty: 50, batchId: 'b-early', branchId: 'main'),
      const Movement(id: 'm3', productId: 'p', qty: -30, batchId: 'b-early', branchId: 'main'),
      const Movement(id: 'm4', productId: 'p', qty: 20, batchId: 'b-early', branchId: 'kampala'),
      const Movement(id: 'm5', productId: 'p', qty: 7, branchId: 'main'), // older stock without a batch
    ];
    final view = StockView(
      products: [Product.fromRecord({'id': 'p', 'cost': 10, 'batch': 'OLD', 'expiry': '2028-01-01'})],
      batches: const [Batch(id: 'b-late', productId: 'p', batch: 'L', expiry: '2029-06-30'), Batch(id: 'b-early', productId: 'p', batch: 'E', expiry: '2027-03-31')],
      index: StockIndex.of(moves),
    );
    test('per branch, and everywhere', () {
      expect(view.stockOf('p'), 127);
      expect(view.index.ofProduct('kampala', 'p'), 20);
      expect(view.index.everywhere('p'), 147);
    });
    test('batches earliest expiry first, with stock recorded without a batch', () {
      final b = view.batchesOf('p');
      expect(b.map((x) => (x.id, x.qty)), [('b-early', 20.0), ('lb-p', 7.0), ('b-late', 100.0)]);
      expect(b[1].legacy, isTrue);
      expect(b[1].batch, 'OLD');
    });
    test('two devices selling offline both deduct', () {
      final both = StockIndex.of([...moves, const Movement(id: 'dev-a', productId: 'p', qty: -5, batchId: 'b-late'), const Movement(id: 'dev-b', productId: 'p', qty: -5, batchId: 'b-late')]);
      expect(both.ofProduct('main', 'p'), 117);
    });
    test('low stock only counts medicines in stock', () {
      expect(isLowStock(const Product(id: 'x', reorder: 10), 0), isFalse);
      expect(isLowStock(const Product(id: 'x', reorder: 10), 4), isTrue);
      expect(isLowStock(const Product(id: 'x', reorder: 10), 11), isFalse);
    });
  });
}

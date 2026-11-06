// Ported from tests/unit-fefo.mjs.
import 'package:flutter_test/flutter_test.dart';
import 'package:rxpos/core/rules/fefo.dart';

void main() {
  const past = '2020-01-01', soon = '2030-01-01', later = '2031-01-01';
  final now = DateTime(2026, 11, 5);
  test('splits earliest-expiry first and keeps the requested total', () {
    final out = allocate([const BatchStock(id: 'a', qty: 5, expiry: soon, batch: 'A'), const BatchStock(id: 'b', qty: 5, expiry: later, batch: 'B')], 7, now: now);
    expect(out.map((o) => (o.batchId, o.qty)), [('a', 5.0), ('b', 2.0)]);
    expect(out.fold(0.0, (t, a) => t + a.qty), 7.0);
  });
  test('skips an expired batch, sells the fresh one', () {
    final out = allocate([const BatchStock(id: 'x', qty: 5, expiry: past), const BatchStock(id: 'y', qty: 5, expiry: later)], 3, now: now);
    expect(out.map((o) => o.batchId), ['y']);
  });
  test('uses an expired batch when allowed (a sale with a recorded reason)', () {
    expect(allocate([const BatchStock(id: 'x', qty: 5, expiry: past)], 3, allowExpired: true, now: now).single.batchId, 'x');
  });
  test('skips a zero-quantity batch', () {
    expect(allocate([const BatchStock(id: 'z', qty: 0, expiry: later), const BatchStock(id: 'y', qty: 4, expiry: later)], 2, now: now).single.batchId, 'y');
  });
  test('zero or negative requests take nothing', () {
    const batches = [BatchStock(id: 'good', qty: 2, expiry: later)];
    expect(allocate(batches, 0, now: now), isEmpty);
    expect(allocate(batches, -1, now: now), isEmpty);
    expect(allocate(const [], 0, now: now), isEmpty);
  });
  test('more than the sellable stock is refused, never booked to a batch it is not in', () {
    expect(() => allocate(const [BatchStock(id: 'good', qty: 2, expiry: later)], 3, now: now), throwsA(isA<NotEnoughStock>()));
    expect(() => allocate(const [], 1, now: now), throwsA(isA<NotEnoughStock>()));
    expect(() => allocate(const [BatchStock(id: 'good', qty: 2, expiry: later)], 2.001, now: now), throwsA(isA<NotEnoughStock>()));
  });
  test('expired stock does not count towards a normal sale', () {
    const batches = [BatchStock(id: 'exp', qty: 5, expiry: past), BatchStock(id: 'good', qty: 2, expiry: later)];
    expect(() => allocate(batches, 3, now: now), throwsA(predicate((e) => '$e' == "Only 2 sellable in stock: you can't sell 3.")));
  });
  test('decimal quantities (packs) are not refused by rounding', () {
    final out = allocate([const BatchStock(id: 'a', qty: 0.1, expiry: soon), const BatchStock(id: 'b', qty: 0.2, expiry: later)], 0.3, now: now);
    expect(out.fold(0.0, (t, a) => t + a.qty), closeTo(0.3, 1e-12));
    final tiny = allocate(const [BatchStock(id: 'good', qty: 2, expiry: later)], 2.0000000005, now: now);
    expect(tiny.single.qty, 2, reason: 'a difference below a billionth is rounding, not an oversale');
  });
  group('removalSplit', () {
    const bs = [BatchStock(id: 'old', batch: 'OLD', qty: 0, expiry: '2026-12-01'), BatchStock(id: 'a', batch: 'A', qty: 283, expiry: '2027-01-01'), BatchStock(id: 'b', batch: 'B', qty: 470, expiry: '2027-06-01')];
    test('the rest comes from the next batch', () => expect(removalSplit(bs, 'a', 500).map((x) => (x.batchId, x.qty)), [('a', 283.0), ('b', 217.0)]));
    test('an empty chosen batch is skipped', () => expect(removalSplit(bs, 'old', 8).map((x) => (x.batchId, x.qty)), [('a', 8.0)]));
    test('within the chosen batch', () => expect(removalSplit(bs, 'b', 10).map((x) => (x.batchId, x.qty)), [('b', 10.0)]));
    test('removing more than there is is refused', () => expect(() => removalSplit(bs, 'a', 754), throwsA(predicate((e) => '$e'.contains('Only 753 in stock')))));
    test('stock without a batch is removed without one', () {
      final r = removalSplit([const BatchStock(id: 'lb-p1', legacy: true, qty: 5)], 'lb-p1', 2);
      expect((r.single.batchId, r.single.qty), (null, 2.0));
    });
  });
}

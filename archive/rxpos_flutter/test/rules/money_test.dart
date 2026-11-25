// Ported from tests/unit-money.mjs: the Dart and JavaScript apps must agree to the shilling.
import 'package:flutter_test/flutter_test.dart';
import 'package:rxpos/core/rules/money.dart';

void main() {
  test('formatQty', () {
    expect(formatQty(7.833333333333333), '7.83');
    expect(formatQty(1200), '1200');
    expect(formatQty(5.0000000001), '5');
    expect(formatQty(2.5), '2.5');
    expect(formatQty(1, 'tablets'), '1 tablet');
    expect(formatQty(3, 'tablets'), '3 tablets');
    expect(formatQty(double.nan), '—');
  });
  test('round', () {
    expect(round(666.666 * 3), 2000);
    expect(round(1.005, 2), 1.01);
    expect(round(double.nan), 0);
    expect(round(2.5), 3, reason: 'half up, like Math.round');
  });
  test('lineTotal', () {
    expect(lineTotal(price: 1500, qty: 3), 4500);
    expect(lineTotal(price: 2000 / 3, qty: 3), 2000);
    expect(lineTotal(price: 1000, qty: 2, discount: 500), 1500);
    expect(lineTotal(price: 100, qty: 1, discount: 999), 0);
  });
  test('cartSubtotal sums per-line rounded nets', () {
    expect(cartSubtotal([(price: 2000 / 3, qty: 3, discount: 0), (price: 1000 / 7, qty: 7, discount: 0)]), 3000);
  });
  test('taxOf', () {
    expect(taxOf(10000, 18), 1800);
    expect(taxOf(10000, 0), 0);
    expect(taxOf(11800, 18, inclusive: true), 1800);
    expect(taxOf(333, 18), 60);
  });
  test('unitPrice', () {
    expect(unitPrice(2000, 3), 667);
    expect(unitPrice(1500, 1), 1500);
  });
  test('formatMoney uses the pharmacy\'s style', () {
    expect(formatMoney(1234567, currency: 'UGX', decimals: 0, locale: 'en-UG'), 'UGX 1,234,567');
    expect(formatMoney(1234.5, currency: 'USD', decimals: 2, locale: 'en-US'), 'USD 1,234.50');
    expect(formatMoney(1000, locale: 'en-UG'), '1,000');
  });
}

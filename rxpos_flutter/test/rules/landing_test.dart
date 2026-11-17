// Role-based landing (lib/core/rules/landing.dart), the same rule as the classic app's src/landing.js.
import 'package:flutter_test/flutter_test.dart';
import 'package:rxpos/core/rules/landing.dart';

void main() {
  bool Function(String) has(Set<String> p) => p.contains;
  test('administrators and managers land on the dashboard', () {
    expect(homeFor('admin', has({'pos.sell', 'reports'})), '/');
    expect(homeFor('manager', has({'pos.sell', 'reports'})), '/');
  });
  test('pharmacists, dispensers and cashiers land on the till', () {
    for (final r in ['pharmacist', 'dispenser', 'cashier']) {
      expect(homeFor(r, has({'pos.sell'})), '/pos');
    }
  });
  test('a custom role: the till when it sells without reports; never the till without pos.sell', () {
    expect(homeFor('front-desk', has({'pos.sell'})), '/pos');
    expect(homeFor('supervisor', has({'pos.sell', 'reports'})), '/');
    expect(homeFor('cashier', has({})), '/');
  });
}

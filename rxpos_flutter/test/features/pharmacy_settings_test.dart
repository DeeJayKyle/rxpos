// Pharmacy details overridden on one device (src/pharmacy-settings.js).
import 'package:flutter_test/flutter_test.dart';
import 'package:rxpos/core/rules/pharmacy_settings.dart';

void main() {
  test('an unchanged field is never pinned; the Owner value removes an override', () {
    final shared = {'name': 'Sample Pharmacy', 'currency': 'UGX', 'taxRate': 18};
    var over = editOverrides(shared, shared, {...shared, 'name': 'Kireka branch'}, {});
    expect(over, {'name': 'Kireka branch'});
    over = editOverrides(shared, {...shared, ...over}, {...shared, ...over, 'phone': '0772000111'}, over);
    expect(over, {'name': 'Kireka branch', 'phone': '0772000111'});
    over = editOverrides(shared, {...shared, ...over}, {...shared, ...over, 'name': 'Sample Pharmacy'}, over);
    expect(over, {'phone': '0772000111'});
  });

  test('validation', () {
    expect(validatePharmacyDefaults({'name': ' A ', 'currency': 'UGX', 'taxRate': '18'})['taxRate'], 18);
    expect(validatePharmacyDefaults({'name': ' A ', 'currency': 'UGX'})['name'], 'A');
    expect(() => validatePharmacyDefaults({'name': '', 'currency': 'UGX'}), throwsFormatException);
    expect(() => validatePharmacyDefaults({'name': 'A', 'currency': 'UGX', 'taxRate': 120}), throwsFormatException);
    expect(() => validatePharmacyDefaults({'name': 'A', 'currency': 'UGX', 'decimals': 1.5}), throwsFormatException);
    expect(() => validatePharmacyDefaults({'name': 'A', 'currency': 'UGX', 'priceRound': 20}), throwsFormatException);
  });

  test('stored overrides only keep pharmacy fields', () {
    expect(readOverrides('{"name":"X","smsRefill":"y"}'), {'name': 'X'});
    expect(readOverrides('not json'), isEmpty);
  });

  test('restore defaults keeps the pharmacy details', () {
    final r = restoredSettings({'name': 'Sample Pharmacy', 'tin': '100', 'smsRefill': 'mine', 'adminWhatsApp': '0772', 'autoPrint': true});
    expect(r['name'], 'Sample Pharmacy');
    expect(r['tin'], '100');
    expect(r['adminWhatsApp'], '0772');
    expect(r['autoPrint'], false);
    expect('${r['smsRefill']}', startsWith('Hello {name}'));
  });
}

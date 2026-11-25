// The live clinical safety check and the FEFO expiry traffic light: the same cases as the React app's
// tests/unit-clinical.mjs (src/clinical.js, src/fefo.js). Fictional customers and medicines.
import 'package:flutter_test/flutter_test.dart';
import 'package:rxpos/core/entities/product.dart';
import 'package:rxpos/core/rules/clinical.dart';
import 'package:rxpos/core/rules/fefo.dart';

const products = [
  Product(id: 'amx', name: 'MoxaForte 500mg Caps', generic: 'amoxicillin'),
  Product(id: 'cef', name: 'Cefuroxime 500mg Tablets', generic: 'cefuroxime'),
  Product(id: 'ibu', name: 'Ibuprofen 400mg Tablets', generic: 'ibuprofen'),
  Product(id: 'dic', name: 'Diclofenac 50mg Tablets', generic: 'diclofenac'),
  Product(id: 'war', name: 'Warfarin 5mg Tablets', generic: 'warfarin'),
  Product(id: 'met', name: 'Metronidazole 400mg Tablets', generic: 'metronidazole'),
  Product(id: 'cot', name: 'Septrin 480mg Tablets', generic: 'cotrimoxazole'),
  Product(id: 'pcm', name: 'Paracetamol 500mg Tablets', generic: 'paracetamol'),
  Product(id: 'pcm2', name: 'Panadol Extra', generic: 'paracetamol'),
  Product(id: 'cip', name: 'Ciprofloxacin 500mg', generic: 'ciprofloxacin'),
  Product(id: 'fer', name: 'Ferrous Sulphate 200mg', generic: 'ferrous sulphate'),
  Product(id: 'tra', name: 'Tramadol 50mg Caps', generic: 'tramadol'),
  Product(id: 'dia', name: 'Diazepam 5mg', generic: 'diazepam'),
];
SafetyResult check(List<String> ids, [String allergies = '']) => safetyCheck(ids, products, customerName: 'Test Client', allergies: allergies);

void main() {
  test('nothing to say: ok', () {
    final r = check(['pcm', 'amx']);
    expect(r.level, 'ok');
    expect(r.findings, isEmpty);
  });
  test('penicillin allergy: amoxicillin is major, a cephalosporin a caution', () {
    final r = check(['amx', 'cef'], 'Penicillin - rash');
    expect(r.level, 'major');
    expect(r.findings.where((f) => f.kind == 'allergy'), hasLength(2));
    expect(r.findings.first.ids, ['amx']);
    expect(r.findings.any((f) => f.level == 'caution' && f.ids.first == 'cef'), isTrue);
  });
  test('sulfa allergy catches Septrin; a named medicine is caught; "none" / NKDA are not allergies', () {
    expect(check(['cot'], 'sulfa drugs').level, 'major');
    expect(check(['met'], 'metronidazole (vomiting)').findings.first.text, contains('metronidazole'));
    expect(check(['amx'], 'None known').level, 'ok');
    expect(check(['amx'], 'NKDA').level, 'ok');
  });
  test('interactions: warfarin + NSAID, warfarin + metronidazole, opioid + benzodiazepine, ciprofloxacin + iron', () {
    expect(check(['war', 'ibu']).findings.first.text, contains('bleeding'));
    expect(check(['war', 'met']).findings.first.text, contains('INR'));
    expect(check(['tra', 'dia']).findings.any((f) => f.text.contains('breathing')), isTrue);
    final ci = check(['cip', 'fer']);
    expect(ci.level, 'caution');
    expect(ci.findings.first.text, contains('2 hours'));
  });
  test('duplicates: the same ingredient twice, two NSAIDs; one medicine on two lines is not a duplicate', () {
    expect(check(['pcm', 'pcm2']).findings.first.kind, 'duplicate');
    expect(check(['ibu', 'dic']).findings.any((f) => f.kind == 'duplicate' && f.text.contains('NSAIDs')), isTrue);
    expect(check(['pcm', 'pcm']).level, 'ok');
  });
  test('major findings come first', () => expect(check(['cip', 'fer', 'war', 'ibu']).findings.first.level, 'major'));
  test('expiry traffic light: >6 months ok, 3–6 soon, <3 short, past expired, none empty', () {
    final t = DateTime(2026, 11, 13);
    expect(expiryLevel('2027-08-01', today: t), 'ok');
    expect(expiryLevel('2027-04-01', today: t), 'soon');
    expect(expiryLevel('2027-01-10', today: t), 'short');
    expect(expiryLevel('2026-11-12', today: t), 'expired');
    expect(expiryLevel('', today: t), '');
  });
}

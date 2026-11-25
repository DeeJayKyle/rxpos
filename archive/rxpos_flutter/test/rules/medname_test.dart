// Consistent medicine names (lib/core/rules/medname.dart, as src/medname.js): suggestions only, approved by a person.
import 'package:flutter_test/flutter_test.dart';
import 'package:rxpos/core/rules/medname.dart';

void main() {
  test('house style: Title Case, strengths joined, form written out, short codes kept', () {
    expect(tidyName('PARACETAMOL 500MG TABLETS'), 'Paracetamol 500mg Tablets');
    expect(tidyName('Amoxil 500 mg caps'), 'Amoxil 500mg Capsules');
    expect(tidyName('ZINC 20 MG DT'), 'Zinc 20mg DT');
    expect(tidyName('ORS SACHETS'), 'ORS Sachets');
    expect(tidyName('Zyncet 10mg? tabs'), 'Zyncet 10mg Tablets');
    expect(tidyName('Panadol Extra'), 'Panadol Extra');
  });
  test('a suggestion keeps every number and the medicine', () {
    expect(safeRename('Amoxil 500 mg caps', 'Amoxil 500mg Capsules'), isTrue);
    expect(safeRename('Amoxil 500mg', 'Amoxil 250mg'), isFalse);
    expect(safeRename('Amoxil 500mg', 'Paracetamol 500mg'), isFalse);
    expect(safeRename('PCM 500MG TABS', 'PCM 500mg Tablets'), isTrue);
  });
  test('only names that would change are suggested', () {
    expect(nameSuggestions([(id: 'a', name: 'PCM 500MG TABS'), (id: 'b', name: 'Panadol Extra')]).map((x) => x.to), ['PCM 500mg Tablets']);
  });
}

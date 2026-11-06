// Drug classes worked out from the generic name; the medicine's own category wins; grouping for lists and shelves.
import 'package:flutter_test/flutter_test.dart';
import 'package:rxpos/core/entities/product.dart';
import 'package:rxpos/core/rules/drug_class.dart';

Product med(String name, String generic, {String category = '', String form = '', String shelf = ''}) =>
    Product.fromRecord({'id': name, 'name': name, 'generic': generic, 'category': category, 'form': form, 'shelf': shelf});

void main() {
  test('classes from the generic name (fictional products named like common ones)', () {
    final cases = {
      med('Duramox syrup 125MG', 'Amoxicillin'): ('Penicillins', 'Anti-infectives'),
      med('Acem-500 tabs', 'Clarithromycin tabs 500mg'): ('Macrolides', 'Anti-infectives'),
      med('Acewel 100mg', 'Aceclofenac 100mg'): ('NSAIDs', 'Pain, fever & inflammation'),
      med('Aciclovir Cream 10g', 'Aciclovir Creams and Ointments'): ('Antivirals', 'Antivirals & HIV'),
      med('Acnesol cream', 'Tretinoin 0.05%'): ('Skin preparations', 'Skin'),
      med('Action Tabs 2s', 'Asa/Panadol/caffeine'): ('Analgesics & antipyretics', 'Pain, fever & inflammation'),
      med('Albendazole 400mg tabs', ''): ('Anthelmintics', 'Antiparasitics & deworming'),
      med('Adhesive Plaster 10cm', 'Zinc oxide adhesive plaster'): ('Medical supplies', 'Medical supplies'),
      med('Zinc oxide cream', ''): ('Skin preparations', 'Skin'),
      med('Agolac 100ML', 'Lactulose Solution'): ('Laxatives', 'Gastrointestinal'),
      med('Coartem', 'Artemether/Lumefantrine'): ('Antimalarials', 'Antimalarials'),
      med('Ceftriaxone 1g', ''): ('Cephalosporins', 'Anti-infectives'),
      med('Ferrous sulphate', ''): ('Iron & folic acid', 'Vitamins, minerals & nutrition'),
      med('ORS Sachet', 'Oral Rehydration Salts'): ('Oral rehydration & zinc', 'Fluids & electrolytes'),
      med('Activated charcoal', 'Activated charcoal'): (unclassified, otherArea),
    };
    for (final e in cases.entries) {
      final c = drugClassOf(e.key);
      expect((c.cls, c.area), e.value, reason: e.key.name);
    }
  });

  test('"antibiotic" inside a word is not mistaken for ear drops; short stems match at the start of a word', () {
    expect(classify(' doxycycline antibiotic '), (cls: 'Tetracyclines', area: 'Anti-infectives'));
    expect(classify(' sorsby '), isNull);
  });

  test("the medicine's own category wins and is placed in an area by its words", () {
    expect(drugClassOf(med('Amoxicillin 500mg', 'Amoxicillin', category: 'Antibiotic')), (cls: 'Antibiotic', area: 'Anti-infectives'));
    expect(drugClassOf(med('Cough Syrup', 'Dextromethorphan', category: 'Antitussive')), (cls: 'Antitussive', area: 'Respiratory & allergy'));
    expect(drugClassOf(med('House blend', 'Paracetamol', category: 'Our specials')), (cls: 'Our specials', area: 'Pain, fever & inflammation'));
  });

  test('grouped by area in the order of the areas, by form and shelf with the blanks last, by name in each group', () {
    final list = [
      med('Zinc Tabs', 'Zinc sulphate', form: 'Tablets', shelf: 'B2'),
      med('Brufen', 'Ibuprofen', form: 'Tablets'),
      med('Amoxyl', 'Amoxicillin', form: 'Capsules', shelf: 'A1'),
      med('Panadol', 'Paracetamol', form: 'Tablets', shelf: 'A1'),
    ];
    expect([for (final (g, ps) in groupMedicines(list, MedicineOrder.area)) '$g: ${ps.map((p) => p.name).join(', ')}'],
        ['Anti-infectives: Amoxyl', 'Pain, fever & inflammation: Brufen, Panadol', 'Fluids & electrolytes: Zinc Tabs']);
    expect([for (final (g, ps) in groupMedicines(list, MedicineOrder.shelf)) '$g ${ps.length}'], ['A1 2', 'B2 1', 'No shelf 1']);
    expect(groupMedicines(list, MedicineOrder.form).map((g) => g.$1), ['Capsules', 'Tablets']);
    expect(groupMedicines(list, MedicineOrder.name).single.$2.map((p) => p.name), ['Amoxyl', 'Brufen', 'Panadol', 'Zinc Tabs']);
  });
}

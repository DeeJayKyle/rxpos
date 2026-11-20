// Invoice lines matched to medicines and the same item under different names (lib/core/rules/invoice_match.dart):
// the same cases as tests/unit-invoice-match.mjs and tests/unit-medmerge.mjs.
import 'package:flutter_test/flutter_test.dart';
import 'package:rxpos/core/entities/product.dart';
import 'package:rxpos/core/rules/invoice_match.dart';

Product med(String id, String name, {String generic = '', String form = '', String barcode = '', List<String> aliases = const []}) =>
    Product.fromRecord({'id': id, 'name': name, 'generic': generic, 'form': form, 'barcode': barcode, if (aliases.isNotEmpty) 'aliases': aliases});

void main() {
  final p = [
    med('amx500', 'Amoxicillin 500mg Capsules', generic: 'Amoxicillin'),
    med('amx250', 'Amoxicillin 250mg Capsules', generic: 'Amoxicillin'),
    med('pcm', 'Paracetamol 500mg Tablets', generic: 'Paracetamol'),
    med('mtz', 'Metronidazole 400mg Tablets', generic: 'Metronidazole'),
    med('al', 'Lumartem 80/480 Tablets', generic: 'Artemether Lumefantrine'),
    med('ctx', 'Cotrimoxazole 960mg Tablets'),
  ];
  String? best(String n) {
    final r = rankProducts(n, p);
    return r.isNotEmpty && r.first.sure ? r.first.p.id : null;
  }

  test('words and strengths', () {
    expect(nameWords('PCM 500mg tabs 1000s'), ['paracetamol']);
    expect(strengthsOf('Amoxicillin 0.5g'), ['500mg']);
    expect(strengthsOf('AL 80/480'), ['80/480']);
  });
  test('printed, handwritten and abbreviated names match; the strength decides', () {
    expect([best('Amoxicilin 500mg caps'), best('Paracetamoi 500 mg'), best('Metronidazoie 400mg'), best('PCM 500mg x1000'), best('AMOXYCILLIN 0.5g CAPS'), best('Cotrim 960mg'), best('Amoxicillin 250mg caps')],
        ['amx500', 'pcm', 'mtz', 'pcm', 'amx500', 'ctx', 'amx250']);
    expect(best('Artemether Lumefantrine 80/480 tabs'), 'al');
  });
  test('a different strength or two equal candidates are only suggested', () {
    expect(best('Amoxicillin 1g'), isNull);
    expect(best('Amoxicillin caps'), isNull);
    expect(best('Salbutamol inhaler'), isNull);
  });
  test('learned names and aliases', () {
    final learned = learnedNames([{'items': [{'productId': 'ctx', 'invoiceName': 'Septrin DS tabs 100s'}]}]);
    expect(rankProducts('SEPTRIN DS Tabs 100s', p, learned: learned).first.p.id, 'ctx');
    expect(rankProducts('Moxiclav-X 500mg', [med('k', 'Amoxil 500mg Capsules', aliases: ['Moxiclav-X 500mg']), med('z', 'Zinc 20mg')]).first.p.id, 'k');
  });
  test('the same item under different names, never across strengths or forms', () {
    final q = [
      med('a1', 'Amoxil 500mg Caps', form: 'Capsules'), med('a2', 'AMOXIL 500 MG CAPSULES', form: 'Capsules', barcode: '600100'), med('a3', 'Amoxil 250mg Caps', form: 'Capsules'),
      med('a4', 'Amoxil 500mg/5ml Syrup', form: 'Syrups'), med('p1', 'Paracetamol 500mg', form: 'Tablets'), med('p2', 'Paracetamoll 500mg tabs', form: 'Tablets'),
      med('p3', 'Paracetamol 500mg Suppository', form: 'Others'),
    ];
    final g = mergeGroups(q, (x) => x.id == 'a2' ? 30 : 0);
    expect(g.map((x) => (x.items.map((i) => i.id).toList()..sort()).join()), ['a1a2', 'p1p2']);
    expect(g.first.keep, 'a2');
    final r = mergedRecord({'id': 'k', 'name': 'Amoxil 500mg Capsules'}, [{'id': 'o', 'name': 'AMOXIL 500 MG CAPS', 'barcode': '600100', 'generic': 'Amoxicillin'}]);
    expect([r['aliases'], r['barcode'], r['generic']], [['AMOXIL 500 MG CAPS'], '600100', 'Amoxicillin']);
  });
}
